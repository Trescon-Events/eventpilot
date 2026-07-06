/**
 * /no-access?tool={key}&from={original path}
 *
 * Rendered whenever a logged-in staff member tries to open a tool or gated
 * section they don't have permission for. Middleware and per-tool layouts
 * redirect here instead of silently bouncing to /dashboard.
 *
 * Shows a friendly card + a Request Access button that posts to
 * /api/access-request so Durga gets an email and can enable the tool for
 * that user.
 */
'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'

const TOOL_LABEL: Record<string, string> = {
  bespoke:         'Bespoke Tracker',
  website_builder: 'Website Builder',
  brand_studio:    'Brand Studio',
  intelligence:    'Market Intelligence',
  smart_data:      'Smart Data',
  smart_excel:     'Smart Excel',
  admin:           'Admin Panel',
  finance:         'Finance Portal',
  hr:              'HR Portal',
}

export default function NoAccessPage() {
  const params   = useSearchParams()
  const toolKey  = params.get('tool') ?? ''
  const fromPath = params.get('from') ?? ''
  const label    = TOOL_LABEL[toolKey] ?? 'this tool'

  const [state,   setState]   = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [errText, setErrText] = useState<string | null>(null)

  async function requestAccess() {
    setState('sending')
    setErrText(null)
    try {
      const res = await fetch('/api/access-request', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ tool: toolKey || 'unknown', from: fromPath || null }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setErrText(d?.error ?? `Server returned ${res.status}`)
        setState('error')
        return
      }
      setState('sent')
    } catch (e) {
      setErrText((e as Error).message)
      setState('error')
    }
  }

  return (
    <main style={{
      minHeight: '100vh',
      background: '#E8EEF4',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px',
      fontFamily: 'var(--font-manrope), system-ui, -apple-system, sans-serif',
    }}>
      <div style={{
        maxWidth: '460px',
        width:    '100%',
        background: '#ffffff',
        borderRadius: '20px',
        padding: '40px 36px',
        boxShadow: '0 24px 60px rgba(15,25,35,0.10), 0 2px 4px rgba(15,25,35,0.04)',
      }}>
        {/* Icon */}
        <div style={{
          width: '64px',
          height: '64px',
          borderRadius: '18px',
          background: 'linear-gradient(155deg,#F8FFFE 0%,#C6ECE8 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 22px',
        }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
            <path d="M12 15v2m6-8V7a6 6 0 10-12 0v2m-2 0h16a2 2 0 012 2v9a2 2 0 01-2 2H4a2 2 0 01-2-2v-9a2 2 0 012-2z" stroke="#00A5A3" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>

        <h1 style={{
          fontSize: '22px',
          fontWeight: 900,
          color: '#080A0B',
          textAlign: 'center',
          margin: '0 0 8px',
          letterSpacing: '-0.3px',
        }}>
          Access needed
        </h1>

        <p style={{
          fontSize: '14px',
          lineHeight: 1.6,
          color: '#5B7080',
          textAlign: 'center',
          margin: '0 0 6px',
        }}>
          You don&apos;t have access to <strong style={{ color: '#080A0B' }}>{label}</strong>.
        </p>
        <p style={{
          fontSize: '13px',
          lineHeight: 1.6,
          color: '#94A3B8',
          textAlign: 'center',
          margin: '0 0 26px',
        }}>
          Click <strong style={{ color: '#00A5A3' }}>Request access</strong> and your admin will get an email to enable it for you.
        </p>

        {/* Action */}
        {state === 'idle' && (
          <button
            type="button"
            onClick={requestAccess}
            style={{
              width: '100%',
              background: '#C0F43C',
              color: '#080A0B',
              border: 'none',
              borderRadius: '50px',
              padding: '14px 22px',
              fontSize: '14px',
              fontWeight: 800,
              letterSpacing: '0.3px',
              cursor: 'pointer',
              marginBottom: '10px',
            }}
          >
            Request access
          </button>
        )}

        {state === 'sending' && (
          <button
            type="button"
            disabled
            style={{
              width: '100%',
              background: '#EEF3F7',
              color: '#5B7080',
              border: 'none',
              borderRadius: '50px',
              padding: '14px 22px',
              fontSize: '14px',
              fontWeight: 700,
              marginBottom: '10px',
              cursor: 'default',
            }}
          >
            Sending…
          </button>
        )}

        {state === 'sent' && (
          <div style={{
            background: '#F8FFFE',
            border: '1px solid #C6ECE8',
            borderRadius: '14px',
            padding: '14px 18px',
            marginBottom: '14px',
            textAlign: 'center',
          }}>
            <p style={{ fontSize: '13px', color: '#00A5A3', fontWeight: 800, margin: '0 0 4px' }}>
              Request sent to admin
            </p>
            <p style={{ fontSize: '12px', color: '#5B7080', margin: 0 }}>
              You&apos;ll be notified when access is granted.
            </p>
          </div>
        )}

        {state === 'error' && (
          <div style={{
            background: '#FFF4F4',
            border: '1px solid #FBCACA',
            borderRadius: '14px',
            padding: '14px 18px',
            marginBottom: '14px',
            textAlign: 'center',
          }}>
            <p style={{ fontSize: '13px', color: '#C2410C', fontWeight: 700, margin: '0 0 4px' }}>
              Couldn&apos;t send request
            </p>
            <p style={{ fontSize: '12px', color: '#5B7080', margin: 0 }}>
              {errText ?? 'Please try again in a moment.'}
            </p>
            <button
              type="button"
              onClick={requestAccess}
              style={{
                marginTop: '10px',
                background: 'transparent',
                border: '1px solid #C2410C',
                color: '#C2410C',
                padding: '6px 16px',
                borderRadius: '30px',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Retry
            </button>
          </div>
        )}

        <Link
          href="/dashboard"
          style={{
            display: 'block',
            textAlign: 'center',
            fontSize: '13px',
            color: '#5B7080',
            textDecoration: 'none',
            fontWeight: 600,
            padding: '10px',
          }}
        >
          ← Back to dashboard
        </Link>
      </div>
    </main>
  )
}
