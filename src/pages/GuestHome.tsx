import { Link } from 'react-router-dom'
import { useApp } from '../state'
import { Disclaimer, Empty, Mascot } from '../ui'

export function GuestHome() {
  const { content, requireLogin } = useApp()
  const articles = content?.articles || []
  const topics = content?.topics || []
  const categories = content?.categories || []
  const featured = articles.slice(0, 5)

  return (
    <div className="page">
      <div className="hello">
        <Mascot />
        <div>
          <p className="faint">小芽陪你记健康</p>
          <h1>先了解身体，再照顾自己。</h1>
          <p className="hello-line">这里的健康知识不用登录就能看。</p>
        </div>
      </div>

      <section className="card stack">
        <h2>记下今天的身体，慢慢照顾自己</h2>
        <p className="muted">登录后可以记录指标、上传体检报告、打卡习惯，并生成属于你的健康说明。</p>
        <div className="row">
          <button className="btn btn-primary" onClick={() => requireLogin('登录后才能记录和管理你的健康信息')}>登录 / 注册，开始记录</button>
          <Link className="btn btn-ghost" to="/learn">先看看健康知识</Link>
        </div>
      </section>

      {!content && <div className="card"><Empty title="健康知识正在整理，稍等一下。" /></div>}

      {categories.length > 0 && (
        <section className="stack">
          <h2>按分类了解</h2>
          <div className="metric-grid">
            {categories.map((category) => (
              <Link className="card card-link stack" key={category.id} to="/learn">
                <strong>{category.name}</strong>
                <span className="faint">{articles.filter((item) => item.categoryId === category.id).length} 篇知识</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {topics.length > 0 && (
        <section className="stack">
          <div className="spread"><h2>健康专题</h2><Link to="/learn">全部专题</Link></div>
          {topics.slice(0, 4).map((topic) => (
            <Link className="card card-link stack" key={topic.id} to={`/learn/topic/${topic.id}`}>
              <strong>{topic.title}</strong>
              <p className="muted">{topic.summary}</p>
              <span className="faint">共 {topic.articleIds.length} 节 · 约 {topic.articleIds.reduce((sum, id) => sum + (articles.find((item) => item.id === id)?.minutes || 0), 0)} 分钟</span>
            </Link>
          ))}
        </section>
      )}

      {featured.length > 0 && (
        <section className="stack">
          <div className="spread"><h2>推荐阅读</h2><Link to="/learn">全部文章</Link></div>
          {featured.map((article) => (
            <Link className="card card-link stack" key={article.id} to={`/learn/article/${article.id}`}>
              <strong>{article.title}</strong>
              <p className="muted">{article.summary}</p>
              <span className="faint">{content?.categories.find((item) => item.id === article.categoryId)?.name} · {article.minutes} 分钟</span>
            </Link>
          ))}
        </section>
      )}

      <Disclaimer />
    </div>
  )
}
