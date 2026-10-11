// backend/src/routes/auth.routes.cjs
const { Router } = require('express')
const { pool } = require('../db.cjs')

const router = Router()

router.post('/auth/login', async (request, response, next) => {
  try {
    const { username, password } = request.body || {}
    if (!username || !password) {
      response.status(400).json({ error: 'username and password are required' })
      return
    }

    const result = await pool.query(
      `SELECT id, username, default_portal
       FROM user_accounts
       WHERE username = $1
         AND status = 'active'
         AND password_hash = crypt($2, password_hash)`,
      [username, password],
    )

    if (!result.rows[0]) {
      response.status(401).json({ error: 'invalid credentials' })
      return
    }

    await pool.query('UPDATE user_accounts SET last_login_at = now() WHERE id = $1', [result.rows[0].id])

    const portals = await pool.query(
      `SELECT portal, can_read, can_write, can_manage
       FROM account_portal_permissions
       WHERE account_id = $1
       ORDER BY portal`,
      [result.rows[0].id],
    )

    response.json({
      account: result.rows[0],
      portals: portals.rows.map((row) => ({
        portal: row.portal,
        canRead: row.can_read,
        canWrite: row.can_write,
        canManage: row.can_manage,
      })),
    })
  } catch (error) {
    next(error)
  }
})

module.exports = router
