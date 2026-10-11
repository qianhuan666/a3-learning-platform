const fs = require('fs')
const path = require('path')

const projectRoot = path.resolve(__dirname, '..')
const { Pool } = require(path.join(projectRoot, 'frontend', 'node_modules', 'pg'))

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

loadDotEnv(path.join(projectRoot, 'frontend', '.env'))

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  host: process.env.PGHOST,
  port: process.env.PGPORT ? Number(process.env.PGPORT) : undefined,
  database: process.env.PGDATABASE || 'a3_learning',
  user: process.env.PGUSER || 'postgres',
  password: process.env.PGPASSWORD,
})

const demoCourseId = process.env.DEMO_COURSE_ID || '00000000-0000-0000-0000-000000000301'

function cleanText(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .replace(/[|]{2,}/g, '|')
    .trim()
}

function preview(value, maxLength = 220) {
  const text = cleanText(value)
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text
}

function pickTopic(title, text) {
  const haystack = `${title} ${text}`
  if (/积分|导数|函数|极限|微分|级数|方程/.test(haystack)) return '高等数学'
  if (/特征值|矩阵|向量|线性|行列式/.test(haystack)) return '线性代数'
  if (/概率|密度|随机|分布|统计/.test(haystack)) return '概率统计'
  return '课程知识'
}

function buildDistillations(resource, chunks) {
  const meaningful = chunks.filter((chunk) => cleanText(chunk.body).length >= 80)
  const sample = meaningful.slice(0, 10)
  const combined = sample.map((chunk) => cleanText(chunk.body)).join(' ')
  const topic = pickTopic(resource.title, combined)
  const pageSpan = chunks.length ? `${chunks[0].page_ref || chunks[0].chunk_no}-${chunks[chunks.length - 1].page_ref || chunks[chunks.length - 1].chunk_no}` : ''
  const strongChunks = meaningful
    .filter((chunk) => Number(chunk.confidence || 0) >= 55)
    .slice(0, 8)

  const outline = strongChunks.map((chunk, index) => ({
    order: index + 1,
    title: chunk.heading || `${resource.title} 第 ${chunk.page_ref || chunk.chunk_no} 页`,
    pageRef: chunk.page_ref,
    preview: preview(chunk.body, 180),
  }))

  const keyPoints = strongChunks.slice(0, 6).map((chunk, index) => ({
    label: `${topic}要点 ${index + 1}`,
    pageRef: chunk.page_ref,
    evidence: preview(chunk.body, 160),
    confidence: Number(chunk.confidence || 0),
  }))

  const practicePlan = strongChunks.slice(0, 5).map((chunk, index) => ({
    order: index + 1,
    title: `阅读第 ${chunk.page_ref || chunk.chunk_no} 页并整理一个公式/结论`,
    durationMinutes: index < 2 ? 8 : 12,
    evidence: preview(chunk.body, 140),
  }))

  const tutorContext = strongChunks.slice(0, 10).map((chunk) => ({
    resourceTitle: resource.title,
    pageRef: chunk.page_ref,
    heading: chunk.heading,
    body: preview(chunk.body, 360),
    confidence: Number(chunk.confidence || 0),
  }))

  return {
    summary: {
      summary: `${resource.title} 已完成本地 OCR 与学习化处理，覆盖约 ${resource.page_count || resource.ocr_pages_done || chunks.length} 页，生成 ${resource.chunk_count || chunks.length} 个可检索片段。当前适合用于资源搜索、书内预览、AI 辅导上下文和按页阅读任务。`,
      topic,
      pageSpan,
      chunkCount: chunks.length,
      averageConfidence: resource.avg_confidence === null ? null : Number(resource.avg_confidence),
      generatedBy: 'local-ocr-distillation-v1',
      generatedAt: new Date().toISOString(),
    },
    outline: {
      title: `${resource.title} 学习提纲`,
      sections: outline,
      generatedBy: 'local-ocr-distillation-v1',
    },
    key_points: {
      title: `${resource.title} 可检索重点`,
      items: keyPoints,
      generatedBy: 'local-ocr-distillation-v1',
    },
    practice_plan: {
      title: `${resource.title} 阅读练习路径`,
      items: practicePlan,
      generatedBy: 'local-ocr-distillation-v1',
    },
    tutor_context: {
      title: `${resource.title} 辅导上下文`,
      contexts: tutorContext,
      generatedBy: 'local-ocr-distillation-v1',
    },
  }
}

