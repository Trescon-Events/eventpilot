import type { ReactNode } from 'react'

/*
  Single source of truth for "what modules/tools exist in EventPilot."
  Ported 1:1 from app/components/PlatformMenu.tsx's buildSections() and
  app/admin/toolkit/page.tsx's TOOLS array — same copy, same icons, same
  visibility rules as before. This file is imported directly by client
  components (PlatformMenu, the Toolkit hub) for rendering, so it must
  never import anything server-only (no supabaseAdmin, no service-role
  client) — access CHECKING logic lives in ./access.ts instead.

  A few modules are shown under different titles/gating depending on which
  surface renders them today (e.g. /hr is "HR Admin", admin-only, in
  PlatformMenu, but "HR Portal", grant-or-admin, in the Toolkit hub) — that
  divergence already existed before this registry; it's preserved via the
  optional per-surface overrides below rather than silently picked one way.
*/

export type ModuleAccess =
  | { kind: 'always' }                                        // any authenticated user
  | { kind: 'admin_only'; grantKey?: string; moduleAccessKey?: string }
  | { kind: 'module_access'; moduleKey: string; minTier: 'user' | 'admin' }
  | { kind: 'tool_grant'; grantKey: string | null; moduleAccessKey?: string }
    // null grantKey = admin-only, no grant key (matches TOOL_GRANT_KEY convention).
    // moduleAccessKey, when set, is the module_access.module_key this tool ALSO
    // accepts as sufficient for entry — i.e. granting someone a tier (user or
    // admin) via this tool's own Settings→Access tab is enough to get in, not
    // just the People-module tool_grants toggle. Not always equal to `key`
    // (docuhub's module_access rows use 'dochub', a pre-existing DB naming
    // mismatch) — set explicitly per module, never derived from `key`.
  | { kind: 'role_or_admin'; roles: string[] }                 // e.g. hr access_roles
  | { kind: 'dept_or_admin'; dept: string; grantKey?: string }  // e.g. Marketing dept
  | { kind: 'role_or_dept_or_admin'; roles: string[]; dept: string; grantKey?: string }  // e.g. finance role OR Finance dept OR admin
  | { kind: 'role_or_dept_not_admin'; roles: string[]; dept: string } // same, but admins see a separate Administration-section tile instead
  | { kind: 'has_reports_or_admin' }
  // `grantKey`, where present on admin_only / dept_or_admin / role_or_dept_or_admin,
  // is purely ADDITIVE — a tool_grants.<key> === true (or, once wired, a
  // module_access row) grants entry on TOP OF the existing role/dept/admin
  // condition, never replacing or narrowing it. Lets the People-module
  // "Tool Permissions" drawer (or a tool's own Settings→Access tab) grant a
  // specific person access without changing their role or department.

export type ModuleHrefCtx = { staffId?: string; eventId?: string }

type Feature = { icon: string; label: string; detail: string }

export type ModuleDef = {
  key: string
  label: string
  description: string
  icon: ReactNode
  color: string
  href: string | ((ctx: ModuleHrefCtx) => string)
  needsEvent?: boolean
  access: ModuleAccess

  platformMenu?: {
    section: string
    label?: string
    description?: string
    color?: string
    access?: ModuleAccess
  }
  toolkitHub?: {
    category: string
    badge: string
    features?: Feature[]
    label?: string
    description?: string
    color?: string
    /** The Toolkit hub's original tool id, when it differs from `key` (e.g. 'hr' here vs legacy 'hr-portal') —
     *  ResumeSidebar's draft-resume feature matches saved drafts against this exact legacy id, so it must be
     *  preserved rather than silently changed to the registry key. */
    legacyId?: string
    access?: ModuleAccess
  }

  /**
   * Override for AppShellNav's own page-badge rendering, when it differs
   * from the PlatformMenu tile appearance (top-level icon/color/label).
   * This genuinely happens in the pre-existing code — e.g. Chat's own nav
   * badge is a teal chat-bubble (MOD_TRESCI) while its "Talk to Pilot"
   * PlatformMenu tile is a purple bolt; KB's page badge is grey while its
   * menu tile is teal-blue. Falls back to the top-level fields if omitted.
   */
  pageBadge?: {
    icon?: ReactNode
    color?: string
    label?: string
  }

  /**
   * Breadcrumb derivation hints — only needed for the handful of entries
   * whose `href` is a ctx-function AND whose PATH (not just querystring)
   * varies at runtime, e.g. event-scoped tools. Most ctx-function entries
   * (dashboard, messages, etc.) only vary the querystring, so plain
   * pathname-prefix matching against `href({})` already works for those —
   * see app/lib/nav/breadcrumbs.ts.
   */
  /** Path template with `:param` placeholders, matched against the current
   *  pathname segment-by-segment (e.g. '/admin/events/:eventId/website'). */
  breadcrumbPattern?: string
  /** Registry key of this entry's breadcrumb ancestor — a single explicit
   *  hop, used when the pattern's own path can't be prefix-matched to find
   *  one automatically. */
  breadcrumbParent?: string
}

/* ── Shared icons (kept identical to PlatformMenu.tsx / NavBar.tsx) ── */
const I = {
  dashboard: <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>,
  library: <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>,
  message: <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>,
  bolt: <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
  doc: <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>,
  docLines: <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>,
  people: <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  clock: <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
  grid: <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>,
  bank: <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>,
  pen: <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
  check: <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>,
  boat: <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>,
  target: <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>,
  layers: <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>,
  gear: <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
  wrench: <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>,
  browser: <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M3 9h18M9 21V9"/></svg>,
}

