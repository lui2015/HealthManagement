import express from 'express'
import fs from 'fs'
import os from 'os'
import path from 'path'
import crypto from 'crypto'
import { fileURLToPath } from 'url'
import { createServer as createViteServer } from 'vite'
import { ageBand, daysBetween, inMakeupWindow } from './shared/dates.js'
import { answerFollowUp, attachExtras, buildMetricAnalysis, buildReportAnalysis, collectAllowedNumbers, proseHasOnlyKnownNumbers, violatesSafety } from './shared/analysis.js'
import { HABIT_TEMPLATES, isRequired, validateHabitInput } from './shared/habits.js'
import { articles as seedArticles, categories, topics } from './shared/knowledge.js'
import { crisisMessages, evaluateRecord, metricName, prepareValues, PRESET_METRICS, validateRecord } from './shared/metrics.js'
import { mapItems, parseReportText } from './shared/reportParse.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dataDir = path.join(__dirname, 'data')
const dbFile = path.join(dataDir, 'db.json')
const fileDir = path.join(dataDir, 'files')
const PORT = Number(process.env.PORT || 5173)
const ANALYSIS_LIMIT = 20

fs.mkdirSync(fileDir, { recursive: true })

const emptyDb = () => ({
  users: {},
  phoneIndex: {},
  sessions: {},
  pendingVerify: {},
  unpublishedArticleIds: [],
  articleEdits: {},
  extraArticles: [],
})

function load() {
  if (!fs.existsSync(dbFile)) return emptyDb()
  const db = JSON.parse(fs.readFileSync(dbFile, 'utf8'))
  return { ...emptyDb(), ...db }
}

