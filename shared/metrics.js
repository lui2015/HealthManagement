export const GLUCOSE_SCENES = [
  { id: 'fasting', label: '空腹' },
  { id: 'postprandial', label: '餐后 2 小时' },
  { id: 'random', label: '随机' },
  { id: 'bedtime', label: '睡前' },
]

export const BODY_PARTS = [
  { id: 'head', label: '头' },
  { id: 'chest', label: '胸' },
  { id: 'abdomen', label: '腹' },
  { id: 'limbs', label: '四肢' },
  { id: 'other', label: '其他' },
]

export const PRESET_METRICS = [
  { id: 'weight', name: '体重', unit: 'kg' },
  { id: 'bmi', name: 'BMI', unit: '', derived: true },
  { id: 'waist', name: '腰围', unit: 'cm' },
  { id: 'bp', name: '血压', unit: 'mmHg' },
  { id: 'rhr', name: '静息心率', unit: '次/分' },
  { id: 'glucose', name: '血糖', unit: 'mmol/L' },
  { id: 'temp', name: '体温', unit: '℃' },
  { id: 'spo2', name: '血氧饱和度', unit: '%' },
  { id: 'sleep', name: '睡眠', unit: '小时' },
  { id: 'water', name: '饮水量', unit: 'ml' },
  { id: 'steps', name: '步数', unit: '步' },
  { id: 'symptom', name: '症状备忘', unit: '' },
]

export const DEFAULT_TARGETS = { water: 1500, steps: 8000 }

export const CRISIS_PATTERN = /胸痛|呼吸困难|一侧肢体无力|口角歪斜|意识不清|大量出血|自杀|不想活|伤害自己/

export const CRISIS_COPY = {
  bp: '收缩压达到 180 或舒张压达到 120。建议尽快联系医生或前往急诊，不要根据本产品自行加药或停药。',
  spo2: '血氧低于 90%。建议尽快就医。',
  temp: '体温达到 39.0℃。建议尽快就医。',
  glucose: '血糖低于或等于 3.0，或达到 16.7 mmol/L。建议尽快就医。',
  symptom: '如果正出现胸痛、呼吸困难、一侧肢体无力、口角歪斜、意识不清或大量出血，请立即寻求现场帮助或前往急诊，中国大陆可拨打 120。若你有伤害自己的想法，请马上联系身边可信的人，或拨打当地心理援助热线（北京心理危机研究与干预中心 010-82951332，各地号码不同）。',
}

const LIFE = {
  bp: '尽量在同一时间、坐下休息后再测量，并在备注里写上是否刚运动过。',
  glucose: '保留空腹或餐后这样的场景。不同场景的数字不要放在一起比较。',
  weight: '看一周的范围比看某一天更合适。尽量固定称重时间和穿衣情况。',
  bmi: 'BMI 用记录当时的身高和体重计算，只作个人对照。',
  sleep: '除了时长，也可以记下入睡和起床时间。先看一整周，再看某一天。',
  rhr: '在安静、没有刚运动的时候测量。如果是运动后测的，请写进备注。',
  temp: '记下测量时间，以及当时有没有其他不舒服，就诊时可以一起说明。',
  spo2: '在安静时查看。若你感到呼吸费力，直接联系医生。',
  waist: '用同一把软尺、同一个位置测量，前后才比较得了。',
  water: '可以分成多次记下。是否接近每日目标，看当天合计。',
  steps: '按天看是否接近你的目标即可。',
  symptom: '症状备忘用来帮助回忆当时的情况，不能用来判断疾病。',
}

export function metricName(id, customMetrics = []) {
  return PRESET_METRICS.find((m) => m.id === id)?.name || customMetrics.find((m) => m.id === id)?.name || '指标'
}

export function formSchema(metric) {
  switch (metric.id) {
    case 'weight':
      return [num('kg', '体重', 'kg', 20, 300, 0.1)]
    case 'waist':
      return [num('cm', '腰围', 'cm', 40, 200, 0.1)]
    case 'bp':
      return [
        num('sbp', '收缩压', 'mmHg', 40, 260, 1),
        num('dbp', '舒张压', 'mmHg', 20, 180, 1),
        num('hr', '心率（可选）', '次/分', 20, 250, 1, true),
      ]
    case 'rhr':
      return [num('bpm', '静息心率', '次/分', 20, 250, 1)]
    case 'glucose':
      return [
        { key: 'scene', label: '场景', type: 'select', options: GLUCOSE_SCENES },
        num('mmol', '血糖', 'mmol/L', 0.5, 40, 0.1),
      ]
    case 'temp':
      return [num('c', '体温', '℃', 30, 45, 0.1)]
    case 'spo2':
      return [num('percent', '血氧饱和度', '%', 50, 100, 1)]
    case 'sleep':
      return [
        num('hours', '时长（可选）', '小时', 0, 24, 0.1, true),
        { key: 'bed', label: '入睡（可选）', type: 'time', optional: true },
        { key: 'wake', label: '起床（可选）', type: 'time', optional: true },
      ]
    case 'water':
      return [num('ml', '这一次饮水量', 'ml', 1, 5000, 1)]
    case 'steps':
      return [num('count', '当日步数', '步', 0, 200000, 1)]
    case 'symptom':
      return [
        { key: 'text', label: '症状', type: 'textarea', max: 500 },
        { key: 'parts', label: '部位（可选）', type: 'parts', optional: true },
      ]
    default:
      if (metric.kind === 'text') return [{ key: 'text', label: metric.name, type: 'textarea', max: 500 }]
      return [num('value', metric.name, metric.unit || '', metric.min ?? 0, metric.max ?? 1000000, metric.step ?? 0.1)]
  }
}

