'use client'

import { useState } from 'react'
import { Button } from '@/app/components/ui'
import type { Variant } from '@/app/lib/announcements/composite'
import { type StakeholderKind, type Stakeholder, displayName, displaySubtitle, thumbUrl } from './page'

/* "+ Create New" flow (2026-08-02) — genuinely 2 steps since this is a
   page-level entry point, not scoped to whatever's selected in the left
   rail (per Madhu: the SAE workspace's main view shows EXISTING creatives
   grouped by speaker, not a picker of every eligible speaker — that picker
   only exists here, inside Create). Step 1 reuses the same row idiom as the
   page's own left rail (thumbUrl/displayName/displaySubtitle); step 2 is a
   thumbnail grid using each variant's last_preview_url (composite.ts) — a
   real Storage URL populated once a variant has been previewed+saved in the
   Admin Console, so no new generation is needed just to show a picker. */

type Props = {
  eventId: string
  stakeholderType: StakeholderKind
  readyStakeholders: Stakeholder[]
  variants: Variant[]
  onClose: () => void
  onCreated: (stakeholderId: string, announcementId: string) => void
}

export default function CreateAnnouncementModal({ eventId, stakeholderType, readyStakeholders, variants, onClose, onCreated }: Props) {
  const [step, setStep] = useState<'speaker' | 'variant'>('speaker')
  const [selectedStakeholder, setSelectedStakeholder] = useState<Stakeholder | null>(null)
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(variants[0]?.id ?? null)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function pickStakeholder(s: Stakeholder) {
    setSelectedStakeholder(s)
    setStep('variant')
  }

  async function generate() {
    if (!selectedStakeholder || !selectedVariantId) return
    setGenerating(true)
    setError(null)
    const res = await fetch('/api/events/stakeholders/announcements/generate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event_id: eventId,
        stakeholder_type: stakeholderType,
        ...(stakeholderType === 'speaker' ? { speaker_id: selectedStakeholder.id } : { partner_id: selectedStakeholder.id }),
        variant_id: selectedVariantId,
      }),
    })
    const data = await res.json().catch(() => ({}))
    setGenerating(false)
    if (!res.ok) { setError(data.error || 'Announcement generation failed.'); return }
    onCreated(selectedStakeholder.id, data.announcement_id)
  }

  // No cancel-in-flight capability server-side — a "closed but still
  // running" modal would be more confusing than briefly non-dismissible.
  const closable = !generating

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'color-mix(in srgb, black 60%, transparent)', zIndex: 70, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }} onClick={closable ? onClose : undefined}>
      <div onClick={e => e.stopPropagation()} style={{ width: '560px', maxWidth: '100%', maxHeight: '85vh', overflowY: 'auto', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '14px', padding: '22px' }}>
        {step === 'speaker' && (
          <>
            <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--ink)', marginBottom: '4px' }}>
              Create Announcement — pick a {stakeholderType}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--ink3)', marginBottom: '14px' }}>
              Only {stakeholderType === 'speaker' ? 'speakers' : 'partners'} approved for announcement show up here.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '360px', overflowY: 'auto' }}>
              {readyStakeholders.map(s => {
                const thumb = thumbUrl(stakeholderType, s)
                return (
                  <button key={s.id} onClick={() => pickStakeholder(s)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 10px', borderRadius: '10px',
                      border: 'none', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', background: 'var(--surface)',
                    }}>
                    <div style={{ width: '32px', height: '32px', borderRadius: '8px', overflow: 'hidden', background: 'var(--card)', border: '1px solid var(--border-light)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {thumb ? (
                        // eslint-disable-next-line @next/next/no-img-element -- small list thumbnail
                        <img src={thumb} alt={displayName(stakeholderType, s)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : <span style={{ fontSize: '13px', color: 'var(--ink4)' }}>{displayName(stakeholderType, s)[0]}</span>}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayName(stakeholderType, s)}</div>
                      <div style={{ fontSize: '10.5px', color: 'var(--ink3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displaySubtitle(stakeholderType, s)}</div>
                    </div>
                  </button>
                )
              })}
              {readyStakeholders.length === 0 && (
                <div style={{ color: 'var(--ink3)', fontSize: '12px', padding: '10px 0', lineHeight: 1.5 }}>
                  No {stakeholderType === 'speaker' ? 'speakers' : 'partners'} approved for announcement yet — approve one from the Stakeholder Hub first.
                </div>
              )}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
              <Button variant="ghost" onClick={onClose}>Cancel</Button>
            </div>
          </>
        )}

        {step === 'variant' && selectedStakeholder && (
          <>
            <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--ink)', marginBottom: '4px' }}>
              Creating for {displayName(stakeholderType, selectedStakeholder)}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--ink3)', marginBottom: '14px' }}>
              Pick a creative variant.
            </div>

            {generating ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '10px', padding: '60px 0' }}>
                <div className="tspinner" style={{ width: '28px', height: '28px', borderRadius: '50%', border: '3px solid var(--border)', borderTopColor: 'var(--teal-mid)', animation: 'tspin 0.8s linear infinite' }} />
                <div style={{ fontSize: '13px', color: 'var(--ink3)' }}>Generating creative and post copy — this can take up to 20 seconds…</div>
              </div>
            ) : (
              <>
                {error && (
                  <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'var(--red-light)', border: '1px solid var(--red-border)', color: 'var(--red)', fontSize: '12.5px', marginBottom: '14px' }}>
                    {error}
                  </div>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '12px', marginBottom: '16px' }}>
                  {variants.map(v => (
                    <button key={v.id} onClick={() => setSelectedVariantId(v.id)}
                      style={{
                        display: 'flex', flexDirection: 'column', gap: '6px', padding: '8px', borderRadius: '10px', cursor: 'pointer',
                        background: 'var(--surface)', fontFamily: 'inherit', textAlign: 'left',
                        border: selectedVariantId === v.id ? '2px solid var(--teal-mid)' : '1px solid var(--border-light)',
                      }}>
                      <div style={{ borderRadius: '8px', overflow: 'hidden', background: 'var(--card)', aspectRatio: '4 / 5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {v.last_preview_url ? (
                          // eslint-disable-next-line @next/next/no-img-element -- small variant-picker thumbnail
                          <img src={v.last_preview_url} alt={v.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                          <span style={{ fontSize: '10.5px', color: 'var(--ink4)', textAlign: 'center', padding: '0 8px' }}>{v.name || 'Untitled Variant'}</span>
                        )}
                      </div>
                      <span style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.name || 'Untitled Variant'}</span>
                    </button>
                  ))}
                  {variants.length === 0 && (
                    <div style={{ gridColumn: '1 / -1', color: 'var(--ink3)', fontSize: '12px', padding: '10px 0' }}>
                      No creative variants configured yet — build one in the Admin Console first.
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Button variant="ghost" onClick={() => setStep('speaker')}>← Back</Button>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <Button variant="ghost" onClick={onClose}>Cancel</Button>
                    <Button variant="solid" onClick={generate} disabled={!selectedVariantId || variants.length === 0}>
                      Generate
                    </Button>
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
