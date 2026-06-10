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
  '/events',          // public event websites
  '/welcome',
  '/_next',
  '/favicon',
]

const PUBLIC_FILE_EXTENSIONS = /\.(png|jpg|jpeg|svg|webp|webm|mp4|ico|ttf|woff|woff2)$/

function parseSession(req: NextRequest): { sid: string; jl: string; adm: boolean; dept: string } | null {
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
  'eventpilot-trescons-projects.vercel.app',
  'eventpilot.tresconglobal.com',
  'localhost',
  '127.0.0.1',
]

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
    pathname.startsWith('/api/auth/session') ||
    pathname.startsWith('/api/auth/logout') ||
    pathname.startsWith('/api/platform-docs') ||
    pathname.startsWith('/api/hrms-sync') ||
    pathname.startsWith('/api/hr/attendance/sync') ||
    pathname.startsWith('/api/admin/set-password') ||
    pathname.startsWith('/api/admin/set-job-level') ||
    pathname.startsWith('/api/admin/tool-permissions') ||
    pathname.startsWith('/api/cron/')
  ) {
    return NextResponse.next()
  }

  const session = parseSession(req)

  // No session → redirect to login
  if (!session) {
    const loginUrl = req.nextUrl.clone()
    loginUrl.pathname = '/login'
    loginUrl.search = `?next=${encodeURIComponent(pathname)}`
    return NextResponse.redirect(loginUrl)
  }

  // /admin/* → admin only
  if (pathname.startsWith('/admin')) {
    if (!session.adm) {
      const dest = req.nextUrl.clone()
      dest.pathname = '/dashboard'
      dest.search = `?id=${session.sid}`
      return NextResponse.redirect(dest)
    }
  }

  // /my-hr → accessible to ALL authenticated users (self-service HR portal)
  if (pathname.startsWith('/my-hr')) {
    return NextResponse.next()
  }

  // /hr/* → admin or HR department only
  if (pathname.startsWith('/hr')) {
    const isHR = session.dept === 'HR' || session.adm
    if (!isHR) {
      const dest = req.nextUrl.clone()
      dest.pathname = '/dashboard'
      dest.search = `?id=${session.sid}`
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
