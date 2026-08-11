'use client'

import { useState, useEffect, use } from 'react'
import Link from 'next/link'
import { Download } from 'lucide-react'
import PageHeader from '@/app/components/PageHeader'
import { Button, Badge, Select, type BadgeColor } from '@/app/components/ui'
import { downloadFile } from '@/app/lib/download-file'
import type { Variant, CreativeTemplateConfig } from '@/app/lib/announcements/composite'
import CreateAnnouncementModal from './CreateAnnouncementModal'
import DeleteCreativeModal from './DeleteCreativeModal'

/* Stakeholder Announcement Engine — main workspace (restructured
   2026-07-28 per Madhu's explicit ask, restructured again 2026-08-02 for
   real create/list/delete management). Previously this base path was a
   lightweight landing page linking out to the Stakeholder Hub for actual
   generation, and generation itself happened in a small popup modal on
   that page. Both moved here as a proper full-page workspace:

   - Speaker/Partner sub-sections (matching the Admin Console's own split).
   - Left: stakeholders who already have at least one creative (NOT every
     approved stakeholder — see 2026-08-02 below). Right: all of that
     stakeholder's creatives as a grid, plus a detail panel for whichever
     one is selected.
   - "+ Create New" (page-level, not scoped to the left-rail selection)
     opens a 2-step modal: pick a stakeholder (from those approved for
     announcement, `announcement_status === 'ready'` — regardless of
     whether they already have creatives) → pick a variant (shown with its
     real preview thumbnail) → Generate.

   2026-08-02 (Madhu): every announcement-creation action lives ONLY here
   now — the Stakeholder Hub's "Generate Creative →" button was removed
   (see stakeholders/page.tsx) so there's exactly one place a "generate"
   affordance can be clicked from. The SAE main view intentionally shows
   EXISTING creatives grouped by stakeholder, not a picker of every eligible
   stakeholder — that picker only exists inside the Create flow.

   Also fixes a real bug found the same day: `generate` always INSERTs a
   new row (never upserts), so a stakeholder could already silently
   accumulate multiple announcement rows — but the old `results` state only
   ever kept the FIRST one it fetched per stakeholder, hiding every other
   generation that already existed in the database. `results` is now an
   array per stakeholder, and every row is shown.

   Variant CREATION (the layer-stack editor) lives at ./admin instead —
   branding-team-only, unchanged by this restructure. */

export type StakeholderKind = 'speaker' | 'partner'

export type Speaker = {
  id: string; full_name: string; job_title: string; company_name: string
  photo_url: string | null; photo_processed_url: string | null; company_logo_url: string | null
  announcement_status: 'pending_review' | 'approved' | 'assets_missing' | 'ready' | 'archived'
}
export type Partner = {
  id: string; company_name: string; partner_type: string
  logo_url: string | null
  announcement_status: 'pending_review' | 'approved' | 'assets_missing' | 'ready' | 'archived'
}
export type Stakeholder = Speaker | Partner

// AnnouncementStatus/AnnouncementListItem (2026-08-02) — replaces the old
// AnnouncementSummary; see `results` state's own comment below for why: a
// stakeholder can have MULTIPLE announcement rows (generate always INSERTs,
// never upserts), so the shape needs every row's own status/variant/date,
// not just enough fields for a single displayed result.
export type AnnouncementStatus = 'draft' | 'pending_approval' | 'approved' | 'approved_with_comments' | 'changes_requested' | 'scheduled' | 'published' | 'failed'

export type AnnouncementListItem = {
  id: string
  stakeholder_type: StakeholderKind
  speaker_id: string | null
  partner_id: string | null
  post_copy: string | null
  creative_url: string | null
  creative_variant_id: string | null
  status: AnnouncementStatus
  created_at: string
  scheduled_for: string | null
  platforms: string[] | null
  published_at: string | null
}

export function displayName(kind: StakeholderKind, s: Stakeholder): string {
  return kind === 'speaker' ? (s as Speaker).full_name : (s as Partner).company_name
}
export function displaySubtitle(kind: StakeholderKind, s: Stakeholder): string {
  return kind === 'speaker' ? `${(s as Speaker).job_title} · ${(s as Speaker).company_name}` : (s as Partner).partner_type.replace(/_/g, ' ')
}
export function thumbUrl(kind: StakeholderKind, s: Stakeholder): string | null {
  return kind === 'speaker' ? ((s as Speaker).photo_processed_url || (s as Speaker).photo_url) : (s as Partner).logo_url
}

