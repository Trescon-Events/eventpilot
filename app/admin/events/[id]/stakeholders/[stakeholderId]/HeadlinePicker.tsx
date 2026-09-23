'use client'

import { Button, Input } from '@/app/components/ui'
import type { HeadlineVariant } from '@/app/lib/events/announcements'

/* Speaker creative headline picker (2026-09-22) — up to 5 AI-generated
   options for the bold on-image headline (distinct from post_copy),
   rendered as true radio-button cards: selecting one never removes the
   others, and every card's 3 segments (lead/emphasis/trail) stay
   inline-editable regardless of selection. Deliberately NOT the Press
   Release Studio EDIT_OPTIONS chip pattern (pick-one-discard-rest, capped
   at 4) — see AnnouncementDetailPanel.tsx's own comment on why that
   pattern doesn't fit here. Compliance findings render per-card, advisory
   only (never block selection or save) — matches Press Release Studio's
   own confirmed behavior, the one real precedent this app has. */
export default function HeadlinePicker({
  variants, selectedId, generating, saving, disabled,
  onGenerate, onSelect, onSegmentChange, onSegmentBlur,
}: {
  variants: HeadlineVariant[]
  selectedId: string | null
  generating: boolean
  saving: boolean
  disabled?: boolean
  onGenerate: () => void
  onSelect: (id: string) => void
  onSegmentChange: (id: string, field: 'lead' | 'emphasis' | 'trail', value: string) => void
  onSegmentBlur: (id: string) => void
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: '10.5px', fontWeight: 800, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Creative Headline</div>
          <div style={{ fontSize: '12.5px', color: 'var(--ink3)', marginTop: '4px', maxWidth: '480px' }}>
            The bold on-image phrase for this speaker&apos;s promo creatives (separate from Short Bio and post copy) — generate once, it&apos;s reused by every announcement made for them.
          </div>
        </div>
        <Button variant="ghost" onClick={onGenerate} disabled={generating || disabled}>
          {generating ? 'Generating…' : variants.length ? 'Regenerate Headlines' : 'Generate Headlines'}
        </Button>
      </div>

      {variants.length === 0 ? (
        <div style={{ fontSize: '12px', color: 'var(--ink3)' }}>
          No headline generated yet — click Generate Headlines for 5 options for the on-image phrase.
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '8px' }}>
          {variants.map(v => {
            const isSelected = v.id === selectedId
            const findings = v.compliance
            return (
              <div key={v.id} style={{
                padding: '12px 14px', borderRadius: '10px',
                border: isSelected ? '1.5px solid var(--teal-mid)' : '1px solid var(--border-light)',
                background: isSelected ? 'var(--teal-light)' : 'var(--surface)',
              }}>
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: disabled ? 'default' : 'pointer' }}>
                  <input
                    type="radio" name="headline-variant" checked={isSelected} disabled={disabled}
                    onChange={() => onSelect(v.id)} style={{ marginTop: '4px' }}
                  />
                  <div style={{ flex: 1, display: 'grid', gap: '5px' }}>
                    <Input
                      value={v.segments.lead ?? ''}
                      placeholder="Lead (optional)"
                      disabled={disabled}
                      onChange={e => onSegmentChange(v.id, 'lead', e.target.value)}
                      onBlur={() => onSegmentBlur(v.id)}
                      style={{ fontSize: '12px' }}
                    />
                    <Input
                      value={v.segments.emphasis}
                      placeholder="Emphasis"
                      disabled={disabled}
                      onChange={e => onSegmentChange(v.id, 'emphasis', e.target.value)}
                      onBlur={() => onSegmentBlur(v.id)}
                      style={{ fontSize: '13px', fontWeight: 700, color: 'var(--teal-mid)' }}
                    />
                    <Input
                      value={v.segments.trail ?? ''}
                      placeholder="Trail (optional)"
                      disabled={disabled}
                      onChange={e => onSegmentChange(v.id, 'trail', e.target.value)}
                      onBlur={() => onSegmentBlur(v.id)}
                      style={{ fontSize: '12px' }}
                    />
                    {findings.length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '2px' }}>
                        {findings.map((f, i) => (
                          <div key={i} style={{
                            fontSize: '11px', padding: '5px 8px', borderRadius: '6px',
                            background: f.severity === 'error' ? 'var(--red-light)' : 'var(--amber-light)',
                            color: f.severity === 'error' ? 'var(--red)' : 'var(--amber)',
                          }}>
                            &ldquo;{f.match}&rdquo; — {f.message}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </label>
              </div>
            )
          })}
        </div>
      )}
      {saving && <div style={{ fontSize: '11px', color: 'var(--ink4)' }}>Saving…</div>}
    </div>
  )
}
