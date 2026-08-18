'use client'

import { useState } from 'react'
import { Button, ProcessingOverlay } from '@/app/components/ui'
import type { Variant } from '@/app/lib/announcements/composite'
import { type StakeholderKind, type Stakeholder, displayName } from '../../creative-templates/page'
import { missingAssetLabels } from '../../creative-templates/CreateAnnouncementModal'

/*
  The speaker/partner-scoped "+ Create New" flow (2026-08-18, SAE-into-Hub
  merge, step 3) — the stakeholder is already known (we're on their page),
  so this skips CreateAnnouncementModal's step 1 (pick a stakeholder)
  entirely and goes straight to kind (Promo/Self Promo) then variant.
  Self Promo is hidden for partners — a deliberate product constraint,
  no partner data model/routes exist for it (confirmed in the SAE-into-Hub
  merge research pass).
*/
export default function CreateAnnouncementForStakeholder({
  eventId,
  stakeholderType,
  stakeholder,
  variantsByKind,
  onClose,
  onCreated,
}: {
  eventId: string
  stakeholderType: StakeholderKind
  stakeholder: Stakeholder
  variantsByKind: { org_promo: Variant[]; self_promo: Variant[] }
  onClose: () => void
  onCreated: (announcementId: string) => void
}) {
  const [kind, setKind] = useState<'org_promo' | 'self_promo'>('org_promo')
  const variants = variantsByKind[kind]
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(
    variants.find(v => missingAssetLabels(v, stakeholderType, stakeholder).length === 0)?.id ?? variants[0]?.id ?? null
  )
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function pickKind(next: 'org_promo' | 'self_promo') {
    setKind(next)
    const nextVariants = variantsByKind[next]
    setSelectedVariantId(nextVariants.find(v => missingAssetLabels(v, stakeholderType, stakeholder).length === 0)?.id ?? nextVariants[0]?.id ?? null)
  }

  async function generate() {
    if (!selectedVariantId) return
    setGenerating(true)
    setError(null)
    const res = await fetch('/api/events/stakeholders/announcements/generate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event_id: eventId,
        stakeholder_type: stakeholderType,
        ...(stakeholderType === 'speaker' ? { speaker_id: stakeholder.id } : { partner_id: stakeholder.id }),
        variant_id: selectedVariantId,
        kind,
      }),
    })
    const data = await res.json().catch(() => ({}))
    setGenerating(false)
    if (!res.ok) { setError(data.error || 'Announcement generation failed.'); return }
    onCreated(data.announcement_id)
  }

  const selectedVariant = variants.find(v => v.id === selectedVariantId)
  const selectedVariantInvalid = !selectedVariant || missingAssetLabels(selectedVariant, stakeholderType, stakeholder).length > 0
  const closable = !generating

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'color-mix(in srgb, black 60%, transparent)', zIndex: 70, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }} onClick={closable ? onClose : undefined}>
      <div onClick={e => e.stopPropagation()} style={{ width: '560px', maxWidth: '100%', maxHeight: '85vh', overflowY: 'auto', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '14px', padding: '22px' }}>
        <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--ink)', marginBottom: '4px' }}>
          New Announcement for {displayName(stakeholderType, stakeholder)}
        </div>
        <div style={{ fontSize: '12px', color: 'var(--ink3)', marginBottom: '14px' }}>
          Pick a type, then a creative variant.
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

            {stakeholderType === 'speaker' && (
              <div style={{ display: 'flex', borderRadius: '8px', border: '1px solid var(--border)', overflow: 'hidden', width: 'fit-content', marginBottom: '16px' }}>
                {(['org_promo', 'self_promo'] as const).map(k => (
                  <button key={k} onClick={() => pickKind(k)}
                    style={{
                      padding: '7px 18px', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: '12.5px', fontWeight: 700,
                      background: kind === k ? 'var(--indigo-light)' : 'transparent',
                      color: kind === k ? 'var(--indigo)' : 'var(--ink3)',
                    }}>
                    {k === 'org_promo' ? 'Promo' : 'Self Promo'}
                  </button>
                ))}
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '12px', marginBottom: '16px' }}>
              {variants.map(v => {
                const missing = missingAssetLabels(v, stakeholderType, stakeholder)
                const disabled = missing.length > 0
                return (
                <button key={v.id} onClick={() => { if (!disabled) setSelectedVariantId(v.id) }}
                  disabled={disabled}
                  title={disabled ? `${missing.map(m => m[0].toUpperCase() + m.slice(1)).join(' and ')} required — this speaker doesn't have one uploaded yet` : undefined}
                  style={{
                    display: 'flex', flexDirection: 'column', gap: '6px', padding: '8px', borderRadius: '10px',
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    background: 'var(--surface)', fontFamily: 'inherit', textAlign: 'left',
                    border: selectedVariantId === v.id ? '2px solid var(--teal-mid)' : '1px solid var(--border-light)',
                    opacity: disabled ? 0.45 : 1,
                    position: 'relative',
                  }}>
                  <div style={{ borderRadius: '8px', overflow: 'hidden', background: 'var(--card)', aspectRatio: '4 / 5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {v.last_preview_url ? (
                      // eslint-disable-next-line @next/next/no-img-element -- small variant-picker thumbnail
                      <img src={v.last_preview_url} alt={v.name} style={{ width: '100%', height: '100%', objectFit: 'cover', filter: disabled ? 'grayscale(1)' : undefined }} />
                    ) : (
                      <span style={{ fontSize: '10.5px', color: 'var(--ink4)', textAlign: 'center', padding: '0 8px' }}>{v.name || 'Untitled Variant'}</span>
                    )}
                  </div>
                  <span style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.name || 'Untitled Variant'}</span>
                  {disabled && (
                    <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--red)', lineHeight: 1.3 }}>
                      {missing.map(m => m[0].toUpperCase() + m.slice(1)).join(' & ')} required
                    </span>
                  )}
                </button>
                )
              })}
              {variants.length === 0 && (
                <div style={{ gridColumn: '1 / -1', color: 'var(--ink3)', fontSize: '12px', padding: '10px 0' }}>
                  No creative variants configured for {kind === 'self_promo' ? 'Self Promo' : 'this type'} yet — build one in the Admin Console first.
                </div>
              )}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <div style={{ display: 'flex', gap: '8px' }}>
                <Button variant="ghost" onClick={onClose}>Cancel</Button>
                <Button variant="solid" onClick={generate} disabled={!selectedVariantId || selectedVariantInvalid || variants.length === 0}>
                  Generate
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
      <ProcessingOverlay
        active={generating}
        label="Generating announcement…"
        sublabel="Compositing the creative and writing the post copy."
        estimatedMs={15000}
      />
    </div>
  )
}
