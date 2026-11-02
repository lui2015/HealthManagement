import { Link } from 'react-router-dom'
import { metricName, numericOf, PRESET_METRICS } from '@shared/metrics.js'
import { isDone, isRequired, streakInfo } from '@shared/habits.js'
import { weekday } from '@shared/dates.js'
import { today } from '../api'
import { criticalNow, latestOf, recordText, recordsOf, statusOf } from '../selectors'
import { useApp } from '../state'
import { TrendChart } from '../Chart'
import { CriticalList, Empty, Mascot, StatusPill } from '../ui'

export function Home() {
  const { user, content, openRecorder } = useApp()
  if (!user) return null
  const day = today()
  const cards = [...PRESET_METRICS, ...user.customMetrics].filter((item) => !('derived' in item && item.derived) && !user.hiddenMetrics.includes(item.id)).slice(0, 6)
  const dueHabits = user.habits.filter((habit) => !habit.archived && isRequired(habit, day))
  const tip = content?.articles.find((article) => article.id === user.tip?.articleId)
  const latestMetric = [...user.records].reverse().find((record) => !record.deletedAt)
  const trendId = latestMetric?.metricId || 'weight'
  const trendRecords = recordsOf(user, trendId, undefined, day).slice(-30)
  const reminders = (user.reminders || []).filter((item) => item.weekdays.includes(weekday(day)) && !user.records.some((record) => !record.deletedAt && record.metricId === item.metricId && record.localDate === day))

  return (
    <div className="page home-grid">
      <div className="stack">
        <div className="hello">
          <Mascot />
          <div>
            <p className="faint">{day}</p>
            <h1>{user.profile.nickname}</h1>
            <p className="hello-line">今天也要轻轻地照顾自己。</p>
          </div>
        </div>
        <CriticalList messages={criticalNow(user)} />
        {reminders.length > 0 && <div className="banner">今日待记录：{reminders.map((item) => metricName(item.metricId, user.customMetrics)).join('、')}</div>}
        <button className="btn btn-primary" onClick={() => openRecorder()}>记一笔</button>
        <div className="metric-grid">
          {cards.map((metric) => {
            const latest = latestOf(user, metric.id)
            const status = statusOf(user, metric.id, latest)
            return (
              <Link className="card card-link stack" key={metric.id} to={latest ? `/metrics/${metric.id}` : '#'} onClick={(event) => { if (!latest) { event.preventDefault(); openRecorder(metric.id) } }}>
                <span className="faint">{metric.name}</span>
                <strong className="num">{latest ? recordText(latest) : '去记录'}</strong>
                <span className="faint">{latest ? latest.localDate : '还没有记录'}</span>
                <StatusPill level={status.level} label={status.label} />
              </Link>
            )
          })}
        </div>
        <section className="card stack">
          <div className="spread"><h2>今日待打卡</h2><Link to="/habits">全部习惯</Link></div>
          {dueHabits.length === 0 && <p className="muted">还没有进行中的习惯。</p>}
          {dueHabits.map((habit) => {
            const done = isDone(habit, user.checkins, day)
            const streak = streakInfo(habit, user.checkins, day)
            return (
              <div className="spread" key={habit.id}>
                <div>
                  <strong>{habit.name}</strong>
                  <p className="faint">{done ? '今日已完成' : streak.pending ? `待打卡 · 连续 ${streak.streak} 天` : `连续 ${streak.streak} 天`}</p>
                </div>
                <Link className="btn btn-ghost" to="/habits">{done ? '已完成' : '去打卡'}</Link>
              </div>
            )
          })}
        </section>
        {content && (
          <section className="card stack">
            <div className="spread"><h2>今日一条</h2><Link to="/learn">去学习</Link></div>
            {tip ? (
              <>
                <h3>{tip.title}</h3>
                <p className="muted">{tip.summary}</p>
                <Link className="btn btn-ghost" to={`/learn/article/${tip.id}`}>展开全文</Link>
              </>
            ) : <p className="muted">今天的知识还在整理。</p>}
          </section>
        )}
      </div>
      <div className="stack">
        {trendRecords.length === 0 ? (
          <div className="card"><Empty title="记下第一条，趋势会显示在这里。" action={<button className="btn btn-primary" onClick={() => openRecorder()}>记一笔</button>} /></div>
        ) : (
          <TrendChart
            title={`最近的${metricName(trendId, user.customMetrics)}`}
            unit={PRESET_METRICS.find((item) => item.id === trendId)?.unit || ''}
            source="来源：你的记录 · 最近 30 条"
            series={[{ key: 'value', name: metricName(trendId, user.customMetrics) }]}
            points={trendRecords.flatMap((record) => {
              const value = numericOf(trendId, record.values)
              return value == null || Number.isNaN(value) ? [] : [{ id: record.id, label: record.localDate, values: { value } }]
            })}
          />
        )}
        <Link className="card card-link" to="/analysis">
          <h2>看看我的近况</h2>
          <p className="muted">选择指标或一份报告，生成可追溯的说明。</p>
        </Link>
      </div>
    </div>
  )
}