function num(key, label, unit, min, max, step, optional = false) {
  return { key, label, type: 'number', unit, min, max, step, optional }
}

export function referenceHint(metricId, scene) {
  switch (metricId) {
    case 'bp':
      return '收缩压 140 或舒张压 90 及以上会标为偏高；达到 180 或 120 会提示尽快就医。'
    case 'glucose':
      if (scene === 'fasting') return '空腹常见对照约 3.9–6.1 mmol/L。'
      if (scene === 'postprandial') return '餐后 2 小时常见对照约小于 7.8 mmol/L。'
      return '随机和睡前主要标出明显偏离，以及紧急阈值。'
    case 'temp':
      return '37.3℃ 及以上标为发热，39.0℃ 及以上提示尽快就医。'
    case 'spo2':
      return '低于 95% 标为需要关注，低于 90% 提示尽快就医。'
    case 'rhr':
      return '低于 50 或高于 100 标为需要关注。运动后测量不适用，请在备注标明。'
    case 'sleep':
      return '短于 6 小时或长于 9 小时标为偏离常见范围，不下结论。'
    case 'waist':
      return '男性 90 cm、女性 85 cm 及以上标为需要关注。未填性别时只显示数值。'
    case 'bmi':
      return '采用中国成人常用划分：低于 18.5 偏低，18.5–23.9 为参考范围，24.0–27.9 超重，28.0 及以上肥胖。'
    default:
      return ''
  }
}

export function round1(n) {
  return Math.round(Number(n) * 10) / 10
}

export function bmiValue(kg, heightCm) {
  if (!kg || !heightCm) return null
  const m = heightCm / 100
  return round1(kg / (m * m))
}

function hoursFromClock(bed, wake) {
  const [bh, bm] = bed.split(':').map(Number)
  const [wh, wm] = wake.split(':').map(Number)
  if ([bh, bm, wh, wm].some((n) => Number.isNaN(n))) return null
  let mins = wh * 60 + wm - (bh * 60 + bm)
  if (mins <= 0) mins += 24 * 60
  return round1(mins / 60)
}

export function prepareValues(metric, raw, profile) {
  const values = { ...raw }
  if (metric.id === 'weight') {
    values.kg = Number(values.kg)
    if (profile?.heightCm) values.heightCm = Number(profile.heightCm)
    const bmi = bmiValue(values.kg, values.heightCm)
    if (bmi) values.bmi = bmi
  }
  if (metric.id === 'sleep' && values.bed && values.wake) {
    const hours = hoursFromClock(values.bed, values.wake)
    if (hours != null) values.hours = hours
  }
  if (metric.id === 'glucose') values.mmol = Number(values.mmol)
  if (metric.id === 'steps') values.count = Math.round(Number(values.count))
  if (metric.id === 'water') values.ml = Math.round(Number(values.ml))
  if (metric.id === 'bp') {
    values.sbp = Math.round(Number(values.sbp))
    values.dbp = Math.round(Number(values.dbp))
    if (values.hr !== '' && values.hr != null) values.hr = Math.round(Number(values.hr))
    else delete values.hr
  }
  return values
}

