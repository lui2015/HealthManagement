export function parseReportText(text) {
  const items = []
  for (const line of String(text || '').split(/\n+/)) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const matched = trimmed.match(/^(.{2,40}?)[\s:：|]+(-?\d+(?:\.\d+)?)(?:\s*([^\s]{1,20}))?(?:\s+(.+))?$/)
    if (!matched) continue
    items.push({
      name: matched[1].replace(/\s/g, ''),
      result: matched[2],
      unit: (matched[3] || '').replace(/[，,].*$/, ''),
      refRange: matched[4] || '',
      flag: '',
    })
  }
  return items
}

export function parseRange(text) {
  if (!text) return null
  const normalized = String(text).replace(/～|—|–/g, '-').replace(/\s/g, '')
  const between = normalized.match(/(-?\d+(?:\.\d+)?)-(-?\d+(?:\.\d+)?)/)
  if (between) return { low: Number(between[1]), high: Number(between[2]) }
  const upper = normalized.match(/[<＜](-?\d+(?:\.\d+)?)/)
  if (upper) return { low: null, high: Number(upper[1]) }
  const lower = normalized.match(/[>＞](-?\d+(?:\.\d+)?)/)
  if (lower) return { low: Number(lower[1]), high: null }
  return null
}

export function itemFlag(item) {
  const written = `${item.flag || ''}${item.result || ''}`
  if (/偏高|升高|↑|高/.test(item.flag || '')) return '偏高'
  if (/偏低|降低|↓|低/.test(item.flag || '')) return '偏低'
  const n = Number(String(item.result).replace(/[^\d.-]/g, ''))
  const range = parseRange(item.refRange)
  if (!Number.isNaN(n) && range) {
    if (range.high != null && n > range.high) return '偏高'
    if (range.low != null && n < range.low) return '偏低'
  }
  if (/阳性/.test(written) && !/阴性/.test(written)) return '需关注'
  return ''
}

export function mapItems(items) {
  const mapped = []
  const bp = { sbp: null, dbp: null }
  for (const item of items) {
    const name = String(item.name || '').replace(/\s/g, '')
    const n = Number(String(item.result).replace(/[^\d.-]/g, ''))
    if (Number.isNaN(n)) continue
    if (/空腹血糖|血糖空腹|葡萄糖空腹/.test(name)) mapped.push({ item, metricId: 'glucose', values: { mmol: n, scene: 'fasting' } })
    else if (/餐后/.test(name) && /血糖|葡萄糖/.test(name)) mapped.push({ item, metricId: 'glucose', values: { mmol: n, scene: 'postprandial' } })
    else if (name === '体重' || name.startsWith('体重')) mapped.push({ item, metricId: 'weight', values: { kg: n } })
    else if (/腰围/.test(name)) mapped.push({ item, metricId: 'waist', values: { cm: n } })
    else if (/血氧/.test(name)) mapped.push({ item, metricId: 'spo2', values: { percent: n } })
    else if (/体温/.test(name)) mapped.push({ item, metricId: 'temp', values: { c: n } })
    else if (/心率/.test(name)) mapped.push({ item, metricId: 'rhr', values: { bpm: n } })
    else if (/收缩压/.test(name)) bp.sbp = { item, n }
    else if (/舒张压/.test(name)) bp.dbp = { item, n }
  }
  return { mapped, bp }
}

export function bucketName(name) {
  if (/血压|收缩压|舒张压/.test(name)) return '血压'
  if (/血糖|葡萄糖|糖化/.test(name)) return '血糖'
  if (/胆固醇|甘油三酯|脂蛋白|血脂/.test(name)) return '血脂'
  if (/谷丙|谷草|转氨酶|胆红素|肝/.test(name)) return '肝功能'
  if (/肌酐|尿素|尿酸|肾/.test(name)) return '肾功能'
  if (/白细胞|红细胞|血红蛋白|血小板|血常规/.test(name)) return '血常规'
  if (/尿/.test(name)) return '尿检'
  return '其他项目'
}
