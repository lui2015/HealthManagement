import { useState } from 'react'
import { Link } from 'react-router-dom'
import { addDays } from '@shared/dates.js'
import { HABIT_TEMPLATES, isDone, isRequired, longestStreak, monthCalendar, monthStats, streakInfo } from '@shared/habits.js'
import { api, today } from '../api'
import { useApp } from '../state'
import type { Habit, UserData } from '../types'
import { Field } from '../ui'

const week = ['日', '一', '二', '三', '四', '五', '六']

export function Habits() {
  const { user, setUser, openRecorder, toast } = useApp()
  const [selected, setSelected] = useState('')
  const [showForm, setShowForm] = useState(false)
  if (!user) return null
  const day = today()
  const active = user.habits.filter((habit) => !habit.archived)
  const current = user.habits.find((habit) => habit.id === selected) || active[0]

  async function check(habit: Habit, date = day, op = habit.type === 'check' ? 'toggle' : 'inc') {
    try {
      const result = await api<{ user: UserData }>('/api/checkins', { method: 'POST', body: JSON.stringify({ habitId: habit.id, localDate: date, op }) })
      setUser(result.user)
    } catch (error) {
      toast(error instanceof Error ? error.message : '打卡失败')
    }
  }

  return (
    <div className="page">
      <div className="spread"><h1>习惯</h1><button className="btn btn-primary" onClick={() => setShowForm(true)}>新建</button></div>
      <section className="card stack">
        <h2>今天</h2>
        {active.filter((habit) => isRequired(habit, day)).map((habit) => {
          const done = isDone(habit, user.checkins, day)
          const item = user.checkins.find((checkin) => checkin.habitId === habit.id && checkin.localDate === day)
          const streak = streakInfo(habit, user.checkins, day)
          return (
            <div className="spread" key={habit.id}>
              <button className="list-row" onClick={() => setSelected(habit.id)}>
                <span>
                  <strong>{habit.name}</strong>
                  <span className="faint"> {habit.type === 'count' ? `${item?.count || 0}/${habit.target}` : done ? '已完成' : '未完成'} · {streak.pending && !done ? '待打卡 · ' : ''}连续 {streak.streak} 天</span>
                </span>
              </button>
              <div className="row">
                {habit.action === 'record' && <button className="btn btn-ghost" onClick={() => openRecorder()}>去记录</button>}
                {habit.action === 'learn' && <Link className="btn btn-ghost" to="/learn">去学习</Link>}
                <button className="btn btn-primary" onClick={() => check(habit)}>{habit.type === 'count' ? '+1' : done ? '撤销' : '打卡'}</button>
              </div>
            </div>
          )
        })}
      </section>
      <section className="card stack">
        <h2>从模板开始</h2>
        <p className="disclaimer">服药模板只提醒你执行自己已有的安排，不推荐药品或剂量。</p>
        {HABIT_TEMPLATES.map((template) => (
          <button key={template.key} className="btn btn-ghost" onClick={async () => {
            const result = await api<{ user: UserData }>('/api/habits', { method: 'POST', body: JSON.stringify(template) })
            setUser(result.user)
          }}>{template.name}</button>
        ))}
      </section>
      {showForm && <HabitForm onClose={() => setShowForm(false)} />}
      {current && <HabitStats habit={current} onCheck={check} />}
      {user.habits.some((habit) => habit.archived) && (
        <section className="card stack">
          <h2>已归档</h2>
          {user.habits.filter((habit) => habit.archived).map((habit) => <ArchiveButton key={habit.id} habit={habit} />)}
        </section>
      )}
    </div>
  )
}