export function validateRecord(metric, values, measuredAt, now = Date.now()) {
  const errors = []
  const t = new Date(measuredAt).getTime()
  if (Number.isNaN(t)) errors.push('测量时间不正确')
  else if (t > now + 5 * 60 * 1000) errors.push('测量时间不能晚于当前时间')
  const schema = formSchema(metric)
  for (const field of schema) {
    const value = values[field.key]
    const empty = value === '' || value == null || (Array.isArray(value) && value.length === 0)
    if (field.optional && empty) continue
    if (field.type === 'number') {
      const n = Number(value)
      if (empty || Number.isNaN(n)) errors.push(`请填写${field.label}`)
      else if (n < field.min || n > field.max) errors.push(`${field.label}超出可记录范围，请核对后再保存`)
    }
    if (field.type === 'select' && !field.options.some((o) => o.id === value)) errors.push(`请选择${field.label}`)
    if (field.type === 'textarea' && (empty || String(value).trim() === '')) errors.push(`请填写${field.label}`)
    if (field.type === 'textarea' && String(value || '').length > (field.max || 500)) errors.push(`${field.label}字数超出限制`)
  }
  if (metric.id === 'bp' && values.sbp && values.dbp && Number(values.sbp) <= Number(values.dbp)) {
    errors.push('收缩压需要大于舒张压')
  }
  if (metric.id === 'sleep' && !values.hours && !(values.bed && values.wake)) {
    errors.push('请填写睡眠时长，或填写入睡和起床时间')
  }
  if (values.note && String(values.note).length > 200) errors.push('备注请控制在 200 字以内')
  return errors
}

export function sceneLabel(scene) {
  return GLUCOSE_SCENES.find((s) => s.id === scene)?.label || ''
}

export function formatValue(metricId, values) {
  if (!values) return '—'
  switch (metricId) {
    case 'weight':
      return Number(values.kg).toFixed(1)
    case 'bmi':
      return values.bmi != null ? Number(values.bmi).toFixed(1) : '—'
    case 'waist':
      return round1(values.cm).toFixed(1)
    case 'bp':
      return `${values.sbp}/${values.dbp}`
    case 'rhr':
      return String(values.bpm)
    case 'glucose':
      return Number(values.mmol).toFixed(1)
    case 'temp':
      return Number(values.c).toFixed(1)
    case 'spo2':
      return String(Math.round(values.percent))
    case 'sleep':
      return Number(values.hours).toFixed(1)
    case 'water':
      return String(values.ml)
    case 'steps':
      return String(values.count)
    case 'symptom':
      return String(values.text || '').slice(0, 24)
    default:
      if (values.text) return String(values.text).slice(0, 24)
      if (values.value != null && values.value !== '') return String(values.value)
      return '—'
  }
}

export function numericOf(metricId, values) {
  switch (metricId) {
    case 'weight':
      return Number(values.kg)
    case 'bmi':
      return values.bmi == null ? null : Number(values.bmi)
    case 'waist':
      return Number(values.cm)
    case 'bp':
      return Number(values.sbp)
    case 'rhr':
      return Number(values.bpm)
    case 'glucose':
      return Number(values.mmol)
    case 'temp':
      return Number(values.c)
    case 'spo2':
      return Number(values.percent)
    case 'sleep':
      return Number(values.hours)
    case 'water':
      return Number(values.ml)
    case 'steps':
      return Number(values.count)
    default:
      return values.value == null || values.value === '' ? null : Number(values.value)
  }
}

