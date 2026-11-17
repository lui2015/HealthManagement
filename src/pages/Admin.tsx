import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import type { Article, Catalog } from '../types'
import { Field } from '../ui'

function adminHeaders(username: string, password: string) {
  return { 'X-Admin-Username': username, 'X-Admin-Password': password }
}

export function Admin() {
  const [username, setUsername] = useState(sessionStorage.getItem('hm-admin-user') || '')
  const [password, setPassword] = useState(sessionStorage.getItem('hm-admin') || '')
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  const [error, setError] = useState('')

  async function load(nextUsername = username, nextPassword = password) {
    const result = await api<Catalog>('/api/admin/articles', { headers: adminHeaders(nextUsername, nextPassword) })
    setCatalog(result)
    sessionStorage.setItem('hm-admin-user', nextUsername)
    sessionStorage.setItem('hm-admin', nextPassword)
  }

  useEffect(() => {
    load().catch((caught: Error) => setError(caught.message))
  }, [])

  return (
    <main className="page" style={{ maxWidth: 880, margin: '0 auto' }}>
      <Link to="/">返回</Link>
      <h1>学习内容</h1>
      <p className="disclaimer">这里只管理科普文章，不能查看任何人的指标或报告。</p>
      <Field label="管理账号">
        <input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" />
      </Field>
      <Field label="管理密码（未设置环境变量时，本机可留空）">
        <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" />
      </Field>
      <button className="btn btn-ghost" onClick={() => load().catch((caught: Error) => setError(caught.message))}>进入</button>
      {error && <p className="banner banner-warn">{error}</p>}
      {catalog?.articles.map((article) => <ArticleRow key={article.id} article={article} headers={adminHeaders(username, password)} onChanged={load} />)}
    </main>
  )
}

function ArticleRow({ article, headers, onChanged }: { article: Article; headers: Record<string, string>; onChanged: () => void }) {
  return (
    <div className="card spread">
      <div>
        <strong>{article.title}</strong>
        <p className="faint">{article.published === false ? '已下线' : '已发布'}</p>
      </div>
      <button className="btn btn-ghost" onClick={async () => {
        await api(`/api/admin/articles/${article.id}/publish`, { method: 'POST', headers, body: JSON.stringify({ published: article.published === false }) })
        onChanged()
      }}>{article.published === false ? '重新发布' : '下线'}</button>
    </div>
  )
}
