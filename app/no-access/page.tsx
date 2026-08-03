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

import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'

const TOOL_LABEL: Record<string, string> = {
  bespoke:             'Bespoke Tracker',
  website_builder:     'Website Builder',
  brand_studio:        'Brand Studio',
  intelligence:        'Market Intelligence',
  smart_data:          'Smart Data',
  smart_excel:         'Smart Excel',
  corporate_marketing: 'Corporate Marketing',
  admin:               'Admin Panel',
  finance:             'Finance Portal',
  hr:                  'HR Portal',
  knowledge_base:      'Knowledge Base',
  docuhub:             'DocuHub',
  knowledge_assistant: 'Knowledge Assistant',
  commercial:          'Commercial P&L',
}

// Next 16 requires useSearchParams() to be inside a Suspense boundary
// so the /no-access route can be prerendered. Wrapping here means the
// build no longer bails out (which was blocking every deploy since the
// popup landed).
export default function NoAccessPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', background: 'var(--surface)' }} />}>
      <NoAccessInner />
    </Suspense>
  )
}

function NoAccessInner() {
  const params   = useSearchParams()
  const toolKey  = params.get('tool') ?? ''
  const fromPath = params.get('from') ?? ''
  const label    = TOOL_LABEL[toolKey] ?? 'this tool'

  const [state,   setState]   = useState<'idle' | 'sending' | 'sent' | 'sent_no_email' | 'error'>('idle')
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
      const d = await res.json().catch(() => ({}))
      if (!res.ok) {
        setErrText(d?.error ?? `Server returned ${res.status}`)
        setState('error')
        return
      }
      // The request is always logged either way (that part never fails
      // silently) — but the email itself can fail to send, or get
      // deduped if this tool was already requested in the last 24h.
      // Real bug found live (2026-08-03): several requests sat unseen
      // for weeks because this state was previously indistinguishable
      // from a normal successful send.
      setState(d?.email_failed || d?.deduped ? 'sent_no_email' : 'sent')
    } catch (e) {
      setErrText((e as Error).message)
      setState('error')
    }
  }

  return (
    <main style={{
      minHeight: '100vh',
      background: 'var(--surface)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px',
      fontFamily: 'var(--font-manrope), system-ui, -apple-system, sans-serif',
    }}>
      <div style={{
        maxWidth: '460px',
        width:    '100%',
        background: 'var(--card)',
        borderRadius: '20px',
        padding: '40px 36px',
        boxShadow: 'var(--shadow-md)',
      }}>
        {/* Icon */}
        <div style={{
          width: '64px',
          height: '64px',
          borderRadius: '18px',
          background: 'var(--teal-light)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 22px',
        }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
            <path d="M12 15v2m6-8V7a6 6 0 10-12 0v2m-2 0h16a2 2 0 012 2v9a2 2 0 01-2 2H4a2 2 0 01-2-2v-9a2 2 0 012-2z" stroke="var(--teal-mid)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>

        <h1 style={{
          fontSize: '22px',
          fontWeight: 900,
          color: 'var(--ink)',
          textAlign: 'center',
          margin: '0 0 8px',
          letterSpacing: '-0.3px',
        }}>
          Access needed
        </h1>

        <p style={{
          fontSize: '14px',
          lineHeight: 1.6,
          color: 'var(--ink3)',
          textAlign: 'center',
          margin: '0 0 6px',
        }}>
          You don&apos;t have access to <strong style={{ color: 'var(--ink)' }}>{label}</strong>.
        </p>
        <p style={{
          fontSize: '13px',
          lineHeight: 1.6,
          color: 'var(--ink3)',
          textAlign: 'center',
          margin: '0 0 26px',
        }}>
          Click <strong style={{ color: 'var(--teal-mid)' }}>Request access</strong> and your admin will get an email to enable it for you.
        </p>

        {/* Action */}
        {state === 'idle' && (
          <button
            type="button"
            onClick={requestAccess}
            style={{
              width: '100%',
              background: 'var(--lime)',
              color: 'var(--lime-dark)',
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
              background: 'var(--card-hi)',
              color: 'var(--ink2)',
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
            background: 'var(--teal-light)',
            border: '1px solid var(--teal-border)',
            borderRadius: '14px',
            padding: '14px 18px',
            marginBottom: '14px',
            textAlign: 'center',
          }}>
            <p style={{ fontSize: '13px', color: 'var(--teal-mid)', fontWeight: 800, margin: '0 0 4px' }}>
              Request sent to admin
            </p>
            <p style={{ fontSize: '12px', color: 'var(--ink2)', margin: 0 }}>
              You&apos;ll be notified when access is granted.
            </p>
          </div>
        )}

        {state === 'sent_no_email' && (
          <div style={{
            background: 'var(--amber-light)',
            border: '1px solid var(--amber-border)',
            borderRadius: '14px',
            padding: '14px 18px',
            marginBottom: '14px',
            textAlign: 'center',
          }}>
            <p style={{ fontSize: '13px', color: 'var(--amber)', fontWeight: 800, margin: '0 0 4px' }}>
              Request logged
            </p>
            <p style={{ fontSize: '12px', color: 'var(--ink2)', margin: 0 }}>
              We couldn&apos;t confirm the email notification went through this time. Your request is saved — if it takes a while, it&apos;s worth pinging your admin directly too.
            </p>
          </div>
        )}

        {state === 'error' && (
          <div style={{
            background: 'var(--red-light)',
            border: '1px solid var(--red-border)',
            borderRadius: '14px',
            padding: '14px 18px',
            marginBottom: '14px',
            textAlign: 'center',
          }}>
            <p style={{ fontSize: '13px', color: 'var(--red)', fontWeight: 700, margin: '0 0 4px' }}>
              Couldn&apos;t send request
            </p>
            <p style={{ fontSize: '12px', color: 'var(--ink2)', margin: 0 }}>
              {errText ?? 'Please try again in a moment.'}
            </p>
            <button
              type="button"
              onClick={requestAccess}
              style={{
                marginTop: '10px',
                background: 'transparent',
                border: '1px solid var(--red-border)',
                color: 'var(--red)',
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
            color: 'var(--ink3)',
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
