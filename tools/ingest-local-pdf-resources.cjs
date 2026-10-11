const childProcess = require('child_process')
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

const projectRoot = path.resolve(__dirname, '..')
const frontendNodeModules = path.join(projectRoot, 'frontend', 'node_modules')
const { Pool } = require(path.join(frontendNodeModules, 'pg'))

function loadDotEnv(filePath) {
  if (!fs.existsSync(filePath)) return
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue
    const index = trimmed.indexOf('=')
    const key = trimmed.slice(0, index).trim()
    const value = trimmed.slice(index + 1).trim().replace(/^["']|["']$/g, '')
    if (!process.env[key]) process.env[key] = value
  }
}

function parseArgs() {
  const bundledPython = path.join(
    process.env.USERPROFILE || '',
    '.cache',
    'codex-runtimes',
    'codex-primary-runtime',
    'dependencies',
    'python',
    'python.exe',
  )
  const args = process.argv.slice(2)
  const options = {
    dir: process.env.LOCAL_RESOURCE_DIR || path.join(projectRoot, 'ziyuan'),
    includeMooc: true,
    python: process.env.A3_PYTHON || process.env.PYTHON || (fs.existsSync(bundledPython) ? bundledPython : 'python'),
  }
  for (let index = 0; index < args.length; index += 1) {
    const item = args[index]
    if (item === '--dir') options.dir = args[++index]
    if (item === '--python') options.python = args[++index]
    if (item === '--no-mooc') options.includeMooc = false
  }
  return options
}

function toProjectRelative(filePath) {
  return path.relative(projectRoot, filePath).replace(/\\/g, '/')
}

function fileSha256(filePath) {
  const hash = crypto.createHash('sha256')
  const buffer = Buffer.alloc(1024 * 1024)
  const fd = fs.openSync(filePath, 'r')
  try {
    let bytesRead = 0
    do {
      bytesRead = fs.readSync(fd, buffer, 0, buffer.length, null)
      if (bytesRead > 0) hash.update(buffer.subarray(0, bytesRead))
    } while (bytesRead > 0)
  } finally {
    fs.closeSync(fd)
  }
  return hash.digest('hex')
}

function textSha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex')
}

function extractPdf(filePath, python) {
  const extractor = path.join(projectRoot, 'tools', 'extract-pdf-metadata.py')
  const result = childProcess.spawnSync(python, [extractor, filePath], {
    cwd: projectRoot,
    encoding: 'utf8',
    env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
    maxBuffer: 256 * 1024 * 1024,
  })
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(`PDF extractor failed for ${path.basename(filePath)}: ${result.stderr || result.stdout}`)
  }
  return JSON.parse(result.stdout)
}

async function upsertSource(client, source) {
  const result = await client.query(
    `insert into resource_sources
       (source_key, source_name, source_type, owner_label, base_uri, license, trust_level, status, metadata)
     values ($1, $2, $3, $4, $5, $6, $7, 'active', $8::jsonb)
     on conflict (source_key) do update set
       source_name = excluded.source_name,
       source_type = excluded.source_type,
       owner_label = excluded.owner_label,
       base_uri = excluded.base_uri,
       license = excluded.license,
       trust_level = excluded.trust_level,
       status = 'active',
       metadata = resource_sources.metadata || excluded.metadata,
       updated_at = now()
     returning id`,
    [
      source.key,
      source.name,
      source.type,
      source.owner,
      source.baseUri,
      source.license,
      source.trustLevel,
      JSON.stringify(source.metadata || {}),
    ],
  )
  return result.rows[0].id
}

async function createBatch(client, sourceId, courseId, batchName, metadata) {
  const result = await client.query(
    `insert into resource_ingestion_batches
       (source_id, course_id, batch_name, status, imported_count, failed_count, started_at, metadata)
     values ($1, $2, $3, 'running', 0, 0, now(), $4::jsonb)
     returning id`,
    [sourceId, courseId, batchName, JSON.stringify(metadata || {})],
  )
  return result.rows[0].id
}

async function finishBatch(client, batchId, importedCount, failedCount, failures) {
  await client.query(
    `update resource_ingestion_batches
     set status = $2,
         imported_count = $3,
         failed_count = $4,
         finished_at = now(),
         updated_at = now(),
         metadata = metadata || $5::jsonb
     where id = $1`,
    [batchId, failedCount ? 'failed' : 'completed', importedCount, failedCount, JSON.stringify({ failures })],
  )
}

