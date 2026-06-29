'use client'

import { useEffect, useRef, useCallback } from 'react'
import { createClient } from '@supabase/supabase-js'

/**
 * RealtimeNotifications — sits in the app layout, always running.
 * Subscribes to Supabase Realtime for notifications + messages.
 * On new event: plays sound, shows browser notification, dispatches custom event for NavBar badge update.
 */

// Create a single shared Supabase client for Realtime
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
  const staffIdRef = useRef<string | null>(null)
  const lastSoundRef = useRef(0)

  const playSound = useCallback(() => {
    // Throttle: max one sound per 3 seconds
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
    // Only show if tab is not focused
    if (document.hasFocus()) return
    const notif = new Notification(title, {
      body,
      icon: '/favicon-192.png',
      tag: 'eventpilot-' + Date.now(),
      silent: true, // we play our own sound
    })
    notif.onclick = () => {
      window.focus()
      notif.close()
    }
    // Auto-close after 6 seconds
    setTimeout(() => notif.close(), 6000)
  }, [])

  useEffect(() => {
    const sid = getStaffId()
    if (!sid || sid === 'super-admin') return
    staffIdRef.current = sid

    // Request browser notification permission (one-time, non-blocking)
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {})
    }

    const sb = getRealtimeClient()

    // Subscribe to notifications table
    const notifChannel = sb.channel(`rt-notif-${sid}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `staff_id=eq.${sid}`,
      }, (payload) => {
        const row = payload.new as { title?: string; body?: string; type?: string }
        playSound()
        showBrowserNotification(row.title ?? 'New Notification', row.body ?? '')
        // Dispatch custom event so NavBar can update badge count
        window.dispatchEvent(new CustomEvent('ep:new-notification', { detail: row }))
      })
      .subscribe()

    // Subscribe to messages table
    const msgChannel = sb.channel(`rt-msg-${sid}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `to_id=eq.${sid}`,
      }, (payload) => {
        const row = payload.new as { from_name?: string; body?: string }
        playSound()
        showBrowserNotification(row.from_name ?? 'New Message', row.body ?? '')
        // Dispatch custom event so NavBar can update message badge
        window.dispatchEvent(new CustomEvent('ep:new-message', { detail: row }))
      })
      .subscribe()

    return () => {
      notifChannel.unsubscribe()
      msgChannel.unsubscribe()
    }
  }, [playSound, showBrowserNotification])

  return (
    <audio ref={audioRef} src="/notification.wav" preload="auto" style={{ display: 'none' }} />
  )
}
