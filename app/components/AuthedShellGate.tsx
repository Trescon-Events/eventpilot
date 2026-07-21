'use client'

import { usePathname } from 'next/navigation'
import GlobalShell from '@/app/components/GlobalShell'

/*
  Wraps every page in the root layout, deciding whether the persistent
  global shell (logo/breadcrumb/quick-access/Help/Sound/Profile) should
  render above it. Hidden on pages that are pre-auth or render their own
  full-screen centered layout (login, join, password flows, the public
  request-access screen, no-access, public event microsites) — everywhere
  else gets the shell.

  This list is deliberately broader than middleware.ts's PUBLIC_PREFIXES
  (which governs actual auth enforcement, untouched by this file) — e.g.
  /set-password, /reset-password, /no-access, and /profile all technically
  sit behind different auth rules in middleware, but all render their own
  full-screen centered card and would look wrong with a persistent app bar
  on top, so they're excluded here regardless.
*/

const EXACT_NO_SHELL = new Set([
  '/', '/login', '/join', '/welcome', '/set-password', '/reset-password',
  '/access-pending', '/no-access', '/profile',
])
const PREFIX_NO_SHELL = ['/events/', '/public/']
// Standalone-layout pages with two dynamic path segments — a prefix/exact
// match can't express these, so a small explicit regex list sits alongside
// the two above. SAE's approval review page renders its own dedicated
// layout (PRD SS9.6) for both token-based external approvers (no session)
// and staff who click through — same treatment either way, so it's excluded
// here unconditionally rather than branching on session/query-string state.
const REGEX_NO_SHELL = [/^\/admin\/events\/[^/]+\/announcements\/[^/]+\/review$/]

function shouldHideShell(pathname: string): boolean {
  if (EXACT_NO_SHELL.has(pathname)) return true
  if (PREFIX_NO_SHELL.some(p => pathname.startsWith(p))) return true
  return REGEX_NO_SHELL.some(r => r.test(pathname))
}

export default function AuthedShellGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  if (shouldHideShell(pathname)) return <>{children}</>
  return <GlobalShell>{children}</GlobalShell>
}
