import { NextRequest, NextResponse } from 'next/server'

/*
  Route protection middleware.
  Session is stored in httpOnly cookie 'tcs_session' as a base64-encoded JSON:
    { sid, jl (job_level), adm (is_admin), dept }

  Route rules:
  - /login, /join, /api/login, /api/join, static assets → public
  - /admin/*  → requires adm === true
  - /hr/*     → requires adm === true OR dept === 'HR'
  - Everything else → requires any valid session
*/

const PUBLIC_PREFIXES = [
  '/login',
  '/join',
  '/api/login',
  '/api/join',
  '/api/public',
  '/api/domain-lookup',
  '/api/verify-staff',    // used by /profile setup flow (no session at that point)
  '/api/task-profiles',           // used by /profile setup flow (no session at that point)
  '/api/admin/setup-pilots',     // one-time setup, auth checked inside via x-setup-key header
  '/api/admin/pilots',            // create/backfill pilot projects, auth checked inside (session or x-setup-key)
  '/api/build-requests',         // build requests API, auth checked inside (session or x-setup-key)
  '/api/worker-callback',        // SmartExcel Python worker callback, auth checked inside via bearer token
  '/profile',             // AIRS assessment — staff arrive here before they have a session
  '/events',              // public event websites
  '/public',              // public stakeholder onboarding forms (SAE) — no session, external submitters
  '/welcome',
  '/_next',
  '/favicon',
]

const PUBLIC_FILE_EXTENSIONS = /\.(png|jpg|jpeg|svg|webp|webm|mp4|ico|ttf|woff|woff2)$/

function parseSession(req: NextRequest): { sid: string; jl: string; adm: boolean; dept: string; roles?: string[] } | null {
  const raw = req.cookies.get('tcs_session')?.value
  if (!raw) return null
  try {
    // atob is available in Edge runtime; session only contains ASCII-safe values
    return JSON.parse(atob(raw))
  } catch {
    return null
  }
}

// ── Custom domain → event slug rewriting ─────────────────────────────────
const PLATFORM_HOSTS = [
  'eventpilot.tresconglobal.com',
  'taos-discovery.vercel.app',
  'eventpilot-nammadaiva-agents-projects.vercel.app',
  'localhost',
  '127.0.0.1',
]

// DocuHub's permanent-link domains — fixed platform hostnames (not
// per-tenant custom domains), so they're handled separately from
// resolveCustomDomain() below and checked first. Two domains, not one:
// docuhub.tresconglobal.com serves internal-visibility documents (needs the
// tcs_session cookie, which only works within the tresconglobal.com family),
// while docs.tresconevents.com serves public documents on a separate domain
// Trescon owns, kept apart from the main platform domain by design. Both
// rewrite to the same resolve route, which itself decides public vs internal
// per-document regardless of which host was hit.
const DOCUHUB_HOSTS = ['docuhub.tresconglobal.com', 'docs.tresconevents.com']

