'use client'

/*
  Resume Work — the sidebar section Khalifa asked for.

  Renders inside the /admin/toolkit left sidebar, below the tools list,
  showing this user's active drafts (personal + team-shared). Click
  navigates directly to the tool + event so the user resumes with a
  single click.

  Requires callers to pass a `resolveRoute(toolKey, eventId)` function so
  the sidebar doesn't need to know about the tool catalogue itself.
*/

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

type Draft = {
  id:               string
  tool_key:         string
  event_id:         string | null
  event_name:       string | null
  tool_record_id:   string | null
  display_label:    string
  status_text:      string | null
  last_updated:     string
  shared_with_team: boolean
  is_mine:          boolean
  owner_name:       string | null
}

type Props = {
  resolveRoute: (toolKey: string, eventId: string | null) => string | null
  toolLabels?: Record<string, string>
}

function relativeTime(iso: string): string {
  const s = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000))
  if (s < 60)        return 'just now'
  if (s < 3600)      return Math.floor(s / 60)    + 'm ago'
  if (s < 86400)     return Math.floor(s / 3600)  + 'h ago'
  if (s < 86400 * 7) return Math.floor(s / 86400) + 'd ago'
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

export default function ResumeSidebar({ resolveRoute, toolLabels }: Props) {
  const router = useRouter()
  const [drafts,  setDrafts]  = useState<Draft[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/drafts', { cache: 'no-store' })
      .then(r => r.json())
      .then(d => {
        if (Array.isArray(d?.drafts)) setDrafts(d.drafts as Draft[])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const goTo = (d: Draft) => {
    const route = resolveRoute(d.tool_key, d.event_id)
    if (route) router.push(route)
  }

  const toggleShare = async (d: Draft) => {
    const next = !d.shared_with_team
    setDrafts(prev => prev.map(x => x.id === d.id ? { ...x, shared_with_team: next } : x))
    try {
      await fetch(`/api/drafts/${d.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shared_with_team: next }),
      })
    } catch {
      // revert on failure
      setDrafts(prev => prev.map(x => x.id === d.id ? { ...x, shared_with_team: !next } : x))
    }
  }

  return (
    <div style={{ marginTop: '18px', padding: '18px 16px 20px', borderTop: '1px solid #1A2B3C' }}>
      <div style={{ fontSize: '11px', fontWeight: 800, color: '#5B7080', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '10px' }}>
        Resume Work
      </div>

      {loading ? (
        <div style={{ fontSize: '12px', color: '#5B7080', padding: '4px 0' }}>Loading…</div>
      ) : drafts.length === 0 ? (
        <div style={{ fontSize: '12px', color: '#5B7080', padding: '4px 0', lineHeight: 1.6 }}>
          Your unfinished work will appear here as you save drafts inside the tools.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {drafts.map(d => {
            const toolLabel = (toolLabels && toolLabels[d.tool_key]) ?? d.tool_key.replace(/_/g, ' ')
            const status    = d.status_text ?? toolLabel
            return (
              <div
                key={d.id}
                onClick={() => goTo(d)}
                style={{
                  padding: '10px 12px', borderRadius: '10px',
                  cursor: 'pointer', transition: 'background 0.15s',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = '#1A2B3C')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#F5F5F2', lineHeight: 1.3, marginBottom: '2px' }}>
                  {d.event_name ?? d.display_label}
                </div>
                <div style={{ fontSize: '11px', color: '#8CA0B3', lineHeight: 1.3, marginBottom: '2px' }}>
                  {status}
                </div>
                <div style={{ fontSize: '10px', color: '#5B7080', display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <span>Last edited {relativeTime(d.last_updated)}</span>
                  {!d.is_mine && d.owner_name && (
                    <>
                      <span style={{ color: '#3A4A5A' }}>·</span>
                      <span style={{ color: '#D4AF37' }}>Shared by {d.owner_name.split(' ')[0]}</span>
                    </>
                  )}
                  {d.is_mine && (
                    <>
                      <span style={{ color: '#3A4A5A' }}>·</span>
                      <button
                        onClick={e => { e.stopPropagation(); toggleShare(d) }}
                        style={{
                          background: 'transparent', border: 'none', padding: 0,
                          fontSize: '10px', fontFamily: 'inherit', cursor: 'pointer',
                          color: d.shared_with_team ? '#D4AF37' : '#5B7080',
                          fontWeight: d.shared_with_team ? 700 : 400,
                          textDecoration: 'underline', textUnderlineOffset: '2px',
                        }}
                        title={d.shared_with_team ? 'Click to make private' : 'Click to share this draft with your team'}
                      >
                        {d.shared_with_team ? 'Shared with team ✓' : 'Share with team'}
                      </button>
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
