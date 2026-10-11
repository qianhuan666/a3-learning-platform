import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import {
  Bell,
  BookOpen,
  Bot,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock3,
  Download,
  ExternalLink,
  FileText,
  GraduationCap,
  Home,
  LibraryBig,
  LineChart,
  MessageSquare,
  Plus,
  RefreshCw,
  Search,
  Send,
  Target,
  Trash2,
  UserRound,
  X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import './App.css'

const MathSegmentRenderer = lazy(() => import('./components/MathSegmentRenderer'))

type PageKey = 'home' | 'profile' | 'plan' | 'resources' | 'tutor' | 'report'

type CourseOption = {
  id: string
  name: string
  subject: string
  grade: string
  is_default?: boolean
  status?: string
}

type AppSession = {
  account: { id: string; username: string; defaultPortal?: string }
  student?: { id: string; display_name?: string; displayName?: string; grade?: string; avatar_label?: string } | null
  portals: { portal: string; canRead: boolean; canWrite: boolean; canManage: boolean }[]
  courses: CourseOption[]
  defaultCourseId: string
  session?: { id?: string; token?: string; expiresAt?: string }
}

type LearningIntent = {
  task: Task
  source: 'home' | 'plan' | 'recommendation'
  mode: 'learn' | 'review'
  sessionId?: string
  sessionStatus?: 'started' | 'paused' | 'completed' | 'abandoned'
  targetMinutes?: number
  completedMinutes?: number
  completionScore?: number | null
  completionDefinition?: string
  completionReason?: string
  resourceId?: string
}

type NavItem = {
  key: PageKey
  label: string
  icon: LucideIcon
}

type Task = {
  id?: string
  resourceId?: string
  time: string
  title: string
  detail: string
  minutes: number
  status: '已完成' | '进行中' | '未开始'
  tag: string
  source?: string
  sourceDetail?: string
  sourceLabel?: string
  agentTaskId?: string
  reason?: string
}

type LearningSessionRecord = {
  id: string
  study_plan_id?: string | null
  resource_id?: string | null
  goal_mode_id?: string | null
  source: LearningIntent['source']
  mode: LearningIntent['mode']
  status: 'started' | 'paused' | 'completed' | 'abandoned'
  target_minutes?: number
  completed_minutes?: number
  completion_score?: number | null
  completion_definition?: string
  completion_reason?: string
  started_at?: string
  completed_at?: string | null
  ended_at?: string | null
  last_active_at?: string | null
}

type Resource = {
  id?: string
  title: string
  kind: string
  subject?: string
  grade?: string
  minutes: string
  reason: string
  stars: number
  action: string
  color: string
  resourceCode?: string
  matchScore?: number
  difficulty?: string
  openMode?: 'local-file' | 'external-link' | 'database' | string
  externalUrl?: string | null
  relativePath?: string | null
  pageCount?: number | null
  textLayer?: boolean
  ocrRequired?: boolean
  ocrStatus?: string | null
  ocrPagesDone?: number
  ocrChunkCount?: number
  ocrAverageConfidence?: number | null
  latestOcrJob?: OcrJob | null
  parseStatus?: string | null
  chunkCount?: number
  sourceCountry?: string | null
  distillationStatus?: string | null
  generatedQuestionCount?: number
  searchSnippet?: string
  searchPageRef?: string
  searchHitCount?: number
}

type ResourceChunk = {
  id: string
  chunkNo: number
  heading: string
  body: string
  pageRef?: string
}

type ResourceQuestion = {
  id: string
  type: string
  stem: string
  difficultyLevel: number
  estimatedMinutes?: number | null
}

type OcrJob = {
  status: string
  pageStart?: number | null
  pageEnd?: number | null
  processedPages: number
  totalPages: number
  outputChunkCount: number
  averageConfidence?: number | null
  errorMessage?: string
  createdAt?: string | null
  finishedAt?: string | null
}

type ResourceDetail = Resource & {
  sourceName?: string
  sourceType?: string
  summary?: string
  chunks?: ResourceChunk[]
  questions?: ResourceQuestion[]
  fileMeta?: Record<string, unknown>
  latestOcrJob?: OcrJob | null
  ocrStatus?: string | null
  ocrPagesDone?: number
  ocrChunkCount?: number
  ocrAverageConfidence?: number | null
}

type GoalMode = {
  id?: string
  modeKey: string
  title: string
  focusLabel: string
  description: string
  successMetric: string
  targetDate?: string
  weeklyHours: number
  progress: number
  isActive: boolean
  metrics?: Record<string, unknown>
}

type GoalMilestone = {
  id?: string
  modeKey: string
  title: string
  detail: string
  dueDate?: string
  status: 'pending' | 'active' | 'done' | 'blocked'
  weight: number
}

type LearningModule = {
  readiness: {
    resourceCount: number
    readyResourceCount: number
    ocrResourceCount: number
    chunkCount: number
    questionCount: number
  }
  resources: Resource[]
  ocrChunks: ResourceChunk[]
  questions: ResourceQuestion[]
}

type DashboardData = {
  courses?: CourseOption[]
  course?: CourseOption
  hero?: {
    streakDays: number
    todayMinutes: number
    growthPoints: number
    progress: number
    weeklyHours: number
    averageAccuracy: number
    mistakeCount: number
  }
  tasks?: Task[]
  resources?: Resource[]
  knowledge?: [string, number][]
  profileScores?: { label: string; current: number; average: number }[]
  dailyMetrics?: {
    date: string
    studyMinutes: number
    accuracyRate: number
    completionRate: number
    questionsDone: number
    mistakesFixed: number
  }[]
  suggestions?: { audience: string; title: string; summary: string; actionLabel: string; priority: number; status: string }[]
  uiState?: Record<string, Record<string, Record<string, unknown>>>
  goalModes?: GoalMode[]
  goalMilestones?: GoalMilestone[]
  report?: ReportSummary
}

type ReportSummary = {
  range: { period: string; start: string; end: string }
  summary: {
    studyMinutes: number
    studyHours: number
    completionRate: number
    averageAccuracy: number
    mistakeCount: number
    totalPlans?: number
    completedPlans?: number
  }
  trend: {
    date: string
    studyMinutes: number
    accuracyRate: number
    completionRate: number
    questionsDone: number
    mistakesFixed: number
  }[]
  mistakeBuckets: { mistakeType: string; count: number }[]
  sessions?: { status: string; count: number; completedMinutes: number }[]
  resources?: { status: string; count: number }[]
}

type AgentLog = {
  id: string
  taskId: string
  agentKey: string
  agentName: string
  stepNo: number
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped'
  inputSummary: string
  outputSummary: string
  suggestion: string
  confidence: number
  durationMs: number
  metadata?: Record<string, unknown>
  startedAt?: string
  completedAt?: string
  createdAt?: string
}

type AgentRunResult = {
  taskId: string
  status: string
  logs: AgentLog[]
  finalRecommendation?: {
    title: string
    summary: string
    nextAction: string
    focus: string
  }
}

type ChatSession = {
  id: string
  title: string
  summary: string
  lastMessageAt: string
}

type TutorCitation = {
  resourceId?: string
  resourceTitle: string
  chunkNo?: number | null
  heading?: string
  pageRef?: string
  excerpt: string
  confidence?: number
  keywords?: string[]
}

type KnowledgeHit = {
  type: string
  id: string
  title: string
  excerpt: string
  resourceId?: string | null
  resourceTitle?: string
  pageRef?: string
  chunkNo?: number | null
  confidence?: number
}

type RelatedTutorData = {
  query: string
  keywords: string[]
  resources: Resource[]
  knowledgeHits: KnowledgeHit[]
}

type ChatMessage = {
  id: string
  role: 'student' | 'assistant' | 'system'
  content: string
  metadata?: Record<string, unknown> & { citations?: TutorCitation[] }
  createdAt: string
}

type GuidanceStep = {
  id: string
  stepNo: number
  title: string
  body: string
  hint: string
}

type QuickAction = {
  type: string
  label: string
}

type TutorData = {
  activeSession: ChatSession
  sessions: ChatSession[]
  messages: ChatMessage[]
  guidanceSteps: GuidanceStep[]
  quickActions: QuickAction[]
}

const navItems: NavItem[] = [
  { key: 'home', label: '学习首页', icon: Home },
  { key: 'profile', label: '学习画像', icon: LineChart },
  { key: 'plan', label: '学习计划', icon: CalendarDays },
  { key: 'resources', label: '资源推荐', icon: LibraryBig },
  { key: 'tutor', label: '智能辅导', icon: Bot },
  { key: 'report', label: '学习报告', icon: FileText },
]

const tasks: Task[] = [
  { time: '19:00-19:15', title: '复习多元函数偏导与梯度', detail: '梳理偏导数、梯度方向和几何意义', minutes: 12, status: '已完成', tag: '概念复盘' },
  { time: '19:15-19:35', title: '完成 8 道二重积分换元练习', detail: '巩固极坐标换元与积分区域刻画', minutes: 18, status: '进行中', tag: '练习任务' },
  { time: '19:35-19:50', title: '线性代数特征值 3 题小测', detail: '判断矩阵特征值与特征向量关系', minutes: 15, status: '未开始', tag: '测评反馈' },
  { time: '19:50-20:00', title: '今日总结与错题回看', detail: '复盘积分区域和符号错误', minutes: 10, status: '未开始', tag: '错题复盘' },
]

const knowledge = [
  ['极限与连续', 85],
  ['导数与微分', 76],
  ['多元函数积分', 62],
  ['线性代数', 58],
  ['概率统计', 71],
  ['数学建模', 49],
] as const

const resources: Resource[] = [
  { title: '二重积分换元规则讲解', kind: '视频', minutes: '10 分钟', reason: '帮助你理解极坐标换元与积分区域刻画', stars: 3, action: '观看', color: 'blue' },
  { title: '高等数学二重积分专项练习', kind: '练习', minutes: '18 分钟', reason: '巩固积分区域拆分与变量替换', stars: 3, action: '开始练习', color: 'green' },
  { title: '特征值与特征向量速记', kind: '文档', minutes: '8 分钟', reason: '复习线性代数考试高频概念', stars: 2, action: '阅读', color: 'orange' },
  { title: '概率密度函数错题练 10 题', kind: '练习', minutes: '20 分钟', reason: '针对近期概率题错误强化训练', stars: 3, action: '开始练习', color: 'purple' },
  { title: '高数阶段测评：积分与级数', kind: '测评', minutes: '30 分钟', reason: '检测本章掌握情况，定位薄弱知识点', stars: 3, action: '开始测评', color: 'lime' },
  { title: '梯度方向动画演示', kind: '动画', minutes: '6 分钟', reason: '用动态图理解方向导数与梯度关系', stars: 2, action: '观看', color: 'sky' },
]

const fallbackGoalModes: GoalMode[] = [
  {
    modeKey: 'course_mastery',
    title: '课程掌握',
    focusLabel: '稳住 GPA',
    description: '围绕课程知识结构、作业表现和阶段测评，持续补齐薄弱模块。',
    successMetric: '期末成绩 85+，章节掌握度 80%+',
    weeklyHours: 7,
    progress: 62,
    isActive: true,
    metrics: { primaryMetric: '章节掌握度', risk: '积分区域刻画', nextReview: '2026-06-24' },
  },
  {
    modeKey: 'exam_sprint',
    title: '考试冲刺',
    focusLabel: '阶段提分',
    description: '把高频题型、错题模式和限时训练放到优先级最高。',
    successMetric: '两周内模拟卷正确率 82%+',
    weeklyHours: 9.5,
    progress: 48,
    isActive: false,
    metrics: { primaryMetric: '限时正确率', risk: '线代概念辨析', nextReview: '2026-06-22' },
  },
  {
    modeKey: 'research_project',
    title: '科研项目',
    focusLabel: '方法迁移',
    description: '把数学工具迁移到建模、论文阅读和小型实验复现，强调可交付成果。',
    successMetric: '完成 1 篇论文复现笔记和 1 个建模实验',
    weeklyHours: 6.5,
    progress: 35,
    isActive: false,
    metrics: { primaryMetric: '项目交付度', risk: '实验设计不稳定', nextReview: '2026-06-28' },
  },
  {
    modeKey: 'career_skill',
    title: '职业能力',
    focusLabel: '求职准备',
    description: '把课程能力转化为可展示的项目、面试题表达和数据分析基础能力。',
    successMetric: '整理 3 个作品集案例和 20 道面试题',
    weeklyHours: 5,
    progress: 28,
    isActive: false,
    metrics: { primaryMetric: '作品集完成度', risk: '表达结构不足', nextReview: '2026-07-02' },
  },
]

const sessionStorageKey = 'a3-auth-session'
const pageRoutes: Record<PageKey, string> = {
  home: '/',
  profile: '/profile',
  plan: '/plan',
  resources: '/resources',
  tutor: '/tutor',
  report: '/report',
}

let apiSession: AppSession | null = null
let apiCourseId = ''

function pageFromPath(pathname: string): PageKey {
  const matched = (Object.entries(pageRoutes) as [PageKey, string][]).find(([, route]) => route !== '/' && pathname.startsWith(route))
  return matched?.[0] || 'home'
}

function storeSession(session: AppSession | null) {
  if (!session) {
    window.localStorage.removeItem(sessionStorageKey)
    return
  }
  window.localStorage.setItem(sessionStorageKey, JSON.stringify(session))
}

function readStoredSession() {
  try {
    const raw = window.localStorage.getItem(sessionStorageKey)
    return raw ? JSON.parse(raw) as AppSession : null
  } catch {
    return null
  }
}

function setApiContext(session: AppSession | null, courseId: string) {
  apiSession = session
  apiCourseId = courseId
}

function apiUrl(path: string, params: Record<string, string | number | undefined | null> = {}, includeContext = true) {
  const search = new URLSearchParams()
  if (includeContext) {
    search.set('portal', 'student')
    if (apiCourseId) search.set('courseId', apiCourseId)
  }
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value))
  })
  const query = search.toString()
  return query ? `${path}?${query}` : path
}

function apiHeaders(init?: RequestInit) {
  const headers = new Headers(init?.headers)
  if (!headers.has('Content-Type') && init?.body) headers.set('Content-Type', 'application/json')
  const token = apiSession?.session?.token
  if (token) headers.set('Authorization', `Bearer ${token}`)
  return headers
}

function apiFetch(path: string, init: RequestInit = {}, params: Record<string, string | number | undefined | null> = {}, includeContext = true) {
  return fetch(apiUrl(path, params, includeContext), {
    ...init,
    headers: apiHeaders(init),
  })
}

function isUnauthorized(response: Response) {
  return response.status === 401 || response.status === 403
}

function recordActivity(payload: {
  pageKey: PageKey
  actionType: string
  actionLabel: string
  entityType?: string
  entityId?: string
  data?: Record<string, unknown>
}) {
  apiFetch('/api/activity-events', {
    method: 'POST',
    body: JSON.stringify(payload),
  }).catch(() => {
    // Event logging must never block the student flow.
  })
}

