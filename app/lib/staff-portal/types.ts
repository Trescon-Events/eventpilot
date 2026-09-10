// Response shapes for the Staff Portal sync-export API (2026-09-10), as
// documented by the Staff Portal team. See app/lib/staff-portal/client.ts
// for the fetch/pagination helper and app/lib/staff-portal/run-sync.ts for
// how these get mapped into EventPilot's own tables.

export type StaffPortalUmbrella = {
  id: string
  name: string
  client_name: string | null
  start_date: string | null
  end_date: string | null
  status: string
  notes: string | null
  created_at: string
  updated_at: string
}

export type StaffPortalEvent = {
  id: string
  name: string
  project_code: string | null
  client_name: string | null
  project_type: string | null
  status: string
  start_date: string | null
  end_date: string | null
  currency: string | null
  budget: number | null
  umbrella_event_id: string | null
  umbrella_name: string | null
  project_manager_id: string | null
  project_manager_name: string | null
  project_coordinator_id: string | null
  project_coordinator_name: string | null
  description: string | null
  notes: string | null
  priority: string | null
  series_id: string | null
  created_at: string
  updated_at: string
}

export type StaffPortalStaff = {
  id: string
  full_name: string
  email: string
  employee_code: string | null
  department: string | null
  designation: string | null
  org_role: string | null
  company: string | null
  business_unit: string | null
  location: string | null
  hire_date: string | null
  is_active: boolean
  employment_stint: number | null
  reporting_manager_id: string | null
  phone: string | null
  address: string | null
  emergency_contact_name: string | null
  emergency_contact_phone: string | null
  work_mode: string | null
  skills: string[] | null
  is_management_overhead: boolean | null
  gender: string | null
  date_of_birth: string | null
  salutation: string | null
  blood_group: string | null
  timezone_override: string | null
  attendance_exempted: boolean | null
  timesheet_self_entry: boolean | null
  avatar_url: string | null
  notes: string | null
  previous_hire_date: string | null
  rehired_at: string | null
  created_at: string
  updated_at: string
}

export type StaffPortalRole = { user_id: string; role: string; created_at: string }

export type StaffPortalAssignment = {
  id: string
  project_id: string
  person_id: string
  role_type: string
  assignment_type: string | null
  assigned_date: string | null
  stint: number | null
  created_at: string
  updated_at: string
}

export type StaffPortalAllocation = {
  project_id: string
  staff_id: string
  role_id: string | null
  start_date: string | null
  end_date: string | null
  stint: number | null
}

export type StaffPortalTimesheet = {
  id: string
  staff_id: string
  project_id: string | null
  workstream_id: string | null
  workstream_item_id: string | null
  entry_date: string
  hours: number
  status: string // draft | submitted | approved | rejected | revoked
  is_holiday: boolean
  is_finalised: boolean
  task_description: string | null
  notes: string | null
  source: string | null
  stint: number | null
  submitted_at: string | null
  revoked_at: string | null
  revoke_reason: string | null
  created_at: string
  updated_at: string
}

export type StaffPortalLeaveBalance = {
  staff_id: string
  leave_type: string
  year_cycle: number | string
  total_entitled: number
  used: number
  opening_used: number | null
  carried_forward: number
  remaining: number | null
  expires_on: string | null
  sick_paid_used: number | null
  sick_half_used: number | null
  sick_unpaid_used: number | null
}