function save(db) {
  const tmp = `${dbFile}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(db))
  fs.renameSync(tmp, dbFile)
}

let queue = Promise.resolve()
function withDb(fn) {
  const run = queue.then(async () => {
    const db = load()
    try {
      const result = await fn(db)
      save(db)
      return result
    } catch (error) {
      if (error.save) save(db)
      throw error
    }
  })
  queue = run.then(() => undefined, () => undefined)
  return run
}

function httpError(status, message) {
  const error = new Error(message)
  error.status = status
  return error
}

function uid(prefix) {
  return `${prefix}_${crypto.randomBytes(8).toString('hex')}`
}

function cookies(req) {
  return Object.fromEntries(String(req.headers.cookie || '').split(';').filter(Boolean).map((part) => {
    const index = part.indexOf('=')
    return [part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1))]
  }))
}

function clientDate(req) {
  const value = req.get('x-client-date') || ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 32).toString('hex')
}

function hashCode(phone, code) {
  return crypto.createHash('sha256').update(`${phone}:${code}`).digest('hex')
}

function validPhone(phone) {
  return /^1\d{10}$/.test(phone)
}

function validPassword(password) {
  return typeof password === 'string' && password.length >= 8 && /[A-Za-z]/.test(password) && /\d/.test(password)
}

function audit(user, summary) {
  user.audit = [{ id: uid('a'), at: new Date().toISOString(), summary }, ...(user.audit || [])].slice(0, 200)
}

function purgeTrash(user) {
  const cutoff = Date.now() - 30 * 86400000
  user.records = (user.records || []).filter((record) => !record.deletedAt || Date.parse(record.deletedAt) > cutoff)
}

function removeUser(db, user) {
  fs.rmSync(path.join(fileDir, user.id), { recursive: true, force: true })
  delete db.phoneIndex[user.phone]
  delete db.users[user.id]
  for (const [token, session] of Object.entries(db.sessions)) {
    if (session.userId === user.id) delete db.sessions[token]
  }
}

function sweep(db, user) {
  if (user.pendingDeletion && Date.parse(user.pendingDeletion) <= Date.now()) {
    removeUser(db, user)
    return null
  }
  purgeTrash(user)
  return user
}

function analysisToday(user, today) {
  return (user.analysisLog || []).filter((item) => item.localDate === today).length
}

function toPublic(user, today) {
  return {
    id: user.id,
    phone: user.phone,
    pendingDeletion: user.pendingDeletion,
    profile: user.profile,
    aiConsent: user.aiConsent,
    hiddenMetrics: user.hiddenMetrics || [],
    goals: user.goals || {},
    customMetrics: user.customMetrics || [],
    reminders: user.reminders || [],
    records: user.records || [],
    reports: (user.reports || []).map(({ ...report }) => report),
    analyses: user.analyses || [],
    habits: user.habits || [],
    checkins: user.checkins || [],
    favorites: user.favorites || [],
    recentReads: user.recentReads || [],
    progress: user.progress || {},
    activeTopics: user.activeTopics || [],
    preferredCategories: user.preferredCategories || [],
    tip: user.tip || null,
    audit: user.audit || [],
    analysisToday: analysisToday(user, today),
    analysisLimit: ANALYSIS_LIMIT,
  }
}

function catalog(db, includeUnpublished = false) {
  const hidden = new Set(db.unpublishedArticleIds || [])
  const edits = db.articleEdits || {}
  const articles = [
    ...seedArticles.map((item) => ({ ...item, ...(edits[item.id] || {}), published: !hidden.has(item.id) })),
    ...(db.extraArticles || []).map((item) => ({ ...item, published: !hidden.has(item.id) })),
  ]
  return { categories, topics, articles: includeUnpublished ? articles : articles.filter((item) => item.published) }
}

function findArticle(db, id) {
  return catalog(db, true).articles.find((item) => item.id === id)
}

function llmMeta() {
  const configured = Boolean(process.env.LLM_API_KEY)
  return {
    llmConfigured: configured,
    providerName: configured ? (process.env.LLM_PROVIDER_NAME || '已配置的大模型服务') : '本机健康分析',
  }
}

function setSession(res, token) {
  res.setHeader('Set-Cookie', `hm_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000`)
}

function clearSession(res) {
  res.setHeader('Set-Cookie', 'hm_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0')
}

function blankUser(phone, password) {
  const salt = crypto.randomBytes(16).toString('hex')
  return {
    id: uid('u'),
    phone,
    passwordHash: hashPassword(password, salt),
    salt,
    failedLogins: 0,
    lockUntil: 0,
    pendingDeletion: null,
    profile: { nickname: `用户${phone.slice(-4)}`, birthDate: '', gender: '', heightCm: '', onboardingDone: false },
    aiConsent: false,
    hiddenMetrics: [],
    goals: {},
    customMetrics: [],
    reminders: [],
    records: [],
    reports: [],
    analyses: [],
    analysisLog: [],
    habits: [],
    checkins: [],
    favorites: [],
    recentReads: [],
    progress: {},
    activeTopics: [],
    preferredCategories: [],
    tip: null,
    tipHistory: [],
    audit: [],
  }
}

function assertLoginAllowed(user) {
  if (user.lockUntil && user.lockUntil > Date.now()) {
    const minutes = Math.max(1, Math.ceil((user.lockUntil - Date.now()) / 60000))
    throw httpError(429, `已暂时锁定，大约 ${minutes} 分钟后可以再试。不会永久锁定。`)
  }
}

function markFailure(user) {
  user.failedLogins += 1
  if (user.failedLogins >= 8) {
    user.lockUntil = Date.now() + 10 * 60 * 1000
    user.failedLogins = 0
    const error = httpError(429, '连续失败次数较多，已暂时锁定 10 分钟。不会永久锁定。')
    error.save = true
    throw error
  }
  const error = httpError(400, '手机号、验证码或密码不正确')
  error.save = true
  throw error
}

function consumeCode(db, phone, code) {
  const slot = db.pendingVerify[phone]
  if (!slot || !slot.codeHash || slot.expireAt < Date.now() || slot.codeHash !== hashCode(phone, String(code || ''))) {
    return false
  }
  delete slot.codeHash
  return true
}

function publishedArticles(db) {
  return catalog(db).articles
}

function pickTip(user, db, today, avoidId) {
  const recent = new Set((user.tipHistory || []).filter((item) => daysBetween(item.date, today) < 7).map((item) => item.articleId))
  if (avoidId) recent.add(avoidId)
  const articles = publishedArticles(db)
  const done = new Set(Object.entries(user.progress || {}).filter(([, value]) => value.status === 'done').map(([id]) => id))
  const ordered = []
  for (const active of user.activeTopics || []) {
    const topic = topics.find((item) => item.id === active.id)
    if (topic) ordered.push(...topic.articleIds.filter((id) => !done.has(id)))
  }
  for (const categoryId of user.preferredCategories || []) {
    ordered.push(...articles.filter((item) => item.categoryId === categoryId && !done.has(item.id)).map((item) => item.id))
  }
  for (const topic of topics) ordered.push(...topic.articleIds)
  ordered.push(...articles.map((item) => item.id))
  for (const id of ordered) {
    if (recent.has(id)) continue
    if (articles.some((item) => item.id === id)) return id
  }
  return articles.find((item) => item.id !== avoidId)?.id || articles[0]?.id || null
}

function ensureTip(user, db, today) {
  if (!user.tip || user.tip.date !== today) {
    const articleId = pickTip(user, db, today)
    user.tip = { date: today, articleId, swaps: 0 }
    if (articleId) user.tipHistory = [...(user.tipHistory || []), { articleId, date: today }].slice(-40)
  }
  return user.tip
}

function useAnalysisQuota(user, today) {
  if (analysisToday(user, today) >= ANALYSIS_LIMIT) throw httpError(429, '今天的分析次数已用完，明天会恢复。已生成的内容仍可以查看。')
  user.analysisLog = [...(user.analysisLog || []), { localDate: today, at: new Date().toISOString() }].slice(-120)
}

async function polish(sections, facts) {
  if (!process.env.LLM_API_KEY) return { sections, model: 'local' }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 28000)
  try {
    const response = await fetch(process.env.LLM_BASE_URL || 'https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      signal: controller.signal,
      headers: { Authorization: `Bearer ${process.env.LLM_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.LLM_MODEL || 'gpt-4o-mini',
        temperature: 0.2,
        messages: [
          { role: 'system', content: '你是个人健康记录说明助手。只根据 JSON 里的数字和事实改写前几个说明段落。不要编造检查结果，不要下诊断，不要写“你患有”，不要推荐药品、剂量，不要建议停药或换药，不要把习惯说成原因。输出 JSON：{"sections":[{"heading":"","body":""}]}。heading 必须与输入 headings 完全一致。最后一段“建议当面咨询医生的情况”会由系统覆盖，你可以原样复制输入中的对应正文。' },
          { role: 'user', content: JSON.stringify({ headings: sections.map((item) => item.heading), facts, draft: sections }) },
        ],
      }),
    })
    if (!response.ok) throw new Error('model')
    const payload = await response.json()
    const content = payload.choices?.[0]?.message?.content || ''
    const json = JSON.parse(content.slice(content.indexOf('{'), content.lastIndexOf('}') + 1))
    const next = sections.map((item, index) => ({ heading: item.heading, body: json.sections?.[index]?.body || item.body }))
    const allowed = collectAllowedNumbers(facts)
    const joined = next.map((item) => item.body).join('\n')
    if (violatesSafety(joined) || !proseHasOnlyKnownNumbers(joined, allowed)) return { sections, model: 'local' }
    next[next.length - 1] = sections[sections.length - 1]
    return { sections: next, model: 'llm' }
  } catch {
    return { sections, model: 'local' }
  } finally {
    clearTimeout(timer)
  }
}

function handle(fn) {
  return (req, res) => {
    Promise.resolve()
      .then(() => fn(req, res))
      .then((payload) => {
        if (!res.headersSent && payload !== undefined) res.json(payload)
      })
      .catch((error) => {
        if (res.headersSent) return
        const status = error.status || 500
        if (status >= 500) console.error(error)
        res.status(status).json({ message: status >= 500 ? '服务暂时不可用，请稍后再试' : error.message })
      })
  }
}

