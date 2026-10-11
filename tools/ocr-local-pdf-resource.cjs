const childProcess = require('child_process')
const fs = require('fs')
const path = require('path')

const projectRoot = path.resolve(__dirname, '..')
const frontendNodeModules = path.join(projectRoot, 'frontend', 'node_modules')
const { Pool } = require(path.join(frontendNodeModules, 'pg'))
const { createWorker, PSM } = require(path.join(frontendNodeModules, 'tesseract.js'))

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
  const args = process.argv.slice(2)
  const options = {
    allLocal: false,
    cacheDir: path.join(projectRoot, 'artifacts', 'ocr-cache'),
    dpi: 170,
    keepImages: false,
    lang: 'chi_sim',
    limit: 1,
    maxPages: 2,
    pageSpec: '',
    tempDir: path.join(projectRoot, 'artifacts', 'ocr-pages'),
  }

  for (let index = 0; index < args.length; index += 1) {
    const item = args[index]
    if (item === '--all-local') options.allLocal = true
    else if (item === '--cache-dir') options.cacheDir = path.resolve(args[++index])
    else if (item === '--dpi') options.dpi = Number(args[++index])
    else if (item === '--keep-images') options.keepImages = true
    else if (item === '--lang') options.lang = args[++index]
    else if (item === '--limit') options.limit = Number(args[++index])
    else if (item === '--max-pages') options.maxPages = Number(args[++index])
    else if (item === '--pages') options.pageSpec = args[++index]
    else if (item === '--resource-code') options.resourceCode = args[++index]
    else if (item === '--resource-id') options.resourceId = args[++index]
    else if (item === '--title') options.title = args[++index]
    else if (item === '--temp-dir') options.tempDir = path.resolve(args[++index])
  }

  if (!options.allLocal && !options.resourceId && !options.resourceCode && !options.title) {
    options.allLocal = true
  }
  options.limit = Number.isFinite(options.limit) && options.limit > 0 ? Math.floor(options.limit) : 1
  options.maxPages = Number.isFinite(options.maxPages) && options.maxPages > 0 ? Math.floor(options.maxPages) : 2
  options.dpi = Number.isFinite(options.dpi) && options.dpi >= 120 ? Math.floor(options.dpi) : 170
  return options
}

function run(command, args, options = {}) {
  const result = childProcess.spawnSync(command, args, {
    cwd: projectRoot,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    windowsHide: true,
    ...options,
  })
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(`${command} failed: ${result.stderr || result.stdout}`)
  }
  return result
}

function findPdftoppm() {
  const candidates = [
    process.env.PDFTOPPM,
    'D:\\texlive\\2025\\bin\\windows\\pdftoppm.exe',
    path.join(process.env.USERPROFILE || '', '.cache', 'codex-runtimes', 'codex-primary-runtime', 'dependencies', 'bin', 'pdftoppm.exe'),
    path.join(process.env.USERPROFILE || '', '.cache', 'codex-runtimes', 'codex-primary-runtime', 'dependencies', 'bin', 'pdftoppm.cmd'),
  ].filter(Boolean)

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate
  }

  const where = childProcess.spawnSync('where', ['pdftoppm'], { encoding: 'utf8', windowsHide: true })
  if (where.status === 0) {
    const first = where.stdout.split(/\r?\n/).find(Boolean)
    if (first) return first.trim()
  }
  throw new Error('pdftoppm not found. Install Poppler or set PDFTOPPM.')
}

function parsePages(pageSpec, pageCount, maxPages) {
  const cap = Math.max(1, Number(pageCount || 1))
  if (!pageSpec) {
    return Array.from({ length: Math.min(cap, maxPages) }, (_, index) => index + 1)
  }

  const pages = new Set()
  for (const segment of pageSpec.split(',')) {
    const part = segment.trim()
    if (!part) continue
    const range = part.match(/^(\d+)-(\d+)$/)
    if (range) {
      const start = Math.max(1, Number(range[1]))
      const end = Math.min(cap, Number(range[2]))
      for (let page = start; page <= end; page += 1) pages.add(page)
      continue
    }
    const page = Math.min(cap, Math.max(1, Number(part)))
    if (Number.isFinite(page)) pages.add(page)
  }
  return [...pages].sort((left, right) => left - right).slice(0, maxPages)
}

function cleanText(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .replace(/\u0000/g, '')
    .trim()
}

function tokenCount(value) {
  return Math.max(1, Math.round(String(value || '').length / 2))
}

function safeName(value) {
  return String(value || 'resource')
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, '-')
    .slice(0, 80)
}

