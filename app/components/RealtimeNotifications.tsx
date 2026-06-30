'use client'

import { useEffect, useRef, useCallback, useState } from 'react'
import { createClient } from '@supabase/supabase-js'

/**
 * RealtimeNotifications — sits in the app layout, always running.
 * Subscribes to Supabase Realtime for notifications + messages.
 * On new event: plays sound (if enabled), shows browser notification, dispatches custom event.
 * User can toggle sound on/off — persisted in localStorage.
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
  const [soundEnabled, setSoundEnabled] = useState(true)
  const [showToggle, setShowToggle] = useState(false)

  // Load preference from localStorage
  useEffect(() => {
    const pref = localStorage.getItem('ep_sound_enabled')
    if (pref === 'false') setSoundEnabled(false)
  }, [])

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

  function toggleSound() {
    const next = !soundEnabled
    setSoundEnabled(next)
    localStorage.setItem('ep_sound_enabled', String(next))
    setShowToggle(false)
  }

  const playSound = useCallback(() => {
    if (!soundEnabled) return
    const now = Date.now()
    if (now - lastSoundRef.current < 3000) return
    lastSoundRef.current = now
    if (audioRef.current) {
      audioRef.current.currentTime = 0
      audioRef.current.play().catch(() => {})
    }
  }, [soundEnabled])

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

  return (
    <>
      <audio ref={audioRef} src="/notification.wav" preload="auto" style={{ display: 'none' }} />
      {/* Sound toggle — fixed bottom-left */}
      <button
        onClick={() => setShowToggle(!showToggle)}
        style={{
          position: 'fixed', bottom: 16, left: 16, zIndex: 900,
          width: 36, height: 36, borderRadius: '50%',
          border: `1px solid ${soundEnabled ? '#00897B30' : '#DDE8EE'}`,
          background: soundEnabled ? '#00897B10' : '#F6F8FB',
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'all 0.15s',
        }}
        title={soundEnabled ? 'Notification sound: ON' : 'Notification sound: OFF'}
      >
        {soundEnabled ? (
          <svg width="16" height="16" fill="none" stroke="#00897B" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>
        ) : (
          <svg width="16" height="16" fill="none" stroke="#B8CDD8" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>
        )}
      </button>
      {showToggle && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 899 }} onClick={() => setShowToggle(false)} />
          <div style={{ position: 'fixed', bottom: 58, left: 16, zIndex: 901, background: '#FFFFFF', border: '1px solid #DDE8EE', borderRadius: 10, boxShadow: '0 4px 20px rgba(0,0,0,0.12)', padding: '8px 6px', minWidth: 180 }}>
            <button onClick={toggleSound} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 8, border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit', width: '100%', textAlign: 'left' }}>
              {soundEnabled ? (
                <svg width="16" height="16" fill="none" stroke="#8B1A1A" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>
              ) : (
                <svg width="16" height="16" fill="none" stroke="#00897B" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
              )}
              <span style={{ fontSize: 13, fontWeight: 700, color: '#0F1923' }}>{soundEnabled ? 'Mute notifications' : 'Unmute notifications'}</span>
            </button>
          </div>
        </>
      )}
    </>
  )
}
