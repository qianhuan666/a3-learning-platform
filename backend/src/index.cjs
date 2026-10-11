const cors = require('cors')
const crypto = require('crypto')
const express = require('express')
const fs = require('fs')
const path = require('path')
const config = require('./config.cjs')
const { pool } = require('./db.cjs')
const { chatCompletion, chatCompletionStream } = require('./lib/llm-client.cjs')
const { fetchStudentProfile } = require('./lib/tutor-profile.cjs')

const app = express()
const port = config.port
const projectRoot = path.resolve(__dirname, '..', '..')
const localResourceRoot = path.resolve(config.localResourceDir || path.join(projectRoot, 'ziyuan'))

const demoStudentId = process.env.DEMO_STUDENT_ID || '00000000-0000-0000-0000-000000000101'
const demoCourseId = process.env.DEMO_COURSE_ID || '00000000-0000-0000-0000-000000000301'

const statusLabel = {
  done: '已完成',
  active: '进行中',
  pending: '未开始',
  skipped: '已跳过',
}

function formatStudyPlan(row) {
  const metadata = row.metadata || {}
  return {
    id: row.id,
    time: `${row.start_time || ''}${row.end_time ? `-${row.end_time}` : ''}`,
    title: row.title,
    detail: row.detail,
    minutes: Number(row.estimated_minutes),
    status: statusLabel[row.status] || '未开始',
    tag: row.tag,
    source: row.source || undefined,
    sourceDetail: metadata.sourceDetail || undefined,
    sourceLabel: metadata.sourceLabel || undefined,
    agentTaskId: metadata.agentTaskId || undefined,
    reason: row.reason || metadata.reason || undefined,
    resourceId: row.resource_id || undefined,
  }
}

app.use(cors())
app.use(express.json())

const sessionCookieName = 'a3_session'
const sessionDays = Number(process.env.SESSION_DAYS || 7)
const allowDemoAccountFallback = process.env.ALLOW_DEMO_ACCOUNT_FALLBACK !== 'false'

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex')
}

function readCookie(request, name) {
  const cookie = request.headers.cookie || ''
  const part = cookie.split(';').map((item) => item.trim()).find((item) => item.startsWith(`${name}=`))
  if (!part) return ''
  return decodeURIComponent(part.slice(name.length + 1))
}

function requestToken(request) {
  const authorization = String(request.headers.authorization || '')
  if (authorization.toLowerCase().startsWith('bearer ')) return authorization.slice(7).trim()
  return readCookie(request, sessionCookieName)
}

async function resolveSession(request) {
  const token = requestToken(request)
  if (!token) return null
  const result = await pool.query(
    `select s.id as session_id, s.account_id, s.expires_at, a.username, a.default_portal
     from account_sessions s
     join user_accounts a on a.id = s.account_id
     where s.token_hash = $1
       and s.revoked_at is null
       and s.expires_at > now()
       and a.status = 'active'
     limit 1`,
    [hashToken(token)],
  )
  const session = result.rows[0]
  if (!session) return null
  await pool.query('update account_sessions set last_seen_at = now() where id = $1', [session.session_id])
  return session
}

function requestAccount(request, portal = 'student') {
  return String(request.query.account || request.body?.account || (allowDemoAccountFallback ? `${portal}_demo` : ''))
}

async function getCoursesForStudent(studentId) {
  const result = await pool.query(
    `select c.id, c.name, c.subject, c.grade, e.is_default, e.status
     from student_course_enrollments e
     join courses c on c.id = e.course_id
     where e.student_id = $1 and e.status = 'active'
     order by e.is_default desc, c.created_at, c.name`,
    [studentId],
  )
  if (result.rows.length) return result.rows
  const fallback = await pool.query(
    `select distinct c.id, c.name, c.subject, c.grade,
            (c.id = $2) as is_default,
            'active' as status
     from courses c
     where c.id = $2
        or exists (
          select 1 from study_plans p where p.student_id = $1 and p.course_id = c.id
        )
        or exists (
          select 1 from learning_metric_daily m where m.student_id = $1 and m.course_id = c.id
        )
     order by is_default desc, c.name`,
    [studentId, demoCourseId],
  )
  return fallback.rows
}

async function resolveCourseId(request, studentId) {
  const courses = await getCoursesForStudent(studentId)
  const requestedCourseId = String(request.query.courseId || request.body?.courseId || '').trim()
  if (requestedCourseId) {
    if (courses.some((course) => String(course.id) === requestedCourseId)) return requestedCourseId
    const error = new Error('course is not enrolled for this student')
    error.status = 403
    throw error
  }
  return courses.find((course) => course.is_default)?.id || courses[0]?.id || demoCourseId
}

async function resolveContext(request, portal = 'student') {
  if (portal !== 'student') {
    const error = new Error('this product is student-portal only')
    error.status = 404
    throw error
  }

  const session = await resolveSession(request)
  const username = session?.username || requestAccount(request, portal)
  if (!username) {
    const error = new Error('login required')
    error.status = 401
    throw error
  }
  const permission = await pool.query(
    `select *
     from v_account_portals
     where username = $1 and portal = $2 and can_read = true
     order by role
     limit 1`,
    [username, portal],
  )

  if (!permission.rows[0]) {
    const error = new Error('account has no permission for this portal')
    error.status = 403
    throw error
  }

  const studentId = permission.rows[0].user_id
  const courseId = await resolveCourseId(request, studentId)

  return {
    portal,
    username,
    accountId: permission.rows[0].account_id,
    sessionId: session?.session_id || null,
    currentUserId: permission.rows[0].user_id,
    studentId,
    courseId,
    permission: {
      portal,
      canRead: permission.rows[0].can_read,
      canWrite: permission.rows[0].can_write,
      canManage: permission.rows[0].can_manage,
    },
  }
}

function requireWrite(context) {
  if (!context.permission.canWrite) {
    const error = new Error('account has no write permission for this portal')
    error.status = 403
    throw error
  }
}

function clampInteger(value, fallback = 0, min = 0, max = Number.MAX_SAFE_INTEGER) {
  if (value === null || value === undefined || value === '') return fallback
  const number = Number(value)
  if (!Number.isFinite(number)) return fallback
  return Math.min(Math.max(Math.round(number), min), max)
}

function buildCompletionDefinition({ mode, source, targetMinutes, tag }) {
  const minutesPart = targetMinutes > 0 ? `完成约 ${targetMinutes} 分钟有效学习` : '完成一次有效学习活动'
  const evidencePart = mode === 'review' ? '完成复盘记录或错题订正' : '完成一次有效提问、练习提交或资源阅读记录'
  const sourcePart = source === 'recommendation' ? '推荐资源需产生阅读/练习行为' : '计划任务需回写任务状态'
  return `${minutesPart}，并且${evidencePart}；${sourcePart}${tag ? `。任务类型：${tag}` : ''}`
}

function toObject(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value
  return { value }
}

function normalizeAnswer(value) {
  return String(value || '')
    .replace(/\s+/g, '')
    .replace(/[，。；：、]/g, '')
    .toLowerCase()
}

const profileDimensions = [
  { key: 'knowledge', label: '课程知识掌握', average: 73, order: 1 },
  { key: 'application', label: '解题应用能力', average: 66, order: 2 },
  { key: 'thinking', label: '数学抽象能力', average: 62, order: 3 },
  { key: 'efficiency', label: '复习效率', average: 68, order: 4 },
  { key: 'attitude', label: '学习自律', average: 70, order: 5 },
  { key: 'input', label: '学习投入', average: 72, order: 6 },
]

function scoreAnswer(expectedAnswer, answerText) {
  const expected = normalizeAnswer(expectedAnswer)
  const actual = normalizeAnswer(answerText)
  if (!expected || !actual) return { isCorrect: false, score: 0 }
  const isCorrect = actual === expected || actual.includes(expected) || expected.includes(actual)
  return { isCorrect, score: isCorrect ? 100 : 45 }
}

function scoreToMastery(score) {
  if (score >= 90) return 4
  if (score >= 75) return 3
  if (score >= 55) return 2
  if (score >= 30) return 1
  return 0
}

function profileTypeFromScore(score) {
  if (score < 60) return '基础补弱型'
  if (score >= 85) return '进阶挑战型'
  return '稳定提升型'
}

function normalizeAnswerList(body) {
  const rawAnswers = Array.isArray(body?.answers) ? body.answers : []
  return rawAnswers
    .map((item) => ({
      questionId: String(item.questionId || item.id || '').trim(),
      answerText: String(item.answerText ?? item.answer ?? '').trim(),
      durationSeconds: item.durationSeconds === undefined ? null : clampInteger(item.durationSeconds, 0, 0, 24 * 60 * 60),
    }))
    .filter((item) => item.questionId && item.answerText)
}

async function fetchProfilePayload(context, studentId = context.studentId) {
  const [profileResult, masteryResult, diagnosisResult] = await Promise.all([
    pool.query(
      `select dimension_key, label, current_score, class_average, sort_order, updated_at
       from student_profile_scores
       where student_id = $1 and course_id = $2
       order by sort_order`,
      [studentId, context.courseId],
    ),
    pool.query(
      `select chapter, point_no, mastery_level
       from knowledge_mastery
       where student_id = $1 and course_id = $2
       order by chapter, point_no`,
      [studentId, context.courseId],
    ),
    pool.query(
      `select id, total_questions, correct_count, total_score, dimension_scores,
              weak_points, generated_profile, created_at
       from diagnosis_records
       where student_id = $1 and course_id = $2 and status = 'completed'
       order by created_at desc
       limit 1`,
      [studentId, context.courseId],
    ),
  ])

  const heatmapByChapter = new Map()
  for (const row of masteryResult.rows) {
    if (!heatmapByChapter.has(row.chapter)) {
      heatmapByChapter.set(row.chapter, Array.from({ length: 8 }, () => 0))
    }
    heatmapByChapter.get(row.chapter)[Number(row.point_no) - 1] = Number(row.mastery_level)
  }

  return {
    studentId,
    courseId: context.courseId,
    profileScores: profileResult.rows.map((row) => ({
      key: row.dimension_key,
      label: row.label,
      current: Number(row.current_score),
      average: Number(row.class_average),
      updatedAt: row.updated_at,
    })),
    knowledge: profileResult.rows.map((row) => [row.label, Number(row.current_score)]),
    heatmap: Array.from(heatmapByChapter.entries()).map(([chapter, values]) => ({ chapter, values })),
    latestDiagnosis: diagnosisResult.rows[0] ? {
      id: diagnosisResult.rows[0].id,
      totalQuestions: Number(diagnosisResult.rows[0].total_questions),
      correctCount: Number(diagnosisResult.rows[0].correct_count),
      totalScore: Number(diagnosisResult.rows[0].total_score),
      dimensionScores: diagnosisResult.rows[0].dimension_scores || {},
      weakPoints: diagnosisResult.rows[0].weak_points || [],
      generatedProfile: diagnosisResult.rows[0].generated_profile || {},
      createdAt: diagnosisResult.rows[0].created_at,
    } : null,
  }
}

async function applyGeneratedProfile(client, context, diagnosis) {
  const dimensionScores = diagnosis.dimensionScores || {}
  const totalScore = clampInteger(diagnosis.totalScore, 0, 0, 100)
  const completedAnswers = diagnosis.answers || []
  const answeredCount = Math.max(completedAnswers.length, 1)
  const avgDuration = completedAnswers.reduce((sum, item) => sum + Number(item.durationSeconds || 0), 0) / answeredCount
  const profileScores = {
    knowledge: Math.round(dimensionScores.knowledge ?? totalScore),
    application: Math.round(dimensionScores.application ?? Math.round((totalScore * 0.75) + 15)),
    thinking: Math.round(dimensionScores.thinking ?? Math.round((totalScore * 0.7) + 18)),
    efficiency: Math.max(35, Math.min(96, Math.round(totalScore + (avgDuration > 0 && avgDuration <= 180 ? 6 : avgDuration >= 420 ? -8 : 0)))),
    attitude: Math.max(40, Math.min(96, Math.round(70 + Math.min(answeredCount, 8) * 2 + (totalScore >= 80 ? 6 : 0)))),
    input: Math.max(40, Math.min(96, Math.round(65 + Math.min(answeredCount, 8) * 3))),
  }

  for (const dimension of profileDimensions) {
    await client.query(
      `insert into student_profile_scores
         (student_id, course_id, dimension_key, label, current_score, class_average, sort_order)
       values ($1, $2, $3, $4, $5, $6, $7)
       on conflict (student_id, course_id, dimension_key)
       do update set
         label = excluded.label,
         current_score = excluded.current_score,
         class_average = excluded.class_average,
         sort_order = excluded.sort_order,
         updated_at = now()`,
      [
        context.studentId,
        context.courseId,
        dimension.key,
        dimension.label,
        clampInteger(profileScores[dimension.key], 60, 0, 100),
        dimension.average,
        dimension.order,
      ],
    )
  }

  for (const answer of completedAnswers) {
    if (!answer.knowledgeTitle) continue
    await client.query(
      `insert into knowledge_mastery (student_id, course_id, chapter, point_no, mastery_level)
       values ($1, $2, $3, 1, $4)
       on conflict (student_id, course_id, chapter, point_no)
       do update set mastery_level = excluded.mastery_level, updated_at = now()`,
      [context.studentId, context.courseId, answer.knowledgeTitle, scoreToMastery(answer.score)],
    )
  }

  const weakTitles = diagnosis.weakPoints || []
  if (weakTitles.length) {
    await client.query(
      `insert into intervention_suggestions
         (student_id, course_id, audience, title, summary, action_label, priority, status)
       values ($1, $2, 'student', '诊断发现薄弱点', $3, '生成补弱计划', 95, 'pending')`,
      [
        context.studentId,
        context.courseId,
        `本次诊断显示 ${weakTitles.slice(0, 3).join('、')} 需要优先巩固，建议先安排基础讲解和低阶练习。`,
      ],
    )
  }

  return {
    type: profileTypeFromScore(totalScore),
    scores: profileScores,
    weakPoints: weakTitles,
    summary: totalScore >= 85
      ? '诊断表现较好，可以加入进阶题和综合应用任务。'
      : totalScore >= 60
        ? '基础链路基本可用，建议围绕错误知识点做专项巩固。'
        : '基础概念和例题迁移仍需补强，建议先做低难度讲解和分步练习。',
  }
}

function addDays(date, days) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function isoDateFrom(value, fallback = new Date()) {
  const parsed = value ? new Date(value) : fallback
  if (Number.isNaN(parsed.getTime())) return toIsoDate(fallback)
  return toIsoDate(parsed)
}

function minutesToEndTime(startTime, minutes) {
  const [hour, minute] = String(startTime || '20:00').split(':').map((part) => Number.parseInt(part, 10) || 0)
  const date = new Date(Date.UTC(2000, 0, 1, hour, minute + Number(minutes || 0)))
  return date.toISOString().slice(11, 16)
}

function modePlanStrategy(modeKey) {
  const strategies = {
    course_mastery: { label: '课程掌握', taskNoun: '章节巩固', minutes: 25, focus: '按章节薄弱点补齐知识链路' },
    exam_sprint: { label: '考试冲刺', taskNoun: '限时训练', minutes: 30, focus: '优先处理高频题型和错题模式' },
    research_project: { label: '科研项目', taskNoun: '迁移任务', minutes: 35, focus: '把课程工具迁移到建模或论文阅读任务' },
    career_skill: { label: '职业能力', taskNoun: '表达训练', minutes: 25, focus: '把课程能力转化为作品集和面试表达' },
  }
  return strategies[modeKey] || strategies.course_mastery
}

function lowestProfileDimensions(rows, limit = 2) {
  return rows
    .map((row) => ({ key: row.dimension_key, label: row.label, score: Number(row.current_score || 0) }))
    .sort((a, b) => a.score - b.score)
    .slice(0, limit)
}

function weakestMastery(rows, limit = 3) {
  const chapters = new Map()
  for (const row of rows) {
    if (!chapters.has(row.chapter)) chapters.set(row.chapter, { chapter: row.chapter, total: 0, count: 0 })
    const item = chapters.get(row.chapter)
    item.total += Number(row.mastery_level || 0)
    item.count += 1
  }
  return Array.from(chapters.values())
    .map((item) => ({ chapter: item.chapter, average: item.count ? item.total / item.count : 0 }))
    .sort((a, b) => a.average - b.average)
    .slice(0, limit)
}

async function buildPlanEngineContext(context) {
  const [modeResult, profileResult, masteryResult, metricResult, suggestionResult, resourcesResult] = await Promise.all([
    pool.query(
      `select *
       from student_goal_modes
       where student_id = $1 and course_id = $2
       order by is_active desc, updated_at desc
       limit 1`,
      [context.studentId, context.courseId],
    ),
    pool.query(
      `select dimension_key, label, current_score, class_average
       from student_profile_scores
       where student_id = $1 and course_id = $2
       order by sort_order`,
      [context.studentId, context.courseId],
    ),
    pool.query(
      `select chapter, point_no, mastery_level
       from knowledge_mastery
       where student_id = $1 and course_id = $2
       order by chapter, point_no`,
      [context.studentId, context.courseId],
    ),
    pool.query(
      `select metric_date, study_minutes, accuracy_rate, completion_rate, questions_done, mistakes_fixed
       from learning_metric_daily
       where student_id = $1 and course_id = $2
       order by metric_date desc
       limit 7`,
      [context.studentId, context.courseId],
    ),
    pool.query(
      `select title, summary, action_label, priority
       from intervention_suggestions
       where student_id = $1 and course_id = $2 and status = 'pending'
       order by priority desc, created_at desc
       limit 5`,
      [context.studentId, context.courseId],
    ),
    pool.query(
      `select r.id, r.title, r.kind, r.duration_minutes, r.difficulty,
              coalesce(rr.reason, r.metadata->>'summary', r.difficulty, '匹配当前画像和目标模式') as reason,
              coalesce(rr.match_score, 70) as match_score
       from learning_resources r
       join courses c on c.id = $2
       left join student_resource_recommendations rr on rr.resource_id = r.id and rr.student_id = $1
       where r.subject = c.subject and r.grade = c.grade and r.status = 'active'
       order by coalesce(rr.match_score, 0) desc, r.created_at desc
       limit 8`,
      [context.studentId, context.courseId],
    ),
  ])

  const latestMetric = metricResult.rows[0] || {}
  const lowDimensions = lowestProfileDimensions(profileResult.rows)
  const weakChapters = weakestMastery(masteryResult.rows)
  const activeMode = modeResult.rows[0] || null
  return {
    mode: activeMode,
    strategy: modePlanStrategy(activeMode?.mode_key),
    lowDimensions,
    weakChapters,
    latestMetric: {
      accuracyRate: Number(latestMetric.accuracy_rate || 0),
      completionRate: Number(latestMetric.completion_rate || 0),
      studyMinutes: Number(latestMetric.study_minutes || 0),
    },
    suggestions: suggestionResult.rows,
    resources: resourcesResult.rows,
  }
}

