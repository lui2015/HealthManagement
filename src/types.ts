export interface Profile {
  nickname: string
  birthDate: string
  gender: '' | 'female' | 'male' | 'undisclosed'
  heightCm: number | ''
  onboardingDone: boolean
}

export interface HealthRecord {
  id: string
  clientId?: string
  metricId: string
  measuredAt: string
  localDate: string
  values: Record<string, unknown>
  note: string
  source: string
  sourceReportId?: string
  sourceMissing?: boolean
  deletedAt: string | null
  pending?: boolean
}

export interface ReportItem {
  id: string
  name: string
  result: string
  unit: string
  refRange: string
  flag: string
}

export interface Report {
  id: string
  title: string
  examDate: string
  org: string
  type: string
  note: string
  status: string
  fileName: string
  mime: string
  size: number
  items: ReportItem[]
  createdAt: string
}

export interface AnalysisSection {
  heading: string
  body: string
}

export interface Evidence {
  type: string
  metricId?: string
  recordId?: string
  reportId?: string
  label: string
  detail: string
}

export interface Analysis {
  id: string
  title: string
  kind: string
  sections: AnalysisSection[]
  critical: string[]
  evidence: Evidence[]
  model: string
  createdAt: string
  messages: { role: string; content: string; at: string; critical?: string[] }[]
  versions?: { at: string }[]
}

export interface Habit {
  id: string
  name: string
  type: 'check' | 'count'
  target: number
  repeat: string
  weekdays: number[]
  reminders: string[]
  note: string
  action: string
  createdLocalDate: string
  archived?: boolean
  archivedLocalDate?: string
}

export interface Checkin {
  id: string
  habitId: string
  localDate: string
  count: number
  done: boolean
  makeup?: boolean
}

export interface UserData {
  id: string
  phone: string
  pendingDeletion: string | null
  profile: Profile
  aiConsent: boolean
  hiddenMetrics: string[]
  goals: Record<string, { low?: number | null; high?: number | null; target?: number | null }>
  customMetrics: { id: string; name: string; kind: string; unit: string; active: boolean; min?: number | null; max?: number | null }[]
  reminders: { metricId: string; weekdays: number[]; time: string }[]
  records: HealthRecord[]
  reports: Report[]
  analyses: Analysis[]
  habits: Habit[]
  checkins: Checkin[]
  favorites: string[]
  recentReads: { id: string; at: string }[]
  progress: Record<string, { status: string; at: string }>
  activeTopics: { id: string; startedAt: string }[]
  preferredCategories: string[]
  tip: { date: string; articleId: string; swaps: number } | null
  audit: { id: string; at: string; summary: string }[]
  analysisToday: number
  analysisLimit: number
}

export interface Article {
  id: string
  categoryId: string
  title: string
  summary: string
  source: string
  updatedAt: string
  minutes: number
  published?: boolean
  sections: { heading: string; paragraphs: string[] }[]
}

export interface Catalog {
  categories: { id: string; name: string }[]
  topics: { id: string; categoryId: string; title: string; summary: string; articleIds: string[] }[]
  articles: Article[]
}

export interface Meta {
  llmConfigured: boolean
  providerName: string
}