async function resolveCustomDomain(host: string, req: NextRequest): Promise<NextResponse | null> {
  // Strip port
  const cleanHost = host.split(':')[0]
  // Only intercept if not a platform host
  if (PLATFORM_HOSTS.some(h => cleanHost === h || cleanHost.endsWith(`.${h}`))) return null
  // Lookup slug for this domain
  try {
    const lookupUrl = new URL(`/api/domain-lookup?host=${encodeURIComponent(cleanHost)}`, req.nextUrl.origin)
    const res = await fetch(lookupUrl.toString(), { next: { revalidate: 60 } })
    if (!res.ok) return null
    const { slug } = await res.json()
    if (!slug) return null
    // Rewrite: custom domain root → /events/{slug}, and subpaths too
    const url = req.nextUrl.clone()
    const subPath = url.pathname === '/' ? '' : url.pathname
    url.pathname = `/events/${slug}${subPath}`
    return NextResponse.rewrite(url)
  } catch {
    return null
  }
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // ── Custom domain rewriting (must run before auth) ──
  const host = req.headers.get('host') ?? ''

  // DocuHub host detection uses x-original-host, NOT the raw Host header.
  // The eventpilot-proxy Worker (infra/eventpilot-proxy/proxy-worker.js)
  // rewrites Host to the fixed Railway target for every request regardless
  // of which public hostname was used, and Railway's own edge separately
  // overwrites the standard x-forwarded-host header too (confirmed via a
  // live header-inspection test) — so a custom header the Worker sets
  // (added 2026-07-08) is the only reliable signal for which of
  // eventpilot.tresconglobal.com / docuhub.tresconglobal.com / docs.tresconevents.com was hit.
  const originalHost = (req.headers.get('x-original-host') ?? host).split(':')[0]

  if (DOCUHUB_HOSTS.includes(originalHost)) {
    const url = req.nextUrl.clone()
    url.pathname = `/api/docuhub/resolve${url.pathname}`
    return NextResponse.rewrite(url)
  }

  const domainRewrite = await resolveCustomDomain(host, req)
  if (domainRewrite) return domainRewrite

  // ── Legacy path redirects (KB/DocuHub/Assistant moved under
  // /admin/toolkit/*, 15 Jul 2026) ──
  // Old bookmarks/emails linking to /knowledge or /docuhub should keep
  // working rather than 404 — redirect to the new nested, tool_grant-gated
  // locations instead of leaving a stub page file behind at the old path.
  // Checked most-specific-first: /knowledge/assistant now lives as its own
  // separate tool, not nested under knowledge-base.
  if (pathname === '/knowledge/assistant' || pathname.startsWith('/knowledge/assistant/')) {
    const url = req.nextUrl.clone()
    url.pathname = '/admin/toolkit/knowledge-assistant' + pathname.slice('/knowledge/assistant'.length)
    return NextResponse.redirect(url)
  }
  if (pathname === '/knowledge' || pathname.startsWith('/knowledge/')) {
    const url = req.nextUrl.clone()
    url.pathname = '/admin/toolkit/knowledge-base' + pathname.slice('/knowledge'.length)
    return NextResponse.redirect(url)
  }
  if (pathname === '/docuhub' || pathname.startsWith('/docuhub/')) {
    const url = req.nextUrl.clone()
    url.pathname = '/admin/toolkit/docuhub' + pathname.slice('/docuhub'.length)
    return NextResponse.redirect(url)
  }

  // Allow static assets and public file extensions
  if (PUBLIC_FILE_EXTENSIONS.test(pathname)) return NextResponse.next()

  // Allow public routes
  if (PUBLIC_PREFIXES.some(p => pathname === p || pathname.startsWith(p + '/'))) {
    return NextResponse.next()
  }

  // Allow public API routes that don't need auth
  if (
    pathname.startsWith('/api/auth/') ||   // covers session, logout, microsoft SSO, callback
    pathname.startsWith('/api/platform-docs') ||
    pathname.startsWith('/api/hrms-sync') ||
    pathname.startsWith('/api/hr/attendance/sync') ||
    pathname.startsWith('/api/admin/set-password') ||
    pathname.startsWith('/api/admin/set-job-level') ||
    pathname.startsWith('/api/admin/tool-permissions') ||
    pathname.startsWith('/api/cron/') ||
    pathname === '/api/kb/intel/run' ||  // cron-job.org calls this with no session cookie; auth checked inside via bearer token or admin_staff_id. NOT startsWith — that would also match /api/kb/intel/runs (the run-history GET) and make it public.
    pathname.startsWith('/api/docuhub/resolve') ||  // public permanent-link resolver; visibility (public/internal) is checked inside the route itself, not here
    pathname.startsWith('/api/seed-platform-docs') ||
    pathname.startsWith('/api/seed-courses') ||
    pathname.startsWith('/api/seed-demo') ||
    // SAE approval review: reachable via a signed approval_token with no
    // EventPilot session (external approvers). Auth is checked inside the
    // route/page via the token, not here. Scoped tightly with a regex so
    // this doesn't accidentally open up the rest of the announcements tree.
    /^\/api\/events\/stakeholders\/announcements\/[^/]+\/approve$/.test(pathname) ||
    /^\/api\/events\/stakeholders\/announcements\/[^/]+\/review-data$/.test(pathname) ||
    /^\/admin\/events\/[^/]+\/announcements\/[^/]+\/review$/.test(pathname)
  ) {
    return NextResponse.next()
  }

  const session = parseSession(req)

  // No session → redirect to login
  if (!session) {
    const loginUrl = req.nextUrl.clone()
    loginUrl.pathname = '/login'
    loginUrl.search = `?next=${encodeURIComponent(pathname + req.nextUrl.search)}`
    return NextResponse.redirect(loginUrl)
  }

  // Tool routes: auth-only — page/layout handles the tool_grants check
  const isToolRoute =
    pathname.startsWith('/admin/toolkit') ||
    pathname.startsWith('/admin/bespoke') ||
    pathname.startsWith('/admin/commercial') ||
    // 2026-08-16: delegatable via the platform-wide RBAC permission
    // platform.branding.manage — see app/admin/branding/fonts/layout.tsx.
    // Scoped to /fonts only, not the sibling /admin/branding/corporate page.
    pathname.startsWith('/admin/branding/fonts') ||
    /^\/admin\/events\/[^/]+\/(website|brand|market-intel|creative-templates|stakeholders)/.test(pathname)

  // /admin/* → admin only
  if (pathname.startsWith('/admin') && !isToolRoute) {
    if (!session.adm) {
      const dest = req.nextUrl.clone()
      dest.pathname = '/no-access'
      dest.search = `?tool=admin&from=${encodeURIComponent(pathname)}`
      return NextResponse.redirect(dest)
    }
  }

  // /my-hr, /timesheets → accessible to ALL authenticated users
  if (pathname.startsWith('/my-hr') || pathname.startsWith('/timesheets')) {
    return NextResponse.next()
  }

  // /finance/* → admin OR explicit finance access_role only.
  // Department membership is NOT sufficient — access must be granted
  // explicitly by an admin. Matches app/lib/finance/auth.ts policy
  // used by every /api/hr/salary/* + /api/hr/payroll-* + finance-adjacent
  // API route. Do NOT re-add a `dept === 'Finance'` shortcut.
  if (pathname.startsWith('/finance')) {
    const roles = session.roles ?? []
    const isFinance = session.adm
      || roles.includes('finance')
      || roles.includes('admin')
      || roles.includes('super_admin')
    if (!isFinance) {
      const dest = req.nextUrl.clone()
      dest.pathname = '/no-access'
      dest.search = `?tool=finance&from=${encodeURIComponent(pathname)}`
      return NextResponse.redirect(dest)
    }
    return NextResponse.next()
  }

  // /hr/* → admin, HR access role, or HR department
  if (pathname.startsWith('/hr')) {
    const isHR = session.adm || (session.roles ?? []).includes('hr') || session.dept === 'HR'
    if (!isHR) {
      const dest = req.nextUrl.clone()
      dest.pathname = '/no-access'
      dest.search = `?tool=hr&from=${encodeURIComponent(pathname)}`
      return NextResponse.redirect(dest)
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image).*)',
  ],
}
