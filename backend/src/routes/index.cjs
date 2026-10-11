// backend/src/routes/index.cjs
// 路由汇总 — 所有 /api/* 路由在这里注册
const { Router } = require('express')

const healthRouter = require('./health.routes.cjs')
const authRouter = require('./auth.routes.cjs')
const dashboardRouter = require('./dashboard.routes.cjs')
const tutorRouter = require('./tutor.routes.cjs')

const api = Router()

api.use('/', healthRouter)
api.use('/', authRouter)
api.use('/', dashboardRouter)
api.use('/tutor', tutorRouter)

// 未来扩展：
// api.use('/plans',      require('./plans.routes.cjs'))
// api.use('/resources',  require('./resources.routes.cjs'))
// api.use('/reports',    require('./reports.routes.cjs'))
// api.use('/agents',     require('./agents.routes.cjs'))

module.exports = api
