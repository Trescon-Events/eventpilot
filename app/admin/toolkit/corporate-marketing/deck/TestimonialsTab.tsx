'use client'

/*
  Testimonials tab — CRUD on corporate_testimonials.

  Rows list vertically. "Add testimonial" opens an inline form.
  Each row has: quote / author / company / approved toggle / include toggle
  / display order / delete.
*/

import { useCallback, useEffect, useState } from 'react'
import { BRAND, Card, SectionLabel, H2, PrimaryButton, GhostButton, ErrorBox, inputStyle, textareaStyle, fmtDate } from './_shared'

type Testimonial = {
  id:              string
  quote:           string
  author_name:     string
  author_title:    string | null
  author_company:  string | null
  author_photo_url:string | null
  event_id:        string | null
  approved:        boolean
  include_in_deck: boolean
  display_order:   number
  created_at:      string
  updated_at:      string
}

export default function TestimonialsTab() {
  const [rows, setRows]         = useState<Testimonial[]>([])
  const [loading, setLoading]   = useState(true)
  const [err, setErr]           = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [newRow, setNewRow]     = useState({ quote: '', author_name: '', author_title: '', author_company: '' })

  const load = useCallback(async () => {
    const res = await fetch('/api/corporate-marketing/testimonials', { cache: 'no-store' })
    if (res.ok) {
      const d = await res.json()
      setRows(d.testimonials ?? [])
    }
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  async function createRow() {
    setErr(null)
    // Testimonials are flexible — Marketing may only have a company name
    // (brand testimonial with no named person), or a quote with no author,
    // etc. Only reject if all three key fields are empty.
    if (!newRow.quote.trim() && !newRow.author_name.trim() && !newRow.author_company.trim()) {
      setErr('Please provide at least a quote, author name, or company')
      return
    }
    try {
      const res = await fetch('/api/corporate-marketing/testimonials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quote:           newRow.quote.trim(),
          author_name:     newRow.author_name.trim(),
          author_title:    newRow.author_title.trim() || null,
          author_company:  newRow.author_company.trim() || null,
          approved:        false,
          include_in_deck: true,
        }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d?.error ?? 'Create failed')
      }
      setNewRow({ quote: '', author_name: '', author_title: '', author_company: '' })
      setCreating(false)
      await load()
    } catch (e) {
      setErr((e as Error).message)
    }
  }

  async function patchRow(id: string, patch: Partial<Testimonial>) {
    setErr(null)
    setRows(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r))
    try {
      const res = await fetch(`/api/corporate-marketing/testimonials/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d?.error ?? 'Save failed')
      }
    } catch (e) {
      setErr((e as Error).message)
      await load()
    }
  }

  async function deleteRow(id: string) {
    if (!confirm('Delete this testimonial?')) return
    setErr(null)
    try {
      const res = await fetch(`/api/corporate-marketing/testimonials/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d?.error ?? 'Delete failed')
      }
      await load()
    } catch (e) {
      setErr((e as Error).message)
    }
  }

  if (loading) return <Card><div style={{ fontSize: '13px', color: '#5B7080' }}>Loading testimonials…</div></Card>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px', maxWidth: '980px' }}>
      <Card>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '20px', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <SectionLabel>Testimonials</SectionLabel>
            <H2 style={{ marginBottom: '6px' }}>{rows.length} approved quote{rows.length === 1 ? '' : 's'}</H2>
            <div style={{ fontSize: '13px', color: '#5B7080', lineHeight: 1.6 }}>
              Approved testimonials used in the deck. Only rows marked <strong>Approved</strong> AND <strong>Include in deck</strong> appear in the published version.
            </div>
          </div>
          {!creating && <PrimaryButton onClick={() => setCreating(true)}>+ Add testimonial</PrimaryButton>}
        </div>

        {creating && (
          <div style={{ marginTop: '20px', border: `1px solid ${BRAND}30`, background: `${BRAND}05`, borderRadius: '14px', padding: '18px' }}>
            <div style={{ fontSize: '12px', fontWeight: 800, color: BRAND, letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '12px' }}>New testimonial</div>
            <textarea
              value={newRow.quote}
              onChange={e => setNewRow({ ...newRow, quote: e.target.value })}
              placeholder="&ldquo;Best partner we&rsquo;ve worked with…&rdquo;"
              style={{ ...textareaStyle, marginBottom: '10px' }}
            />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
              <input value={newRow.author_name} onChange={e => setNewRow({ ...newRow, author_name: e.target.value })} placeholder="Author name *" style={inputStyle} />
              <input value={newRow.author_title} onChange={e => setNewRow({ ...newRow, author_title: e.target.value })} placeholder="Author title" style={inputStyle} />
            </div>
            <input value={newRow.author_company} onChange={e => setNewRow({ ...newRow, author_company: e.target.value })} placeholder="Author company" style={inputStyle} />
            <div style={{ marginTop: '12px', display: 'flex', gap: '10px' }}>
              <PrimaryButton onClick={createRow}>Add</PrimaryButton>
              <GhostButton onClick={() => { setCreating(false); setNewRow({ quote: '', author_name: '', author_title: '', author_company: '' }); setErr(null) }}>Cancel</GhostButton>
            </div>
          </div>
        )}
      </Card>

      {rows.length === 0 && !creating && (
        <Card><div style={{ fontSize: '13px', color: '#94A3B8', fontStyle: 'italic', textAlign: 'center', padding: '20px' }}>No testimonials yet — add one above.</div></Card>
      )}

      {rows.map(t => (
        <Card key={t.id} style={{ padding: '22px 26px' }}>
          <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
            <div style={{ fontSize: '30px', color: `${BRAND}80`, lineHeight: 1, fontFamily: 'serif' }}>&ldquo;</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <textarea
                value={t.quote}
                onChange={e => setRows(prev => prev.map(r => r.id === t.id ? { ...r, quote: e.target.value } : r))}
                onBlur={e => patchRow(t.id, { quote: e.target.value })}
                style={{ ...textareaStyle, fontSize: '14px', lineHeight: 1.6, border: 'none', padding: '4px 6px', minHeight: '40px', background: 'transparent' }}
              />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginTop: '10px' }}>
                <input
                  value={t.author_name}
                  onChange={e => setRows(prev => prev.map(r => r.id === t.id ? { ...r, author_name: e.target.value } : r))}
                  onBlur={e => patchRow(t.id, { author_name: e.target.value })}
                  placeholder="Author"
                  style={{ ...inputStyle, fontSize: '12px', padding: '8px 10px' }}
                />
                <input
                  value={t.author_title ?? ''}
                  onChange={e => setRows(prev => prev.map(r => r.id === t.id ? { ...r, author_title: e.target.value } : r))}
                  onBlur={e => patchRow(t.id, { author_title: e.target.value })}
                  placeholder="Title"
                  style={{ ...inputStyle, fontSize: '12px', padding: '8px 10px' }}
                />
                <input
                  value={t.author_company ?? ''}
                  onChange={e => setRows(prev => prev.map(r => r.id === t.id ? { ...r, author_company: e.target.value } : r))}
                  onBlur={e => patchRow(t.id, { author_company: e.target.value })}
                  placeholder="Company"
                  style={{ ...inputStyle, fontSize: '12px', padding: '8px 10px' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '18px', alignItems: 'center', marginTop: '14px', flexWrap: 'wrap' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 700, color: '#0F1923' }}>
                  <input
                    type="checkbox"
                    checked={t.approved}
                    onChange={e => patchRow(t.id, { approved: e.target.checked })}
                    style={{ accentColor: BRAND }}
                  />
                  Approved
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 700, color: '#0F1923' }}>
                  <input
                    type="checkbox"
                    checked={t.include_in_deck}
                    onChange={e => patchRow(t.id, { include_in_deck: e.target.checked })}
                    style={{ accentColor: BRAND }}
                  />
                  In deck
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 700, color: '#0F1923' }}>
                  Order
                  <input
                    type="number"
                    value={t.display_order}
                    onChange={e => setRows(prev => prev.map(r => r.id === t.id ? { ...r, display_order: Number.parseInt(e.target.value || '0', 10) } : r))}
                    onBlur={e => patchRow(t.id, { display_order: Number.parseInt(e.target.value || '0', 10) })}
                    style={{ width: '55px', padding: '5px 8px', borderRadius: '6px', border: '1px solid #DDE8EE', fontSize: '12px', fontFamily: 'inherit', textAlign: 'center' }}
                  />
                </label>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <span style={{ fontSize: '11px', color: '#94A3B8', fontWeight: 600 }}>Added {fmtDate(t.created_at)}</span>
                  <button
                    onClick={() => deleteRow(t.id)}
                    style={{ background: 'transparent', border: 'none', color: '#B91C1C', cursor: 'pointer', fontSize: '12px', fontWeight: 700, padding: '4px 8px' }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          </div>
        </Card>
      ))}

      {err && <ErrorBox>{err}</ErrorBox>}
    </div>
  )
}