export function evaluateRecord(metricId, values, profile = {}, goals = {}) {
  if (metricId === 'weight') {
    if (!values.heightCm) return { level: 'none', label: '补充身高后可计算 BMI' }
    return evaluateRecord('bmi', { bmi: values.bmi ?? bmiValue(values.kg, values.heightCm) }, profile, goals)
  }
  if (metricId === 'bmi') {
    const n = Number(values.bmi)
    if (!n) return { level: 'none', label: '资料不足，暂不计算' }
    if (n < 18.5) return { level: 'watch', label: '偏低' }
    if (n <= 23.9) return { level: 'ok', label: '在参考范围内' }
    if (n <= 27.9) return { level: 'watch', label: '超重' }
    return { level: 'high', label: '肥胖' }
  }
  if (metricId === 'bp') {
    const sbp = Number(values.sbp)
    const dbp = Number(values.dbp)
    if (sbp >= 180 || dbp >= 120) return { level: 'critical', label: '建议尽快就医' }
    if (sbp >= 140 || dbp >= 90) return { level: 'high', label: '偏高' }
    if (sbp < 90 || dbp < 60) return { level: 'watch', label: '偏低' }
    return applyGoal({ level: 'ok', label: '在参考范围内' }, sbp, goals.bp)
  }
  if (metricId === 'glucose') {
    const n = Number(values.mmol)
    if (n <= 3 || n >= 16.7) return { level: 'critical', label: '建议尽快就医' }
    const scene = values.scene
    if (scene === 'fasting') {
      if (n < 3.9) return { level: 'watch', label: '偏低' }
      if (n <= 6.1) return applyGoal({ level: 'ok', label: '在参考范围内' }, n, goals.glucose)
      if (n < 7) return { level: 'watch', label: '需要关注' }
      return { level: 'high', label: '偏高' }
    }
    if (scene === 'postprandial') {
      if (n < 3.9) return { level: 'watch', label: '偏低' }
      if (n < 7.8) return applyGoal({ level: 'ok', label: '在参考范围内' }, n, goals.glucose)
      if (n < 11.1) return { level: 'watch', label: '需要关注' }
      return { level: 'high', label: '偏高' }
    }
    if (n < 3.9) return { level: 'watch', label: '偏低' }
    if (n >= 11.1) return { level: 'high', label: '偏高' }
    return applyGoal({ level: 'ok', label: '在常见范围内' }, n, goals.glucose)
  }
  if (metricId === 'temp') {
    const n = Number(values.c)
    if (n >= 39) return { level: 'critical', label: '建议尽快就医' }
    if (n >= 37.3) return { level: 'high', label: '发热' }
    if (n < 35.5) return { level: 'watch', label: '偏低' }
    return { level: 'ok', label: '在常见范围内' }
  }
  if (metricId === 'spo2') {
    const n = Number(values.percent)
    if (n < 90) return { level: 'critical', label: '建议尽快就医' }
    if (n < 95) return { level: 'watch', label: '需要关注' }
    return { level: 'ok', label: '在参考范围内' }
  }
  if (metricId === 'rhr') {
    const n = Number(values.bpm)
    if (n < 50 || n > 100) return { level: 'watch', label: '需要关注' }
    return { level: 'ok', label: '在参考范围内' }
  }
  if (metricId === 'sleep') {
    const n = Number(values.hours)
    if (n < 6 || n > 9) return { level: 'watch', label: '偏离常见范围' }
    return { level: 'ok', label: '在常见范围内' }
  }
  if (metricId === 'waist') {
    const n = Number(values.cm)
    if (profile.gender === 'male') return n >= 90 ? { level: 'watch', label: '需要关注' } : { level: 'ok', label: '在参考范围内' }
    if (profile.gender === 'female') return n >= 85 ? { level: 'watch', label: '需要关注' } : { level: 'ok', label: '在参考范围内' }
    return { level: 'none', label: '' }
  }
  if (metricId === 'symptom') {
    if (CRISIS_PATTERN.test(String(values.text || ''))) return { level: 'critical', label: '建议立即求助' }
    return { level: 'none', label: '' }
  }
  const goal = goals[metricId]
  const n = numericOf(metricId, values)
  if (goal && n != null && ((goal.low != null && n < goal.low) || (goal.high != null && n > goal.high))) {
    return { level: 'watch', label: '超出我的目标' }
  }
  return { level: 'none', label: '' }
}

function applyGoal(status, n, goal) {
  if (!goal) return status
  if ((goal.low != null && n < goal.low) || (goal.high != null && n > goal.high)) {
    return status.level === 'ok' ? { level: 'watch', label: '超出我的目标' } : status
  }
  return status
}

export function crisisKeysForRecord(record) {
  const keys = []
  const values = record.values || {}
  if (record.metricId === 'bp' && (Number(values.sbp) >= 180 || Number(values.dbp) >= 120)) keys.push('bp')
  if (record.metricId === 'spo2' && Number(values.percent) < 90) keys.push('spo2')
  if (record.metricId === 'temp' && Number(values.c) >= 39) keys.push('temp')
  if (record.metricId === 'glucose' && (Number(values.mmol) <= 3 || Number(values.mmol) >= 16.7)) keys.push('glucose')
  if (CRISIS_PATTERN.test(`${values.text || ''} ${record.note || ''}`)) keys.push('symptom')
  return keys
}

export function crisisMessages(records, extraText = '') {
  const keys = new Set()
  for (const record of records) crisisKeysForRecord(record).forEach((k) => keys.add(k))
  if (CRISIS_PATTERN.test(extraText || '')) keys.add('symptom')
  return [...keys].map((k) => CRISIS_COPY[k])
}

export function deriveBmiRecords(weightRecords) {
  return weightRecords
    .filter((r) => r.values?.bmi != null)
    .map((r) => ({
      ...r,
      metricId: 'bmi',
      values: { bmi: r.values.bmi },
    }))
}

export function sumByDate(records, metricId, key) {
  const map = new Map()
  for (const record of records.filter((r) => r.metricId === metricId)) {
    map.set(record.localDate, (map.get(record.localDate) || 0) + Number(record.values[key] || 0))
  }
  return map
}

export function lifeTip(metricId) {
  return LIFE[metricId] || '继续按相同方式记录，后面更容易看出变化。'
}

export function trendThreshold(metricId) {
  switch (metricId) {
    case 'bp':
      return 5
    case 'weight':
    case 'bmi':
      return 0.4
    case 'glucose':
    case 'temp':
      return 0.3
    case 'sleep':
      return 0.5
    case 'spo2':
      return 1
    case 'rhr':
      return 5
    case 'waist':
      return 1
    default:
      return 0
  }
}
