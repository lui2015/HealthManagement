import { NavLink, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import { useState } from 'react'
import { api } from './api'
import { Recorder } from './Recorder'
import { useApp } from './state'
import type { UserData } from './types'
import { Icon, Mascot, icons } from './ui'
import { Admin } from './pages/Admin'
import { AnalysisDetail, AnalysisHome } from './pages/Analysis'
import { Habits } from './pages/Habits'
import { ArticlePage, Learn, TopicPage } from './pages/Learn'
import { Login } from './pages/Login'
import { Me } from './pages/Me'
import { MetricDetail, Metrics } from './pages/Metrics'
import { ReportDetail, Reports } from './pages/Reports'
import { Home } from './pages/Home'

const tabs = [
  { to: '/', label: '首页', icon: icons.home, end: true },
  { to: '/metrics', label: '指标', icon: icons.metric },
  { to: '/reports', label: '报告', icon: icons.report },
  { to: '/habits', label: '习惯', icon: icons.habit },
  { to: '/learn', label: '学习', icon: icons.learn },
]

export function AppRoutes() {
  const { booting } = useApp()
  if (booting) return <main className="auth"><p>正在打开你的健康记录…</p></main>
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/admin" element={<Admin />} />
      <Route element={<Shell />}>
        <Route path="/" element={<Home />} />
        <Route path="/metrics" element={<Metrics />} />
        <Route path="/metrics/:id" element={<MetricDetail />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/reports/:id" element={<ReportDetail />} />
        <Route path="/analysis" element={<AnalysisHome />} />
        <Route path="/analysis/:id" element={<AnalysisDetail />} />
        <Route path="/habits" element={<Habits />} />
        <Route path="/learn" element={<Learn />} />
        <Route path="/learn/topic/:id" element={<TopicPage />} />
        <Route path="/learn/article/:id" element={<ArticlePage />} />
        <Route path="/me" element={<Me />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

function Shell() {
  const { user, offline, recorder, logout } = useApp()
  const location = useLocation()
  if (!user) return <Navigate to="/login" replace />
  if (user.pendingDeletion) return <Pending />
  const title = titleOf(location.pathname)
  return (
    <div className="app">
      <aside className="side">
        <div className="brand"><Mascot size={44} /><span>小芽健康</span></div>
        {tabs.map((tab) => <NavLink key={tab.to} to={tab.to} end={tab.end}><Icon d={tab.icon} />{tab.label}</NavLink>)}
        <NavLink to="/analysis"><Icon d={icons.analysis} />分析</NavLink>
        <NavLink to="/me"><Icon d={icons.me} />我的</NavLink>
      </aside>
      <div className="main">
        <header className="topbar">
          <strong>{title}</strong>
          <div className="row">
            <NavLink to="/me" className="icon-btn" aria-label="我的"><Icon d={icons.me} /></NavLink>
            <button className="btn btn-ghost" onClick={() => logout()}>退出</button>
          </div>
        </header>
        <div className="content">
          {offline && <div className="banner">当前离线，显示的是上次打开的内容。新的指标会先记在本机。</div>}
          <Outlet />
        </div>
      </div>
      <nav className="tabbar">
        {tabs.map((tab) => <NavLink key={tab.to} to={tab.to} end={tab.end}><Icon d={tab.icon} />{tab.label}</NavLink>)}
      </nav>
      {recorder && <Recorder />}
      {!user.profile.onboardingDone && <Onboarding />}
    </div>
  )
}

function titleOf(path: string) {
  if (path.startsWith('/metrics')) return '指标'
  if (path.startsWith('/reports')) return '报告'
  if (path.startsWith('/analysis')) return '分析'
  if (path.startsWith('/habits')) return '习惯'
  if (path.startsWith('/learn')) return '学习'
  if (path.startsWith('/me')) return '我的'
  return '今天'
}

function Pending() {
  const { user, setUser, logout } = useApp()
  if (!user?.pendingDeletion) return null
  return (
    <main className="auth">
      <section className="auth-card card stack">
        <h1>账户等待删除</h1>
        <p>将在 {user.pendingDeletion.slice(0, 10)} 之后删除。在此之前可以撤销。</p>
        <button className="btn btn-primary" onClick={async () => setUser((await api<{ user: UserData }>('/api/account/cancel-delete', { method: 'POST' })).user)}>撤销删除</button>
        <button className="btn btn-ghost" onClick={() => logout()}>退出</button>
      </section>
    </main>
  )
}

function Onboarding() {
  const { user, setUser } = useApp()
  const [step, setStep] = useState(0)
  const [nickname, setNickname] = useState(user?.profile.nickname || '')
  const [birthDate, setBirthDate] = useState('')
  const [gender, setGender] = useState('')
  const [heightCm, setHeightCm] = useState('')
  if (!user) return null

  async function finish(skip: boolean) {
    const result = await api<{ user: UserData }>('/api/profile', {
      method: 'PATCH',
      body: JSON.stringify(skip ? { onboardingDone: true } : { nickname, birthDate, gender, heightCm, onboardingDone: true }),
    })
    setUser(result.user)
  }

  return (
    <div className="sheet" role="dialog" aria-modal="true" aria-label="完善档案">
      <form className="sheet-card stack" onSubmit={(event) => { event.preventDefault(); step < 2 ? setStep(step + 1) : finish(false) }}>
        <p className="faint">第 {step + 1} / 3 步，可跳过</p>
        {step === 0 && <label className="field"><span>怎么称呼你</span><input value={nickname} onChange={(event) => setNickname(event.target.value)} /></label>}
        {step === 1 && (
          <>
            <label className="field"><span>出生日期</span><input type="date" value={birthDate} onChange={(event) => setBirthDate(event.target.value)} /></label>
            <label className="field"><span>性别</span>
              <select value={gender} onChange={(event) => setGender(event.target.value)}>
                <option value="">暂不填写</option>
                <option value="female">女</option>
                <option value="male">男</option>
                <option value="undisclosed">不便透露</option>
              </select>
            </label>
          </>
        )}
        {step === 2 && <label className="field"><span>身高 cm，用于之后计算 BMI</span><input type="number" value={heightCm} onChange={(event) => setHeightCm(event.target.value)} /></label>}
        <div className="row">
          <button className="btn btn-ghost" type="button" onClick={() => finish(true)}>跳过</button>
          <button className="btn btn-primary" type="submit">{step < 2 ? '下一步' : '完成'}</button>
        </div>
      </form>
    </div>
  )
}