function buildGeneratedPlanDrafts(engine, options = {}) {
  const startDate = isoDateFrom(options.startDate || options.planDate)
  const days = clampInteger(options.days, 7, 1, 14)
  const startHour = String(options.startTime || '20:00')
  const dailyMinutes = clampInteger(options.dailyMinutes, engine.strategy.minutes, 10, 120)
  const weakChapter = engine.weakChapters[0]?.chapter || engine.lowDimensions[0]?.label || '当前薄弱模块'
  const secondWeak = engine.weakChapters[1]?.chapter || engine.lowDimensions[1]?.label || '综合应用能力'
  const resources = engine.resources.length ? engine.resources : []
  const baseReason = `${engine.strategy.label}模式：${engine.strategy.focus}；优先处理 ${weakChapter}。`
  const drafts = []

  const templates = [
    {
      title: `${weakChapter}基础补强`,
      tag: 'AI补弱',
      detail: `${baseReason} 从定义、典型例题和常见错误开始，先补齐最低分维度。`,
      minutes: dailyMinutes,
    },
    {
      title: `${weakChapter}${engine.strategy.taskNoun}`,
      tag: engine.strategy.taskNoun,
      detail: `结合推荐资源完成专项训练，目标是把薄弱知识点从“会听懂”推进到“能独立做题”。`,
      minutes: dailyMinutes,
    },
    {
      title: `${secondWeak}错题复盘`,
      tag: '错题复盘',
      detail: `复盘最近诊断和练习中的错误，把错因归类为概念、条件、计算或表达问题。`,
      minutes: Math.max(15, dailyMinutes - 5),
    },
    {
      title: `${engine.strategy.label}阶段小测`,
      tag: '测评反馈',
      detail: `用短测检查本轮计划是否提高正确率，并为下一轮计划调整提供依据。`,
      minutes: Math.max(20, dailyMinutes),
    },
  ]

  for (let index = 0; index < days; index += 1) {
    const template = templates[index % templates.length]
    const resource = resources[index % Math.max(resources.length, 1)] || null
    const planDate = isoDateFrom(addDays(new Date(startDate), index))
    const startTime = startHour
    const minutes = resource?.duration_minutes ? clampInteger(resource.duration_minutes, template.minutes, 5, 120) : template.minutes
    drafts.push({
      planDate,
      startTime,
      endTime: minutesToEndTime(startTime, minutes),
      title: resource && index % 2 === 1 ? `${template.title}：${resource.title}` : template.title,
      detail: `${template.detail}${resource ? ` 推荐资源：${resource.title}；原因：${resource.reason}` : ''}`,
      tag: template.tag,
      estimatedMinutes: minutes,
      source: 'ai',
      sortOrder: index + 1,
      resourceId: resource?.id || null,
      reason: resource ? resource.reason : baseReason,
    })
  }
  return drafts
}

function buildAdjustedPlanDrafts(engine, pendingPlans, options = {}) {
  const planDate = isoDateFrom(options.planDate || addDays(new Date(), 1))
  const startTime = String(options.startTime || '20:00')
  const lowAccuracy = engine.latestMetric.accuracyRate && engine.latestMetric.accuracyRate < 78
  const lowCompletion = engine.latestMetric.completionRate && engine.latestMetric.completionRate < 70
  const weakChapter = engine.weakChapters[0]?.chapter || '当前薄弱模块'
  const pendingTitle = pendingPlans[0]?.title || `${weakChapter}未完成任务`
  const resource = engine.resources[0] || null
  const reasonParts = []
  if (lowAccuracy) reasonParts.push(`最近正确率 ${engine.latestMetric.accuracyRate}% 偏低`)
  if (lowCompletion) reasonParts.push(`计划完成率 ${engine.latestMetric.completionRate}% 偏低`)
  if (pendingPlans.length) reasonParts.push(`仍有 ${pendingPlans.length} 个未完成任务`)
  if (!reasonParts.length) reasonParts.push('近期表现稳定，安排轻量巩固和阶段检测')
  const reason = reasonParts.join('；')

  return [
    {
      planDate,
      startTime,
      endTime: minutesToEndTime(startTime, 20),
      title: `${weakChapter}补弱回炉`,
      detail: `${reason}。先回到薄弱模块的基础讲解，降低后续练习阻力。${resource ? ` 推荐资源：${resource.title}` : ''}`,
      tag: '动态调整',
      estimatedMinutes: 20,
      source: 'ai',
      sortOrder: 1,
      resourceId: resource?.id || null,
      reason,
    },
    {
      planDate,
      startTime: minutesToEndTime(startTime, 25),
      endTime: minutesToEndTime(startTime, 50),
      title: `续做：${pendingTitle}`,
      detail: `${reason}。保留未完成任务，但压缩为可完成的小块，并要求产出订正记录。`,
      tag: '续做任务',
      estimatedMinutes: 25,
      source: 'ai',
      sortOrder: 2,
      resourceId: pendingPlans[0]?.resource_id || null,
      reason,
    },
  ]
}

async function insertPlanDrafts(client, context, drafts) {
  const inserted = []
  for (const draft of drafts) {
    const result = await client.query(
      `insert into study_plans
         (student_id, course_id, resource_id, plan_date, start_time, end_time,
          title, detail, tag, estimated_minutes, status, source, sort_order, metadata)
       values ($1, $2, $3, $4::date, $5::time, nullif($6, '')::time,
               $7, $8, $9, $10, 'pending', $11, $12, $13::jsonb)
       returning id, resource_id, source, metadata, $14::text as reason,
                 to_char(start_time, 'HH24:MI') as start_time,
                 to_char(end_time, 'HH24:MI') as end_time,
                 title, detail, tag, estimated_minutes, status`,
      [
        context.studentId,
        context.courseId,
        draft.resourceId,
        draft.planDate,
        draft.startTime,
        draft.endTime,
        draft.title,
        draft.detail,
        draft.tag,
        draft.estimatedMinutes,
        draft.source,
        draft.sortOrder,
        JSON.stringify(draft.metadata || {}),
        draft.reason,
      ],
    )
    inserted.push(formatStudyPlan(result.rows[0]))
  }
  return inserted
}

async function saveUiState(context, pageKey, stateKey, stateValue) {
  const result = await pool.query(
    `insert into student_ui_state
       (student_id, course_id, account_id, portal, page_key, state_key, state_value)
     values ($1, $2, $3, $4, $5, $6, $7)
     on conflict (student_id, course_id, portal, page_key, state_key)
     do update set
       account_id = excluded.account_id,
       state_value = excluded.state_value,
       updated_at = now()
     returning id, page_key, state_key, state_value, updated_at`,
    [context.studentId, context.courseId, context.accountId, context.portal, pageKey, stateKey, toObject(stateValue)],
  )
  return result.rows[0]
}

function groupUiState(rows) {
  return rows.reduce((state, row) => {
    if (!state[row.page_key]) state[row.page_key] = {}
    state[row.page_key][row.state_key] = row.state_value || {}
    return state
  }, {})
}

function formatGoalMode(row) {
  return {
    id: row.id,
    modeKey: row.mode_key,
    title: row.title,
    focusLabel: row.focus_label,
    description: row.description,
    successMetric: row.success_metric,
    targetDate: row.target_date,
    weeklyHours: Number(row.weekly_hours),
    progress: Number(row.progress),
    isActive: row.is_active,
    metrics: row.metrics || {},
  }
}

function formatResource(row) {
  const metadata = row.metadata || {}
  const latestOcrJob = row.ocr_job_status ? {
    status: row.ocr_job_status,
    pageStart: row.ocr_job_page_start ? Number(row.ocr_job_page_start) : null,
    pageEnd: row.ocr_job_page_end ? Number(row.ocr_job_page_end) : null,
    processedPages: Number(row.ocr_job_processed_pages || 0),
    totalPages: Number(row.ocr_job_total_pages || 0),
    outputChunkCount: Number(row.ocr_job_output_chunk_count || 0),
    averageConfidence: row.ocr_job_average_confidence === null || row.ocr_job_average_confidence === undefined ? null : Number(row.ocr_job_average_confidence),
    errorMessage: row.ocr_job_error_message || '',
    createdAt: row.ocr_job_created_at || null,
    finishedAt: row.ocr_job_finished_at || null,
  } : null
  return {
    id: row.id,
    title: row.title,
    kind: row.kind,
    subject: row.subject,
    grade: row.grade,
    minutes: `${row.duration_minutes || 10} 分钟`,
    reason: row.reason || metadata.summary || '匹配当前学习画像',
    stars: Number(metadata.stars || Math.max(1, Math.round(Number(row.match_score || 80) / 30))),
    action: row.action_label,
    color: row.color,
    resourceCode: row.resource_code,
    matchScore: Number(row.match_score || 80),
    difficulty: row.difficulty,
    openMode: metadata.storage || (metadata.externalUrl ? 'external-link' : metadata.relativePath ? 'local-file' : 'database'),
    externalUrl: metadata.externalUrl || null,
    relativePath: metadata.relativePath || row.content_uri || null,
    pageCount: metadata.pageCount || row.page_count || null,
    textLayer: Boolean(metadata.textLayer || row.text_layer),
    ocrRequired: Boolean(metadata.ocrRequired || row.ocr_required),
    parseStatus: row.parse_status || null,
    chunkCount: Number(row.chunk_count || 0),
    ocrStatus: metadata.ocrStatus || row.ocr_job_status || null,
    ocrPagesDone: Number(metadata.ocrPagesDone || row.ocr_job_processed_pages || 0),
    ocrChunkCount: Number(metadata.ocrChunkCount || row.ocr_job_output_chunk_count || row.chunk_count || 0),
    ocrAverageConfidence: metadata.ocrAverageConfidence ? Number(metadata.ocrAverageConfidence) : latestOcrJob?.averageConfidence ?? null,
    latestOcrJob,
    sourceCountry: metadata.sourceCountry || null,
    distillationStatus: metadata.distillationStatus || null,
    generatedQuestionCount: Number(metadata.generatedQuestionCount || 0),
    searchSnippet: row.search_snippet || '',
    searchPageRef: row.search_page_ref || '',
    searchHitCount: Number(row.search_hit_count || 0),
  }
}

async function queryResources(context, options = {}) {
  const keyword = String(options.keyword || '').trim()
  const filter = String(options.filter || '全部').trim()
  const sort = String(options.sort || '智能匹配').trim()
  const limit = Math.min(Math.max(Number(options.limit || 80), 1), 200)
  const result = await pool.query(
    `select r.id, r.resource_code, r.title, r.kind, r.subject, r.grade, r.duration_minutes, r.color, r.action_label,
            r.difficulty, r.metadata, v.content_uri, v.parse_status, v.raw_metadata,
            oj.status as ocr_job_status, oj.page_start as ocr_job_page_start, oj.page_end as ocr_job_page_end,
            oj.processed_pages as ocr_job_processed_pages, oj.total_pages as ocr_job_total_pages,
            oj.output_chunk_count as ocr_job_output_chunk_count, oj.average_confidence as ocr_job_average_confidence,
            oj.error_message as ocr_job_error_message, oj.created_at as ocr_job_created_at, oj.finished_at as ocr_job_finished_at,
            coalesce(rr.reason, '匹配当前学习画像') as reason,
            coalesce(rr.match_score, 80) as match_score,
            coalesce(ch.chunk_count, 0) as chunk_count,
            coalesce(hit.search_hit_count, 0) as search_hit_count,
            hit.search_page_ref,
            hit.search_snippet
     from learning_resources r
     left join lateral (
       select reason, match_score
       from student_resource_recommendations
       where resource_id = r.id and student_id = $1
       order by match_score desc, created_at desc
       limit 1
     ) rr on true
     left join lateral (
       select content_uri, parse_status, raw_metadata
       from learning_resource_versions
       where resource_id = r.id
       order by version_no desc, created_at desc
       limit 1
     ) v on true
     left join lateral (
       select count(*)::int as chunk_count
       from resource_chunks
       where resource_id = r.id
     ) ch on true
     left join lateral (
       select status, page_start, page_end, processed_pages, total_pages, output_chunk_count,
              average_confidence, error_message, created_at, finished_at
       from resource_ocr_jobs
       where resource_id = r.id
       order by created_at desc
       limit 1
     ) oj on true
     left join lateral (
       select count(*)::int as search_hit_count,
              (array_agg(page_ref order by chunk_no))[1] as search_page_ref,
              left((array_agg(body order by chunk_no))[1], 220) as search_snippet
       from resource_chunks
       where resource_id = r.id
         and $3 <> ''
         and (heading ilike '%' || $3 || '%' or body ilike '%' || $3 || '%' or page_ref ilike '%' || $3 || '%')
     ) hit on true
     where r.subject = (select subject from courses where id = $2)
       and r.grade = (select grade from courses where id = $2)
       and r.status = 'active'
       and (
         $3 = '' or
         r.title ilike '%' || $3 || '%' or
         r.kind ilike '%' || $3 || '%' or
         r.difficulty ilike '%' || $3 || '%' or
         r.metadata::text ilike '%' || $3 || '%' or
         rr.reason ilike '%' || $3 || '%' or
         coalesce(hit.search_hit_count, 0) > 0
       )
       and (
         $4 = '' or $4 = '全部' or r.kind = $4 or
         ($4 = '补弱' and (rr.reason ilike '%薄弱%' or rr.reason ilike '%错题%' or rr.reason ilike '%巩固%' or r.difficulty ilike '%薄弱%'))
       )
     order by
       case when $3 <> '' and coalesce(hit.search_hit_count, 0) > 0 then 0 else 1 end,
       case when $5 = '难度' then coalesce((r.metadata->>'stars')::int, 3) end asc,
       case when $5 = '时长' then r.duration_minutes end asc,
       case when $5 = '资源类型' then r.kind end asc,
       coalesce(rr.match_score, 0) desc,
       r.created_at desc,
       r.id
     limit $6`,
    [context.studentId, context.courseId, keyword, filter, sort, limit],
  )
  return result.rows.map(formatResource)
}

app.get('/api/health', async (_request, response) => {
  try {
    await pool.query('select 1')
    response.json({ ok: true, database: 'connected' })
  } catch (error) {
    response.status(500).json({ ok: false, error: error.message })
  }
})

function setSessionCookie(response, token, expiresAt) {
  const maxAge = Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000))
  response.setHeader('Set-Cookie', `${sessionCookieName}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}`)
}

function clearSessionCookie(response) {
  response.setHeader('Set-Cookie', `${sessionCookieName}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`)
}

async function buildAuthPayload(account, session = null) {
  const portals = await pool.query(
    `select portal, can_read, can_write, can_manage
     from account_portal_permissions
     where account_id = $1
     order by portal`,
    [account.id],
  )
  const student = await pool.query(
    `select u.id, u.display_name, u.grade, u.avatar_label
     from account_user_links l
     join app_users u on u.id = l.user_id
     where l.account_id = $1 and u.role = 'student'
     order by l.relationship = 'self' desc
     limit 1`,
    [account.id],
  )
  const courses = student.rows[0] ? await getCoursesForStudent(student.rows[0].id) : []
  return {
    account: { id: account.id, username: account.username, defaultPortal: account.default_portal },
    student: student.rows[0] || null,
    portals: portals.rows.map((row) => ({
      portal: row.portal,
      canRead: row.can_read,
      canWrite: row.can_write,
      canManage: row.can_manage,
    })),
    courses,
    defaultCourseId: courses.find((course) => course.is_default)?.id || courses[0]?.id || demoCourseId,
    session,
  }
}

app.post('/api/auth/login', async (request, response, next) => {
  try {
    const { username, password } = request.body || {}
    if (!username || !password) {
      response.status(400).json({ error: 'username and password are required' })
      return
    }

    const result = await pool.query(
      `select id, username, default_portal
       from user_accounts
       where username = $1
         and status = 'active'
         and password_hash = crypt($2, password_hash)`,
      [username, password],
    )

    if (!result.rows[0]) {
      response.status(401).json({ error: 'invalid credentials' })
      return
    }

    await pool.query('update user_accounts set last_login_at = now() where id = $1', [result.rows[0].id])

    const token = crypto.randomBytes(48).toString('base64url')
    const expiresAt = new Date(Date.now() + sessionDays * 24 * 60 * 60 * 1000)
    const session = await pool.query(
      `insert into account_sessions (account_id, token_hash, user_agent, expires_at)
       values ($1, $2, $3, $4)
       returning id, expires_at, created_at`,
      [result.rows[0].id, hashToken(token), String(request.headers['user-agent'] || '').slice(0, 240), expiresAt],
    )
    setSessionCookie(response, token, session.rows[0].expires_at)
    const payload = await buildAuthPayload(result.rows[0], {
      id: session.rows[0].id,
      token,
      expiresAt: session.rows[0].expires_at,
    })
    response.json(payload)
  } catch (error) {
    next(error)
  }
})

app.get('/api/auth/me', async (request, response, next) => {
  try {
    const session = await resolveSession(request)
    if (!session) {
      response.status(401).json({ error: 'login required' })
      return
    }
    const payload = await buildAuthPayload({
      id: session.account_id,
      username: session.username,
      default_portal: session.default_portal,
    }, {
      id: session.session_id,
      expiresAt: session.expires_at,
    })
    response.json(payload)
  } catch (error) {
    next(error)
  }
})

app.delete('/api/auth/session', async (request, response, next) => {
  try {
    const token = requestToken(request)
    if (token) {
      await pool.query(
        `update account_sessions
         set revoked_at = now()
         where token_hash = $1 and revoked_at is null`,
        [hashToken(token)],
      )
    }
    clearSessionCookie(response)
    response.json({ ok: true })
  } catch (error) {
    next(error)
  }
})

app.post('/api/auth/logout', async (request, response, next) => {
  try {
    const token = requestToken(request)
    if (token) {
      await pool.query(
        `update account_sessions
         set revoked_at = now()
         where token_hash = $1 and revoked_at is null`,
        [hashToken(token)],
      )
    }
    clearSessionCookie(response)
    response.json({ ok: true })
  } catch (error) {
    next(error)
  }
})

app.get('/api/courses', async (request, response, next) => {
  try {
    const context = await resolveContext(request, String(request.query.portal || 'student'))
    response.json({ courses: await getCoursesForStudent(context.studentId), activeCourseId: context.courseId })
  } catch (error) {
    next(error)
  }
})

function toIsoDate(date) {
  return date.toISOString().slice(0, 10)
}

function reportRange(period) {
  const normalized = ['week', 'month', 'term'].includes(period) ? period : 'week'
  const end = new Date()
  const start = new Date(end)
  start.setDate(end.getDate() - (normalized === 'term' ? 119 : normalized === 'month' ? 29 : 6))
  return { period: normalized, start: toIsoDate(start), end: toIsoDate(end) }
}

