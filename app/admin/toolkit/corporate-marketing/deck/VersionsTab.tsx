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

type Readiness = {
  current_version:   number
  published_version: number | null
  changes_since_publish?: number
}

export default function VersionsTab() {
  const [versions, setVersions]   = useState<Version[]>([])
  const [readiness, setReadiness] = useState<Readiness | null>(null)
  const [loading, setLoading]     = useState(true)

  const load = useCallback(async () => {
    // Load published versions AND current-draft state so we can prepend
    // the unpublished draft as a top row (Thulasi 10 Aug — Overview showed
    // "v5" but Version History only listed v4; the draft wasn't visible).
    const [vRes, rRes] = await Promise.all([
      fetch('/api/corporate-marketing/versions',         { cache: 'no-store' }),
      fetch('/api/corporate-marketing/deck/readiness',   { cache: 'no-store' }),
    ])
    if (vRes.ok) { const d = await vRes.json(); setVersions(d.versions ?? []) }
    if (rRes.ok) { const d = await rRes.json(); setReadiness(d) }
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  if (loading) return <Card><div style={{ fontSize: '13px', color: 'var(--ink3)' }}>Loading version history…</div></Card>

  // Draft is "real" when the working current_version exceeds what's
  // been published — i.e. content has changed since last publish.
  const hasDraft = !!readiness
    && readiness.current_version > 0
    && (readiness.published_version == null || readiness.current_version > readiness.published_version)
  const draftNumber = readiness?.current_version ?? 0

  if (versions.length === 0 && !hasDraft) {
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
        <H2 style={{ marginBottom: '6px' }}>
          {versions.length} published version{versions.length === 1 ? '' : 's'}
          {hasDraft && <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--amber)', marginLeft: '10px' }}>· 1 draft in progress</span>}
        </H2>
        <div style={{ fontSize: '13px', color: 'var(--ink3)', lineHeight: 1.6 }}>
          Every published version stores the PDF exactly as it was at publish time. Nothing here can be overwritten or edited. The current draft appears at the top until you click <strong>Publish</strong> on the Overview tab.
        </div>
      </Card>

      {/* Thulasi 10 Aug — unpublished draft appears above published versions
          so the Overview "v5 (last published v4)" line has an entry here too. */}
      {hasDraft && (
        <Card style={{ padding: '22px 26px', borderColor: 'var(--amber)40', background: 'var(--amber-light)' }}>
          <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div style={{ minWidth: '80px' }}>
              <div style={{ fontSize: '26px', fontWeight: 900, color: 'var(--amber)', letterSpacing: '-0.5px', lineHeight: 1 }}>v{draftNumber}</div>
              <div style={{
                fontSize: '9px', fontWeight: 800, color: 'var(--amber)', background: '#F5B94D22',
                padding: '3px 8px', borderRadius: '10px', letterSpacing: '0.5px',
                display: 'inline-block', marginTop: '6px', border: '1px solid #F5B94D40',
              }}>
                DRAFT · UNPUBLISHED
              </div>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '14px', color: 'var(--ink)', lineHeight: 1.55 }}>
                Content has changed since the last published version
                {readiness?.published_version != null && <> (<strong>v{readiness.published_version}</strong>)</>}.
                {readiness?.changes_since_publish != null && readiness.changes_since_publish > 0 && (
                  <> {readiness.changes_since_publish} section{readiness.changes_since_publish === 1 ? '' : 's'} modified.</>
                )}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--ink3)', marginTop: '8px' }}>
                Go to the <strong>Overview</strong> tab and click <strong>Publish</strong> to lock this as v{draftNumber} and add it to the immutable history below.
              </div>
            </div>
          </div>
        </Card>
      )}

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
