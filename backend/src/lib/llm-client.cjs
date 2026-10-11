const OpenAI = require('openai')

/**
 * Create an OpenAI-compatible client.
 * Supports DeepSeek, Qwen, Zhipu, or any OpenAI-compatible endpoint.
 */
function createClient() {
  const baseURL = process.env.LLM_BASE_URL || 'https://api.deepseek.com'
  const apiKey = process.env.LLM_API_KEY || ''
  const model = process.env.LLM_MODEL || 'deepseek-chat'

  if (!apiKey) {
    return null
  }

  return { client: new OpenAI({ baseURL, apiKey }), model }
}

function buildCompletionOptions(model, messages) {
  const options = {
    model,
    messages,
    temperature: 0.7,
    max_tokens: 2048,
  }

  if (String(model).startsWith('deepseek-v4-')) {
    options.thinking = { type: 'enabled' }
    options.reasoning_effort = process.env.LLM_REASONING_EFFORT || 'high'
    options.max_tokens = Number(process.env.LLM_MAX_TOKENS || 4096)
  }

  return options
}

/**
 * Build the system prompt with student profile context.
 * @param {object} profile - { studentType, weakPoints, strongPoints }
 * @param {Array} knowledgeChunks - optional RAG results
 */
function buildSystemPrompt(profile, knowledgeChunks) {
  const studentType = profile.studentType || '标准型'

  const styleGuide = {
    '基础型':
      '该学生基础较薄弱。请使用生活化类比和直观解释，用最简单的语言讲清概念。每个概念配一个具体例子。给出分步提示时，每一步都比前一步更具体，但绝不直接给完整答案。',
    '标准型':
      '该学生基础中等。请点明解题思路和关键步骤，引导对方自己推导。适当提醒常见易错点。',
    '进阶型':
      '该学生基础较好。请简要说明核心思想，然后引导对方思考优化方向或更一般的情况。可以提出拓展问题激发思考。',
  }

  const weakInfo = profile.weakPoints && profile.weakPoints.length > 0
    ? `\n薄弱知识点：${profile.weakPoints.slice(0, 3).join('、')}。`
    : ''

  const strongInfo = profile.strongPoints && profile.strongPoints.length > 0
    ? `\n优势知识点：${profile.strongPoints.slice(0, 3).join('、')}。`
    : ''

  let knowledgeSection = ''
  if (knowledgeChunks && knowledgeChunks.length > 0) {
    knowledgeSection = `\n\n课程知识库参考内容（可用于回答，但不要照抄，用自己的话引导）：\n${knowledgeChunks
      .map((k, i) => `${i + 1}. [${k.chapter || ''} > ${k.knowledgePoint || k.title || ''}] ${k.content || ''}`)
      .join('\n')}`
  }

  return `你是「智学成长平台」的大学生 AI 学习导师，名叫"小智"。你服务的是本科阶段学生，当前重点课程包括高等数学 A、线性代数、概率统计、数学建模与相关专业基础课。

你的核心原则：
1. 绝不直接给出完整答案。你通过分层提示帮助学生自己推导出来。你的角色是引导者，不是答题机。
2. 每次回复末尾附 3 个引导步骤（step 卡片）。每个步骤包含：一个简短的标题（title）、一段引导正文（body）、一段可展开的提示（hint）。
3. 使用鼓励性、亲切的中文表达，像一位熟悉大学课程、考试复习和科研/项目训练的学习导师。
4. 学生画像：${studentType}。${styleGuide[studentType] || styleGuide['标准型']}${weakInfo}${strongInfo}
5. 如果学生问的是大学数学或专业基础题，按"识别知识点→建立解题思路→检查条件与结果"三步引导。如果学生问的是概念，按"直观理解→正式定义→典型应用/易错点"三步引导。
6. 如果学生表示困惑或说"不懂"，降低难度，用更基础的类比重新解释。
7. 始终把当前学习者视为本科生，围绕大学课程语境回答；除非学生明确切换话题，否则不要改变学段设定。

回复格式要求（严格遵守）：
你必须返回纯 JSON，不要包含 markdown 代码块标记（不要 \`\`\`json），只返回 JSON 对象本身：
{"reply": "你的完整回复文字", "steps": [{"title": "步骤1标题", "body": "步骤1正文", "hint": "提示文字"}, {"title": "步骤2标题", "body": "步骤2正文", "hint": "提示文字"}, {"title": "步骤3标题", "body": "步骤3正文", "hint": "提示文字"}]}
${knowledgeSection ? knowledgeSection : ''}`
}

