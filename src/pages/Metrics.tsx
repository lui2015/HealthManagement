import { useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { metricName, PRESET_METRICS, referenceHint } from '@shared/metrics.js'
import { api, today } from '../api'
import { TrendChart } from '../Chart'
import { latestOf, rangeStart, recordsOf, recordText, statusOf } from '../selectors'
import { useApp } from '../state'
import type { HealthRecord } from '../types'
import { Empty, Field, StatusPill } from '../ui'

const weekNames = ['日', '一', '二', '三', '四', '五', '六']

export function Metrics() {
  const { user, openRecorder } = useApp()
  const [showCustom, setShowCustom] = useState(false)
  if (!user) return null
  const metrics = [...PRESET_METRICS, ...user.customMetrics].filter((item) => !user.hiddenMetrics.includes(item.id))
  return (
    <div className="page">
      <div className="spread"><h1>指标</h1><button className="btn btn-primary" onClick={() => openRecorder()}>记一笔</button></div>
      <div className="metric-grid">
        {metrics.map((metric) => {
          const latest = latestOf(user, metric.id)
          const status = statusOf(user, metric.id, latest)
          return (
            <Link key={metric.id} to={`/metrics/${metric.id}`} className="card card-link stack">
              <span className="faint">{metric.name}</span>
              <strong className="num" style={{ fontSize: 26 }}>{latest ? recordText(latest) : '—'}</strong>
              <StatusPill level={status.level} label={status.label} />
              <span className="faint">{latest?.localDate || '还没有记录'}</span>
            </Link>
          )
        })}
      </div>
      <button className="btn btn-ghost" onClick={() => setShowCustom((value) => !value)}>自定义指标</button>
      {showCustom && <CustomMetric />}
    </div>
  )
}

export function MetricDetail() {
  const { id = '' } = useParams()
  const { user, openRecorder, setUser, confirm } = useApp()
  const [params] = useSearchParams()
  const [days, setDays] = useState<number | 'all'>(30)
  const [scene, setScene] = useState('')
  const [limit, setLimit] = useState(20)
  if (!user) return null
  const metric = [...PRESET_METRICS, ...user.customMetrics].find((item) => item.id === id)
  if (!metric) return <p>找不到这个指标。</p>
  const start = rangeStart(days)
  const records = recordsOf(user, id, start, today()).filter((record) => !scene || record.values.scene === scene)
  const chart = chartOf(records, id)
  const focus = params.get('focus')

  async function remove(record: HealthRecord) {
    if (!(await confirm({ title: '删除这条记录？', body: '删除后会在回收站保留 30 天。', confirmText: '删除', danger: true }))) return
    const result = await api<{ user: typeof user }>(`/api/records/${record.id}`, { method: 'DELETE' })
    setUser(result.user)
  }

  return (
    <div className="page">
      <div className="spread">
        <div>
          <h1>{metric.name}</h1>
          <p className="disclaimer">{referenceHint(id, scene)} 参考区间仅供个人记录对照，不能作为诊断依据。</p>
        </div>
        {!('derived' in metric && metric.derived) && <button className="btn btn-primary" onClick={() => openRecorder(id)}>记一笔</button>}
      </div>
      <div className="seg">
        {[7, 30, 90, 'all'].map((item) => <button key={String(item)} className={days === item ? 'on' : ''} onClick={() => setDays(item as number | 'all')}>{item === 'all' ? '全部' : `近 ${item} 天`}</button>)}
      </div>
      {id === 'glucose' && (
        <div className="seg">
          <button className={scene === '' ? 'on' : ''} onClick={() => setScene('')}>全部场景</button>
          {['fasting', 'postprandial', 'random', 'bedtime'].map((item) => <button key={item} className={scene === item ? 'on' : ''} onClick={() => setScene(item)}>{item === 'fasting' ? '空腹' : item === 'postprandial' ? '餐后' : item === 'random' ? '随机' : '睡前'}</button>)}
        </div>
      )}
      {chart.points.length === 0 ? <div className="card"><Empty title="这个范围内还没有记录。" action={!('derived' in metric && metric.derived) ? <button className="btn btn-primary" onClick={() => openRecorder(id)}>记一笔</button> : undefined} /></div> : (
        <TrendChart title={`${metric.name}趋势`} unit={metric.unit} source={`来源：你的记录 · ${days === 'all' ? '全部时间' : `近 ${days} 天`}`} series={chart.series} points={chart.points} onPick={(recordId) => document.getElementById(recordId)?.scrollIntoView({ block: 'center' })} />
      )}
      <GoalEditor metricId={id} />
      <section className="card">
        <h2>记录明细</h2>
        {records.slice().reverse().slice(0, limit).map((record) => (
          <div className="list-row" id={record.id} key={record.id} style={{ background: focus === record.id ? 'var(--accent-soft)' : undefined }}>
            <div>
              <strong className="num">{recordText(record)}</strong>
              <p className="faint">{record.localDate} {new Date(record.measuredAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })} · {record.source === 'report' ? '体检报告' : '手动'}{record.sourceMissing ? ' · 原报告已删除' : ''}</p>
              {record.note && <p className="muted">{record.note}</p>}
              <StatusPill level={statusOf(user, id, record).level} label={statusOf(user, id, record).label} />
            </div>
            <div className="row">
              {record.source === 'report' && record.sourceReportId && !record.sourceMissing && <Link to={`/reports/${record.sourceReportId}`}>查看报告</Link>}
              {record.source !== 'report' && !('derived' in metric && metric.derived) && <button className="btn btn-ghost" onClick={() => openRecorder(id, record.id)}>修改</button>}
              {!('derived' in metric && metric.derived) && <button className="btn btn-ghost" onClick={() => remove(record)}>删除</button>}
            </div>
          </div>
        ))}
        {records.length > limit && <button className="btn btn-ghost" onClick={() => setLimit((value) => value + 20)}>加载更多</button>}
      </section>
      <HideAndRemind metricId={id} />
    </div>
  )
}

