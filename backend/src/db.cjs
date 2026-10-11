// backend/src/db.cjs — PostgreSQL 连接池
const { Pool } = require('pg')
const config = require('./config.cjs')

const pool = new Pool({
  host: config.db.host,
  port: config.db.port,
  database: config.db.database,
  user: config.db.user,
  password: config.db.password,
})

pool.on('error', (err) => {
  console.error('[DB] unexpected pool error:', err.message)
})

module.exports = { pool }