async function buildReportSummary(context, period = 'week') {
  const range = reportRange(period)
  const [metrics, plans, attempts, sessions, usages] = await Promise.all([
    pool.query(
      `select metric_date::text as metric_date, study_minutes, accuracy_rate, completion_rate, questions_done, mistakes_fixed
       from learning_metric_daily
       where student_id = $1 and course_id = $2 and metric_date between $3::date and $4::date
       order by metric_date`,
      [context.studentId, context.courseId, range.start, range.end],
    ),
    pool.query(
      `select count(*)::int as total_count,
              count(*) filter (where status = 'done')::int as done_count,
              coalesce(sum(estimated_minutes) filter (where status = 'done'), 0)::int as planned_done_minutes
       from study_plans
       where student_id = $1 and course_id = $2 and plan_date between $3::date and $4::date`,
      [context.studentId, context.courseId, range.start, range.end],
    ),
    pool.query(
      `select coalesce(nullif(mistake_type, ''), 'needs_review') as mistake_type, count(*)::int as count
       from student_question_attempts
       where student_id = $1 and course_id = $2
         and attempted_at::date between $3::date and $4::date
         and coalesce(is_correct, false) = false
       group by coalesce(nullif(mistake_type, ''), 'needs_review')
       order by count desc, mistake_type`,
      [context.studentId, context.courseId, range.start, range.end],
    ),
    pool.query(
      `select status, count(*)::int as count, coalesce(sum(completed_minutes), 0)::int as completed_minutes
       from student_learning_sessions
       where student_id = $1 and course_id = $2 and started_at::date between $3::date and $4::date
       group by status`,
      [context.studentId, context.courseId, range.start, range.end],
    ),
    pool.query(
      `select status, count(*)::int as count
       from student_resource_usage
       where student_id = $1 and course_id = $2 and created_at::date between $3::date and $4::date
       group by status`,
      [context.studentId, context.courseId, range.start, range.end],
    ),
  ])
  const planRow = plans.rows[0] || { total_count: 0, done_count: 0, planned_done_minutes: 0 }
  const metricRows = metrics.rows
  const studyMinutes = metricRows.reduce((sum, row) => sum + Number(row.study_minutes || 0), 0)
  const accuracyRows = metricRows.filter((row) => row.accuracy_rate !== null && row.accuracy_rate !== undefined)
  const averageAccuracy = accuracyRows.length
    ? Math.round(accuracyRows.reduce((sum, row) => sum + Number(row.accuracy_rate || 0), 0) / accuracyRows.length)
    : 0
  const completionRate = Number(planRow.total_count)
    ? Math.round((Number(planRow.done_count) / Number(planRow.total_count)) * 100)
    : Math.round(metricRows.at(-1)?.completion_rate || 0)
  const mistakeCount = attempts.rows.reduce((sum, row) => sum + Number(row.count || 0), 0)
  return {
    range,
    summary: {
      studyMinutes,
      studyHours: Number((studyMinutes / 60).toFixed(1)),
      completionRate,
      averageAccuracy,
      mistakeCount,
      totalPlans: Number(planRow.total_count || 0),
      completedPlans: Number(planRow.done_count || 0),
    },
    trend: metricRows.map((row) => ({
      date: row.metric_date,
      studyMinutes: Number(row.study_minutes || 0),
      accuracyRate: Number(row.accuracy_rate || 0),
      completionRate: Number(row.completion_rate || 0),
      questionsDone: Number(row.questions_done || 0),
      mistakesFixed: Number(row.mistakes_fixed || 0),
    })),
    mistakeBuckets: attempts.rows.map((row) => ({ mistakeType: row.mistake_type, count: Number(row.count || 0) })),
    sessions: sessions.rows.map((row) => ({ status: row.status, count: Number(row.count || 0), completedMinutes: Number(row.completed_minutes || 0) })),
    resources: usages.rows.map((row) => ({ status: row.status, count: Number(row.count || 0) })),
  }
}

const studentAgentDefinitions = [
  { key: 'profile_analyzer', name: '画像分析智能体', capability: '分析画像维度、目标模式和学习风险' },
  { key: 'knowledge_mapper', name: '课程知识智能体', capability: '定位薄弱知识点与知识库命中' },
  { key: 'resource_recommender', name: '资源推荐智能体', capability: '匹配个性化资源和练习材料' },
  { key: 'resource_reviewer', name: '资源评审智能体', capability: '检查资源可用性、难度和适配度' },
  { key: 'planner', name: '规划智能体', capability: '生成下一步计划和动态调整建议' },
  { key: 'tutor', name: '辅导智能体', capability: '结合画像与知识库给出学习引导' },
  { key: 'evaluator', name: '评估智能体', capability: '汇总学习效果并形成闭环建议' },
]

function formatAgentLog(row) {
  return {
    id: row.id,
    taskId: row.task_id,
    agentKey: row.agent_key,
    agentName: row.agent_name,
    stepNo: Number(row.step_no),
    status: row.status,
    inputSummary: row.input_summary,
    outputSummary: row.output_summary,
    suggestion: row.suggestion,
    confidence: Number(row.confidence),
    durationMs: Number(row.duration_ms),
    metadata: row.metadata || {},
    startedAt: row.started_at,
    completedAt: row.completed_at,
    createdAt: row.created_at,
  }
}

function joinLabels(items, fallback = '暂无明显薄弱项') {
  const labels = items.map((item) => item.label || item.chapter || item.title).filter(Boolean)
  return labels.length ? labels.join('、') : fallback
}

function summarizeResource(resource) {
  if (!resource) return '暂无可用资源'
  return `${resource.title}${resource.kind ? `（${resource.kind}）` : ''}`
}

async function buildStudentAgentContext(context, requestBody = {}) {
  const engine = await buildPlanEngineContext(context)
  const report = await buildReportSummary(context, 'week')
  const query = String(requestBody.query || engine.weakChapters[0]?.chapter || engine.lowDimensions[0]?.label || '学习计划').trim()
  const knowledge = await queryKnowledgeSearch(context, query, { limit: 6 })
  const pendingPlans = await pool.query(
    `select id, title, detail, tag, status, plan_date
     from study_plans
     where student_id = $1
       and course_id = $2
       and status in ('pending', 'active')
       and plan_date between current_date - interval '2 days' and current_date + interval '7 days'
     order by case when status = 'active' then 0 else 1 end, plan_date, sort_order, start_time
     limit 6`,
    [context.studentId, context.courseId],
  )
  return {
    engine,
    report,
    query,
    knowledge,
    pendingPlans: pendingPlans.rows,
    resources: engine.resources,
  }
}

function buildStudentAgentSteps(agentContext) {
  const { engine, report, query, knowledge, pendingPlans, resources } = agentContext
  const weakChapter = engine.weakChapters[0]?.chapter || '当前薄弱模块'
  const lowDimension = engine.lowDimensions[0]?.label || '综合能力'
  const topResource = resources[0] || null
  const secondResource = resources[1] || null
  const topKnowledge = knowledge.hits[0] || null
  const completionRate = report.summary.completionRate || engine.latestMetric.completionRate || 0
  const accuracyRate = report.summary.averageAccuracy || engine.latestMetric.accuracyRate || 0
  const nextAction = accuracyRate < 75 || completionRate < 70 ? '动态调整计划并追加补弱任务' : '保持当前节奏并安排阶段小测'

  return [
    {
      key: 'profile_analyzer',
      name: '画像分析智能体',
      inputSummary: `读取 ${engine.strategy.label} 目标、画像维度和最近 7 天学习指标。`,
      outputSummary: `最低画像维度为 ${joinLabels(engine.lowDimensions.slice(0, 2))}，周正确率 ${accuracyRate || 0}%，完成率 ${completionRate || 0}%。`,
      suggestion: `优先围绕 ${lowDimension} 做低门槛补弱，避免直接进入高难综合题。`,
      confidence: 0.86,
      metadata: { lowDimensions: engine.lowDimensions, latestMetric: engine.latestMetric, modeKey: engine.mode?.mode_key || null },
    },
    {
      key: 'knowledge_mapper',
      name: '课程知识智能体',
      inputSummary: `用关键词“${query}”检索课程知识库，并结合掌握度热力图。`,
      outputSummary: `薄弱章节集中在 ${joinLabels(engine.weakChapters)}；知识库命中 ${knowledge.hits.length} 条，首条为 ${topKnowledge?.title || '暂无命中'}。`,
      suggestion: `下一轮学习先覆盖 ${weakChapter} 的定义、条件识别和典型例题。`,
      confidence: knowledge.hits.length ? 0.82 : 0.62,
      metadata: { query, keywords: knowledge.keywords, hitCount: knowledge.hits.length, topHit: topKnowledge },
    },
    {
      key: 'resource_recommender',
      name: '资源推荐智能体',
      inputSummary: `从课程资源和推荐分数中筛选适合 ${weakChapter} 的材料。`,
      outputSummary: `优先推荐 ${summarizeResource(topResource)}${secondResource ? `，备选 ${summarizeResource(secondResource)}` : ''}。`,
      suggestion: topResource ? `把《${topResource.title}》绑定到下一条补弱计划，学习后立即做 1 组练习。` : '先补充本课程可用资源，再生成资源型学习计划。',
      confidence: topResource ? 0.8 : 0.55,
      metadata: { resources: resources.slice(0, 3) },
    },
    {
      key: 'resource_reviewer',
      name: '资源评审智能体',
      inputSummary: `检查推荐资源的状态、难度、时长和 OCR/切片可用性。`,
      outputSummary: topResource
        ? `资源状态可用，难度为 ${topResource.difficulty || '未标注'}，预计 ${topResource.duration_minutes || 20} 分钟。`
        : '未发现可评审的高匹配资源。',
      suggestion: topResource ? '资源可进入学生端推荐，但应搭配短测验证学习效果。' : '先使用知识点和题目生成轻量练习。',
      confidence: topResource ? 0.76 : 0.5,
      metadata: { reviewedResourceId: topResource?.id || null, difficulty: topResource?.difficulty || null },
    },
    {
      key: 'planner',
      name: '规划智能体',
      inputSummary: `读取 ${pendingPlans.length} 个待完成计划、目标模式和薄弱点。`,
      outputSummary: `建议动作：${nextAction}；当前待完成任务 ${pendingPlans.length} 个。`,
      suggestion: pendingPlans.length ? `先压缩续做“${pendingPlans[0].title}”，再追加 ${weakChapter} 补弱任务。` : `生成 ${weakChapter} 的 3 天微计划。`,
      confidence: 0.84,
      metadata: { pendingPlans: pendingPlans.slice(0, 4), nextAction },
    },
    {
      key: 'tutor',
      name: '辅导智能体',
      inputSummary: `读取最近辅导能力、知识库命中和学生画像。`,
      outputSummary: `辅导策略应保持大学课程语境，围绕 ${weakChapter} 做分步引导，不直接给最终答案。`,
      suggestion: `在智能辅导中优先追问“你卡在概念、建模还是计算步骤”，再给局部提示。`,
      confidence: 0.78,
      metadata: { tutorMode: 'rag_guided', knowledgeHitCount: knowledge.hits.length },
    },
    {
      key: 'evaluator',
      name: '评估智能体',
      inputSummary: `汇总周报告、计划状态、资源使用和练习表现。`,
      outputSummary: `本周学习 ${report.summary.studyMinutes} 分钟，完成 ${report.summary.completedPlans}/${report.summary.totalPlans} 个计划，错题 ${report.summary.mistakeCount} 个。`,
      suggestion: `${nextAction}；下次评估重点看 ${weakChapter} 正确率和计划完成率是否提升。`,
      confidence: 0.81,
      metadata: { report: report.summary, nextAction },
    },
  ].map((step, index) => ({
    ...step,
    stepNo: index + 1,
    status: 'completed',
    durationMs: 90 + index * 35 + Math.round((step.confidence || 0.7) * 30),
  }))
}

async function insertAgentTaskLogs(client, context, taskId, steps) {
  const inserted = []
  for (const step of steps) {
    const result = await client.query(
      `insert into agent_task_logs
         (task_id, student_id, course_id, account_id, agent_key, agent_name, step_no, status,
          input_summary, output_summary, suggestion, confidence, duration_ms, metadata, completed_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb, now())
       returning *`,
      [
        taskId,
        context.studentId,
        context.courseId,
        context.accountId,
        step.key,
        step.name,
        step.stepNo,
        step.status,
        step.inputSummary,
        step.outputSummary,
        step.suggestion,
        step.confidence,
        step.durationMs,
        JSON.stringify(step.metadata || {}),
      ],
    )
    inserted.push(result.rows[0])
  }
  return inserted
}

function buildAgentFinalRecommendation(logs) {
  const planner = logs.find((log) => log.agent_key === 'planner')
  const evaluator = logs.find((log) => log.agent_key === 'evaluator')
  const knowledge = logs.find((log) => log.agent_key === 'knowledge_mapper')
  return {
    title: '学生端多智能体协同建议',
    summary: evaluator?.suggestion || planner?.suggestion || '继续跟踪学习表现并动态调整计划。',
    nextAction: planner?.metadata?.nextAction || evaluator?.metadata?.nextAction || '查看学习计划',
    focus: knowledge?.metadata?.topHit?.title || knowledge?.metadata?.query || '',
  }
}

app.get('/api/agents/status', async (_request, response) => {
  response.json({
    scope: 'student',
    mode: 'deterministic_orchestration',
    agents: studentAgentDefinitions.map((agent) => ({
      ...agent,
      status: agent.key === 'tutor' ? 'implemented' : 'ready',
    })),
  })
})

app.post('/api/agents/run', async (request, response, next) => {
  const client = await pool.connect()
  try {
    const context = await resolveContext(request, String(request.query.portal || 'student'))
    requireWrite(context)
    const taskId = crypto.randomUUID()
    const agentContext = await buildStudentAgentContext(context, request.body || {})
    const steps = buildStudentAgentSteps(agentContext)

    await client.query('begin')
    const inserted = await insertAgentTaskLogs(client, context, taskId, steps)
    await client.query(
      `insert into sync_events (student_id, actor_role, event_type, title, status, metadata)
       values ($1, 'admin', 'agent_orchestration_run', '学生端多智能体协同分析', 'success', $2::jsonb)`,
      [context.studentId, JSON.stringify({ courseId: context.courseId, taskId, stepCount: inserted.length })],
    )
    await client.query('commit')

    response.status(201).json({
      taskId,
      status: 'completed',
      logs: inserted.map(formatAgentLog),
      finalRecommendation: buildAgentFinalRecommendation(inserted),
    })
  } catch (error) {
    await client.query('rollback')
    next(error)
  } finally {
    client.release()
  }
})

app.get('/api/agents/logs/:taskId', async (request, response, next) => {
  try {
    const context = await resolveContext(request, String(request.query.portal || 'student'))
    const result = await pool.query(
      `select *
       from agent_task_logs
       where task_id = $1
         and student_id = $2
         and course_id = $3
       order by step_no`,
      [request.params.taskId, context.studentId, context.courseId],
    )
    if (!result.rows.length) {
      response.status(404).json({ error: 'agent task not found' })
      return
    }
    response.json({
      taskId: request.params.taskId,
      status: result.rows.every((row) => row.status === 'completed') ? 'completed' : 'running',
      logs: result.rows.map(formatAgentLog),
      finalRecommendation: buildAgentFinalRecommendation(result.rows),
    })
  } catch (error) {
    next(error)
  }
})

app.get('/api/reports/summary', async (request, response, next) => {
  try {
    const context = await resolveContext(request, String(request.query.portal || 'student'))
    response.json(await buildReportSummary(context, String(request.query.period || 'week')))
  } catch (error) {
    next(error)
  }
})

app.get('/api/dashboard', async (request, response, next) => {
  try {
    const portal = String(request.query.portal || 'student')
    const context = await resolveContext(request, portal)
    const payload = await buildStudentPayload(context)
    response.json(payload)
  } catch (error) {
    next(error)
  }
})

app.get('/api/portals/:portal/dashboard', async (request, response, next) => {
  try {
    const context = await resolveContext(request, request.params.portal)
    const payload = await buildStudentPayload(context)
    response.json(payload)
  } catch (error) {
    next(error)
  }
})

app.post('/api/activity-events', async (request, response, next) => {
  try {
    const context = await resolveContext(request, String(request.query.portal || 'student'))
    requireWrite(context)

    const pageKey = String(request.body?.pageKey || '').trim()
    const actionType = String(request.body?.actionType || '').trim()
    const actionLabel = String(request.body?.actionLabel || actionType).trim()
    if (!pageKey || !actionType) {
      response.status(400).json({ error: 'pageKey and actionType are required' })
      return
    }

    const result = await pool.query(
      `insert into student_activity_events
         (student_id, course_id, account_id, portal, page_key, action_type, action_label, entity_type, entity_id, payload)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       returning id, page_key, action_type, action_label, created_at`,
      [
        context.studentId,
        context.courseId,
        context.accountId,
        context.portal,
        pageKey,
        actionType,
        actionLabel,
        request.body?.entityType || null,
        request.body?.entityId || null,
        request.body?.data || {},
      ],
    )
    response.status(201).json(result.rows[0])
  } catch (error) {
    next(error)
  }
})

app.get('/api/ui-state', async (request, response, next) => {
  try {
    const context = await resolveContext(request, String(request.query.portal || 'student'))
    const result = await pool.query(
      `select page_key, state_key, state_value, updated_at
       from student_ui_state
       where student_id = $1 and course_id = $2 and portal = $3
       order by page_key, state_key`,
      [context.studentId, context.courseId, context.portal],
    )
    response.json({ states: groupUiState(result.rows), rows: result.rows })
  } catch (error) {
    next(error)
  }
})

app.post('/api/ui-state', async (request, response, next) => {
  try {
    const context = await resolveContext(request, String(request.query.portal || 'student'))
    requireWrite(context)

    const pageKey = String(request.body?.pageKey || '').trim()
    const stateKey = String(request.body?.stateKey || '').trim()
    if (!pageKey || !stateKey) {
      response.status(400).json({ error: 'pageKey and stateKey are required' })
      return
    }

    const saved = await saveUiState(context, pageKey, stateKey, request.body?.stateValue || request.body?.value || {})
    response.status(201).json(saved)
  } catch (error) {
    next(error)
  }
})

app.post('/api/learning-sessions', async (request, response, next) => {
  try {
    const context = await resolveContext(request, String(request.query.portal || 'student'))
    requireWrite(context)

    const source = ['home', 'plan', 'recommendation'].includes(request.body?.source) ? request.body.source : 'home'
    const mode = request.body?.mode === 'review' ? 'review' : 'learn'
    const studyPlanId = request.body?.studyPlanId || null
    const resourceId = request.body?.resourceId || null
    let planRow = null

    if (studyPlanId) {
      const plan = await pool.query(
        `select id, estimated_minutes, tag, title
         from study_plans
         where id = $1 and student_id = $2 and course_id = $3`,
        [studyPlanId, context.studentId, context.courseId],
      )
      if (!plan.rows[0]) {
        response.status(404).json({ error: 'study plan not found' })
        return
      }
      planRow = plan.rows[0]
    }

    if (resourceId) {
      const resource = await pool.query(
        `select r.id
         from learning_resources r
         join courses c on c.id = $2
         where r.id = $1
           and r.subject = c.subject
           and r.grade = c.grade
           and r.status = 'active'`,
        [resourceId, context.courseId],
      )
      if (!resource.rows[0]) {
        response.status(404).json({ error: 'resource not found' })
        return
      }
    }

    const activeGoal = await pool.query(
      `select id, mode_key, progress
       from student_goal_modes
       where student_id = $1 and course_id = $2 and is_active = true
       order by updated_at desc
       limit 1`,
      [context.studentId, context.courseId],
    )
    const metadata = request.body?.metadata || {}
    const targetMinutes = clampInteger(
      request.body?.targetMinutes ?? metadata.minutes ?? planRow?.estimated_minutes,
      Number(planRow?.estimated_minutes || 15),
      0,
      600,
    )
    const completionDefinition = String(request.body?.completionDefinition || '').trim()
      || buildCompletionDefinition({ mode, source, targetMinutes, tag: metadata.tag || planRow?.tag || '' })

    const result = await pool.query(
      `insert into student_learning_sessions
         (student_id, course_id, account_id, study_plan_id, resource_id, goal_mode_id,
          source, mode, target_minutes, completion_definition, metadata)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       returning id, study_plan_id, resource_id, goal_mode_id, source, mode, status,
                 target_minutes, completed_minutes, completion_score,
                 completion_definition, completion_reason, started_at, completed_at, ended_at`,
      [
        context.studentId,
        context.courseId,
        context.accountId,
        studyPlanId,
        resourceId,
        activeGoal.rows[0]?.id || null,
        source,
        mode,
        targetMinutes,
        completionDefinition,
        {
          ...metadata,
          goalModeKey: activeGoal.rows[0]?.mode_key || null,
          completionDefinition,
        },
      ],
    )
    if (studyPlanId && mode === 'learn') {
      await pool.query(
        `update study_plans
         set status = 'active', updated_at = now()
         where id = $1 and student_id = $2 and course_id = $3 and status <> 'done'`,
        [studyPlanId, context.studentId, context.courseId],
      )
    }
    response.status(201).json(result.rows[0])
  } catch (error) {
    next(error)
  }
})

