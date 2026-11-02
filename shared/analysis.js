import { addDays } from './dates.js'
import {
  CRISIS_COPY,
  CRISIS_PATTERN,
  crisisMessages,
  deriveBmiRecords,
  evaluateRecord,
  formatValue,
  lifeTip,
  metricName,
  numericOf,
  sceneLabel,
  trendThreshold,
} from './metrics.js'
import { bucketName, itemFlag } from './reportParse.js'

const DOCTOR_FALLBACK = '本次记录未触发产品内的紧急提示规则。规则不能覆盖所有危险情况，身体不适请联系医生。'

export function activeRecords(user) {
  return (user.records || []).filter((record) => !record.deletedAt)
}

function mean(nums) {
  const list = nums.filter((n) => n != null && !Number.isNaN(n))
  if (!list.length) return null
  return Math.round((list.reduce((sum, n) => sum + n, 0) / list.length) * 10) / 10
}

function displayOf(record) {
  const base = formatValue(record.metricId, record.values)
  if (record.metricId === 'glucose') return `${base}（${sceneLabel(record.values.scene)}）`
  if (record.metricId === 'bp' && record.values.hr) return `${base}，心率 ${record.values.hr}`
  return base
}

export function recordsForMetric(user, metricId, start, end) {
  const all = activeRecords(user).filter((record) => record.localDate >= start && record.localDate <= end)
  if (metricId === 'bmi') return deriveBmiRecords(all.filter((record) => record.metricId === 'weight'))
  return all.filter((record) => record.metricId === metricId)
}

export function observeMetric(records, metricId) {
  const sorted = [...records].sort((a, b) => a.measuredAt.localeCompare(b.measuredAt))
  const nums = sorted.map((record) => numericOf(record.metricId === 'bmi' ? 'bmi' : metricId, record.values)).filter((n) => n != null && !Number.isNaN(n))
  const latest = sorted[sorted.length - 1]
  let trend = '数据不足'
  const threshold = trendThreshold(metricId)
  if (nums.length >= 4 && threshold) {
    const mid = Math.floor(nums.length / 2)
    const before = mean(nums.slice(0, mid))
    const after = mean(nums.slice(mid))
    if (before == null || after == null) trend = '数据不足'
    else if (Math.abs(after - before) < threshold) trend = '基本平稳'
    else trend = after > before ? '后半段更高' : '后半段更低'
  } else if (nums.length >= 2) trend = '记录较少'
  return {
    metricId,
    count: sorted.length,
    min: nums.length ? Math.min(...nums) : null,
    max: nums.length ? Math.max(...nums) : null,
    mean: mean(nums),
    trend,
    latest: latest ? { id: latest.id, localDate: latest.localDate, display: displayOf(latest) } : null,
    points: sorted.map((record) => ({ id: record.id, localDate: record.localDate, display: displayOf(record) })),
  }
}

function proseMetric(name, obs, start, end) {
  if (!obs.count) {
    return {
      what: `${name}在 ${start} 至 ${end} 没有记录，数据不足，无法判断。`,
      change: `${name}：数据不足，无法判断。`,
      tip: `${name}：可以先补记几次，再看变化。`,
    }
  }
  const latest = `最近一次是 ${obs.latest.localDate} 的 ${obs.latest.display}`
  const stats = obs.mean == null ? '' : `均值 ${obs.mean}，最低 ${obs.min}，最高 ${obs.max}。`
  let change = '记录较少，暂不判断升降。'
  if (obs.trend === '基本平稳') change = '后半段均值和前半段接近，整体基本平稳。'
  if (obs.trend === '后半段更高') change = '后半段均值高于前半段。'
  if (obs.trend === '后半段更低') change = '后半段均值低于前半段。'
  if (obs.trend === '数据不足') change = '只有零星记录，数据不足，无法判断变化。'
  return { what: `${name}在 ${start} 至 ${end} 共 ${obs.count} 条。${latest}。`, change: `${name}：${change}${stats}`, tip: `${name}：${lifeTip(obs.metricId)}` }
}

