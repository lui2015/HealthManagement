export function addDays(iso, n) {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + n)
  return dt.toISOString().slice(0, 10)
}

export function weekday(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

export function daysBetween(a, b) {
  const [ay, am, ad] = a.split('-').map(Number)
  const [by, bm, bd] = b.split('-').map(Number)
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000)
}

export function inMakeupWindow(iso, today) {
  return iso <= today && iso >= addDays(today, -2)
}

export function monthStart(iso) {
  return `${iso.slice(0, 7)}-01`
}

export function ageYears(birthDate, today) {
  if (!birthDate || !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) return null
  let age = Number(today.slice(0, 4)) - Number(birthDate.slice(0, 4))
  const md = today.slice(5)
  if (md < birthDate.slice(5)) age -= 1
  return age
}

export function ageBand(birthDate, today) {
  const age = ageYears(birthDate, today)
  if (age == null || age < 0 || age > 120) return null
  if (age < 18) return '18 岁以下'
  const decade = Math.floor(age / 10) * 10
  return `${decade}–${decade + 9} 岁`
}