function formatLearningSessionWithTask(row) {
  const isResource = Boolean(row.resource_id && !row.study_plan_id)
  const minutes = Number(row.target_minutes || row.estimated_minutes || row.duration_minutes || row.metadata?.minutes || 15)
  return {
    session: {
      id: row.id,
      study_plan_id: row.study_plan_id,
      resource_id: row.resource_id,
      goal_mode_id: row.goal_mode_id,
      source: row.source,
      mode: row.mode,
      status: row.status,
      target_minutes: Number(row.target_minutes || minutes),
      completed_minutes: Number(row.completed_minutes || 0),
      completion_score: row.completion_score,
      completion_definition: row.completion_definition,
      completion_reason: row.completion_reason,
      started_at: row.started_at,
      completed_at: row.completed_at,
      ended_at: row.ended_at,
      last_active_at: row.last_active_at,
    },
    task: {
      id: row.study_plan_id || undefined,
      resourceId: row.resource_id || undefined,
      time: row.start_time ? `${row.start_time}${row.end_time ? `-${row.end_time}` : ''}` : (isResource ? 'resource' : 'learning'),
      title: row.plan_title || row.resource_title || row.metadata?.title || '当前学习任务',
      detail: row.plan_detail || row.resource_summary || row.resource_reason || row.metadata?.detail || '',
      minutes,
      status: row.plan_status ? (statusLabel[row.plan_status] || statusLabel.pending) : statusLabel.active,
      tag: row.plan_tag || row.resource_kind || row.metadata?.tag || (isResource ? 'resource' : 'learning'),
    },
  }
}

async function getCurrentLearningSession(context) {
  const result = await pool.query(
    `select s.*,
            to_char(p.start_time, 'HH24:MI') as start_time,
            to_char(p.end_time, 'HH24:MI') as end_time,
            p.title as plan_title,
            p.detail as plan_detail,
            p.tag as plan_tag,
            p.status as plan_status,
            p.estimated_minutes,
            r.title as resource_title,
            r.kind as resource_kind,
            r.duration_minutes,
            coalesce(r.metadata->>'summary', rr.reason, '') as resource_summary,
            rr.reason as resource_reason
     from student_learning_sessions s
     left join study_plans p on p.id = s.study_plan_id
     left join learning_resources r on r.id = s.resource_id
     left join student_resource_recommendations rr
       on rr.resource_id = r.id and rr.student_id = s.student_id
     where s.student_id = $1
       and s.course_id = $2
       and s.status in ('started', 'paused')
     order by
       case
         when p.id is not null then 0
         when r.id is not null then 1
         when nullif(s.metadata->>'title', '') is not null then 2
         else 3
       end,
       coalesce(s.last_active_at, s.started_at) desc
     limit 1`,
    [context.studentId, context.courseId],
  )
  return result.rows[0] ? formatLearningSessionWithTask(result.rows[0]) : null
}

app.get('/api/learning-sessions/current', async (request, response, next) => {
  try {
    const context = await resolveContext(request, String(request.query.portal || 'student'))
    response.json({ current: await getCurrentLearningSession(context) })
  } catch (error) {
    next(error)
  }
})

app.patch('/api/learning-sessions/:id/resume', async (request, response, next) => {
  try {
    const context = await resolveContext(request, String(request.query.portal || 'student'))
    requireWrite(context)
    const result = await pool.query(
      `update student_learning_sessions
       set status = 'started',
           last_active_at = now(),
           updated_at = now(),
           metadata = metadata || $1::jsonb
       where id = $2
         and student_id = $3
         and course_id = $4
         and status = 'paused'
       returning id`,
      [{ resumedAt: new Date().toISOString() }, request.params.id, context.studentId, context.courseId],
    )
    if (!result.rows[0]) {
      response.status(404).json({ error: 'paused learning session not found' })
      return
    }
    response.json({ current: await getCurrentLearningSession(context) })
  } catch (error) {
    next(error)
  }
})

app.patch('/api/learning-sessions/:id/finish', async (request, response, next) => {
  const client = await pool.connect()
  try {
    const context = await resolveContext(request, String(request.query.portal || 'student'))
    requireWrite(context)

    const status = String(request.body?.status || 'completed')
    if (!['completed', 'paused', 'abandoned'].includes(status)) {
      response.status(400).json({ error: 'invalid learning session status' })
      return
    }

    await client.query('begin')
    const sessionResult = await client.query(
      `select s.*, p.plan_date::text as plan_date, p.estimated_minutes, p.title as plan_title, p.tag as plan_tag
       from student_learning_sessions s
       left join study_plans p on p.id = s.study_plan_id
       where s.id = $1 and s.student_id = $2 and s.course_id = $3
       for update of s`,
      [request.params.id, context.studentId, context.courseId],
    )
    const session = sessionResult.rows[0]
    if (!session) {
      await client.query('rollback')
      response.status(404).json({ error: 'learning session not found' })
      return
    }

    if (session.status !== 'started') {
      await client.query('rollback')
      response.json({
        session,
        alreadyFinished: true,
        dailyMetric: null,
        goalMode: null,
      })
      return
    }

    const targetMinutes = clampInteger(session.target_minutes || session.estimated_minutes || session.metadata?.minutes, 15, 1, 600)
    const elapsedMinutes = Math.max(1, Math.ceil((Date.now() - new Date(session.started_at).getTime()) / 60000))
    const requestedMinutes = request.body?.completedMinutes === undefined ? null : clampInteger(request.body.completedMinutes, 0, 0, 600)
    const completedMinutes = status === 'completed'
      ? clampInteger(requestedMinutes ?? targetMinutes, targetMinutes, 1, 600)
      : status === 'paused'
        ? clampInteger(requestedMinutes ?? elapsedMinutes, elapsedMinutes, 1, 600)
        : clampInteger(requestedMinutes ?? elapsedMinutes, 0, 0, 600)
    const autoScore = status === 'completed'
      ? Math.max(80, Math.min(100, Math.round((completedMinutes / Math.max(targetMinutes, 1)) * 100)))
      : status === 'paused'
        ? Math.min(75, Math.round((completedMinutes / Math.max(targetMinutes, 1)) * 60))
        : 0
    const completionScore = clampInteger(request.body?.completionScore, autoScore, 0, 100)
    const completionReason = String(request.body?.reason || (status === 'completed' ? '学生确认本次学习目标已完成' : status === 'paused' ? '学生选择稍后继续' : '学生结束本次学习')).trim()
    const outcome = {
      ...(request.body?.outcome || {}),
      source: session.source,
      mode: session.mode,
      targetMinutes,
      completedMinutes,
      status,
      completionScore,
    }

    const updatedSession = await client.query(
      `update student_learning_sessions
       set status = $1,
           target_minutes = $2,
           completed_minutes = $3,
           completion_score = $4,
           completion_reason = $5,
           outcome = $6,
           metadata = metadata || $7::jsonb,
           completed_at = case when $1 = 'completed' then now() else completed_at end,
           ended_at = now(),
           updated_at = now(),
           last_active_at = now()
       where id = $8
       returning id, study_plan_id, resource_id, goal_mode_id, source, mode, status,
                 target_minutes, completed_minutes, completion_score,
                 completion_definition, completion_reason, started_at, completed_at, ended_at, outcome`,
      [
        status,
        targetMinutes,
        completedMinutes,
        completionScore,
        completionReason,
        outcome,
        { lastFinishReason: completionReason, lastFinishStatus: status },
        session.id,
      ],
    )

    if (session.study_plan_id) {
      const planStatus = status === 'completed' ? 'done' : status === 'paused' ? 'active' : 'pending'
      await client.query(
        `update study_plans
         set status = $1, updated_at = now()
         where id = $2 and student_id = $3 and course_id = $4`,
        [planStatus, session.study_plan_id, context.studentId, context.courseId],
      )
    }

    if (session.resource_id) {
      await client.query(
        `insert into student_resource_usage
           (student_id, course_id, account_id, resource_id, action_label, status, metadata)
         values ($1, $2, $3, $4, $5, $6, $7)`,
        [
          context.studentId,
          context.courseId,
          context.accountId,
          session.resource_id,
          status === 'completed' ? '完成资源学习' : status === 'paused' ? '暂停资源学习' : '结束资源学习',
          status === 'completed' ? 'completed' : status === 'paused' ? 'started' : 'dismissed',
          { learningSessionId: session.id, completionScore, completedMinutes },
        ],
      )
    }

    const metricDate = session.plan_date ? String(session.plan_date).slice(0, 10) : new Date().toISOString().slice(0, 10)
    const completionStats = await client.query(
      `select count(*)::int as total_count,
              count(*) filter (where status = 'done')::int as done_count
       from study_plans
       where student_id = $1 and course_id = $2 and plan_date = $3`,
      [context.studentId, context.courseId, metricDate],
    )
    const totalCount = Math.max(Number(completionStats.rows[0]?.total_count || 0), 1)
    const doneCount = Number(completionStats.rows[0]?.done_count || 0)
    const completionRate = Math.round((doneCount / totalCount) * 100)
    const attempts = await client.query(
      `select round(avg(score))::int as accuracy,
              count(*)::int as question_count,
              count(*) filter (where is_correct = false)::int as mistake_count
       from student_question_attempts
       where student_id = $1 and course_id = $2 and attempted_at::date = $3::date`,
      [context.studentId, context.courseId, metricDate],
    )
    const accuracyRate = clampInteger(attempts.rows[0]?.accuracy, completionScore || 80, 0, 100)
    const questionsDone = clampInteger(request.body?.questionsDone, Number(attempts.rows[0]?.question_count || 0), 0, 200)
    const mistakesFixed = clampInteger(request.body?.mistakesFixed, status === 'completed' && session.mode === 'review' ? 1 : 0, 0, 200)

    await client.query(
      `insert into learning_metric_daily
         (student_id, course_id, metric_date, study_minutes, accuracy_rate, completion_rate, questions_done, mistakes_fixed)
       values ($1, $2, $3, $4, $5, $6, $7, $8)
       on conflict (student_id, course_id, metric_date)
       do update set
         study_minutes = learning_metric_daily.study_minutes + excluded.study_minutes,
         accuracy_rate = excluded.accuracy_rate,
         completion_rate = excluded.completion_rate,
         questions_done = greatest(learning_metric_daily.questions_done, excluded.questions_done),
         mistakes_fixed = learning_metric_daily.mistakes_fixed + excluded.mistakes_fixed`,
      [context.studentId, context.courseId, metricDate, completedMinutes, accuracyRate, completionRate, questionsDone, mistakesFixed],
    )

    const goalDelta = status === 'completed' ? Math.max(1, Math.ceil(completionScore / 25)) : status === 'paused' ? 1 : 0
    let goalMode = null
    if (session.goal_mode_id && goalDelta > 0) {
      const goalResult = await client.query(
        `update student_goal_modes
         set progress = least(100, progress + $1),
             metrics = metrics || $2::jsonb,
             updated_at = now()
         where id = $3 and student_id = $4 and course_id = $5
         returning id, mode_key, title, progress, metrics`,
        [
          goalDelta,
          {
            lastSession: {
              id: session.id,
              status,
              score: completionScore,
              minutes: completedMinutes,
              finishedAt: new Date().toISOString(),
            },
          },
          session.goal_mode_id,
          context.studentId,
          context.courseId,
        ],
      )
      goalMode = goalResult.rows[0] || null
    }

    await client.query(
      `insert into sync_events (student_id, actor_role, event_type, title, status, metadata)
       values ($1, 'student', $2, $3, 'done', $4)`,
      [
        context.studentId,
        `learning_session_${status}`,
        status === 'completed' ? '学生完成一次学习闭环' : status === 'paused' ? '学生暂停一次学习闭环' : '学生结束一次学习闭环',
        { learningSessionId: session.id, completedMinutes, completionScore, studyPlanId: session.study_plan_id, resourceId: session.resource_id },
      ],
    )

    await client.query('commit')
    response.json({
      session: updatedSession.rows[0],
      dailyMetric: {
        date: metricDate,
        addedMinutes: completedMinutes,
        accuracyRate,
        completionRate,
        questionsDone,
        mistakesFixed,
      },
      goalMode,
    })
  } catch (error) {
    await client.query('rollback').catch(() => {})
    next(error)
  } finally {
    client.release()
  }
})

app.post('/api/resources/:id/usage', async (request, response, next) => {
  try {
    const context = await resolveContext(request, String(request.query.portal || 'student'))
    requireWrite(context)

    const resource = await pool.query(
      `select r.id, r.action_label
       from learning_resources r
       join courses c on c.id = $2
       where r.id = $1 and r.subject = c.subject and r.grade = c.grade`,
      [request.params.id, context.courseId],
    )
    if (!resource.rows[0]) {
      response.status(404).json({ error: 'resource not found' })
      return
    }

    const status = ['opened', 'started', 'completed', 'dismissed'].includes(request.body?.status) ? request.body.status : 'opened'
    const result = await pool.query(
      `insert into student_resource_usage
         (student_id, course_id, account_id, resource_id, action_label, status, metadata)
       values ($1, $2, $3, $4, $5, $6, $7)
       returning id, resource_id, action_label, status, created_at`,
      [
        context.studentId,
        context.courseId,
        context.accountId,
        request.params.id,
        request.body?.actionLabel || resource.rows[0].action_label,
        status,
        request.body?.metadata || {},
      ],
    )
    response.status(201).json(result.rows[0])
  } catch (error) {
    next(error)
  }
})

app.post('/api/resources/:id/plan', async (request, response, next) => {
  try {
    const context = await resolveContext(request, String(request.query.portal || 'student'))
    requireWrite(context)

    const resource = await pool.query(
      `select r.id, r.title, r.kind, r.duration_minutes, r.action_label, coalesce(rr.reason, r.metadata->>'summary', '') as reason
       from learning_resources r
       left join student_resource_recommendations rr
         on rr.resource_id = r.id and rr.student_id = $2
       join courses c on c.id = $3
       where r.id = $1 and r.subject = c.subject and r.grade = c.grade and r.status = 'active'
       limit 1`,
      [request.params.id, context.studentId, context.courseId],
    )
    const row = resource.rows[0]
    if (!row) {
      response.status(404).json({ error: 'resource not found' })
      return
    }

    const planDate = request.body?.planDate || new Date().toISOString().slice(0, 10)
    const startTime = request.body?.startTime || '20:10'
    const endTime = request.body?.endTime || null
    const minutes = clampInteger(request.body?.minutes ?? row.duration_minutes, 20, 1, 600)
    const sortOrder = await pool.query(
      `select coalesce(max(sort_order), 0) + 1 as next_order
       from study_plans
       where student_id = $1 and course_id = $2 and plan_date = $3::date`,
      [context.studentId, context.courseId, planDate],
    )
    const created = await pool.query(
      `insert into study_plans
         (student_id, course_id, resource_id, plan_date, start_time, end_time, title, detail, tag, estimated_minutes, status, source, sort_order)
       values ($1, $2, $3, $4::date, $5::time, nullif($6, '')::time, $7, $8, $9, $10, 'pending', 'system', $11)
       returning id, to_char(start_time, 'HH24:MI') as start_time, to_char(end_time, 'HH24:MI') as end_time,
                 title, detail, tag, estimated_minutes, status`,
      [
        context.studentId,
        context.courseId,
        row.id,
        planDate,
        startTime,
        endTime,
        request.body?.title || row.title,
        request.body?.detail || row.reason || 'Resource-backed learning task',
        request.body?.tag || row.kind,
        minutes,
        sortOrder.rows[0]?.next_order || 1,
      ],
    )
    await pool.query(
      `insert into student_resource_usage
         (student_id, course_id, account_id, resource_id, action_label, status, metadata)
       values ($1, $2, $3, $4, $5, 'started', $6)`,
      [context.studentId, context.courseId, context.accountId, row.id, '加入学习计划', { planId: created.rows[0].id, planDate }],
    )
    const formattedPlan = formatStudyPlan(created.rows[0])
    response.status(201).json({ id: formattedPlan.id, plan: formattedPlan })
  } catch (error) {
    next(error)
  }
})

app.get('/api/resources', async (request, response, next) => {
  try {
    const context = await resolveContext(request, String(request.query.portal || 'student'))
    const resources = await queryResources(context, {
      keyword: request.query.keyword,
      filter: request.query.filter,
      sort: request.query.sort,
      limit: request.query.limit,
    })
    response.json({ resources })
  } catch (error) {
    next(error)
  }
})

app.get('/api/resources/:id/file', async (request, response, next) => {
  try {
    const context = await resolveContext(request, String(request.query.portal || 'student'))
    const result = await pool.query(
      `select r.id, r.title, r.metadata, v.content_uri
       from learning_resources r
       left join lateral (
         select content_uri
         from learning_resource_versions
         where resource_id = r.id
         order by version_no desc, created_at desc
         limit 1
       ) v on true
       where r.id = $1
         and r.subject = (select subject from courses where id = $2)
         and r.grade = (select grade from courses where id = $2)
         and r.status = 'active'`,
      [request.params.id, context.courseId],
    )
    const resource = result.rows[0]
    if (!resource) {
      response.status(404).json({ error: 'resource not found' })
      return
    }

    const metadata = resource.metadata || {}
    if (metadata.externalUrl) {
      response.redirect(metadata.externalUrl)
      return
    }

    const contentUri = metadata.relativePath || resource.content_uri
    if (!contentUri) {
      response.status(404).json({ error: 'resource file path is missing' })
      return
    }

    const target = path.resolve(projectRoot, contentUri)
    const rootWithSep = `${localResourceRoot}${path.sep}`.toLowerCase()
    if (target.toLowerCase() !== localResourceRoot.toLowerCase() && !target.toLowerCase().startsWith(rootWithSep)) {
      response.status(403).json({ error: 'resource file is outside the allowed local resource directory' })
      return
    }
    if (!fs.existsSync(target)) {
      response.status(404).json({ error: 'resource file does not exist on this machine' })
      return
    }

    response.type('application/pdf')
    response.sendFile(target)
  } catch (error) {
    next(error)
  }
})

