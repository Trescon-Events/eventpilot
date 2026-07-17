'use client'

/*
  Corporate Marketing access gate.

  Middleware lets any authenticated user reach /admin/toolkit/* (treated
  as a "tool route"). This layout enforces the actual grant check:

    - Super admins (session.adm === true) → allowed
    - Staff with staff_members.tool_grants.corporate_marketing === true → allowed
    - Everyone else → redirected to /no-access?tool=corporate_marketing

  Do not remove — without it, any logged-in staff could reach the module.
*/

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

type GateState = 'checking' | 'allowed' | 'denied'

export default function CorporateMarketingLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [state, setState] = useState<GateState>('checking')

  useEffect(() => {
    let cancelled = false
    fetch('/api/toolkit-access', { cache: 'no-store' })
      .then(r => r.json())
      .then(d => {
        if (cancelled) return
        const allowed = d?.grants === null || d?.grants?.corporate_marketing === true
        if (allowed) {
          setState('allowed')
        } else {
          setState('denied')
          router.replace(`/no-access?tool=corporate_marketing&from=${encodeURIComponent(window.location.pathname)}`)
        }
      })
      .catch(() => {
        if (cancelled) return
        setState('denied')
        router.replace(`/no-access?tool=corporate_marketing&from=${encodeURIComponent(window.location.pathname)}`)
      })
    return () => { cancelled = true }
  }, [router])

  if (state === 'allowed') return <>{children}</>

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--surface)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'var(--font-manrope)',
    }}>
      <div style={{ fontSize: '14px', color: 'var(--ink3)', fontWeight: 600 }}>
        {state === 'checking' ? 'Loading Corporate Marketing…' : 'Redirecting…'}
      </div>
    </div>
  )
}
