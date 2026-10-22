'use client'

import { useEffect, useSyncExternalStore } from 'react'
import { dismissNotice, getNotices, subscribeNotices, type Notice } from '@/app/lib/ui/notify'

/* The stack of notifications, top-right, newest at the bottom. Success clears itself after 6s (pauses while hovered, via CSS-free timer reset on
   mouse-leave); errors stay until closed — a failure must never disappear before it is read. Every one has a clear × button. */

const EMPTY: Notice[] = []

function Item({ n }: { n: Notice }) {
  useEffect(() => {
    if (n.type !== 'success') return
    const t = setTimeout(() => dismissNotice(n.id), 6000)
    return () => clearTimeout(t)
  }, [n.id, n.type])
  const err = n.type === 'error'
  return (
    <div role={err ? 'alert' : 'status'} style={{
      display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '12px 12px 12px 16px', borderRadius: '10px', width: '380px', maxWidth: 'calc(100vw - 40px)',
      background: err ? 'var(--red-light)' : 'var(--teal-light)', border: `1px solid ${err ? 'var(--red-border)' : 'var(--teal-mid)'}`,
      color: err ? 'var(--red)' : 'var(--teal-mid)', boxShadow: 'var(--shadow-md)', fontSize: '13.5px', fontWeight: 700, lineHeight: 1.45,
      animation: 'eventpilot-toast-in 0.2s ease-out',
    }}>
      <span aria-hidden="true" style={{ fontSize: '15px', flexShrink: 0 }}>{err ? '⚠' : '✓'}</span>
      <span style={{ flex: 1, wordBreak: 'break-word' }}>{n.message}</span>
      <button onClick={() => dismissNotice(n.id)} aria-label="Close notification" title="Close"
        style={{ background: 'color-mix(in srgb, currentColor 14%, transparent)', border: 'none', cursor: 'pointer', color: 'inherit', fontSize: '18px', fontWeight: 800, lineHeight: 1, width: '26px', height: '26px', borderRadius: '6px', flexShrink: 0 }}>
        ×
      </button>
    </div>
  )
}

export default function ToastViewport() {
  const list = useSyncExternalStore(subscribeNotices, getNotices, () => EMPTY)
  if (!list.length) return null
  return (
    <div style={{ position: 'fixed', top: '20px', right: '20px', zIndex: 1000, display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'flex-end' }}>
      {list.map(n => <Item key={n.id} n={n} />)}
      <style>{'@keyframes eventpilot-toast-in { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }'}</style>
    </div>
  )
}
