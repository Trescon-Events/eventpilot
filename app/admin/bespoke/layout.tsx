'use client'

/*
  Bespoke Tracker access gate.

  Middleware lets any authenticated user reach /admin/bespoke/* (treated as a
  "tool route", same pattern as /admin/toolkit). This layout enforces the
  actual access rule at the client level:

    - Super admins (session.adm === true) → allowed
    - Staff with staff_members.tool_grants.bespoke === true → allowed
    - Everyone else → redirected to their dashboard

  Without this file the middleware bypass would silently expose the tracker
  to any logged-in staff. Do not remove.
*/

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

type GateState = 'checking' | 'allowed' | 'denied'

export default function BespokeLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [state, setState] = useState<GateState>('checking')

  useEffect(() => {
    let cancelled = false
    fetch('/api/toolkit-access', { cache: 'no-store' })
      .then(r => r.json())
      .then(d => {
        if (cancelled) return
        // grants === null means the caller is a super admin (unrestricted)
        const allowed = d?.grants === null || d?.grants?.bespoke === true
        if (allowed) {
          setState('allowed')
        } else {
          setState('denied')
          fetch('/api/auth/session', { cache: 'no-store' })
            .then(r => r.json())
            .then(s => router.replace(s?.sid ? `/dashboard?id=${s.sid}` : '/dashboard'))
            .catch(() => router.replace('/dashboard'))
        }
      })
      .catch(() => {
        if (cancelled) return
        setState('denied')
        router.replace('/dashboard')
      })
    return () => { cancelled = true }
  }, [router])

  if (state === 'allowed') return <>{children}</>

  return (
    <div style={{
      minHeight: '100vh',
      background: '#E8EEF4',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'var(--font-manrope)',
    }}>
      <div style={{
        fontSize: '14px',
        color: '#5B7080',
        fontWeight: 600,
      }}>
        {state === 'checking' ? 'Loading Bespoke Tracker…' : 'Redirecting…'}
      </div>
    </div>
  )
}
