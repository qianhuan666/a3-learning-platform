// backend/src/routes/health.routes.cjs
const { Router } = require('express')
const { pool } = require('../db.cjs')

const router = Router()

router.get('/health', async (_request, response) => {
  try {
    await pool.query('SELECT 1')
    response.json({ ok: true, database: 'connected' })
  } catch (error) {
    response.status(500).json({ ok: false, error: error.message })
  }
})

module.exports = router