function resolveLocalPdf(resource) {
  const metadata = resource.metadata || {}
  const contentUri = metadata.relativePath || resource.content_uri
  if (!contentUri) throw new Error(`resource has no content_uri: ${resource.title}`)
  const pdfPath = path.resolve(projectRoot, contentUri)
  const localRoot = path.resolve(process.env.LOCAL_RESOURCE_DIR || path.join(projectRoot, 'ziyuan'))
  const rootWithSep = `${localRoot}${path.sep}`.toLowerCase()
  if (pdfPath.toLowerCase() !== localRoot.toLowerCase() && !pdfPath.toLowerCase().startsWith(rootWithSep)) {
    throw new Error(`refusing to OCR outside LOCAL_RESOURCE_DIR: ${pdfPath}`)
  }
  if (!fs.existsSync(pdfPath)) throw new Error(`PDF not found: ${pdfPath}`)
  return pdfPath
}

function renderPage(pdftoppm, pdfPath, outputDir, page, dpi) {
  fs.mkdirSync(outputDir, { recursive: true })
  const prefix = path.join(outputDir, `page-${String(page).padStart(4, '0')}`)
  const imagePath = `${prefix}.png`
  if (fs.existsSync(imagePath)) fs.unlinkSync(imagePath)
  run(pdftoppm, ['-f', String(page), '-l', String(page), '-singlefile', '-r', String(dpi), '-png', pdfPath, prefix])
  if (!fs.existsSync(imagePath)) throw new Error(`pdftoppm did not create ${imagePath}`)
  return imagePath
}

async function selectResources(client, options) {
  const params = []
  const filters = [`r.status = 'active'`, `coalesce(r.metadata->>'storage', '') = 'local-file'`]
  if (options.resourceId) {
    params.push(options.resourceId)
    filters.push(`r.id = $${params.length}`)
  }
  if (options.resourceCode) {
    params.push(options.resourceCode)
    filters.push(`r.resource_code = $${params.length}`)
  }
  if (options.title) {
    params.push(`%${options.title}%`)
    filters.push(`r.title ilike $${params.length}`)
  }

  params.push(options.limit)
  const result = await client.query(
    `select r.id, r.resource_code, r.title, r.kind, r.subject, r.grade, r.difficulty, r.duration_minutes,
            r.color, r.action_label, r.metadata, v.id as version_id, v.content_uri, v.raw_metadata,
            coalesce((r.metadata->>'pageCount')::int, (v.raw_metadata->>'page_count')::int, 1) as page_count
     from learning_resources r
     join lateral (
       select id, content_uri, raw_metadata
       from learning_resource_versions
       where resource_id = r.id
       order by version_no desc, created_at desc
       limit 1
     ) v on true
     where ${filters.join(' and ')}
     order by
       case when coalesce(r.metadata->>'ocrStatus', '') in ('partial', 'completed') then 1 else 0 end,
       r.created_at,
       r.id
     limit $${params.length}`,
    params,
  )
  return result.rows
}

async function createJob(client, resource, pages, options) {
  const result = await client.query(
    `insert into resource_ocr_jobs
       (resource_id, version_id, engine, status, page_start, page_end, total_pages, metadata, started_at)
     values ($1, $2, 'tesseract.js', 'running', $3, $4, $5, $6::jsonb, now())
     returning id`,
    [
      resource.id,
      resource.version_id,
      pages[0],
      pages[pages.length - 1],
      pages.length,
      JSON.stringify({
        lang: options.lang,
        dpi: options.dpi,
        pages,
        pageSpec: options.pageSpec || '',
        maxPages: options.maxPages,
      }),
    ],
  )
  return result.rows[0].id
}

async function countProcessedPages(client, resourceId, currentPages = []) {
  const processed = new Set(currentPages.map((page) => Number(page)).filter(Boolean))
  const result = await client.query(
    `select page_start, page_end, metadata
     from resource_ocr_jobs
     where resource_id = $1 and status = 'completed'`,
    [resourceId],
  )
  for (const row of result.rows) {
    const pages = Array.isArray(row.metadata?.pages) ? row.metadata.pages : []
    if (pages.length) {
      for (const page of pages) {
        const value = Number(page)
        if (value > 0) processed.add(value)
      }
      continue
    }
    const start = Number(row.page_start || 0)
    const end = Number(row.page_end || 0)
    if (start > 0 && end >= start) {
      for (let page = start; page <= end; page += 1) processed.add(page)
    }
  }
  return processed.size
}