app.get('/api/resources/:id/chunks', async (request, response, next) => {
  try {
    const context = await resolveContext(request, String(request.query.portal || 'student'))
    const keyword = String(request.query.keyword || '').trim()
    const pageRef = String(request.query.page || '').trim()
    const limit = Math.min(Math.max(Number(request.query.limit || 12), 1), 30)
    const offset = Math.max(Number(request.query.offset || 0), 0)

    const resource = await pool.query(
      `select r.id
       from learning_resources r
       join courses c on c.id = $2
       where r.id = $1
         and r.subject = c.subject
         and r.grade = c.grade
         and r.status = 'active'
       limit 1`,
      [request.params.id, context.courseId],
    )
    if (!resource.rows[0]) {
      response.status(404).json({ error: 'resource not found' })
      return
    }

    const [chunksResult, countResult] = await Promise.all([
      pool.query(
        `select id, resource_id, chunk_no, heading, left(body, 1200) as body, page_ref, metadata
         from resource_chunks
         where resource_id = $1
           and ($2 = '' or heading ilike '%' || $2 || '%' or body ilike '%' || $2 || '%' or page_ref ilike '%' || $2 || '%')
           and ($3 = '' or page_ref = $3 or metadata->>'page' = $3)
         order by case when $2 <> '' and (heading ilike '%' || $2 || '%' or body ilike '%' || $2 || '%') then 0 else 1 end,
                  chunk_no
         limit $4 offset $5`,
        [request.params.id, keyword, pageRef, limit, offset],
      ),
      pool.query(
        `select count(*)::int as total
         from resource_chunks
         where resource_id = $1
           and ($2 = '' or heading ilike '%' || $2 || '%' or body ilike '%' || $2 || '%' or page_ref ilike '%' || $2 || '%')
           and ($3 = '' or page_ref = $3 or metadata->>'page' = $3)`,
        [request.params.id, keyword, pageRef],
      ),
    ])

    response.json({
      chunks: chunksResult.rows.map((chunk) => ({
        id: chunk.id,
        resourceId: chunk.resource_id,
        chunkNo: Number(chunk.chunk_no),
        heading: chunk.heading,
        body: chunk.body,
        pageRef: chunk.page_ref,
        metadata: chunk.metadata || {},
      })),
      total: Number(countResult.rows[0]?.total || 0),
      limit,
      offset,
      keyword,
      page: pageRef,
    })
  } catch (error) {
    next(error)
  }
})

app.get('/api/resources/:id', async (request, response, next) => {
  try {
    const context = await resolveContext(request, String(request.query.portal || 'student'))
    const resourceResult = await pool.query(
      `select r.id, r.resource_code, r.title, r.kind, r.duration_minutes, r.color, r.action_label,
              r.difficulty, r.metadata, s.source_name, s.source_type, v.id as version_id,
              v.content_uri, v.parse_status, v.raw_metadata,
              oj.status as ocr_job_status, oj.page_start as ocr_job_page_start, oj.page_end as ocr_job_page_end,
              oj.processed_pages as ocr_job_processed_pages, oj.total_pages as ocr_job_total_pages,
              oj.output_chunk_count as ocr_job_output_chunk_count, oj.average_confidence as ocr_job_average_confidence,
              oj.error_message as ocr_job_error_message, oj.created_at as ocr_job_created_at, oj.finished_at as ocr_job_finished_at,
              coalesce(rr.reason, '匹配当前学习画像') as reason,
              coalesce(rr.match_score, 80) as match_score,
              coalesce(ch.chunk_count, 0) as chunk_count
       from learning_resources r
       left join resource_sources s on s.id = r.source_id
       left join lateral (
         select reason, match_score
         from student_resource_recommendations
         where resource_id = r.id and student_id = $1
         order by match_score desc, created_at desc
         limit 1
       ) rr on true
       left join lateral (
         select id, content_uri, parse_status, raw_metadata
         from learning_resource_versions
         where resource_id = r.id
         order by version_no desc, created_at desc
         limit 1
       ) v on true
       left join lateral (
         select count(*)::int as chunk_count
         from resource_chunks
         where resource_id = r.id
       ) ch on true
       left join lateral (
         select status, page_start, page_end, processed_pages, total_pages, output_chunk_count,
                average_confidence, error_message, created_at, finished_at
         from resource_ocr_jobs
         where resource_id = r.id
         order by created_at desc
         limit 1
       ) oj on true
       where r.id = $2
         and r.subject = (select subject from courses where id = $3)
         and r.grade = (select grade from courses where id = $3)
         and r.status = 'active'`,
      [context.studentId, request.params.id, context.courseId],
    )
    const row = resourceResult.rows[0]
    if (!row) {
      response.status(404).json({ error: 'resource not found' })
      return
    }

    const [chunksResult, distillationsResult, questionsResult] = await Promise.all([
      pool.query(
        `select id, chunk_no, heading, left(body, 1200) as body, page_ref, metadata
         from resource_chunks
         where resource_id = $1
         order by chunk_no
         limit 12`,
        [row.id],
      ),
      pool.query(
        `select distillation_type, status, content, confidence, updated_at
         from resource_distillations
         where resource_id = $1 and course_id = $2
         order by distillation_type`,
        [row.id, context.courseId],
      ),
      pool.query(
        `select id, question_type, stem, difficulty_level, estimated_minutes, metadata
         from question_items
         where resource_id = $1 and course_id = $2
         order by difficulty_level, created_at
         limit 12`,
        [row.id, context.courseId],
      ),
    ])

    const resource = formatResource(row)
    const summary = distillationsResult.rows.find((item) => item.distillation_type === 'summary')?.content?.summary
    response.json({
      resource: {
        ...resource,
        sourceName: row.source_name,
        sourceType: row.source_type,
        summary: summary || row.metadata?.summary || '',
        fileMeta: row.raw_metadata || {},
        chunks: chunksResult.rows.map((chunk) => ({
          id: chunk.id,
          chunkNo: Number(chunk.chunk_no),
          heading: chunk.heading,
          body: chunk.body,
          pageRef: chunk.page_ref,
          metadata: chunk.metadata || {},
        })),
        distillations: distillationsResult.rows.map((item) => ({
          type: item.distillation_type,
          status: item.status,
          content: item.content || {},
          confidence: Number(item.confidence),
          updatedAt: item.updated_at,
        })),
        questions: questionsResult.rows.map((item) => ({
          id: item.id,
          type: item.question_type,
          stem: item.stem,
          difficultyLevel: Number(item.difficulty_level),
          estimatedMinutes: item.estimated_minutes ? Number(item.estimated_minutes) : null,
          metadata: item.metadata || {},
        })),
      },
    })
  } catch (error) {
    next(error)
  }
})

app.get('/api/diagnosis/questions', async (request, response, next) => {
  try {
    const context = await resolveContext(request, String(request.query.portal || 'student'))
    const difficulty = clampInteger(request.query.difficulty, 0, 0, 5)
    const diagnosticType = String(request.query.type || 'initial')
    const limit = clampInteger(request.query.limit, 12, 1, 50)
    const result = await pool.query(
      `select dq.id as diagnosis_question_id, dq.dimension_key, dq.diagnostic_type, dq.weight,
              q.id, q.question_type, q.stem, q.difficulty_level, q.estimated_minutes, q.metadata,
              kp.title as knowledge_title, kp.module as knowledge_module
       from diagnosis_questions dq
       join question_items q on q.id = dq.question_id
       left join course_knowledge_points kp on kp.id = q.knowledge_point_id
       where dq.course_id = $1
         and dq.status = 'active'
         and dq.diagnostic_type = $2
         and ($3::int = 0 or q.difficulty_level = $3::int)
       order by dq.sort_order, q.difficulty_level, q.created_at
       limit $4`,
      [context.courseId, diagnosticType, difficulty, limit],
    )

    response.json({
      courseId: context.courseId,
      diagnosticType,
      questions: result.rows.map((row) => ({
        id: row.id,
        diagnosisQuestionId: row.diagnosis_question_id,
        type: row.question_type,
        stem: row.stem,
        difficultyLevel: Number(row.difficulty_level),
        estimatedMinutes: row.estimated_minutes ? Number(row.estimated_minutes) : null,
        knowledgeTitle: row.knowledge_title,
        knowledgeModule: row.knowledge_module,
        dimensionKey: row.dimension_key,
        weight: Number(row.weight),
        metadata: row.metadata || {},
      })),
    })
  } catch (error) {
    next(error)
  }
})

app.post('/api/diagnosis/submit', async (request, response, next) => {
  const client = await pool.connect()
  try {
    const context = await resolveContext(request, String(request.query.portal || 'student'))
    requireWrite(context)

    const answers = normalizeAnswerList(request.body)
    if (!answers.length) {
      response.status(400).json({ error: 'answers are required' })
      return
    }

    const diagnosticType = String(request.body?.type || request.body?.diagnosticType || 'initial')
    const questionIds = answers.map((item) => item.questionId)
    const questionResult = await client.query(
      `select q.id, q.answer, q.solution, q.difficulty_level, q.metadata,
              coalesce(dq.dimension_key,
                case when q.difficulty_level <= 2 then 'knowledge'
                     when q.difficulty_level = 3 then 'application'
                     else 'thinking'
                end
              ) as dimension_key,
              coalesce(dq.weight,
                case when q.difficulty_level <= 2 then 1.00
                     when q.difficulty_level = 3 then 1.20
                     else 1.50
                end
              ) as weight,
              kp.title as knowledge_title
       from question_items q
       left join diagnosis_questions dq
         on dq.question_id = q.id
        and dq.course_id = q.course_id
        and dq.diagnostic_type = $3
        and dq.status = 'active'
       left join course_knowledge_points kp on kp.id = q.knowledge_point_id
       where q.course_id = $1 and q.id = any($2::uuid[])`,
      [context.courseId, questionIds, diagnosticType],
    )
    const questionById = new Map(questionResult.rows.map((row) => [String(row.id), row]))
    if (questionById.size !== questionIds.length) {
      response.status(400).json({ error: 'one or more questions are invalid for this course' })
      return
    }

    await client.query('begin')

    const scoredAnswers = []
    const dimensionBuckets = new Map()
    let correctCount = 0
    let weightedScoreSum = 0
    let weightSum = 0

    for (const answer of answers) {
      const question = questionById.get(answer.questionId)
      const scored = scoreAnswer(question.answer, answer.answerText)
      const weight = Number(question.weight || 1)
      if (scored.isCorrect) correctCount += 1
      weightedScoreSum += scored.score * weight
      weightSum += weight

      const dimensionKey = question.dimension_key || 'knowledge'
      if (!dimensionBuckets.has(dimensionKey)) dimensionBuckets.set(dimensionKey, { scoreSum: 0, weightSum: 0 })
      const bucket = dimensionBuckets.get(dimensionKey)
      bucket.scoreSum += scored.score * weight
      bucket.weightSum += weight

      const enriched = {
        questionId: answer.questionId,
        answerText: answer.answerText,
        expectedAnswer: question.answer,
        isCorrect: scored.isCorrect,
        score: scored.score,
        durationSeconds: answer.durationSeconds,
        difficultyLevel: Number(question.difficulty_level),
        dimensionKey,
        knowledgeTitle: question.knowledge_title || '未标注知识点',
      }
      scoredAnswers.push(enriched)

      await client.query(
        `insert into student_question_attempts
           (student_id, course_id, question_id, answer_text, is_correct, score, duration_seconds, mistake_type, metadata)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)`,
        [
          context.studentId,
          context.courseId,
          answer.questionId,
          answer.answerText,
          scored.isCorrect,
          scored.score,
          answer.durationSeconds,
          scored.isCorrect ? null : 'diagnosis_error',
          JSON.stringify({ source: 'diagnosis', diagnosticType, difficultyLevel: Number(question.difficulty_level) }),
        ],
      )
    }

    const totalScore = weightSum ? Math.round(weightedScoreSum / weightSum) : 0
    const dimensionScores = {}
    for (const [key, bucket] of dimensionBuckets) {
      dimensionScores[key] = bucket.weightSum ? Math.round(bucket.scoreSum / bucket.weightSum) : 0
    }
    const weakPoints = scoredAnswers
      .filter((item) => !item.isCorrect)
      .map((item) => item.knowledgeTitle)
      .filter((value, index, array) => value && array.indexOf(value) === index)

    const generatedProfile = await applyGeneratedProfile(client, context, {
      totalScore,
      dimensionScores,
      answers: scoredAnswers,
      weakPoints,
    })

    const record = await client.query(
      `insert into diagnosis_records
         (student_id, course_id, account_id, diagnostic_type, answers, total_questions,
          correct_count, total_score, duration_seconds, dimension_scores, weak_points, generated_profile, metadata)
       values ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, $10::jsonb, $11::jsonb, $12::jsonb, $13::jsonb)
       returning id, created_at`,
      [
        context.studentId,
        context.courseId,
        context.accountId,
        diagnosticType,
        JSON.stringify(scoredAnswers),
        scoredAnswers.length,
        correctCount,
        totalScore,
        request.body?.durationSeconds === undefined ? null : clampInteger(request.body.durationSeconds, 0, 0, 24 * 60 * 60),
        JSON.stringify(dimensionScores),
        JSON.stringify(weakPoints),
        JSON.stringify(generatedProfile),
        JSON.stringify(request.body?.metadata || {}),
      ],
    )

    await client.query(
      `insert into learning_metric_daily
         (student_id, course_id, metric_date, study_minutes, accuracy_rate, completion_rate, questions_done, mistakes_fixed)
       values ($1, $2, current_date, 0, $3, 0, $4, $5)
       on conflict (student_id, course_id, metric_date)
       do update set
         accuracy_rate = round((learning_metric_daily.accuracy_rate + excluded.accuracy_rate) / 2.0)::int,
         questions_done = learning_metric_daily.questions_done + excluded.questions_done,
         mistakes_fixed = learning_metric_daily.mistakes_fixed + excluded.mistakes_fixed`,
      [context.studentId, context.courseId, totalScore, scoredAnswers.length, weakPoints.length],
    )

    await client.query(
      `insert into sync_events (student_id, actor_role, event_type, title, status, metadata)
       values ($1, 'student', 'diagnosis_completed', '完成诊断测试', 'success', $2::jsonb)`,
      [context.studentId, JSON.stringify({ courseId: context.courseId, totalScore, correctCount, totalQuestions: scoredAnswers.length })],
    )

    await client.query('commit')
    const profile = await fetchProfilePayload(context)
    response.status(201).json({
      record: {
        id: record.rows[0].id,
        createdAt: record.rows[0].created_at,
        totalQuestions: scoredAnswers.length,
        correctCount,
        totalScore,
        dimensionScores,
        weakPoints,
        generatedProfile,
        answers: scoredAnswers.map((item) => ({
          questionId: item.questionId,
          isCorrect: item.isCorrect,
          score: item.score,
          knowledgeTitle: item.knowledgeTitle,
          dimensionKey: item.dimensionKey,
        })),
      },
      profile,
    })
  } catch (error) {
    await client.query('rollback')
    next(error)
  } finally {
    client.release()
  }
})

app.get('/api/profile/:studentId', async (request, response, next) => {
  try {
    const context = await resolveContext(request, String(request.query.portal || 'student'))
    const studentId = String(request.params.studentId || '')
    if (studentId !== context.studentId) {
      response.status(403).json({ error: 'profile access denied' })
      return
    }
    response.json(await fetchProfilePayload(context, studentId))
  } catch (error) {
    next(error)
  }
})

app.post('/api/profile/generate', async (request, response, next) => {
  const client = await pool.connect()
  try {
    const context = await resolveContext(request, String(request.query.portal || 'student'))
    requireWrite(context)
    const latest = await client.query(
      `select id, answers, total_score, dimension_scores, weak_points
       from diagnosis_records
       where student_id = $1 and course_id = $2 and status = 'completed'
       order by created_at desc
       limit 1`,
      [context.studentId, context.courseId],
    )
    if (!latest.rows[0]) {
      response.status(404).json({ error: 'no completed diagnosis record found' })
      return
    }

    await client.query('begin')
    const generatedProfile = await applyGeneratedProfile(client, context, {
      totalScore: Number(latest.rows[0].total_score),
      dimensionScores: latest.rows[0].dimension_scores || {},
      answers: latest.rows[0].answers || [],
      weakPoints: latest.rows[0].weak_points || [],
    })
    await client.query(
      `update diagnosis_records
       set generated_profile = $2::jsonb
       where id = $1`,
      [latest.rows[0].id, JSON.stringify(generatedProfile)],
    )
    await client.query('commit')
    response.json({
      generatedProfile,
      profile: await fetchProfilePayload(context),
    })
  } catch (error) {
    await client.query('rollback')
    next(error)
  } finally {
    client.release()
  }
})

app.post('/api/profile/update', async (request, response, next) => {
  const client = await pool.connect()
  try {
    const context = await resolveContext(request, String(request.query.portal || 'student'))
    requireWrite(context)
    const recent = await client.query(
      `select a.question_id, a.answer_text, a.is_correct, coalesce(a.score, 0) as score,
              a.duration_seconds, q.difficulty_level, kp.title as knowledge_title,
              case when q.difficulty_level <= 2 then 'knowledge'
                   when q.difficulty_level = 3 then 'application'
                   else 'thinking'
              end as dimension_key
       from student_question_attempts a
       join question_items q on q.id = a.question_id
       left join course_knowledge_points kp on kp.id = q.knowledge_point_id
       where a.student_id = $1 and a.course_id = $2
       order by a.attempted_at desc
       limit 20`,
      [context.studentId, context.courseId],
    )
    if (!recent.rows.length) {
      response.status(404).json({ error: 'no recent learning behavior found' })
      return
    }
    const answers = recent.rows.map((row) => ({
      questionId: row.question_id,
      answerText: row.answer_text,
      isCorrect: row.is_correct,
      score: Number(row.score),
      durationSeconds: row.duration_seconds ? Number(row.duration_seconds) : null,
      difficultyLevel: Number(row.difficulty_level),
      dimensionKey: row.dimension_key,
      knowledgeTitle: row.knowledge_title || '未标注知识点',
    }))
    const totalScore = Math.round(answers.reduce((sum, item) => sum + item.score, 0) / answers.length)
    const dimensionScores = {}
    for (const dimension of ['knowledge', 'application', 'thinking']) {
      const items = answers.filter((item) => item.dimensionKey === dimension)
      if (items.length) dimensionScores[dimension] = Math.round(items.reduce((sum, item) => sum + item.score, 0) / items.length)
    }
    const weakPoints = answers
      .filter((item) => !item.isCorrect)
      .map((item) => item.knowledgeTitle)
      .filter((value, index, array) => value && array.indexOf(value) === index)

    await client.query('begin')
    const generatedProfile = await applyGeneratedProfile(client, context, { totalScore, dimensionScores, answers, weakPoints })
    await client.query(
      `insert into sync_events (student_id, actor_role, event_type, title, status, metadata)
       values ($1, 'admin', 'profile_updated', '学习画像动态更新', 'success', $2::jsonb)`,
      [context.studentId, JSON.stringify({ courseId: context.courseId, trigger: request.body?.trigger || 'recent_behavior', totalScore })],
    )
    await client.query('commit')
    response.json({
      generatedProfile,
      profile: await fetchProfilePayload(context),
    })
  } catch (error) {
    await client.query('rollback')
    next(error)
  } finally {
    client.release()
  }
})

app.get('/api/questions', async (request, response, next) => {
  try {
    const context = await resolveContext(request, String(request.query.portal || 'student'))
    const resourceId = request.query.resourceId || null
    const result = await pool.query(
      `select q.id, q.resource_id, q.question_type, q.stem, q.difficulty_level, q.estimated_minutes,
              kp.title as knowledge_title, q.metadata
       from question_items q
       left join course_knowledge_points kp on kp.id = q.knowledge_point_id
       where q.course_id = $1
         and ($2::uuid is null or q.resource_id = $2::uuid)
       order by q.difficulty_level, q.created_at
       limit 50`,
      [context.courseId, resourceId],
    )
    response.json({
      questions: result.rows.map((row) => ({
        id: row.id,
        resourceId: row.resource_id,
        type: row.question_type,
        stem: row.stem,
        difficultyLevel: Number(row.difficulty_level),
        estimatedMinutes: row.estimated_minutes ? Number(row.estimated_minutes) : null,
        knowledgeTitle: row.knowledge_title,
        metadata: row.metadata || {},
      })),
    })
  } catch (error) {
    next(error)
  }
})