function buildQuestions(resource, chunks) {
  return chunks
    .filter((chunk) => cleanText(chunk.body).length >= 120 && Number(chunk.confidence || 0) >= 50)
    .slice(0, 4)
    .map((chunk, index) => ({
      stem: `第 ${chunk.page_ref || chunk.chunk_no} 页阅读整理：概括核心概念或解题步骤，并写出一个需验证的公式条件。`,
      solution: `参考片段：${preview(chunk.body, 420)}\n\n作答建议：先指出本页所属知识点，再整理公式、条件或步骤，最后写出仍需追问的地方。`,
      difficultyLevel: index < 2 ? 3 : 4,
      estimatedMinutes: index < 2 ? 8 : 12,
      metadata: {
        source: 'local_ocr_distillation',
        resourceCode: resource.resource_code,
        pageRef: chunk.page_ref,
        chunkId: chunk.id,
      },
    }))
}

async function upsertDistillation(client, resource, versionId, type, content, confidence = 0.72) {
  await client.query(
    `insert into resource_distillations
       (resource_id, course_id, version_id, distillation_type, status, content, confidence, model_name, prompt_version)
     values ($1, $2, $3, $4, 'ready', $5::jsonb, $6, 'local-heuristic', 'ocr-distill-v1')
     on conflict (resource_id, course_id, distillation_type)
     do update set
       version_id = excluded.version_id,
       status = excluded.status,
       content = excluded.content,
       confidence = excluded.confidence,
       model_name = excluded.model_name,
       prompt_version = excluded.prompt_version,
       updated_at = now()`,
    [resource.id, demoCourseId, versionId, type, JSON.stringify(content), confidence],
  )
}

async function distillResource(client, resource) {
  const versionResult = await client.query(
    `select id
     from learning_resource_versions
     where resource_id = $1
     order by version_no desc, created_at desc
     limit 1`,
    [resource.id],
  )
  const versionId = versionResult.rows[0]?.id || null

  const chunksResult = await client.query(
    `select id, chunk_no, heading, body, page_ref, metadata,
            nullif(metadata->>'confidence', '')::numeric as confidence
     from resource_chunks
     where resource_id = $1
       and metadata->>'source' = 'ocr'
     order by chunk_no`,
    [resource.id],
  )
  const chunks = chunksResult.rows
  if (!chunks.length) return { resource: resource.title, skipped: true, reason: 'no OCR chunks' }

  const distillations = buildDistillations(resource, chunks)
  for (const [type, content] of Object.entries(distillations)) {
    await upsertDistillation(client, resource, versionId, type, content)
  }

  await client.query(
    `delete from question_items
     where resource_id = $1
       and course_id = $2
       and metadata->>'source' = 'local_ocr_distillation'`,
    [resource.id, demoCourseId],
  )

  const questions = buildQuestions(resource, chunks)
  for (const question of questions) {
    await client.query(
      `insert into question_items
         (resource_id, course_id, question_type, stem, answer, solution, difficulty_level, estimated_minutes, metadata)
       values ($1, $2, 'essay', $3, '', $4, $5, $6, $7::jsonb)`,
      [
        resource.id,
        demoCourseId,
        question.stem,
        question.solution,
        question.difficultyLevel,
        question.estimatedMinutes,
        JSON.stringify(question.metadata),
      ],
    )
  }

  await client.query(
    `update learning_resources
     set metadata = metadata || $2::jsonb,
         updated_at = now()
     where id = $1`,
    [
      resource.id,
      JSON.stringify({
        distillationStatus: 'ready',
        distilledAt: new Date().toISOString(),
        generatedQuestionCount: questions.length,
      }),
    ],
  )

  return {
    resource: resource.title,
    chunks: chunks.length,
    distillations: Object.keys(distillations).length,
    questions: questions.length,
  }
}

async function main() {
  const client = await pool.connect()
  try {
    const resources = await client.query(
      `select r.id, r.resource_code, r.title, r.kind,
              nullif(r.metadata->>'pageCount', '')::int as page_count,
              nullif(r.metadata->>'ocrPagesDone', '')::int as ocr_pages_done,
              nullif(r.metadata->>'ocrChunkCount', '')::int as chunk_count,
              round(avg(nullif(c.metadata->>'confidence', '')::numeric), 1) as avg_confidence
       from learning_resources r
       join resource_chunks c on c.resource_id = r.id
       where r.status = 'active'
         and r.subject = (select subject from courses where id = $1)
         and r.grade = (select grade from courses where id = $1)
         and coalesce(r.metadata->>'ocrStatus', '') = 'completed'
       group by r.id, r.resource_code, r.title, r.kind, r.metadata
       order by r.title`,
      [demoCourseId],
    )

    const results = []
    for (const resource of resources.rows) {
      results.push(await distillResource(client, resource))
    }

    console.log(JSON.stringify({ ok: true, resources: results }, null, 2))
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch(async (error) => {
  console.error(error)
  await pool.end()
  process.exit(1)
})