export function buildMetricAnalysis(user, { metricIds, start, end }) {
  const ids = [...new Set(metricIds)].slice(0, 5)
  const observations = ids.map((id) => ({ name: metricName(id, user.customMetrics), ...observeMetric(recordsForMetric(user, id, start, end), id) }))
  const records = ids.flatMap((id) => recordsForMetric(user, id, start, end))
  const critical = crisisMessages(records)
  const pieces = observations.map((obs) => proseMetric(obs.name, obs, start, end))
  const empty = observations.every((obs) => !obs.count)
  const sections = empty
    ? [
        { heading: '记录了什么', body: '这个时间范围内没有选中的指标记录，数据不足，无法判断。' },
        { heading: '可以看到的变化', body: '数据不足，无法判断。' },
        { heading: '可以考虑的生活安排', body: '可以先按相同方式补记几次，再来看变化。' },
        { heading: '建议当面咨询医生的情况', body: DOCTOR_FALLBACK },
      ]
    : [
        { heading: '记录了什么', body: pieces.map((item) => item.what).join('\n') },
        { heading: '可以看到的变化', body: pieces.map((item) => item.change).join('\n') },
        {
          heading: '可以考虑的生活安排',
          body: critical.length
            ? '先看页面顶部的就医提示。若之后又测了一次，把时间和数值记下来交给医生。不要根据本产品自行加药或停药。'
            : pieces.map((item) => item.tip).join('\n'),
        },
        { heading: '建议当面咨询医生的情况', body: critical.length ? critical.join('\n') : DOCTOR_FALLBACK },
      ]
  const evidence = observations
    .filter((obs) => obs.count)
    .map((obs) => ({
      type: 'metric',
      metricId: obs.metricId,
      recordId: obs.latest?.id || '',
      label: `${obs.name} · ${start} 至 ${end}`,
      detail: `${obs.count} 条${obs.mean == null ? '' : `，均值 ${obs.mean}，最低 ${obs.min}，最高 ${obs.max}`}`,
    }))
  return {
    title: `${observations.map((obs) => obs.name).join('、')} · ${start} 至 ${end}`,
    kind: 'metric',
    sections,
    critical,
    evidence,
    snapshot: { kind: 'metric', start, end, metricIds: ids, observations, critical },
  }
}

export function buildReportAnalysis(user, report, { today, includeUnconfirmed = false }) {
  const confirmed = report.status === 'confirmed'
  const items = (report.items || []).filter(() => confirmed || includeUnconfirmed)
  const critical = []
  for (const item of items) {
    const n = Number(String(item.result).replace(/[^\d.-]/g, ''))
    if (Number.isNaN(n)) continue
    if (/血氧/.test(item.name) && n < 90) critical.push(CRISIS_COPY.spo2)
    if (/体温/.test(item.name) && n >= 39) critical.push(CRISIS_COPY.temp)
    if (/血糖|葡萄糖/.test(item.name) && (n <= 3 || n >= 16.7)) critical.push(CRISIS_COPY.glucose)
    if (/收缩压/.test(item.name) && n >= 180) critical.push(CRISIS_COPY.bp)
    if (/舒张压/.test(item.name) && n >= 120) critical.push(CRISIS_COPY.bp)
  }
  const textBlob = items.map((item) => `${item.name} ${item.result}`).join('\n')
  if (CRISIS_PATTERN.test(textBlob)) critical.push(CRISIS_COPY.symptom)
  const uniqueCritical = [...new Set(critical)]
  const groups = [...new Set(items.map((item) => bucketName(item.name)))]
  const flagged = items
    .map((item) => ({ ...item, autoFlag: itemFlag(item) }))
    .filter((item) => item.autoFlag)
  const unverified = !confirmed && includeUnconfirmed ? '以下内容包含未经你确认的提取结果。' : ''
  const imaging = report.type === 'imaging' ? '影像结论请以原件和放射科或超声科报告为准。' : ''
  const start = addDays(today, -90)
  const related = []
  if (confirmed) {
    const names = items.map((item) => item.name).join(' ')
    const metricIds = []
    if (/血糖/.test(names)) metricIds.push('glucose')
    if (/血压|收缩压/.test(names)) metricIds.push('bp')
    if (/体重/.test(names)) metricIds.push('weight')
    for (const metricId of metricIds) {
      const found = recordsForMetric(user, metricId, start, today).slice(-3)
      for (const record of found) {
        related.push({
          type: 'metric',
          metricId,
          recordId: record.id,
          label: `${metricName(metricId)} · ${record.localDate}`,
          detail: displayOf(record),
        })
      }
    }
  }
  const evidence = [
    ...items.slice(0, 40).map((item) => ({
      type: 'report',
      reportId: report.id,
      label: item.name,
      detail: `${item.result || '—'} ${item.unit || ''} ${item.refRange ? `参考 ${item.refRange}` : ''}${!confirmed ? ' · 未经你确认的提取结果' : ''}`.trim(),
    })),
    ...related,
  ]
  const what = items.length
    ? `${unverified}${report.title || '这份报告'}（${report.examDate || '未填日期'}）共整理出 ${items.length} 项。可见分组：${groups.join('、')}。${imaging}`
    : '这份报告还没有已核对的项目，数据不足，无法判断。'
  const abnormal = flagged.length
    ? flagged.map((item) => `${item.name}：${item.result} ${item.unit || ''}（${item.autoFlag}，报告参考 ${item.refRange || '未填'}）`).join('\n')
    : '这次没有看到被标记、或偏离报告自带参考范围的项目。'
  const meaning = flagged.length
    ? '这些项目只说明结果和该报告给出的参考范围不同。不能据此判断你患有某种疾病。请以原件为准，交给医生结合你的情况看。'
    : '没有标出的项目，也不等于可以自行下结论。个人情况请咨询医生。'
  const questions = '这次标出的项目需要复查吗？\n下一次复查放在什么时间比较合适？\n有哪些情况出现时，应该提前联系医生？'
  return {
    title: `解读 ${report.title || '体检报告'}`,
    kind: 'report',
    critical: uniqueCritical,
    sections: [
      { heading: '这份报告包含哪些项目', body: what },
      { heading: '标记为异常或偏离参考范围的项目', body: items.length ? abnormal : '数据不足，无法判断。' },
      { heading: '这些项目通常表示什么', body: items.length ? meaning : '数据不足，无法判断。' },
      { heading: '就诊时可以问的问题', body: items.length ? questions : '可以先把原件带去，请医生直接看原件。' },
      { heading: '建议当面咨询医生的情况', body: uniqueCritical.length ? uniqueCritical.join('\n') : DOCTOR_FALLBACK },
    ],
    evidence,
    snapshot: { kind: 'report', reportId: report.id, title: report.title, examDate: report.examDate, confirmed, items, critical: uniqueCritical },
  }
}

