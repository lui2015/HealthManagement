import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../api'
import { useApp } from '../state'
import type { Article, UserData } from '../types'
import { Disclaimer, Empty } from '../ui'

export function Learn() {
  const { content, user, setUser } = useApp()
  const [query, setQuery] = useState('')
  if (!content || !user) return null
  const keyword = query.trim()
  const articles = content.articles.filter((article) => !keyword || `${article.title} ${article.summary}`.includes(keyword))
  const topics = content.topics.filter((topic) => !keyword || `${topic.title} ${topic.summary}`.includes(keyword) || topic.articleIds.some((id) => articles.some((article) => article.id === id)))
  const tip = content.articles.find((article) => article.id === user.tip?.articleId)
  const continuing = user.activeTopics.map((item) => content.topics.find((topic) => topic.id === item.id)).filter((topic) => topic != null)
  return (
    <div className="page">
      <h1>学习</h1>
      <input placeholder="搜索分类、专题或标题" value={query} onChange={(event) => setQuery(event.target.value)} />
      {tip && (
        <section className="card stack">
          <div className="spread"><h2>今日一条</h2><span className="faint">已换 {user.tip?.swaps || 0}/5</span></div>
          <h3>{tip.title}</h3>
          <p className="muted">{tip.summary}</p>
          <div className="row">
            <Link className="btn btn-primary" to={`/learn/article/${tip.id}`}>阅读</Link>
            <button className="btn btn-ghost" onClick={async () => setUser((await api<{ user: UserData }>('/api/learn/tip', { method: 'POST', body: JSON.stringify({ action: 'swap' }) })).user)}>换一条</button>
            <button className="btn btn-ghost" onClick={async () => setUser((await api<{ user: UserData }>('/api/learn/tip', { method: 'POST', body: JSON.stringify({ action: 'read' }) })).user)}>标记已读</button>
          </div>
        </section>
      )}
      {continuing.length > 0 && (
        <section className="stack">
          <h2>继续学习</h2>
          {continuing.map((topic) => topic && <TopicCard key={topic.id} topicId={topic.id} />)}
        </section>
      )}
      {keyword && topics.length === 0 && articles.length === 0 && (
        <div className="card"><Empty title="没有搜到。可以看看这些专题。" action={<Link to="/learn/topic/topic-report">读懂体检报告</Link>} /></div>
      )}
      {content.categories.map((category) => {
        const ownTopics = topics.filter((topic) => topic.categoryId === category.id)
        const ownArticles = articles.filter((article) => article.categoryId === category.id && !content.topics.some((topic) => topic.articleIds.includes(article.id)))
        if (keyword && ownTopics.length === 0 && ownArticles.length === 0) return null
        return (
          <section className="stack" key={category.id}>
            <div className="spread">
              <h2>{category.name}</h2>
              <button className="btn btn-ghost" onClick={async () => setUser((await api<{ user: UserData }>('/api/learn/prefer', { method: 'POST', body: JSON.stringify({ categoryId: category.id }) })).user)}>{user.preferredCategories.includes(category.id) ? '已想多看' : '想多看这类'}</button>
            </div>
            {ownTopics.map((topic) => <TopicCard key={topic.id} topicId={topic.id} />)}
            {ownArticles.map((article) => <ArticleLink key={article.id} article={article} />)}
          </section>
        )
      })}
      <section className="card stack">
        <h2>收藏与最近阅读</h2>
        {user.favorites.map((id) => {
          const article = content.articles.find((item) => item.id === id)
          return <p key={id}>{article ? <Link to={`/learn/article/${id}`}>{article.title}</Link> : '内容已下线'}</p>
        })}
        {user.recentReads.slice(0, 8).map((item) => {
          const article = content.articles.find((articleItem) => articleItem.id === item.id)
          return <p key={item.id} className="faint">{article ? article.title : '内容已下线'}</p>
        })}
      </section>
    </div>
  )
}

export function TopicPage() {
  const { id = '' } = useParams()
  const { content, user, setUser, toast } = useApp()
  if (!content || !user) return null
  const topic = content.topics.find((item) => item.id === id)
  if (!topic) return <p>找不到专题。</p>
  const chapters = topic.articleIds.map((articleId) => content.articles.find((article) => article.id === articleId)).filter((article) => article != null)
  const done = chapters.filter((article) => user.progress[article.id]?.status === 'done').length
  const active = user.activeTopics.some((item) => item.id === topic.id)
  return (
    <div className="page">
      <h1>{topic.title}</h1>
      <p className="muted">{topic.summary}</p>
      <div className="progress" aria-label="学习进度"><b style={{ width: `${chapters.length ? (done / chapters.length) * 100 : 0}%` }} /></div>
      <p className="faint">{done}/{chapters.length} 节 · 约 {chapters.reduce((sum, article) => sum + article.minutes, 0)} 分钟</p>
      <button className="btn btn-primary" onClick={async () => {
        try {
          const result = await api<{ user: UserData }>('/api/learn/topic', { method: 'POST', body: JSON.stringify({ topicId: topic.id, action: active ? 'stop' : 'start' }) })
          setUser(result.user)
        } catch (error) { toast(error instanceof Error ? error.message : '没有更新') }
      }}>{active ? '移出进行中' : '开始学习'}</button>
      {chapters.map((article, index) => (
        <Link className="card card-link spread" key={article.id} to={`/learn/article/${article.id}`}>
          <span>{index + 1}. {article.title}</span>
          <span className="faint">{user.progress[article.id]?.status === 'done' ? '已读' : user.progress[article.id]?.status === 'reading' ? '在读' : '未读'}</span>
        </Link>
      ))}
    </div>
  )
}