function chartOf(records: HealthRecord[], metricId: string) {
  if (metricId === 'bp') {
    return {
      series: [{ key: 'sbp', name: '收缩压' }, { key: 'dbp', name: '舒张压' }],
      points: records.map((record) => ({ id: record.id, label: record.localDate, values: { sbp: Number(record.values.sbp), dbp: Number(record.values.dbp) } })),
    }
  }
  if (metricId === 'water') {
    const map = new Map<string, { id: string; ml: number }>()
    for (const record of records) {
      const current = map.get(record.localDate) || { id: record.id, ml: 0 }
      current.ml += Number(record.values.ml || 0)
      map.set(record.localDate, current)
    }
    return { series: [{ key: 'ml', name: '饮水量' }], points: [...map.entries()].map(([label, value]) => ({ id: value.id, label, values: { ml: value.ml } })) }
  }
  const key = metricId === 'weight' ? 'kg' : metricId === 'bmi' ? 'bmi' : metricId === 'waist' ? 'cm' : metricId === 'rhr' ? 'bpm' : metricId === 'glucose' ? 'mmol' : metricId === 'temp' ? 'c' : metricId === 'spo2' ? 'percent' : metricId === 'sleep' ? 'hours' : metricId === 'steps' ? 'count' : 'value'
  return {
    series: [{ key, name: metricName(metricId) }],
    points: records.map((record) => ({ id: record.id, label: record.localDate, values: { [key]: Number(record.values[key]) } })).filter((point) => Number.isFinite(point.values[key])),
  }
}