app.post('/api/question-attempts', async (request, response, next) => {
  try {
    const context = await resolveContext(request, String(request.query.portal || 'student'))
    requireWrite(context)

    const questionId = request.body?.questionId
    const answerText = String(request.body?.answerText || '').trim()
    if (!questionId || !answerText) {
      response.status(400).json({ error: 'questionId and answerText are required' })
      return
    }

    const question = await pool.query(
      `select id, answer, solution, metadata
       from question_items
       where id = $1 and course_id = $2`,
      [questionId, context.courseId],
    )
    if (!question.rows[0]) {
      response.status(404).json({ error: 'question not found' })
      return
    }

    const expected = normalizeAnswer(question.rows[0].answer)
    const actual = normalizeAnswer(answerText)
    const isCorrect = expected ? actual === expected || actual.includes(expected) || expected.includes(actual) : null
    const score = isCorrect === null ? null : isCorrect ? 100 : 45
    const attempt = await pool.query(
      `insert into student_question_attempts
         (student_id, course_id, question_id, answer_text, is_correct, score, duration_seconds, mistake_type, metadata)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
       returning id, is_correct, score, attempted_at`,
      [
        context.studentId,
        context.courseId,
        questionId,
        answerText,
        isCorrect,
        score,
        Number(request.body?.durationSeconds || 0) || null,
        isCorrect ? null : request.body?.mistakeType || 'needs_review',
        JSON.stringify(request.body?.metadata || {}),
      ],
    )

    response.status(201).json({
      attempt: {
        id: attempt.rows[0].id,
        isCorrect: attempt.rows[0].is_correct,
        score: attempt.rows[0].score === null ? null : Number(attempt.rows[0].score),
        attemptedAt: attempt.rows[0].attempted_at,
      },
      solution: question.rows[0].solution,
      expectedAnswer: question.rows[0].answer,
    })
  } catch (error) {
    next(error)
  }
})

app.post('/api/report-exports', async (request, response, next) => {
  try {
    const context = await resolveContext(request, String(request.query.portal || 'student'))
    requireWrite(context)

    const reportType = String(request.body?.reportType || 'weekly').trim()
    const range = request.body?.range || {}
    const result = await pool.query(
      `insert into report_exports
         (student_id, course_id, account_id, portal, report_type, payload, period_start, period_end, generated_from)
       values ($1, $2, $3, $4, $5, $6, nullif($7, '')::date, nullif($8, '')::date, $9)
       returning id, report_type, created_at`,
      [
        context.studentId,
        context.courseId,
        context.accountId,
        context.portal,
        reportType,
        request.body?.payload || {},
        range.start || request.body?.periodStart || '',
        range.end || request.body?.periodEnd || '',
        request.body?.generatedFrom || 'server',
      ],
    )
    response.status(201).json(result.rows[0])
  } catch (error) {
    next(error)
  }
})

app.get('/api/goal-modes', async (request, response, next) => {
  try {
    const context = await resolveContext(request, String(request.query.portal || 'student'))
    const [modes, milestones] = await Promise.all([
      pool.query(
        `select *
         from student_goal_modes
         where student_id = $1 and course_id = $2
         order by is_active desc, updated_at desc, mode_key`,
        [context.studentId, context.courseId],
      ),
      pool.query(
        `select m.mode_key, sm.id, sm.title, sm.detail, sm.due_date, sm.status, sm.weight, sm.sort_order
         from student_goal_milestones sm
         join student_goal_modes m on m.id = sm.mode_id
         where m.student_id = $1 and m.course_id = $2
         order by m.mode_key, sm.sort_order, sm.due_date`,
        [context.studentId, context.courseId],
      ),
    ])
    response.json({
      modes: modes.rows.map(formatGoalMode),
      milestones: milestones.rows.map((row) => ({
        modeKey: row.mode_key,
        id: row.id,
        title: row.title,
        detail: row.detail,
        dueDate: row.due_date,
        status: row.status,
        weight: Number(row.weight),
      })),
    })
  } catch (error) {
    next(error)
  }
})

app.get('/api/goal-modes/:modeKey/learning-module', async (request, response, next) => {
  try {
    const context = await resolveContext(request, String(request.query.portal || 'student'))
    const requestedMode = String(request.params.modeKey || 'active')
    const modeResult = await pool.query(
      `select *
       from student_goal_modes
       where student_id = $1
         and course_id = $2
         and ($3 = 'active' or mode_key = $3)
       order by case when $3 = 'active' and is_active then 0 else 1 end, is_active desc, updated_at desc
       limit 1`,
      [context.studentId, context.courseId, requestedMode],
    )
    const mode = modeResult.rows[0]
    if (!mode) {
      response.status(404).json({ error: 'goal mode not found' })
      return
    }

    const resources = await queryResources(context, { limit: request.query.limit || 8 })
    const [milestonesResult, chunksResult, questionsResult, statsResult] = await Promise.all([
      pool.query(
        `select id, title, detail, due_date, status, weight, sort_order
         from student_goal_milestones
         where mode_id = $1
         order by sort_order, due_date
         limit 8`,
        [mode.id],
      ),
      pool.query(
        `select c.id, c.resource_id, r.title as resource_title, c.chunk_no, c.heading,
                left(c.body, 700) as body, c.page_ref, c.metadata
         from resource_chunks c
         join learning_resources r on r.id = c.resource_id
         where r.subject = (select subject from courses where id = $1)
           and r.grade = (select grade from courses where id = $1)
           and r.status = 'active'
         order by case when c.metadata->>'source' = 'ocr' then 0 else 1 end,
                  c.created_at desc,
                  c.chunk_no
         limit 10`,
        [context.courseId],
      ),
      pool.query(
        `select q.id, q.resource_id, r.title as resource_title, q.question_type, q.stem,
                q.difficulty_level, q.estimated_minutes, q.metadata
         from question_items q
         left join learning_resources r on r.id = q.resource_id
         where q.course_id = $1
         order by q.difficulty_level, q.created_at
        limit 10`,
        [context.courseId],
      ),
      pool.query(
        `select count(*)::int as resource_count,
                count(*) filter (where coalesce(ch.chunk_count, 0) > 0)::int as ready_resource_count,
                count(*) filter (where coalesce(r.metadata->>'ocrStatus', '') in ('partial', 'completed'))::int as ocr_resource_count
         from learning_resources r
         left join lateral (
           select count(*)::int as chunk_count
           from resource_chunks
           where resource_id = r.id
         ) ch on true
         where r.subject = (select subject from courses where id = $1)
           and r.grade = (select grade from courses where id = $1)
           and r.status = 'active'`,
        [context.courseId],
      ),
    ])

    const stats = statsResult.rows[0] || {}
    response.json({
      module: {
        mode: formatGoalMode(mode),
        readiness: {
          resourceCount: Number(stats.resource_count || resources.length),
          readyResourceCount: Number(stats.ready_resource_count || 0),
          ocrResourceCount: Number(stats.ocr_resource_count || 0),
          chunkCount: chunksResult.rows.length,
          questionCount: questionsResult.rows.length,
        },
        milestones: milestonesResult.rows.map((row) => ({
          id: row.id,
          modeKey: mode.mode_key,
          title: row.title,
          detail: row.detail,
          dueDate: row.due_date,
          status: row.status,
          weight: Number(row.weight),
        })),
        resources,
        ocrChunks: chunksResult.rows.map((row) => ({
          id: row.id,
          resourceId: row.resource_id,
          resourceTitle: row.resource_title,
          chunkNo: Number(row.chunk_no),
          heading: row.heading,
          body: row.body,
          pageRef: row.page_ref,
          metadata: row.metadata || {},
        })),
        questions: questionsResult.rows.map((row) => ({
          id: row.id,
          resourceId: row.resource_id,
          resourceTitle: row.resource_title,
          type: row.question_type,
          stem: row.stem,
          difficultyLevel: Number(row.difficulty_level),
          estimatedMinutes: row.estimated_minutes ? Number(row.estimated_minutes) : null,
          metadata: row.metadata || {},
        })),
      },
    })
  } catch (error) {
    next(error)
  }
})

app.post('/api/goal-modes/:modeKey/activate', async (request, response, next) => {
  const client = await pool.connect()
  try {
    const context = await resolveContext(request, String(request.query.portal || 'student'))
    requireWrite(context)
    await client.query('begin')
    const mode = await client.query(
      `select *
       from student_goal_modes
       where student_id = $1 and course_id = $2 and mode_key = $3
       for update`,
      [context.studentId, context.courseId, request.params.modeKey],
    )
    if (!mode.rows[0]) {
      await client.query('rollback')
      response.status(404).json({ error: 'goal mode not found' })
      return
    }

    await client.query(
      `update student_goal_modes
       set is_active = false, updated_at = now()
       where student_id = $1 and course_id = $2`,
      [context.studentId, context.courseId],
    )
    const activated = await client.query(
      `update student_goal_modes
       set is_active = true, updated_at = now()
       where id = $1
       returning *`,
      [mode.rows[0].id],
    )
    await client.query(
      `insert into student_activity_events
         (student_id, course_id, account_id, portal, page_key, action_type, action_label, entity_type, entity_id, payload)
       values ($1, $2, $3, $4, 'home', 'activate_goal_mode', $5, 'student_goal_mode', $6, $7)`,
      [
        context.studentId,
        context.courseId,
        context.accountId,
        context.portal,
        activated.rows[0].title,
        activated.rows[0].id,
        { modeKey: activated.rows[0].mode_key },
      ],
    )
    await client.query('commit')
    response.json(formatGoalMode(activated.rows[0]))
  } catch (error) {
    await client.query('rollback')
    next(error)
  } finally {
    client.release()
  }
})

app.get('/api/knowledge/search', async (request, response, next) => {
  try {
    const context = await resolveContext(request, String(request.query.portal || 'student'))
    const query = String(request.query.q || request.query.keyword || '').trim()
    if (!query) {
      response.status(400).json({ error: 'q is required' })
      return
    }
    const result = await queryKnowledgeSearch(context, query, { limit: request.query.limit || 10 })
    response.json({
      courseId: context.courseId,
      query: result.query,
      keywords: result.keywords,
      hits: result.hits.map((hit) => ({
        type: hit.type,
        id: hit.id,
        title: hit.title,
        excerpt: hit.excerpt,
        resourceId: hit.resourceId,
        resourceTitle: hit.resourceTitle,
        pageRef: hit.pageRef,
        chunkNo: hit.chunkNo,
        score: Math.round(hit.score),
        confidence: Number(hit.confidence.toFixed(2)),
        metadata: hit.metadata,
      })),
    })
  } catch (error) {
    next(error)
  }
})

app.get('/api/tutor/related-resources', async (request, response, next) => {
  try {
    const context = await resolveContext(request, String(request.query.portal || 'student'))
    const query = String(request.query.q || request.query.keyword || '').trim()
    if (!query) {
      response.status(400).json({ error: 'q is required' })
      return
    }
    const [knowledge, resources] = await Promise.all([
      queryKnowledgeSearch(context, query, { limit: request.query.limit || 8 }),
      queryResources(context, { keyword: query, limit: request.query.resourceLimit || 6 }),
    ])
    const resourceIdsFromKnowledge = new Set(knowledge.hits.map((hit) => hit.resourceId).filter(Boolean))
    const enrichedResources = resources.map((resource) => ({
      ...resource,
      relatedByKnowledgeHit: resourceIdsFromKnowledge.has(resource.id),
    }))
    response.json({
      query: knowledge.query,
      keywords: knowledge.keywords,
      resources: enrichedResources,
      knowledgeHits: knowledge.hits.slice(0, Math.min(Math.max(Number(request.query.limit || 8), 1), 12)).map((hit) => ({
        type: hit.type,
        id: hit.id,
        title: hit.title,
        excerpt: hit.excerpt,
        resourceId: hit.resourceId,
        resourceTitle: hit.resourceTitle,
        pageRef: hit.pageRef,
        chunkNo: hit.chunkNo,
        confidence: Number(hit.confidence.toFixed(2)),
      })),
    })
  } catch (error) {
    next(error)
  }
})

async function buildStudentPayload(context) {
  const [
    userResult,
    courseResult,
    plansResult,
    tasksResult,
    resourcesResult,
    profileResult,
    heatmapResult,
    metricsResult,
    suggestionsResult,
    syncResult,
    uiStateResult,
    goalModesResult,
    goalMilestonesResult,
  ] = await Promise.all([
    pool.query('select id, display_name, grade, avatar_label from app_users where id = $1', [context.studentId]),
    pool.query('select id, name, subject, grade from courses where id = $1', [context.courseId]),
    pool.query(
      `select id, to_char(start_time, 'HH24:MI') as start_time, to_char(end_time, 'HH24:MI') as end_time,
              title, detail, tag, estimated_minutes, status
       from study_plans
       where student_id = $1 and course_id = $2 and plan_date = current_date
       order by sort_order, start_time`,
      [context.studentId, context.courseId],
    ),
    pool.query(
      `select id, label, done
       from learning_tasks
       where student_id = $1 and course_id = $2
       order by sort_order, created_at`,
      [context.studentId, context.courseId],
    ),
    queryResources(context, { limit: 80 }),
    pool.query(
      `select label, current_score, class_average
       from student_profile_scores
       where student_id = $1 and course_id = $2
       order by sort_order`,
      [context.studentId, context.courseId],
    ),
    pool.query(
      `select chapter, point_no, mastery_level
       from knowledge_mastery
       where student_id = $1 and course_id = $2
       order by chapter, point_no`,
      [context.studentId, context.courseId],
    ),
    pool.query(
      `select metric_date, study_minutes, accuracy_rate, completion_rate, questions_done, mistakes_fixed
       from learning_metric_daily
       where student_id = $1 and course_id = $2
       order by metric_date`,
      [context.studentId, context.courseId],
    ),
    pool.query(
      `select audience, title, summary, action_label, priority, status
       from intervention_suggestions
       where student_id = $1 and course_id = $2
       order by priority desc, created_at desc`,
      [context.studentId, context.courseId],
    ),
    pool.query(
      `select actor_role, event_type, title, status, event_time, metadata
       from sync_events
       where student_id = $1
       order by event_time desc
       limit 12`,
      [context.studentId],
    ),
    pool.query(
      `select page_key, state_key, state_value, updated_at
       from student_ui_state
       where student_id = $1 and course_id = $2 and portal = $3
       order by page_key, state_key`,
      [context.studentId, context.courseId, context.portal],
    ),
    pool.query(
      `select *
       from student_goal_modes
       where student_id = $1 and course_id = $2
       order by is_active desc, updated_at desc, mode_key`,
      [context.studentId, context.courseId],
    ),
    pool.query(
      `select m.mode_key, sm.id, sm.title, sm.detail, sm.due_date, sm.status, sm.weight, sm.sort_order
       from student_goal_milestones sm
       join student_goal_modes m on m.id = sm.mode_id
       where m.student_id = $1 and m.course_id = $2
       order by m.mode_key, sm.sort_order, sm.due_date`,
      [context.studentId, context.courseId],
    ),
  ])

  const heatmapByChapter = new Map()
  for (const row of heatmapResult.rows) {
    if (!heatmapByChapter.has(row.chapter)) {
      heatmapByChapter.set(row.chapter, Array.from({ length: 8 }, () => 0))
    }
    heatmapByChapter.get(row.chapter)[Number(row.point_no) - 1] = Number(row.mastery_level)
  }

  const todayMinutes = metricsResult.rows.at(-1)?.study_minutes || 0
  const latestCompletion = metricsResult.rows.at(-1)?.completion_rate || 0
  const totalMinutes = metricsResult.rows.reduce((sum, row) => sum + Number(row.study_minutes), 0)
  const completeCount = tasksResult.rows.filter((row) => row.done).length
  const taskCount = tasksResult.rows.length || 1
  const avgAccuracy = Math.round(
    metricsResult.rows.reduce((sum, row) => sum + Number(row.accuracy_rate), 0) / Math.max(metricsResult.rows.length, 1),
  )
  const courses = await getCoursesForStudent(context.studentId)
  const report = await buildReportSummary(context, 'week')
  const metricDateSet = new Set(metricsResult.rows.map((row) => String(row.metric_date).slice(0, 10)))
  let streakDays = 0
  const dayCursor = new Date()
  while (metricDateSet.has(toIsoDate(dayCursor))) {
    streakDays += 1
    dayCursor.setDate(dayCursor.getDate() - 1)
  }

  return {
    context,
    student: userResult.rows[0],
    course: courseResult.rows[0],
    courses,
    hero: {
      streakDays: streakDays || Math.min(metricsResult.rows.length, 12),
      todayMinutes: Number(todayMinutes),
      growthPoints: Math.max(0, (report.summary.completedPlans * 120) + (report.summary.studyMinutes * 2) + (report.summary.averageAccuracy * 5)),
      progress: Number(latestCompletion) || Math.round((completeCount / taskCount) * 100),
      weeklyHours: report.summary.studyHours || Number((totalMinutes / 60).toFixed(1)),
      averageAccuracy: report.summary.averageAccuracy || avgAccuracy,
      mistakeCount: report.summary.mistakeCount,
    },
    tasks: plansResult.rows.map((row) => ({
      id: row.id,
      time: `${row.start_time}-${row.end_time || ''}`,
      title: row.title,
      detail: row.detail,
      minutes: Number(row.estimated_minutes),
      status: statusLabel[row.status] || '未开始',
      tag: row.tag,
    })),
    checklist: tasksResult.rows.map((row) => ({ id: row.id, label: row.label, done: row.done })),
    resources: resourcesResult,
    knowledge: profileResult.rows.map((row) => [row.label, Number(row.current_score)]),
    profileScores: profileResult.rows.map((row) => ({
      label: row.label,
      current: Number(row.current_score),
      average: Number(row.class_average),
    })),
    heatmap: Array.from(heatmapByChapter.entries()).map(([chapter, values]) => ({ chapter, values })),
    dailyMetrics: metricsResult.rows.map((row) => ({
      date: row.metric_date,
      studyMinutes: Number(row.study_minutes),
      accuracyRate: Number(row.accuracy_rate),
      completionRate: Number(row.completion_rate),
      questionsDone: Number(row.questions_done),
      mistakesFixed: Number(row.mistakes_fixed),
    })),
    suggestions: suggestionsResult.rows.map((row) => ({
      audience: row.audience,
      title: row.title,
      summary: row.summary,
      actionLabel: row.action_label,
      priority: Number(row.priority),
      status: row.status,
    })),
    syncEvents: syncResult.rows.map((row) => ({
      actorRole: row.actor_role,
      eventType: row.event_type,
      title: row.title,
      status: row.status,
      eventTime: row.event_time,
      metadata: row.metadata,
    })),
    uiState: groupUiState(uiStateResult.rows),
    goalModes: goalModesResult.rows.map(formatGoalMode),
    report,
    goalMilestones: goalMilestonesResult.rows.map((row) => ({
      modeKey: row.mode_key,
      id: row.id,
      title: row.title,
      detail: row.detail,
      dueDate: row.due_date,
      status: row.status,
      weight: Number(row.weight),
    })),
  }
}

function formatSession(row) {
  return {
    id: row.id,
    title: row.title,
    summary: row.summary,
    status: row.status,
    lastMessageAt: row.last_message_at,
    createdAt: row.created_at,
  }
}

