import assert from 'node:assert/strict'
import { addDays } from '../shared/dates.js'
import { buildMetricAnalysis } from '../shared/analysis.js'
import { isDone, longestStreak, streakInfo } from '../shared/habits.js'
import { bmiValue, evaluateRecord, validateRecord } from '../shared/metrics.js'
import { mapItems, parseReportText } from '../shared/reportParse.js'

const bp = { id: 'bp', name: '血压' }
assert.ok(validateRecord(bp, { sbp: 120, dbp: 130 }, new Date().toISOString()).some((item) => item.includes('收缩压')))
assert.equal(validateRecord(bp, { sbp: 185, dbp: 110 }, new Date().toISOString()).length, 0)
assert.equal(evaluateRecord('bp', { sbp: 185, dbp: 110 }).level, 'critical')
assert.equal(evaluateRecord('glucose', { mmol: 5.6, scene: 'fasting' }).label, '在参考范围内')
assert.ok(validateRecord({ id: 'glucose' }, { mmol: 5.6 }, new Date().toISOString()).some((item) => item.includes('场景')))

const oldBmi = bmiValue(70, 170)
const nextBmi = bmiValue(70, 180)
assert.notEqual(oldBmi, nextBmi)
assert.equal(evaluateRecord('weight', { kg: 70, heightCm: 170, bmi: oldBmi }).label, evaluateRecord('bmi', { bmi: oldBmi }).label)

const habit = { id: 'h', type: 'check', repeat: 'daily', createdLocalDate: '2026-10-27', archived: false }
const done = (date) => ({ habitId: 'h', localDate: date, done: true, count: 1 })
const checkins = [done('2026-10-27'), done('2026-10-28'), done('2026-10-29')]
assert.equal(streakInfo(habit, checkins, '2026-11-02').pending, true)
assert.equal(streakInfo(habit, checkins, '2026-11-02').streak, 0)

const recent = [done('2026-10-31'), done('2026-11-01'), done('2026-11-02')]
assert.equal(streakInfo(habit, recent, '2026-11-02').streak, 3)
assert.equal(streakInfo(habit, recent, '2026-11-02').pending, false)
assert.equal(longestStreak(habit, checkins, '2026-11-02'), 3)

const weekdayHabit = { id: 'w', type: 'check', repeat: 'weekdays', weekdays: [1, 2, 3, 4, 5], createdLocalDate: '2026-10-27' }
const weekdayChecks = [done('2026-10-29'), done('2026-10-30')].map((item) => ({ ...item, habitId: 'w' }))
assert.equal(isDone(weekdayHabit, weekdayChecks, '2026-10-30'), true)
const weekdayStreak = streakInfo(weekdayHabit, weekdayChecks, '2026-11-02')
assert.equal(weekdayStreak.pending, true)
assert.equal(weekdayStreak.streak, 2)

const parsed = parseReportText('空腹血糖 5.6 mmol/L 3.9-6.1\n收缩压：128 mmHg')
assert.equal(parsed[0].name, '空腹血糖')
assert.equal(parsed[0].result, '5.6')
assert.equal(mapItems(parsed.map((item, index) => ({ ...item, id: String(index) }))).mapped[0].values.scene, 'fasting')

const analysis = buildMetricAnalysis({
  records: [
    { id: 'a', metricId: 'bp', localDate: '2026-10-20', measuredAt: '2026-10-20T00:00:00.000Z', values: { sbp: 120, dbp: 80 }, deletedAt: null },
    { id: 'b', metricId: 'bp', localDate: '2026-11-02', measuredAt: '2026-11-02T00:00:00.000Z', values: { sbp: 185, dbp: 110 }, deletedAt: null },
  ],
  customMetrics: [],
}, { metricIds: ['bp'], start: '2026-10-01', end: '2026-11-02' })
assert.ok(analysis.critical[0].includes('180'))
assert.ok(analysis.sections[0].body.includes('185'))
assert.equal(addDays('2026-11-02', -2), '2026-10-31')

console.log('logic tests passed')
