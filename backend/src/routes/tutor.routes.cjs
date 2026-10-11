// backend/src/routes/tutor.routes.cjs
// 智能辅导 — 所有路由骨架已定义，具体逻辑逐步实现
const { Router } = require('express')
const { resolveContext, requireWrite } = require('../middleware/auth.cjs')

const router = Router()

// GET  /api/tutor              获取辅导会话列表
// POST /api/tutor/sessions      创建新会话
// POST /api/tutor/messages      发送消息（非流式）
// POST /api/tutor/messages/stream 发送消息（SSE 流式，Phase 2）
// POST /api/tutor/actions       快捷操作

router.get('/', async (request, response, next) => {
  try {
    const context = await resolveContext(request, request.query.portal || 'student')
    // TODO: 实现 buildTutorPayload
    response.json({ message: 'tutor list — 待实现', context: { studentId: context.studentId } })
  } catch (error) {
    next(error)
  }
})

router.post('/sessions', async (request, response, next) => {
  try {
    const context = await resolveContext(request, request.query.portal || 'student')
    requireWrite(context)
    // TODO: 实现 createTutorSession
    response.status(201).json({ message: 'session created — 待实现' })
  } catch (error) {
    next(error)
  }
})

router.post('/messages', async (request, response, next) => {
  try {
    const context = await resolveContext(request, request.query.portal || 'student')
    requireWrite(context)
    // TODO: 实现 sendMessage（调用 LLM）
    response.status(201).json({ message: 'message sent — 待实现' })
  } catch (error) {
    next(error)
  }
})

router.post('/messages/stream', async (request, response, next) => {
  try {
    const context = await resolveContext(request, request.query.portal || 'student')
    requireWrite(context)
    // TODO: Phase 2 — SSE 流式响应
    response.status(501).json({ error: 'streaming not yet implemented' })
  } catch (error) {
    next(error)
  }
})

router.post('/actions', async (request, response, next) => {
  try {
    const context = await resolveContext(request, request.query.portal || 'student')
    requireWrite(context)
    // TODO: 实现快捷操作
    response.status(201).json({ message: 'action logged — 待实现' })
  } catch (error) {
    next(error)
  }
})

module.exports = router