function statusColor(s: AnnouncementStatus): BadgeColor {
  if (s === 'published' || s === 'approved' || s === 'approved_with_comments') return 'teal'
  if (s === 'failed' || s === 'changes_requested') return 'red'
  if (s === 'scheduled') return 'purple'
  return 'amber' // draft, pending_approval
}

export default function CreativeTemplatesWorkspacePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = use(params)

  const [activeType, setActiveType] = useState<StakeholderKind>('speaker')
  const [loading, setLoading] = useState(true)
  const [speakers, setSpeakers] = useState<Speaker[]>([])
  const [partners, setPartners] = useState<Partner[]>([])
  const [variants, setVariants] = useState<{ speaker: Variant[]; partner: Variant[] }>({ speaker: [], partner: [] })
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedAnnouncementId, setSelectedAnnouncementId] = useState<string | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  // Holds whatever's pending confirmation in DeleteCreativeModal — 1 item
  // for a single card's own ✕, 2+ for bulk-select delete (2026-08-03, per
  // Madhu: test creatives piled up with no way to clear several at once).
  const [deleteTargets, setDeleteTargets] = useState<AnnouncementListItem[]>([])
  const [deleting, setDeleting] = useState(false)
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedForBulk, setSelectedForBulk] = useState<Set<string>>(new Set())
  // Keyed by ANNOUNCEMENT id now, not stakeholder id (2026-08-02) — a
  // stakeholder can have several creatives visible at once, each needing
  // its own independent "switch variant on regenerate" selection; keying by
  // stakeholder would leak one card's choice into another's control.
  const [regenerateVariantChoice, setRegenerateVariantChoice] = useState<Record<string, string>>({})
  const [msg, setMsg] = useState<string | null>(null)

  const [regeneratingCreative, setRegeneratingCreative] = useState(false)
  const [regeneratingCopy, setRegeneratingCopy] = useState(false)
  // Every creative for a stakeholder, not just one — keyed by stakeholder
  // id, newest first. See the file-header comment for the shadowing bug
  // this replaced.
  const [results, setResults] = useState<Record<string, AnnouncementListItem[]>>({})

  const stakeholders: Stakeholder[] = activeType === 'speaker' ? speakers : partners
  const readyStakeholders = stakeholders.filter(s => s.announcement_status === 'ready')
  // Left rail (2026-08-02) — only stakeholders who already have a creative,
  // not every approved-for-announcement one. Picking WHO to create for now
  // happens inside the Create modal instead (readyStakeholders, above).
  const stakeholdersWithCreatives = stakeholders.filter(s => (results[s.id]?.length ?? 0) > 0)
  const selected = stakeholdersWithCreatives.find(s => s.id === selectedId) ?? null
  const activeVariants = variants[activeType]
  const selectedList = selected ? (results[selected.id] ?? []) : []
  const selectedAnnouncement = selectedList.find(a => a.id === selectedAnnouncementId) ?? selectedList[0] ?? null

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
    const anns: AnnouncementListItem[] = await annRes.json().catch(() => [])
    // Group every row into its stakeholder's array, newest first — the
    // single source of truth for `results`, rebuilt in full on every fetch
    // rather than hand-merged, so create/delete just call fetchAll() again.
    const byStakeholder: Record<string, AnnouncementListItem[]> = {}
    for (const a of anns) {
      const id = a.speaker_id ?? a.partner_id
      if (!id) continue
      ;(byStakeholder[id] ??= []).push(a)
    }
    for (const id in byStakeholder) byStakeholder[id].sort((a, b) => b.created_at.localeCompare(a.created_at))
    setResults(byStakeholder)
    setLoading(false)
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch-on-mount; matches the sibling stakeholders/admin pages' fetchAll effect
  useEffect(() => { fetchAll() }, [eventId])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset selection on tab switch, derived UI state not a fetch side effect
    setSelectedId(null)
    setSelectedAnnouncementId(null)
    setSelectionMode(false)
    setSelectedForBulk(new Set())
  }, [activeType])

  async function handleCreated(stakeholderId: string, announcementId: string) {
    await fetchAll()
    setSelectedId(stakeholderId)
    setSelectedAnnouncementId(announcementId)
    setShowCreateModal(false)
  }

  async function regenerateCreative(announcementId: string, stakeholderId: string) {
    setRegeneratingCreative(true)
    const variantId = regenerateVariantChoice[announcementId]
    const res = await fetch(`/api/events/stakeholders/announcements/${announcementId}/regenerate-creative`, {
      method: 'POST',
      ...(variantId ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ variant_id: variantId }) } : {}),
    })
    const data = await res.json().catch(() => ({}))
    if (res.ok) {
      setResults(prev => ({
        ...prev,
        [stakeholderId]: (prev[stakeholderId] ?? []).map(a => a.id === announcementId ? { ...a, creative_url: data.creative_url } : a),
      }))
    } else setMsg(data.error || 'Could not regenerate the creative.')
    setRegeneratingCreative(false)
  }

  async function regenerateCopy(announcementId: string, stakeholderId: string) {
    setRegeneratingCopy(true)
    const res = await fetch(`/api/events/stakeholders/announcements/${announcementId}/regenerate-copy`, { method: 'POST' })
    const data = await res.json().catch(() => ({}))
    if (res.ok) {
      setResults(prev => ({
        ...prev,
        [stakeholderId]: (prev[stakeholderId] ?? []).map(a => a.id === announcementId ? { ...a, post_copy: data.post_copy } : a),
      }))
    } else setMsg(data.error || 'Could not regenerate the post copy.')
    setRegeneratingCopy(false)
  }

  async function performDelete() {
    if (deleteTargets.length === 0) return
    setDeleting(true)
    const results = await Promise.all(
      deleteTargets.map(t => fetch(`/api/events/stakeholders/announcements/${t.id}`, { method: 'DELETE' }))
    )
    setDeleting(false)
    const failedCount = results.filter(r => !r.ok).length
    if (failedCount > 0) {
      setMsg(deleteTargets.length === 1 ? 'Could not delete this creative.' : `Could not delete ${failedCount} of ${deleteTargets.length} creatives.`)
    }
    const deletedIds = new Set(deleteTargets.map(t => t.id))
    setDeleteTargets([])
    if (selectedAnnouncementId && deletedIds.has(selectedAnnouncementId)) setSelectedAnnouncementId(null)
    setSelectedForBulk(new Set())
    setSelectionMode(false)
    await fetchAll()
  }

  const photoUrl = selected && activeType === 'speaker' ? ((selected as Speaker).photo_processed_url || (selected as Speaker).photo_url) : null
  const logoUrl = selected ? (activeType === 'speaker' ? (selected as Speaker).company_logo_url : (selected as Partner).logo_url) : null

  return (
    <div style={{ minHeight: '100vh', background: 'var(--surface)' }}>
      <PageHeader
        eyebrow="Event Workspace"
        title="Stakeholder Announcement Engine"
        description="Create, review, and manage stakeholder announcement creatives. Speaker/partner details are managed in the Stakeholder Hub — this workspace covers approved stakeholders only."
        actions={<Link href={`/admin/events/${eventId}/creative-templates/admin`}><Button variant="ghost">Admin Console →</Button></Link>}
      />

      <div style={{ padding: '24px 32px' }}>
        {msg && (
          <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'var(--red-light)', border: '1px solid var(--red-border)', color: 'var(--red)', fontSize: '12.5px', marginBottom: '16px' }}>
            {msg} <button onClick={() => setMsg(null)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontWeight: 700, marginLeft: '8px' }}>×</button>
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
          <div style={{ display: 'flex', borderRadius: '8px', border: '1px solid var(--border)', overflow: 'hidden', width: 'fit-content' }}>
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
          <Button variant="solid" onClick={() => setShowCreateModal(true)}>+ Create New</Button>
        </div>

        {loading ? (
          <div style={{ color: 'var(--ink3)', fontSize: '13px' }}>Loading…</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: '24px', alignItems: 'flex-start' }}>
            {/* Left: stakeholders who already have at least one creative */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>
                {activeType === 'speaker' ? 'Speakers' : 'Partners'} with Creatives ({stakeholdersWithCreatives.length})
              </div>
              {stakeholdersWithCreatives.map(s => {
                const thumb = thumbUrl(activeType, s)
                const count = results[s.id]?.length ?? 0
                return (
                  <button key={s.id} onClick={() => { setSelectedId(s.id); setSelectedAnnouncementId(null); setSelectionMode(false); setSelectedForBulk(new Set()) }}
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
                    <Badge color="teal">{count}</Badge>
                  </button>
                )
              })}
              {stakeholdersWithCreatives.length === 0 && (
                <div style={{ color: 'var(--ink3)', fontSize: '12px', padding: '10px 0', lineHeight: 1.5 }}>
                  No creatives yet — click <strong>+ Create New</strong> above.
                </div>
              )}
            </div>

            {/* Right: this stakeholder's creatives + detail panel */}
            <div>
              {!selected ? (
                <div style={{ color: 'var(--ink3)', fontSize: '13px', textAlign: 'center', padding: '60px 0' }}>
                  {stakeholdersWithCreatives.length === 0 ? 'Nothing here yet — click + Create New to generate your first announcement creative.' : `Select a ${activeType} from the list to review their creatives.`}
                </div>
              ) : (
                <>
                  <div style={{ marginBottom: '16px' }}>
                    <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--ink)' }}>{displayName(activeType, selected)}</div>
                    <div style={{ fontSize: '12px', color: 'var(--ink3)' }}>{displaySubtitle(activeType, selected)}</div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px', flexWrap: 'wrap', gap: '8px' }}>
                    <div style={{ fontSize: '10.5px', fontWeight: 800, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      Creatives ({selectedList.length})
                    </div>
                    {/* Bulk select/delete (2026-08-03, per Madhu) — test
                        creatives pile up fast with no way to clear several
                        at once; individual ✕ still works outside this mode. */}
                    {selectionMode ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '11.5px', color: 'var(--ink3)' }}>{selectedForBulk.size} selected</span>
                        <Button variant="ghost" onClick={() => setSelectedForBulk(new Set(selectedList.map(i => i.id)))}>Select All</Button>
                        <Button variant="ghost" onClick={() => setSelectedForBulk(new Set())}>Clear</Button>
                        <Button variant="red" disabled={selectedForBulk.size === 0}
                          onClick={() => setDeleteTargets(selectedList.filter(i => selectedForBulk.has(i.id)))}>
                          Delete Selected
                        </Button>
                        <Button variant="ghost" onClick={() => { setSelectionMode(false); setSelectedForBulk(new Set()) }}>Cancel</Button>
                      </div>
                    ) : (
                      <Button variant="ghost" onClick={() => setSelectionMode(true)}>Select</Button>
                    )}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '12px', marginBottom: '24px' }}>
                    {selectedList.map(item => {
                      const variantName = activeVariants.find(v => v.id === item.creative_variant_id)?.name ?? '—'
                      const isSelected = selectedAnnouncement?.id === item.id
                      const isBulkChecked = selectedForBulk.has(item.id)
                      function toggleBulk() {
                        setSelectedForBulk(prev => {
                          const next = new Set(prev)
                          if (next.has(item.id)) next.delete(item.id); else next.add(item.id)
                          return next
                        })
                      }
                      return (
                        <div key={item.id} onClick={() => selectionMode ? toggleBulk() : setSelectedAnnouncementId(item.id)}
                          style={{ cursor: 'pointer', position: 'relative', borderRadius: '10px', overflow: 'hidden', border: (selectionMode ? isBulkChecked : isSelected) ? '2px solid var(--teal-mid)' : '1px solid var(--border-light)', background: 'var(--surface)' }}>
                          {selectionMode && (
                            <input type="checkbox" checked={isBulkChecked} onChange={toggleBulk} onClick={e => e.stopPropagation()}
                              style={{ position: 'absolute', top: '8px', left: '8px', zIndex: 5, width: '16px', height: '16px', cursor: 'pointer' }} />
                          )}
                          <div style={{ aspectRatio: '4 / 5', background: 'var(--card)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                            {item.creative_url ? (
                              // eslint-disable-next-line @next/next/no-img-element -- small creative-list thumbnail
                              <img src={item.creative_url} alt={variantName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            ) : (
                              <span style={{ fontSize: '10.5px', color: 'var(--ink4)' }}>No creative</span>
                            )}
                          </div>
                          <div style={{ padding: '8px' }}>
                            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{variantName}</div>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '4px' }}>
                              <Badge color={statusColor(item.status)}>{item.status}</Badge>
                              {!selectionMode && (
                                <button onClick={e => { e.stopPropagation(); setDeleteTargets([item]) }} title="Delete this creative" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', fontSize: '13px' }}>✕</button>
                              )}
                            </div>
                            <div style={{ fontSize: '10px', color: 'var(--ink4)', marginTop: '4px' }}>{new Date(item.created_at).toLocaleDateString()}</div>
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {selectedAnnouncement && (
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
                          {selectedAnnouncement.creative_url ? (
                            // eslint-disable-next-line @next/next/no-img-element -- reviewing a freshly generated/regenerated remote asset, not worth next/image's static-optimization pass here
                            <img src={selectedAnnouncement.creative_url} alt="Generated creative" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                          ) : (
                            <span style={{ fontSize: '12px', color: 'var(--ink3)' }}>No creative generated</span>
                          )}
                        </div>
                        <div style={{ marginTop: '10px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                          {activeVariants.length > 1 && (
                            <Select value={regenerateVariantChoice[selectedAnnouncement.id] ?? activeVariants[0]?.id ?? ''}
                              onChange={e => setRegenerateVariantChoice(v => ({ ...v, [selectedAnnouncement.id]: e.target.value }))}
                              title="Switch to a different variant on regenerate" style={{ width: 'auto' }}>
                              {activeVariants.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                            </Select>
                          )}
                          <Button variant="ghost" onClick={() => regenerateCreative(selectedAnnouncement.id, selected.id)} disabled={regeneratingCreative}>
                            {regeneratingCreative ? 'Regenerating…' : 'Regenerate Creative'}
                          </Button>
                          {/* Download (2026-08-04, per Madhu: "if they want
                              to download and use it for approvals etc. they
                              can do so easily") — same forced-download
                              helper as the Stakeholder Hub's photo/logo
                              download buttons, needed for the same reason:
                              this file lives on a cross-origin storage
                              domain, so a plain <a download> wouldn't
                              reliably force a save. */}
                          {selectedAnnouncement.creative_url && (
                            <Button variant="ghost"
                              onClick={() => downloadFile(selectedAnnouncement.creative_url!, `${displayName(activeType, selected).replace(/\s+/g, '-')}-creative.png`).catch(() => {})}
                              title="Download this creative">
                              <Download size={13} style={{ marginRight: '5px', verticalAlign: '-2px' }} />
                              Download
                            </Button>
                          )}
                        </div>
                      </div>

                      <div>
                        <div style={{ fontSize: '10.5px', fontWeight: 800, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>Post Copy</div>
                        <div style={{ padding: '14px', borderRadius: '10px', border: '1px solid var(--border-light)', background: 'var(--surface)', fontSize: '13px', color: 'var(--ink2)', whiteSpace: 'pre-wrap', lineHeight: 1.6, minHeight: '200px' }}>
                          {selectedAnnouncement.post_copy}
                        </div>
                        <div style={{ marginTop: '10px' }}>
                          <Button variant="ghost" onClick={() => regenerateCopy(selectedAnnouncement.id, selected.id)} disabled={regeneratingCopy}>
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
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {showCreateModal && (
        <CreateAnnouncementModal
          eventId={eventId}
          stakeholderType={activeType}
          readyStakeholders={readyStakeholders}
          variants={activeVariants}
          onClose={() => setShowCreateModal(false)}
          onCreated={handleCreated}
        />
      )}

      {deleteTargets.length > 0 && (
        <DeleteCreativeModal
          items={deleteTargets.map(t => ({ variantName: activeVariants.find(v => v.id === t.creative_variant_id)?.name ?? 'this creative', status: t.status }))}
          deleting={deleting}
          onConfirm={performDelete}
          onClose={() => setDeleteTargets([])}
        />
      )}

      <style>{`@keyframes tspin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