function authed(fn, allowPending = false) {
  return handle((req, res) => withDb(async (db) => {
    const token = cookies(req).hm_session
    const session = token && db.sessions[token]
    const user = session && db.users[session.userId]
    if (!user) throw httpError(401, '请先登录')
    const alive = sweep(db, user)
    if (!alive) {
      const error = httpError(401, '账户已删除')
      error.save = true
      throw error
    }
    if (alive.pendingDeletion && !allowPending) throw httpError(403, '账户将在 7 天内删除。你可以先撤销删除。')
    return fn(db, alive, req, res)
  }))
}

function localAdmin(req) {
  const ip = req.socket.remoteAddress || ''
  return ip.endsWith('127.0.0.1') || ip === '::1'
}

function assertAdmin(req) {
  const password = process.env.ADMIN_PASSWORD
  if (password) {
    if (req.get('x-admin-password') !== password) throw httpError(401, '管理密码不正确')
    return
  }
  if (!localAdmin(req)) throw httpError(403, '仅本机可以管理学习内容')
}

function metricDef(user, id) {
  return PRESET_METRICS.find((item) => item.id === id) || (user.customMetrics || []).find((item) => item.id === id)
}

function saveRecord(user, input, today) {
  const metric = metricDef(user, input.metricId)
  if (!metric || metric.derived) throw httpError(400, '这个指标不能直接记录')
  const values = prepareValues(metric, input.values || {}, user.profile)
  const errors = validateRecord(metric, values, input.measuredAt)
  if (errors.length) throw httpError(400, errors[0])
  if (input.clientId) {
    const existing = user.records.find((record) => record.clientId === input.clientId && !record.deletedAt)
    if (existing) return existing
  }
  const localDate = input.localDate || today
  if (metric.id === 'steps') {
    const sameDay = user.records.find((record) => record.metricId === 'steps' && record.localDate === localDate && !record.deletedAt)
    if (sameDay) {
      sameDay.values = values
      sameDay.measuredAt = input.measuredAt
      sameDay.note = String(input.note || '').slice(0, 200)
      sameDay.updatedAt = new Date().toISOString()
      audit(user, '更新当日步数')
      return sameDay
    }
  }
  const record = {
    id: uid('m'),
    clientId: input.clientId || '',
    metricId: metric.id,
    measuredAt: input.measuredAt,
    localDate,
    values,
    note: String(input.note || '').slice(0, 200),
    source: input.source === 'report' ? 'report' : 'manual',
    sourceReportId: input.sourceReportId || '',
    sourceKey: input.sourceKey || '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deletedAt: null,
  }
  user.records.push(record)
  audit(user, `新增${metricName(metric.id, user.customMetrics)}记录`)
  return record
}

const app = express()
app.disable('x-powered-by')
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Referrer-Policy', 'no-referrer')
  res.setHeader('Cache-Control', 'no-store')
  next()
})
app.use(express.json({ limit: '32mb' }))
app.use((error, _req, res, next) => {
  if (!error) return next()
  res.status(error.type === 'entity.too.large' ? 413 : 400).json({ message: error.type === 'entity.too.large' ? '文件超过 20MB' : '请求格式不正确' })
})

app.get('/api/meta', handle(async () => llmMeta()))

app.post('/api/auth/code', handle((req) => withDb(async (db) => {
  const phone = String(req.body.phone || '')
  if (!validPhone(phone)) throw httpError(400, '请输入 11 位手机号')
  const today = clientDate(req)
  const now = Date.now()
  let slot = db.pendingVerify[phone]
  if (!slot || slot.day !== today) slot = { count: 0, day: today, sentAt: 0 }
  if (slot.sentAt && now - slot.sentAt < 60000) throw httpError(429, '验证码已发送，请 60 秒后再获取')
  if (slot.count >= 10) throw httpError(429, '今日验证码次数已用完，明天可以再获取')
  const code = String(Math.floor(100000 + Math.random() * 900000))
  slot.count += 1
  slot.sentAt = now
  slot.expireAt = now + 5 * 60 * 1000
  slot.codeHash = hashCode(phone, code)
  slot.day = today
  db.pendingVerify[phone] = slot
  return { sent: true, devCode: code, message: '当前是个人本机版，验证码显示在页面上，不会发送真实短信。' }
})))

app.post('/api/auth/register', handle((req, res) => withDb(async (db) => {
  const phone = String(req.body.phone || '')
  if (!validPhone(phone)) throw httpError(400, '请输入 11 位手机号')
  if (!validPassword(req.body.password)) throw httpError(400, '密码至少 8 位，并同时包含字母和数字')
  if (db.phoneIndex[phone]) throw httpError(400, '这个手机号已注册，请直接登录')
  if (!consumeCode(db, phone, req.body.code)) throw httpError(400, '验证码不正确或已过期')
  const user = blankUser(phone, req.body.password)
  db.users[user.id] = user
  db.phoneIndex[phone] = user.id
  const token = crypto.randomBytes(24).toString('hex')
  db.sessions[token] = { userId: user.id, createdAt: new Date().toISOString() }
  setSession(res, token)
  audit(user, '注册账户')
  ensureTip(user, db, clientDate(req))
  return { user: toPublic(user, clientDate(req)), meta: llmMeta() }
})))

app.post('/api/auth/login', handle((req, res) => withDb(async (db) => {
  const phone = String(req.body.phone || '')
  const user = db.users[db.phoneIndex[phone] || '']
  if (!user) throw httpError(400, '手机号、验证码或密码不正确')
  assertLoginAllowed(user)
  const codeOk = req.body.code ? consumeCode(db, phone, req.body.code) : false
  const passwordOk = req.body.password ? hashPassword(req.body.password, user.salt) === user.passwordHash : false
  if (!codeOk && !passwordOk) markFailure(user)
  user.failedLogins = 0
  user.lockUntil = 0
  const token = crypto.randomBytes(24).toString('hex')
  db.sessions[token] = { userId: user.id, createdAt: new Date().toISOString() }
  setSession(res, token)
  audit(user, '登录')
  ensureTip(user, db, clientDate(req))
  return { user: toPublic(user, clientDate(req)), meta: llmMeta() }
})))

