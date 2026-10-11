// backend/src/routes/dashboard.routes.cjs
const { Router } = require('express')
const { resolveContext } = require('../middleware/auth.cjs')

const router = Router()

// GET /api/dashboard             学生 Dashboard 全量数据
// GET /api/portals/:portal/dashboard  按 portal 类型查询
// TODO: 从 frontend/server/index.cjs 迁移 buildStudentPayload 逻辑

router.get('/', async (request, response, next) => {
  try {
    const portal = String(request.query.portal || 'student')
    const context = await resolveContext(request, portal)
    // TODO: 实现 buildStudentPayload
    response.json({
      message: 'dashboard — 待迁移 buildStudentPayload',
      studentId: context.studentId,
      courseId: context.courseId,
    })
  } catch (error) {
    next(error)
  }
})

router.get('/portals/:portal/dashboard', async (request, response, next) => {
  try {
    const context = await resolveContext(request, request.params.portal)
    // TODO: 实现 buildStudentPayload
    response.json({
      message: 'portal dashboard — 待迁移 buildStudentPayload',
      portal: context.portal,
      studentId: context.studentId,
    })
  } catch (error) {
    next(error)
  }
})

module.exports = router
