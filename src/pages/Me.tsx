import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api, downloadFile } from '../api'
import { useApp } from '../state'
import type { UserData } from '../types'
import { Disclaimer, Field } from '../ui'

export function Me() {
  const { user, setUser, meta, toast } = useApp()
  const [phone, setPhone] = useState('')
  if (!user) return null
  const trash = user.records.filter((record) => record.deletedAt)
  return (
    <div className="page">
      <h1>我的</h1>
      <p className="muted">{user.profile.nickname} · {user.phone.slice(0, 3)}****{user.phone.slice(-4)}</p>
      <ProfileForm />
      <section className="card stack">
        <h2>分析授权</h2>
        <p className="muted">{meta.llmConfigured ? `外部模型：${meta.providerName}` : '当前使用本机分析，健康数据不会发给外部模型。'}</p>
        <button className="btn btn-ghost" onClick={async () => setUser((await api<{ user: UserData }>('/api/ai/consent', { method: 'POST', body: JSON.stringify({ enabled: !user.aiConsent }) })).user)}>{user.aiConsent ? '关闭分析' : '开启分析'}</button>
      </section>
      <section className="card stack">
        <h2>提醒</h2>
        <p className="disclaimer">锁屏通知只显示习惯名称，不显示指标数值。若浏览器不允许通知，首页仍会列出今日待记录和待打卡。</p>
        <button className="btn btn-ghost" onClick={async () => {
          if (!('Notification' in window)) { toast('这个浏览器不支持系统通知'); return }
          const result = await Notification.requestPermission()
          toast(result === 'granted' ? '已开启系统通知' : '没有开启。可以继续使用首页里的待办。')
        }}>开启系统通知</button>
      </section>
      <section className="card stack">
        <h2>导出</h2>
        <div className="row">
          <button className="btn btn-ghost" onClick={() => downloadFile('/api/export/records', '指标记录.csv')}>指标</button>
          <button className="btn btn-ghost" onClick={() => downloadFile('/api/export/habits', '习惯打卡.csv')}>习惯</button>
          <button className="btn btn-ghost" onClick={() => downloadFile('/api/export/report-items', '报告项目.csv')}>报告项目</button>
          <button className="btn btn-ghost" onClick={() => downloadFile('/api/export/analyses', '健康分析.md')}>分析</button>
        </div>
        <p className="disclaimer">报告原件请在每份报告里下载。</p>
      </section>
      <section className="card stack">
        <h2>回收站</h2>
        {trash.length === 0 && <p className="muted">没有待恢复的记录。</p>}
        {trash.map((record) => (
          <div className="spread" key={record.id}>
            <span className="muted">{record.localDate} · {record.metricId}</span>
            <button className="btn btn-ghost" onClick={async () => setUser((await api<{ user: UserData }>(`/api/records/${record.id}/restore`, { method: 'POST' })).user)}>恢复</button>
          </div>
        ))}
      </section>
      <section className="card stack">
        <h2>最近操作</h2>
        {user.audit.slice(0, 12).map((item) => <p key={item.id} className="faint">{item.at.slice(0, 16).replace('T', ' ')} · {item.summary}</p>)}
      </section>
      <section className="card stack">
        <h2>删除账户</h2>
        <p className="muted">确认后进入 7 天等待。期间可以撤销。到期后，指标、报告、分析和习惯会从这台服务删除。</p>
        <Field label="输入手机号确认"><input value={phone} onChange={(event) => setPhone(event.target.value)} /></Field>
        <button className="btn btn-danger" onClick={async () => {
          try { setUser((await api<{ user: UserData }>('/api/account/delete', { method: 'POST', body: JSON.stringify({ phone }) })).user) }
          catch (error) { toast(error instanceof Error ? error.message : '没有删除') }
        }}>申请删除</button>
      </section>
      <p className="disclaimer">数据保存在你启动程序的这台电脑上。手机和电脑打开同一个地址时，看到的是同一份记录。退出登录后，这个浏览器不再显示数据。</p>
      <Link to="/admin">内容管理</Link>
      <Disclaimer />
    </div>
  )
}

function ProfileForm() {
  const { user, setUser } = useApp()
  const [profile, setProfile] = useState(user?.profile)
  if (!user || !profile) return null
  return (
    <form className="card stack" onSubmit={async (event) => {
      event.preventDefault()
      const result = await api<{ user: UserData }>('/api/profile', { method: 'PATCH', body: JSON.stringify({ ...profile, onboardingDone: true }) })
      setUser(result.user)
    }}>
      <h2>健康档案</h2>
      <Field label="昵称"><input value={profile.nickname} onChange={(event) => setProfile({ ...profile, nickname: event.target.value })} /></Field>
      <Field label="出生日期"><input type="date" value={profile.birthDate} onChange={(event) => setProfile({ ...profile, birthDate: event.target.value })} /></Field>
      <Field label="性别">
        <select value={profile.gender} onChange={(event) => setProfile({ ...profile, gender: event.target.value as typeof profile.gender })}>
          <option value="">暂不填写</option>
          <option value="female">女</option>
          <option value="male">男</option>
          <option value="undisclosed">不便透露</option>
        </select>
      </Field>
      <Field label="身高 cm"><input type="number" value={profile.heightCm} onChange={(event) => setProfile({ ...profile, heightCm: event.target.value === '' ? '' : Number(event.target.value) })} /></Field>
      <p className="disclaimer">身高只影响之后新记录的 BMI。以前的 BMI 仍按当时身高计算。</p>
      <button className="btn btn-primary" type="submit">保存档案</button>
    </form>
  )
}