async function updateJob(client, jobId, patch) {
  await client.query(
    `update resource_ocr_jobs
     set status = coalesce($2, status),
         processed_pages = coalesce($3, processed_pages),
         output_chunk_count = coalesce($4, output_chunk_count),
         average_confidence = coalesce($5, average_confidence),
         error_message = coalesce($6, error_message),
         metadata = metadata || coalesce($7::jsonb, '{}'::jsonb),
         finished_at = case when $2 in ('completed', 'failed', 'cancelled') then now() else finished_at end,
         updated_at = now()
     where id = $1`,
    [
      jobId,
      patch.status || null,
      Number.isFinite(patch.processedPages) ? patch.processedPages : null,
      Number.isFinite(patch.outputChunkCount) ? patch.outputChunkCount : null,
      Number.isFinite(patch.averageConfidence) ? patch.averageConfidence : null,
      patch.errorMessage || null,
      JSON.stringify(patch.metadata || {}),
    ],
  )
}

async function upsertOcrChunks(client, resource, jobId, pageResults, pageCount, options) {
  const pages = pageResults.map((item) => item.page)
  await client.query(
    `delete from resource_chunks
     where version_id = $1
       and metadata->>'source' = 'ocr'
       and (metadata->>'page')::int = any($2::int[])`,
    [resource.version_id, pages],
  )

  const startResult = await client.query(
    `select coalesce(max(chunk_no), 0)::int + 1 as next_chunk_no
     from resource_chunks
     where version_id = $1`,
    [resource.version_id],
  )
  let chunkNo = Number(startResult.rows[0].next_chunk_no || 1)
  let inserted = 0

  for (const result of pageResults) {
    const body = cleanText(result.text)
    if (body.length < 12) continue
    await client.query(
      `insert into resource_chunks
         (resource_id, version_id, chunk_no, heading, body, token_count, page_ref, metadata)
       values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
      [
        resource.id,
        resource.version_id,
        chunkNo,
        `OCR page ${result.page}`,
        body,
        tokenCount(body),
        String(result.page),
        JSON.stringify({
          source: 'ocr',
          engine: 'tesseract.js',
          lang: options.lang,
          page: result.page,
          confidence: result.confidence,
          jobId,
        }),
      ],
    )
    chunkNo += 1
    inserted += 1
  }

  const stats = await client.query(
    `select count(*)::int as chunk_count,
            count(distinct (metadata->>'page'))::int as ocr_pages
     from resource_chunks
     where version_id = $1 and metadata->>'source' = 'ocr'`,
    [resource.version_id],
  )
  const chunkCount = Number(stats.rows[0].chunk_count || 0)
  const ocrTextPagesDone = Number(stats.rows[0].ocr_pages || 0)
  const ocrPagesDone = await countProcessedPages(client, resource.id, pages)
  const status = pageCount > 0 && ocrPagesDone >= pageCount ? 'completed' : 'partial'
  const averageConfidence = pageResults.length
    ? Number((pageResults.reduce((sum, item) => sum + Number(item.confidence || 0), 0) / pageResults.length).toFixed(2))
    : null

  await client.query(
    `update learning_resource_versions
     set parse_status = case when $3::int > 0 then 'parsed' else parse_status end,
         raw_metadata = raw_metadata || $2::jsonb,
         created_at = created_at
     where id = $1`,
    [
      resource.version_id,
      JSON.stringify({
        ocr_status: status,
        ocr_engine: 'tesseract.js',
        ocr_lang: options.lang,
        ocr_pages_done: ocrPagesDone,
        ocr_text_pages_done: ocrTextPagesDone,
        ocr_chunk_count: chunkCount,
        ocr_last_job_id: jobId,
        ocr_updated_at: new Date().toISOString(),
      }),
      chunkCount,
    ],
  )

  await client.query(
    `update learning_resources
     set metadata = metadata || $2::jsonb,
         difficulty = case when $3 = 'completed' then '已完成 OCR' else difficulty end,
         action_label = case when $4::int > 0 then '阅读' else action_label end,
         updated_at = now()
     where id = $1`,
    [
      resource.id,
      JSON.stringify({
        ocrStatus: status,
        ocrEngine: 'tesseract.js',
        ocrLang: options.lang,
        ocrPagesDone,
        ocrTextPagesDone,
        ocrChunkCount: chunkCount,
        ocrAverageConfidence: averageConfidence,
        ocrLastJobId: jobId,
        ocrUpdatedAt: new Date().toISOString(),
        ocrRequired: status !== 'completed',
      }),
      status,
      chunkCount,
    ],
  )

  await client.query(
    `insert into resource_distillations
       (resource_id, course_id, version_id, distillation_type, status, content, confidence, model_name, prompt_version)
     values ($1, $2, $3, 'summary', 'ready', $4::jsonb, $5, 'local-ocr-rule', 'ocr-v1')
     on conflict (resource_id, course_id, distillation_type) do update set
       version_id = excluded.version_id,
       status = excluded.status,
       content = resource_distillations.content || excluded.content,
       confidence = excluded.confidence,
       model_name = excluded.model_name,
       prompt_version = excluded.prompt_version,
       updated_at = now()`,
    [
      resource.id,
      process.env.DEMO_COURSE_ID || '00000000-0000-0000-0000-000000000301',
      resource.version_id,
      JSON.stringify({
        summary: `${resource.title} 已接入本地 OCR，当前可检索 ${ocrPagesDone}/${pageCount || ocrPagesDone} 页，生成 ${chunkCount} 个文本片段。`,
        ocrStatus: status,
        ocrPagesDone,
        ocrTextPagesDone,
        ocrChunkCount: chunkCount,
        averageConfidence,
      }),
      averageConfidence ? Math.max(0.5, Math.min(0.95, averageConfidence / 100)) : 0.65,
    ],
  )

  return { inserted, chunkCount, ocrPagesDone, status, averageConfidence }
}

async function processResource(client, worker, pdftoppm, resource, options) {
  const pageCount = Number(resource.page_count || 1)
  const pages = parsePages(options.pageSpec, pageCount, options.maxPages)
  if (!pages.length) throw new Error(`no pages selected for ${resource.title}`)

  const pdfPath = resolveLocalPdf(resource)
  const outputDir = path.join(options.tempDir, safeName(resource.resource_code || resource.id))
  const jobId = await createJob(client, resource, pages, options)
  const pageResults = []

  try {
    for (const page of pages) {
      const imagePath = renderPage(pdftoppm, pdfPath, outputDir, page, options.dpi)
      console.log(`[ocr] ${resource.title} page ${page}: rendered`)
      const recognized = await worker.recognize(imagePath, {}, { text: true })
      const text = cleanText(recognized.data?.text || '')
      const confidence = Number(recognized.data?.confidence || 0)
      pageResults.push({ page, text, confidence })
      await updateJob(client, jobId, {
        processedPages: pageResults.length,
        outputChunkCount: pageResults.filter((item) => cleanText(item.text).length >= 12).length,
        averageConfidence: confidence,
        metadata: { lastPage: page, lastTextChars: text.length },
      })
      console.log(`[ocr] ${resource.title} page ${page}: ${text.length} chars, confidence ${confidence.toFixed(1)}`)
    }

    const stored = await upsertOcrChunks(client, resource, jobId, pageResults, pageCount, options)
    await updateJob(client, jobId, {
      status: 'completed',
      processedPages: pageResults.length,
      outputChunkCount: stored.inserted,
      averageConfidence: stored.averageConfidence,
      metadata: { resourceTitle: resource.title, ocrStatus: stored.status },
    })

    if (!options.keepImages) {
      fs.rmSync(outputDir, { recursive: true, force: true })
    }
    return { jobId, title: resource.title, pages, ...stored }
  } catch (error) {
    await updateJob(client, jobId, {
      status: 'failed',
      processedPages: pageResults.length,
      outputChunkCount: 0,
      errorMessage: String(error.message || error).slice(0, 1000),
      metadata: { resourceTitle: resource.title },
    })
    throw error
  }
}

async function main() {
  loadDotEnv(path.join(projectRoot, 'frontend', '.env'))
  const options = parseArgs()
  fs.mkdirSync(options.cacheDir, { recursive: true })
  fs.mkdirSync(options.tempDir, { recursive: true })

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    host: process.env.PGHOST,
    port: process.env.PGPORT ? Number(process.env.PGPORT) : undefined,
    database: process.env.PGDATABASE || 'a3_learning',
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD,
  })

  const pdftoppm = findPdftoppm()
  const client = await pool.connect()
  let worker = null
  const results = []
  const failures = []
  try {
    const resources = await selectResources(client, options)
    if (!resources.length) throw new Error('no local PDF resources matched the OCR options')

    let lastLogAt = 0
    worker = await createWorker(options.lang, 1, {
      cachePath: options.cacheDir,
      cacheMethod: 'write',
      logger: (message) => {
        const now = Date.now()
        if (message.status && now - lastLogAt > 3000) {
          lastLogAt = now
          const progress = Number(message.progress || 0)
          console.log(`[ocr-worker] ${message.status} ${Math.round(progress * 100)}%`)
        }
      },
    })
    if (PSM?.AUTO) {
      await worker.setParameters({ tessedit_pageseg_mode: PSM.AUTO })
    }

    for (const resource of resources) {
      try {
        results.push(await processResource(client, worker, pdftoppm, resource, options))
      } catch (error) {
        failures.push({ title: resource.title, error: error.message })
      }
    }
  } finally {
    if (worker) await worker.terminate()
    client.release()
    await pool.end()
  }

  const payload = { ok: failures.length === 0, processed: results, failures }
  console.log(JSON.stringify(payload, null, 2))
  if (failures.length) process.exitCode = 1
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