function saveUiState(pageKey: PageKey | 'global', stateKey: string, stateValue: Record<string, unknown>) {
  apiFetch('/api/ui-state', {
    method: 'POST',
    body: JSON.stringify({ pageKey, stateKey, stateValue }),
  }).catch(() => {
    // UI state persistence must not interrupt the student flow.
  })
}

async function createLearningSession(task: Task, source: LearningIntent['source'], mode: LearningIntent['mode']) {
  const response = await apiFetch('/api/learning-sessions', {
    method: 'POST',
    body: JSON.stringify({
      studyPlanId: task.id,
      resourceId: task.resourceId,
      source,
      mode,
      targetMinutes: task.minutes,
      metadata: { title: task.title, status: task.status, tag: task.tag, minutes: task.minutes },
    }),
  })
  if (!response.ok) throw new Error('create learning session failed')
  return response.json() as Promise<LearningSessionRecord>
}

async function finishLearningSession(sessionId: string, status: 'completed' | 'paused' | 'abandoned', task: Task) {
  const response = await apiFetch(`/api/learning-sessions/${sessionId}/finish`, {
    method: 'PATCH',
    body: JSON.stringify({
      status,
      completedMinutes: status === 'completed' ? task.minutes : Math.max(1, Math.round(task.minutes / 2)),
      reason: status === 'completed'
        ? `完成「${task.title}」学习目标`
        : status === 'paused'
          ? `暂存「${task.title}」学习进度`
          : `结束「${task.title}」学习`,
      outcome: { title: task.title, tag: task.tag, source: 'student-confirmed' },
    }),
  })
  if (!response.ok) throw new Error('finish learning session failed')
  return response.json() as Promise<{ session: LearningSessionRecord; dailyMetric?: Record<string, unknown>; goalMode?: GoalMode | null }>
}