function HabitStats({ habit, onCheck }: { habit: Habit; onCheck: (habit: Habit, date: string) => void }) {
  const day = today()
  const { user } = useApp()
  if (!user) return null
  const streak = streakInfo(habit, user.checkins, day)
  const longest = longestStreak(habit, user.checkins, day)
  const month = monthStats(habit, user.checkins, day)
  const calendar = monthCalendar(habit, user.checkins, day)
  const needsMakeup = [1, 2].some((offset) => {
    const date = addDays(day, -offset)
    return isRequired(habit, date) && !isDone(habit, user.checkins, date)
  })
  const makeupDays = [0, 1, 2].map((offset) => addDays(day, -offset)).filter((date) => isRequired(habit, date))
  return (
    <section className="card stack">
      <h2>{habit.name}</h2>
      <p className="muted">当前连续 {streak.streak} 天{needsMakeup ? '，待补卡' : ''} · 最长 {longest} 天 · 本月完成率 {month.due ? Math.round(month.rate * 100) : 0}% · 补卡 {month.makeup} 次</p>
      <div className="cal" aria-label="本月打卡">
        {calendar.map((item) => <i key={item.iso} className={item.status}>{item.iso.slice(8)}</i>)}
      </div>
      <div className="row">
        {makeupDays.map((date) => <button key={date} className="btn btn-ghost" onClick={() => onCheck(habit, date)}>{date === day ? '今天' : date}{date === day ? '' : ' 补卡'}</button>)}
      </div>
      {habit.note && <p className="disclaimer">{habit.note}</p>}
      <ArchiveButton habit={habit} />
    </section>
  )
}

function ArchiveButton({ habit }: { habit: Habit }) {
  const { setUser, user } = useApp()
  if (!user) return null
  return <button className="btn btn-ghost" onClick={async () => {
    const result = await api<{ user: UserData }>(`/api/habits/${habit.id}/archive`, { method: 'POST' })
    setUser(result.user)
  }}>{habit.archived ? '恢复这个习惯' : '归档'}</button>
}

function HabitForm({ onClose }: { onClose: () => void }) {
  const { setUser, user, toast } = useApp()
  const [name, setName] = useState('')
  const [type, setType] = useState<'check' | 'count'>('check')
  const [target, setTarget] = useState(8)
  const [repeat, setRepeat] = useState('daily')
  const [weekdays, setWeekdays] = useState<number[]>([1, 2, 3, 4, 5])
  const [time, setTime] = useState('21:00')
  if (!user) return null
  return (
    <form className="card stack" onSubmit={async (event) => {
      event.preventDefault()
      try {
        const result = await api<{ user: UserData }>('/api/habits', { method: 'POST', body: JSON.stringify({ name, type, target, repeat, weekdays, reminders: time ? [time] : [], note: '' }) })
        setUser(result.user)
        onClose()
      } catch (error) {
        toast(error instanceof Error ? error.message : '没有保存')
      }
    }}>
      <h2>自定义习惯</h2>
      <Field label="名称"><input maxLength={20} value={name} onChange={(event) => setName(event.target.value)} /></Field>
      <div className="seg">
        <button type="button" className={type === 'check' ? 'on' : ''} onClick={() => setType('check')}>完成型</button>
        <button type="button" className={type === 'count' ? 'on' : ''} onClick={() => setType('count')}>计数型</button>
      </div>
      {type === 'count' && <Field label="每日目标次数"><input type="number" min={1} max={99} value={target} onChange={(event) => setTarget(Number(event.target.value))} /></Field>}
      <div className="seg">
        <button type="button" className={repeat === 'daily' ? 'on' : ''} onClick={() => setRepeat('daily')}>每天</button>
        <button type="button" className={repeat === 'weekdays' ? 'on' : ''} onClick={() => setRepeat('weekdays')}>指定周几</button>
      </div>
      {repeat === 'weekdays' && <div className="seg">{week.map((label, index) => <button type="button" key={label} className={weekdays.includes(index) ? 'on' : ''} onClick={() => setWeekdays((current) => current.includes(index) ? current.filter((item) => item !== index) : [...current, index])}>{label}</button>)}</div>}
      <Field label="提醒时间"><input type="time" value={time} onChange={(event) => setTime(event.target.value)} /></Field>
      <div className="row"><button className="btn btn-primary" type="submit">保存</button><button className="btn btn-ghost" type="button" onClick={onClose}>取消</button></div>
    </form>
  )
}
