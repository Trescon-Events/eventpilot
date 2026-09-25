'use client'

import { useEffect, useRef } from 'react'

/* Cloudflare Turnstile widget. Reports a token via onToken (null when it
   expires or errors). The token is verified server-side on every request
   that needs it — this component alone protects nothing. */

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string
      reset: (id?: string) => void
      remove: (id?: string) => void
    }
  }
}

// Cloudflare's published always-pass TEST key: only used outside production.
const TEST_SITE_KEY = '1x00000000000000000000AA'
export const TURNSTILE_SITE_KEY =
  process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || (process.env.NODE_ENV !== 'production' ? TEST_SITE_KEY : '')

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

export default function Turnstile({ onToken, resetSignal }: { onToken: (token: string | null) => void; resetSignal: number }) {
  const holder = useRef<HTMLDivElement>(null)
  const widgetId = useRef<string | null>(null)
  const onTokenRef = useRef(onToken)
  useEffect(() => { onTokenRef.current = onToken }, [onToken])

  useEffect(() => {
    if (!TURNSTILE_SITE_KEY) return
    let cancelled = false
    function mount() {
      if (cancelled || !holder.current || !window.turnstile || widgetId.current) return
      widgetId.current = window.turnstile.render(holder.current, {
        sitekey: TURNSTILE_SITE_KEY,
        callback: (t: string) => onTokenRef.current(t),
        'expired-callback': () => onTokenRef.current(null),
        'error-callback': () => onTokenRef.current(null),
      })
    }
    if (window.turnstile) mount()
    else {
      let script = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`)
      if (!script) {
        script = document.createElement('script')
        script.src = SCRIPT_SRC
        script.async = true
        document.head.appendChild(script)
      }
      script.addEventListener('load', mount)
    }
    return () => {
      cancelled = true
      if (widgetId.current && window.turnstile) window.turnstile.remove(widgetId.current)
      widgetId.current = null
    }
  }, [])

  // A token is single-use: after each submit the parent bumps resetSignal to get a fresh challenge.
  useEffect(() => {
    if (resetSignal > 0 && widgetId.current && window.turnstile) {
      window.turnstile.reset(widgetId.current)
      onTokenRef.current(null)
    }
  }, [resetSignal])

  if (!TURNSTILE_SITE_KEY) {
    return <div style={{ fontSize: '13px', color: 'var(--amber)' }}>Sign-in is temporarily unavailable. Please contact the Trescon Ops team.</div>
  }
  return <div ref={holder} />
}
