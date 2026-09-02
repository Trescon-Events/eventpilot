export type TaskStatus = 'Not-Started' | 'In-Progress' | 'Completed'
export type TaskPriority = 'High' | 'Medium' | 'Low'

export type StaffLite = {
  id: string
  name: string
  email?: string
  department?: string
  role?: string
  account_type?: 'internal' | 'vendor'
  vendor_label?: string | null
}
export type EventLite = { id: string; name: string }
export type VendorContact = { id: string; vendor_staff_id: string; name: string; active: boolean }

export function isBrandingStaff(s: StaffLite): boolean {
  const dept = (s.department || '').toLowerCase().trim()
  const role = (s.role || '').toLowerCase().trim()
  if (!dept && !role) return false
  return (
    dept.includes('brand') ||
    dept.includes('design') ||
    dept.includes('creative') ||
    dept.includes('marketing') ||
    role.includes('brand') ||
    role.includes('design') ||
    role.includes('graphic') ||
    role.includes('video') ||
    role.includes('ui') ||
    role.includes('ux') ||
    role.includes('creative') ||
    role.includes('visual')
  )
}

export type Task = {
  id: string
  event_id: string | null
  event: EventLite | null
  description: string
  assigned_by: string
  assigned_to: string
  assigned_by_staff: StaffLite | null
  assigned_to_staff: StaffLite | null
  assigned_contact_id?: string | null
  assigned_contact?: { id: string; name: string } | null
  assigned_date: string
  deadline: string | null
  status: TaskStatus
  priority: TaskPriority
  remarks: string | null
  tracked_seconds: number
  last_overdue_notified_at?: string | null
  overdue_reminder_count?: number
  created_at: string
  updated_at: string
}

export type StaffWithTimezone = StaffLite & {
  aad_object_id?: string | null
  office_timezone?: string
  working_days?: number[]
}

export type OverdueTaskDigestItem = {
  task: Task
  daysOverdue: number
  isAssignee: boolean
}

export const STATUSES: TaskStatus[] = ['Not-Started', 'In-Progress', 'Completed']
export const PRIORITIES: TaskPriority[] = ['High', 'Medium', 'Low']

export const STATUS_COLOR: Record<TaskStatus, 'teal' | 'purple' | 'grey'> = {
  'Not-Started': 'grey',
  'In-Progress': 'purple',
  'Completed': 'teal',
}

export const PRIORITY_COLOR: Record<TaskPriority, 'red' | 'amber' | 'grey'> = {
  High: 'red',
  Medium: 'amber',
  Low: 'grey',
}

export type TaskSaveValues = {
  id?: string
  event_id: string | null
  description: string
  assigned_by: string
  assigned_to: string
  assigned_contact_id: string | null
  deadline: string | null
  priority: TaskPriority
  remarks: string | null
}

export const CATEGORIES = ['Design', 'Development', 'Meeting', 'Research', 'Review', 'Other'] as const
export type LogCategory = typeof CATEGORIES[number]

export const CATEGORY_COLOR: Record<LogCategory, 'grey' | 'purple' | 'teal' | 'red' | 'amber'> = {
  Design: 'purple',
  Development: 'teal',
  Meeting: 'amber',
  Research: 'grey',
  Review: 'red',
  Other: 'grey',
}

export type TimeLog = {
  id: string
  task_id: string
  task: { id: string; description: string } | null
  staff_id: string
  staff: StaffLite | null
  category: LogCategory | null
  description: string | null
  manual_entry: boolean
  log_date: string
  start_time: string
  end_time: string | null
  duration_seconds: number | null
  created_at: string
}

export type ActiveTimer = {
  task_id: string
  task_description: string
  start_time: string
} | null

export function formatHours(seconds: number): string {
  const hrs = seconds / 3600
  return hrs === 0 ? '0h' : `${hrs.toFixed(hrs < 10 ? 1 : 0)}h`
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h === 0) return `${m}m`
  return `${h}h ${m}m`
}

export function formatClock(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`
}

export function formatTimeTaken(seconds: number): string {
  if (!seconds || seconds <= 0) return '< 15m'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}
