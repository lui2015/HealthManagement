export function TrendChart({
  title,
  unit,
  source,
  points,
  series,
  onPick,
}: {
  title: string
  unit: string
  source: string
  points: { id: string; label: string; values: Record<string, number> }[]
  series: { key: string; name: string }[]
  onPick?: (id: string) => void
}) {
  const width = 640
  const height = 220
  const pad = { l: 48, r: 12, t: 16, b: 32 }
  const nums = points.flatMap((point) => series.map((item) => point.values[item.key])).filter((value) => Number.isFinite(value))
  let min = Math.min(...nums)
  let max = Math.max(...nums)
  if (min === max) {
    min -= 1
    max += 1
  }
  const span = max - min || 1
  const x = (index: number) => pad.l + (points.length === 1 ? (width - pad.l - pad.r) / 2 : (index / (points.length - 1)) * (width - pad.l - pad.r))
  const y = (value: number) => pad.t + (1 - (value - min) / span) * (height - pad.t - pad.b)
  const ticks = [max, (max + min) / 2, min]
  const colors = ['var(--accent)', 'var(--watch)']
  return (
    <figure className="card stack">
      <figcaption className="spread">
        <strong>{title}</strong>
        <span className="faint">{unit}</span>
      </figcaption>
      {series.length > 1 && (
        <div className="row">
          {series.map((item, index) => <span key={item.key} className="faint" style={{ color: colors[index] }}>{item.name}</span>)}
        </div>
      )}
      <div className="chart-wrap">
        <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={title}>
          {ticks.map((tick) => (
            <g key={tick}>
              <line x1={pad.l} x2={width - pad.r} y1={y(tick)} y2={y(tick)} stroke="var(--line)" />
              <text x={4} y={y(tick) + 4} fontSize="11" fill="var(--faint)">{Number(tick.toFixed(1))}</text>
            </g>
          ))}
          {series.map((item, index) => {
            const drawable = points.map((point, pointIndex) => ({ point, pointIndex })).filter(({ point }) => Number.isFinite(point.values[item.key]))
            const d = drawable.map(({ point, pointIndex }, order) => `${order === 0 ? 'M' : 'L'} ${x(pointIndex)} ${y(point.values[item.key])}`).join(' ')
            return (
              <g key={item.key}>
                <path d={d} fill="none" stroke={colors[index]} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                {drawable.map(({ point, pointIndex }) => (
                  <circle key={point.id + item.key} cx={x(pointIndex)} cy={y(point.values[item.key])} r="4.5" fill={colors[index]} onClick={() => onPick?.(point.id)} style={{ cursor: 'pointer' }}>
                    <title>{`${point.label} ${item.name} ${point.values[item.key]} ${unit}`}</title>
                  </circle>
                ))}
              </g>
            )
          })}
          {[0, Math.floor((points.length - 1) / 2), points.length - 1].filter((value, index, list) => list.indexOf(value) === index).map((index) => (
            <text key={index} x={x(index)} y={height - 8} fontSize="11" textAnchor="middle" fill="var(--faint)">{points[index]?.label.slice(5)}</text>
          ))}
        </svg>
      </div>
      <p className="faint">纵轴 {unit || '数值'} · 横轴日期 · {source}</p>
    </figure>
  )
}
