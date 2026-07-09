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
    pathname.startsWith('/api/seed-demo')
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
    /^\/admin\/events\/[^/]+\/(website|brand|market-intel)/.test(pathname)

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

  // /finance/* → admin, Finance access role, or Finance department
  if (pathname.startsWith('/finance')) {
    const isFinance = session.adm || (session.roles ?? []).includes('finance') || session.dept === 'Finance'
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
