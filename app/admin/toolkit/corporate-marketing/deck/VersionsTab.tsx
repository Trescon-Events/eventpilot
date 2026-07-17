'use client'

/*
  Version History tab. Lists every published corporate_deck_versions row
  (newest first) with version number, publisher, date, change summary,
  and a "View PDF" download link (signed URL, 1h expiry).

  No editing — versions are immutable.
*/

import { useCallback, useEffect, useState } from 'react'
import { BRAND, Card, SectionLabel, H2, fmtDate } from './_shared'

type Version = {
  id:                string
  version_number:    number
  published_at:      string
  change_summary:    string | null
  pdf_file_name:     string | null
  pdf_bytes:         number | null
  canva_url:         string | null
  signed_url:        string | null
  published_by_name: string | null
}

function fmtBytes(n: number | null): string {
  if (!n) return ''
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

export default function VersionsTab() {
  const [versions, setVersions] = useState<Version[]>([])
  const [loading, setLoading]   = useState(true)

  const load = useCallback(async () => {
    const res = await fetch('/api/corporate-marketing/versions', { cache: 'no-store' })
    if (res.ok) {
      const d = await res.json()
      setVersions(d.versions ?? [])
    }
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  if (loading) return <Card><div style={{ fontSize: '13px', color: 'var(--ink3)' }}>Loading version history…</div></Card>

  if (versions.length === 0) {
    return (
      <Card>
        <SectionLabel>Version History</SectionLabel>
        <H2 style={{ marginBottom: '6px' }}>No versions yet</H2>
        <div style={{ fontSize: '13px', color: 'var(--ink3)', lineHeight: 1.6 }}>
          Once Marketing clicks <strong>Publish</strong> on the Overview tab, an immutable snapshot of the deck + content is captured here. Every past version stays downloadable forever.
        </div>
      </Card>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px', maxWidth: '980px' }}>
      <Card>
        <SectionLabel>Version History</SectionLabel>
        <H2 style={{ marginBottom: '6px' }}>{versions.length} published version{versions.length === 1 ? '' : 's'}</H2>
        <div style={{ fontSize: '13px', color: 'var(--ink3)', lineHeight: 1.6 }}>
          Every version stores the PDF exactly as it was at publish time. Nothing here can be overwritten or edited.
        </div>
      </Card>

      {versions.map((v, i) => {
        const isLatest = i === 0
        return (
          <Card key={v.id} style={{ padding: '22px 26px', borderColor: isLatest ? `${BRAND}40` : 'var(--border)', background: isLatest ? `${BRAND}03` : 'var(--card)' }}>
            <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <div style={{ minWidth: '80px' }}>
                <div style={{ fontSize: '26px', fontWeight: 900, color: BRAND, letterSpacing: '-0.5px', lineHeight: 1 }}>v{v.version_number}</div>
                {isLatest && (
                  <div style={{ fontSize: '9px', fontWeight: 800, color: BRAND, background: `${BRAND}15`, padding: '3px 8px', borderRadius: '10px', letterSpacing: '0.5px', display: 'inline-block', marginTop: '6px' }}>
                    LATEST
                  </div>
                )}
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '13px', color: 'var(--ink3)', marginBottom: '4px' }}>
                  Published {fmtDate(v.published_at)}
                  {v.published_by_name && <span> · by <strong style={{ color: 'var(--ink)' }}>{v.published_by_name}</strong></span>}
                </div>
                {v.change_summary && (
                  <div style={{ fontSize: '14px', color: 'var(--ink)', lineHeight: 1.6, marginTop: '6px', padding: '10px 14px', background: 'var(--card-hi)', borderRadius: '10px', border: '1px solid var(--border)' }}>
                    {v.change_summary}
                  </div>
                )}
                <div style={{ display: 'flex', gap: '14px', alignItems: 'center', marginTop: '12px', flexWrap: 'wrap' }}>
                  {v.signed_url ? (
                    <a
                      href={v.signed_url}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: '6px',
                        background: BRAND, color: 'var(--red-light)',
                        padding: '9px 18px', borderRadius: '10px',
                        fontSize: '12px', fontWeight: 800, textDecoration: 'none',
                      }}
                    >
                      Download PDF
                      <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                    </a>
                  ) : (
                    <span style={{ fontSize: '12px', color: 'var(--ink3)', fontStyle: 'italic' }}>PDF unavailable</span>
                  )}
                  {v.canva_url && (
                    <a
                      href={v.canva_url}
                      target="_blank"
                      rel="noreferrer"
                      style={{ fontSize: '12px', fontWeight: 700, color: BRAND, textDecoration: 'none' }}
                    >
                      Open Canva ↗
                    </a>
                  )}
                  <span style={{ fontSize: '11px', color: 'var(--ink3)', fontWeight: 600 }}>
                    {v.pdf_file_name} {fmtBytes(v.pdf_bytes) && `· ${fmtBytes(v.pdf_bytes)}`}
                  </span>
                </div>
              </div>
            </div>
          </Card>
        )
      })}
    </div>
  )
}
