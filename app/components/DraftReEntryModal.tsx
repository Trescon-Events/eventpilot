'use client'

/*
  Draft re-entry modal. Tools render this on mount when useDraft() returns
  a `mine` value — the user has an in-progress draft for this tool + event.

  Two clear actions: Resume, or Start New. If Start New, the caller's
  onStartNew() should call discard() from useDraft to clean up the old row.
*/

type Props = {
  displayLabel:   string        // e.g. "World AI Show Indonesia"
  statusText:     string | null // e.g. "Website Draft — 3 sections done"
  lastUpdated:    string        // ISO timestamp
  onResume:       () => void
  onStartNew:     () => void
}

function relativeTime(iso: string): string {
  const s = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000))
  if (s < 60)        return 'just now'
  if (s < 3600)      return Math.floor(s / 60)    + ' minutes ago'
  if (s < 86400)     return Math.floor(s / 3600)  + ' hours ago'
  if (s < 86400 * 7) return Math.floor(s / 86400) + ' days ago'
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

export default function DraftReEntryModal({
  displayLabel, statusText, lastUpdated, onResume, onStartNew,
}: Props) {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(15, 25, 35, 0.62)',
      zIndex: 9500, display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '20px', fontFamily: 'var(--font-manrope), sans-serif',
    }}>
      <div style={{
        background: 'var(--card)', borderRadius: '18px', padding: '32px 32px 28px',
        maxWidth: '460px', width: '100%',
        boxShadow: '0 30px 60px rgba(0, 0, 0, 0.25)',
      }}>
        <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--teal)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '10px' }}>
          You have a draft
        </div>

        <div style={{ fontSize: '22px', fontWeight: 800, color: 'var(--ink)', letterSpacing: '-0.3px', lineHeight: 1.25, marginBottom: '6px' }}>
          {displayLabel}
        </div>

        {statusText && (
          <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--ink3)', marginBottom: '4px' }}>
            {statusText}
          </div>
        )}

        <div style={{ fontSize: '13px', color: 'var(--ink4)', marginBottom: '28px' }}>
          Last edited {relativeTime(lastUpdated)}.
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={onResume}
            style={{
              flex: 1, padding: '13px 20px', borderRadius: '11px',
              background: 'var(--teal)', color: 'var(--teal-light)', border: 'none',
              fontSize: '14px', fontWeight: 800, cursor: 'pointer',
              fontFamily: 'inherit', transition: 'opacity 0.15s',
            }}
            onMouseEnter={e => (e.currentTarget.style.opacity = '0.88')}
            onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
          >
            Resume this draft
          </button>
          <button
            onClick={onStartNew}
            style={{
              flex: 1, padding: '13px 20px', borderRadius: '11px',
              background: 'var(--card)', color: 'var(--ink3)', border: '1px solid var(--border)',
              fontSize: '14px', fontWeight: 800, cursor: 'pointer',
              fontFamily: 'inherit', transition: 'all 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--card-hi)'; e.currentTarget.style.color = 'var(--ink)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'var(--card)'; e.currentTarget.style.color = 'var(--ink3)' }}
          >
            Start new
          </button>
        </div>

        <div style={{ fontSize: '11px', color: 'var(--ink4)', textAlign: 'center', marginTop: '18px', lineHeight: 1.5 }}>
          Starting new will remove this draft. If you want to keep it, click Resume first, then save under a new name.
        </div>
      </div>
    </div>
  )
}