app.post('/api/auth/logout', authed(async (db, user, req, res) => {
  const token = cookies(req).hm_session
  delete db.sessions[token]
  clearSession(res)
  audit(user, '退出登录')
  return { ok: true }
}, true))

app.get('/api/me', authed(async (db, user, req) => {
  ensureTip(user, db, clientDate(req))
  return { user: toPublic(user, clientDate(req)), meta: llmMeta() }
}, true))

app.get('/api/content', handle(async (req) => {
  const db = load()
  return catalog(db)
}))

app.patch('/api/profile', authed(async (db, user, req) => {
  const profile = user.profile
  const body = req.body || {}
  if (body.nickname != null) profile.nickname = String(body.nickname).trim().slice(0, 20) || profile.nickname
  if (body.birthDate != null) profile.birthDate = /^\d{4}-\d{2}-\d{2}$/.test(body.birthDate) ? body.birthDate : ''
  if (body.gender != null) profile.gender = ['female', 'male', 'undisclosed', ''].includes(body.gender) ? body.gender : ''
  if (body.heightCm != null && body.heightCm !== '') {
    const height = Number(body.heightCm)
    if (height < 50 || height > 250) throw httpError(400, '请核对身高')
    profile.heightCm = height
  }
  if (body.onboardingDone != null) profile.onboardingDone = Boolean(body.onboardingDone)
  audit(user, '更新健康档案')
  return { user: toPublic(user, clientDate(req)) }
}))

app.post('/api/account/delete', authed(async (db, user, req) => {
  if (req.body.phone !== user.phone) throw httpError(400, '请输入当前账户的手机号以确认删除')
  user.pendingDeletion = new Date(Date.now() + 7 * 86400000).toISOString()
  audit(user, '申请删除账户')
  return { user: toPublic(user, clientDate(req)) }
}))

app.post('/api/account/cancel-delete', authed(async (db, user, req) => {
  user.pendingDeletion = null
  audit(user, '撤销删除账户')
  return { user: toPublic(user, clientDate(req)) }
}, true))

app.post('/api/records', authed(async (db, user, req) => {
  const record = saveRecord(user, req.body || {}, clientDate(req))
  const messages = crisisMessages([record])
  return { user: toPublic(user, clientDate(req)), record, status: evaluateRecord(record.metricId, record.values, user.profile, user.goals), critical: messages }
}))

app.patch('/api/records/:id', authed(async (db, user, req) => {
  const record = user.records.find((item) => item.id === req.params.id && !item.deletedAt)
  if (!record || record.source === 'report') throw httpError(404, '找不到可编辑的记录')
  const metric = metricDef(user, record.metricId)
  const values = prepareValues(metric, req.body.values || record.values, record.metricId === 'weight' ? { heightCm: record.values.heightCm } : user.profile)
  if (record.metricId === 'weight') values.heightCm = record.values.heightCm
  const measuredAt = req.body.measuredAt || record.measuredAt
  const errors = validateRecord(metric, values, measuredAt)
  if (errors.length) throw httpError(400, errors[0])
  record.values = values
  record.measuredAt = measuredAt
  record.localDate = req.body.localDate || record.localDate
  record.note = String(req.body.note ?? record.note ?? '').slice(0, 200)
  record.updatedAt = new Date().toISOString()
  audit(user, `修改${metricName(record.metricId, user.customMetrics)}记录`)
  return { user: toPublic(user, clientDate(req)), record, critical: crisisMessages([record]) }
}))

app.delete('/api/records/:id', authed(async (db, user, req) => {
  const record = user.records.find((item) => item.id === req.params.id && !item.deletedAt)
  if (!record) throw httpError(404, '找不到记录')
  record.deletedAt = new Date().toISOString()
  audit(user, '删除一条指标记录')
  return { user: toPublic(user, clientDate(req)) }
}))

app.post('/api/records/:id/restore', authed(async (db, user, req) => {
  const record = user.records.find((item) => item.id === req.params.id)
  if (!record?.deletedAt) throw httpError(404, '找不到回收站中的记录')
  record.deletedAt = null
  audit(user, '恢复一条指标记录')
  return { user: toPublic(user, clientDate(req)) }
}))

app.post('/api/custom-metrics', authed(async (db, user, req) => {
  const name = String(req.body.name || '').trim()
  if (!name || name.length > 20) throw httpError(400, '指标名称请控制在 20 字以内')
  const metric = {
    id: uid('c'),
    name,
    kind: req.body.kind === 'text' ? 'text' : 'number',
    unit: String(req.body.unit || '').slice(0, 12),
    min: req.body.min == null || req.body.min === '' ? null : Number(req.body.min),
    max: req.body.max == null || req.body.max === '' ? null : Number(req.body.max),
    active: true,
  }
  user.customMetrics.push(metric)
  audit(user, `新增自定义指标 ${name}`)
  return { user: toPublic(user, clientDate(req)), metric }
}))

app.patch('/api/metric-prefs', authed(async (db, user, req) => {
  if (Array.isArray(req.body.hiddenMetrics)) user.hiddenMetrics = req.body.hiddenMetrics
  if (req.body.goal) {
    const { metricId, low, high, target } = req.body.goal
    user.goals[metricId] = {
      low: low === '' || low == null ? null : Number(low),
      high: high === '' || high == null ? null : Number(high),
      target: target === '' || target == null ? null : Number(target),
    }
  }
  if (req.body.reminder) {
    const reminder = req.body.reminder
    user.reminders = (user.reminders || []).filter((item) => item.metricId !== reminder.metricId)
    if (reminder.enabled) user.reminders.push({ metricId: reminder.metricId, weekdays: reminder.weekdays || [], time: reminder.time || '08:00' })
  }
  return { user: toPublic(user, clientDate(req)) }
}))