function inferResource(filePath, metadata, course) {
  const fileName = path.basename(filePath)
  const title = fileName.replace(/\.pdf$/i, '').trim()
  const isExercise = /习题|全解|练习|题/.test(fileName)
  const textLayer = Boolean(metadata.text_layer)
  return {
    resourceCode: `LOCAL-PDF-${metadata.sha256.slice(0, 12).toUpperCase()}`,
    title,
    kind: isExercise ? '练习' : '文档',
    difficulty: metadata.ocr_required ? '扫描版待 OCR' : '可检索文本',
    durationMinutes: Math.max(8, Math.min(45, Math.round(metadata.page_count / 16))),
    color: isExercise ? 'green' : 'blue',
    actionLabel: textLayer ? '阅读' : '打开PDF',
    subject: course.subject,
    grade: course.grade,
  }
}

async function upsertPdfResource(client, context) {
  const { batchId, course, demoStudentId, filePath, localDir, metadata, sourceId } = context
  const inferred = inferResource(filePath, metadata, course)
  const relativePath = toProjectRelative(filePath)
  const resourceMetadata = {
    sourceCountry: 'CN',
    allowedRegion: 'China',
    storage: 'local-file',
    fileName: path.basename(filePath),
    relativePath,
    originalDirectory: localDir,
    fileSizeBytes: metadata.file_size_bytes,
    pageCount: metadata.page_count,
    sha256: metadata.sha256,
    textLayer: metadata.text_layer,
    ocrRequired: metadata.ocr_required,
    textChars: metadata.text_chars,
    nonEmptyPages: metadata.non_empty_pages,
    stars: metadata.ocr_required ? 2 : 3,
    importedBy: 'tools/ingest-local-pdf-resources.cjs',
  }
  const resource = await client.query(
    `insert into learning_resources
       (source_id, resource_code, title, kind, subject, grade, difficulty, duration_minutes, color, action_label, status, metadata, published_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'active', $11::jsonb, now())
     on conflict (source_id, resource_code) do update set
       title = excluded.title,
       kind = excluded.kind,
       subject = excluded.subject,
       grade = excluded.grade,
       difficulty = excluded.difficulty,
       duration_minutes = excluded.duration_minutes,
       color = excluded.color,
       action_label = excluded.action_label,
       status = 'active',
       metadata = learning_resources.metadata || excluded.metadata,
       published_at = coalesce(learning_resources.published_at, excluded.published_at),
       updated_at = now()
     returning id`,
    [
      sourceId,
      inferred.resourceCode,
      inferred.title,
      inferred.kind,
      inferred.subject,
      inferred.grade,
      inferred.difficulty,
      inferred.durationMinutes,
      inferred.color,
      inferred.actionLabel,
      JSON.stringify(resourceMetadata),
    ],
  )

  const resourceId = resource.rows[0].id
  const rawMetadata = {
    ...metadata,
    chunks: undefined,
    extraction_errors: metadata.extraction_errors || [],
    ocr_required: metadata.ocr_required,
    text_layer: metadata.text_layer,
  }
  const version = await client.query(
    `insert into learning_resource_versions
       (resource_id, source_id, ingestion_batch_id, version_no, content_uri, content_type, content_checksum, content_length, language, parse_status, raw_metadata)
     values ($1, $2, $3, 1, $4, 'application/pdf', $5, $6, 'zh-CN', $7, $8::jsonb)
     on conflict (resource_id, version_no) do update set
       source_id = excluded.source_id,
       ingestion_batch_id = excluded.ingestion_batch_id,
       content_uri = excluded.content_uri,
       content_type = excluded.content_type,
       content_checksum = excluded.content_checksum,
       content_length = excluded.content_length,
       language = excluded.language,
       parse_status = excluded.parse_status,
       raw_metadata = excluded.raw_metadata,
       created_at = now()
     returning id`,
    [
      resourceId,
      sourceId,
      batchId,
      relativePath,
      metadata.sha256,
      metadata.file_size_bytes,
      metadata.text_layer ? 'parsed' : 'pending',
      JSON.stringify(rawMetadata),
    ],
  )

  const versionId = version.rows[0].id
  await client.query('delete from resource_chunks where version_id = $1', [versionId])
  for (let index = 0; index < (metadata.chunks || []).length; index += 1) {
    const chunk = metadata.chunks[index]
    await client.query(
      `insert into resource_chunks
         (resource_id, version_id, chunk_no, heading, body, token_count, page_ref, metadata)
       values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
      [
        resourceId,
        versionId,
        index + 1,
        chunk.heading || `PDF chunk ${index + 1}`,
        chunk.body,
        chunk.token_count || Math.max(1, Math.round(String(chunk.body || '').length / 2)),
        chunk.page_ref || '',
        JSON.stringify(chunk.metadata || {}),
      ],
    )
  }

  const summary = metadata.text_layer
    ? `已从本地 PDF 抽取 ${metadata.chunks.length} 个文本切片，可用于站内检索、资源推荐和后续辅导上下文。`
    : '该本地 PDF 是扫描图像版，已完成资源登记和原文打开；正文检索需要后续 OCR。'
  await client.query(
    `insert into resource_distillations
       (resource_id, course_id, version_id, distillation_type, status, content, confidence, model_name, prompt_version)
     values ($1, $2, $3, 'summary', 'ready', $4::jsonb, $5, 'local-import-rule', 'pdf-v1')
     on conflict (resource_id, course_id, distillation_type) do update set
       version_id = excluded.version_id,
       status = excluded.status,
       content = excluded.content,
       confidence = excluded.confidence,
       model_name = excluded.model_name,
       prompt_version = excluded.prompt_version,
       updated_at = now()`,
    [
      resourceId,
      course.id,
      versionId,
      JSON.stringify({
        summary,
        sourceCountry: 'CN',
        storage: 'local-file',
        relativePath,
        pageCount: metadata.page_count,
        textLayer: metadata.text_layer,
        ocrRequired: metadata.ocr_required,
        chunkCount: metadata.chunks.length,
      }),
      metadata.text_layer ? 0.82 : 0.62,
    ],
  )

  await client.query(
    `insert into student_resource_recommendations
       (student_id, resource_id, reason, bucket, match_score)
     values ($1, $2, $3, 'new', $4)
     on conflict (student_id, resource_id, bucket) do update set
       reason = excluded.reason,
       match_score = excluded.match_score,
       created_at = now()`,
    [
      demoStudentId,
      resourceId,
      metadata.text_layer ? '本地 PDF 已完成文本抽取，可直接用于检索与复习。' : '本地扫描版 PDF 已登记，可先打开原文；OCR 后会进入检索与辅导上下文。',
      metadata.text_layer ? 86 : 72,
    ],
  )

  return { resourceId, title: inferred.title, chunks: metadata.chunks.length, ocrRequired: metadata.ocr_required }
}

async function upsertMoocLink(client, sourceId, batchId, course, demoStudentId) {
  const externalUrl = 'https://www.icourse163.org/search.htm?search=%E9%AB%98%E7%AD%89%E6%95%B0%E5%AD%A6'
  const metadata = {
    sourceCountry: 'CN',
    allowedRegion: 'China',
    storage: 'external-link',
    externalUrl,
    platform: '中国大学MOOC',
    linkOnly: true,
    stars: 3,
  }
  const resource = await client.query(
    `insert into learning_resources
       (source_id, resource_code, title, kind, subject, grade, difficulty, duration_minutes, color, action_label, status, metadata, published_at)
     values ($1, 'CN-MOOC-GAOSHU-SEARCH', '中国大学MOOC 高等数学视频检索', '视频', $2, $3, '公开视频入口', 12, 'sky', '跳转观看', 'active', $4::jsonb, now())
     on conflict (source_id, resource_code) do update set
       title = excluded.title,
       kind = excluded.kind,
       subject = excluded.subject,
       grade = excluded.grade,
       difficulty = excluded.difficulty,
       duration_minutes = excluded.duration_minutes,
       color = excluded.color,
       action_label = excluded.action_label,
       status = 'active',
       metadata = learning_resources.metadata || excluded.metadata,
       updated_at = now()
     returning id`,
    [sourceId, course.subject, course.grade, JSON.stringify(metadata)],
  )
  const resourceId = resource.rows[0].id
  await client.query(
    `insert into learning_resource_versions
       (resource_id, source_id, ingestion_batch_id, version_no, content_uri, content_type, content_checksum, content_length, language, parse_status, raw_metadata)
     values ($1, $2, $3, 1, $4, 'text/uri-list', $5, length($4), 'zh-CN', 'parsed', $6::jsonb)
     on conflict (resource_id, version_no) do update set
       source_id = excluded.source_id,
       ingestion_batch_id = excluded.ingestion_batch_id,
       content_uri = excluded.content_uri,
       content_type = excluded.content_type,
       content_checksum = excluded.content_checksum,
       content_length = excluded.content_length,
       parse_status = excluded.parse_status,
       raw_metadata = excluded.raw_metadata,
       created_at = now()`,
    [resourceId, sourceId, batchId, externalUrl, textSha256(externalUrl), JSON.stringify(metadata)],
  )
  await client.query(
    `insert into student_resource_recommendations
       (student_id, resource_id, reason, bucket, match_score)
     values ($1, $2, '中国平台公开视频入口，仅做链接跳转，不转存视频。', 'popular', 78)
     on conflict (student_id, resource_id, bucket) do update set
       reason = excluded.reason,
       match_score = excluded.match_score,
       created_at = now()`,
    [demoStudentId, resourceId],
  )
  return { resourceId, title: '中国大学MOOC 高等数学视频检索', chunks: 0, ocrRequired: false }
}

async function main() {
  loadDotEnv(path.join(projectRoot, 'frontend', '.env'))
  const options = parseArgs()
  const localDir = path.resolve(options.dir)
  const demoCourseId = process.env.DEMO_COURSE_ID || '00000000-0000-0000-0000-000000000301'
  const demoStudentId = process.env.DEMO_STUDENT_ID || '00000000-0000-0000-0000-000000000101'

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    host: process.env.PGHOST,
    port: process.env.PGPORT ? Number(process.env.PGPORT) : undefined,
    database: process.env.PGDATABASE || 'a3_learning',
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD,
  })

  const client = await pool.connect()
  const imported = []
  const failures = []
  let batchId = null
  try {
    await client.query('begin')
    const courseResult = await client.query('select id, subject, grade from courses where id = $1', [demoCourseId])
    if (!courseResult.rows[0]) throw new Error(`course not found: ${demoCourseId}`)
    const course = courseResult.rows[0]

    const localSourceId = await upsertSource(client, {
      key: 'local_ziyuan_pdf',
      name: 'A3 本地 PDF 资源目录',
      type: 'manual',
      owner: 'local workspace',
      baseUri: localDir,
      license: 'user-provided-local',
      trustLevel: 4,
      metadata: { sourceCountry: 'CN', allowedRegion: 'China', rule: 'keep original files in D:/A3/ziyuan' },
    })
    batchId = await createBatch(client, localSourceId, demoCourseId, '本地 PDF 资源扫描导入', {
      localDir,
      includeMooc: options.includeMooc,
    })

    if (fs.existsSync(localDir)) {
      const pdfFiles = fs.readdirSync(localDir)
        .filter((file) => file.toLowerCase().endsWith('.pdf'))
        .map((file) => path.join(localDir, file))
        .sort((left, right) => left.localeCompare(right, 'zh-CN'))

      for (const filePath of pdfFiles) {
        try {
          const metadata = extractPdf(filePath, options.python)
          imported.push(await upsertPdfResource(client, { batchId, course, demoStudentId, filePath, localDir, metadata, sourceId: localSourceId }))
        } catch (error) {
          failures.push({ file: path.basename(filePath), error: error.message })
        }
      }
    }

    if (options.includeMooc) {
      const moocSourceId = await upsertSource(client, {
        key: 'china_mooc_links',
        name: '中国大学MOOC 链接资源',
        type: 'open_course',
        owner: '中国大学MOOC',
        baseUri: 'https://www.icourse163.org/',
        license: 'link-only',
        trustLevel: 3,
        metadata: { sourceCountry: 'CN', allowedRegion: 'China', storage: 'external-link' },
      })
      imported.push(await upsertMoocLink(client, moocSourceId, batchId, course, demoStudentId))
    }

    await finishBatch(client, batchId, imported.length, failures.length, failures)
    await client.query('commit')
    console.log(JSON.stringify({ ok: failures.length === 0, imported, failures }, null, 2))
  } catch (error) {
    await client.query('rollback')
    console.error(error)
    process.exitCode = 1
  } finally {
    client.release()
    await pool.end()
  }
}

main()