function updateStudyPlanStatus(task: Task, status: 'pending' | 'active' | 'done' | 'skipped') {
  if (!task.id) return
  apiFetch(`/api/plans/${task.id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  }).catch(() => {
    // Status sync should not block entering the learning flow.
  })
}

function logResourceUsage(resource: Resource, status: 'opened' | 'started' = 'opened') {
  if (!resource.id) return
  apiFetch(`/api/resources/${resource.id}/usage`, {
    method: 'POST',
    body: JSON.stringify({
      actionLabel: resource.action,
      status,
      metadata: { title: resource.title, kind: resource.kind, minutes: resource.minutes, reason: resource.reason },
    }),
  }).catch(() => {
    // Usage logging is secondary to opening the resource path.
  })
}

function logReportExport(reportType: string, payload: Record<string, unknown>, range?: ReportSummary['range']) {
  apiFetch('/api/report-exports', {
    method: 'POST',
    body: JSON.stringify({ reportType, payload, range, generatedFrom: 'server' }),
  }).catch(() => {
    // Export should still download if the audit write fails.
  })
}

async function activateGoalMode(modeKey: string) {
  const response = await apiFetch(`/api/goal-modes/${modeKey}/activate`, {
    method: 'POST',
  })
  if (!response.ok) throw new Error('activate goal mode failed')
  return response.json() as Promise<GoalMode>
}

function App() {
  const [session, setSession] = useState<AppSession | null>(() => readStoredSession())
  const [authChecked, setAuthChecked] = useState(() => !session?.session?.token)
  const [page, setPage] = useState<PageKey>(() => pageFromPath(window.location.pathname))
  const [dashboard, setDashboard] = useState<DashboardData | null>(null)
  const [activeLearning, setActiveLearning] = useState<LearningIntent | null>(null)
  const [selectedCourseId, setSelectedCourseId] = useState(() => session?.defaultCourseId || session?.courses?.[0]?.id || '')
  const [appNotice, setAppNotice] = useState('')
  const activeNav = page

  const clearSession = useCallback(() => {
    storeSession(null)
    setSession(null)
    setDashboard(null)
    setActiveLearning(null)
    setAuthChecked(true)
    setApiContext(null, '')
  }, [])

  const applySession = useCallback((nextSession: AppSession, preferredCourseId = '') => {
    const nextCourseId = preferredCourseId && nextSession.courses.some((course) => course.id === preferredCourseId)
      ? preferredCourseId
      : nextSession.defaultCourseId || nextSession.courses[0]?.id || ''
    storeSession(nextSession)
    setSession(nextSession)
    setSelectedCourseId(nextCourseId)
    setApiContext(nextSession, nextCourseId)
    setAuthChecked(true)
    setAppNotice('')
  }, [])

  useEffect(() => {
    const stored = readStoredSession()
    if (!stored?.session?.token) {
      setApiContext(null, '')
      return
    }
    const storedCourseId = stored.defaultCourseId || stored.courses?.[0]?.id || ''
    setApiContext(stored, storedCourseId)
    let cancelled = false
    apiFetch('/api/auth/me', {}, {}, false)
      .then((response) => (response.ok ? response.json() : Promise.reject(response)))
      .then((payload: AppSession) => {
        if (!cancelled) applySession(payload, storedCourseId)
      })
      .catch(() => {
        if (!cancelled) {
          storeSession(null)
          setSession(null)
          setAuthChecked(true)
        }
      })
    return () => {
      cancelled = true
    }
  }, [applySession])

  useEffect(() => {
    setApiContext(session, selectedCourseId)
  }, [session, selectedCourseId])

  const refreshDashboard = useCallback(async (courseIdOverride?: string) => {
    if (!session) return
    const response = await apiFetch('/api/dashboard', {}, courseIdOverride ? { courseId: courseIdOverride } : {})
    if (isUnauthorized(response)) {
      clearSession()
      throw new Error('login expired')
    }
    if (!response.ok) throw new Error('load dashboard failed')
    setDashboard(await response.json())
  }, [clearSession, session])

  const navigateTo = useCallback((key: PageKey, options: { replace?: boolean } = {}) => {
    setPage(key)
    const nextPath = pageRoutes[key]
    if (window.location.pathname !== nextPath) {
      const method = options.replace ? 'replaceState' : 'pushState'
      window.history[method]({ page: key }, '', nextPath)
    }
    saveUiState('global', 'activePage', { page: key, source: 'navigation' })
    recordActivity({ pageKey: key, actionType: 'navigate', actionLabel: key })
  }, [])

  const changeCourse = useCallback((courseId: string) => {
    if (!session || courseId === selectedCourseId) return
    setSelectedCourseId(courseId)
    setApiContext(session, courseId)
    setDashboard(null)
    setActiveLearning(null)
    refreshDashboard(courseId).catch(() => {
      setAppNotice('课程数据加载失败，请稍后重试。')
    })
    saveUiState('global', 'selectedCourse', { courseId })
    recordActivity({ pageKey: page, actionType: 'switch_course', actionLabel: courseId, entityType: 'course', entityId: courseId })
  }, [page, refreshDashboard, selectedCourseId, session])

  const logout = useCallback(async () => {
    try {
      await apiFetch('/api/auth/session', { method: 'DELETE' }, {}, false)
    } finally {
      clearSession()
      window.history.replaceState({ page: 'home' }, '', pageRoutes.home)
      setPage('home')
    }
  }, [clearSession])

  const startLearningTask = async (task: Task, source: LearningIntent['source']) => {
    const isReview = task.status === '已完成'
    const mode = isReview ? 'review' : 'learn'
    const fallbackDefinition = `完成约 ${task.minutes} 分钟有效学习，并产生提问、练习或阅读记录`
    setActiveLearning({ task, source, mode, sessionStatus: 'started', targetMinutes: task.minutes, completionDefinition: fallbackDefinition, resourceId: task.resourceId })
    saveUiState('tutor', 'activeLearning', { taskId: task.id || '', resourceId: task.resourceId || '', title: task.title, source, mode })
    recordActivity({
      pageKey: source === 'plan' ? 'plan' : 'home',
      actionType: isReview ? 'review_task' : 'start_learning_task',
      actionLabel: task.title,
      entityType: 'study_plan',
      entityId: task.id,
      data: { source, status: task.status, tag: task.tag, minutes: task.minutes },
    })
    navigateTo('tutor')
    try {
      const session = await createLearningSession(task, source, mode)
      setActiveLearning((current) => current && current.task.title === task.title ? {
        ...current,
        sessionId: session.id,
        sessionStatus: session.status,
        targetMinutes: session.target_minutes || task.minutes,
        completedMinutes: session.completed_minutes || 0,
        completionScore: session.completion_score ?? null,
        completionDefinition: session.completion_definition || fallbackDefinition,
        completionReason: session.completion_reason || '',
        resourceId: session.resource_id || task.resourceId,
      } : current)
      await refreshDashboard()
    } catch {
      updateStudyPlanStatus(task, isReview ? 'done' : 'active')
      setAppNotice('学习会话已进入本地上下文，但数据库写入失败，请稍后重试。')
    }
  }

  const finishActiveLearning = useCallback(async (status: 'completed' | 'paused' | 'abandoned') => {
    if (!activeLearning) return
    if (!activeLearning.sessionId) {
      setActiveLearning((current) => current ? { ...current, sessionStatus: status, completionReason: '本地状态已更新，等待数据库同步' } : current)
      return
    }
    try {
      const payload = await finishLearningSession(activeLearning.sessionId, status, activeLearning.task)
      const session = payload.session
      setActiveLearning((current) => current ? {
        ...current,
        sessionStatus: session.status,
        completedMinutes: session.completed_minutes || current.completedMinutes,
        completionScore: session.completion_score ?? current.completionScore,
        completionReason: session.completion_reason || current.completionReason,
        completionDefinition: session.completion_definition || current.completionDefinition,
      } : current)
      recordActivity({
        pageKey: 'tutor',
        actionType: `learning_session_${status}`,
        actionLabel: activeLearning.task.title,
        entityType: 'student_learning_session',
        entityId: activeLearning.sessionId,
        data: { status, source: activeLearning.source, mode: activeLearning.mode },
      })
      await refreshDashboard()
    } catch {
      setAppNotice('学习状态同步失败，请检查服务或稍后重试。')
    }
  }, [activeLearning, refreshDashboard])

  useEffect(() => {
    if (!authChecked || !session) return
    let cancelled = false
    Promise.resolve().then(() => refreshDashboard())
      .catch(() => {
        if (!cancelled) {
          setDashboard(null)
          setAppNotice('数据加载失败，页面已保留可用的本地状态。')
        }
      })
    return () => {
      cancelled = true
    }
  }, [authChecked, refreshDashboard, selectedCourseId, session])

  useEffect(() => {
    const onPopState = () => setPage(pageFromPath(window.location.pathname))
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  useEffect(() => {
    if (!authChecked || !session || !selectedCourseId) return
    let cancelled = false
    apiFetch('/api/learning-sessions/current')
      .then((response) => (response.ok ? response.json() : Promise.reject(response)))
      .then((payload: { current?: { session: LearningSessionRecord; task: Task } | null }) => {
        if (cancelled || !payload.current) return
        setActiveLearning((current) => current || {
          task: payload.current!.task,
          source: payload.current!.session.source,
          mode: payload.current!.session.mode,
          sessionId: payload.current!.session.id,
          sessionStatus: payload.current!.session.status,
          targetMinutes: payload.current!.session.target_minutes,
          completedMinutes: payload.current!.session.completed_minutes,
          completionScore: payload.current!.session.completion_score ?? null,
          completionDefinition: payload.current!.session.completion_definition,
          completionReason: payload.current!.session.completion_reason,
          resourceId: payload.current!.session.resource_id || payload.current!.task.resourceId,
        })
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [authChecked, selectedCourseId, session])

  if (!authChecked) {
    return <SplashScreen label="正在恢复学习空间..." />
  }

  if (!session) {
    return <LoginPage onLogin={applySession} />
  }

  return (
    <div className="student-app">
      <Sidebar activeNav={activeNav} onNavigate={navigateTo} session={session} />
      <section className="student-main">
        <Topbar courses={dashboard?.courses?.length ? dashboard.courses : session.courses} onCourseChange={changeCourse} onLogout={logout} onNavigate={navigateTo} selectedCourseId={selectedCourseId} session={session} uiState={dashboard?.uiState?.global} />
        {appNotice ? <div className="app-notice"><span>{appNotice}</span><button onClick={() => setAppNotice('')} type="button">知道了</button></div> : null}
        <main className="student-page">
          {page === 'home' && <HomePage onNavigate={navigateTo} onStartTask={startLearningTask} dashboard={dashboard} />}
          {page === 'profile' && <ProfilePage dashboard={dashboard} />}
          {page === 'plan' && <PlanPage dashboard={dashboard} onStartTask={startLearningTask} />}
          {page === 'resources' && <ResourcesPage dashboard={dashboard} onNavigate={navigateTo} onStartTask={startLearningTask} />}
          {page === 'tutor' && <TutorPage activeLearning={activeLearning} onFinishLearning={finishActiveLearning} onNavigate={navigateTo} />}
          {page === 'report' && <ReportPage dashboard={dashboard} onNavigate={navigateTo} />}
        </main>
      </section>
    </div>
  )
}

function SplashScreen({ label }: { label: string }) {
  return (
    <main className="auth-shell">
      <section className="auth-card auth-loading">
        <span className="brand-cube"><GraduationCap size={28} /></span>
        <b>{label}</b>
        <p>正在校验本地会话和课程数据。</p>
      </section>
    </main>
  )
}

function LoginPage({ onLogin }: { onLogin: (session: AppSession) => void }) {
  const [username, setUsername] = useState('student_demo')
  const [password, setPassword] = useState('student123')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      if (!response.ok) {
        setError(response.status === 401 ? '账号或密码不正确' : '登录服务暂时不可用')
        return
      }
      onLogin(await response.json() as AppSession)
    } catch {
      setError('无法连接本地服务，请确认 API 已启动。')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="auth-shell">
      <form className="auth-card" onSubmit={submit}>
        <div className="auth-brand"><span className="brand-cube"><GraduationCap size={28} /></span><div><b>智学成长平台</b><small>大学生个性化学习</small></div></div>
        <h1>登录学习空间</h1>
        <label>账号<input autoComplete="username" onChange={(event) => setUsername(event.target.value)} value={username} /></label>
        <label>密码<input autoComplete="current-password" onChange={(event) => setPassword(event.target.value)} type="password" value={password} /></label>
        {error ? <p className="auth-error">{error}</p> : null}
        <button disabled={busy || !username.trim() || !password.trim()} type="submit">{busy ? '登录中...' : '进入学习平台'}</button>
      </form>
    </main>
  )
}

function Sidebar({ activeNav, onNavigate, session }: { activeNav: PageKey; onNavigate: (key: PageKey) => void; session: AppSession }) {
  const studentName = session.student?.display_name || session.student?.displayName || '同学'
  const grade = session.student?.grade || '大学阶段'
  return (
    <aside className="student-sidebar">
      <div className="brand-row">
        <span className="brand-cube"><GraduationCap size={25} /></span>
        <div><b>智学成长平台</b><small>大学生个性化辅导</small></div>
      </div>
      <div className="profile-card">
        <span className="avatar-boy">{studentName.slice(0, 1)}</span>
        <div><b>{studentName}</b><small>{grade}</small></div>
      </div>
      <nav className="student-nav">
        {navItems.map((item) => {
          const Icon = item.icon
          return (
            <button className={activeNav === item.key ? 'active' : ''} key={item.key} onClick={() => onNavigate(item.key as PageKey)} type="button">
              <Icon size={21} />
              <span>{item.label}</span>
            </button>
          )
        })}
      </nav>
      <div className="schedule-card">
        <b>目标工作台</b>
        <p>课程、考试、科研和职业目标由数据库统一管理，学习计划会随目标模式调整。</p>
        <button onClick={() => onNavigate('home')} type="button">切换目标</button>
      </div>
    </aside>
  )
}

function Topbar({
  courses,
  onCourseChange,
  onLogout,
  onNavigate,
  selectedCourseId,
  session,
  uiState,
}: {
  courses: CourseOption[]
  onCourseChange: (courseId: string) => void
  onLogout: () => void
  onNavigate: (key: PageKey) => void
  selectedCourseId: string
  session: AppSession
  uiState?: Record<string, unknown>
}) {
  const [courseOpen, setCourseOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [noticeOpen, setNoticeOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [topbarMessage, setTopbarMessage] = useState('')
  void uiState
  const selectedCourse = courses.find((course) => course.id === selectedCourseId) || courses[0]
  const studentName = session.student?.display_name || session.student?.displayName || session.account.username

  const runSearch = () => {
    const keyword = query.trim()
    if (!keyword) return
    window.sessionStorage.setItem('a3-resource-keyword', keyword)
    setTopbarMessage(`已检索「${keyword}」，优先展示相关资源与辅导话题。`)
    saveUiState('global', 'lastSearch', { keyword })
    recordActivity({ pageKey: 'resources', actionType: 'global_search', actionLabel: keyword, data: { keyword } })
    onNavigate('resources')
  }

  return (
    <header className="student-topbar">
      <div className="topbar-menu">
        <button aria-label="切换课程" className="course-btn" onClick={() => setCourseOpen((value) => !value)} type="button">{selectedCourse?.name || '选择课程'} <ChevronDown size={16} /></button>
        {courseOpen ? <div className="topbar-popover course-popover">{courses.map((course) => <button className={course.id === selectedCourseId ? 'active' : ''} key={course.id} onClick={() => { onCourseChange(course.id); setCourseOpen(false); setTopbarMessage(`已切换到「${course.name}」学习视图。`) }} type="button"><b>{course.name}</b><small>{course.subject} · {course.grade}</small></button>)}</div> : null}
      </div>
      <label className="global-search"><Search size={18} /><input aria-label="搜索知识点、资源或问题" onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') runSearch() }} placeholder="搜索课程知识点、资源、论文方法或问题" value={query} /></label>
      {topbarMessage ? <div className="topbar-toast">{topbarMessage}<button onClick={() => setTopbarMessage('')} type="button">知道了</button></div> : null}
      <div className="top-actions">
        <div className="topbar-menu">
          <button aria-label="查看通知" className="bell-btn" data-count="3" onClick={() => { setNoticeOpen((value) => { const next = !value; saveUiState('global', 'noticeOpen', { value: next }); return next }); setProfileOpen(false) }} type="button"><Bell size={21} /></button>
          {noticeOpen ? <div className="topbar-popover notice-popover"><b>学习提醒</b><p>{selectedCourse?.name || '当前课程'} 有新的学习计划与资源状态。</p><p>点击后会标记为已读并进入计划页。</p><button onClick={() => { setNoticeOpen(false); recordActivity({ pageKey: 'plan', actionType: 'read_notifications', actionLabel: '学习提醒已读' }); onNavigate('plan') }} type="button">查看计划</button></div> : null}
        </div>
        <div className="topbar-menu">
          <button aria-label="打开用户菜单" className="user-square" onClick={() => { setProfileOpen((value) => { const next = !value; saveUiState('global', 'profileOpen', { value: next }); return next }); setNoticeOpen(false) }} type="button"><UserRound size={21} /></button>
          {profileOpen ? <div className="topbar-popover profile-popover"><b>{studentName}</b><p>{session.student?.grade || '大学阶段'} · {session.account.username}</p><button onClick={() => { setProfileOpen(false); onNavigate('profile') }} type="button">账户与画像</button><button onClick={() => { setProfileOpen(false); onNavigate('report') }} type="button">学习报告</button><button onClick={onLogout} type="button">退出登录</button></div> : null}
        </div>
      </div>
    </header>
  )
}

function HomePage({ onNavigate, onStartTask, dashboard }: { onNavigate: (key: PageKey) => void; onStartTask: (task: Task, source: LearningIntent['source']) => void; dashboard: DashboardData | null }) {
  const pageTasks = dashboard?.tasks?.length ? dashboard.tasks : tasks
  const hero = dashboard?.hero
  const recommendedTask = pageTasks.find((task) => task.status === '进行中') || pageTasks.find((task) => task.status === '未开始') || pageTasks[0]
  const sourceGoalModes = dashboard?.goalModes?.length ? dashboard.goalModes : fallbackGoalModes
  const [activeGoalModeKey, setActiveGoalModeKey] = useState('')
  const [savedGoalMode, setSavedGoalMode] = useState<GoalMode | null>(null)
  const [suggestionIndex, setSuggestionIndex] = useState(0)
  const [modeNotice, setModeNotice] = useState('')
  const [learningModule, setLearningModule] = useState<LearningModule | null>(null)
  const goalModes = useMemo(() => {
    const merged = sourceGoalModes.map((item) => (savedGoalMode?.modeKey === item.modeKey ? savedGoalMode : item))
    if (!activeGoalModeKey) return merged
    return merged.map((item) => ({ ...item, isActive: item.modeKey === activeGoalModeKey }))
  }, [activeGoalModeKey, savedGoalMode, sourceGoalModes])
  const activeGoal = goalModes.find((mode) => mode.isActive) || goalModes[0] || fallbackGoalModes[0]
  const nextSuggestions = [
    {
      title: '优先处理目标风险点',
      body: `当前模式的风险项是「${String(activeGoal.metrics?.risk || '薄弱模块')}」，建议进入一个短任务验证掌握情况。`,
    },
    {
      title: '把任务和目标证据绑定',
      body: `本周核心指标是「${String(activeGoal.metrics?.primaryMetric || '目标进度')}」，完成后会进入报告页沉淀证据。`,
    },
    {
      title: '保留深度学习时间块',
      body: `当前目标建议每周 ${activeGoal.weeklyHours} 小时深度学习，减少碎片化复习。`,
    },
  ]
  const currentSuggestion = nextSuggestions[suggestionIndex % nextSuggestions.length]

  useEffect(() => {
    let cancelled = false
    apiFetch(`/api/goal-modes/${activeGoal.modeKey}/learning-module`, {}, { limit: 6 })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error('load learning module failed'))))
      .then((payload: { module: LearningModule }) => {
        if (!cancelled) setLearningModule(payload.module)
      })
      .catch(() => {
        if (!cancelled) setLearningModule(null)
      })
    return () => {
      cancelled = true
    }
  }, [activeGoal.modeKey])

  const switchGoalMode = async (mode: GoalMode) => {
    const previousKey = activeGoal.modeKey
    setActiveGoalModeKey(mode.modeKey)
    setModeNotice(`已切换到「${mode.title}」。`)
    saveUiState('home', 'activeGoalMode', { modeKey: mode.modeKey, title: mode.title })
    try {
      const saved = await activateGoalMode(mode.modeKey)
      setSavedGoalMode(saved)
      setActiveGoalModeKey(saved.modeKey)
      recordActivity({ pageKey: 'home', actionType: 'activate_goal_mode', actionLabel: saved.title, entityType: 'student_goal_mode', entityId: saved.id, data: { modeKey: saved.modeKey } })
    } catch {
      setActiveGoalModeKey(previousKey)
      setModeNotice('目标模式保存失败，已恢复到上一个状态。')
    }
  }

  return (
    <section className="home-layout">
      <Card className="home-hero">
        <div className="hero-copy"><h1>李同学，当前目标：{activeGoal.title}</h1><p>{activeGoal.description}</p></div>
        <div className="hero-metrics">
          <Metric tone="orange" icon={<Target size={28} />} label="本周深度学习" value={`${activeGoal.weeklyHours} 小时`} />
          <Metric tone="teal" icon={<Clock3 size={28} />} label="今日学习" value={`${hero?.todayMinutes ?? 45} 分钟`} />
          <Metric tone="gold" icon={<CheckCircle2 size={28} />} label="目标进度" value={`${activeGoal.progress}%`} />
        </div>
        <ProgressRing value={activeGoal.progress} label={activeGoal.focusLabel} sub={activeGoal.successMetric} />
      </Card>
      <Card title="今日学习任务" action="日程" actionOnClick={() => onNavigate('plan')} className="home-tasks">
        <div className="task-timeline">
          {pageTasks.map((task, index) => <TaskRow key={task.id || task.title} index={index} onStartTask={(nextTask) => onStartTask(nextTask, 'home')} task={task} />)}
        </div>
        <button className="text-action" onClick={() => onNavigate('plan')} type="button">查看全部任务（共 {pageTasks.length} 个）<ChevronRight size={16} /></button>
      </Card>
      <div className="home-right">
        <Card title="目标模式" className="goal-mode-card">
          <div className="mode-tabs">{goalModes.map((mode) => <button className={mode.isActive ? 'active' : ''} key={mode.modeKey} onClick={() => switchGoalMode(mode)} type="button"><b>{mode.title}</b><small>{mode.focusLabel}</small></button>)}</div>
          <div className="mode-detail">
            <span className="target-art"><Target size={32} /></span>
            <div><b>{activeGoal.successMetric}</b><p>{activeGoal.description}</p>{modeNotice ? <small>{modeNotice}</small> : null}</div>
          </div>
          <div className="module-readiness">
            <span><b>{learningModule?.readiness.resourceCount ?? 0}</b><small>可用资源</small></span>
            <span><b>{learningModule?.readiness.ocrResourceCount ?? 0}</b><small>OCR 资源</small></span>
            <span><b>{learningModule?.readiness.questionCount ?? 0}</b><small>练习题</small></span>
          </div>
        </Card>
        <Card title="智能研判" action="刷新研判" actionOnClick={() => setSuggestionIndex((value) => value + 1)} className="ai-remind intelligence-card">
          <p><b>{currentSuggestion.title}</b></p>
          <p>{currentSuggestion.body}</p>
          <button className="text-action" onClick={() => recommendedTask ? onStartTask(recommendedTask, 'recommendation') : onNavigate('resources')} type="button">进入任务 <ChevronRight size={16} /></button>
        </Card>
        <Card title="本周学习概况" action="详情" actionOnClick={() => onNavigate('report')} className="week-card">
          <div className="week-metrics"><MiniStat label="学习时长" value={`${hero?.weeklyHours ?? 6.2} 小时`} note="较上周 +0.8h" /><MiniStat label="任务完成率" value={`${hero?.progress ?? 78}%`} note="较上周 +12%" /><MiniStat label="平均正确率" value={`${hero?.averageAccuracy ?? 81}%`} note="较上周 +7%" /><MiniStat label="错题数" value={`${hero?.mistakeCount ?? 24} 题`} note="较上周 -6" /></div>
          <LineSpark />
        </Card>
      </div>
    </section>
  )
}

function ProfilePage({ dashboard }: { dashboard: DashboardData | null }) {
  const pageKnowledge = dashboard?.knowledge?.length ? dashboard.knowledge : knowledge
  const scores = dashboard?.profileScores?.length ? dashboard.profileScores : pageKnowledge.map(([label, current]) => ({ label, current, average: Math.max(45, current - 6) }))
  const [showAllKnowledge, setShowAllKnowledge] = useState(false)
  const [showInsight, setShowInsight] = useState(false)
  const [showTrendDetail, setShowTrendDetail] = useState(false)
  const visibleKnowledge = showAllKnowledge ? pageKnowledge : pageKnowledge.slice(0, 5)
  const topScore = [...scores].sort((a, b) => b.current - a.current)[0]
  const weakScore = [...scores].sort((a, b) => a.current - b.current)[0]
  const trendItems = [
    '多元函数掌握度上升 8%',
    '线性代数概念掌握度下降 5%',
    '学习时长增加 15 分钟/天',
    '完成首次综合测评',
  ]
  return (
    <section className="profile-layout">
      <Card className="page-title-card">
        <div><h1>我的学习画像</h1><p>基于最近 30 天学习数据生成</p></div>
        <button onClick={() => { setShowInsight((value) => { const next = !value; saveUiState('profile', 'showInsight', { value: next }); return next }); recordActivity({ pageKey: 'profile', actionType: 'toggle_insight', actionLabel: '画像解读' }) }} type="button">{showInsight ? '收起解读' : '画像解读'}</button>
        <small>数据更新于：2026-05-21 12:00</small>
      </Card>
      <Card title="六维能力雷达图" className="radar-card"><RadarChart /><div className="legend"><span><i />当前水平</span><span><i className="dash" />年级平均</span></div></Card>
      <Card title="知识点掌握度（按模块）" action={showAllKnowledge ? '收起知识点' : '查看全部知识点'} actionOnClick={() => { setShowAllKnowledge((value) => { const next = !value; saveUiState('profile', 'showAllKnowledge', { value: next }); return next }); recordActivity({ pageKey: 'profile', actionType: 'toggle_knowledge', actionLabel: '查看全部知识点' }) }} className="mastery-card">
        <div className="mastery-list">{visibleKnowledge.map(([name, value]) => <MasteryRow key={name} name={name} value={value} />)}</div>
        {showInsight ? <div className="profile-insight"><b>画像解读</b><p>当前优势是{topScore?.label || '知识掌握'}，薄弱项集中在{weakScore?.label || '应用能力'}。建议先保持优势模块的短练习，再把晚间 15 分钟留给薄弱知识点。</p></div> : null}
      </Card>
      <Card title="学习习惯分布" className="habit-card">
        <div className="habit-grid">{['按计划学习 中等', '专注力 良好', '作业及时性 良好', '错题整理 良好', '预习习惯 一般', '复习习惯 中等', '主动提问 良好', '时间管理 中等'].map((item) => <span key={item}>{item}</span>)}</div>
        <div className="habit-legend"><span />优秀 <span />良好 <span />中等 <span />需提升</div>
      </Card>
      <Card title="优势与待提升" className="strength-card">
        <div className="strength-cols"><div><b>优势表现</b>{['偏导计算准确率高', '课堂笔记整理及时', '错题订正较及时', '数据分析题理解较好'].map((item) => <p key={item}>● {item}</p>)}</div><div><b className="warn">待提升方向</b>{['二重积分区域刻画薄弱', '线性代数概念辨析需提升', '作业完成时间较长', '考前复盘节奏不稳定'].map((item) => <p key={item}>● {item}</p>)}</div></div>
      </Card>
      <Card title="近期变化趋势" action={showTrendDetail ? '收起详情' : '查看详情'} actionOnClick={() => { setShowTrendDetail((value) => { const next = !value; saveUiState('profile', 'showTrendDetail', { value: next }); return next }); recordActivity({ pageKey: 'profile', actionType: 'toggle_trend_detail', actionLabel: '查看详情' }) }} className="trend-card2">
        {(showTrendDetail ? trendItems : trendItems.slice(0, 3)).map((item, index) => <div className="trend-row" key={item}><span>{index % 2 ? '↓' : '↑'}</span><p>{item}<small>2026/05/{20 - index}</small></p></div>)}
        {showTrendDetail ? <p className="trend-note">趋势由最近 7 天学习指标与知识点掌握变化推理得出，具体原始记录来自每日学习指标和知识点掌握表。</p> : null}
      </Card>
    </section>
  )
}

function toDateInput(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function fromDateInput(value: string) {
  return new Date(`${value}T00:00:00`)
}

function addDays(value: string, offset: number) {
  const date = fromDateInput(value)
  date.setDate(date.getDate() + offset)
  return toDateInput(date)
}

function formatDateCn(value: string) {
  const date = fromDateInput(value)
  return `${date.getMonth() + 1}月${date.getDate()}日`
}

function formatWeekTitle(value: string) {
  const date = fromDateInput(value)
  const week = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][date.getDay()]
  return `${formatDateCn(value)} ${week}`
}

function buildWeekDays(value: string) {
  const current = fromDateInput(value)
  const mondayOffset = (current.getDay() + 6) % 7
  const monday = new Date(current)
  monday.setDate(current.getDate() - mondayOffset)
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday)
    date.setDate(monday.getDate() + index)
    return {
      label: ['一', '二', '三', '四', '五', '六', '日'][index],
      day: date.getDate(),
      iso: toDateInput(date),
    }
  })
}

function PlanPage({ dashboard, onStartTask }: { dashboard: DashboardData | null; onStartTask: (task: Task, source: LearningIntent['source']) => void }) {
  const sourceTasks = useMemo(() => (dashboard?.tasks?.length ? dashboard.tasks : tasks), [dashboard])
  const [pageTasks, setPageTasks] = useState<Task[]>(() => sourceTasks)
  const [adjustOpen, setAdjustOpen] = useState(false)
  const [weeklyDetailOpen, setWeeklyDetailOpen] = useState(false)
  const [adjustments, setAdjustments] = useState([false, true, false])
  const [savingPlan, setSavingPlan] = useState(false)
  const [selectedDate, setSelectedDate] = useState('')
  const [planLoading, setPlanLoading] = useState(true)
  const [planNotice, setPlanNotice] = useState('')
  const [smartPlanBusy, setSmartPlanBusy] = useState<'generate' | 'adjust' | null>(null)
  const [smartPlanReason, setSmartPlanReason] = useState('')
  const [agentTrace, setAgentTrace] = useState<AgentRunResult | null>(null)
  const [agentTraceLoading, setAgentTraceLoading] = useState(false)
  const [agentTraceError, setAgentTraceError] = useState('')
  const [draftPlan, setDraftPlan] = useState({
    startTime: '20:10',
    endTime: '20:25',
    title: '特征值概念辨析短练',
    detail: '系统根据课程薄弱项新增巩固任务',
    tag: 'AI 调整',
    minutes: 15,
  })
  const activeDate = selectedDate || toDateInput()
  const weekDays = buildWeekDays(activeDate)
  const selectedWeekStart = weekDays[0]?.iso || activeDate
  const selectedWeekEnd = weekDays[6]?.iso || activeDate
  const nextReviewDate = addDays(activeDate, 5)
  const completedCount = pageTasks.filter((task) => task.status === '已完成').length
  const goalProgress = pageTasks.length ? Math.round((completedCount / pageTasks.length) * 100) : 0

  useEffect(() => {
    let cancelled = false
    apiFetch('/api/plans', {}, selectedDate ? { date: selectedDate } : {})
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error('load plans failed'))))
      .then((payload: { date?: string; tasks: Task[] }) => {
        if (!cancelled) {
          if (payload.date && payload.date !== selectedDate) setSelectedDate(payload.date)
          setPageTasks(payload.tasks || [])
        }
      })
      .catch(() => {
        if (!cancelled) setPlanNotice('计划读取失败，已保留当前页面数据。')
      })
      .finally(() => {
        if (!cancelled) setPlanLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [selectedDate])

  const addReviewTask = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault()
    if (savingPlan) return
    setSavingPlan(true)
    setPlanNotice('')
    try {
      const response = await apiFetch('/api/plans', {
        method: 'POST',
        body: JSON.stringify({
          planDate: activeDate,
          startTime: draftPlan.startTime,
          endTime: draftPlan.endTime,
          title: draftPlan.title,
          detail: draftPlan.detail,
          tag: draftPlan.tag,
          minutes: draftPlan.minutes,
        }),
      })
      if (response.ok) {
        const created = await response.json()
        setPageTasks((current) => [...current, created].sort((a, b) => a.time.localeCompare(b.time)))
        setPlanNotice(`已新增「${created.title}」。`)
        recordActivity({ pageKey: 'plan', actionType: 'create_plan_task', actionLabel: '应用调整', entityType: 'study_plan', entityId: created.id })
      }
    } finally {
      setSavingPlan(false)
    }
  }

  const mergePlanTasks = (nextTasks: Task[]) => {
    setPageTasks((current) => {
      const taskMap = new Map<string, Task>()
      current.forEach((task) => taskMap.set(task.id || `${task.time}-${task.title}`, task))
      nextTasks.forEach((task) => taskMap.set(task.id || `${task.time}-${task.title}`, task))
      return Array.from(taskMap.values()).sort((a, b) => a.time.localeCompare(b.time))
    })
  }

  const generateSmartPlan = async () => {
    if (smartPlanBusy || savingPlan) return
    setSmartPlanBusy('generate')
    setPlanNotice('')
    try {
      const response = await apiFetch('/api/plans/generate', {
        method: 'POST',
        body: JSON.stringify({
          startDate: activeDate,
          days: 1,
          startTime: '20:00',
          replaceExisting: false,
        }),
      })
      if (!response.ok) throw new Error('generate plan failed')
      const payload = await response.json() as { plans: Task[]; basis?: { weakChapters?: { chapter: string }[]; lowDimensions?: { label: string; score: number }[] } }
      mergePlanTasks(payload.plans || [])
      const weak = payload.basis?.weakChapters?.[0]?.chapter || payload.basis?.lowDimensions?.[0]?.label || '当前薄弱点'
      setSmartPlanReason(`AI 已根据 ${weak} 生成 ${payload.plans?.length || 0} 个计划任务。`)
      setPlanNotice('AI 计划已写入当前日期。')
      recordActivity({ pageKey: 'plan', actionType: 'generate_ai_plan', actionLabel: 'AI 生成计划', data: { planDate: activeDate, count: payload.plans?.length || 0 } })
    } catch {
      setPlanNotice('AI 计划生成失败，请稍后重试。')
    } finally {
      setSmartPlanBusy(null)
    }
  }

  const adjustSmartPlan = async () => {
    if (smartPlanBusy || savingPlan) return
    setSmartPlanBusy('adjust')
    setPlanNotice('')
    try {
      const response = await apiFetch('/api/plans/adjust', {
        method: 'POST',
        body: JSON.stringify({
          planDate: activeDate,
          startTime: '20:30',
        }),
      })
      if (!response.ok) throw new Error('adjust plan failed')
      const payload = await response.json() as { plans: Task[]; adjustmentReason?: string }
      mergePlanTasks(payload.plans || [])
      setSmartPlanReason(payload.adjustmentReason || '已根据近期表现追加补弱与续做任务。')
      setPlanNotice('动态调整任务已写入当前日期。')
      recordActivity({ pageKey: 'plan', actionType: 'adjust_ai_plan', actionLabel: '动态调整计划', data: { planDate: activeDate, count: payload.plans?.length || 0, reason: payload.adjustmentReason || '' } })
    } catch {
      setPlanNotice('动态调整失败，请稍后重试。')
    } finally {
      setSmartPlanBusy(null)
    }
  }

  const deletePlanTask = async (task: Task) => {
    if (!task.id || savingPlan) return
    setSavingPlan(true)
    setPlanNotice('')
    try {
      const response = await apiFetch(`/api/plans/${task.id}`, { method: 'DELETE' })
      if (response.ok) {
        setPageTasks((current) => current.filter((item) => item.id !== task.id))
        setPlanNotice(`已删除「${task.title}」。`)
        recordActivity({ pageKey: 'plan', actionType: 'delete_plan_task', actionLabel: '删除任务', entityType: 'study_plan', entityId: task.id })
      }
    } finally {
      setSavingPlan(false)
    }
  }

  const chooseDate = (nextDate: string) => {
    setPlanLoading(true)
    setSelectedDate(nextDate)
    setPlanNotice('')
    saveUiState('plan', 'selectedDate', { date: nextDate })
    recordActivity({ pageKey: 'plan', actionType: 'change_plan_date', actionLabel: nextDate, data: { date: nextDate } })
  }

  const openAddPlan = () => {
    setAdjustOpen(true)
    setWeeklyDetailOpen(false)
    saveUiState('plan', 'adjustOpen', { value: true, source: 'add' })
    recordActivity({ pageKey: 'plan', actionType: 'open_add_plan', actionLabel: '添加计划' })
  }

  const toggleAdjustPanel = () => {
    setAdjustOpen((value) => {
      const next = !value
      saveUiState('plan', 'adjustOpen', { value: next, source: 'toggle' })
      return next
    })
    recordActivity({ pageKey: 'plan', actionType: 'toggle_adjust_panel', actionLabel: '调整计划' })
  }

  const toggleWeekDetail = () => {
    setWeeklyDetailOpen((value) => {
      const next = !value
      saveUiState('plan', 'weeklyDetailOpen', { value: next })
      return next
    })
    recordActivity({ pageKey: 'plan', actionType: 'toggle_week_detail', actionLabel: '查看周计划详情' })
  }

  const toggleAdjustment = (item: string, index: number) => {
    setAdjustments((current) => {
      const next = current.map((value, itemIndex) => itemIndex === index ? !value : value)
      saveUiState('plan', 'adjustments', { values: next, lastChanged: item })
      return next
    })
    recordActivity({ pageKey: 'plan', actionType: 'toggle_adjustment', actionLabel: item })
  }

  const loadAgentTrace = async (task: Task) => {
    if (!task.agentTaskId || agentTraceLoading) return
    setAgentTraceLoading(true)
    setAgentTraceError('')
    try {
      const response = await apiFetch(`/api/agents/logs/${task.agentTaskId}`)
      if (!response.ok) throw new Error('load agent trace failed')
      const payload = await response.json() as AgentRunResult
      setAgentTrace(payload)
      setSmartPlanReason(`已加载「${task.title}」的智能体分析过程。`)
      recordActivity({ pageKey: 'plan', actionType: 'view_agent_trace', actionLabel: '查看智能体分析', entityType: 'agent_task', entityId: task.agentTaskId, data: { planId: task.id, title: task.title } })
    } catch {
      setAgentTraceError('智能体分析过程读取失败，请稍后重试。')
    } finally {
      setAgentTraceLoading(false)
    }
  }

  return (
    <section className="plan-layout">
      <Card className="plan-main">
        <header className="plan-title"><div><h1>我的学习计划</h1><p>根据学习画像与目标智能生成</p></div><div className="plan-title-actions"><button className="primary" disabled={Boolean(smartPlanBusy)} onClick={generateSmartPlan} type="button"><RefreshCw size={16} />{smartPlanBusy === 'generate' ? '生成中' : 'AI 生成'}</button><button disabled={Boolean(smartPlanBusy)} onClick={adjustSmartPlan} type="button"><Target size={16} />{smartPlanBusy === 'adjust' ? '调整中' : '动态调整'}</button><button onClick={openAddPlan} type="button"><Plus size={16} />添加计划</button><button onClick={toggleAdjustPanel} type="button">{adjustOpen ? '收起调整' : '调整计划'}</button></div></header>
        <div className="plan-mobile-actions"><button className="primary" disabled={Boolean(smartPlanBusy)} onClick={generateSmartPlan} type="button"><RefreshCw size={16} />AI 生成</button><button disabled={Boolean(smartPlanBusy)} onClick={adjustSmartPlan} type="button"><Target size={16} />动态调整</button><button onClick={openAddPlan} type="button"><Plus size={16} />添加计划</button><button onClick={toggleAdjustPanel} type="button">{adjustOpen ? '收起调整' : '调整计划'}</button></div>
        <div className="date-control">
          <button onClick={() => chooseDate(addDays(activeDate, -1))} type="button">前一天</button>
          <label><span>计划日期</span><input onChange={(event) => chooseDate(event.target.value)} type="date" value={activeDate} /></label>
          <button onClick={() => chooseDate(addDays(activeDate, 1))} type="button">后一天</button>
        </div>
        <div className="week-days">{weekDays.map((day) => <button className={day.iso === activeDate ? 'active' : ''} key={day.iso} onClick={() => chooseDate(day.iso)} type="button"><b>{day.label}</b><b>{day.day}</b></button>)}</div>
        <h2>{formatWeekTitle(activeDate)} {planLoading ? <small>读取中...</small> : null}</h2>
        <div className="schedule-line">{pageTasks.length ? pageTasks.map((task) => <ScheduleRow editable={adjustOpen} key={task.id || task.title} onDelete={deletePlanTask} onStart={(nextTask) => onStartTask(nextTask, 'plan')} onViewAgentTrace={loadAgentTrace} task={task} />) : <div className="empty-plan-day"><b>这天还没有学习任务</b><p>可以点“调整计划”新增复习、练习或测评任务。</p></div>}</div>
        <button className="text-action" onClick={toggleWeekDetail} type="button">{weeklyDetailOpen ? '收起周计划详情' : '查看周计划详情'} <ChevronRight size={16} /></button>
      </Card>
      <aside className={adjustOpen ? 'plan-side adding-plan' : 'plan-side'}>
        <Card><div className="goal-progress"><span>当天任务完成度</span><i><b style={{ width: `${goalProgress}%` }} /></i><strong>{goalProgress}%</strong></div></Card>
        <Card title="计划说明" className="plan-note"><ol><li>先复习概念，再通过练习巩固，最后应用到题目中，符合记忆规律。</li><li>每天安排四个模块，帮助你少量高频积累。</li><li>周末安排测评，检验本周学习效果。</li></ol></Card>
        <Card title="可选调整" className="toggles">{['增加每日计算题量', '加强建模应用题训练', '延长复盘时长（+15 分钟/天）'].map((item, index) => <button key={item} onClick={() => toggleAdjustment(item, index)} type="button"><CheckCircle2 size={18} />{item}<span className={adjustments[index] ? 'on' : ''} /></button>)}</Card>
        {(agentTrace || agentTraceLoading || agentTraceError) ? <AgentAnalysisPanel data={agentTrace} error={agentTraceError} loading={agentTraceLoading} mode="readonly" onRefresh={() => agentTrace?.taskId ? loadAgentTrace({ title: '智能体分析', detail: '', minutes: 0, status: '未开始', tag: '智能体', time: '', agentTaskId: agentTrace.taskId }) : undefined} /> : null}
        <Card className="reason-card">{adjustOpen ? <form className="adjust-panel" onSubmit={addReviewTask}><b>新增学习任务</b><label><span>开始</span><input onChange={(event) => setDraftPlan((current) => ({ ...current, startTime: event.target.value }))} type="time" value={draftPlan.startTime} /></label><label><span>结束</span><input onChange={(event) => setDraftPlan((current) => ({ ...current, endTime: event.target.value }))} type="time" value={draftPlan.endTime} /></label><label><span>标题</span><input onChange={(event) => setDraftPlan((current) => ({ ...current, title: event.target.value }))} required value={draftPlan.title} /></label><label><span>说明</span><input onChange={(event) => setDraftPlan((current) => ({ ...current, detail: event.target.value }))} value={draftPlan.detail} /></label><button disabled={savingPlan || !draftPlan.title.trim()} type="submit">{savingPlan ? '写入中...' : '新增任务'}</button>{planNotice ? <small>{planNotice}</small> : null}</form> : weeklyDetailOpen ? <div className="week-detail"><b>周计划详情</b><p>{formatDateCn(selectedWeekStart)} 至 {formatDateCn(selectedWeekEnd)}，当前选中日期有 {pageTasks.length} 个学习任务，完成 {completedCount} 个。</p>{planNotice ? <small>{planNotice}</small> : null}</div> : <><p><b>智能依据</b> {smartPlanReason || '积分区域刻画准确率低于目标'}</p><p><b>下次评估</b> {formatWeekTitle(nextReviewDate)}</p><small>{planNotice || '调整后次日生效，系统将继续跟踪你的学习表现。'}</small></>}</Card>
      </aside>
    </section>
  )
}

function ResourcesPage({
  dashboard,
  onNavigate,
  onStartTask,
}: {
  dashboard: DashboardData | null
  onNavigate: (key: PageKey) => void
  onStartTask: (task: Task, source: LearningIntent['source']) => void | Promise<void>
}) {
  const [activeFilter, setActiveFilter] = useState('全部')
  const [activeOption, setActiveOption] = useState('智能匹配')
  const [batchOffset, setBatchOffset] = useState(0)
  const [lastAction, setLastAction] = useState('')
  const [showRule, setShowRule] = useState(false)
  const [remoteResources, setRemoteResources] = useState<Resource[] | null>(null)
  const [resourceDetail, setResourceDetail] = useState<ResourceDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [keyword, setKeyword] = useState(() => window.sessionStorage.getItem('a3-resource-keyword') || '')
  const pageResources = remoteResources?.length ? remoteResources : dashboard?.resources?.length ? dashboard.resources : resources

  useEffect(() => {
    let cancelled = false
    apiFetch('/api/resources', {}, { filter: activeFilter, sort: activeOption, keyword })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error('load resources failed'))))
      .then((payload: { resources: Resource[] }) => {
        if (!cancelled) setRemoteResources(payload.resources || [])
      })
      .catch(() => {
        if (!cancelled) setRemoteResources(null)
      })
    return () => {
      cancelled = true
    }
  }, [activeFilter, activeOption, keyword])

  const filteredResources = pageResources.filter((resource) => {
    if (activeFilter === '全部') return true
    if (activeFilter === '补弱') return resource.reason.includes('错题') || resource.reason.includes('薄弱') || resource.reason.includes('巩固')
    return resource.kind === activeFilter
  })
  const sortedResources = [...filteredResources].sort((a, b) => {
    if (activeOption === '难度') return a.stars - b.stars
    if (activeOption === '时长') return Number.parseInt(a.minutes, 10) - Number.parseInt(b.minutes, 10)
    if (activeOption === '资源类型') return a.kind.localeCompare(b.kind, 'zh-CN')
    return 0
  })
  const orderedResources = [...sortedResources.slice(batchOffset), ...sortedResources.slice(0, batchOffset)]

  const chooseFilter = (item: string) => {
    setActiveFilter(item)
    setBatchOffset(0)
    setLastAction('')
    saveUiState('resources', 'filters', { primary: item, option: activeOption, batchOffset: 0 })
    recordActivity({ pageKey: 'resources', actionType: 'filter_resources', actionLabel: item })
  }

  const chooseOption = (item: string) => {
    setActiveOption(item)
    setBatchOffset(0)
    setLastAction(`已按「${item}」重新整理资源列表。`)
    saveUiState('resources', 'filters', { primary: activeFilter, option: item, batchOffset: 0 })
    recordActivity({ pageKey: 'resources', actionType: 'sort_resources', actionLabel: item })
  }

  const rotateBatch = () => {
    setBatchOffset((value) => {
      const next = filteredResources.length ? (value + 3) % filteredResources.length : 0
      saveUiState('resources', 'filters', { primary: activeFilter, option: activeOption, batchOffset: next })
      return next
    })
    recordActivity({ pageKey: 'resources', actionType: 'rotate_resources', actionLabel: '换一批' })
  }

  const runResourceAction = async (resource: Resource) => {
    setDetailLoading(true)
    saveUiState('resources', 'lastResourceAction', { resourceId: resource.id || '', title: resource.title, action: resource.action })
    recordActivity({
      pageKey: 'resources',
      actionType: 'view_resource_detail',
      actionLabel: resource.action,
      entityType: 'learning_resource',
      entityId: resource.id,
      data: { title: resource.title, kind: resource.kind },
    })
    if (!resource.id) {
      setResourceDetail(resource)
      setDetailLoading(false)
      return
    }
    try {
      const response = await apiFetch(`/api/resources/${resource.id}`)
      if (response.ok) {
        const payload = await response.json()
        setResourceDetail(payload.resource)
        setLastAction(`已读取「${resource.title}」详情，资源来源和使用状态已写入数据库。`)
      }
    } finally {
      setDetailLoading(false)
    }
  }

  const openResource = (resource: ResourceDetail) => {
    const isLocalPdf = resource.openMode === 'local-file'
    logResourceUsage(resource, resource.action.includes('练习') || resource.action.includes('测评') ? 'started' : 'opened')
    recordActivity({
      pageKey: 'resources',
      actionType: 'open_resource_file',
      actionLabel: resource.externalUrl ? '跳转外部链接' : isLocalPdf ? '打开本地PDF' : '记录资源学习',
      entityType: 'learning_resource',
      entityId: resource.id,
      data: { title: resource.title, openMode: resource.openMode },
    })
    setLastAction(resource.externalUrl ? `已跳转「${resource.title}」公开视频入口。` : isLocalPdf ? `已打开「${resource.title}」本地 PDF。` : `已记录「${resource.title}」学习行为。`)
    if (resource.externalUrl) {
      window.open(resource.externalUrl, '_blank', 'noopener,noreferrer')
      return
    }
    if (resource.id && isLocalPdf) {
      window.open(apiUrl(`/api/resources/${resource.id}/file`), '_blank', 'noopener,noreferrer')
      return
    }
    setLastAction(`已记录「${resource.title}」学习行为；可在资源详情中完成练习或加入学习计划。`)
  }

  const startResourceLearning = async (resource: ResourceDetail) => {
    const minutes = Number.parseInt(resource.minutes, 10) || 15
    const task: Task = {
      id: undefined,
      resourceId: resource.id,
      time: '资源学习',
      title: resource.title,
      detail: resource.summary || resource.reason || '围绕当前目标模式完成资源阅读、提问或练习',
      minutes,
      status: '未开始',
      tag: resource.kind,
    }
    logResourceUsage(resource, resource.action.includes('练习') || resource.action.includes('测评') ? 'started' : 'opened')
    setResourceDetail(null)
    setLastAction(`已将「${resource.title}」带入智能辅导，完成后会回写学习记录。`)
    await onStartTask(task, 'recommendation')
  }

  const addResourceToPlan = async (resource: ResourceDetail) => {
    if (!resource.id) return
    const minutes = Number.parseInt(resource.minutes, 10) || 20
    try {
      const response = await apiFetch(`/api/resources/${resource.id}/plan`, {
        method: 'POST',
        body: JSON.stringify({
          title: resource.title,
          detail: resource.summary || resource.reason || '围绕当前课程目标完成资源学习',
          tag: resource.kind,
          minutes,
        }),
      })
      if (!response.ok) throw new Error('add plan failed')
      const payload = await response.json() as { plan: Task }
      setLastAction(`已把「${payload.plan.title}」加入学习计划。`)
      setResourceDetail(null)
      onNavigate('plan')
    } catch {
      setLastAction('加入学习计划失败，请稍后重试。')
    }
  }

  return (
    <section className="resource-layout">
      <Card className="resource-main">
        <label className="resource-search-inline"><Search size={17} /><input onChange={(event) => { setKeyword(event.target.value); window.sessionStorage.setItem('a3-resource-keyword', event.target.value) }} placeholder="搜索 OCR 正文、页码或资源标题" value={keyword} />{keyword ? <button onClick={() => { setKeyword(''); window.sessionStorage.removeItem('a3-resource-keyword') }} type="button">清空</button> : null}</label>
        <div className="resource-head"><div><h1>资源推荐</h1><p>基于目标模式、学习记录和能力画像，匹配课程资源与进阶材料</p></div></div>
        <div className="filter-row primary">{['全部', '补弱', '动画', '练习', '测评'].map((item) => <button className={activeFilter === item ? 'active' : ''} key={item} onClick={() => chooseFilter(item)} type="button">{item}</button>)}</div>
        <div className="filter-row secondary">{['知识点', '难度', '时长', '资源类型'].map((item) => <button className={activeOption === item ? 'active' : ''} key={item} onClick={() => chooseOption(item)} type="button">{item}<ChevronDown size={15} /></button>)}<button onClick={rotateBatch} type="button"><RefreshCw size={15} />换一批</button></div>
        <div className="resource-grid">{orderedResources.map((resource) => <ResourceCard key={resource.id || resource.title} onAction={runResourceAction} resource={resource} />)}</div>
      </Card>
      <aside className="resource-side">
        <Card title="推荐依据" className="recommend-basis">
          <Basis icon={<Target size={28} />} title="高数薄弱" text="最近练习中二重积分相关知识点正确率 62%" />
          <Basis icon={<BookOpen size={28} />} title="偏好动画" text="你更喜欢动画类资源，观看完成率较高" />
          <Basis icon={<Clock3 size={28} />} title="晚间学习" text="常在夜间学习，推荐中等时长资源更合适" />
        </Card>
        <Card className="tip-card"><b>{lastAction ? '资源使用记录' : '推荐逻辑'}</b><p>{lastAction || (showRule ? '推荐排序综合目标模式、知识点掌握度、近期错题、资源完成率和学习偏好，后续会引入资源质量评分。' : '资源点击、练习和测评结果会写入数据库，用于下一轮推荐权重。')}</p><button className="text-action" onClick={() => { setShowRule((value) => { const next = !value; saveUiState('resources', 'showRule', { value: next }); return next }); recordActivity({ pageKey: 'resources', actionType: 'toggle_recommend_rule', actionLabel: '了解推荐规则' }) }} type="button">{showRule ? '收起规则' : '了解推荐规则'} <ChevronRight size={16} /></button></Card>
      </aside>
      {resourceDetail ? <ResourceDetailDialog key={resourceDetail.id || resourceDetail.title} detail={resourceDetail} loading={detailLoading} onAddToPlan={addResourceToPlan} onClose={() => setResourceDetail(null)} onOpen={openResource} onStartLearning={startResourceLearning} /> : null}
    </section>
  )
}

const fallbackTutor: TutorData = {
  activeSession: {
    id: 'fallback',
    title: '二重积分为什么要换元',
    summary: '围绕积分区域和变量替换进行引导',
    lastMessageAt: new Date().toISOString(),
  },
  sessions: [
    { id: 'fallback', title: '二重积分为什么要换元', summary: '围绕积分区域和变量替换进行引导', lastMessageAt: new Date().toISOString() },
  ],
  messages: [
    { id: 'fallback-q', role: 'student', content: '二重积分换成极坐标时，积分限为什么会变？', createdAt: new Date().toISOString() },
    { id: 'fallback-a', role: 'assistant', content: '这是因为换元后描述同一个区域的坐标轴变了。我们先观察积分区域，再选择更适合的坐标系，最后别忘了补上雅可比因子。', createdAt: new Date().toISOString() },
  ],
  guidanceSteps: [
    { id: 'fallback-1', stepNo: 1, title: '观察积分区域', body: '先看区域边界是否包含圆、扇形或半径关系。若边界由 x² + y² 这类式子构成，极坐标通常更简洁。', hint: '把区域先画成草图，再决定坐标系。' },
    { id: 'fallback-2', stepNo: 2, title: '选择坐标系', body: '换成极坐标后，点的位置由 r 和 θ 描述，所以积分限要改写成 r 的范围和 θ 的范围。', hint: '不是区域变了，而是描述区域的语言变了。' },
    { id: 'fallback-3', stepNo: 3, title: '补上雅可比因子', body: '面积微元 dxdy 在极坐标下会变成 r dr dθ，这个 r 不能漏掉。', hint: '漏掉 r 是二重积分换元最常见错误。' },
  ],
  quickActions: [
    { type: 'explain_again', label: '换个角度解释' },
    { type: 'similar_question', label: '给我一个类似题' },
    { type: 'still_confused', label: '仍然不懂' },
  ],
}

function timeText(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
}

function getTutorCitations(message: ChatMessage) {
  const citations = message.metadata?.citations
  return Array.isArray(citations)
    ? citations
      .filter((item) => item && item.resourceTitle && item.excerpt)
      .slice(0, 2)
    : []
}

type MathSegment = {
  type: 'text' | 'math'
  value: string
  display?: boolean
}

function parseMathSegments(content: string): MathSegment[] {
  const source = String(content || '')
  const pattern = /(\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\\\([\s\S]+?\\\)|\$[^$\n]+?\$)/g
  const segments: MathSegment[] = []
  let cursor = 0
  for (const match of source.matchAll(pattern)) {
    const index = match.index ?? 0
    if (index > cursor) segments.push({ type: 'text', value: source.slice(cursor, index) })
    const token = match[0]
    if (token.startsWith('$$')) {
      segments.push({ type: 'math', value: token.slice(2, -2), display: true })
    } else if (token.startsWith('\\[')) {
      segments.push({ type: 'math', value: token.slice(2, -2), display: true })
    } else if (token.startsWith('\\(')) {
      segments.push({ type: 'math', value: token.slice(2, -2), display: false })
    } else {
      segments.push({ type: 'math', value: token.slice(1, -1), display: false })
    }
    cursor = index + token.length
  }
  if (cursor < source.length) segments.push({ type: 'text', value: source.slice(cursor) })
  return segments
}

function renderTextWithBreaks(value: string, keyPrefix: string) {
  return value.split('\n').map((part, index, array) => (
    <span key={`${keyPrefix}-${index}`}>
      {part}
      {index < array.length - 1 ? <br /> : null}
    </span>
  ))
}

function MathContent({ content }: { content: string }) {
  const segments = useMemo(() => parseMathSegments(content), [content])
  return (
    <div className="math-content">
      {segments.map((segment, index) => {
        if (segment.type === 'text') return renderTextWithBreaks(segment.value, `text-${index}`)
        return (
          <Suspense fallback={<code className="math-fallback">{segment.value}</code>} key={`math-${index}`}>
            <MathSegmentRenderer display={segment.display} value={segment.value} />
          </Suspense>
        )
      })}
    </div>
  )
}

function TutorCitations({ citations }: { citations: TutorCitation[] }) {
  if (!citations.length) return null
  return (
    <div className="tutor-citations">
      <b>参考教材片段</b>
      {citations.map((citation, index) => (
        <section className="tutor-citation" key={`${citation.resourceId || citation.resourceTitle}-${citation.chunkNo || index}`}>
          <span>{citation.pageRef || citation.heading || `片段 ${citation.chunkNo || index + 1}`}</span>
          <strong>{citation.resourceTitle}</strong>
          <p>{citation.excerpt}</p>
        </section>
      ))}
    </div>
  )
}

function TutorPage({
  activeLearning,
  onFinishLearning,
  onNavigate,
}: {
  activeLearning: LearningIntent | null
  onFinishLearning: (status: 'completed' | 'paused' | 'abandoned') => void | Promise<void>
  onNavigate: (key: PageKey) => void
}) {
  const [tutor, setTutor] = useState<TutorData>(fallbackTutor)
  const [input, setInput] = useState('')
  const [attachedImage, setAttachedImage] = useState<{ name: string; size: number; type: string } | null>(null)
  const [limit, setLimit] = useState(6)
  const [busy, setBusy] = useState(false)
  const [streamNotice, setStreamNotice] = useState('')
  const [finishBusy, setFinishBusy] = useState(false)
  const [relatedData, setRelatedData] = useState<RelatedTutorData | null>(null)
  const [relatedLoading, setRelatedLoading] = useState(false)
  const threadRef = useRef<HTMLDivElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const streamControllerRef = useRef<AbortController | null>(null)
  const activeSessionId = tutor.activeSession?.id
  const lastAssistantId = [...tutor.messages].reverse().find((message) => message.role === 'assistant')?.id
  const showRelatedPanel = Boolean(relatedLoading || relatedData?.knowledgeHits?.length || relatedData?.resources?.length)

  const loadTutor = useCallback((sessionId?: string, nextLimit = 6) => {
    return apiFetch('/api/tutor', {}, { limit: nextLimit, sessionId })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error('load tutor failed'))))
      .then((payload: TutorData) => setTutor(payload))
      .catch(() => setTutor((current) => current || fallbackTutor))
  }, [])

  useEffect(() => {
    const pathSessionId = window.location.pathname.startsWith('/tutor/')
      ? decodeURIComponent(window.location.pathname.replace('/tutor/', '').split('/')[0] || '')
      : ''
    loadTutor(pathSessionId || undefined)
  }, [loadTutor])

  useEffect(() => {
    const thread = threadRef.current
    if (!thread) return
    const latestAssistant = thread.querySelector<HTMLElement>('.chat-bubble.assistant:last-of-type')
    if (latestAssistant) {
      const threadTop = thread.getBoundingClientRect().top
      const latestTop = latestAssistant.getBoundingClientRect().top
      thread.scrollTop += latestTop - threadTop - 8
      return
    }
    thread.scrollTop = thread.scrollHeight
  }, [tutor.messages.length, tutor.guidanceSteps.length, activeSessionId])

  useEffect(() => {
    setStreamNotice('')
  }, [activeSessionId])

  useEffect(() => {
    const query = input.trim()
    if (query.length < 2) {
      setRelatedData(null)
      setRelatedLoading(false)
      return
    }
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      setRelatedLoading(true)
      apiFetch('/api/tutor/related-resources', { signal: controller.signal }, { q: query, limit: 4, resourceLimit: 3 })
        .then((response) => (response.ok ? response.json() : Promise.reject(new Error('load related failed'))))
        .then((payload: RelatedTutorData) => setRelatedData(payload))
        .catch(() => {
          if (!controller.signal.aborted) setRelatedData(null)
        })
        .finally(() => {
          if (!controller.signal.aborted) setRelatedLoading(false)
        })
    }, 450)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [input])

  const sendMessage = async () => {
    const typedContent = input.trim()
    const content = attachedImage
      ? `${typedContent || '请分析这张题图'}\n[题图：${attachedImage.name}，${Math.ceil(attachedImage.size / 1024)}KB]`
      : typedContent
    if ((!typedContent && !attachedImage) || busy) return
    setBusy(true)
    setStreamNotice('')
    const streamController = new AbortController()
    streamControllerRef.current = streamController
    try {
      const streamResponse = await apiFetch('/api/tutor/messages/stream', {
        method: 'POST',
        signal: streamController.signal,
        body: JSON.stringify({ sessionId: activeSessionId, content, attachments: attachedImage ? [attachedImage] : [] }),
      })
      if (!streamResponse.ok || !streamResponse.body) throw new Error('stream unavailable')

      const now = new Date().toISOString()
      const assistantTempId = `stream-assistant-${Date.now()}`
      setTutor((current) => ({
        ...current,
        messages: [
          ...current.messages,
          { id: `stream-student-${Date.now()}`, role: 'student', content, metadata: {}, createdAt: now },
          { id: assistantTempId, role: 'assistant', content: '', metadata: {}, createdAt: now },
        ],
        guidanceSteps: [],
      }))
      setInput('')
      setAttachedImage(null)

      const reader = streamResponse.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let finalPayload: TutorData | null = null
      const handleEvent = (block: string) => {
        const data = block.split('\n').filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trimStart()).join('\n')
        if (!data) return
        const event = JSON.parse(data) as { type: string; delta?: string; payload?: TutorData; error?: string }
        if (event.type === 'delta' && event.delta) {
          setTutor((current) => ({
            ...current,
            messages: current.messages.map((message) => message.id === assistantTempId ? { ...message, content: `${message.content}${event.delta}` } : message),
          }))
        }
        if (event.type === 'final' && event.payload) finalPayload = event.payload
        if (event.type === 'error') throw new Error(event.error || 'stream failed')
      }

      while (true) {
        const { value, done } = await reader.read()
        buffer += decoder.decode(value || new Uint8Array(), { stream: !done })
        let boundary = buffer.indexOf('\n\n')
        while (boundary >= 0) {
          handleEvent(buffer.slice(0, boundary))
          buffer = buffer.slice(boundary + 2)
          boundary = buffer.indexOf('\n\n')
        }
        if (done) break
      }
      if (buffer.trim()) handleEvent(buffer)
      if (finalPayload) {
        setTutor(finalPayload)
        setStreamNotice('')
      } else {
        throw new Error('stream missing final payload')
      }
    } catch {
      if (streamController.signal.aborted) {
        setStreamNotice('已停止生成。当前片段不会保存到历史记录，你可以继续提问。')
        return
      }
      const response = await apiFetch('/api/tutor/messages', {
        method: 'POST',
        body: JSON.stringify({ sessionId: activeSessionId, content, attachments: attachedImage ? [attachedImage] : [] }),
      })
      if (response.ok) {
        setTutor(await response.json())
        setInput('')
        setAttachedImage(null)
      }
    } finally {
      if (streamControllerRef.current === streamController) streamControllerRef.current = null
      setBusy(false)
    }
  }

  const stopStreaming = () => {
    if (!streamControllerRef.current) return
    streamControllerRef.current.abort()
    streamControllerRef.current = null
    setBusy(false)
    setStreamNotice('已停止生成。当前片段不会保存到历史记录，你可以继续提问。')
    recordActivity({ pageKey: 'tutor', actionType: 'stop_streaming_answer', actionLabel: '停止生成', entityType: 'chat_session', entityId: activeSessionId })
  }

  const runAction = async (actionType: string, actionLabel: string) => {
    if (busy) return
    setBusy(true)
    try {
      const response = await apiFetch('/api/tutor/actions', {
        method: 'POST',
        body: JSON.stringify({ sessionId: activeSessionId, actionType, actionLabel }),
      })
      if (response.ok) setTutor(await response.json())
    } finally {
      setBusy(false)
    }
  }

  const startSession = async () => {
    if (busy) return
    setBusy(true)
    try {
      const response = await apiFetch('/api/tutor/sessions', {
        method: 'POST',
        body: JSON.stringify({ title: '新的辅导对话' }),
      })
      if (response.ok) {
        const payload = await response.json() as TutorData
        setTutor(payload)
        if (payload.activeSession?.id) window.history.pushState({ page: 'tutor', sessionId: payload.activeSession.id }, '', `/tutor/${payload.activeSession.id}`)
        setInput('')
        setStreamNotice('')
      }
    } finally {
      setBusy(false)
    }
  }

  const loadMore = () => {
    const nextLimit = limit + 6
    setLimit(nextLimit)
    runAction('load_more', '加载更多').then(() => loadTutor(activeSessionId, nextLimit))
  }

  const clearHistory = () => {
    runAction('clear_history', '清空历史').then(() => setLimit(6))
  }

  const closeLearning = async (status: 'completed' | 'paused' | 'abandoned') => {
    if (!activeLearning || finishBusy || activeLearning.sessionStatus === 'completed') return
    setFinishBusy(true)
    try {
      await onFinishLearning(status)
    } finally {
      setFinishBusy(false)
    }
  }

  const chooseImage = (file?: File) => {
    if (!file) return
    setAttachedImage({ name: file.name, size: file.size, type: file.type || 'image/*' })
    recordActivity({ pageKey: 'tutor', actionType: 'attach_question_image', actionLabel: file.name, data: { size: file.size, type: file.type } })
  }

  return (
    <section className="tutor-layout">
      <Card title="对话历史" action="新对话" actionOnClick={startSession} className="history-card">
        <div className="history-list">
          {tutor.sessions.map((session) => <button className={session.id === activeSessionId ? 'active history-item' : 'history-item'} key={session.id} onClick={() => { window.history.pushState({ page: 'tutor', sessionId: session.id }, '', `/tutor/${session.id}`); loadTutor(session.id) }} type="button"><MessageSquare size={17} /><b>{session.title}</b><small>{timeText(session.lastMessageAt)}</small><p>{session.summary || '继续上次的学习问题'}</p></button>)}
        </div>
        <div className="history-footer">
          <button disabled={busy} onClick={startSession} type="button"><Plus size={16} />开启新对话</button>
          <button disabled={busy} type="button" onClick={loadMore}>加载更多</button>
          <button disabled={busy} type="button" onClick={clearHistory}>清空历史</button>
        </div>
      </Card>
      <Card className="chat-card">
        <header><h1>AI 智能辅导 <small>不会直接给答案，帮你理解思路</small></h1></header>
        {activeLearning ? (
          <div className="learning-context">
            <span className={activeLearning.sessionStatus === 'completed' ? 'done' : activeLearning.sessionStatus === 'paused' ? 'paused' : ''}>
              {activeLearning.sessionStatus === 'completed' ? '已完成' : activeLearning.sessionStatus === 'paused' ? '已暂停' : activeLearning.mode === 'review' ? '正在回顾' : '正在学习'}
            </span>
            <div>
              <b>{activeLearning.task.title}</b>
              <p>{activeLearning.task.detail}</p>
              <small>{getLearningSourceLabel(activeLearning.source)} · {activeLearning.task.tag} · 目标 {activeLearning.targetMinutes || activeLearning.task.minutes} 分钟 · {activeLearning.completionDefinition || '完成有效学习后可标记完成'}</small>
              {activeLearning.completionReason ? <em>{activeLearning.completionReason}{activeLearning.completionScore ? ` · ${activeLearning.completionScore} 分` : ''}</em> : null}
            </div>
            <div className="learning-context-actions">
              {activeLearning.sessionStatus === 'completed' ? (
                <>
                  <button disabled type="button">已完成</button>
                  <button onClick={() => onNavigate('report')} type="button">查看报告</button>
                  <button disabled={busy} onClick={() => runAction('similar_example', '再练一次')} type="button">再练一次</button>
                </>
              ) : (
                <>
                  <button disabled={finishBusy} onClick={() => closeLearning('completed')} type="button">完成本次学习</button>
                  <button disabled={finishBusy} onClick={() => closeLearning('paused')} type="button">稍后继续</button>
                  <button onClick={() => onNavigate('report')} type="button">查看报告</button>
                </>
              )}
            </div>
          </div>
        ) : null}
        <div className="chat-thread" ref={threadRef}>
          {tutor.messages.length ? tutor.messages.map((message) => (
            <article className={message.role === 'student' ? 'chat-bubble user' : 'chat-bubble assistant'} key={message.id}>
              <MathContent content={message.content} />
              {message.role === 'assistant' ? <TutorCitations citations={getTutorCitations(message)} /> : null}
              {message.role === 'assistant' && message.id === lastAssistantId ? tutor.guidanceSteps.map((step) => <StepBox key={step.id} onToggle={(next) => { saveUiState('tutor', 'lastHintToggle', { stepId: step.id, stepNo: step.stepNo, open: next }); recordActivity({ pageKey: 'tutor', actionType: 'toggle_guidance_hint', actionLabel: step.title, entityType: 'chat_session', entityId: activeSessionId, data: { stepNo: step.stepNo, open: next } }) }} step={step} />) : null}
              {message.role === 'assistant' && message.id === lastAssistantId ? <p className="assistant-close">你可以先动手试一试，写出你的想法，我再帮你检查和完善。</p> : null}
              <small>{timeText(message.createdAt)}</small>
            </article>
          )) : <div className="empty-chat"><b>开启一次新的辅导吧</b><p>把不会的题目、你的思路或截图发过来，我会按步骤引导你理解。</p></div>}
          {busy && (
            <div className="typing-indicator">
              <span /><span /><span />
              <small>AI 思考中...</small>
              <button onClick={stopStreaming} type="button">停止生成</button>
            </div>
          )}
          {!busy && streamNotice ? (
            <div className="stream-notice" role="status">
              <small>{streamNotice}</small>
              <button onClick={() => setStreamNotice('')} type="button">知道了</button>
            </div>
          ) : null}
        </div>
        <div className="chat-actions">{tutor.quickActions.map((action) => <button disabled={busy} key={action.type} onClick={() => runAction(action.type, action.label)} type="button">{action.label}</button>)}</div>
        {showRelatedPanel ? (
          <div className="related-knowledge-panel">
            <div><b>相关知识</b><small>{relatedLoading ? '检索中...' : relatedData?.keywords?.slice(0, 3).join(' / ') || '本地知识库'}</small></div>
            {relatedData?.knowledgeHits?.slice(0, 2).map((hit) => (
              <section key={`${hit.type}-${hit.id}`}>
                <span>{hit.type === 'resource_chunk' ? '教材片段' : hit.type === 'question' ? '相关题目' : '知识点'}</span>
                <strong>{hit.title}</strong>
                <p>{hit.excerpt}</p>
              </section>
            ))}
            {relatedData?.resources?.length ? <p className="related-resource-line">推荐资源：{relatedData.resources.slice(0, 2).map((resource) => resource.title).join('、')}</p> : null}
          </div>
        ) : null}
        <div className="chat-input-wrap">
          {attachedImage ? <div className="attachment-preview"><span>{attachedImage.name}</span><small>{Math.ceil(attachedImage.size / 1024)}KB · 将作为题图上下文发送</small><button aria-label="移除题图" onClick={() => setAttachedImage(null)} type="button"><X size={14} /></button></div> : null}
          <label className="chat-input">
            <input onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') sendMessage() }} placeholder={activeLearning ? `围绕「${activeLearning.task.title}」提问` : '输入你的问题，或上传题图'} value={input} />
            <input accept="image/*" hidden onChange={(event) => chooseImage(event.target.files?.[0])} ref={fileInputRef} type="file" />
            <button aria-label="上传题图" className="attach-btn" disabled={busy} onClick={() => fileInputRef.current?.click()} type="button"><Plus size={18} /></button>
            <button aria-label="发送问题" disabled={busy || (!input.trim() && !attachedImage)} onClick={sendMessage} type="button"><Send size={18} /></button>
          </label>
        </div>
      </Card>
    </section>
  )
}

function ReportPage({ dashboard, onNavigate }: { dashboard: DashboardData | null; onNavigate: (key: PageKey) => void }) {
  const hero = dashboard?.hero
  const [tab, setTab] = useState('本周报告')
  const [detail, setDetail] = useState<'accuracy' | 'mistake' | null>(null)
  const [report, setReport] = useState<ReportSummary | null>(dashboard?.report || null)
  const [reportLoading, setReportLoading] = useState(true)
  const [agentRun, setAgentRun] = useState<AgentRunResult | null>(null)
  const [agentLoading, setAgentLoading] = useState(false)
  const [agentError, setAgentError] = useState('')
  const [agentApplyLoading, setAgentApplyLoading] = useState(false)
  const [agentApplyMessage, setAgentApplyMessage] = useState('')
  const [agentApplied, setAgentApplied] = useState(false)
  const period = tab === '本月报告' ? 'month' : tab === '学期报告' ? 'term' : 'week'
  const currentReport = report || dashboard?.report || null

  useEffect(() => {
    let cancelled = false
    Promise.resolve().then(() => apiFetch('/api/reports/summary', {}, { period }))
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error('load report failed'))))
      .then((payload: ReportSummary) => {
        if (!cancelled) setReport(payload)
      })
      .catch(() => {
        if (!cancelled) setReport(dashboard?.report || null)
      })
      .finally(() => {
        if (!cancelled) setReportLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [dashboard?.report, period])

  const reportMetrics = [
    ['学习时长', `${(currentReport?.summary.studyHours ?? hero?.weeklyHours ?? 0).toFixed(1)} 小时`, '由学习会话与每日指标汇总'],
    ['任务完成率', `${currentReport?.summary.completionRate ?? hero?.progress ?? 0}%`, '由计划任务完成记录计算'],
    ['平均正确率', `${currentReport?.summary.averageAccuracy ?? hero?.averageAccuracy ?? 0}%`, '由每日正确率平均'],
    ['错题总数', `${currentReport?.summary.mistakeCount ?? hero?.mistakeCount ?? 0} 题`, '由题目作答记录聚合'],
  ]

  const exportReport = () => {
    const payload = {
      reportType: tab,
      generatedAt: new Date().toISOString(),
      range: currentReport?.range,
      metrics: reportMetrics,
      trend: currentReport?.trend || [],
      mistakeBuckets: currentReport?.mistakeBuckets || [],
      source: 'A3 local database + server report summary',
    }
    logReportExport(tab, payload, currentReport?.range)
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `a3-${tab}.json`
    anchor.click()
    URL.revokeObjectURL(url)
    recordActivity({ pageKey: 'report', actionType: 'export_report', actionLabel: tab, data: { reportType: tab } })
  }

  const runAgentAnalysis = async () => {
    if (agentLoading) return
    setAgentLoading(true)
    setAgentError('')
    try {
      const response = await apiFetch('/api/agents/run', {
        method: 'POST',
        body: JSON.stringify({
          query: agentRun?.finalRecommendation?.focus || '学习报告分析',
          source: 'report',
          reportType: tab,
        }),
      })
      if (!response.ok) throw new Error('run agents failed')
      const payload = await response.json() as AgentRunResult
      setAgentRun(payload)
      setAgentApplied(false)
      setAgentApplyMessage('')
      saveUiState('report', 'latestAgentTask', { taskId: payload.taskId })
      recordActivity({ pageKey: 'report', actionType: 'run_agent_analysis', actionLabel: '智能体分析', entityType: 'agent_task', entityId: payload.taskId, data: { reportType: tab, logCount: payload.logs?.length || 0 } })
    } catch {
      setAgentError('智能体分析暂时不可用，请稍后重试。')
    } finally {
      setAgentLoading(false)
    }
  }

  const applyAgentAdjustment = async () => {
    if (!agentRun || agentApplyLoading) return
    setAgentApplyLoading(true)
    setAgentApplyMessage('')
    try {
      const response = await apiFetch('/api/plans/adjust', {
        method: 'POST',
        body: JSON.stringify({
          startTime: '20:30',
          source: 'agent_analysis',
          agentTaskId: agentRun.taskId,
        }),
      })
      if (!response.ok) throw new Error('apply adjustment failed')
      const payload = await response.json() as { plans?: Task[]; adjustmentReason?: string }
      setAgentApplyMessage(`已写入 ${payload.plans?.length || 0} 个动态调整任务。${payload.adjustmentReason || ''}`)
      setAgentApplied(true)
      recordActivity({ pageKey: 'report', actionType: 'apply_agent_adjustment', actionLabel: '应用智能体调整', entityType: 'agent_task', entityId: agentRun.taskId, data: { count: payload.plans?.length || 0, reason: payload.adjustmentReason || '' } })
    } catch {
      setAgentApplyMessage('应用调整失败，请稍后重试。')
    } finally {
      setAgentApplyLoading(false)
    }
  }

  return (
    <section className="report-layout">
      <div className="report-title"><h1>学习报告</h1><div><button disabled={agentLoading} onClick={runAgentAnalysis} type="button"><Bot size={18} />{agentLoading ? '分析中' : '智能体分析'}</button><button onClick={exportReport} type="button"><Download size={18} />导出报告</button></div></div>
      <div className="report-tabs">{['本周报告', '本月报告', '学期报告'].map((item) => <button className={tab === item ? 'active' : ''} key={item} onClick={() => { setReportLoading(true); setTab(item); saveUiState('report', 'tab', { value: item }); recordActivity({ pageKey: 'report', actionType: 'switch_report_tab', actionLabel: item }) }} type="button">{item}</button>)}</div>
      <Card className="report-summary">
        <h2>{tab.replace('报告', '概况')} <span>{currentReport ? `（${currentReport.range.start} - ${currentReport.range.end}）` : '（暂无区间数据）'}</span>{reportLoading ? <em>更新中...</em> : null}</h2>
        <div>{reportMetrics.map((item) => <ReportMetric key={item[0]} label={item[0]} value={item[1]} note={item[2]} />)}</div>
      </Card>
      {(agentRun || agentLoading || agentError) ? <AgentAnalysisPanel applied={agentApplied} applyLoading={agentApplyLoading} applyMessage={agentApplyMessage} data={agentRun} error={agentError} loading={agentLoading} onApply={applyAgentAdjustment} onRefresh={runAgentAnalysis} onViewPlan={() => onNavigate('plan')} /> : null}
      <Card title="正确率趋势" action={detail === 'accuracy' ? '收起' : '详情'} actionOnClick={() => { setDetail((value) => { const next = value === 'accuracy' ? null : 'accuracy'; saveUiState('report', 'detail', { value: next || '' }); return next }); recordActivity({ pageKey: 'report', actionType: 'toggle_accuracy_detail', actionLabel: '正确率趋势详情' }) }} className="accuracy-card"><AccuracyChart points={currentReport?.trend || dashboard?.dailyMetrics || []} />{detail === 'accuracy' ? <p className="report-detail-note">趋势线由 `learning_metric_daily.accuracy_rate` 按日期绘制，页面只渲染服务端聚合结果。</p> : null}</Card>
      <Card title="错题类型分布" action={detail === 'mistake' ? '收起' : '详情'} actionOnClick={() => { setDetail((value) => { const next = value === 'mistake' ? null : 'mistake'; saveUiState('report', 'detail', { value: next || '' }); return next }); recordActivity({ pageKey: 'report', actionType: 'toggle_mistake_detail', actionLabel: '错题分布详情' }) }} className="mistake-card"><DonutChart buckets={currentReport?.mistakeBuckets || []} total={currentReport?.summary.mistakeCount || 0} />{detail === 'mistake' ? <p className="report-detail-note">分布来自 `student_question_attempts.mistake_type` 服务端聚合，空数据会显示占位状态。</p> : null}</Card>
      <Card title="本周掌握情况" className="table-card"><MasteryTable /></Card>
      <Card title="老师评语与建议" className="comment-card">
        <div><b>本周学习总结</b><p>本周整体表现良好，能够按时完成学习任务，课堂参与度高。正确率有所提升，尤其在积分换元和特征值概念方面进步明显。</p></div>
        <div><b>改进建议</b><p>数学建模题仍是薄弱环节，建议加强题干关键词提取和列式训练；注意符号书写规范，减少粗心错误。</p></div>
        <div className="next-week"><b>下周学习重点</b><p>高等数学应用强化训练、错题巩固复盘、提升列式准确率。</p></div>
      </Card>
    </section>
  )
}

function Card({ title, action, actionOnClick, className = '', children }: { title?: string; action?: string; actionOnClick?: () => void; className?: string; children: React.ReactNode }) {
  return <section className={`design-card ${className}`}>{title ? <header><h2>{title}</h2>{action ? <button onClick={actionOnClick} type="button">{action}<ChevronRight size={16} /></button> : null}</header> : null}{children}</section>
}

function Metric({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone: string }) {
  return <div className={`metric-card ${tone}`}><span>{icon}</span><div><small>{label}</small><strong>{value}</strong></div></div>
}

function ProgressRing({ value, label, sub }: { value: number; label: string; sub: string }) {
  return <div className="progress-ring"><span>{label}</span><div style={{ background: `conic-gradient(#0a9888 0 ${value}%, #e7eeee ${value}% 100%)` }}><b>{value}%</b></div><small>{sub}</small></div>
}

function getTaskActionLabel(task: Task) {
  if (task.status === '已完成') return '回顾'
  if (task.status === '进行中') return '继续学习'
  return '开始学习'
}

function getLearningSourceLabel(source: LearningIntent['source']) {
  if (source === 'plan') return '学习计划'
  if (source === 'recommendation') return '目标研判'
  return '学习首页'
}

function TaskRow({ task, index, onStartTask }: { task: Task; index: number; onStartTask: (task: Task) => void }) {
  const actionLabel = getTaskActionLabel(task)
  return <article className={`task-row-ref ${task.status === '进行中' ? 'active' : ''}`}><span className="task-node">{task.status === '已完成' ? <CheckCircle2 size={22} /> : index + 1}</span><div><b>{task.title}</b><em>{task.tag}</em><p>预计 {task.minutes} 分钟</p></div><strong>{task.status}</strong><button onClick={() => onStartTask(task)} type="button">{actionLabel}</button></article>
}

function MiniStat({ label, value, note }: { label: string; value: string; note: string }) {
  return <span><small>{label}</small><b>{value}</b><em>{note}</em></span>
}

function LineSpark() {
  return <svg className="line-spark" viewBox="0 0 360 120"><line x1="30" y1="10" x2="30" y2="100" /><line x1="30" y1="100" x2="340" y2="100" /><polyline points="30,78 82,55 134,55 186,55 238,42 290,78 340,60" /><g>{[30,82,134,186,238,290,340].map((x, i) => <circle key={x} cx={x} cy={[78,55,55,55,42,78,60][i]} r="4" />)}</g></svg>
}

function RadarChart() {
  const points = useMemo(() => '100,18 168,58 168,140 100,180 32,140 32,58', [])
  return <svg className="radar-ref" viewBox="0 0 200 200"><polygon points="100,18 171,59 171,141 100,182 29,141 29,59" /><polygon points="100,43 149,71 149,129 100,157 51,129 51,71" /><polygon points={points} className="radar-value" /><circle cx="100" cy="18" r="5" /><circle cx="168" cy="58" r="5" /><circle cx="168" cy="140" r="5" /><circle cx="100" cy="180" r="5" /><circle cx="32" cy="140" r="5" /><circle cx="32" cy="58" r="5" /></svg>
}

function MasteryRow({ name, value }: { name: string; value: number }) {
  return <div className="mastery-row"><span>{name}</span><i><b style={{ width: `${value}%` }} /></i><strong>{value}%</strong></div>
}

function ScheduleRow({ task, editable = false, onDelete, onStart, onViewAgentTrace }: { task: Task; editable?: boolean; onDelete?: (task: Task) => void; onStart?: (task: Task) => void; onViewAgentTrace?: (task: Task) => void }) {
  const fromAgent = task.sourceDetail === 'agent_analysis' || Boolean(task.agentTaskId)
  return <article className={`schedule-row ${task.status === '进行中' ? 'active' : ''} ${editable ? 'editable' : ''} ${fromAgent ? 'agent-sourced' : ''}`}><time>{task.time}</time><span className="dot" /><div><b>{task.title}</b><p>{task.detail}</p>{fromAgent ? <button className="task-source-badge" disabled={!task.agentTaskId} onClick={() => onViewAgentTrace?.(task)} type="button"><Bot size={13} />{task.sourceLabel || '智能体分析'}{task.agentTaskId ? ` · ${task.agentTaskId.slice(0, 8)}` : ''}</button> : null}</div><em>{task.status}</em><button className="schedule-action" onClick={() => onStart?.(task)} type="button">{getTaskActionLabel(task)}</button>{editable ? <button aria-label={`删除${task.title}`} className="delete-plan" disabled={!task.id} onClick={() => onDelete?.(task)} type="button"><Trash2 size={16} /></button> : null}</article>
}

function ResourceDetailDialog({
  detail,
  loading,
  onAddToPlan,
  onClose,
  onOpen,
  onStartLearning,
}: {
  detail: ResourceDetail
  loading: boolean
  onAddToPlan: (resource: ResourceDetail) => void | Promise<void>
  onClose: () => void
  onOpen: (resource: ResourceDetail) => void
  onStartLearning: (resource: ResourceDetail) => void | Promise<void>
}) {
  const isExternal = Boolean(detail.externalUrl)
  const isLocalPdf = detail.openMode === 'local-file'
  const chunks = detail.chunks || []
  const questions = detail.questions || []
  const ocrLabel = detail.ocrStatus === 'completed'
    ? `OCR 已完成，${detail.ocrChunkCount || detail.chunkCount || chunks.length} 个片段`
    : detail.ocrStatus === 'partial'
      ? `OCR 已识别 ${detail.ocrPagesDone || 0} 页，${detail.ocrChunkCount || detail.chunkCount || chunks.length} 个片段`
      : detail.ocrRequired
        ? '扫描版待 OCR'
        : detail.textLayer
          ? '已可检索'
          : '已登记'
  const ocrJobLabel = detail.latestOcrJob
    ? `最近 OCR：${detail.latestOcrJob.status} ${detail.latestOcrJob.processedPages}/${detail.latestOcrJob.totalPages || detail.latestOcrJob.processedPages} 页`
    : ''
  const primaryLabel = isExternal ? '跳转观看' : isLocalPdf ? '打开 PDF' : questions.length ? '开始练习' : '记录学习'
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [attempts, setAttempts] = useState<Record<string, { isCorrect: boolean | null; score: number | null; solution: string }>>({})
  const [submittingId, setSubmittingId] = useState('')
  const [chunkKeyword, setChunkKeyword] = useState('')
  const [chunkOffset, setChunkOffset] = useState(0)
  const [loadedChunks, setLoadedChunks] = useState<ResourceChunk[] | null>(null)
  const [chunkTotal, setChunkTotal] = useState(chunks.length)
  const chunkWindowCount = (loadedChunks || chunks).length
  const chunkLimit = 12

  useEffect(() => {
    if (!detail.id) return
    const controller = new AbortController()
    apiFetch(`/api/resources/${detail.id}/chunks`, { signal: controller.signal }, { keyword: chunkKeyword, limit: chunkLimit, offset: chunkOffset })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error('load chunks failed'))))
      .then((payload: { chunks: ResourceChunk[]; total: number }) => {
        setLoadedChunks(payload.chunks || [])
        setChunkTotal(payload.total || 0)
      })
      .catch((error) => {
        if (error.name !== 'AbortError') setLoadedChunks(null)
      })
    return () => controller.abort()
  }, [detail.id, chunkKeyword, chunkOffset])

  const submitAnswer = async (question: ResourceQuestion) => {
    const answerText = (answers[question.id] || '').trim()
    if (!answerText || submittingId) return
    setSubmittingId(question.id)
    try {
      const response = await apiFetch('/api/question-attempts', {
        method: 'POST',
        body: JSON.stringify({
          questionId: question.id,
          answerText,
          metadata: { resourceId: detail.id, source: 'resource-detail-dialog' },
        }),
      })
      if (response.ok) {
        const payload = await response.json()
        setAttempts((current) => ({
          ...current,
          [question.id]: {
            isCorrect: payload.attempt?.isCorrect ?? null,
            score: payload.attempt?.score ?? null,
            solution: payload.solution || '',
          },
        }))
      }
    } finally {
      setSubmittingId('')
    }
  }

  return (
    <div className="resource-detail-overlay" role="dialog" aria-modal="true">
      <article className="resource-detail-dialog">
        <header>
          <div>
            <span>{detail.kind} · {detail.minutes}</span>
            <h2>{detail.title}</h2>
            <p>{detail.summary || detail.reason}</p>
          </div>
          <button aria-label="关闭资源详情" onClick={onClose} type="button"><X size={20} /></button>
        </header>
        <div className="resource-detail-meta">
          <span>来源：{detail.sourceName || (isExternal ? '中国公开视频链接' : '本地资源目录')}</span>
          <span>{detail.sourceCountry === 'CN' || isExternal ? '中国资源' : '本地资源'}</span>
          {detail.pageCount ? <span>{detail.pageCount} 页</span> : null}
          <span>{ocrLabel}</span>
          {ocrJobLabel ? <span>{ocrJobLabel}</span> : null}
          <span>{detail.chunkCount || chunks.length} 个切片</span>
        </div>
        <div className="resource-detail-body">
          <section>
            <div className="chunk-tools"><label><Search size={15} /><input onChange={(event) => { setChunkKeyword(event.target.value); setChunkOffset(0) }} placeholder="在 OCR 文本中搜索" value={chunkKeyword} /></label><span>{chunkWindowCount}/{chunkTotal} 个片段</span><button disabled={chunkOffset <= 0} onClick={() => setChunkOffset((value) => Math.max(0, value - chunkLimit))} type="button">上一页</button><button disabled={chunkOffset + chunkLimit >= chunkTotal} onClick={() => setChunkOffset((value) => value + chunkLimit)} type="button">下一页</button></div>
            <h3>资源内容</h3>
            {chunks.length ? chunks.map((chunk) => <div className="resource-chunk" key={chunk.id}><b>{chunk.heading}</b><small>{chunk.pageRef ? `页码 ${chunk.pageRef}` : '文本切片'}</small><p>{chunk.body}</p></div>) : <p className="resource-empty">当前资源已完成登记，但这份 PDF 没有可直接抽取的文本层。现在可以打开原文阅读；后续接入 OCR 后会自动生成可检索切片。</p>}
          </section>
          <section>
            <h3>练习与测评</h3>
            {questions.length ? questions.map((question) => {
              const attempt = attempts[question.id]
              return (
                <div className="resource-question" key={question.id}>
                  <b>{question.stem}</b>
                  <small>难度 {question.difficultyLevel} · {question.estimatedMinutes || 5} 分钟</small>
                  <label>
                    <input onChange={(event) => setAnswers((current) => ({ ...current, [question.id]: event.target.value }))} placeholder="输入你的答案" value={answers[question.id] || ''} />
                    <button disabled={submittingId === question.id || !(answers[question.id] || '').trim()} onClick={() => submitAnswer(question)} type="button">{submittingId === question.id ? '提交中' : '提交'}</button>
                  </label>
                  {attempt ? <p className={attempt.isCorrect ? 'attempt-ok' : 'attempt-review'}>{attempt.isCorrect ? '回答正确' : '需要复盘'}{attempt.score !== null ? ` · ${attempt.score} 分` : ''}。{attempt.solution}</p> : null}
                </div>
              )
            }) : <p className="resource-empty">暂未从该资源抽取结构化题目。习题类 PDF 完成 OCR 后会自动沉淀题干、答案和解析。</p>}
          </section>
        </div>
        <footer>
          <button className="primary" disabled={loading || (!detail.id && !detail.externalUrl)} onClick={() => onOpen(detail)} type="button">{isExternal ? <ExternalLink size={17} /> : <BookOpen size={17} />}{primaryLabel}</button>
          <button disabled={loading || !detail.id} onClick={() => onAddToPlan(detail)} type="button">加入学习计划</button>
          <button disabled={loading || !detail.id} onClick={() => onStartLearning(detail)} type="button">带入辅导</button>
        </footer>
      </article>
    </div>
  )
}

