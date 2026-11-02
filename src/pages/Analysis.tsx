import { useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { addDays } from '@shared/dates.js'
import { metricName, PRESET_METRICS } from '@shared/metrics.js'
import { api, today } from '../api'
import { useApp } from '../state'
import type { Analysis, UserData } from '../types'
import { CriticalList, Disclaimer, Empty } from '../ui'

export function AnalysisHome() {
  const { user, meta } = useApp()
  const [params] = useSearchParams()
  const presetReport = params.get('report') || ''
  if (!user) return null
  if (!user.aiConsent) return <Consent />
  return (
    <div className="page">
      <h1>分析</h1>
      <p className="muted">今日还可分析 {Math.max(0, user.analysisLimit - user.analysisToday)} 次。依据保存的是生成当时的数据。</p>
      <Analyzer presetReport={presetReport} />
      <section className="stack">
        <h2>历史分析</h2>
        {user.analyses.length === 0 && <div className="card"><Empty title="还没有分析。可以从指标或报告开始。" /></div>}
        {user.analyses.map((item) => (
          <Link className="card card-link" key={item.id} to={`/analysis/${item.id}`}>
            <strong>{item.title}</strong>
            <p className="faint">{item.createdAt.slice(0, 16).replace('T', ' ')} · {item.model === 'llm' ? meta.providerName : '本机整理'}</p>
          </Link>
        ))}
      </section>
    </div>
  )
}

export function AnalysisDetail() {
  const { id = '' } = useParams()
  const { user, setUser, confirm, meta } = useApp()
  const [question, setQuestion] = useState('')
  const [needMore, setNeedMore] = useState('')
  if (!user) return null
  const analysis = user.analyses.find((item) => item.id === id)
  if (!analysis) return <p>找不到这次分析。</p>
  const visible = analysis.messages.slice(-40)

  async function ask(confirmExtra = '') {
    const result = await api<{ user: UserData; analysis: Analysis; needMore?: string; prompt?: string }>(`/api/analyses/${analysis!.id}/messages`, {
      method: 'POST',
      body: JSON.stringify({ question, confirmExtra }),
    })
    setUser(result.user)
    if (result.needMore) {
      setNeedMore(result.needMore)
      return
    }
    setNeedMore('')
    setQuestion('')
  }

  return (
    <div className="page">
      <div className="spread">
        <div>
          <h1>{analysis.title}</h1>
          <p className="faint">{analysis.model === 'llm' ? `由${meta.providerName}根据你的数据生成，数字来自本机计算` : '由本机根据你的数据整理，没有发给外部模型'} · 依据为生成当时的数据</p>
        </div>
        <button className="btn btn-ghost" onClick={async () => {
          const result = await api<{ user: UserData }>(`/api/analyses/${analysis.id}/regenerate`, { method: 'POST' })
          setUser(result.user)
        }}>重新生成</button>
      </div>
      <CriticalList messages={analysis.critical || []} />
      {analysis.sections.map((section) => (
        <section className="card stack" key={section.heading}>
          <h2>{section.heading}</h2>
          {section.body.split('\n').map((line) => <p key={line}>{line}</p>)}
        </section>
      ))}
      <section className="card stack">
        <h2>依据</h2>
        {analysis.evidence.map((item, index) => (
          <Link key={`${item.label}-${index}`} to={item.reportId ? `/reports/${item.reportId}` : `/metrics/${item.metricId || 'bp'}?focus=${item.recordId || ''}`}>
            <strong>{item.label}</strong>
            <p className="faint">{item.detail}</p>
          </Link>
        ))}
      </section>
      <section className="card stack">
        <h2>继续问</h2>
        {visible.map((message, index) => <p key={`${message.at}-${index}`} className={message.role === 'user' ? '' : 'muted'}>{message.role === 'user' ? '我：' : '分析：'}{message.content}</p>)}
        {analysis.messages.length > 40 && <p className="faint">更早的对话已折叠，仍保存在这次分析里。</p>}
        <textarea value={question} maxLength={500} onChange={(event) => setQuestion(event.target.value)} placeholder="例如：最近一次和均值差多少？" />
        {needMore && <button className="btn btn-ghost" onClick={() => ask(needMore)}>确认追加这部分数据后再回答</button>}
        <button className="btn btn-primary" onClick={() => ask()}>发送</button>
      </section>
      <button className="btn btn-ghost" onClick={async () => {
        if (!(await confirm({ title: '删除这次分析？', body: '删除后不能恢复。', confirmText: '删除', danger: true }))) return
        const result = await api<{ user: UserData }>(`/api/analyses/${analysis.id}`, { method: 'DELETE' })
        setUser(result.user)
        history.back()
      }}>删除这次分析</button>
      <Disclaimer />
    </div>
  )
}

function Consent() {
  const { meta, setUser, user } = useApp()
  if (!user) return null
  return (
    <div className="page">
      <section className="card stack">
        <h1>分析授权</h1>
        <p>分析只会使用你本次勾选的指标、报告或习惯摘要。</p>
        <p>{meta.llmConfigured ? `开启后，这些摘要会发给：${meta.providerName}。默认不用于训练。手机号不会发送。` : '当前未配置外部大模型。分析在你的个人服务上完成，数据不会离开这台服务。'}</p>
        <p>你可以随时关闭。已生成的内容会留在账户里，直到你删除。</p>
        <Disclaimer />
        <button className="btn btn-primary" onClick={async () => {
          const result = await api<{ user: UserData }>('/api/ai/consent', { method: 'POST', body: JSON.stringify({ enabled: true }) })
          setUser(result.user)
        }}>同意并开始使用</button>
      </section>
    </div>
  )
}

function Analyzer({ presetReport }: { presetReport: string }) {
  const { user, setUser } = useApp()
  const [kind, setKind] = useState(presetReport ? 'report' : 'metric')
  const [metricIds, setMetricIds] = useState<string[]>(['bp'])
  const [days, setDays] = useState(30)
  const [reportId, setReportId] = useState(presetReport)
  const [includeUnconfirmed, setIncludeUnconfirmed] = useState(false)
  const [includeHabits, setIncludeHabits] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()
  if (!user) return null
  const end = today()
  const start = addDays(end, -(days - 1))

  async function run() {
    setError('')
    try {
      const result = await api<{ user: UserData; analysis: Analysis }>('/api/analyze', {
        method: 'POST',
        body: JSON.stringify(kind === 'report' ? { kind, reportId, includeUnconfirmed } : { kind: 'metric', metricIds, start, end, includeHabits }),
      })
      setUser(result.user)
      navigate(`/analysis/${result.analysis.id}`)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '生成失败')
    }
  }

  return (
    <section className="card stack">
      <div className="seg">
        <button className={kind === 'metric' ? 'on' : ''} onClick={() => setKind('metric')}>分析指标</button>
        <button className={kind === 'report' ? 'on' : ''} onClick={() => setKind('report')}>解读报告</button>
      </div>
      {kind === 'metric' ? (
        <>
          <div className="seg">
            {PRESET_METRICS.filter((item) => item.id !== 'symptom').map((metric) => (
              <button key={metric.id} className={metricIds.includes(metric.id) ? 'on' : ''} onClick={() => setMetricIds((current) => current.includes(metric.id) ? current.filter((item) => item !== metric.id) : [...current, metric.id].slice(0, 5))}>{metric.name}</button>
            ))}
          </div>
          <div className="seg">
            {[7, 30, 90].map((item) => <button key={item} className={days === item ? 'on' : ''} onClick={() => setDays(item)}>近 {item} 天</button>)}
          </div>
          <label className="row"><input type="checkbox" checked={includeHabits} onChange={(event) => setIncludeHabits(event.target.checked)} />同时看习惯完成情况，只描述同期发生</label>
          <p className="faint">将使用 {metricIds.map((id) => metricName(id, user.customMetrics)).join('、') || '未选择'}，{start} 至 {end}。</p>
        </>
      ) : (
        <>
          <select value={reportId} onChange={(event) => setReportId(event.target.value)}>
            <option value="">选择报告</option>
            {user.reports.map((report) => <option key={report.id} value={report.id}>{report.examDate || '未填日期'} · {report.title}</option>)}
          </select>
          <label className="row"><input type="checkbox" checked={includeUnconfirmed} onChange={(event) => setIncludeUnconfirmed(event.target.checked)} />包含未经我确认的提取结果</label>
        </>
      )}
      {error && <div className="banner banner-warn">{error}</div>}
      <button className="btn btn-primary" onClick={run}>生成分析</button>
    </section>
  )
}
