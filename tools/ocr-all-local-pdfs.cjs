const childProcess = require('child_process')
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

function parseArgs() {
  const options = {
    chunkSize: 10,
    dpi: 150,
    lang: 'chi_sim',
    resourceCode: '',
  }
  const args = process.argv.slice(2)
  for (let index = 0; index < args.length; index += 1) {
    const item = args[index]
    if (item === '--chunk-size') options.chunkSize = Number(args[++index])
    else if (item === '--dpi') options.dpi = Number(args[++index])
    else if (item === '--lang') options.lang = args[++index]
    else if (item === '--resource-code') options.resourceCode = args[++index]
  }
  options.chunkSize = Number.isFinite(options.chunkSize) && options.chunkSize > 0 ? Math.min(50, Math.floor(options.chunkSize)) : 10
  options.dpi = Number.isFinite(options.dpi) && options.dpi >= 120 ? Math.floor(options.dpi) : 150
  return options
}

function rangePages(start, end) {
  const pages = []
  for (let page = start; page <= end; page += 1) pages.push(page)
  return pages
}

function groupMissingPages(missing, chunkSize) {
  const groups = []
  let group = []
  for (const page of missing) {
    const last = group[group.length - 1]
    if (!group.length || (page === last + 1 && group.length < chunkSize)) {
      group.push(page)
    } else {
      groups.push(group)
      group = [page]
    }
  }
  if (group.length) groups.push(group)
  return groups
}

function runOcr(resourceCode, pages, options) {
  const pageSpec = pages.length === 1 ? String(pages[0]) : `${pages[0]}-${pages[pages.length - 1]}`
  const args = [
    path.join(projectRoot, 'tools', 'ocr-local-pdf-resource.cjs'),
    '--resource-code',
    resourceCode,
    '--pages',
    pageSpec,
    '--max-pages',
    String(pages.length),
    '--dpi',
    String(options.dpi),
    '--lang',
    options.lang,
  ]
  const startedAt = Date.now()
  const result = childProcess.spawnSync(process.execPath, args, {
    cwd: projectRoot,
    encoding: 'utf8',
    env: process.env,
    maxBuffer: 256 * 1024 * 1024,
    windowsHide: true,
  })
  const seconds = Math.round((Date.now() - startedAt) / 1000)
  return { ...result, seconds, pageSpec }
}

async function getResources(client, options) {
  const params = []
  const filter = options.resourceCode ? 'and r.resource_code = $1' : ''
  if (options.resourceCode) params.push(options.resourceCode)
  const result = await client.query(
    `select r.id, r.resource_code, r.title,
            coalesce((r.metadata->>'pageCount')::int, (v.raw_metadata->>'page_count')::int, 1) as page_count
     from learning_resources r
     join lateral (
       select raw_metadata
       from learning_resource_versions
       where resource_id = r.id
       order by version_no desc, created_at desc
       limit 1
     ) v on true
     where r.status = 'active'
       and coalesce(r.metadata->>'storage', '') = 'local-file'
       ${filter}
     order by r.title`,
    params,
  )
  return result.rows
}

async function processedPages(client, resourceId) {
  const pages = new Set()
  const jobs = await client.query(
    `select page_start, page_end, metadata
     from resource_ocr_jobs
     where resource_id = $1 and status = 'completed'`,
    [resourceId],
  )
  for (const row of jobs.rows) {
    if (Array.isArray(row.metadata?.pages)) {
      for (const page of row.metadata.pages) {
        const value = Number(page)
        if (value > 0) pages.add(value)
      }
      continue
    }
    const start = Number(row.page_start || 0)
    const end = Number(row.page_end || 0)
    if (start > 0 && end >= start) {
      for (const page of rangePages(start, end)) pages.add(page)
    }
  }
  return pages
}

async function resourceProgress(client, resource) {
  const done = await processedPages(client, resource.id)
  const chunks = await client.query(
    `select count(*)::int as chunk_count,
            count(distinct (metadata->>'page'))::int as text_pages
     from resource_chunks
     where resource_id = $1 and metadata->>'source' = 'ocr'`,
    [resource.id],
  )
  return {
    donePages: done.size,
    pageCount: Number(resource.page_count || 0),
    chunkCount: Number(chunks.rows[0]?.chunk_count || 0),
    textPages: Number(chunks.rows[0]?.text_pages || 0),
  }
}

async function updateFinalStatus(client, resource, progress) {
  const status = progress.donePages >= progress.pageCount ? 'completed' : 'partial'
  await client.query(
    `update learning_resources
     set metadata = metadata || $2::jsonb,
         difficulty = case when $3 = 'completed' then '已完成 OCR' else difficulty end,
         updated_at = now()
     where id = $1`,
    [
      resource.id,
      JSON.stringify({
        ocrStatus: status,
        ocrPagesDone: progress.donePages,
        ocrTextPagesDone: progress.textPages,
        ocrChunkCount: progress.chunkCount,
        ocrUpdatedAt: new Date().toISOString(),
        ocrRequired: status !== 'completed',
      }),
      status,
    ],
  )
}

async function main() {
  loadDotEnv(path.join(projectRoot, 'frontend', '.env'))
  const options = parseArgs()
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    host: process.env.PGHOST,
    port: process.env.PGPORT ? Number(process.env.PGPORT) : undefined,
    database: process.env.PGDATABASE || 'a3_learning',
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD,
  })

  let staleChunks = 0
  try {
    const resources = await getResources(pool, options)
    if (!resources.length) throw new Error('no local PDF resources found')
    console.log(`[all-ocr] resources=${resources.length}, chunkSize=${options.chunkSize}, dpi=${options.dpi}, lang=${options.lang}`)

    for (const resource of resources) {
      let done = await processedPages(pool, resource.id)
      const pageCount = Number(resource.page_count || 0)
      console.log(`[all-ocr] start ${resource.title}: ${done.size}/${pageCount}`)
      const missing = rangePages(1, pageCount).filter((page) => !done.has(page))
      const groups = groupMissingPages(missing, options.chunkSize)

      for (const pages of groups) {
        const before = await resourceProgress(pool, resource)
        const run = runOcr(resource.resource_code, pages, options)
        if (run.stdout) process.stdout.write(run.stdout)
        if (run.stderr) process.stderr.write(run.stderr)
        if (run.status !== 0 || run.error) {
          throw run.error || new Error(`OCR failed for ${resource.title} pages ${run.pageSpec}`)
        }

        const after = await resourceProgress(pool, resource)
        await updateFinalStatus(pool, resource, after)
        const delta = after.donePages - before.donePages
        if (delta <= 0) staleChunks += 1
        else staleChunks = 0

        console.log(`[all-ocr] progress ${resource.title}: pages ${run.pageSpec}, +${delta}, ${after.donePages}/${after.pageCount}, textPages=${after.textPages}, chunks=${after.chunkCount}, seconds=${run.seconds}`)
        if (staleChunks >= 2) {
          throw new Error('OCR progress stalled for two consecutive chunks; stopping for inspection')
        }
      }

      const finalProgress = await resourceProgress(pool, resource)
      await updateFinalStatus(pool, resource, finalProgress)
      console.log(`[all-ocr] done ${resource.title}: ${finalProgress.donePages}/${finalProgress.pageCount}, chunks=${finalProgress.chunkCount}`)
    }
  } finally {
    await pool.end()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
