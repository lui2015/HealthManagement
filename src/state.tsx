import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api, ApiError } from './api'
import type { Catalog, Meta, UserData } from './types'

interface ConfirmOptions {
  title: string
  body: string
  confirmText?: string
  danger?: boolean
}

interface AppContextValue {
  user: UserData | null
  meta: Meta
  content: Catalog | null
  booting: boolean
  offline: boolean
  toast: (message: string) => void
  refresh: () => Promise<void>
  setUser: (user: UserData | null) => void
  recorder: { metricId?: string; recordId?: string } | null
  openRecorder: (metricId?: string, recordId?: string) => void
  closeRecorder: () => void
  confirm: (options: ConfirmOptions) => Promise<boolean>
  logout: () => Promise<void>
}

const AppContext = createContext<AppContextValue | null>(null)
const QUEUE_KEY = 'hm-record-queue'

function readQueue() {
  try {
    return JSON.parse(sessionStorage.getItem(QUEUE_KEY) || '[]') as Record<string, unknown>[]
  } catch {
    return []
  }
}

export function AppState({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<UserData | null>(null)
  const [meta, setMeta] = useState<Meta>({ llmConfigured: false, providerName: '本机健康分析' })
  const [content, setContent] = useState<Catalog | null>(null)
  const [booting, setBooting] = useState(true)
  const [offline, setOffline] = useState(false)
  const [message, setMessage] = useState('')
  const [recorder, setRecorder] = useState<{ metricId?: string; recordId?: string } | null>(null)
  const [confirmState, setConfirmState] = useState<(ConfirmOptions & { resolve: (value: boolean) => void }) | null>(null)

  function remember(next: UserData | null) {
    setUserState(next)
    if (next) sessionStorage.setItem('hm-cache', JSON.stringify(next))
    else sessionStorage.removeItem('hm-cache')
  }

  async function refresh() {
    const data = await api<{ user: UserData; meta: Meta }>('/api/me')
    const queue = readQueue()
    if (queue.length) {
      for (const item of queue) await api('/api/records', { method: 'POST', body: JSON.stringify(item) })
      sessionStorage.removeItem(QUEUE_KEY)
      const again = await api<{ user: UserData; meta: Meta }>('/api/me')
      remember(again.user)
      setMeta(again.meta)
    } else {
      remember(data.user)
      setMeta(data.meta)
    }
    setOffline(false)
  }

  useEffect(() => {
    refresh()
      .catch((error: Error) => {
        if (error instanceof ApiError && error.status === 0) {
          const cached = sessionStorage.getItem('hm-cache')
          if (cached) {
            setUserState(JSON.parse(cached) as UserData)
            setOffline(true)
          }
        } else setUserState(null)
      })
      .finally(() => setBooting(false))
    api<Catalog>('/api/content').then(setContent).catch(() => undefined)
    api<Meta>('/api/meta').then(setMeta).catch(() => undefined)
  }, [])

  useEffect(() => {
    if (!message) return
    const timer = window.setTimeout(() => setMessage(''), 2800)
    return () => window.clearTimeout(timer)
  }, [message])

  useEffect(() => {
    if (!user || Notification.permission !== 'granted') return
    const timers: number[] = []
    const now = new Date()
    const day = now.getDay()
    for (const habit of user.habits.filter((item) => !item.archived)) {
      if (habit.repeat === 'weekdays' && !habit.weekdays.includes(day)) continue
      for (const time of habit.reminders) {
        const [hour, minute] = time.split(':').map(Number)
        const at = new Date()
        at.setHours(hour, minute, 0, 0)
        const delay = at.getTime() - now.getTime()
        if (delay > 0) timers.push(window.setTimeout(() => new Notification('习惯提醒', { body: habit.name }), delay))
      }
    }
    return () => timers.forEach((timer) => window.clearTimeout(timer))
  }, [user])

  const value = useMemo<AppContextValue>(() => ({
    user,
    meta,
    content,
    booting,
    offline,
    toast: setMessage,
    refresh,
    setUser: remember,
    recorder,
    openRecorder: (metricId, recordId) => setRecorder({ metricId, recordId }),
    closeRecorder: () => setRecorder(null),
    confirm: (options) => new Promise((resolve) => setConfirmState({ ...options, resolve })),
    logout: async () => {
      await api('/api/auth/logout', { method: 'POST' })
      sessionStorage.removeItem(QUEUE_KEY)
      remember(null)
    },
  }), [user, meta, content, booting, offline, recorder])

  return (
    <AppContext.Provider value={value}>
      {children}
      {message && <div className="toast" role="status">{message}</div>}
      {confirmState && (
        <div className="sheet" role="dialog" aria-modal="true">
          <div className="sheet-card stack">
            <h2>{confirmState.title}</h2>
            <p className="muted">{confirmState.body}</p>
            <div className="row">
              <button className="btn btn-ghost" onClick={() => { confirmState.resolve(false); setConfirmState(null) }}>取消</button>
              <button className={`btn ${confirmState.danger ? 'btn-danger' : 'btn-primary'}`} onClick={() => { confirmState.resolve(true); setConfirmState(null) }}>{confirmState.confirmText || '确定'}</button>
            </div>
          </div>
        </div>
      )}
    </AppContext.Provider>
  )
}

export function useApp() {
  const value = useContext(AppContext)
  if (!value) throw new Error('状态尚未准备好')
  return value
}