function ResourceCard({ resource, onAction }: { resource: Resource; onAction?: (resource: Resource) => void }) {
  return <article className="resource-card-ref"><span className={`resource-icon ${resource.color}`}><BookOpen size={28} /></span><b>{resource.title}</b><small>{resource.kind} · {resource.minutes}{resource.ocrRequired ? ' · 扫描版' : ''}</small><p>匹配原因：{resource.reason}</p><div className="stars">难度：{'★'.repeat(resource.stars)}{'☆'.repeat(5 - resource.stars)}</div><button onClick={() => onAction?.(resource)} type="button">{resource.action}</button></article>
}

function Basis({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return <div className="basis-row"><span>{icon}</span><b>{title}</b><p>{text}</p></div>
}

function StepBox({ step, onToggle }: { step: GuidanceStep; onToggle?: (showHint: boolean) => void }) {
  const [showHint, setShowHint] = useState(false)
  return <div className="step-box"><b>第 {step.stepNo} 步：{step.title}</b><button onClick={() => setShowHint((value) => { const next = !value; onToggle?.(next); return next })} type="button">{step.hint ? (showHint ? '收起' : '提示') : '查看'}</button><p>{step.body}</p>{showHint && step.hint ? <small className="step-hint">{step.hint}</small> : null}</div>
}

function ReportMetric({ label, value, note }: { label: string; value: string; note: string }) {
  return <span className="report-metric"><i><Clock3 size={30} /></i><small>{label}</small><b>{value}</b><em>{note}</em></span>
}

function AgentAnalysisPanel({
  applied,
  applyLoading,
  applyMessage,
  data,
  error,
  loading,
  mode = 'actionable',
  onApply,
  onRefresh,
  onViewPlan,
}: {
  applied?: boolean
  applyLoading?: boolean
  applyMessage?: string
  data: AgentRunResult | null
  error: string
  loading: boolean
  mode?: 'actionable' | 'readonly'
  onApply?: () => void
  onRefresh: () => void
  onViewPlan?: () => void
}) {
  const recommendation = data?.finalRecommendation
  const actionable = mode === 'actionable'
  return (
    <Card className="agent-analysis-card">
      <header>
        <div>
          <h2>智能体分析过程</h2>
          <p>{recommendation?.summary || (loading ? '正在读取画像、知识库、资源和计划数据。' : error || '运行一次分析后会显示协同过程。')}</p>
        </div>
        <div className="agent-panel-actions">
          <button disabled={loading} onClick={onRefresh} type="button"><RefreshCw size={16} />{loading ? '分析中' : data ? '重新分析' : '开始分析'}</button>
          {actionable ? <button className="primary" disabled={!data || applyLoading || loading} onClick={onApply} type="button"><Target size={16} />{applyLoading ? '写入中' : '应用调整'}</button> : null}
          {actionable && applied ? <button onClick={onViewPlan} type="button"><CalendarDays size={16} />查看计划</button> : null}
        </div>
      </header>
      {recommendation ? (
        <div className="agent-final">
          <span><b>下一步</b>{recommendation.nextAction || '查看学习计划'}</span>
          <span><b>聚焦</b>{recommendation.focus || '当前薄弱知识点'}</span>
          <span><b>任务</b>{data?.taskId.slice(0, 8)}</span>
        </div>
      ) : null}
      {applyMessage ? <p className="agent-apply-message">{applyMessage}</p> : null}
      {error ? <p className="agent-error">{error}</p> : null}
      <div className="agent-step-list">
        {(data?.logs || []).map((log) => (
          <article className={`agent-step ${log.status}`} key={log.id}>
            <span>{log.stepNo}</span>
            <div>
              <b>{log.agentName}</b>
              <p>{log.outputSummary}</p>
              <small>{log.inputSummary}</small>
              <em>{log.suggestion}</em>
            </div>
            <strong>{Math.round((log.confidence || 0) * 100)}%</strong>
          </article>
        ))}
        {loading && !data ? Array.from({ length: 4 }, (_, index) => (
          <article className="agent-step loading" key={index}>
            <span>{index + 1}</span>
            <div><b>智能体准备中</b><p>正在生成分析步骤。</p><small>等待服务端返回过程日志</small></div>
            <strong>...</strong>
          </article>
        )) : null}
      </div>
    </Card>
  )
}

function AccuracyChart({ points }: { points: { date: string; accuracyRate: number }[] }) {
  const visible = points.slice(-7)
  if (!visible.length) return <div className="chart-empty">暂无正确率数据</div>
  const coords = visible.map((point, index) => {
    const x = 52 + (visible.length === 1 ? 0 : (478 / (visible.length - 1)) * index)
    const y = 192 - (Math.max(0, Math.min(100, point.accuracyRate)) / 100) * 150
    return { x, y, label: `${Math.round(point.accuracyRate)}%`, date: point.date.slice(5).replace('-', '/') }
  })
  return <svg className="accuracy-chart" viewBox="0 0 560 240"><g>{[0,1,2,3,4].map((i) => <line key={i} x1="52" x2="530" y1={42 + i*34} y2={42 + i*34} />)}</g><polyline points={coords.map((point) => `${point.x},${point.y}`).join(' ')} /><g>{coords.map((point) => <g key={`${point.date}-${point.label}`}><circle cx={point.x} cy={point.y} r="6" /><text x={point.x} y={point.y - 16}>{point.label}</text><text x={point.x} y="225">{point.date}</text></g>)}</g></svg>
}

function DonutChart({ buckets, total }: { buckets: { mistakeType: string; count: number }[]; total: number }) {
  if (!total || !buckets.length) return <div className="chart-empty">暂无错题分布数据</div>
  const labels: Record<string, string> = {
    needs_review: '待复盘',
    concept: '概念理解',
    calculation: '计算错误',
    symbol: '符号错误',
    method: '方法选择',
    angle_range: '角度范围',
    radius_range: '半径范围',
    missing_jacobian: '雅可比因子',
    sign_error: '符号方向',
  }
  const colors = ['#079b8a', '#99d4b0', '#f1b044', '#cbd5df']
  const gradient = buckets.slice(0, 4).reduce<{ cursor: number; stops: string[] }>((state, bucket, index) => {
    const start = state.cursor
    const end = start + (bucket.count / total) * 100
    return { cursor: end, stops: [...state.stops, `${colors[index]} ${start}% ${end}%`] }
  }, { cursor: 0, stops: [] }).stops.join(', ')
  return <div className="donut-ref"><div style={{ background: `conic-gradient(${gradient})` }}><b>{total}</b><span>错题总数</span></div><ul>{buckets.slice(0, 4).map((bucket, index) => <li key={bucket.mistakeType}><i style={{ background: colors[index] }} />{labels[bucket.mistakeType] || '待复盘'} {Math.round((bucket.count / total) * 100)}%（{bucket.count}题）</li>)}</ul></div>
}

function MasteryTable() {
  return <table className="mastery-table"><tbody>{[['积分换元','85%','88%','↑ 10%'],['特征值概念','78%','82%','↑ 6%'],['概率密度','62%','66%','↑ 5%'],['极限连续','55%','61%','↑ 3%']].map((row) => <tr key={row[0]}>{row.map((cell) => <td key={cell}>{cell}</td>)}</tr>)}</tbody></table>
}

export default App