export function getModuleRegistry(): ModuleDef[] {
  return [
    /* ── Learning ── */
    {
      key: 'dashboard', label: 'My Dashboard',
      description: 'Your AI Readiness Score, learning track, and recommended courses',
      icon: I.dashboard, color: '#009D8D',
      href: ctx => ctx.staffId ? `/dashboard?id=${ctx.staffId}` : '/dashboard',
      access: { kind: 'always' },
      platformMenu: { section: 'Learning' },
    },
    {
      key: 'course-library', label: 'Course Library',
      description: 'Browse all published courses across every tier and department',
      icon: I.library, color: '#5A9E00',
      href: ctx => ctx.staffId ? `/dashboard/library?id=${ctx.staffId}` : '/dashboard/library',
      access: { kind: 'always' },
      platformMenu: { section: 'Learning' },
    },
    {
      key: 'ai-community', label: 'AI Community',
      description: 'Share prompts, use cases, and automation ideas with your team',
      icon: <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>,
      color: '#F15516',
      href: ctx => ctx.staffId ? `/community?id=${ctx.staffId}` : '/community',
      access: { kind: 'always' },
      platformMenu: { section: 'Learning' },
    },
    {
      key: 'pilot-ai', label: 'Talk to Pilot',
      description: 'AI assistant for learning questions and course guidance',
      icon: I.bolt, color: '#A478FF',
      href: '/chat',
      access: { kind: 'always' },
      platformMenu: { section: 'Learning' },
      // /chat's own nav badge (MOD_TRESCI) is a teal chat-bubble, not this
      // tile's purple bolt — a genuine pre-existing divergence, not a bug.
      pageBadge: { icon: I.message, color: '#00A5A3', label: 'Pilot AI' },
    },

    /* ── Team & Organisation ── */
    {
      key: 'my-hr', label: 'My HR',
      description: 'Leave requests, attendance, event assignments and your HR records',
      icon: I.people, color: '#EC4899',
      href: '/my-hr',
      access: { kind: 'always' },
      platformMenu: { section: 'Team & Organisation' },
      // /my-hr's own nav badge uses MOD_PEOPLE (green), not this tile's pink.
      pageBadge: { color: '#5A9E00', label: 'People & Org' },
    },
    {
      key: 'timesheets', label: 'Timesheets',
      description: 'Log daily hours per event or project, view weekly summaries and approvals',
      icon: I.clock, color: '#0291DB',
      href: '/timesheets',
      access: { kind: 'always' },
      platformMenu: { section: 'Team & Organisation' },
      toolkitHub: {
        category: 'Operations', badge: 'Operations',
        description: 'Staff log daily hours per event or project. Managers approve submissions. Approved hours automatically calculate staff cost per event and feed into the Commercial P&L.',
        features: [
          { icon: '◷', label: 'Daily time logging', detail: 'Staff log hours by event, project, or internal task — with notes' },
          { icon: '◉', label: 'Manager approval', detail: 'Managers review and approve/reject team timesheets weekly' },
          { icon: '▰', label: 'Utilisation tracking', detail: 'See billable vs internal vs bench time per staff and department' },
          { icon: '◈', label: 'P&L integration', detail: 'Approved hours x salary rate = staff cost per event, auto-fed to Commercial P&L' },
        ],
      },
    },
    {
      key: 'team-dashboard', label: 'Team Dashboard',
      description: 'AIRS overview, completion rates, and progress for your direct team',
      icon: I.people, color: '#A172F2',
      href: ctx => ctx.staffId ? `/team?manager_id=${ctx.staffId}&staff_id=${ctx.staffId}` : '/team',
      access: { kind: 'has_reports_or_admin' },
      platformMenu: { section: 'Team & Organisation' },
      // /team's own nav badge uses MOD_PEOPLE (green), not this tile's purple.
      pageBadge: { color: '#5A9E00', label: 'People & Org' },
    },
    {
      key: 'hr', label: 'HR Portal',
      description: 'Complete human resources management — staff directory, recruitment pipeline with AI screening, leave management, attendance tracking, onboarding/offboarding workflows, and HR alerts.',
      icon: I.grid, color: '#A172F2',
      href: '/hr',
      access: { kind: 'admin_only' },
      // PlatformMenu only ever showed this to admins ("HR Admin"); the
      // Toolkit hub shows it to admins OR anyone with the hr_portal grant.
      // Both preserved as-is rather than silently unified.
      platformMenu: { section: 'Team & Organisation', label: 'HR Admin', description: 'Leave approvals, onboarding, offboarding and org management', color: '#E95391' },
      toolkitHub: {
        category: 'Operations', badge: 'Operations', legacyId: 'hr-portal', access: { kind: 'tool_grant', grantKey: 'hr_portal', moduleAccessKey: 'hr' },
        features: [
          { icon: '◉', label: 'Staff directory & profiles', detail: 'Full employee profiles with 11 tabs — attendance, salary, documents, assets, performance' },
          { icon: '⊞', label: 'Recruitment pipeline', detail: 'Job requisitions, AI-scored applications, structured interviews, automated hire-to-onboard' },
          { icon: '◷', label: 'Leave & attendance', detail: 'Leave requests with approval, daily attendance tracking, WFH monitoring' },
          { icon: '≡', label: 'Onboarding & offboarding', detail: 'Template-based checklists, 30-day plans, exit management with knowledge transfer' },
        ],
      },
    },

    /* ── Finance ── */
    {
      key: 'finance', label: 'Finance Portal',
      description: 'Salary, expenses, vendor payments and payroll',
      icon: I.bank, color: '#3D8EEA',
      href: '/finance',
      access: { kind: 'role_or_dept_or_admin', roles: ['finance'], dept: 'Finance' },
      // Non-admins with finance access see this under "Finance". Admins see
      // a separate tile under "Administration" instead (finance-admin,
      // below) with slightly different copy — matches the original code's
      // two distinct PlatformSection entries for the same href.
      platformMenu: { section: 'Finance', access: { kind: 'role_or_dept_not_admin', roles: ['finance'], dept: 'Finance' } },
      toolkitHub: {
        category: 'Finance', badge: 'Finance', legacyId: 'finance-portal', access: { kind: 'tool_grant', grantKey: 'finance', moduleAccessKey: 'finance' },
        description: 'Central finance hub — salary management, expense claim approvals, vendor invoice tracking, and monthly payroll summaries with department breakdowns.',
        features: [
          { icon: '◈', label: 'Salary & compensation', detail: 'Enter and revise staff salaries, bulk CSV import, payroll grade management' },
          { icon: '◉', label: 'Expense claims', detail: 'Review and approve staff expense submissions by category and event' },
          { icon: '⊞', label: 'Vendor payments', detail: 'Track vendor invoices — pending, approved, paid, overdue with due date alerts' },
          { icon: '▣', label: 'Payroll summary', detail: 'Monthly payroll overview — salaries + expenses by department and staff' },
        ],
      },
    },

    /* ── Content & Marketing ── */
    {
      key: 'content', label: 'Content Hub',
      description: 'Create and manage social media campaigns across all events',
      icon: I.pen, color: '#A78BFA',
      href: '/content',
      access: { kind: 'dept_or_admin', dept: 'Marketing' },
      platformMenu: { section: 'Content & Marketing' },
      toolkitHub: {
        category: 'Data', badge: 'Marketing', label: 'Content Engine', color: '#F59E0B', legacyId: 'outreach', access: { kind: 'tool_grant', grantKey: 'content', moduleAccessKey: 'content' },
        description: 'AI-powered social media and article generation, visual content calendar, direct publishing to LinkedIn, Meta, and X — with manager approval before anything goes live.',
        features: [
          { icon: '✎', label: 'AI content generation', detail: 'Social posts + long-form articles generated from your event brief and brand voice' },
          { icon: '◷', label: 'Visual content calendar', detail: 'Drag-and-drop calendar to schedule and reschedule posts across platforms' },
          { icon: '▰', label: 'Multi-platform publishing', detail: 'Direct publish to LinkedIn, Facebook, Instagram, X — with scheduled auto-publishing' },
          { icon: '◉', label: 'Approval workflow', detail: 'Manager reviews and approves content before it goes live. Email notifications on approve/reject' },
        ],
      },
    },
    {
      key: 'content-approvals', label: 'Approval Queue',
      description: 'Review and approve posts submitted by the marketing team',
      icon: I.check, color: '#05A070',
      href: '/content?tab=approvals',
      access: { kind: 'has_reports_or_admin' },
      platformMenu: { section: 'Content & Marketing' },
    },

    /* ── Communication ── */
    {
      key: 'messages', label: 'Messages',
      description: 'Send and receive messages with your team',
      icon: I.message, color: '#3D8EEA',
      href: ctx => `/messages?id=${ctx.staffId ?? ''}`,
      access: { kind: 'always' },
      platformMenu: { section: 'Communication' },
    },

    /* ── Data Intelligence ── */
    {
      key: 'data-extract', label: 'Lead Extraction',
      description: 'Extract companies from files, URLs, or websites',
      icon: I.boat, color: '#00A5A3',
      href: '/data/extract/file',
      access: { kind: 'always' },
      platformMenu: { section: 'Data Intelligence' },
      toolkitHub: {
        category: 'Data', badge: 'Data Intelligence', label: 'Smart Data', legacyId: 'smart-data', access: { kind: 'tool_grant', grantKey: 'smart_data', moduleAccessKey: 'data-extract' },
        description: 'Your full B2B intelligence pipeline. Extract leads from any source, enrich them with LinkedIn and Apollo data, verify every email, and manage your contact database — all from one place.',
        features: [
          { icon: '↓', label: 'File & URL extraction', detail: 'Upload CSVs, PDFs or paste a URL — contacts pulled instantly' },
          { icon: '◈', label: 'LinkedIn & Apollo enrichment', detail: 'Job titles, companies, LinkedIn profiles and contact details' },
          { icon: '◉', label: 'Email verification', detail: 'Bulk verify deliverability before any outreach campaign' },
          { icon: '⊞', label: 'Contact database', detail: 'Unified B2B database with tagging, filtering and CSV export' },
        ],
      },
    },
    {
      key: 'data-contacts', label: 'Contacts & Companies',
      description: 'Search, enrich, and manage your full B2B database',
      icon: I.people, color: '#7A7DF3',
      href: '/data/contacts',
      access: { kind: 'always' },
      platformMenu: { section: 'Data Intelligence' },
    },
    {
      key: 'lead-finder', label: 'Lead Finder AI',
      description: 'Describe your ICP and let AI find and score matching leads',
      icon: I.target, color: '#F59E0B',
      href: '/data/lead-finder',
      access: { kind: 'always' },
      platformMenu: { section: 'Data Intelligence' },
    },

    /* ── Pilot Projects ──
       NOTE: PlatformMenu's original comment claimed this is "shown when user
       is in any pilot project" but the code never actually checked
       pilot_project_members — it was pushed unconditionally for every user.
       Preserved as-is (access: always) per Phase 1's port-1:1 rule; flagged
       here as a known pre-existing discrepancy, not fixed in this pass. */
    {
      key: 'my-pilots', label: 'My Pilot Projects',
      description: 'View your assigned Pilot Projects and complete your pre-build checklist',
      icon: I.layers, color: '#A172F2',
      href: '/pilots',
      access: { kind: 'always' },
      platformMenu: { section: 'Pilot Projects' },
    },

    /* ── Administration (PlatformMenu, admin-only) ── */
    {
      key: 'admin-pilots', label: 'Pilot Projects',
      description: 'Track all Pilot Projects — checklists, build status, responsible Pilots',
      icon: I.layers, color: '#A172F2',
      href: '/admin/pilots',
      access: { kind: 'admin_only' },
      platformMenu: { section: 'Administration' },
    },
    {
      key: 'admin', label: 'Admin Dashboard',
      description: 'Manage staff, run imports, view org-wide AI readiness',
      icon: I.gear, color: '#5A9E00',
      href: '/admin',
      access: { kind: 'admin_only' },
      platformMenu: { section: 'Administration' },
      // The Admin Dashboard's own nav badge has always shown a 2x2-square
      // grid icon + "Platform Admin" (teal), not the gear/#3D6B00 used for
      // its PlatformMenu tile — a genuine pre-existing divergence, same
      // pattern as kb/my-hr/team-dashboard/pilot-ai above.
      pageBadge: {
        color: '#009D8D', label: 'Platform Admin',
        icon: <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>,
      },
    },
    // The next three entries exist purely to give the breadcrumb resolver
    // (app/lib/nav/breadcrumbs.ts) an accurate parent chain for the Access
    // & Permissions hub and its pages (2026-08-16, per Madhu: the trail
    // was showing "Admin Dashboard > Access Center" with no "People" step,
    // even though every real path there goes through the People tab).
    // 'admin-people' never renders in any menu (a plain-string href with a
    // query param doesn't prefix-match anything else, so it can't become
    // any OTHER page's "deepest" match either) — it exists solely to be
    // walked via breadcrumbParent, same "page-badge-only" pattern already
    // used by eventpilot/insights/admin-reviews above.
    {
      key: 'admin-people', label: 'People',
      description: 'Staff directory, roles, and tool access — a tab of the Admin Dashboard, not its own route.',
      icon: I.gear, color: '#12C9BD',
      href: '/admin?tab=people',
      access: { kind: 'admin_only' },
      breadcrumbParent: 'admin',
    },
    {
      key: 'admin-access-center', label: 'Access & Permissions',
      description: 'Index of every access-management surface — platform, per-tool, and per-event.',
      icon: I.gear, color: '#12C9BD',
      href: '/admin/access-center',
      access: { kind: 'admin_only' },
      breadcrumbParent: 'admin-people',
    },
    {
      key: 'admin-org-wide-access', label: 'Organization-Wide Access',
      description: 'Assign a role across every event at once, and map Staff Portal role types to auto-grant access.',
      icon: I.gear, color: '#12C9BD',
      href: '/admin/access',
      access: { kind: 'admin_only' },
      breadcrumbParent: 'admin-access-center',
    },
    {
      key: 'finance-admin', label: 'Finance Portal',
      description: 'Salary, expenses, vendor payments, payroll and Commercial P&L',
      icon: I.bank, color: '#3D8EEA',
      href: '/finance',
      access: { kind: 'admin_only' },
      platformMenu: { section: 'Administration' },
    },
    {
      key: 'branding-fonts', label: 'Font Library',
      description: 'Platform-wide brand fonts for stakeholder announcement creatives — upload or fetch from Google Fonts.',
      icon: I.layers, color: '#A172F2',
      href: '/admin/branding/fonts',
      access: { kind: 'admin_only' },
      platformMenu: { section: 'Administration' },
    },
    {
      key: 'email-templates', label: 'Email Templates',
      description: 'Workspace-level email templates — rich-text editor, AI rewrite, and "send as" delivery via Microsoft Graph.',
      icon: I.message, color: '#F16A7A',
      href: '/admin/email-templates',
      access: { kind: 'admin_only' },
      platformMenu: { section: 'Administration' },
    },
    {
      key: 'form-templates', label: 'Form Templates',
      description: 'Default onboarding form fields for speakers, sponsors, and partners — applies to every event unless customized per event.',
      icon: I.doc, color: '#3FAE8C',
      href: '/admin/form-templates',
      access: { kind: 'admin_only' },
      platformMenu: { section: 'Administration' },
    },
    {
      key: 'toolkit', label: 'Toolkit',
      description: 'Smart Data, Website Builder, Market Intelligence, Brand Studio, Outreach and TresAgent',
      icon: I.wrench, color: '#009C89',
      href: '/admin/toolkit',
      access: { kind: 'admin_only' },
      platformMenu: { section: 'Administration' },
    },
    {
      key: 'site-builder', label: 'Site Builder',
      description: 'Pick an event and a template — Event Pilot creates the GitHub repo and deploys the site automatically.',
      icon: I.browser, color: '#0493E2',
      href: '/admin/sites',
      access: { kind: 'admin_only' },
      platformMenu: { section: 'Administration' },
    },
    {
      key: 'changelog', label: "What's Fixed",
      description: 'See all reported issues and what the team has resolved',
      icon: I.check, color: '#05A070',
      href: '/changelog',
      access: { kind: 'admin_only' },
      platformMenu: { section: 'Administration' },
    },
    {
      key: 'docs', label: 'Platform Docs',
      description: 'Internal documentation — scoring guide, playbook, questionnaire',
      icon: I.docLines, color: '#5E8FC2',
      href: '/docs',
      access: { kind: 'admin_only' },
      platformMenu: { section: 'Administration' },
    },

    /* ── Toolkit-only: Knowledge ──
       Moved out of PlatformMenu (formerly Learning/Team & Organisation,
       access: 'always') into Toolkit-only, tool_grant-gated tools — per
       Madhu's 15 Jul redesign request. Real pages live nested under
       /admin/toolkit/knowledge-base and /admin/toolkit/docuhub now (see
       their layout.tsx server-side access gates), not the old top-level
       /knowledge and /docuhub — those paths now 404 without the middleware
       redirect that forwards them here. Note: these grantKeys are
       deliberately distinct token strings from module_access.module_key
       ('kb' / 'dochub', a separate table governing what a granted user can
       DO once inside — e.g. KB admin tier — not whether they can enter at
       all). Registry `key` stays 'kb'/'docuhub' unchanged so isKbAdmin(),
       AppShellNav pageBadges, and other existing 'kb'/'docuhub' references
       don't need to change. */
    {
      key: 'kb', label: 'Knowledge Base',
      description: 'Browse company policies, past event reports, and reference documents — plus ingest new documents and manage BD proposal intelligence.',
      icon: I.dashboard, color: '#1296BA',
      href: '/admin/toolkit/knowledge-base',
      access: { kind: 'tool_grant', grantKey: 'knowledge_base', moduleAccessKey: 'kb' },
      // The page's own nav badge (formerly MOD_KNOWLEDGE) is grey, not the
      // tile's teal-blue — a genuine pre-existing divergence, preserved.
      pageBadge: { color: '#5591BE' },
      toolkitHub: {
        category: 'Knowledge', badge: 'Knowledge',
        description: 'Company knowledge base — policies, past event reports, and BD proposal intelligence, with a self-learning ingest pipeline and admin console for document review.',
        features: [
          { icon: '◉', label: 'Search & browse documents', detail: 'Company policies, past event reports, and reference documents, filterable by department' },
          { icon: '↓', label: 'Document ingest', detail: 'Upload a document — AI classifies, summarises, and flags gaps before publishing' },
          { icon: '◈', label: 'BD proposal intelligence', detail: 'Structured proposal workspace per client, feeding the Knowledge Assistant' },
          { icon: '≡', label: 'Version history', detail: 'Every published revision stays downloadable, with a full change log' },
        ],
      },
    },
    {
      key: 'docuhub', label: 'DocuHub',
      description: 'Upload and share post-event reports, proposals, and policies with a permanent link',
      icon: <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>,
      color: '#D97706',
      href: '/admin/toolkit/docuhub',
      access: { kind: 'tool_grant', grantKey: 'docuhub', moduleAccessKey: 'dochub' },
      toolkitHub: {
        category: 'Knowledge', badge: 'Knowledge',
        description: 'Upload and share post-event reports, proposals, and policies with a permanent link — with per-document access control and a full audit log.',
        features: [
          { icon: '↓', label: 'Upload & bulk upload', detail: 'Single or batch document upload, tagged by type and client' },
          { icon: '⊙', label: 'Permanent links', detail: 'Every document gets a stable, shareable link that never breaks' },
          { icon: '◉', label: 'Access control', detail: 'Grant view/edit access per person, per document type' },
          { icon: '≡', label: 'Audit log', detail: 'Every view, edit, and download tracked for compliance' },
        ],
      },
    },
    {
      key: 'knowledge-assistant', label: 'Knowledge Assistant',
      description: 'AI assistant that answers questions about company knowledge — proposals, policies, and past event reports — grounded only in ingested documents.',
      icon: I.bolt, color: '#0899BC',
      href: '/admin/toolkit/knowledge-assistant',
      access: { kind: 'tool_grant', grantKey: 'knowledge_assistant', moduleAccessKey: 'knowledge-assistant' },
      toolkitHub: {
        category: 'Knowledge', badge: 'Knowledge',
        features: [
          { icon: '◈', label: 'Grounded Q&A', detail: 'Answers only from ingested Knowledge Base and DocuHub documents — no guessing' },
          { icon: '◉', label: 'BD proposal recall', detail: 'Ask about any client, event platform, or past proposal by name' },
          { icon: '◷', label: 'Daily usage cap', detail: '20 messages a day per person, unlimited for super admins' },
        ],
      },
    },

    /* ── Toolkit-only: Event Tools ── */
    {
      key: 'website-builder', label: 'Website Builder',
      description: 'Build and publish fully custom event websites end-to-end. Start from a template, design every section, load your brand, and go live with a single click — including custom domain via Cloudflare.',
      icon: I.wrench, color: '#009D8D',
      href: ctx => `/admin/events/${ctx.eventId}/website`,
      needsEvent: true,
      breadcrumbPattern: '/admin/events/:eventId/website', breadcrumbParent: 'toolkit',
      access: { kind: 'tool_grant', grantKey: 'website_builder', moduleAccessKey: 'website-builder' },
      toolkitHub: {
        category: 'Events', badge: 'Event Tool',
        features: [
          { icon: '◻', label: 'Drag-and-drop section builder', detail: 'Hero, stats, speakers, agenda, sponsors, media and more' },
          { icon: '◈', label: 'Brand system', detail: 'Logos, colour palette, fonts — applied across the whole site' },
          { icon: '▣', label: 'Live preview', detail: 'See your site on desktop, tablet and mobile before publishing' },
          { icon: '⊙', label: 'Custom domain', detail: 'Automated Cloudflare DNS — domain live in under a minute' },
          { icon: '◷', label: 'Draft & publish versioning', detail: 'Edit safely. Live site stays untouched until you publish. One-click rollback.' },
        ],
      },
    },
    {
      key: 'market-intel', label: 'Market Intelligence',
      description: 'AI-powered research engine for any event. Surface the right speakers, understand your competitive landscape, and identify the companies that belong in the room.',
      icon: <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>,
      color: '#7A7DF3',
      href: ctx => `/admin/events/${ctx.eventId}/market-intel`,
      needsEvent: true,
      breadcrumbPattern: '/admin/events/:eventId/market-intel', breadcrumbParent: 'toolkit',
      access: { kind: 'tool_grant', grantKey: 'intelligence', moduleAccessKey: 'market-intel' },
      toolkitHub: {
        category: 'Events', badge: 'Event Tool',
        features: [
          { icon: '◉', label: 'Competitor event analysis', detail: 'Understand what competing events are doing and where gaps exist' },
          { icon: '◈', label: 'Speaker discovery & scoring', detail: 'Find top voices in your sector ranked by relevance and reach' },
          { icon: '⊞', label: 'Company & industry mapping', detail: 'Map target companies, sectors, and decision-maker profiles' },
          { icon: '↓', label: 'Exportable reports', detail: 'Download intelligence as structured reports for your team' },
        ],
      },
    },
    {
      key: 'brand-studio', label: 'Brand Studio',
      description: 'Upload a brand document and extract the full identity — colours, fonts, tone of voice. Then generate on-brand visual assets using Imagen 3 for any event.',
      icon: <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><circle cx="13.5" cy="6.5" r=".5"/><circle cx="17.5" cy="10.5" r=".5"/><circle cx="8.5" cy="7.5" r=".5"/><circle cx="6.5" cy="12.5" r=".5"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/></svg>,
      color: '#A78BFA',
      href: ctx => `/admin/events/${ctx.eventId}/brand`,
      needsEvent: true,
      breadcrumbPattern: '/admin/events/:eventId/brand', breadcrumbParent: 'toolkit',
      access: { kind: 'tool_grant', grantKey: 'brand_studio', moduleAccessKey: 'brand-studio' },
      toolkitHub: {
        category: 'Events', badge: 'Event Tool',
        features: [
          { icon: '◈', label: 'AI brand extraction', detail: 'Upload a PDF — colours, fonts and key messages pulled automatically' },
          { icon: '▣', label: 'Imagen 3 asset generation', detail: 'Generate hero images, social banners and key visuals on-brand' },
          { icon: '◉', label: 'Logo management', detail: 'Primary, white, dark and horizontal variants in one place' },
          { icon: '◻', label: 'Colour & typography system', detail: 'Define the palette and fonts that flow into the website builder' },
        ],
      },
    },

    /* ── Toolkit-only: Marketing / Data ── */
    {
      key: 'corporate-marketing', label: 'Corporate Marketing',
      description: 'Single workspace for all dynamic corporate content — deck, testimonials, approved assets, leadership bios. Canva stays the design master; EventPilot owns the content and every published version.',
      icon: <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>,
      color: '#E26262',
      href: '/admin/toolkit/corporate-marketing/deck',
      access: { kind: 'tool_grant', grantKey: 'corporate_marketing' },
      toolkitHub: {
        category: 'Marketing', badge: 'Marketing',
        features: [
          { icon: '◉', label: 'Corporate deck management', detail: 'Upload the master PDF + store the Canva link. AI flags the sections that change every month' },
          { icon: '◈', label: 'Editable content workspace', detail: 'Company overview, vision, stats, testimonials, approved images — all in one place' },
          { icon: '◷', label: 'Publish-based versioning', detail: 'Publish creates an immutable snapshot with change summary. Every past version stays downloadable' },
          { icon: '⊞', label: 'Reuses existing EventPilot data', detail: 'Leadership pulls from staff_members, events pull from events table — no duplication' },
        ],
      },
    },
    {
      key: 'smart-excel', label: 'SmartExcel',
      description: 'Conversational, AI-assisted spreadsheet and document-to-spreadsheet jobs. Describe what you need in plain English — clarify, plan, sample, run, and refine, with a human approval step before anything runs at scale.',
      icon: <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>,
      color: '#3A9F3F',
      href: '/smartexcel',
      breadcrumbParent: 'toolkit',
      access: { kind: 'tool_grant', grantKey: 'smart_excel' },
      toolkitHub: {
        category: 'Data', badge: 'Data Intelligence',
        features: [
          { icon: '◈', label: 'Conversational job builder', detail: 'Describe the transform in plain English — no formulas required' },
          { icon: '◷', label: 'Governed execution loop', detail: 'Clarify → plan → approve → sample → approve → full run → refine' },
          { icon: '↓', label: 'Any source, any format', detail: 'Spreadsheets and documents (CSV, XLSX, PDF) in, structured output out' },
          { icon: '⊞', label: 'Reusable recipes', detail: 'Turn a successful job into a one-click recipe for next time' },
        ],
      },
    },
    {
      key: 'tresagent', label: 'TresAgent',
      description: 'AI-powered voice and WhatsApp outreach agent. Automates delegate acquisition at scale — makes calls, sends follow-ups, and tracks every conversation across multiple events simultaneously.',
      icon: <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>,
      color: '#EC4899',
      href: 'https://trescon-reach.vercel.app',
      access: { kind: 'tool_grant', grantKey: 'tresagent' },
      toolkitHub: { category: 'AI', badge: 'AI Agent' },
    },

    /* ── Toolkit-only: Academy ── */
    {
      key: 'ai-course-gen', label: 'AI Course Generator',
      description: 'Describe a skill gap or topic — Gemini AI designs a complete course with reading content, hands-on tasks, and a 10-question quiz. Bulk-seed courses per department in one click.',
      icon: <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
      color: '#A78BFA',
      href: '/admin?tab=suggest',
      access: { kind: 'admin_only' },
      toolkitHub: {
        category: 'Academy', badge: 'Academy', access: { kind: 'tool_grant', grantKey: null },
        features: [
          { icon: '◈', label: 'AI-powered course design', detail: 'Type a topic — get a full course with content, tasks, and quiz in seconds' },
          { icon: '⊞', label: 'Department seeding', detail: 'Generate 1-3 courses for any department in one go' },
          { icon: '◉', label: 'Personalised tasks', detail: 'Hands-on tasks auto-adapt to each staff member\'s role and department' },
          { icon: '◷', label: 'Review before publish', detail: 'Edit everything before going live — nothing publishes without your approval' },
        ],
      },
    },
    {
      key: 'course-manager', label: 'Course Manager',
      description: 'Review, edit, and publish courses. Manage the draft queue from AI-generated and manually created courses. Full editor for content, tasks, questions, and department targeting.',
      icon: <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>,
      color: '#0EA5E9',
      href: '/admin/courses',
      // Confirmed: /admin/courses is NOT in middleware's tool-route allowlist,
      // so it already requires full admin at the route level regardless of
      // any grant. Toolkit hub already hides it from non-admins too
      // (TOOL_GRANT_KEY['course-manager'] = null excludes it from the
      // non-admin filter) — both preserved as admin_only, not a gap.
      access: { kind: 'admin_only' },
      toolkitHub: {
        category: 'Academy', badge: 'Academy', access: { kind: 'tool_grant', grantKey: null },
        features: [
          { icon: '≡', label: 'Draft review queue', detail: 'All AI-generated and manual drafts in one place for review' },
          { icon: '?', label: 'Full course editor', detail: 'Edit content, tasks, quiz questions, departments, and settings' },
          { icon: '⊞', label: 'Publish controls', detail: 'Save as draft or publish directly — mandatory flag, department targeting' },
          { icon: '◷', label: 'Course catalogue', detail: 'View and manage all published courses with search and filters' },
        ],
      },
    },

    /* ── Toolkit-only: Operations ── */
    {
      key: 'bespoke-tracker', label: 'Bespoke Tracker',
      description: 'End-to-end bespoke event lifecycle management. From client brief to invoice — track projects, manage 53 SOP tasks across 4 phases, and monitor delegate pipelines with full Kanban and table views.',
      icon: <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>,
      color: '#E0670B',
      href: '/admin/bespoke',
      breadcrumbParent: 'toolkit',
      access: { kind: 'tool_grant', grantKey: 'bespoke', moduleAccessKey: 'bespoke-tracker' },
      toolkitHub: {
        category: 'Operations', badge: 'Operations',
        features: [
          { icon: '◷', label: 'Project pipeline', detail: 'Track bespoke events from brief through execution to close-out' },
          { icon: '≡', label: '53-task SOP template', detail: 'Auto-generated task checklist from the Bespoke Events SOP' },
          { icon: '◉', label: 'Delegate management', detail: 'Full delegate pipeline with bulk import, status tracking and notes' },
          { icon: '⊞', label: 'Kanban + table views', detail: 'Switch between visual pipeline board and detailed table view' },
        ],
      },
    },

    /* ── Toolkit-only: Finance ── */
    {
      key: 'commercial', label: 'Commercial P&L',
      description: 'Full event profitability tracking — revenue pipelines, direct costs, staff costs from timesheets, overhead allocations, and multi-level approval workflows. Executive dashboard with margin analysis.',
      icon: <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>,
      color: '#009C89',
      href: '/admin/commercial',
      breadcrumbParent: 'toolkit',
      // Was admin_only with no real route enforcement at all (no layout.tsx
      // existed; middleware's generic /admin/* rule applied by default, and
      // the toolkitHub tool_grant below only ever controlled Toolkit-hub tile
      // visibility). Now enforced for real via app/admin/commercial/layout.tsx
      // + requireModuleAccess('commercial') + middleware.ts's isToolRoute.
      access: { kind: 'admin_only', grantKey: 'commercial', moduleAccessKey: 'commercial' },
      toolkitHub: {
        category: 'Finance', badge: 'Finance', access: { kind: 'tool_grant', grantKey: 'commercial', moduleAccessKey: 'commercial' },
        features: [
          { icon: '◈', label: 'Revenue pipeline', detail: 'Track sponsorship, exhibition, delegate revenue with inventory management' },
          { icon: '◉', label: 'Cost tracking', detail: 'Direct expenses, staff costs from timesheets, overhead allocation models' },
          { icon: '▣', label: 'Executive dashboard', detail: 'Real-time P&L with gross/net margins, weekly snapshots, trend analysis' },
          { icon: '⊙', label: 'Approval workflows', detail: '4-step approval chain — BU Head, Commercial Director, Finance, CEO' },
        ],
      },
    },

    /* ── Page-badge-only entries ──
       Not real navigable modules — no platformMenu/toolkitHub tags, so they
       never appear in either menu. These exist purely so AppShellNav has a
       registry entry to resolve for pages whose nav badge (a NavBar MOD_*
       constant) has no corresponding PlatformMenu tile or Toolkit tool. */
    {
      key: 'eventpilot', label: 'Event Pilot',
      description: 'Generic platform identity — shown on pages with no more specific module.',
      icon: I.bolt, color: '#009D8D',
      href: '/dashboard',
      access: { kind: 'always' },
    },
    {
      key: 'insights', label: 'Intelligence',
      description: 'Management-ready insights from all staff submissions.',
      icon: <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>,
      color: '#A478FF',
      href: '/insights',
      access: { kind: 'admin_only' },
    },
    {
      key: 'admin-reviews', label: 'Platform Reviews',
      description: 'Staff feedback on platform tools — issues, bugs, and suggestions.',
      icon: <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>,
      color: '#E55F5F',
      href: '/admin/reviews',
      access: { kind: 'admin_only' },
    },
    {
      key: 'per-creator', label: 'PER Creator',
      description: 'Generates a post-event report from submitted event data, pulling in past editions and Trescon credentials.',
      icon: I.dashboard, color: '#60A5FA',
      href: '/admin/tools/per-creator',
      breadcrumbParent: 'kb',
      access: { kind: 'tool_grant', grantKey: 'knowledge_base' },
    },
    {
      key: 'proposal-creator', label: 'Proposal Creator',
      description: 'Generates a client proposal from a prospect brief, pulling in Trescon commercial models and historical proposals.',
      icon: I.dashboard, color: '#A172F2',
      href: '/admin/tools/proposal-creator',
      breadcrumbParent: 'kb',
      access: { kind: 'tool_grant', grantKey: 'knowledge_base' },
    },
    {
      key: 'commercial-event', label: 'Commercial Tracker',
      description: 'Per-event commercial P&L workspace — not independently navigable, reached only via the Commercial Tracker tool.',
      icon: I.dashboard, color: '#009C89',
      href: ctx => `/admin/commercial/${ctx.eventId}`,
      needsEvent: true,
      breadcrumbPattern: '/admin/commercial/:eventId', breadcrumbParent: 'toolkit',
      access: { kind: 'admin_only' },
    },
    {
      key: 'admin-event-workspace', label: 'Event Workspace',
      description: 'Per-event workspace — checklist, details, and links into the event-scoped tools.',
      icon: I.dashboard, color: '#009C89',
      href: ctx => `/admin/events/${ctx.eventId}`,
      needsEvent: true,
      breadcrumbPattern: '/admin/events/:eventId', breadcrumbParent: 'admin',
      access: { kind: 'admin_only' },
    },
    {
      key: 'admin-event-plan', label: 'Planning Board',
      description: 'Per-event task planning kanban/table board.',
      icon: I.dashboard, color: '#009C89',
      href: ctx => `/admin/events/${ctx.eventId}/plan`,
      needsEvent: true,
      breadcrumbPattern: '/admin/events/:eventId/plan', breadcrumbParent: 'admin-event-workspace',
      access: { kind: 'admin_only' },
    },
    {
      key: 'admin-event-execution', label: 'Execution Flow',
      description: 'Per-event execution timeline and checkpoint tracking.',
      icon: I.dashboard, color: '#009C89',
      href: ctx => `/admin/events/${ctx.eventId}/execution`,
      needsEvent: true,
      breadcrumbPattern: '/admin/events/:eventId/execution', breadcrumbParent: 'admin-event-workspace',
      access: { kind: 'admin_only' },
    },
    {
      key: 'admin-event-brief', label: 'Event Brief',
      description: 'Per-event intelligence brief.',
      icon: I.dashboard, color: '#009C89',
      href: ctx => `/admin/events/${ctx.eventId}/brief`,
      needsEvent: true,
      breadcrumbPattern: '/admin/events/:eventId/brief', breadcrumbParent: 'admin-event-workspace',
      access: { kind: 'admin_only' },
    },
    {
      key: 'admin-event-stakeholders', label: 'Stakeholder Hub',
      description: 'Speakers, sponsors, and stakeholder announcements for this event.',
      icon: I.people, color: '#F0AB3C',
      href: ctx => `/admin/events/${ctx.eventId}/stakeholders`,
      needsEvent: true,
      breadcrumbPattern: '/admin/events/:eventId/stakeholders', breadcrumbParent: 'admin-event-workspace',
      access: { kind: 'admin_only' },
    },
    {
      key: 'admin-event-access', label: 'Access',
      description: 'Define roles and assign staff access to this event\'s modules.',
      icon: I.gear, color: '#8C8C8C',
      href: ctx => `/admin/events/${ctx.eventId}/access`,
      needsEvent: true,
      breadcrumbPattern: '/admin/events/:eventId/access', breadcrumbParent: 'admin-event-workspace',
      access: { kind: 'admin_only' },
    },
    {
      key: 'admin-event-creative-templates', label: 'Stakeholder Announcement Engine',
      description: 'Create stakeholder announcement creatives — pick a creative style, preview against a real speaker or partner, generate.',
      icon: I.layers, color: '#F0AB3C',
      href: ctx => `/admin/events/${ctx.eventId}/creative-templates`,
      needsEvent: true,
      breadcrumbPattern: '/admin/events/:eventId/creative-templates', breadcrumbParent: 'toolkit',
      // 'sae' module_access grants (Settings→Access-style, see the admin
      // console entry below) are sufficient for entry at ANY tier — the
      // stricter admin-tier requirement for actually editing variants lives
      // on the separate admin-console module entry, not here.
      access: { kind: 'admin_only', moduleAccessKey: 'sae' },
      toolkitHub: {
        category: 'Events', badge: 'Event Tool',
        access: { kind: 'tool_grant', grantKey: null, moduleAccessKey: 'sae' },
        features: [
          { icon: '◈', label: 'Layer-based compositing', detail: 'Stack background art, photo/logo slots and text in any order — Sharp composites them server-side' },
          { icon: '◉', label: 'Face-aligned photos', detail: 'Upload a reference layer once — real speaker photos auto-align to match its head position/size' },
          { icon: '▣', label: 'Logo normalization', detail: 'Any format including PDF/AI, background removed automatically, legitimate logo badges preserved' },
          { icon: '◻', label: 'Live preview', detail: 'Debounced server-rendered preview — always matches exactly what generation will produce' },
        ],
      },
    },
    {
      // Not a Toolkit tile of its own — reached via the "Admin Console →"
      // link in the main workspace page's header above. Separate registry
      // entry purely so it gets its own breadcrumb + a STRICTER server-side
      // gate (admin-tier module_access, not just any tier) than the
      // generation workspace.
      key: 'admin-event-creative-templates-admin', label: 'Admin Console',
      description: 'Branding-team console for the Stakeholder Announcement Engine — build and edit creative variants (layer stacks), manage who has access to this tool.',
      icon: I.layers, color: '#F0AB3C',
      href: ctx => `/admin/events/${ctx.eventId}/creative-templates/admin`,
      needsEvent: true,
      breadcrumbPattern: '/admin/events/:eventId/creative-templates/admin', breadcrumbParent: 'admin-event-creative-templates',
      access: { kind: 'module_access', moduleKey: 'sae', minTier: 'admin' },
    },
    {
      key: 'leaderboard', label: 'Leaderboard',
      description: 'Weekly learning leaderboard ranked by course completions.',
      icon: <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M18 20V10"/><path d="M12 20V4"/><path d="M6 20v-6"/></svg>,
      color: '#00A5A3',
      href: '/leaderboard',
      access: { kind: 'always' },
    },
  ]
}
