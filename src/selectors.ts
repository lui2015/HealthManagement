import { addDays } from '@shared/dates.js'
import { crisisMessages, deriveBmiRecords, evaluateRecord, formatValue, sceneLabel, DEFAULT_TARGETS } from '@shared/metrics.js'
import { today } from './api'
import type { HealthRecord, UserData } from './types'

export function liveRecords(user: UserData) {
  return user.records.filter((record) => !record.deletedAt)
}

export function recordsOf(user: UserData, metricId: string, start?: string, end?: string) {
  const source = metricId === 'bmi'
    ? deriveBmiRecords(liveRecords(user).filter((record) => record.metricId === 'weight'))
    : liveRecords(user).filter((record) => record.metricId === metricId)
  return source
    .filter((record) => (!start || record.localDate >= start) && (!end || record.localDate <= end))
    .sort((a, b) => a.measuredAt.localeCompare(b.measuredAt))
}

export function latestOf(user: UserData, metricId: string) {
  const list = recordsOf(user, metricId)
  return list[list.length - 1]
}

export function recordText(record: HealthRecord) {
  const value = formatValue(record.metricId, record.values)
  if (record.metricId === 'glucose') return `${value} ${sceneLabel(String(record.values.scene || ''))}`
  if (record.metricId === 'bp' && record.values.hr) return `${value} · 心率 ${record.values.hr}`
  return value
}

export function statusOf(user: UserData, metricId: string, record?: HealthRecord) {
  const current = record || latestOf(user, metricId)
  if (!current) return { level: 'none', label: '' }
  if (metricId === 'water') {
    const sum = liveRecords(user).filter((item) => item.metricId === 'water' && item.localDate === today()).reduce((total, item) => total + Number(item.values.ml || 0), 0)
    const target = user.goals.water?.target || DEFAULT_TARGETS.water
    return { level: sum >= target ? 'ok' : 'none', label: `${sum} / ${target} ml` }
  }
  if (metricId === 'steps') {
    const target = user.goals.steps?.target || DEFAULT_TARGETS.steps
    const count = Number(current.values.count || 0)
    return { level: count >= target ? 'ok' : 'none', label: count >= target ? '已达到今日目标' : `目标 ${target} 步` }
  }
  return evaluateRecord(metricId, current.values, user.profile, user.goals)
}

export function rangeStart(days: number | 'all') {
  if (days === 'all') return '1970-01-01'
  return addDays(today(), -(days - 1))
}

export function criticalNow(user: UserData) {
  const messages = new Set<string>()
  for (const metricId of ['bp', 'spo2', 'temp', 'glucose', 'symptom']) {
    const latest = latestOf(user, metricId)
    if (!latest) continue
    crisisMessages([latest]).forEach((message) => messages.add(message))
  }
  return [...messages]
}