function formatMessage(row) {
  return {
    id: row.id,
    role: row.role,
    content: row.content,
    metadata: row.metadata || {},
    createdAt: row.created_at,
  }
}

function formatStep(row) {
  return {
    id: row.id,
    stepNo: Number(row.step_no),
    title: row.title,
    body: row.body,
    hint: row.hint,
  }
}

function titleFromQuestion(content) {
  const text = String(content || '').replace(/\s+/g, ' ').trim()
  return text.length > 16 ? `${text.slice(0, 16)}...` : text || '新的辅导对话'
}

const tutorKeywordBank = [
  '二重积分',
  '三重积分',
  '极坐标',
  '换元',
  '雅可比',
  '积分限',
  '定积分',
  '不定积分',
  '微分方程',
  '微分',
  '导数',
  '偏导',
  '梯度',
  '极限',
  '连续',
  '函数',
  '级数',
  '矩阵',
  '行列式',
  '特征值',
  '特征向量',
  '向量',
  '线性相关',
  '概率',
  '分布',
  '期望',
  '方差',
]

function extractTutorKeywords(content) {
  const text = String(content || '').replace(/\s+/g, '')
  const keywords = tutorKeywordBank.filter((keyword) => text.includes(keyword))
  const cleaned = text.replace(/[^\u4e00-\u9fa5A-Za-z0-9]/g, '')
  if (cleaned.length >= 2 && cleaned.length <= 12) keywords.push(cleaned)
  return [...new Set(keywords)].slice(0, 8)
}

function compactText(value, maxLength = 180) {
  const text = String(value || '').replace(/\s+/g, ' ').trim()
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text
}

async function queryKnowledgeSearch(context, query, options = {}) {
  const keywords = extractTutorKeywords(query)
  const limit = Math.min(Math.max(Number(options.limit || 8), 1), 30)
  if (!keywords.length) return { query: String(query || ''), keywords, hits: [] }

  const chunkLimit = Math.min(limit, 12)
  const distillationLimit = Math.min(Math.ceil(limit / 2), 6)
  const questionLimit = Math.min(Math.ceil(limit / 2), 6)
  const pointLimit = Math.min(Math.ceil(limit / 2), 6)
  const [chunks, distillations, questions, points] = await Promise.all([
    pool.query(
      `select c.id, c.resource_id, r.title as resource_title, c.chunk_no, c.heading,
              left(c.body, 720) as body, c.page_ref, c.metadata,
              (
                select count(*)::int
                from unnest($2::text[]) keyword
                where c.heading ilike '%' || keyword || '%'
                   or c.body ilike '%' || keyword || '%'
                   or coalesce(c.page_ref, '') ilike '%' || keyword || '%'
              ) as hit_score
       from resource_chunks c
       join learning_resources r on r.id = c.resource_id
       join courses course on course.id = $1
       where r.subject = course.subject
         and r.grade = course.grade
         and r.status = 'active'
         and exists (
           select 1
           from unnest($2::text[]) keyword
           where c.heading ilike '%' || keyword || '%'
              or c.body ilike '%' || keyword || '%'
              or coalesce(c.page_ref, '') ilike '%' || keyword || '%'
         )
       order by hit_score desc,
                case when c.metadata->>'source' = 'ocr' then 0 else 1 end,
                case
                  when replace(c.body, ' ', '') ilike '%目录%'
                    or replace(c.body, ' ', '') ilike '%内容提要%'
                    or replace(c.body, ' ', '') ilike '%编写说明%'
                  then 1 else 0
                end,
                case
                  when coalesce(nullif(regexp_replace(coalesce(c.page_ref, ''), '[^0-9]', '', 'g'), ''), '0')::int <= 10
                  then 1 else 0
                end,
                case when c.heading <> '' then 0 else 1 end,
                r.published_at desc nulls last,
                c.chunk_no
       limit $3`,
      [context.courseId, keywords, chunkLimit],
    ),
    pool.query(
      `select d.id, d.resource_id, r.title as resource_title, d.distillation_type,
              d.content, d.confidence, d.updated_at,
              (
                select count(*)::int
                from unnest($2::text[]) keyword
                where d.content::text ilike '%' || keyword || '%'
              ) as hit_score
       from resource_distillations d
       join learning_resources r on r.id = d.resource_id
       where d.course_id = $1
         and d.status = 'ready'
         and exists (
           select 1
           from unnest($2::text[]) keyword
           where d.content::text ilike '%' || keyword || '%'
         )
       order by hit_score desc, d.confidence desc, d.updated_at desc
       limit $3`,
      [context.courseId, keywords, distillationLimit],
    ),
    pool.query(
      `select q.id, q.resource_id, r.title as resource_title, q.question_type,
              q.stem, q.solution, q.difficulty_level, q.estimated_minutes,
              kp.title as knowledge_title,
              (
                select count(*)::int
                from unnest($2::text[]) keyword
                where q.stem ilike '%' || keyword || '%'
                   or q.solution ilike '%' || keyword || '%'
                   or coalesce(kp.title, '') ilike '%' || keyword || '%'
              ) as hit_score
       from question_items q
       left join learning_resources r on r.id = q.resource_id
       left join course_knowledge_points kp on kp.id = q.knowledge_point_id
       where q.course_id = $1
         and exists (
           select 1
           from unnest($2::text[]) keyword
           where q.stem ilike '%' || keyword || '%'
              or q.solution ilike '%' || keyword || '%'
              or coalesce(kp.title, '') ilike '%' || keyword || '%'
         )
       order by hit_score desc, q.difficulty_level, q.created_at desc
       limit $3`,
      [context.courseId, keywords, questionLimit],
    ),
    pool.query(
      `select kp.id, kp.code, kp.title, kp.description, kp.module, kp.difficulty_level,
              kp.importance,
              (
                select count(*)::int
                from unnest($2::text[]) keyword
                where kp.title ilike '%' || keyword || '%'
                   or kp.description ilike '%' || keyword || '%'
                   or kp.module ilike '%' || keyword || '%'
                   or kp.code ilike '%' || keyword || '%'
              ) as hit_score
       from course_knowledge_points kp
       where kp.course_id = $1
         and exists (
           select 1
           from unnest($2::text[]) keyword
           where kp.title ilike '%' || keyword || '%'
              or kp.description ilike '%' || keyword || '%'
              or kp.module ilike '%' || keyword || '%'
              or kp.code ilike '%' || keyword || '%'
         )
       order by hit_score desc, kp.importance desc, kp.sort_order
       limit $3`,
      [context.courseId, keywords, pointLimit],
    ),
  ])

  const hits = [
    ...chunks.rows.map((row) => ({
      type: 'resource_chunk',
      id: row.id,
      resourceId: row.resource_id,
      resourceTitle: row.resource_title,
      title: row.heading || row.resource_title,
      excerpt: compactText(row.body, 260),
      pageRef: row.page_ref || '',
      chunkNo: Number(row.chunk_no),
      score: Number(row.hit_score || 1) * 20 + (row.metadata?.source === 'ocr' ? 8 : 0),
      confidence: Math.min(0.96, 0.62 + Number(row.hit_score || 1) * 0.08),
      metadata: row.metadata || {},
    })),
    ...distillations.rows.map((row) => ({
      type: 'resource_distillation',
      id: row.id,
      resourceId: row.resource_id,
      resourceTitle: row.resource_title,
      title: `${row.resource_title} · ${row.distillation_type}`,
      excerpt: compactText(row.content?.summary || row.content?.text || row.content?.outline || JSON.stringify(row.content || {}), 260),
      pageRef: '',
      chunkNo: null,
      score: Number(row.hit_score || 1) * 16 + Number(row.confidence || 0.7) * 10,
      confidence: Number(row.confidence || 0.7),
      metadata: { distillationType: row.distillation_type },
    })),
    ...questions.rows.map((row) => ({
      type: 'question',
      id: row.id,
      resourceId: row.resource_id,
      resourceTitle: row.resource_title || '',
      title: row.knowledge_title || '练习题',
      excerpt: compactText(`${row.stem} ${row.solution || ''}`, 260),
      pageRef: '',
      chunkNo: null,
      score: Number(row.hit_score || 1) * 14 + Math.max(0, 6 - Number(row.difficulty_level || 3)),
      confidence: 0.68,
      metadata: {
        questionType: row.question_type,
        difficultyLevel: Number(row.difficulty_level),
        estimatedMinutes: row.estimated_minutes ? Number(row.estimated_minutes) : null,
      },
    })),
    ...points.rows.map((row) => ({
      type: 'knowledge_point',
      id: row.id,
      resourceId: null,
      resourceTitle: '',
      title: row.title,
      excerpt: compactText(row.description || row.module || row.code, 260),
      pageRef: '',
      chunkNo: null,
      score: Number(row.hit_score || 1) * 12 + Number(row.importance || 3),
      confidence: 0.64,
      metadata: {
        code: row.code,
        module: row.module,
        difficultyLevel: Number(row.difficulty_level),
        importance: Number(row.importance),
      },
    })),
  ]

  hits.sort((a, b) => b.score - a.score)
  return { query: String(query || ''), keywords, hits: hits.slice(0, limit) }
}

async function queryTutorContexts(context, content, limit = 4) {
  const result = await queryKnowledgeSearch(context, content, { limit: Math.min(Math.max(Number(limit || 4), 1), 8) })
  return result.hits
    .filter((hit) => ['resource_chunk', 'resource_distillation', 'knowledge_point'].includes(hit.type))
    .slice(0, limit)
    .map((hit) => ({
      resourceId: hit.resourceId,
      resourceTitle: hit.resourceTitle || hit.title,
      chunkNo: hit.chunkNo,
      heading: hit.title || '',
      pageRef: hit.pageRef || '',
      excerpt: compactText(hit.excerpt, 180),
      confidence: hit.confidence,
      keywords: result.keywords,
      sourceType: hit.type,
    }))
}

function buildContextLead(citations) {
  if (!citations.length) return ''
  const first = citations[0]
  const page = first.pageRef ? ` ${first.pageRef}` : ''
  return `我先参考了《${first.resourceTitle}》${page} 附近的本地教材片段。`
}

function buildFallbackTutorAnswer(content, actionType = 'ask', citations = []) {
  const text = String(content || '').trim()
  const contextLead = buildContextLead(citations)
  if (actionType === 'similar_question') {
    return {
      reply: `${contextLead}给你一个同类型小题：把区域 x² + y² ≤ 4 且 x ≥ 0 改写成极坐标积分区域。先判断 θ 的范围，再判断 r 的范围，最后写出面积微元。`.trim(),
      steps: [
        ['识别区域', 'x² + y² ≤ 4 表示半径不超过 2 的圆盘，x ≥ 0 表示右半平面。', '先画出右半圆。'],
        ['选择范围', '右半圆对应 θ 从 -π/2 到 π/2，半径 r 从 0 到 2。', '角度范围来自 x ≥ 0。'],
        ['写出积分元', '极坐标下 dxdy = r dr dθ，写积分时要把 r 放进去。', '检查有没有漏掉 r。'],
      ],
    }
  }
  if (actionType === 'still_confused') {
    return {
      reply: `${contextLead}我们把它放慢：换元不是随便替换字母，而是用新的坐标重新描述同一个积分区域。区域没变，边界的表达方式变了，所以积分限也要跟着变。`.trim(),
      steps: [
        ['先固定区域', '先把原来的 x-y 区域画出来，确认你积分的是哪一块面积。', '区域图比公式更重要。'],
        ['再换语言', '直角坐标用 x、y 描述点，极坐标用 r、θ 描述点。', '同一个点可以有两套描述。'],
        ['最后检查面积元', '坐标语言换了，面积小块的形状也变了，所以 dxdy 要变成 r dr dθ。', 'r 是伸缩因子。'],
      ],
    }
  }
  if (actionType === 'explain_again') {
    return {
      reply: `${contextLead}把二重积分区域想成地图：直角坐标像用横纵街道定位，极坐标像用方向和距离定位。地图没变，但地址写法变了，所以积分限要重写。`.trim(),
      steps: [
        ['看地图形状', '圆形、扇形、半径边界通常适合极坐标。', '看到 x² + y² 就留意。'],
        ['换定位方式', '用 r 表示离原点的距离，用 θ 表示方向。', '先定角度，再定半径。'],
        ['保持面积一致', '用 r dr dθ 补偿坐标变换带来的面积伸缩。', '这是换元公式的核心。'],
      ],
    }
  }
  const defaultReply = text.includes('特征值')
    ? '我们先不急着算行列式。特征值问题先抓住一句话：矩阵作用后，某些向量方向不变，只是被拉伸或压缩。接下来可以从 Ax = λx 这个结构拆。'
    : text.includes('微分') || text.includes('导数') || text.includes('函数')
      ? '我们先把“函数变化”拆成两层：导数描述某一点附近的变化率，微分则用线性主部近似函数的小变化。先看定义条件，再看它服务于计算还是证明。'
      : '我先不直接给答案。我们用三步拆二重积分换元：先观察积分区域形状，再选择直角坐标或极坐标，最后把积分限和面积微元一起改写。'
  return {
    reply: `${contextLead}${defaultReply}`.trim(),
    steps: citations.length ? [
      ['定位教材依据', `先看本地教材中与“${citations[0].keywords?.slice(0, 3).join('、') || '当前问题'}”相关的片段，标出定义、条件和适用范围。`, '不要急着套公式，先确认关键词。'],
      ['拆开核心关系', '把题目里的已知量、目标量和公式条件分开，判断是哪一个环节让你卡住。', '卡住的位置通常在条件或变量含义。'],
      ['再回到题目', '用教材片段中的定义或例题结构对照你的题目，逐步写出推理，而不是直接抄结论。', '每一步都问：这一步依据是什么？'],
    ] : [
      ['观察条件', '先把题目里的区域边界、变量范围和函数形式分开，不急着积分。', '先画区域草图。'],
      ['寻找坐标系', '如果边界出现圆、扇形或 x² + y²，极坐标可能更简单；如果边界是直线框，直角坐标更直观。', '坐标系服务于区域。'],
      ['验证结果', '每改一次积分限，都检查是否覆盖原区域且没有重复或漏掉。', '最后别忘记雅可比因子。'],
    ],
  }
}

async function buildTutorAnswer(content, actionType = 'ask', context, sessionId, citations = []) {
  let userQuestion = String(content || '').trim()
  const actionLabels = {
    explain_again: '请换一个不同的角度，用另一种方式重新解释一下刚才讨论的问题。',
    similar_question: '请给我一道类似的知识点练习题，不要直接给答案，一步一步引导我。',
    still_confused: '我还是不太懂刚才的内容，请用更简单、更基础的方式再说一遍，可以配合生活化的类比。',
  }

  if (actionType && actionType !== 'ask' && actionLabels[actionType]) {
    userQuestion = actionLabels[actionType]
  }
  if (!userQuestion) userQuestion = '你好，请帮我解答一个问题。'

  let history = []
  try {
    const historyResult = await pool.query(
      `select role, content
       from chat_messages
       where session_id = $1
       order by created_at asc`,
      [sessionId],
    )
    history = historyResult.rows
  } catch (error) {
    console.error('Failed to fetch chat history:', error.message)
  }

  const profile = await fetchStudentProfile(pool, context.studentId, context.courseId)
  const knowledgeChunks = citations.map((item) => ({
    chapter: item.resourceTitle,
    knowledgePoint: item.heading || item.pageRef || '本地教材片段',
    title: item.heading || item.resourceTitle,
    content: item.excerpt,
  }))

  try {
    return await chatCompletion(history, userQuestion, profile, knowledgeChunks)
  } catch (error) {
    console.error('LLM call failed, using fallback:', error.message)
    return buildFallbackTutorAnswer(userQuestion, actionType, citations)
  }
}

async function buildTutorAnswerStream(content, actionType = 'ask', context, sessionId, citations = [], onReplyDelta = () => {}) {
  let userQuestion = String(content || '').trim()
  const actionLabels = {
    explain_again: '请换一个不同的角度，用另一种方式重新解释一下刚才讨论的问题。',
    similar_question: '请给我一道类似的知识点练习题，不要直接给答案，一步一步引导我。',
    still_confused: '我还是不太懂刚才的内容，请用更简单、更基础的方式再说一遍，可以配合生活化的类比。',
  }
  if (actionType && actionType !== 'ask' && actionLabels[actionType]) userQuestion = actionLabels[actionType]
  if (!userQuestion) userQuestion = '你好，请帮我解答一个问题。'

  let history = []
  try {
    const historyResult = await pool.query(
      `select role, content
       from chat_messages
       where session_id = $1
       order by created_at asc`,
      [sessionId],
    )
    history = historyResult.rows
  } catch (error) {
    console.error('Failed to fetch chat history:', error.message)
  }

  const profile = await fetchStudentProfile(pool, context.studentId, context.courseId)
  const knowledgeChunks = citations.map((item) => ({
    chapter: item.resourceTitle,
    knowledgePoint: item.heading || item.pageRef || '本地教材片段',
    title: item.heading || item.resourceTitle,
    content: item.excerpt,
  }))

  try {
    return await chatCompletionStream(history, userQuestion, profile, knowledgeChunks, onReplyDelta)
  } catch (error) {
    if (error.message === 'client aborted') throw error
    console.error('LLM stream failed, using fallback:', error.message)
    const fallback = buildFallbackTutorAnswer(userQuestion, actionType, citations)
    for (const char of fallback.reply) onReplyDelta(char)
    return fallback
  }
}

async function ensureTutorSession(context, requestedSessionId, titleSeed) {
  if (requestedSessionId) {
    const existing = await pool.query(
      `select *
       from chat_sessions
       where id = $1 and student_id = $2 and course_id = $3 and status = 'active'
       limit 1`,
      [requestedSessionId, context.studentId, context.courseId],
    )
    if (existing.rows[0]) return existing.rows[0]
  }

  const latest = await pool.query(
    `select *
     from chat_sessions
     where student_id = $1 and course_id = $2 and status = 'active'
     order by last_message_at desc, created_at desc
     limit 1`,
    [context.studentId, context.courseId],
  )
  if (latest.rows[0]) return latest.rows[0]

  const created = await pool.query(
    `insert into chat_sessions (student_id, course_id, title, summary)
     values ($1, $2, $3, $4)
     returning *`,
    [context.studentId, context.courseId, titleFromQuestion(titleSeed), '新的 AI 辅导对话'],
  )
  return created.rows[0]
}

async function createTutorSession(context, titleSeed = '') {
  const created = await pool.query(
    `insert into chat_sessions (student_id, course_id, title, summary)
     values ($1, $2, $3, $4)
     returning *`,
    [context.studentId, context.courseId, titleFromQuestion(titleSeed) || '新的辅导对话', '新的 AI 辅导对话'],
  )
  return created.rows[0]
}

async function replaceGuidanceSteps(sessionId, steps) {
  for (let index = 0; index < steps.length; index += 1) {
    const [title, body, hint] = steps[index]
    await pool.query(
      `insert into chat_guidance_steps (session_id, step_no, title, body, hint)
       values ($1, $2, $3, $4, $5)
       on conflict (session_id, step_no) do update
       set title = excluded.title,
           body = excluded.body,
           hint = excluded.hint`,
      [sessionId, index + 1, title, body, hint],
    )
  }
  await pool.query('delete from chat_guidance_steps where session_id = $1 and step_no > $2', [sessionId, steps.length])
}

