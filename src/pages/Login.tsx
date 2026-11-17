import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { api } from '../api'
import { useApp } from '../state'
import type { Meta, UserData } from '../types'
import { Disclaimer, Field, Mascot } from '../ui'

export function Login() {
  const { user, setUser } = useApp()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  if (user) return <Navigate to="/" replace />

  async function submit() {
    setError('')
    try {
      const path = mode === 'register' ? '/api/auth/register' : '/api/auth/login'
      const result = await api<{ user: UserData; meta: Meta }>(path, { method: 'POST', body: JSON.stringify({ phone, password }) })
      setUser(result.user)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '登录失败')
    }
  }

  return (
    <main className="auth">
      <form className="auth-card card stack" onSubmit={(event) => { event.preventDefault(); submit() }}>
        <div className="hello">
          <Mascot />
          <div>
            <p className="faint">小芽陪你记健康</p>
            <h1>{mode === 'register' ? '建立你的健康档案' : '又见面啦'}</h1>
            <p className="hello-line">轻轻记下今天的身体，慢慢照顾自己。</p>
          </div>
        </div>
        <div className="seg">
          <button type="button" className={mode === 'login' ? 'on' : ''} onClick={() => setMode('login')}>登录</button>
          <button type="button" className={mode === 'register' ? 'on' : ''} onClick={() => setMode('register')}>注册</button>
        </div>
        <Field label="账号（手机号）"><input inputMode="numeric" autoComplete="username" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="11 位手机号" /></Field>
        <Field label="密码"><input type="password" autoComplete={mode === 'register' ? 'new-password' : 'current-password'} value={password} onChange={(event) => setPassword(event.target.value)} placeholder={mode === 'register' ? '至少 8 位，含字母和数字' : '请输入密码'} /></Field>
        {error && <div className="banner banner-warn">{error}</div>}
        <button className="btn btn-primary" type="submit">{mode === 'register' ? '注册并进入' : '登录'}</button>
        <Disclaimer />
      </form>
    </main>
  )
}
