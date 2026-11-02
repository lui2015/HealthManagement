import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api, uploadReport } from '../api'
import { useApp } from '../state'
import type { Report, ReportItem, UserData } from '../types'
import { Empty, Field } from '../ui'

const types = [
  { id: 'annual', label: '年度体检' },
  { id: 'lab', label: '化验单' },
  { id: 'imaging', label: '影像报告' },
  { id: 'other', label: '其他' },
]
const statusText: Record<string, string> = { parse_failed: '解析失败', pending_review: '待核对', confirmed: '已核对' }

export function Reports() {
  const { user, setUser, toast } = useApp()
  const [year, setYear] = useState('')
  const [type, setType] = useState('')
  const [keyword, setKeyword] = useState('')
  const [tasks, setTasks] = useState<{ name: string; progress: number; abort: AbortController }[]>([])
  if (!user) return null
  const years = [...new Set(user.reports.map((report) => report.examDate.slice(0, 4)).filter(Boolean))]
  const reports = user.reports.filter((report) => {
    const text = `${report.title} ${report.org} ${report.note}`
    return (!year || report.examDate.startsWith(year)) && (!type || report.type === type) && (!keyword || text.includes(keyword))
  })

  async function uploadFiles(files: File[]) {
    const list = [...files].slice(0, 10)
    for (const file of list) {
      if (file.size > 20 * 1024 * 1024) {
        toast(`${file.name} 超过 20MB`)
        continue
      }
      const controller = new AbortController()
      setTasks((current) => [...current, { name: file.name, progress: 0, abort: controller }])
      const data = await readFile(file)
      try {
        const result = await uploadReport({ fileName: file.name, data, type: 'other' }, (progress) => {
          setTasks((current) => current.map((task) => task.name === file.name ? { ...task, progress } : task))
        }, controller.signal)
        setUser(result.user)
      } catch (error) {
        toast(error instanceof Error ? error.message : '上传失败')
      } finally {
        setTasks((current) => current.filter((task) => task.name !== file.name))
      }
    }
  }

  return (
    <div className="page">
      <div className="spread"><h1>体检报告</h1></div>
      <label className="card stack" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); uploadFiles([...event.dataTransfer.files]) }}>
        <strong>上传 PDF 或图片</strong>
        <p className="muted">可拍照、从相册选择，或把文件拖到这里。一次最多 10 个，每个不超过 20MB。</p>
        <input type="file" accept="application/pdf,image/jpeg,image/png,image/heic,image/heif" multiple onChange={(event) => uploadFiles([...(event.target.files || [])])} />
      </label>
      {tasks.map((task) => (
        <div className="card spread" key={task.name}>
          <span>{task.name} · {Math.round(task.progress * 100)}%</span>
          <button className="btn btn-ghost" onClick={() => task.abort.abort()}>取消</button>
        </div>
      ))}
      <div className="row">
        <select value={year} onChange={(event) => setYear(event.target.value)}><option value="">全部年份</option>{years.map((item) => <option key={item}>{item}</option>)}</select>
        <select value={type} onChange={(event) => setType(event.target.value)}><option value="">全部类型</option>{types.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select>
        <input placeholder="搜索标题、机构、备注" value={keyword} onChange={(event) => setKeyword(event.target.value)} />
      </div>
      {reports.length === 0 && <div className="card"><Empty title="还没有报告。" /></div>}
      <div className="stack">
        {reports.map((report) => (
          <Link className="card card-link" key={report.id} to={`/reports/${report.id}`}>
            <div className="spread"><strong>{report.title}</strong><span className="pill">{statusText[report.status]}</span></div>
            <p className="faint">{report.examDate || '未填日期'} · {types.find((item) => item.id === report.type)?.label} · {report.org || '未填机构'}</p>
          </Link>
        ))}
      </div>
    </div>
  )
}