export function ArticlePage() {
  const { id = '' } = useParams()
  const { content, user, setUser } = useApp()
  const [offline, setOffline] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)
  const article = content?.articles.find((item) => item.id === id)
  const topic = content?.topics.find((item) => item.articleIds.includes(id))
  useEffect(() => {
    api<{ offline?: boolean; user: UserData }>('/api/learn/open', { method: 'POST', body: JSON.stringify({ articleId: id }) }).then((result) => {
      setUser(result.user)
      setOffline(Boolean(result.offline))
    }).catch(() => undefined)
  }, [id])
  useEffect(() => {
    const node = endRef.current
    if (!node || !article) return
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) {
        api<{ user: UserData }>('/api/learn/complete', { method: 'POST', body: JSON.stringify({ articleId: id }) }).then((result) => setUser(result.user)).catch(() => undefined)
      }
    }, { threshold: 0.6 })
    observer.observe(node)
    return () => observer.disconnect()
  }, [article, id])
  const nextId = useMemo(() => {
    if (!topic) return ''
    const index = topic.articleIds.indexOf(id)
    return topic.articleIds[index + 1] || ''
  }, [topic, id])
  if (!content || !user) return null
  if (offline || !article) return <div className="page card"><h1>内容已下线</h1><p>你的阅读进度仍然保留。</p><Link to="/learn">返回学习</Link></div>
  const favorite = user.favorites.includes(article.id)
  return (
    <div className="page reader">
      <aside className="reader-side stack">
        {topic ? topic.articleIds.map((articleId) => {
          const item = content.articles.find((articleItem) => articleItem.id === articleId)
          if (!item) return null
          return <Link key={articleId} to={`/learn/article/${articleId}`} className={articleId === id ? 'pill pill-ok' : 'faint'}>{item.title}</Link>
        }) : <Link to="/learn">返回分类</Link>}
      </aside>
      <article className="prose">
        <p className="faint">{content.categories.find((item) => item.id === article.categoryId)?.name} · {article.minutes} 分钟</p>
        <h1>{article.title}</h1>
        {article.sections.map((section) => (
          <section key={section.heading || section.paragraphs[0]}>
            {section.heading && <h3>{section.heading}</h3>}
            {section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
          </section>
        ))}
        <div ref={endRef} />
        <div className="row">
          <button className="btn btn-primary" onClick={async () => setUser((await api<{ user: UserData }>('/api/learn/complete', { method: 'POST', body: JSON.stringify({ articleId: id }) })).user)}>完成本节</button>
          <button className="btn btn-ghost" onClick={async () => setUser((await api<{ user: UserData }>('/api/learn/favorite', { method: 'POST', body: JSON.stringify({ articleId: id, on: !favorite }) })).user)}>{favorite ? '取消收藏' : '收藏'}</button>
          {nextId && <Link className="btn btn-ghost" to={`/learn/article/${nextId}`}>下一节</Link>}
        </div>
        {user.aiConsent && <Link to="/analysis">用我的数据分析这个主题</Link>}
        <p className="disclaimer">更新于 {article.updatedAt}。{article.source}。本内容用于健康科普，不能替代诊疗。</p>
        <Disclaimer />
      </article>
    </div>
  )
}

function TopicCard({ topicId }: { topicId: string }) {
  const { content, user } = useApp()
  const topic = content?.topics.find((item) => item.id === topicId)
  if (!topic || !user || !content) return null
  const chapters = topic.articleIds.filter((id) => content.articles.some((article) => article.id === id))
  const done = chapters.filter((id) => user.progress[id]?.status === 'done').length
  return (
    <Link className="card card-link stack" to={`/learn/topic/${topic.id}`}>
      <div className="spread"><strong>{topic.title}</strong><span className="faint">{done}/{chapters.length}</span></div>
      <p className="muted">{topic.summary}</p>
      <div className="progress"><b style={{ width: `${chapters.length ? (done / chapters.length) * 100 : 0}%` }} /></div>
    </Link>
  )
}

function ArticleLink({ article }: { article: Article }) {
  const { user } = useApp()
  return (
    <Link className="card card-link spread" to={`/learn/article/${article.id}`}>
      <span>{article.title}</span>
      <span className="faint">{user?.progress[article.id]?.status === 'done' ? '已读' : `${article.minutes} 分钟`}</span>
    </Link>
  )
}
