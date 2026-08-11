'use client'

/**
 * Assets tab — 3-category dashboard (Nic build_request 517e232e).
 *
 *   1. Brand & Styling      — client logo + brand guidelines uploaders,
 *                             design references list, Brand Studio redirect.
 *   2. Campaign Media       — speaker cards with per-speaker headshot uploader,
 *                             promotional links.
 *   3. Data & Lead Lists    — copyable target companies + target job titles,
 *                             pre-registration questionnaire.
 *
 * Renders below the preserved Quick Links block in the Assets tab of
 * `app/admin/bespoke/[id]/page.tsx`. Uses the shared color / border / card
 * tokens from the dark theme (var(--card), var(--border), var(--ink*)) so
 * it visually matches the surrounding page without introducing new design.
 *
 * All uploads go through POST /api/bespoke/upload-asset (single generic
 * endpoint, kind ∈ { client_logo | brand_guidelines | speaker_headshot }).
 */

import { useState, useRef, useCallback } from 'react'
import Link from 'next/link'

type Speaker    = { name: string; title: string; company: string; bio: string; headshot_url?: string }
type AgendaItem = { time: string; title: string; description: string }

type BespokeProjectAssetsShape = {
  id:                     string
  event_id?:              string | null
  client_company:         string
  target_accounts_list?:  string | null
  icp_job_titles?:        string[] | null
  icp_industries?:        string[] | null
  icp_geographies?:       string[] | null
  registration_questions?: Array<{ question: string; options: string[] }> | null
  speakers?:              Speaker[] | null
  agenda?:                AgendaItem[] | null   // Nic 590aa5c2
  client_assets_url?:     string | null
  client_logo_url?:       string | null
  brand_guidelines_url?:  string | null
}

const INK      = 'var(--ink)'
const INK3     = 'var(--ink3)'
const CARD     = 'var(--card)'
const BORDER   = 'var(--border)'
const AMBER    = '#F5B94D'
const TEAL     = '#0d9488'

const CARD_STYLE: React.CSSProperties = {
  background: CARD, borderRadius: '12px', border: `1px solid ${BORDER}`, padding: '24px',
}
const H3_STYLE: React.CSSProperties = {
  margin: '0 0 16px', fontSize: '15px', fontWeight: 800, color: INK,
}
const LABEL_STYLE: React.CSSProperties = {
  fontSize: '12px', fontWeight: 700, color: INK3, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px', display: 'block',
}

// Parse target_accounts_list — Nic's spec: could be a comma or newline list.
function splitList(s: string | null | undefined): string[] {
  if (!s) return []
  return s
    .split(/[\n,;]+/)
    .map(x => x.trim())
    .filter(Boolean)
}

