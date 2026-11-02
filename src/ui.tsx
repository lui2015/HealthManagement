import type { ReactNode } from 'react'

export function Icon({ d }: { d: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
      <path d={d} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function Mascot({ size = 72 }: { size?: number }) {
  return (
    <svg className="mascot" width={size} height={size} viewBox="0 0 80 80" aria-hidden="true">
      <ellipse cx="40" cy="71" rx="16" ry="3" fill="#1f3d2c" opacity="0.12" />
      <path d="M20 50c-6 2-8 8-5 11" stroke="#1f3d2c" strokeWidth="2.6" fill="none" strokeLinecap="round" />
      <path d="M60 50c6 2 8 8 5 11" stroke="#1f3d2c" strokeWidth="2.6" fill="none" strokeLinecap="round" />
      <path d="M24 46c0-13 7-22 16-22s16 9 16 22v8c0 8-7 14-16 14s-16-6-16-14z" fill="#fff" stroke="#1f3d2c" strokeWidth="2.6" />
      <path d="M26 40c1-14 8-20 14-20s13 6 15 18c-6-6-11-8-15-8s-11 3-14 10z" fill="#6edc93" stroke="#1f3d2c" strokeWidth="2.6" strokeLinejoin="round" />
      <path d="M40 14v8" stroke="#1f3d2c" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M39 16c-7 1-9 7-7 9 5-1 7-5 7-9z" fill="#3cbf7a" stroke="#1f3d2c" strokeWidth="2" strokeLinejoin="round" />
      <path d="M41 16c7 1 9 7 7 9-5-1-7-5-7-9z" fill="#b6f2c8" stroke="#1f3d2c" strokeWidth="2" strokeLinejoin="round" />
      <ellipse cx="33" cy="46" rx="2.2" ry="3" fill="#1f3d2c" />
      <ellipse cx="48" cy="46" rx="2.2" ry="3" fill="#1f3d2c" />
      <circle cx="33.8" cy="45" r="0.8" fill="#fff" />
      <circle cx="48.8" cy="45" r="0.8" fill="#fff" />
      <path d="M36 53c2.2 2.4 6 2.4 8.2 0" stroke="#1f3d2c" strokeWidth="2" fill="none" strokeLinecap="round" />
      <path d="M24 51h5M51 51h5" stroke="#f0a3b0" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

export const icons = {
  home: 'M4 11.5 12 4l8 7.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1z',
  metric: 'M4 16l5-5 3 3 7-8M4 20h16',
  report: 'M7 3h7l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z',
  habit: 'M5 12.5l4.2 4.2L19 7',
  learn: 'M4 5.5h11a3 3 0 0 1 3 3V19H7a3 3 0 0 0-3 3zM4 5.5a3 3 0 0 1 3 3V22',
  analysis: 'M12 3v3M12 18v3M4.9 6.5l2.1 2.1M17 15.4l2.1 2.1M3 12h3M18 12h3M4.9 17.5l2.1-2.1M17 8.6l2.1-2.1',
  me: 'M12 12a3.2 3.2 0 1 0-3.2-3.2A3.2 3.2 0 0 0 12 12zm-6.2 7.2a6.2 6.2 0 0 1 12.4 0',
}

export function StatusPill({ level, label }: { level: string; label: string }) {
  if (!label) return null
  return <span className={`pill pill-${level}`}>{label}</span>
}

export function Empty({ title, action }: { title: string; action?: ReactNode }) {
  return <div className="empty stack"><p>{title}</p>{action}</div>
}

export function Disclaimer() {
  return <p className="disclaimer">本产品用于个人记录和健康科普，不提供诊疗。不适或紧急情况请联系医疗机构。</p>
}

export function CriticalList({ messages }: { messages: string[] }) {
  if (!messages.length) return null
  return (
    <div className="stack">
      {messages.map((message) => <div className="banner banner-critical" key={message}>{message}</div>)}
    </div>
  )
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="field"><span>{label}</span>{children}</label>
}