async function buildTutorPayload(context, requestedSessionId, limit = 6) {
  const session = await ensureTutorSession(context, requestedSessionId)
  const [sessionsResult, messagesResult, stepsResult, actionResult] = await Promise.all([
    pool.query(
      `select *
       from chat_sessions
       where student_id = $1 and course_id = $2 and status = 'active'
       order by last_message_at desc, created_at desc
       limit $3`,
      [context.studentId, context.courseId, limit],
    ),
    pool.query(
      `select id, role, content, metadata, created_at
       from chat_messages
       where session_id = $1
       order by created_at asc`,
      [session.id],
    ),
    pool.query(
      `select id, step_no, title, body, hint
       from chat_guidance_steps
       where session_id = $1
       order by step_no`,
      [session.id],
    ),
    pool.query(
      `select action_type, action_label, payload, created_at
       from chat_action_logs
       where session_id = $1
       order by created_at desc
       limit 8`,
      [session.id],
    ),
  ])

  return {
    activeSession: formatSession(session),
    sessions: sessionsResult.rows.map(formatSession),
    messages: messagesResult.rows.map(formatMessage),
    guidanceSteps: stepsResult.rows.map(formatStep),
    actionLogs: actionResult.rows.map((row) => ({
      actionType: row.action_type,
      actionLabel: row.action_label,
      payload: row.payload || {},
      createdAt: row.created_at,
    })),
    quickActions: [
      { type: 'explain_again', label: '换个角度解释' },
      { type: 'similar_question', label: '给我一个类似题' },
      { type: 'still_confused', label: '仍然不懂' },
    ],
  }
}

app.get('/api/tutor', async (request, response, next) => {
  try {
    const context = await resolveContext(request, String(request.query.portal || 'student'))
    const payload = await buildTutorPayload(context, request.query.sessionId, Number(request.query.limit || 6))
    response.json(payload)
  } catch (error) {
    next(error)
  }
})

app.post('/api/tutor/sessions', async (request, response, next) => {
  try {
    const context = await resolveContext(request, String(request.query.portal || 'student'))
    requireWrite(context)
    const session = await createTutorSession(context, request.body?.title || '新的辅导对话')
    response.status(201).json(await buildTutorPayload(context, session.id, Number(request.query.limit || 6)))
  } catch (error) {
    next(error)
  }
})

app.post('/api/tutor/messages', async (request, response, next) => {
  try {
    const context = await resolveContext(request, String(request.query.portal || 'student'))
    requireWrite(context)

    const content = String(request.body?.content || '').trim()
    if (!content) {
      response.status(400).json({ error: 'content is required' })
      return
    }

    const session = await ensureTutorSession(context, request.body?.sessionId, content)
    const citations = await queryTutorContexts(context, content)
    const answer = await buildTutorAnswer(content, 'ask', context, session.id, citations)
    await pool.query(
      `insert into chat_messages (session_id, student_id, course_id, role, content, metadata)
       values ($1, $2, $3, 'student', $4, '{"source":"student_input"}'::jsonb)`,
      [session.id, context.studentId, context.courseId, content],
    )
    await pool.query(
      `insert into chat_messages (session_id, student_id, course_id, role, content, metadata)
       values ($1, $2, $3, 'assistant', $4, $5)`,
      [
        session.id,
        context.studentId,
        context.courseId,
        answer.reply,
        {
          mode: 'guided',
          contextSource: citations.length ? 'resource_chunks' : 'fallback_template',
          citations,
        },
      ],
    )
    await replaceGuidanceSteps(session.id, answer.steps)
    await pool.query(
      `update chat_sessions
       set title = case when title = '新的辅导对话' then $4 else title end,
           summary = $5,
           last_message_at = now(),
           updated_at = now()
       where id = $1 and student_id = $2 and course_id = $3`,
      [session.id, context.studentId, context.courseId, titleFromQuestion(content), answer.reply.slice(0, 80)],
    )

    response.status(201).json(await buildTutorPayload(context, session.id))
  } catch (error) {
    next(error)
  }
})

app.post('/api/tutor/messages/stream', async (request, response, next) => {
  let streamStarted = false
  let clientClosed = false
  let responseEnded = false
  response.on('close', () => {
    if (!responseEnded) clientClosed = true
  })
  const sendEvent = (payload) => {
    if (response.destroyed || clientClosed) return
    response.write(`data: ${JSON.stringify(payload)}\n\n`)
  }
  try {
    const context = await resolveContext(request, String(request.query.portal || 'student'))
    requireWrite(context)

    const content = String(request.body?.content || '').trim()
    if (!content) {
      response.status(400).json({ error: 'content is required' })
      return
    }

    response.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    })
    streamStarted = true

    const session = await ensureTutorSession(context, request.body?.sessionId, content)
    const citations = await queryTutorContexts(context, content)
    sendEvent({ type: 'start', sessionId: session.id, citations })

    const answer = await buildTutorAnswerStream(content, 'ask', context, session.id, citations, (delta) => {
      if (clientClosed) throw new Error('client aborted')
      if (delta) sendEvent({ type: 'delta', delta })
    })
    if (clientClosed) return

    await pool.query(
      `insert into chat_messages (session_id, student_id, course_id, role, content, metadata)
       values ($1, $2, $3, 'student', $4, '{"source":"student_input"}'::jsonb)`,
      [session.id, context.studentId, context.courseId, content],
    )
    await pool.query(
      `insert into chat_messages (session_id, student_id, course_id, role, content, metadata)
       values ($1, $2, $3, 'assistant', $4, $5)`,
      [
        session.id,
        context.studentId,
        context.courseId,
        answer.reply,
        {
          mode: 'guided_stream',
          contextSource: citations.length ? 'resource_chunks' : 'fallback_template',
          citations,
        },
      ],
    )
    await replaceGuidanceSteps(session.id, answer.steps)
    await pool.query(
      `update chat_sessions
       set title = case when title = '新的辅导对话' then $4 else title end,
           summary = $5,
           last_message_at = now(),
           updated_at = now()
       where id = $1 and student_id = $2 and course_id = $3`,
      [session.id, context.studentId, context.courseId, titleFromQuestion(content), answer.reply.slice(0, 80)],
    )

    sendEvent({ type: 'final', payload: await buildTutorPayload(context, session.id) })
    sendEvent({ type: 'done' })
    responseEnded = true
    response.end()
  } catch (error) {
    if (streamStarted) {
      sendEvent({ type: 'error', error: error.message || 'stream failed' })
      responseEnded = true
      response.end()
      return
    }
    next(error)
  }
})

app.post('/api/tutor/actions', async (request, response, next) => {
  try {
    const context = await resolveContext(request, String(request.query.portal || 'student'))
    requireWrite(context)

    const actionType = String(request.body?.actionType || '')
    const actionLabel = String(request.body?.actionLabel || actionType)
    const session = await ensureTutorSession(context, request.body?.sessionId, actionLabel)

    await pool.query(
      `insert into chat_action_logs (session_id, student_id, course_id, action_type, action_label, payload)
       values ($1, $2, $3, $4, $5, $6)`,
      [session.id, context.studentId, context.courseId, actionType, actionLabel, request.body?.payload || {}],
    )

    if (actionType === 'clear_history') {
      await pool.query(
        `update chat_sessions
         set status = 'archived', updated_at = now()
         where student_id = $1 and course_id = $2 and status = 'active'`,
        [context.studentId, context.courseId],
      )
      response.json(await buildTutorPayload(context, null))
      return
    }

    if (['explain_again', 'similar_question', 'still_confused'].includes(actionType)) {
      const latestStudent = await pool.query(
        `select content
         from chat_messages
         where session_id = $1 and student_id = $2 and role = 'student'
         order by created_at desc
         limit 1`,
        [session.id, context.studentId],
      )
      const seed = latestStudent.rows[0]?.content || actionLabel
      const citations = await queryTutorContexts(context, seed)
      const answer = await buildTutorAnswer(seed, actionType, context, session.id, citations)
      await pool.query(
        `insert into chat_messages (session_id, student_id, course_id, role, content, metadata)
         values ($1, $2, $3, 'assistant', $4, $5)`,
        [
          session.id,
          context.studentId,
          context.courseId,
          answer.reply,
          {
            actionType,
            mode: 'guided',
            contextSource: citations.length ? 'resource_chunks' : 'fallback_template',
            citations,
          },
        ],
      )
      await replaceGuidanceSteps(session.id, answer.steps)
      await pool.query('update chat_sessions set summary = $2, last_message_at = now(), updated_at = now() where id = $1', [
        session.id,
        answer.reply.slice(0, 80),
      ])
    }

    response.json(await buildTutorPayload(context, session.id))
  } catch (error) {
    next(error)
  }
})

app.get('/api/plans', async (request, response, next) => {
  try {
    const context = await resolveContext(request, String(request.query.portal || 'student'))
    let planDate = request.query.date
    if (!planDate) {
      const latest = await pool.query(
        `select to_char(plan_date, 'YYYY-MM-DD') as plan_date
         from study_plans
         where student_id = $1 and course_id = $2
         order by plan_date desc
         limit 1`,
        [context.studentId, context.courseId],
      )
      planDate = latest.rows[0]?.plan_date || new Date().toISOString().slice(0, 10)
    }
    const result = await pool.query(
      `select id, to_char(start_time, 'HH24:MI') as start_time, to_char(end_time, 'HH24:MI') as end_time,
              title, detail, tag, estimated_minutes, status, source, metadata
       from study_plans
       where student_id = $1 and course_id = $2 and plan_date = $3::date
       order by sort_order, start_time, created_at`,
      [context.studentId, context.courseId, planDate],
    )
    response.json({ date: planDate, tasks: result.rows.map(formatStudyPlan) })
  } catch (error) {
    next(error)
  }
})

app.post('/api/plans/generate', async (request, response, next) => {
  const client = await pool.connect()
  try {
    const context = await resolveContext(request, String(request.query.portal || 'student'))
    requireWrite(context)

    const engine = await buildPlanEngineContext(context)
    const drafts = buildGeneratedPlanDrafts(engine, {
      startDate: request.body?.startDate || request.body?.planDate,
      days: request.body?.days,
      startTime: request.body?.startTime,
      dailyMinutes: request.body?.dailyMinutes,
    })
    const previewOnly = Boolean(request.body?.previewOnly)
    const replaceExisting = Boolean(request.body?.replaceExisting)

    if (previewOnly) {
      response.json({
        mode: engine.mode ? formatGoalMode(engine.mode) : null,
        basis: {
          lowDimensions: engine.lowDimensions,
          weakChapters: engine.weakChapters,
          latestMetric: engine.latestMetric,
          suggestionCount: engine.suggestions.length,
        },
        plans: drafts.map((draft) => ({
          ...draft,
          minutes: draft.estimatedMinutes,
          status: '未开始',
        })),
      })
      return
    }

    await client.query('begin')
    if (replaceExisting && drafts.length) {
      await client.query(
        `delete from study_plans
         where student_id = $1
           and course_id = $2
           and source = 'ai'
           and plan_date between $3::date and $4::date`,
        [context.studentId, context.courseId, drafts[0].planDate, drafts[drafts.length - 1].planDate],
      )
    }

    const inserted = await insertPlanDrafts(client, context, drafts)
    await client.query(
      `insert into intervention_suggestions
         (student_id, course_id, audience, title, summary, action_label, priority, status)
       values ($1, $2, 'student', 'AI 学习计划已生成', $3, '查看计划', 88, 'pending')`,
      [
        context.studentId,
        context.courseId,
        `已根据${engine.strategy.label}目标、画像薄弱维度和推荐资源生成 ${inserted.length} 个计划任务。`,
      ],
    )
    await client.query(
      `insert into sync_events (student_id, actor_role, event_type, title, status, metadata)
       values ($1, 'admin', 'plan_generated', 'AI 生成学习计划', 'success', $2::jsonb)`,
      [context.studentId, JSON.stringify({ courseId: context.courseId, count: inserted.length, replaceExisting })],
    )
    await client.query('commit')

    response.status(201).json({
      mode: engine.mode ? formatGoalMode(engine.mode) : null,
      basis: {
        lowDimensions: engine.lowDimensions,
        weakChapters: engine.weakChapters,
        latestMetric: engine.latestMetric,
        suggestionCount: engine.suggestions.length,
      },
      plans: inserted,
    })
  } catch (error) {
    await client.query('rollback')
    next(error)
  } finally {
    client.release()
  }
})

app.post('/api/plans/adjust', async (request, response, next) => {
  const client = await pool.connect()
  try {
    const context = await resolveContext(request, String(request.query.portal || 'student'))
    requireWrite(context)
    const engine = await buildPlanEngineContext(context)
    const pendingResult = await pool.query(
      `select id, resource_id, title, detail, tag, estimated_minutes, status, plan_date
       from study_plans
       where student_id = $1
         and course_id = $2
         and status in ('pending', 'active')
         and plan_date between current_date - interval '2 days' and current_date + interval '7 days'
       order by case when status = 'active' then 0 else 1 end, plan_date, sort_order, start_time
       limit 6`,
      [context.studentId, context.courseId],
    )
    const drafts = buildAdjustedPlanDrafts(engine, pendingResult.rows, {
      planDate: request.body?.planDate,
      startTime: request.body?.startTime,
    })
    const agentTaskId = String(request.body?.agentTaskId || '').trim()
    const sourceDetail = String(request.body?.source || '').trim()
    if (sourceDetail === 'agent_analysis' || agentTaskId) {
      drafts.forEach((draft) => {
        draft.metadata = {
          ...(draft.metadata || {}),
          sourceDetail: 'agent_analysis',
          sourceLabel: '智能体分析',
          agentTaskId: agentTaskId || null,
          reason: draft.reason,
        }
      })
    }
    const previewOnly = Boolean(request.body?.previewOnly)

    if (previewOnly) {
      response.json({
        adjustmentReason: drafts[0]?.reason || '',
        basis: {
          pendingCount: pendingResult.rows.length,
          lowDimensions: engine.lowDimensions,
          weakChapters: engine.weakChapters,
          latestMetric: engine.latestMetric,
        },
        plans: drafts.map((draft) => ({
          ...draft,
          minutes: draft.estimatedMinutes,
          status: '未开始',
        })),
      })
      return
    }

    await client.query('begin')
    const inserted = await insertPlanDrafts(client, context, drafts)
    await client.query(
      `insert into intervention_suggestions
         (student_id, course_id, audience, title, summary, action_label, priority, status)
       values ($1, $2, 'student', '学习计划已动态调整', $3, '查看调整任务', 92, 'pending')`,
      [
        context.studentId,
        context.courseId,
        drafts[0]?.reason || '根据近期学习表现自动追加补弱和续做任务。',
      ],
    )
    await client.query(
      `insert into sync_events (student_id, actor_role, event_type, title, status, metadata)
       values ($1, 'admin', 'plan_adjusted', '动态调整学习计划', 'success', $2::jsonb)`,
      [
        context.studentId,
        JSON.stringify({
          courseId: context.courseId,
          count: inserted.length,
          reason: drafts[0]?.reason || '',
          pendingCount: pendingResult.rows.length,
          source: sourceDetail || undefined,
          agentTaskId: agentTaskId || undefined,
        }),
      ],
    )
    await client.query('commit')

    response.status(201).json({
      adjustmentReason: drafts[0]?.reason || '',
      basis: {
        pendingCount: pendingResult.rows.length,
        lowDimensions: engine.lowDimensions,
        weakChapters: engine.weakChapters,
        latestMetric: engine.latestMetric,
      },
      plans: inserted,
    })
  } catch (error) {
    await client.query('rollback')
    next(error)
  } finally {
    client.release()
  }
})

app.post('/api/plans', async (request, response, next) => {
  try {
    const context = await resolveContext(request, String(request.query.portal || 'student'))
    requireWrite(context)

    const { time, startTime, endTime, planDate, title, minutes, detail, tag } = request.body || {}
    const start = startTime || time || '20:00'
    const date = planDate || new Date().toISOString().slice(0, 10)
    const estimatedMinutes = Number.parseInt(String(minutes || '20'), 10) || 20
    if (!title || !String(title).trim()) {
      response.status(400).json({ error: 'title is required' })
      return
    }
    const result = await pool.query(
      `insert into study_plans (student_id, course_id, plan_date, start_time, end_time, title, detail, tag, estimated_minutes, status, source)
       values ($1, $2, $3::date, $4::time, nullif($5, '')::time, $6, $7, $8, $9, 'pending', 'manual')
       returning id, to_char(start_time, 'HH24:MI') as start_time, to_char(end_time, 'HH24:MI') as end_time,
                 title, detail, tag, estimated_minutes, status`,
      [context.studentId, context.courseId, date, start, endTime || null, String(title).trim(), detail || '手动新增学习任务', tag || '学习任务', estimatedMinutes],
    )
    response.status(201).json(formatStudyPlan(result.rows[0]))
  } catch (error) {
    next(error)
  }
})

app.patch('/api/plans/:id/status', async (request, response, next) => {
  try {
    const context = await resolveContext(request, String(request.query.portal || 'student'))
    requireWrite(context)

    const status = String(request.body?.status || '').trim()
    if (!['pending', 'active', 'done', 'skipped'].includes(status)) {
      response.status(400).json({ error: 'invalid plan status' })
      return
    }

    const result = await pool.query(
      `update study_plans
       set status = $1, updated_at = now()
       where id = $2 and student_id = $3 and course_id = $4
       returning id, to_char(start_time, 'HH24:MI') as start_time, to_char(end_time, 'HH24:MI') as end_time,
                 title, detail, tag, estimated_minutes, status`,
      [status, request.params.id, context.studentId, context.courseId],
    )
    if (!result.rows[0]) {
      response.status(404).json({ error: 'plan not found' })
      return
    }
    response.json(formatStudyPlan(result.rows[0]))
  } catch (error) {
    next(error)
  }
})

app.delete('/api/plans/:id', async (request, response, next) => {
  try {
    const context = await resolveContext(request, String(request.query.portal || 'student'))
    requireWrite(context)

    const result = await pool.query(
      `delete from study_plans
       where id = $1 and student_id = $2 and course_id = $3
       returning id`,
      [request.params.id, context.studentId, context.courseId],
    )
    if (!result.rows[0]) {
      response.status(404).json({ error: 'plan not found' })
      return
    }
    response.json({ ok: true, id: result.rows[0].id })
  } catch (error) {
    next(error)
  }
})

app.patch('/api/tasks/:id/toggle', async (request, response, next) => {
  try {
    const context = await resolveContext(request, String(request.query.portal || 'student'))
    requireWrite(context)

    const result = await pool.query(
      `update learning_tasks
       set done = not done, updated_at = now()
       where id = $1 and student_id = $2
       returning id, label, done`,
      [request.params.id, context.studentId],
    )
    if (!result.rows[0]) {
      response.status(404).json({ error: 'task not found' })
      return
    }
    response.json(result.rows[0])
  } catch (error) {
    next(error)
  }
})

const distDir = path.resolve(__dirname, '..', '..', 'frontend', 'dist')
app.use(express.static(distDir))
app.get(/^(?!\/api).*/, (_request, response) => {
  response.sendFile(path.join(distDir, 'index.html'))
})

app.use((error, _request, response, _next) => {
  response.status(error.status || 500).json({ error: error.message })
})

app.listen(port, () => {
  console.log(`[A3 Backend] listening on http://127.0.0.1:${port}`)
  console.log(`[A3 Backend] LLM: ${config.llm.model} @ ${config.llm.baseURL}`)
})