// Extract simple http(s) URLs from a free-text field.
function extractUrls(s: string | null | undefined): string[] {
  if (!s) return []
  return (s.match(/https?:\/\/[^\s)<>"']+/g) ?? []).slice(0, 12)
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

// Single file-upload button used by all three uploader UIs.
function UploadButton({
  label,
  accept,
  currentUrl,
  onPickFile,
  busy,
  error,
}: {
  label: string
  accept: string
  currentUrl?: string | null
  onPickFile: (f: File) => void
  busy: boolean
  error: string | null
}) {
  const ref = useRef<HTMLInputElement>(null)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <input
        ref={ref}
        type="file"
        accept={accept}
        style={{ display: 'none' }}
        onChange={e => {
          const f = e.target.files?.[0]
          if (f) onPickFile(f)
          e.target.value = ''
        }}
      />
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
        <button
          type="button"
          disabled={busy}
          onClick={() => ref.current?.click()}
          style={{
            padding: '8px 16px', borderRadius: '8px', border: `1px solid ${BORDER}`,
            background: busy ? 'var(--surface)' : CARD, color: INK,
            fontSize: '13px', fontWeight: 700, cursor: busy ? 'wait' : 'pointer',
            fontFamily: 'var(--font-manrope)',
          }}
        >
          {busy ? 'Uploading…' : (currentUrl ? 'Replace ' + label : 'Upload ' + label)}
        </button>
        {currentUrl && !busy && (
          <a href={currentUrl} target="_blank" rel="noreferrer"
            style={{ fontSize: '12px', color: AMBER, textDecoration: 'underline' }}>
            View current
          </a>
        )}
      </div>
      {error && (
        <div style={{ fontSize: '12px', color: 'var(--red)' }}>{error}</div>
      )}
    </div>
  )
}

function CopyChip({ text }: { text: string }) {
  const [flash, setFlash] = useState(false)
  return (
    <button
      type="button"
      onClick={async () => {
        const ok = await copyToClipboard(text)
        if (ok) { setFlash(true); setTimeout(() => setFlash(false), 1200) }
      }}
      style={{
        padding: '4px 10px', borderRadius: '999px', border: `1px solid ${BORDER}`,
        background: flash ? '#0d948833' : 'var(--surface)',
        color: flash ? TEAL : INK, cursor: 'pointer',
        fontSize: '11px', fontWeight: 700, fontFamily: 'var(--font-manrope)',
      }}>
      {flash ? '✓ Copied' : 'Copy List'}
    </button>
  )
}

/** Nic 590aa5c2 — one-click Copy Agenda for copywriters/web builders.
 *  Formats each item as "• 5:30pm - 6:00pm — Start · Arrival, welcome drinks
 *  & networking" so the pasted text stays readable on a landing-page brief. */
function CopyAgendaButton({ agenda }: { agenda: Array<{ time: string; title: string; description: string }> }) {
  const [flash, setFlash] = useState(false)
  const formatted = agenda.map(a => {
    const parts = [a.time || '', a.title || ''].filter(Boolean).join(' — ')
    return a.description ? `• ${parts} · ${a.description}` : `• ${parts}`
  }).join('\n')
  return (
    <button
      type="button"
      onClick={async () => {
        const ok = await copyToClipboard(formatted)
        if (ok) { setFlash(true); setTimeout(() => setFlash(false), 1200) }
      }}
      style={{
        padding: '4px 10px', borderRadius: '999px', border: `1px solid ${BORDER}`,
        background: flash ? '#0d948833' : 'var(--surface)',
        color: flash ? TEAL : INK, cursor: 'pointer',
        fontSize: '11px', fontWeight: 700, fontFamily: 'var(--font-manrope)',
      }}>
      {flash ? '✓ Copied' : 'Copy Agenda'}
    </button>
  )
}

/** Nic df915458 — vertical bullet-list render for ICP arrays. Replaces
 *  the previous horizontal chip cloud which cluttered on long entries. */
function IcpBulletList({ items }: { items: string[] }) {
  if (items.length === 0) {
    return <div style={{ fontSize: '12px', color: INK3 }}>None yet — add via Brief tab.</div>
  }
  return (
    <div style={{ maxHeight: '220px', overflowY: 'auto', paddingRight: '4px' }}>
      {items.map((t, i) => (
        <div key={i} style={{
          display: 'flex', alignItems: 'flex-start', gap: 8,
          margin: '6px 0', fontSize: 13, color: INK, lineHeight: 1.5,
        }}>
          <span style={{ color: TEAL, fontWeight: 800, lineHeight: 1 }}>•</span>
          <span>{t}</span>
        </div>
      ))}
    </div>
  )
}

export default function AssetsTabContent({
  project,
  onReload,
}: {
  project: BespokeProjectAssetsShape
  onReload: () => void
}) {
  // Per-slot busy + error state so a failed logo upload doesn't disable the
  // brand-guidelines button (or vice versa).
  const [busy,  setBusy]  = useState<Record<string, boolean>>({})
  const [error, setError] = useState<Record<string, string | null>>({})

  const setSlotBusy  = (k: string, v: boolean)          => setBusy(prev  => ({ ...prev, [k]: v }))
  const setSlotError = (k: string, v: string | null)    => setError(prev => ({ ...prev, [k]: v }))

  const upload = useCallback(async (
    kind: 'client_logo' | 'brand_guidelines' | 'speaker_headshot',
    file: File,
    slotKey: string,
    speakerIdx?: number,
  ) => {
    setSlotBusy(slotKey, true); setSlotError(slotKey, null)
    try {
      const fd = new FormData()
      fd.set('file', file)
      fd.set('project_id', project.id)
      fd.set('kind', kind)
      if (speakerIdx !== undefined) fd.set('speaker_idx', String(speakerIdx))
      const res = await fetch('/api/bespoke/upload-asset', { method: 'POST', body: fd })
      const j = await res.json().catch(() => ({} as { error?: string }))
      if (!res.ok) throw new Error(j?.error ?? 'Upload failed')
      onReload()
    } catch (e) {
      setSlotError(slotKey, e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setSlotBusy(slotKey, false)
    }
  }, [project.id, onReload])

  // Design references — ONLY the explicit client_assets_url. Previous
  // implementation also harvested any URL from target_accounts_list free-text
  // and displayed them as design refs, which is a hallucination — those are
  // account company websites, not design inspiration. Nic 3173e664: the
  // brief parser should not assume; if the brief has no design-reference
  // link, none is shown.
  const designRefs: string[] = [project.client_assets_url]
    .filter((x): x is string => !!x && /^https?:\/\//i.test(x))

  const speakers        = project.speakers        ?? []
  const targetAccounts  = splitList(project.target_accounts_list)
  const targetJobTitles = project.icp_job_titles  ?? []
  const targetIndustries  = project.icp_industries  ?? []
  const targetGeographies = project.icp_geographies ?? []
  const regQuestions    = project.registration_questions ?? []
  const promoLinks      = speakers.flatMap(sp => extractUrls(sp.bio ?? ''))  // best-effort: promo URLs sometimes appear in the bio blob
  const agenda          = project.agenda ?? []   // Nic 590aa5c2 — surface agenda on Assets tab

  const brandStudioHref = project.event_id ? `/admin/events/${project.event_id}/brand` : '/admin/toolkit/brand-studio'

  return (
    <>
      {/* ═══ 1. Brand & Styling ═══════════════════════════════════════ */}
      <div style={CARD_STYLE}>
        <h3 style={H3_STYLE}>Brand &amp; Styling</h3>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
          <div>
            <span style={LABEL_STYLE}>Client Logo</span>
            <UploadButton
              label="logo"
              accept="image/*"
              currentUrl={project.client_logo_url}
              busy={!!busy.logo}
              error={error.logo ?? null}
              onPickFile={f => upload('client_logo', f, 'logo')}
            />
          </div>
          <div>
            <span style={LABEL_STYLE}>Brand Guidelines</span>
            <UploadButton
              label="brand guidelines"
              accept="application/pdf,image/*,.doc,.docx"
              currentUrl={project.brand_guidelines_url}
              busy={!!busy.brand}
              error={error.brand ?? null}
              onPickFile={f => upload('brand_guidelines', f, 'brand')}
            />
          </div>
        </div>

        {designRefs.length > 0 && (
          <div style={{ marginBottom: '20px' }}>
            <span style={LABEL_STYLE}>Design References</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {designRefs.map((url, i) => (
                <a key={i} href={url} target="_blank" rel="noreferrer" style={{ fontSize: '13px', color: AMBER, textDecoration: 'underline', wordBreak: 'break-all' }}>
                  {url}
                </a>
              ))}
            </div>
          </div>
        )}

        <Link href={brandStudioHref} style={{
          display: 'inline-block', padding: '10px 20px', borderRadius: '8px', border: 'none',
          background: TEAL, color: '#FFFFFF', fontSize: '13px', fontWeight: 700,
          textDecoration: 'none', fontFamily: 'var(--font-manrope)',
        }}>
          Open Brand Studio
        </Link>
      </div>

      {/* ═══ 2. Campaign Media ════════════════════════════════════════ */}
      <div style={CARD_STYLE}>
        <h3 style={H3_STYLE}>Campaign Media</h3>

        {speakers.length === 0 ? (
          <div style={{ fontSize: '13px', color: INK3, padding: '12px 0' }}>
            No speakers on the brief yet. Add speakers in the Brief tab.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}>
            {speakers.map((sp, i) => {
              const slot = 'sp_' + i
              return (
                <div key={i} style={{
                  display: 'grid', gridTemplateColumns: '80px 1fr auto', gap: '14px',
                  padding: '14px', borderRadius: '8px', border: `1px solid ${BORDER}`, alignItems: 'center',
                }}>
                  <div style={{
                    width: '80px', height: '80px', borderRadius: '8px',
                    background: sp.headshot_url ? `url(${sp.headshot_url}) center/cover no-repeat` : 'var(--surface)',
                    border: `1px solid ${BORDER}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '11px', color: INK3,
                  }}>
                    {!sp.headshot_url && 'No photo'}
                  </div>
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: 700, color: INK }}>{sp.name || '(unnamed speaker)'}</div>
                    <div style={{ fontSize: '12px', color: INK3 }}>{[sp.title, sp.company].filter(Boolean).join(' · ') || '—'}</div>
                    {sp.bio && (
                      <div style={{ fontSize: '12px', color: INK3, marginTop: '4px', lineHeight: 1.4 }}>{sp.bio.slice(0, 160)}{sp.bio.length > 160 ? '…' : ''}</div>
                    )}
                  </div>
                  <UploadButton
                    label="headshot"
                    accept="image/*"
                    currentUrl={sp.headshot_url}
                    busy={!!busy[slot]}
                    error={error[slot] ?? null}
                    onPickFile={f => upload('speaker_headshot', f, slot, i)}
                  />
                </div>
              )
            })}
          </div>
        )}

        {promoLinks.length > 0 && (
          <div>
            <span style={LABEL_STYLE}>Promotional Links</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {promoLinks.map((url, i) => (
                <a key={i} href={url} target="_blank" rel="noreferrer" style={{ fontSize: '13px', color: AMBER, textDecoration: 'underline', wordBreak: 'break-all' }}>
                  {url}
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Nic 590aa5c2 — Event Agenda rendered inside Campaign Media so
             copywriters + web builders can grab the timeline. Time range
             on the left, session title + description on the right. */}
        {agenda.length > 0 && (
          <div style={{ marginTop: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <span style={LABEL_STYLE}>Event Agenda</span>
              <CopyAgendaButton agenda={agenda} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {agenda.map((a, i) => (
                <div key={i} style={{
                  display: 'grid', gridTemplateColumns: '140px 1fr', gap: '14px',
                  padding: '10px 14px', borderRadius: '8px', border: `1px solid ${BORDER}`,
                }}>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: TEAL, whiteSpace: 'nowrap' }}>
                    {a.time || '—'}
                  </div>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: INK }}>{a.title || '(untitled)'}</div>
                    {a.description && (
                      <div style={{ fontSize: '12px', color: INK3, marginTop: '2px', lineHeight: 1.45 }}>
                        {a.description}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ═══ 3. Data & Lead Lists ═════════════════════════════════════ */}
      <div style={CARD_STYLE}>
        <h3 style={H3_STYLE}>Data &amp; Lead Lists</h3>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <span style={LABEL_STYLE}>Target Companies</span>
              {targetAccounts.length > 0 && <CopyChip text={targetAccounts.join('\n')} />}
            </div>
            {targetAccounts.length === 0 ? (
              <div style={{ fontSize: '12px', color: INK3 }}>None yet — add via Brief tab.</div>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', maxHeight: '220px', overflowY: 'auto', paddingRight: '4px' }}>
                {targetAccounts.map((a, i) => (
                  <span key={i} style={{
                    fontSize: '12px', padding: '3px 10px', borderRadius: '999px',
                    background: 'var(--surface)', color: INK, border: `1px solid ${BORDER}`,
                  }}>{a}</span>
                ))}
              </div>
            )}
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <span style={LABEL_STYLE}>Target Job Titles</span>
              {targetJobTitles.length > 0 && <CopyChip text={targetJobTitles.join('\n')} />}
            </div>
            <IcpBulletList items={targetJobTitles} />
          </div>
        </div>

        {/* Nic df915458 — Industries + Geographies as vertical bullet lists
             (not horizontal chips) so long entries don't wrap cluttered. */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <span style={LABEL_STYLE}>Target Industries</span>
              {targetIndustries.length > 0 && <CopyChip text={targetIndustries.join('\n')} />}
            </div>
            <IcpBulletList items={targetIndustries} />
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <span style={LABEL_STYLE}>Target Geographies</span>
              {targetGeographies.length > 0 && <CopyChip text={targetGeographies.join('\n')} />}
            </div>
            <IcpBulletList items={targetGeographies} />
          </div>
        </div>

        {regQuestions.length > 0 && (
          <div>
            <span style={LABEL_STYLE}>Pre-Registration Questionnaire</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {regQuestions.map((q, i) => (
                <div key={i} style={{ padding: '10px 12px', borderRadius: '8px', border: `1px solid ${BORDER}` }}>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: INK, marginBottom: q.options?.length ? '6px' : 0 }}>{q.question}</div>
                  {q.options?.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                      {q.options.map((o, j) => (
                        <span key={j} style={{
                          fontSize: '11px', padding: '2px 8px', borderRadius: '4px',
                          background: 'var(--surface)', color: INK3, border: `1px solid ${BORDER}`,
                        }}>{o}</span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  )
}