/**
 * Call the LLM for a chat completion.
 * @param {Array} history - previous messages [{role, content}, ...]
 * @param {string} userMessage - current student input
 * @param {object} profile - student profile context
 * @param {Array} knowledgeChunks - optional RAG results
 * @returns {{reply: string, steps: Array<[string, string, string]>}}
 */
async function chatCompletion(history, userMessage, profile, knowledgeChunks) {
  const clientInfo = createClient()
  if (!clientInfo) {
    throw new Error('LLM_API_KEY not configured')
  }

  const { client, model } = clientInfo
  const systemPrompt = buildSystemPrompt(profile, knowledgeChunks)

  const recentHistory = (history || []).slice(-10).map((msg) => ({
    role: msg.role === 'assistant' ? 'assistant' : 'user',
    content: msg.content,
  }))

  const response = await client.chat.completions.create(buildCompletionOptions(model, [
      { role: 'system', content: systemPrompt },
      ...recentHistory,
      { role: 'user', content: userMessage },
    ]))

  const rawContent = response.choices[0]?.message?.content || ''
  return parseResponse(rawContent)
}

function createReplyDeltaExtractor(onDelta) {
  let searchBuffer = ''
  let inReply = false
  let escaped = false
  let done = false
  return (chunk) => {
    if (done) return
    for (const char of String(chunk || '')) {
      if (!inReply) {
        searchBuffer = `${searchBuffer}${char}`.slice(-120)
        if (/"reply"\s*:\s*"$/.test(searchBuffer)) {
          inReply = true
          searchBuffer = ''
        }
        continue
      }
      if (escaped) {
        const mapped = { n: '\n', r: '\r', t: '\t', '"': '"', '\\': '\\' }[char] || char
        onDelta(mapped)
        escaped = false
        continue
      }
      if (char === '\\') {
        escaped = true
        continue
      }
      if (char === '"') {
        done = true
        continue
      }
      onDelta(char)
    }
  }
}

async function chatCompletionStream(history, userMessage, profile, knowledgeChunks, onReplyDelta = () => {}) {
  const clientInfo = createClient()
  if (!clientInfo) {
    throw new Error('LLM_API_KEY not configured')
  }

  const { client, model } = clientInfo
  const systemPrompt = buildSystemPrompt(profile, knowledgeChunks)
  const recentHistory = (history || []).slice(-10).map((msg) => ({
    role: msg.role === 'assistant' ? 'assistant' : 'user',
    content: msg.content,
  }))
  const extractor = createReplyDeltaExtractor(onReplyDelta)
  const stream = await client.chat.completions.create({
    ...buildCompletionOptions(model, [
      { role: 'system', content: systemPrompt },
      ...recentHistory,
      { role: 'user', content: userMessage },
    ]),
    stream: true,
  })

  let rawContent = ''
  for await (const part of stream) {
    const delta = part.choices?.[0]?.delta?.content || ''
    if (!delta) continue
    rawContent += delta
    extractor(delta)
  }
  return parseResponse(rawContent)
}

/**
 * Parse LLM JSON response with robust fallback.
 * @param {string} raw - raw response text
 * @returns {{reply: string, steps: Array<[string, string, string]>}}
 */
function parseResponse(raw) {
  // Try to extract JSON from the response (handle markdown code blocks)
  let jsonStr = raw.trim()

  // Remove markdown code fences if present
  const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (jsonMatch) {
    jsonStr = jsonMatch[1].trim()
  }

  try {
    const parsed = JSON.parse(jsonStr)
    const reply = parsed.reply || raw
    const steps = Array.isArray(parsed.steps)
      ? parsed.steps.slice(0, 3).map((s, i) => {
          if (Array.isArray(s)) return [s[0] || `第${i + 1}步`, s[1] || '', s[2] || '']
          return [s.title || `第${i + 1}步`, s.body || '', s.hint || '']
        })
      : buildDefaultSteps(reply)
    return { reply, steps }
  } catch {
    // If JSON parsing fails, treat entire response as reply with default steps
    return {
      reply: raw,
      steps: buildDefaultSteps(raw),
    }
  }
}

function buildDefaultSteps(_reply) {
  return [
    ['理解问题', '先把题目中的已知条件和未知量标记出来，不急着算。', '圈出关键数字和关键词。'],
    ['寻找思路', '想一想这道题可以用什么方法来解决，回顾相关的概念。', '翻翻课本对应的知识点。'],
    ['尝试验证', '把你想到的解法写下来，一步步检查。', '把结果代回原式验证。'],
  ]
}

module.exports = { chatCompletion, chatCompletionStream, buildSystemPrompt, parseResponse }
