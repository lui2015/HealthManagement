import { useMemo, useState } from 'react'
import { BODY_PARTS, formSchema, metricName, PRESET_METRICS, referenceHint } from '@shared/metrics.js'
import { api, ApiError, dateTimeLocal, today } from './api'
import { liveRecords } from './selectors'
import { useApp } from './state'
import type { HealthRecord } from './types'
import { CriticalList, Field } from './ui'

export function Recorder() {
  const { user, recorder, closeRecorder, setUser, toast } = useApp()
  const metrics = useMemo(() => [...PRESET_METRICS.filter((item) => !item.derived), ...(user?.customMetrics || []).filter((item) => item.active)], [user])
  const recent = useMemo(() => {
    const ids: string[] = []
    for (const record of [...liveRecords(user!)].reverse()) {
      if (!ids.includes(record.metricId)) ids.push(record.metricId)
    }
    return [...ids, 'weight', 'bp', 'glucose', 'sleep'].filter((id, index, list) => list.indexOf(id) === index && metrics.some((item) => item.id === id)).slice(0, 4)
  }, [user, metrics])
  const editing = user?.records.find((record) => record.id === recorder?.recordId)
  const [metricId, setMetricId] = useState(editing?.metricId || recorder?.metricId || recent[0] || 'weight')
  const [measuredAt, setMeasuredAt] = useState(editing ? dateTimeLocal(new Date(editing.measuredAt)) : dateTimeLocal())
  const [values, setValues] = useState<Record<string, unknown>>(editing?.values || {})
  const [note, setNote] = useState(editing?.note || '')
  const [critical, setCritical] = useState<string[]>([])
  const [error, setError] = useState('')
  if (!user) return null
  const current = user
  const metric = metrics.find((item) => item.id === metricId) || metrics[0]
  if (!metric) return null
  const schema = formSchema(metric)

  function setField(key: string, value: unknown) {
    setValues((current) => ({ ...current, [key]: value }))
  }

  async function save() {
    setError('')
    const localDate = measuredAt.slice(0, 10) || today()
    const body = { metricId: metric.id, measuredAt: new Date(measuredAt).toISOString(), localDate, values, note, clientId: editing?.clientId || crypto.randomUUID() }
    try {
      const path = editing ? `/api/records/${editing.id}` : '/api/records'
      const result = await api<{ user: typeof user; critical: string[] }>(path, { method: editing ? 'PATCH' : 'POST', body: JSON.stringify(body) })
      setUser(result.user)
      setCritical(result.critical || [])
      toast('已记下')
      if (!result.critical?.length) {
        setValues({})
        setNote('')
        setMeasuredAt(dateTimeLocal())
      }
    } catch (caught) {
      const message = caught instanceof ApiError ? caught.message : '保存失败'
      if (caught instanceof ApiError && caught.status === 0 && !editing) {
        const queue = JSON.parse(sessionStorage.getItem('hm-record-queue') || '[]') as unknown[]
        queue.push(body)
        sessionStorage.setItem('hm-record-queue', JSON.stringify(queue))
        const optimistic: HealthRecord = { ...body, id: body.clientId, source: 'manual', deletedAt: null, pending: true }
        setUser({ ...current, records: [...current.records, optimistic] })
        toast('已先记在本机，网络恢复后会同步')
        setValues({})
        return
      }
      setError(message)
    }
  }

  return (
    <div className="sheet" role="dialog" aria-modal="true" aria-label="记一笔">
      <form className="sheet-card stack" onSubmit={(event) => { event.preventDefault(); save() }}>
        <div className="spread">
          <h2>{editing ? '修改记录' : '记一笔'}</h2>
          <button type="button" className="btn btn-ghost" onClick={closeRecorder}>关闭</button>
        </div>
        {!editing && (
          <div className="seg">
            {recent.map((id) => <button type="button" key={id} className={id === metric.id ? 'on' : ''} onClick={() => { setMetricId(id); setValues({}) }}>{metricName(id, user.customMetrics)}</button>)}
          </div>
        )}
        <Field label="指标">
          <select value={metric.id} disabled={Boolean(editing)} onChange={(event) => { setMetricId(event.target.value); setValues({}) }}>
            {metrics.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </Field>
        <Field label="测量时间">
          <input type="datetime-local" value={measuredAt} onChange={(event) => setMeasuredAt(event.target.value)} />
        </Field>
        {schema.map((field) => (
          <Field key={field.key} label={field.label}>
            {field.type === 'select' && (
              <div className="seg">
                {field.options?.map((option) => <button type="button" key={option.id} className={values[field.key] === option.id ? 'on' : ''} onClick={() => setField(field.key, option.id)}>{option.label}</button>)}
              </div>
            )}
            {field.type === 'number' && <input inputMode="decimal" type="number" min={field.min} max={field.max} step={field.step} value={String(values[field.key] ?? '')} onChange={(event) => setField(field.key, event.target.value)} />}
            {field.type === 'time' && <input type="time" value={String(values[field.key] || '')} onChange={(event) => setField(field.key, event.target.value)} />}
            {field.type === 'textarea' && <textarea maxLength={field.max || 500} value={String(values[field.key] || '')} onChange={(event) => setField(field.key, event.target.value)} />}
            {field.type === 'parts' && (
              <div className="seg">
                {BODY_PARTS.map((part) => {
                  const selected = Array.isArray(values.parts) && (values.parts as string[]).includes(part.id)
                  return <button type="button" key={part.id} className={selected ? 'on' : ''} onClick={() => {
                    const current = Array.isArray(values.parts) ? [...values.parts as string[]] : []
                    setField('parts', selected ? current.filter((item) => item !== part.id) : [...current, part.id])
                  }}>{part.label}</button>
                })}
              </div>
            )}
          </Field>
        ))}
        <Field label="备注（可选）"><input maxLength={200} value={note} onChange={(event) => setNote(event.target.value)} /></Field>
        <p className="disclaimer">{referenceHint(metric.id, String(values.scene || ''))} 参考区间仅供个人记录对照，不能作为诊断依据。</p>
        {error && <div className="banner banner-warn">{error}</div>}
        <CriticalList messages={critical} />
        <button className="btn btn-primary" type="submit">保存，并可以再记一笔</button>
      </form>
    </div>
  )
}