function sniff(buf) {
  if (buf.slice(0, 5).toString() === '%PDF-') return 'pdf'
  if (buf[0] === 0xff && buf[1] === 0xd8) return 'jpeg'
  if (buf.slice(0, 8).toString('hex') === '89504e470d0a1a0a') return 'png'
  if (buf.length > 12 && buf.slice(4, 8).toString() === 'ftyp') return 'heic'
  return ''
}

app.post('/api/reports', authed(async (db, user, req) => {
  const body = req.body || {}
  const raw = String(body.data || '').replace(/^data:[^,]*,/, '')
  const buf = Buffer.from(raw, 'base64')
  if (!buf.length) throw httpError(400, '文件是空的，或这是无法读取的加密 PDF')
  if (buf.length > 20 * 1024 * 1024) throw httpError(413, '单个文件不能超过 20MB')
  const kind = sniff(buf)
  if (!kind) throw httpError(400, '请上传 PDF、JPG、PNG 或 HEIC')
  if (kind === 'pdf' && buf.includes(Buffer.from('/Encrypt'))) throw httpError(400, '无法读取加密的 PDF，请上传未加密文件或改为图片')
  const report = {
    id: uid('r'),
    title: String(body.title || body.fileName || '体检报告').slice(0, 80),
    examDate: /^\d{4}-\d{2}-\d{2}$/.test(body.examDate || '') ? body.examDate : '',
    org: String(body.org || '').slice(0, 40),
    type: ['annual', 'lab', 'imaging', 'other'].includes(body.type) ? body.type : 'other',
    note: String(body.note || '').slice(0, 200),
    status: 'parse_failed',
    fileName: String(body.fileName || 'report').slice(0, 120),
    mime: kind === 'pdf' ? 'application/pdf' : kind === 'png' ? 'image/png' : kind === 'jpeg' ? 'image/jpeg' : 'image/heic',
    size: buf.length,
    items: [],
    createdAt: new Date().toISOString(),
  }
  const dir = path.join(fileDir, user.id)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, report.id), buf)
  user.reports.unshift(report)
  audit(user, '上传体检报告')
  return { user: toPublic(user, clientDate(req)), report }
}))

