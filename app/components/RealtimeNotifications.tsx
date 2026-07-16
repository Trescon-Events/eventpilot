'use client'

import { useEffect, useRef, useCallback, useState } from 'react'
import { createClient } from '@supabase/supabase-js'

/**
 * RealtimeNotifications — sits in the app layout, always running.
 * Subscribes to Supabase Realtime for notifications + messages.
 * On new event: plays sound (if enabled), shows browser notification, dispatches custom event.
 *
 * The on/off toggle itself moved into NavBar's SoundToggle button (between
 * Help and Profile in the top bar) on 15 Jul 2026 — this component used to
 * render its own floating bottom-left button for it. Both read/write the
 * same 'ep_sound_enabled' localStorage key; this component re-reads it at
 * play-time rather than holding it in React state, so the two never need to
 * stay in sync with each other.
 */

let _rtClient: ReturnType<typeof createClient> | null = null
function getRealtimeClient() {
  if (!_rtClient) {
    _rtClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
  }
  return _rtClient
}

function getStaffId(): string | null {
  if (typeof document === 'undefined') return null
  const raw = document.cookie.split('; ').find(c => c.startsWith('tcs_session='))?.split('=')[1]
  if (!raw) return null
  try { return (JSON.parse(atob(raw)) as { sid?: string }).sid ?? null } catch { return null }
}

export default function RealtimeNotifications() {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const lastSoundRef = useRef(0)
  const [staffId, setStaffId] = useState<string | null>(null)

  // Resolve staff ID — try cookie first, then API
  useEffect(() => {
    const sid = getStaffId()
    if (sid && sid !== 'super-admin') {
      setStaffId(sid)
    } else {
      // Fallback: fetch from session API
      fetch('/api/auth/session').then(r => r.json()).then(s => {
        if (s?.sid && s.sid !== 'super-admin') setStaffId(s.sid)
        // For super-admin, try to find their staff record
        else if (s?.sid === 'super-admin' && s?.email) {
          // Can't subscribe without a real UUID — skip realtime for super-admin
        }
      }).catch(() => {})
    }
  }, [])

  const playSound = useCallback(() => {
    if (localStorage.getItem('ep_sound_enabled') === 'false') return
    const now = Date.now()
    if (now - lastSoundRef.current < 3000) return
    lastSoundRef.current = now
    if (audioRef.current) {
      audioRef.current.currentTime = 0
      audioRef.current.play().catch(() => {})
    }
  }, [])

  const showBrowserNotification = useCallback((title: string, body: string) => {
    if (typeof Notification === 'undefined') return
    if (Notification.permission !== 'granted') return
    if (document.hasFocus()) return
    const notif = new Notification(title, {
      body,
      icon: '/favicon-192.png',
      tag: 'eventpilot-' + Date.now(),
      silent: true,
    })
    notif.onclick = () => { window.focus(); notif.close() }
    setTimeout(() => notif.close(), 6000)
  }, [])

  useEffect(() => {
    if (!staffId) return

    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {})
    }

    const sb = getRealtimeClient()

    const notifChannel = sb.channel(`rt-notif-${staffId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `staff_id=eq.${staffId}`,
      }, (payload) => {
        const row = payload.new as { title?: string; body?: string; type?: string }
        playSound()
        showBrowserNotification(row.title ?? 'New Notification', row.body ?? '')
        window.dispatchEvent(new CustomEvent('ep:new-notification', { detail: row }))
      })
      .subscribe()

    const msgChannel = sb.channel(`rt-msg-${staffId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `to_id=eq.${staffId}`,
      }, (payload) => {
        const row = payload.new as { from_name?: string; body?: string }
        playSound()
        showBrowserNotification(row.from_name ?? 'New Message', row.body ?? '')
        window.dispatchEvent(new CustomEvent('ep:new-message', { detail: row }))
      })
      .subscribe()

    return () => {
      notifChannel.unsubscribe()
      msgChannel.unsubscribe()
    }
  }, [staffId, playSound, showBrowserNotification])

  return <audio ref={audioRef} src="/notification.wav" preload="auto" style={{ display: 'none' }} />
}
