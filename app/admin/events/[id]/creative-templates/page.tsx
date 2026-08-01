'use client'

import { useState, useEffect, use } from 'react'
import Link from 'next/link'
import PageHeader from '@/app/components/PageHeader'
import { Button, Badge, Select } from '@/app/components/ui'
import type { Variant, CreativeTemplateConfig } from '@/app/lib/announcements/composite'

/* Stakeholder Announcement Engine — main workspace (restructured
   2026-07-28 per Madhu's explicit ask). Previously this base path was a
   lightweight landing page linking out to the Stakeholder Hub for actual
   generation, and generation itself happened in a small popup modal on
   that page. Both moved here as a proper full-page workspace:

   - Speaker/Partner sub-sections (matching the Admin Console's own split).
   - Left: the list of stakeholders "approved for announcement"
     (announcement_status === 'ready', set via the Stakeholder Hub's own
     Approve for Announcement action — that page still owns stakeholder
     DATA management; this page owns the CREATIVE).
   - Right: a real workspace, not a dismissible overlay — generate, see a
     genuine inline loading state instead of a silent ~20s wait, review,
     regenerate creative/copy, all without losing the result if you
     navigate to another stakeholder and back (existing announcements are
     fetched up front and shown immediately, no regeneration required just
     to look at something already generated).

   Variant CREATION (the layer-stack editor) lives at ./admin instead —
   branding-team-only, unchanged by this restructure. */

type StakeholderKind = 'speaker' | 'partner'

type Speaker = {
  id: string; full_name: string; job_title: string; company_name: string
  photo_url: string | null; photo_processed_url: string | null; company_logo_url: string | null
  announcement_status: 'pending_review' | 'approved' | 'assets_missing' | 'ready' | 'archived'
}
type Partner = {
  id: string; company_name: string; partner_type: string
  logo_url: string | null
  announcement_status: 'pending_review' | 'approved' | 'assets_missing' | 'ready' | 'archived'
}
type Stakeholder = Speaker | Partner

type AnnouncementSummary = {
  id: string
  speaker_id: string | null
  partner_id: string | null
  post_copy: string | null
  creative_url: string | null
}

function displayName(kind: StakeholderKind, s: Stakeholder): string {
  return kind === 'speaker' ? (s as Speaker).full_name : (s as Partner).company_name
}
function displaySubtitle(kind: StakeholderKind, s: Stakeholder): string {
  return kind === 'speaker' ? `${(s as Speaker).job_title} · ${(s as Speaker).company_name}` : (s as Partner).partner_type.replace(/_/g, ' ')
}
function thumbUrl(kind: StakeholderKind, s: Stakeholder): string | null {
  return kind === 'speaker' ? ((s as Speaker).photo_processed_url || (s as Speaker).photo_url) : (s as Partner).logo_url
}

export default function CreativeTemplatesWorkspacePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = use(params)

  const [activeType, setActiveType] = useState<StakeholderKind>('speaker')
  const [loading, setLoading] = useState(true)
  const [speakers, setSpeakers] = useState<Speaker[]>([])
  const [partners, setPartners] = useState<Partner[]>([])
  const [variants, setVariants] = useState<{ speaker: Variant[]; partner: Variant[] }>({ speaker: [], partner: [] })
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [variantChoice, setVariantChoice] = useState<Record<string, string>>({})
  // Separate from variantChoice (2026-08-01) — that one picks the variant
  // for a fresh generate(); this picks which variant to switch an ALREADY
  // generated draft to on Regenerate Creative. Keeping them independent
  // means picking a different regenerate target doesn't silently change
  // what a later "Generate Again" would use, and vice versa.
  const [regenerateVariantChoice, setRegenerateVariantChoice] = useState<Record<string, string>>({})
  const [msg, setMsg] = useState<string | null>(null)

  const [generating, setGenerating] = useState(false)
  const [regeneratingCreative, setRegeneratingCreative] = useState(false)
  const [regeneratingCopy, setRegeneratingCopy] = useState(false)
  // Per-stakeholder result, keyed by stakeholder id — separate from the
  // fetched `announcements` list so a fresh generate()/regenerate() updates
  // immediately without waiting on a full refetch.
  const [results, setResults] = useState<Record<string, { announcementId: string; creativeUrl: string | null; postCopy: string }>>({})

  const stakeholders: Stakeholder[] = activeType === 'speaker' ? speakers : partners
  const readyStakeholders = stakeholders.filter(s => s.announcement_status === 'ready')
  const selected = readyStakeholders.find(s => s.id === selectedId) ?? null
  const activeVariants = variants[activeType]

  async function fetchAll() {
    setLoading(true)
    const [spRes, ptRes, tplRes, annRes] = await Promise.all([
      fetch(`/api/events/stakeholders/speakers?event_id=${eventId}`),
      fetch(`/api/events/stakeholders/partners?event_id=${eventId}`),
      fetch(`/api/events/templates?event_id=${eventId}`),
      fetch(`/api/events/stakeholders/announcements?event_id=${eventId}`),
    ])
    setSpeakers(await spRes.json().catch(() => []))
    setPartners(await ptRes.json().catch(() => []))
    const config: CreativeTemplateConfig | null = await tplRes.json().catch(() => null)
    setVariants({ speaker: config?.speaker?.variants ?? [], partner: config?.partner?.variants ?? [] })
    const anns: AnnouncementSummary[] = await annRes.json().catch(() => [])
    // Seed `results` from the most recent existing announcement per
    // stakeholder so switching to someone already generated shows their
    // creative immediately — never requires clicking Generate again just
    // to look at it.
    setResults(prev => {
      const next = { ...prev }
      for (const a of anns) {
        const id = a.speaker_id ?? a.partner_id
        if (id && !next[id]) next[id] = { announcementId: a.id, creativeUrl: a.creative_url, postCopy: a.post_copy ?? '' }
      }
      return next
    })
    setLoading(false)
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch-on-mount; matches the sibling stakeholders/admin pages' fetchAll effect
  useEffect(() => { fetchAll() }, [eventId])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset selection on tab switch, derived UI state not a fetch side effect
    setSelectedId(null)
  }, [activeType])

  async function generate(stakeholder: Stakeholder) {
    setGenerating(true)
    setMsg(null)
    const variantId = variantChoice[stakeholder.id]
    const res = await fetch('/api/events/stakeholders/announcements/generate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event_id: eventId,
        stakeholder_type: activeType,
        ...(activeType === 'speaker' ? { speaker_id: stakeholder.id } : { partner_id: stakeholder.id }),
        ...(variantId ? { variant_id: variantId } : {}),
      }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) { setMsg(data.error || 'Announcement generation failed.'); setGenerating(false); return }
    setResults(prev => ({ ...prev, [stakeholder.id]: { announcementId: data.announcement_id, creativeUrl: data.creative_url ?? null, postCopy: data.post_copy ?? '' } }))
    setGenerating(false)
  }

  async function regenerateCreative(announcementId: string, stakeholderId: string) {
    setRegeneratingCreative(true)
    const variantId = regenerateVariantChoice[stakeholderId]
    const res = await fetch(`/api/events/stakeholders/announcements/${announcementId}/regenerate-creative`, {
      method: 'POST',
      ...(variantId ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ variant_id: variantId }) } : {}),
    })
    const data = await res.json().catch(() => ({}))
    if (res.ok) setResults(prev => ({ ...prev, [stakeholderId]: { ...prev[stakeholderId], creativeUrl: data.creative_url } }))
    else setMsg(data.error || 'Could not regenerate the creative.')
    setRegeneratingCreative(false)
  }

  async function regenerateCopy(announcementId: string, stakeholderId: string) {
    setRegeneratingCopy(true)
    const res = await fetch(`/api/events/stakeholders/announcements/${announcementId}/regenerate-copy`, { method: 'POST' })
    const data = await res.json().catch(() => ({}))
    if (res.ok) setResults(prev => ({ ...prev, [stakeholderId]: { ...prev[stakeholderId], postCopy: data.post_copy } }))
    else setMsg(data.error || 'Could not regenerate the post copy.')
    setRegeneratingCopy(false)
  }

  const selectedResult = selected ? results[selected.id] : null
  const photoUrl = selected && activeType === 'speaker' ? ((selected as Speaker).photo_processed_url || (selected as Speaker).photo_url) : null
  const logoUrl = selected ? (activeType === 'speaker' ? (selected as Speaker).company_logo_url : (selected as Partner).logo_url) : null

  return (
    <div style={{ minHeight: '100vh', background: 'var(--surface)' }}>
      <PageHeader
        eyebrow="Event Workspace"
        title="Stakeholder Announcement Engine"
        description="Generate and review stakeholder announcement creatives. Speaker/partner details are managed in the Stakeholder Hub — this workspace covers approved stakeholders only."
        actions={<Link href={`/admin/events/${eventId}/creative-templates/admin`}><Button variant="ghost">Admin Console →</Button></Link>}
      />

      <div style={{ padding: '24px 32px' }}>
        {msg && (
          <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'var(--red-light)', border: '1px solid var(--red-border)', color: 'var(--red)', fontSize: '12.5px', marginBottom: '16px' }}>
            {msg} <button onClick={() => setMsg(null)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontWeight: 700, marginLeft: '8px' }}>×</button>
          </div>
        )}

        <div style={{ display: 'flex', borderRadius: '8px', border: '1px solid var(--border)', overflow: 'hidden', width: 'fit-content', marginBottom: '20px' }}>
          {(['speaker', 'partner'] as const).map(t => (
            <button key={t} onClick={() => setActiveType(t)}
              style={{
                padding: '7px 18px', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: '12.5px', fontWeight: 700,
                background: activeType === t ? 'var(--card)' : 'transparent',
                color: activeType === t ? 'var(--ink)' : 'var(--ink3)',
              }}>
              {t === 'speaker' ? 'Speakers' : 'Partners'}
            </button>
          ))}
        </div>

        {loading ? (
          <div style={{ color: 'var(--ink3)', fontSize: '13px' }}>Loading…</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: '24px', alignItems: 'flex-start' }}>
            {/* Left: approved-for-announcement stakeholder list */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>
                Approved {activeType === 'speaker' ? 'Speakers' : 'Partners'} ({readyStakeholders.length})
              </div>
              {readyStakeholders.map(s => {
                const thumb = thumbUrl(activeType, s)
                const hasResult = !!results[s.id]
                return (
                  <button key={s.id} onClick={() => setSelectedId(s.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 10px', borderRadius: '10px',
                      border: 'none', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit',
                      background: selectedId === s.id ? 'var(--card)' : 'transparent',
                    }}>
                    <div style={{ width: '32px', height: '32px', borderRadius: '8px', overflow: 'hidden', background: 'var(--surface)', border: '1px solid var(--border-light)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {thumb ? (
                        // eslint-disable-next-line @next/next/no-img-element -- small list thumbnail
                        <img src={thumb} alt={displayName(activeType, s)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : <span style={{ fontSize: '13px', color: 'var(--ink4)' }}>{displayName(activeType, s)[0]}</span>}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayName(activeType, s)}</div>
                      <div style={{ fontSize: '10.5px', color: 'var(--ink3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displaySubtitle(activeType, s)}</div>
                    </div>
                    {hasResult && <Badge color="teal">Generated</Badge>}
                  </button>
                )
              })}
              {readyStakeholders.length === 0 && (
                <div style={{ color: 'var(--ink3)', fontSize: '12px', padding: '10px 0', lineHeight: 1.5 }}>
                  No {activeType === 'speaker' ? 'speakers' : 'partners'} approved for announcement yet — approve one from the Stakeholder Hub first.
                </div>
              )}
            </div>

            {/* Right: generation workspace for the selected stakeholder */}
            <div>
              {!selected ? (
                <div style={{ color: 'var(--ink3)', fontSize: '13px', textAlign: 'center', padding: '60px 0' }}>
                  {readyStakeholders.length === 0 ? 'Nothing to generate yet.' : `Select a ${activeType} from the list to generate or review their announcement.`}
                </div>
              ) : (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
                    <div>
                      <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--ink)' }}>{displayName(activeType, selected)}</div>
                      <div style={{ fontSize: '12px', color: 'var(--ink3)' }}>{displaySubtitle(activeType, selected)}</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {activeVariants.length > 1 && (
                        <Select value={variantChoice[selected.id] ?? activeVariants[0]?.id ?? ''}
                          onChange={e => setVariantChoice(v => ({ ...v, [selected.id]: e.target.value }))}
                          title="Creative style" style={{ width: 'auto' }}>
                          {activeVariants.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                        </Select>
                      )}
                      <Button variant="solid" onClick={() => generate(selected)} disabled={generating || activeVariants.length === 0}>
                        {generating ? 'Generating…' : selectedResult ? 'Generate Again' : 'Generate Announcement ▶'}
                      </Button>
                    </div>
                  </div>

                  {activeVariants.length === 0 && (
                    <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'var(--amber-light)', border: '1px solid var(--amber-border)', color: 'var(--amber)', fontSize: '12.5px', marginBottom: '16px' }}>
                      No creative variants configured for {activeType === 'speaker' ? 'speakers' : 'partners'} yet — build one in the <Link href={`/admin/events/${eventId}/creative-templates/admin`} style={{ color: 'inherit', fontWeight: 700 }}>Admin Console</Link> first.
                    </div>
                  )}

                  {generating ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '10px', padding: '100px 0', border: '1px solid var(--border-light)', borderRadius: '12px' }}>
                      <div className="tspinner" style={{ width: '28px', height: '28px', borderRadius: '50%', border: '3px solid var(--border)', borderTopColor: 'var(--teal-mid)', animation: 'tspin 0.8s linear infinite' }} />
                      <div style={{ fontSize: '13px', color: 'var(--ink3)' }}>Generating creative and post copy — this can take up to 20 seconds…</div>
                    </div>
                  ) : selectedResult ? (
                    // Three side-by-side columns, not stacked — a full-bleed
                    // 1080x1350 creative at native-ish width would otherwise
                    // force an absurdly tall page (an early version of this
                    // did exactly that: aspect-ratio applied to a ~1000px-wide
                    // column made the preview 1250px+ tall, burying Post Copy
                    // and the regenerate controls far below the fold). The
                    // preview column is capped so it stays a legible,
                    // reasonably-sized proof of the real creative rather than
                    // trying to fill all available width.
                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 400px) 1fr 240px', gap: '24px', alignItems: 'start' }}>
                      <div>
                        <div style={{ borderRadius: '12px', overflow: 'hidden', background: 'var(--surface)', border: '1px solid var(--border-light)', aspectRatio: '4 / 5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {selectedResult.creativeUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element -- reviewing a freshly generated/regenerated remote asset, not worth next/image's static-optimization pass here
                            <img src={selectedResult.creativeUrl} alt="Generated creative" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                          ) : (
                            <span style={{ fontSize: '12px', color: 'var(--ink3)' }}>No creative generated</span>
                          )}
                        </div>
                        <div style={{ marginTop: '10px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                          {activeVariants.length > 1 && (
                            <Select value={regenerateVariantChoice[selected.id] ?? activeVariants[0]?.id ?? ''}
                              onChange={e => setRegenerateVariantChoice(v => ({ ...v, [selected.id]: e.target.value }))}
                              title="Switch to a different variant on regenerate" style={{ width: 'auto' }}>
                              {activeVariants.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                            </Select>
                          )}
                          <Button variant="ghost" onClick={() => regenerateCreative(selectedResult.announcementId, selected.id)} disabled={regeneratingCreative}>
                            {regeneratingCreative ? 'Regenerating…' : 'Regenerate Creative'}
                          </Button>
                        </div>
                      </div>

                      <div>
                        <div style={{ fontSize: '10.5px', fontWeight: 800, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>Post Copy</div>
                        <div style={{ padding: '14px', borderRadius: '10px', border: '1px solid var(--border-light)', background: 'var(--surface)', fontSize: '13px', color: 'var(--ink2)', whiteSpace: 'pre-wrap', lineHeight: 1.6, minHeight: '200px' }}>
                          {selectedResult.postCopy}
                        </div>
                        <div style={{ marginTop: '10px' }}>
                          <Button variant="ghost" onClick={() => regenerateCopy(selectedResult.announcementId, selected.id)} disabled={regeneratingCopy}>
                            {regeneratingCopy ? 'Regenerating…' : 'Regenerate Post Copy'}
                          </Button>
                        </div>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                        <div style={{ fontSize: '10.5px', fontWeight: 800, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Assets Used</div>
                        {photoUrl && (
                          <div>
                            <div style={{ fontSize: '10.5px', color: 'var(--ink3)', marginBottom: '4px' }}>Photo</div>
                            {/* eslint-disable-next-line @next/next/no-img-element -- small reference thumbnail of the already-processed asset */}
                            <img src={photoUrl} alt="Photo used" style={{ width: '100%', borderRadius: '8px', border: '1px solid var(--border-light)' }} />
                          </div>
                        )}
                        {logoUrl && (
                          <div>
                            <div style={{ fontSize: '10.5px', color: 'var(--ink3)', marginBottom: '4px' }}>Logo</div>
                            <div style={{ background: 'repeating-conic-gradient(var(--border-light) 0% 25%, var(--surface) 0% 50%) 50% / 12px 12px', borderRadius: '8px', padding: '10px' }}>
                              {/* eslint-disable-next-line @next/next/no-img-element -- small reference thumbnail of the already-processed asset */}
                              <img src={logoUrl} alt="Logo used" style={{ width: '100%' }} />
                            </div>
                          </div>
                        )}
                        {!photoUrl && !logoUrl && <div style={{ fontSize: '11px', color: 'var(--ink4)' }}>No photo/logo layer in this creative.</div>}
                      </div>
                    </div>
                  ) : (
                    <div style={{ color: 'var(--ink3)', fontSize: '13px', textAlign: 'center', padding: '60px 0', border: '1px dashed var(--border-light)', borderRadius: '12px' }}>
                      {`No creative generated for ${displayName(activeType, selected)} yet — click "Generate Announcement" above.`}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>

      <style>{`@keyframes tspin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