function GoalEditor({ metricId }: { metricId: string }) {
  const { user, setUser } = useApp()
  const goal = user?.goals[metricId] || {}
  const [low, setLow] = useState(goal.low ?? '')
  const [high, setHigh] = useState(goal.high ?? '')
  const [target, setTarget] = useState(goal.target ?? '')
  if (!user) return null
  const daily = metricId === 'water' || metricId === 'steps'
  return (
    <form className="card stack" onSubmit={async (event) => {
      event.preventDefault()
      const result = await api<{ user: typeof user }>('/api/metric-prefs', { method: 'PATCH', body: JSON.stringify({ goal: { metricId, low, high, target } }) })
      setUser(result.user)
    }}>
      <h2>{daily ? '我的每日目标' : '我的目标区间'}</h2>
      {daily ? <Field label={metricId === 'water' ? '目标 ml' : '目标步数'}><input type="number" value={String(target)} onChange={(event) => setTarget(event.target.value)} /></Field> : (
        <div className="grid-2">
          <Field label="下限"><input type="number" value={String(low)} onChange={(event) => setLow(event.target.value)} /></Field>
          <Field label="上限"><input type="number" value={String(high)} onChange={(event) => setHigh(event.target.value)} /></Field>
        </div>
      )}
      <button className="btn btn-ghost" type="submit">保存目标</button>
    </form>
  )
}

function HideAndRemind({ metricId }: { metricId: string }) {
  const { user, setUser } = useApp()
  const reminder = user?.reminders.find((item) => item.metricId === metricId)
  const [time, setTime] = useState(reminder?.time || '08:00')
  const [days, setDays] = useState<number[]>(reminder?.weekdays || [1, 2, 3, 4, 5])
  if (!user || metricId === 'bmi') return null
  return (
    <section className="card stack">
      <h2>提醒与显示</h2>
      <p className="disclaimer">提醒会打开记录页，不会自动写入数值。系统通知只在页面开着、并已授权时生效；否则以这里的今日待记录为准。</p>
      <Field label="时间"><input type="time" value={time} onChange={(event) => setTime(event.target.value)} /></Field>
      <div className="seg">
        {weekNames.map((name, index) => <button type="button" key={name} className={days.includes(index) ? 'on' : ''} onClick={() => setDays((current) => current.includes(index) ? current.filter((item) => item !== index) : [...current, index])}>{name}</button>)}
      </div>
      <div className="row">
        <button className="btn btn-ghost" onClick={async () => {
          const result = await api<{ user: typeof user }>('/api/metric-prefs', { method: 'PATCH', body: JSON.stringify({ reminder: { metricId, enabled: true, time, weekdays: days } }) })
          setUser(result.user)
        }}>保存提醒</button>
        <button className="btn btn-ghost" onClick={async () => {
          const hidden = user.hiddenMetrics.includes(metricId) ? user.hiddenMetrics.filter((item) => item !== metricId) : [...user.hiddenMetrics, metricId]
          const result = await api<{ user: typeof user }>('/api/metric-prefs', { method: 'PATCH', body: JSON.stringify({ hiddenMetrics: hidden }) })
          setUser(result.user)
        }}>{user.hiddenMetrics.includes(metricId) ? '在看板显示' : '在看板隐藏'}</button>
      </div>
    </section>
  )
}

function CustomMetric() {
  const { user, setUser } = useApp()
  const [name, setName] = useState('')
  const [kind, setKind] = useState('number')
  const [unit, setUnit] = useState('')
  if (!user) return null
  return (
    <form className="card stack" onSubmit={async (event) => {
      event.preventDefault()
      const result = await api<{ user: typeof user }>('/api/custom-metrics', { method: 'POST', body: JSON.stringify({ name, kind, unit }) })
      setUser(result.user)
      setName('')
    }}>
      <h2>新的指标</h2>
      <Field label="名称"><input value={name} maxLength={20} onChange={(event) => setName(event.target.value)} /></Field>
      <Field label="类型">
        <select value={kind} onChange={(event) => setKind(event.target.value)}>
          <option value="number">数值</option>
          <option value="text">文字</option>
        </select>
      </Field>
      {kind === 'number' && <Field label="单位"><input value={unit} onChange={(event) => setUnit(event.target.value)} /></Field>}
      <button className="btn btn-primary" type="submit">添加</button>
    </form>
  )
}
