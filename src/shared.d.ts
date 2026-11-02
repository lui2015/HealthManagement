declare module '@shared/metrics.js' {
  export const PRESET_METRICS: { id: string; name: string; unit: string; derived?: boolean }[]
  export const GLUCOSE_SCENES: { id: string; label: string }[]
  export const BODY_PARTS: { id: string; label: string }[]
  export const DEFAULT_TARGETS: { water: number; steps: number }
  export function formSchema(metric: MetricLike): FieldLike[]
  export function formatValue(metricId: string, values: Record<string, unknown>): string
  export function evaluateRecord(metricId: string, values: Record<string, unknown>, profile?: ProfileLike, goals?: GoalMap): { level: string; label: string }
  export function referenceHint(metricId: string, scene?: string): string
  export function sceneLabel(scene: string): string
  export function numericOf(metricId: string, values: Record<string, unknown>): number | null
  export function deriveBmiRecords<T>(records: T[]): T[]
  export function metricName(id: string, custom?: { id: string; name: string }[]): string
  export function crisisMessages(records: { metricId: string; values: Record<string, unknown>; note?: string }[], extraText?: string): string[]
}

declare module '@shared/habits.js' {
  export const HABIT_TEMPLATES: HabitTemplate[]
  export function isRequired(habit: HabitLike, iso: string): boolean
  export function checkinOn(habit: HabitLike, checkins: CheckinLike[], iso: string): CheckinLike | undefined
  export function isDone(habit: HabitLike, checkins: CheckinLike[], iso: string): boolean
  export function streakInfo(habit: HabitLike, checkins: CheckinLike[], today: string): { streak: number; pending: boolean }
  export function longestStreak(habit: HabitLike, checkins: CheckinLike[], today: string): number
  export function monthStats(habit: HabitLike, checkins: CheckinLike[], today: string): { due: number; done: number; makeup: number; rate: number }
  export function monthCalendar(habit: HabitLike, checkins: CheckinLike[], today: string): { iso: string; status: string }[]
}

declare module '@shared/dates.js' {
  export function addDays(iso: string, n: number): string
  export function weekday(iso: string): number
}

interface MetricLike {
  id: string
  name: string
  unit?: string
  kind?: string
  derived?: boolean
  active?: boolean
  min?: number | null
  max?: number | null
  step?: number
}
interface FieldLike {
  key: string
  label: string
  type: string
  unit?: string
  min?: number
  max?: number
  step?: number
  optional?: boolean
  maxLength?: number
  options?: { id: string; label: string }[]
}
interface ProfileLike {
  gender?: string
  heightCm?: number | string
}
interface GoalMap {
  [id: string]: { low?: number | null; high?: number | null; target?: number | null }
}
interface HabitTemplate {
  key: string
  name: string
  type: string
  target: number
  note: string
  repeat: string
  action: string
}
interface HabitLike {
  id: string
  type: string
  target?: number
  repeat?: string
  weekdays?: number[]
  createdLocalDate?: string
  archived?: boolean
  archivedLocalDate?: string
}
interface CheckinLike {
  habitId: string
  localDate: string
  done?: boolean
  count?: number
  makeup?: boolean
}
