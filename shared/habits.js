import { addDays, inMakeupWindow, monthStart, weekday } from './dates.js'

export const HABIT_TEMPLATES = [
  { key: 'water', name: '喝水', type: 'count', target: 8, note: '每次大约 200 ml，目标和说明都可以改', repeat: 'daily', action: '' },
  { key: 'walk', name: '步行或运动 30 分钟', type: 'check', target: 1, note: '', repeat: 'daily', action: '' },
  { key: 'screen', name: '23:30 前停止看屏幕', type: 'check', target: 1, note: '', repeat: 'daily', action: '' },
  { key: 'meds', name: '按自己的用药清单服药', type: 'check', target: 1, note: '只提醒你执行自己已有的安排，不推荐药品或剂量', repeat: 'daily', action: '' },
  { key: 'metric', name: '记录一项身体指标', type: 'check', target: 1, note: '', repeat: 'daily', action: 'record' },
  { key: 'read', name: '阅读一条健康知识', type: 'check', target: 1, note: '', repeat: 'daily', action: 'learn' },
]

export function isRequired(habit, iso) {
  if (!habit) return false
  if (habit.archivedLocalDate && iso >= habit.archivedLocalDate) return false
  if (habit.archived && !habit.archivedLocalDate) return false
  if (habit.createdLocalDate && iso < habit.createdLocalDate) return false
  if (habit.repeat === 'weekdays') return (habit.weekdays || []).includes(weekday(iso))
  return true
}

export function checkinOn(habit, checkins, iso) {
  return (checkins || []).find((item) => item.habitId === habit.id && item.localDate === iso)
}

export function isDone(habit, checkins, iso) {
  const item = checkinOn(habit, checkins, iso)
  if (!item) return false
  if (habit.type === 'count') return Number(item.count) >= Number(habit.target || 1)
  return !!item.done
}

export function streakInfo(habit, checkins, today) {
  let streak = 0
  let pending = false
  for (let i = 0; i < 500; i += 1) {
    const day = addDays(today, -i)
    if (habit.createdLocalDate && day < habit.createdLocalDate) break
    if (!isRequired(habit, day)) continue
    if (isDone(habit, checkins, day)) streak += 1
    else if (inMakeupWindow(day, today)) pending = true
    else break
  }
  return { streak, pending }
}

export function longestStreak(habit, checkins, today) {
  const start = habit.createdLocalDate || today
  let best = 0
  let current = 0
  for (let day = start; day <= today; day = addDays(day, 1)) {
    if (!isRequired(habit, day)) continue
    if (isDone(habit, checkins, day)) {
      current += 1
      best = Math.max(best, current)
    } else current = 0
  }
  return best
}

export function monthStats(habit, checkins, today) {
  const start = monthStart(today) > (habit.createdLocalDate || monthStart(today)) ? monthStart(today) : habit.createdLocalDate || monthStart(today)
  let due = 0
  let done = 0
  let makeup = 0
  const begin = start > monthStart(today) ? start : monthStart(today)
  for (let day = begin; day <= today; day = addDays(day, 1)) {
    if (!day.startsWith(today.slice(0, 7))) break
    if (!isRequired(habit, day)) continue
    due += 1
    if (isDone(habit, checkins, day)) {
      done += 1
      if (checkinOn(habit, checkins, day)?.makeup) makeup += 1
    }
  }
  return { due, done, makeup, rate: due ? done / due : 0 }
}

export function monthCalendar(habit, checkins, today) {
  const start = monthStart(today)
  const [y, m] = start.split('-').map(Number)
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const days = []
  for (let d = 1; d <= last; d += 1) {
    const iso = `${start.slice(0, 7)}-${String(d).padStart(2, '0')}`
    let status = 'off'
    if (iso > today) status = 'future'
    else if (!isRequired(habit, iso)) status = 'off'
    else if (isDone(habit, checkins, iso)) status = checkinOn(habit, checkins, iso)?.makeup ? 'makeup' : 'done'
    else status = 'missed'
    days.push({ iso, status })
  }
  return days
}

export function validateHabitInput(input) {
  const errors = []
  const name = String(input.name || '').trim()
  if (!name || name.length > 20) errors.push('习惯名称需要在 20 字以内')
  if (!['check', 'count'].includes(input.type)) errors.push('请选择打卡类型')
  if (input.type === 'count') {
    const target = Number(input.target)
    if (!Number.isInteger(target) || target < 1 || target > 99) errors.push('计数目标请填 1 到 99')
  }
  if (input.repeat === 'weekdays' && (!Array.isArray(input.weekdays) || input.weekdays.length === 0)) {
    errors.push('请选择每周哪几天')
  }
  const reminders = input.reminders || []
  if (reminders.length > 2) errors.push('每个习惯最多 2 个提醒时间')
  if (reminders.some((time) => !/^\d{2}:\d{2}$/.test(time))) errors.push('提醒时间格式不正确')
  return errors
}
