// backend/src/middleware/error-handler.cjs
// 全局错误处理中间件

function errorHandler(err, _request, response, _next) {
  const status = err.status || 500
  const message = err.message || 'Internal Server Error'

  if (status >= 500) {
    console.error('[ERROR]', status, message)
  }

  response.status(status).json({ error: message })
}

// 404 兜底
function notFound(_request, response) {
  response.status(404).json({ error: 'Not Found' })
}

module.exports = { errorHandler, notFound }
