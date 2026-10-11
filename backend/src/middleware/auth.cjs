// backend/src/middleware/auth.cjs
// Portal 权限解析 — 从现有 frontend/server/index.cjs 提炼

const { pool } = require('../db.cjs')

const demoStudentId = '00000000-0000-0000-0000-000000000101'
const demoCourseId = '00000000-0000-0000-0000-000000000301'

/**
 * 提取请求中的 account 参数
 */
function requestAccount(request, portal = 'student') {
  return String(request.query.account || request.body?.account || `${portal}_demo`)
}

/**
 * 解析用户上下文：权限、学生 ID、课程 ID
 */
async function resolveContext(request, portal = 'student') {
  const username = requestAccount(request, portal)

  const permission = await pool.query(
    `SELECT *
     FROM v_account_portals
     WHERE username = $1 AND portal = $2 AND can_read = true
     ORDER BY role
     LIMIT 1`,
    [username, portal],
  )

  if (!permission.rows[0]) {
    const error = new Error('account has no permission for this portal')
    error.status = 403
    throw error
  }

  let studentId = demoStudentId
  if (portal === 'student') {
    studentId = permission.rows[0].user_id
  } else if (portal === 'parent') {
    const linked = await pool.query(
      'SELECT student_id FROM parent_student_links WHERE parent_id = $1 ORDER BY student_id LIMIT 1',
      [permission.rows[0].user_id],
    )
    studentId = linked.rows[0]?.student_id || demoStudentId
  } else if (portal === 'teacher') {
    const linked = await pool.query(
      `SELECT cm.student_id
       FROM teacher_class_links tc
       JOIN class_memberships cm ON cm.class_id = tc.class_id
       WHERE tc.teacher_id = $1
       ORDER BY cm.joined_at DESC
       LIMIT 1`,
      [permission.rows[0].user_id],
    )
    studentId = linked.rows[0]?.student_id || demoStudentId
  }

  return {
    portal,
    username,
    accountId: permission.rows[0].account_id,
    currentUserId: permission.rows[0].user_id,
    studentId,
    courseId: request.query.courseId || demoCourseId,
    permission: {
      portal,
      canRead: permission.rows[0].can_read,
      canWrite: permission.rows[0].can_write,
      canManage: permission.rows[0].can_manage,
    },
  }
}

/**
 * 写权限校验
 */
function requireWrite(context) {
  if (!context.permission.canWrite) {
    const error = new Error('account has no write permission for this portal')
    error.status = 403
    throw error
  }
}

module.exports = { resolveContext, requireWrite, requestAccount }