export function ReportDetail() {
  const { id = '' } = useParams()
  const { user, setUser, confirm, toast } = useApp()
  const [text, setText] = useState('')
  const [draft, setDraft] = useState({ name: '', result: '', unit: '', refRange: '', flag: '' })
  const [selected, setSelected] = useState<string[]>([])
  const [deleteRecords, setDeleteRecords] = useState(false)
  if (!user) return null
  const report = user.reports.find((item) => item.id === id)
  if (!report) return <p>找不到这份报告。</p>
  const sameNames = historyOf(user, report)

  async function patch(body: Record<string, unknown>) {
    const result = await api<{ user: UserData }>(`/api/reports/${report!.id}`, { method: 'PATCH', body: JSON.stringify(body) })
    setUser(result.user)
  }

  async function mutate(path: string, body?: unknown) {
    const result = await api<{ user: UserData; added?: number }>(path, { method: 'POST', body: body ? JSON.stringify(body) : '{}' })
    setUser(result.user)
    return result
  }

  return (
    <div className="page">
      <div className="spread">
        <h1>{report.title}</h1>
        <span className="pill">{statusText[report.status]}</span>
      </div>
      <div className="split-report">
        <section className="card stack">
          <h2>原件</h2>
          {report.mime === 'application/pdf' && <iframe title="报告预览" src={`/api/reports/${report.id}/file`} style={{ width: '100%', minHeight: 420, border: 0 }} />}
          {report.mime.startsWith('image/') && report.mime !== 'image/heic' && <img alt={report.title} src={`/api/reports/${report.id}/file`} />}
          {(report.mime === 'image/heic' || report.status === 'parse_failed') && <p className="muted">自动识别没有得到可用结果。可以预览原件后逐条填写，或粘贴文本识别。</p>}
          <a className="btn btn-ghost" href={`/api/reports/${report.id}/file`}>下载原件</a>
          <Field label="标题"><input value={report.title} onChange={(event) => patch({ title: event.target.value })} /></Field>
          <Field label="体检日期"><input type="date" value={report.examDate} onChange={(event) => patch({ examDate: event.target.value })} /></Field>
          <Field label="机构"><input value={report.org} onChange={(event) => patch({ org: event.target.value })} /></Field>
          <Field label="类型">
            <select value={report.type} onChange={(event) => patch({ type: event.target.value })}>
              {types.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
          </Field>
        </section>
        <section className="card stack">
          <h2>提取结果</h2>
          <Field label="粘贴报告文字，按行识别"><textarea value={text} onChange={(event) => setText(event.target.value)} placeholder={'空腹血糖 5.6 mmol/L 3.9-6.1'} /></Field>
          <button className="btn btn-ghost" onClick={async () => { const result = await mutate(`/api/reports/${report.id}/parse-text`, { text }); toast(`识别出 ${result.added || 0} 行，请核对`) }}>按行识别</button>
          <div className="grid-2">
            <input placeholder="项目" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
            <input placeholder="结果" value={draft.result} onChange={(event) => setDraft({ ...draft, result: event.target.value })} />
            <input placeholder="单位" value={draft.unit} onChange={(event) => setDraft({ ...draft, unit: event.target.value })} />
            <input placeholder="参考范围" value={draft.refRange} onChange={(event) => setDraft({ ...draft, refRange: event.target.value })} />
          </div>
          <button className="btn btn-ghost" onClick={async () => { await mutate(`/api/reports/${report.id}/items`, draft); setDraft({ name: '', result: '', unit: '', refRange: '', flag: '' }) }}>添加一行</button>
          <div className="cards-only">
            {report.items.map((item) => <ItemEditor key={item.id} report={report} item={item} selected={selected.includes(item.id)} onToggle={() => toggle(item.id)} />)}
          </div>
          <table className="table-only">
            <thead><tr><th></th><th>项目</th><th>结果</th><th>单位</th><th>参考</th></tr></thead>
            <tbody>
              {report.items.map((item) => (
                <tr key={item.id}>
                  <td><input type="checkbox" checked={selected.includes(item.id)} onChange={() => toggle(item.id)} aria-label={`选择${item.name}`} /></td>
                  <td>{item.name}</td><td>{item.result}</td><td>{item.unit}</td><td>{item.refRange}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="row">
            {report.status !== 'confirmed' && <button className="btn btn-primary" onClick={() => mutate(`/api/reports/${report.id}/confirm`)}>{report.items.length ? '确认无误' : '标记为已归档'}</button>}
            {report.status === 'confirmed' && <button className="btn btn-ghost" onClick={() => mutate(`/api/reports/${report.id}/reopen`)}>重新编辑</button>}
            <button className="btn btn-ghost" onClick={async () => {
              try {
                await mutate(`/api/reports/${report.id}/write`, { itemIds: selected })
                toast('已写入指标')
              } catch (error) { toast(error instanceof Error ? error.message : '写入失败') }
            }}>写入指标</button>
            <Link className="btn btn-ghost" to={`/analysis?report=${report.id}`}>解读这份报告</Link>
          </div>
          <p className="disclaimer">未确认的提取结果不会当作已核实事实。写入前需要先确认，并填写体检日期。</p>
          {sameNames.length > 0 && (
            <div>
              <h3>同名项目的其他报告</h3>
              {sameNames.map((item) => <p key={item.key} className="muted">{item.text}</p>)}
            </div>
          )}
        </section>
      </div>
      <label className="row"><input type="checkbox" checked={deleteRecords} onChange={(event) => setDeleteRecords(event.target.checked)} />删除报告时，同时删除由它写入的指标</label>
      <button className="btn btn-danger" onClick={async () => {
        if (!(await confirm({ title: '删除这份报告？', body: deleteRecords ? '报告原件和由它写入的指标都会删除。' : '指标记录会保留，但不再能跳回原件。', confirmText: '删除', danger: true }))) return
        const result = await api<{ user: UserData }>(`/api/reports/${report.id}?deleteRecords=${deleteRecords ? '1' : '0'}`, { method: 'DELETE' })
        setUser(result.user)
        history.back()
      }}>删除报告</button>
    </div>
  )

  function toggle(itemId: string) {
    setSelected((current) => current.includes(itemId) ? current.filter((item) => item !== itemId) : [...current, itemId])
  }
}

function ItemEditor({ report, item, selected, onToggle }: { report: Report; item: ReportItem; selected: boolean; onToggle: () => void }) {
  const { setUser } = useApp()
  return (
    <div className="card stack">
      <label className="row"><input type="checkbox" checked={selected} onChange={onToggle} />{item.name} {item.result} {item.unit}</label>
      <button className="btn btn-ghost" onClick={async () => {
        const result = await api<{ user: UserData }>(`/api/reports/${report.id}/items/${item.id}`, { method: 'DELETE' })
        setUser(result.user)
      }}>删除这行</button>
    </div>
  )
}

function historyOf(user: UserData, report: Report) {
  const lines: { key: string; text: string }[] = []
  for (const item of report.items) {
    const others = user.reports.filter((other) => other.id !== report.id).flatMap((other) => other.items.filter((row) => row.name === item.name).map((row) => ({ other, row })))
    if (!others.length) continue
    const units = new Set([item.unit, ...others.map((other) => other.row.unit)].filter(Boolean))
    lines.push({ key: item.id, text: `${item.name}：${others.map((other) => `${other.other.examDate || '未填日期'} ${other.row.result}${other.row.unit}`).join('；')}${units.size > 1 ? '。单位不同，未放在同一条趋势上。' : ''}` })
  }
  return lines
}

function readFile(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('读取文件失败'))
    reader.readAsDataURL(file)
  })
}
