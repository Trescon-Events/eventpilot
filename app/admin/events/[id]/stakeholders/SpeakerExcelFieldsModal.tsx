'use client'

import { useState } from 'react'
import { Button } from '@/app/components/ui'

/* "Speaker Details (Excel)" field picker (2026-10-20, Madhu) — every field is selected by default; the producer unticks what they
   don't want, per category or one by one, then downloads. Fields come from app/lib/export/speaker-export-fields.ts plus the Status Board columns (status-board-columns.ts). */

type Props = {
  count: number
  preparing: boolean
  fields: { key: string; label: string; group: string }[] // only the fields this event offers
  onDownload: (keys: string[]) => void
  onClose: () => void
}

export default function SpeakerExcelFieldsModal({ count, preparing, fields, onDownload, onClose }: Props) {
  const groups = [...new Set(fields.map(f => f.group))]
  const [selected, setSelected] = useState<Set<string>>(new Set(fields.map(f => f.key)))

  function toggle(keys: string[], on: boolean) {
    setSelected(prev => { const next = new Set(prev); keys.forEach(k => (on ? next.add(k) : next.delete(k))); return next })
  }
  const allOn = selected.size === fields.length

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'color-mix(in srgb, black 60%, transparent)', zIndex: 70, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ width: '620px', maxWidth: '100%', maxHeight: '88vh', display: 'flex', flexDirection: 'column', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '14px', padding: '22px' }}>
        <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--ink)' }}>Download Speaker Details (Excel)</div>
        <div style={{ fontSize: '12.5px', color: 'var(--ink3)', margin: '6px 0 12px' }}>
          Choose the fields to include for the <strong>{count}</strong> selected speaker{count === 1 ? '' : 's'}. All are selected by default.
        </div>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
          <Button variant="ghost" onClick={() => toggle(fields.map(f => f.key), true)} disabled={allOn}>Select all</Button>
          <Button variant="ghost" onClick={() => toggle(fields.map(f => f.key), false)} disabled={selected.size === 0}>Clear all</Button>
        </div>
        <div style={{ overflowY: 'auto', display: 'grid', gap: '12px', paddingRight: '4px' }}>
          {groups.map(group => {
            const inGroup = fields.filter(f => f.group === group)
            if (inGroup.length === 0) return null
            const keys = inGroup.map(f => f.key)
            const onCount = keys.filter(k => selected.has(k)).length
            return (
              <div key={group} style={{ border: '1px solid var(--border)', borderRadius: '10px', padding: '10px 12px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 800, color: 'var(--ink)', cursor: 'pointer' }}>
                  <input type="checkbox" checked={onCount === keys.length} ref={el => { if (el) el.indeterminate = onCount > 0 && onCount < keys.length }} onChange={e => toggle(keys, e.target.checked)} />
                  {group} <span style={{ fontWeight: 400, color: 'var(--ink4)', fontSize: '12px' }}>{onCount}/{keys.length}</span>
                </label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 18px', marginTop: '8px', paddingLeft: '24px' }}>
                  {inGroup.map(f => (
                    <label key={f.key} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', color: 'var(--ink3)', cursor: 'pointer' }}>
                      <input type="checkbox" checked={selected.has(f.key)} onChange={e => toggle([f.key], e.target.checked)} />
                      {f.label}
                    </label>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '16px' }}>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="teal" onClick={() => onDownload(fields.filter(f => selected.has(f.key)).map(f => f.key))} disabled={preparing || selected.size === 0}>
            {preparing ? 'Preparing…' : `Download ${selected.size} field${selected.size === 1 ? '' : 's'}`}
          </Button>
        </div>
      </div>
    </div>
  )
}
