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

async function main() {
  const sql = process.argv.slice(2).join(' ')
  if (!sql.trim()) throw new Error('Usage: node tools/db-query.cjs <sql>')
  loadDotEnv(path.join(projectRoot, 'frontend', '.env'))
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    host: process.env.PGHOST,
    port: process.env.PGPORT ? Number(process.env.PGPORT) : undefined,
    database: process.env.PGDATABASE || 'a3_learning',
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD,
  })
  try {
    const result = await pool.query(sql)
    console.log(JSON.stringify(result.rows, null, 2))
  } finally {
    await pool.end()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
