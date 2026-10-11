// backend/src/config.cjs — 集中管理所有配置
const dotenv = require('dotenv')
const path = require('path')

// 从 frontend 目录加载 .env（与旧后端共用配置）
dotenv.config({ path: path.resolve(__dirname, '..', '..', 'frontend', '.env') })

module.exports = {
  port: Number(process.env.API_PORT || 3001),

  db: {
    host: process.env.PGHOST || '127.0.0.1',
    port: Number(process.env.PGPORT || 5432),
    database: process.env.PGDATABASE || 'a3_learning',
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD || '',
  },

  llm: {
    baseURL: process.env.LLM_BASE_URL || 'https://api.deepseek.com',
    apiKey: process.env.LLM_API_KEY || '',
    model: process.env.LLM_MODEL || 'deepseek-chat',
  },

  // 本地资源目录
  localResourceDir: process.env.LOCAL_RESOURCE_DIR || '',
}