export function answerFollowUp(session, question) {
  const text = String(question || '').trim()
  if (!text) return { text: '请先写下想问的问题。' }
  if (CRISIS_PATTERN.test(text)) {
    return { text: CRISIS_COPY.symptom, critical: [CRISIS_COPY.symptom] }
  }
  if (/吃什么药|用什么药|剂量|毫克|停药|换药|处方/.test(text)) {
    return { text: '我不能推荐药品或剂量，也不能建议停药或换药。请按医生已经给你的安排执行，有疑问直接问医生。' }
  }
  const snap = session.snapshot || {}
  if (/报告|体检/.test(text) && snap.kind !== 'report' && !snap.extraReport) {
    return { needMore: 'report', text: '这个问题需要用到体检报告。确认后，我会只追加最近一份已核对报告。' }
  }
  if (/习惯|打卡/.test(text) && !snap.extraHabits) {
    return { needMore: 'habit', text: '这个问题需要用到习惯完成情况。确认后，我只描述同期打卡，不会把它说成原因。' }
  }
  if (snap.kind === 'metric') {
    const lines = (snap.observations || []).map((obs) => {
      if (!obs.count) return `${obs.name || metricName(obs.metricId)}：该范围内没有记录。`
      return `${obs.name || metricName(obs.metricId)}：${obs.count} 条，均值 ${obs.mean ?? '—'}，最低 ${obs.min ?? '—'}，最高 ${obs.max ?? '—'}，最近一次 ${obs.latest?.display || '—'}。变化判断：${obs.trend}。`
    })
    const extra = []
    if (snap.extraReport?.title) extra.push(`已追加报告：${snap.extraReport.title}（${snap.extraReport.examDate || '未填日期'}）。具体项目以原件为准。`)
    if (snap.extraReport?.empty) extra.push('没有找到已核对的体检报告。')
    if (snap.extraHabits) extra.push(`同期习惯有：${snap.extraHabits.join('、') || '无'}。${snap.habitNote || ''}`)
    return { text: `仍根据生成当时的数据回答。\n${lines.join('\n')}${extra.length ? `\n${extra.join('\n')}` : ''}\n${lifeTip(snap.metricIds?.[0] || 'bp')}\n这不能代替医生的判断。` }
  }
  if (snap.kind === 'report') {
    const items = snap.items || []
    const brief = items.slice(0, 8).map((item) => `${item.name} ${item.result} ${item.unit || ''}`).join('；')
    return { text: `仍根据这份报告生成当时的提取结果回答：${brief || '没有可引用的项目'}。请以原件为准，不能据此诊断。` }
  }
  return { text: '我只能根据这次分析已经纳入的数据回答。可以重新选择范围后再分析。' }
}

export function attachExtras(user, session, kind, today) {
  const snapshot = { ...session.snapshot, ...(session.snapshot || {}) }
  if (kind === 'report') {
    const report = (user.reports || []).filter((item) => item.status === 'confirmed').sort((a, b) => (b.examDate || '').localeCompare(a.examDate || ''))[0]
    snapshot.extraReport = report ? { id: report.id, title: report.title, examDate: report.examDate } : { empty: true }
  }
  if (kind === 'habit') {
    snapshot.extraHabits = (user.habits || []).filter((habit) => !habit.archived).map((habit) => habit.name)
    snapshot.habitNote = `截至 ${today} 的习惯名称已列入。这里只说明同期有这些习惯，不表示它们导致了指标变化。`
  }
  return snapshot
}

export function numbersIn(text) {
  return [...String(text).matchAll(/\d+(?:\.\d+)?/g)].map((match) => Number(match[0]))
}

export function collectAllowedNumbers(value, found = []) {
  if (typeof value === 'number') found.push(value)
  else if (Array.isArray(value)) value.forEach((item) => collectAllowedNumbers(item, found))
  else if (value && typeof value === 'object') Object.values(value).forEach((item) => collectAllowedNumbers(item, found))
  else if (typeof value === 'string') found.push(...numbersIn(value))
  return found
}

export function proseHasOnlyKnownNumbers(text, allowed) {
  return numbersIn(text).every((n) => allowed.some((item) => Math.abs(item - n) <= 0.11))
}

export function violatesSafety(text) {
  return /诊断为|确诊你|你患有|建议服用|每日\s*\d+\s*(mg|毫克)|停药|换药|处方/.test(text)
}

export function evaluateStatus(metricId, values, profile, goals) {
  return evaluateRecord(metricId, values, profile, goals)
}