app.get('/api/reports/:id/file', authed(async (db, user, req, res) => {
  const report = user.reports.find((item) => item.id === req.params.id)
  if (!report || !/^r_[a-f0-9]+$/.test(report.id)) throw httpError(404, '找不到报告')
  const full = path.resolve(fileDir, user.id, report.id)
  if (!full.startsWith(path.resolve(fileDir, user.id))) throw httpError(400, '找不到报告')
  res.setHeader('Content-Type', report.mime)
  res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(report.fileName)}`)
  fs.createReadStream(full).pipe(res)
  return undefined
}))

function reportOf(user, id) {
  const report = user.reports.find((item) => item.id === id)
  if (!report) throw httpError(404, '找不到报告')
  return report
}

app.patch('/api/reports/:id', authed(async (db, user, req) => {
  const report = reportOf(user, req.params.id)
  const body = req.body || {}
  if (body.title != null) report.title = String(body.title).slice(0, 80)
  if (body.examDate != null) report.examDate = /^\d{4}-\d{2}-\d{2}$/.test(body.examDate) ? body.examDate : ''
  if (body.org != null) report.org = String(body.org).slice(0, 40)
  if (body.type != null && ['annual', 'lab', 'imaging', 'other'].includes(body.type)) report.type = body.type
  if (body.note != null) report.note = String(body.note).slice(0, 200)
  return { user: toPublic(user, clientDate(req)), report }
}))

app.post('/api/reports/:id/items', authed(async (db, user, req) => {
  const report = reportOf(user, req.params.id)
  const item = {
    id: uid('i'),
    name: String(req.body.name || '').trim().slice(0, 40),
    result: String(req.body.result || '').trim().slice(0, 40),
    unit: String(req.body.unit || '').trim().slice(0, 20),
    refRange: String(req.body.refRange || '').trim().slice(0, 40),
    flag: String(req.body.flag || '').trim().slice(0, 20),
  }
  if (!item.name) throw httpError(400, '请填写项目名称')
  report.items.push(item)
  if (report.status === 'parse_failed') report.status = 'pending_review'
  return { user: toPublic(user, clientDate(req)), report }
}))

app.patch('/api/reports/:id/items/:itemId', authed(async (db, user, req) => {
  const report = reportOf(user, req.params.id)
  const item = report.items.find((row) => row.id === req.params.itemId)
  if (!item) throw httpError(404, '找不到项目')
  for (const key of ['name', 'result', 'unit', 'refRange', 'flag']) {
    if (req.body[key] != null) item[key] = String(req.body[key]).slice(0, 40)
  }
  return { user: toPublic(user, clientDate(req)), report }
}))

app.delete('/api/reports/:id/items/:itemId', authed(async (db, user, req) => {
  const report = reportOf(user, req.params.id)
  report.items = report.items.filter((item) => item.id !== req.params.itemId)
  return { user: toPublic(user, clientDate(req)), report }
}))

app.post('/api/reports/:id/parse-text', authed(async (db, user, req) => {
  const report = reportOf(user, req.params.id)
  const parsed = parseReportText(req.body.text || '').map((item) => ({ ...item, id: uid('i') }))
  if (!parsed.length) throw httpError(400, '没有识别到“项目 数字 单位”这样的行，请改为手动添加')
  report.items.push(...parsed)
  report.status = 'pending_review'
  audit(user, '识别报告文本')
  return { user: toPublic(user, clientDate(req)), report, added: parsed.length }
}))

app.post('/api/reports/:id/confirm', authed(async (db, user, req) => {
  const report = reportOf(user, req.params.id)
  report.status = 'confirmed'
  audit(user, '确认体检报告')
  return { user: toPublic(user, clientDate(req)), report }
}))

app.post('/api/reports/:id/reopen', authed(async (db, user, req) => {
  const report = reportOf(user, req.params.id)
  report.status = report.items.length ? 'pending_review' : 'parse_failed'
  return { user: toPublic(user, clientDate(req)), report }
}))

app.post('/api/reports/:id/write', authed(async (db, user, req) => {
  const report = reportOf(user, req.params.id)
  if (report.status !== 'confirmed') throw httpError(400, '请先确认提取结果，再写入指标')
  if (!report.examDate) throw httpError(400, '请先填写体检日期，再写入指标')
  const chosen = new Set(req.body.itemIds || [])
  const items = report.items.filter((item) => chosen.has(item.id))
  const { mapped, bp } = mapItems(items)
  const measuredAt = new Date(`${report.examDate}T08:00:00`).toISOString()
  const written = []
  for (const entry of mapped) {
    const sourceKey = `${report.id}:${entry.item.id}`
    user.records = user.records.filter((record) => record.sourceKey !== sourceKey)
    written.push(saveRecord(user, {
      metricId: entry.metricId,
      values: entry.values,
      measuredAt,
      localDate: report.examDate,
      source: 'report',
      sourceReportId: report.id,
      sourceKey,
      note: `来自体检报告 ${report.title}`,
    }, clientDate(req)))
  }
  if (bp.sbp || bp.dbp) {
    if (!bp.sbp || !bp.dbp) throw httpError(400, '写入血压时，请同时选择收缩压和舒张压')
    const sourceKey = `${report.id}:bp:${bp.sbp.item.id}:${bp.dbp.item.id}`
    user.records = user.records.filter((record) => record.sourceKey !== sourceKey)
    written.push(saveRecord(user, {
      metricId: 'bp',
      values: { sbp: bp.sbp.n, dbp: bp.dbp.n },
      measuredAt,
      localDate: report.examDate,
      source: 'report',
      sourceReportId: report.id,
      sourceKey,
      note: `来自体检报告 ${report.title}`,
    }, clientDate(req)))
  }
  if (!written.length) throw httpError(400, '所选项目还不能对应到现有指标，已保留在报告明细中')
  audit(user, '把体检项目写入指标')
  return { user: toPublic(user, clientDate(req)), written: written.length }
}))

app.delete('/api/reports/:id', authed(async (db, user, req) => {
  const report = reportOf(user, req.params.id)
  if (req.query.deleteRecords === '1') {
    for (const record of user.records) {
      if (record.sourceReportId === report.id) record.deletedAt = new Date().toISOString()
    }
  } else {
    for (const record of user.records) {
      if (record.sourceReportId === report.id) record.sourceMissing = true
    }
  }
  fs.rmSync(path.join(fileDir, user.id, report.id), { force: true })
  user.reports = user.reports.filter((item) => item.id !== report.id)
  audit(user, '删除体检报告')
  return { user: toPublic(user, clientDate(req)) }
}))

app.post('/api/ai/consent', authed(async (db, user, req) => {
  user.aiConsent = Boolean(req.body.enabled)
  audit(user, user.aiConsent ? '开启健康分析' : '关闭健康分析')
  return { user: toPublic(user, clientDate(req)) }
}))

app.post('/api/analyze', authed(async (db, user, req) => {
  if (!user.aiConsent) throw httpError(403, '请先阅读并同意分析授权')
  const today = clientDate(req)
  useAnalysisQuota(user, today)
  const body = req.body || {}
  let built
  if (body.kind === 'report') {
    const report = reportOf(user, body.reportId)
    if (report.status !== 'confirmed' && !body.includeUnconfirmed) throw httpError(400, '默认只分析已核对的报告。若要包含未核对提取，请明确勾选。')
    built = buildReportAnalysis(user, report, { today, includeUnconfirmed: Boolean(body.includeUnconfirmed) })
  } else {
    const start = body.start || addDaysSafe(today, -29)
    const end = body.end || today
    if (!Array.isArray(body.metricIds) || !body.metricIds.length) throw httpError(400, '请选择至少一个指标')
    built = buildMetricAnalysis(user, { metricIds: body.metricIds, start, end })
    if (body.includeHabits) {
      built.snapshot = attachExtras(user, { snapshot: built.snapshot }, 'habit', today)
      const names = built.snapshot.extraHabits || []
      built.sections[1].body += `\n同期进行中的习惯：${names.join('、') || '无'}。这里只说明这些习惯和记录发生在同一时期，不表示它们导致了指标变化。`
    }
  }
  const polished = await polish(built.sections, built.snapshot)
  const session = {
    id: uid('s'),
    ...built,
    sections: polished.sections,
    model: polished.model,
    localDate: today,
    createdAt: new Date().toISOString(),
    messages: [],
    versions: [],
  }
  user.analyses.unshift(session)
  audit(user, '生成一次健康分析')
  return { user: toPublic(user, today), analysis: publicSession(session) }
}))

function addDaysSafe(today, delta) {
  const [y, m, d] = today.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + delta)
  return dt.toISOString().slice(0, 10)
}

function publicSession(session) {
  return session
}

app.post('/api/analyses/:id/messages', authed(async (db, user, req) => {
  const session = user.analyses.find((item) => item.id === req.params.id)
  if (!session) throw httpError(404, '找不到这次分析')
  const today = clientDate(req)
  let result = answerFollowUp(session, req.body.question || '')
  if (result.needMore && req.body.confirmExtra === result.needMore) {
    session.snapshot = attachExtras(user, session, result.needMore, today)
    result = answerFollowUp(session, req.body.question || '')
  }
  if (result.needMore) return { user: toPublic(user, today), needMore: result.needMore, analysis: session, prompt: result.text }
  useAnalysisQuota(user, today)
  session.messages.push({ role: 'user', content: String(req.body.question || '').slice(0, 500), at: new Date().toISOString() })
  session.messages.push({ role: 'assistant', content: result.text, at: new Date().toISOString(), critical: result.critical || [] })
  return { user: toPublic(user, today), analysis: session }
}))

app.post('/api/analyses/:id/regenerate', authed(async (db, user, req) => {
  const session = user.analyses.find((item) => item.id === req.params.id)
  if (!session) throw httpError(404, '找不到这次分析')
  const today = clientDate(req)
  useAnalysisQuota(user, today)
  session.versions.push({ sections: session.sections, model: session.model, at: session.createdAt })
  const rebuilt = session.kind === 'report'
    ? buildReportAnalysis(user, reportOf(user, session.snapshot.reportId), { today, includeUnconfirmed: false })
    : buildMetricAnalysis(user, session.snapshot)
  const polished = await polish(rebuilt.sections, rebuilt.snapshot)
  session.sections = polished.sections
  session.evidence = rebuilt.evidence
  session.critical = rebuilt.critical
  session.model = polished.model
  session.snapshot = rebuilt.snapshot
  return { user: toPublic(user, today), analysis: session }
}))

app.delete('/api/analyses/:id', authed(async (db, user, req) => {
  user.analyses = user.analyses.filter((item) => item.id !== req.params.id)
  audit(user, '删除一次分析')
  return { user: toPublic(user, clientDate(req)) }
}))

app.post('/api/habits', authed(async (db, user, req) => {
  if ((user.habits || []).filter((habit) => !habit.archived).length >= 30) throw httpError(400, '进行中的习惯最多 30 个')
  const errors = validateHabitInput(req.body || {})
  if (errors.length) throw httpError(400, errors[0])
  const habit = {
    id: uid('h'),
    name: String(req.body.name).trim(),
    type: req.body.type,
    target: req.body.type === 'count' ? Number(req.body.target) : 1,
    repeat: req.body.repeat === 'weekdays' ? 'weekdays' : 'daily',
    weekdays: req.body.weekdays || [],
    reminders: req.body.reminders || [],
    note: String(req.body.note || '').slice(0, 80),
    action: req.body.action || '',
    createdLocalDate: clientDate(req),
    archived: false,
  }
  user.habits.push(habit)
  audit(user, `新增习惯 ${habit.name}`)
  return { user: toPublic(user, clientDate(req)), habit }
}))

app.patch('/api/habits/:id', authed(async (db, user, req) => {
  const habit = user.habits.find((item) => item.id === req.params.id)
  if (!habit) throw httpError(404, '找不到习惯')
  const next = { ...habit, ...req.body, id: habit.id }
  const errors = validateHabitInput(next)
  if (errors.length) throw httpError(400, errors[0])
  Object.assign(habit, {
    name: String(next.name).trim(),
    type: next.type,
    target: next.type === 'count' ? Number(next.target) : 1,
    repeat: next.repeat === 'weekdays' ? 'weekdays' : 'daily',
    weekdays: next.weekdays || [],
    reminders: next.reminders || [],
    note: String(next.note || '').slice(0, 80),
  })
  return { user: toPublic(user, clientDate(req)), habit }
}))

app.post('/api/habits/:id/archive', authed(async (db, user, req) => {
  const habit = user.habits.find((item) => item.id === req.params.id)
  if (!habit) throw httpError(404, '找不到习惯')
  habit.archived = !habit.archived
  habit.archivedLocalDate = habit.archived ? clientDate(req) : ''
  return { user: toPublic(user, clientDate(req)), habit }
}))

app.post('/api/checkins', authed(async (db, user, req) => {
  const today = clientDate(req)
  const habit = user.habits.find((item) => item.id === req.body.habitId)
  if (!habit) throw httpError(404, '找不到习惯')
  const date = req.body.localDate || today
  if (!inMakeupWindow(date, today)) throw httpError(400, '只能补近 2 天内的打卡')
  if (!isRequired(habit, date)) throw httpError(400, '这一天不需要打卡')
  const index = user.checkins.findIndex((item) => item.habitId === habit.id && item.localDate === date)
  const existing = index >= 0 ? user.checkins[index] : null
  if (habit.type === 'check' && req.body.op === 'toggle' && existing?.done) {
    user.checkins.splice(index, 1)
  } else if (habit.type === 'count' && req.body.op === 'set') {
    const count = Math.max(0, Math.min(99, Number(req.body.count) || 0))
    const row = { id: existing?.id || uid('k'), habitId: habit.id, localDate: date, count, done: false, makeup: date !== today, updatedAt: new Date().toISOString() }
    if (count === 0 && existing) user.checkins.splice(index, 1)
    else if (existing) user.checkins[index] = row
    else if (count > 0) user.checkins.push(row)
  } else {
    const count = habit.type === 'count' ? Math.min(99, Number(existing?.count || 0) + 1) : 1
    const row = { id: existing?.id || uid('k'), habitId: habit.id, localDate: date, count, done: habit.type === 'check', makeup: date !== today, updatedAt: new Date().toISOString() }
    if (existing) user.checkins[index] = row
    else user.checkins.push(row)
  }
  return { user: toPublic(user, today) }
}))

app.post('/api/learn/open', authed(async (db, user, req) => {
  const article = findArticle(db, req.body.articleId)
  if (!article || !article.published) return { user: toPublic(user, clientDate(req)), offline: true }
  if (user.progress[article.id]?.status !== 'done') user.progress[article.id] = { status: 'reading', at: new Date().toISOString() }
  user.recentReads = [{ id: article.id, at: new Date().toISOString() }, ...(user.recentReads || []).filter((item) => item.id !== article.id)].slice(0, 50)
  return { user: toPublic(user, clientDate(req)), article }
}))

app.post('/api/learn/complete', authed(async (db, user, req) => {
  const article = findArticle(db, req.body.articleId)
  if (!article?.published) throw httpError(404, '内容已下线')
  user.progress[article.id] = { status: 'done', at: new Date().toISOString() }
  return { user: toPublic(user, clientDate(req)) }
}))

app.post('/api/learn/favorite', authed(async (db, user, req) => {
  const id = req.body.articleId
  if (req.body.on) user.favorites = [id, ...(user.favorites || []).filter((item) => item !== id)]
  else user.favorites = (user.favorites || []).filter((item) => item !== id)
  return { user: toPublic(user, clientDate(req)) }
}))

app.post('/api/learn/topic', authed(async (db, user, req) => {
  const topic = topics.find((item) => item.id === req.body.topicId)
  if (!topic) throw httpError(404, '找不到专题')
  if (req.body.action === 'stop') user.activeTopics = (user.activeTopics || []).filter((item) => item.id !== topic.id)
  else if (!(user.activeTopics || []).some((item) => item.id === topic.id)) {
    if ((user.activeTopics || []).length >= 5) throw httpError(400, '同时进行的专题最多 5 个，请先移出一个')
    user.activeTopics.push({ id: topic.id, startedAt: new Date().toISOString() })
  }
  return { user: toPublic(user, clientDate(req)) }
}))

app.post('/api/learn/prefer', authed(async (db, user, req) => {
  const id = req.body.categoryId
  const has = (user.preferredCategories || []).includes(id)
  user.preferredCategories = has ? user.preferredCategories.filter((item) => item !== id) : [...(user.preferredCategories || []), id]
  return { user: toPublic(user, clientDate(req)) }
}))

app.post('/api/learn/tip', authed(async (db, user, req) => {
  const today = clientDate(req)
  const tip = ensureTip(user, db, today)
  if (req.body.action === 'swap') {
    if (tip.swaps >= 5) throw httpError(400, '今天已经换了 5 次，可以去分类里继续看')
    const next = pickTip(user, db, today, tip.articleId)
    tip.swaps += 1
    tip.articleId = next
    user.tipHistory.push({ articleId: next, date: today })
  }
  if (req.body.action === 'read' && tip.articleId) user.progress[tip.articleId] = { status: 'done', at: new Date().toISOString() }
  return { user: toPublic(user, today) }
}))

app.get('/api/export/:kind', authed(async (db, user, req, res) => {
  const kind = req.params.kind
  let body = ''
  let filename = 'export.csv'
  if (kind === 'records') {
    filename = '指标记录.csv'
    body = csv([['日期', '时间', '指标', '数值', '备注', '来源'], ...user.records.filter((item) => !item.deletedAt).map((item) => [item.localDate, item.measuredAt, metricName(item.metricId, user.customMetrics), JSON.stringify(item.values), item.note, item.source])])
  } else if (kind === 'habits') {
    filename = '习惯打卡.csv'
    body = csv([['习惯', '日期', '计数', '完成', '补卡'], ...user.checkins.map((item) => [user.habits.find((habit) => habit.id === item.habitId)?.name || '', item.localDate, item.count || '', item.done ? '是' : '', item.makeup ? '是' : ''])])
  } else if (kind === 'report-items') {
    filename = '报告项目.csv'
    const rows = [['报告', '日期', '项目', '结果', '单位', '参考范围']]
    for (const report of user.reports) for (const item of report.items) rows.push([report.title, report.examDate, item.name, item.result, item.unit, item.refRange])
    body = csv(rows)
  } else if (kind === 'analyses') {
    filename = '健康分析.md'
    body = user.analyses.map((item) => `# ${item.title}\n\n生成于 ${item.createdAt}，依据为生成当时的数据。\n\n${item.sections.map((section) => `## ${section.heading}\n${section.body}`).join('\n\n')}`).join('\n\n---\n\n')
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8')
  } else throw httpError(404, '没有这种导出')
  if (kind !== 'analyses') res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`)
  res.send(kind === 'analyses' ? body : `\uFEFF${body}`)
  return undefined
}))

function csv(rows) {
  return rows.map((row) => row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')
}

app.get('/api/admin/articles', handle(async (req) => {
  assertAdmin(req)
  return catalog(load(), true)
}))

app.post('/api/admin/articles', handle((req) => withDb(async (db) => {
  assertAdmin(req)
  const article = normalizeArticle(req.body || {}, uid('k'))
  db.extraArticles.push(article)
  return { article }
})))

app.put('/api/admin/articles/:id', handle((req) => withDb(async (db) => {
  assertAdmin(req)
  const article = normalizeArticle(req.body || {}, req.params.id)
  const extra = (db.extraArticles || []).find((item) => item.id === article.id)
  if (extra) Object.assign(extra, article)
  else db.articleEdits[article.id] = article
  return { article }
})))

app.post('/api/admin/articles/:id/publish', handle((req) => withDb(async (db) => {
  assertAdmin(req)
  const hidden = new Set(db.unpublishedArticleIds || [])
  if (req.body.published) hidden.delete(req.params.id)
  else hidden.add(req.params.id)
  db.unpublishedArticleIds = [...hidden]
  return { published: Boolean(req.body.published) }
})))

function normalizeArticle(body, id) {
  const sections = Array.isArray(body.sections) ? body.sections : String(body.body || '').split(/\n{2,}/).map((paragraph) => ({ heading: '', paragraphs: [paragraph] }))
  return {
    id,
    categoryId: body.categoryId || 'diet',
    title: String(body.title || '未命名').slice(0, 40),
    summary: String(body.summary || '').slice(0, 80),
    source: body.source || '内容管理员录入，供个人学习，不能替代诊疗',
    updatedAt: clientDate({ get: () => '' }),
    minutes: Number(body.minutes) || 4,
    sections,
  }
}

const isProd = process.env.NODE_ENV === 'production'
if (!isProd) {
  const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' })
  app.use(vite.middlewares)
} else {
  const dist = path.join(__dirname, 'dist')
  app.use(express.static(dist))
  app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')))
}

app.listen(PORT, '0.0.0.0', () => {
  const nets = Object.values(os.networkInterfaces()).flat().filter((item) => item && item.family === 'IPv4' && !item.internal)
  console.log(`个人健康管理已启动：http://localhost:${PORT}`)
  for (const net of nets) console.log(`同一局域网的手机可打开：http://${net.address}:${PORT}`)
  if (!process.env.LLM_API_KEY) console.log('未配置 LLM_API_KEY，分析使用本机计算结果，数据不会发给外部模型。')
})
