'use client'

import { useState, useEffect, useMemo } from 'react'

type StaffOption = { id: string; name: string; email: string }

// Searchable staff dropdown — selecting a person sets sender_name/
// sender_email/sender_staff_id on the template form. Sourced from the same
// /api/staff-list Phase 1's Assignments tab already uses. Not a generic
// reusable combobox component — small and local, matching the scope of
// what's actually needed here (no other picker like this exists yet to
// extract a shared abstraction from).
export default function SenderPicker({
  senderStaffId, senderName, senderEmail, onChange,
}: {
  senderStaffId: string | null
  senderName: string
  senderEmail: string
  onChange: (v: { sender_staff_id: string | null; sender_name: string; sender_email: string }) => void
}) {
  const [staff, setStaff] = useState<StaffOption[]>([])
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)

  useEffect(() => {
    fetch('/api/staff-list').then(r => r.json()).then(d => {
      setStaff(Array.isArray(d) ? d.map((s: StaffOption) => ({ id: s.id, name: s.name, email: s.email })) : [])
    }).catch(() => {})
  }, [])

  const filtered = useMemo(() => {
    if (!query.trim()) return staff.slice(0, 8)
    const q = query.toLowerCase()
    return staff.filter(s => s.name.toLowerCase().includes(q) || s.email.toLowerCase().includes(q)).slice(0, 8)
  }, [staff, query])

  return (
    <div style={{ position: 'relative' }}>
      <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '1px', display: 'block', marginBottom: '6px' }}>Sender</span>
      {senderStaffId ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--border-light)' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink)' }}>{senderName}</div>
            <div style={{ fontSize: '11.5px', color: 'var(--ink3)' }}>{senderEmail}</div>
          </div>
          <button onClick={() => { onChange({ sender_staff_id: null, sender_name: '', sender_email: '' }); setOpen(true) }}
            style={{ fontSize: '12px', fontWeight: 700, color: 'var(--ink3)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
            Change
          </button>
        </div>
      ) : (
        <>
          <input
            value={query}
            onChange={e => { setQuery(e.target.value); setOpen(true) }}
            onFocus={() => setOpen(true)}
            placeholder="Search staff by name or email…"
            style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px', fontFamily: 'inherit', boxSizing: 'border-box' }}
          />
          {open && filtered.length > 0 && (
            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10, marginTop: '4px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '8px', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', maxHeight: '220px', overflowY: 'auto' }}>
              {filtered.map(s => (
                <button
                  key={s.id}
                  onClick={() => { onChange({ sender_staff_id: s.id, sender_name: s.name, sender_email: s.email }); setQuery(''); setOpen(false) }}
                  style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 12px', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
                  onMouseDown={e => e.preventDefault()}
                >
                  <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink)' }}>{s.name}</div>
                  <div style={{ fontSize: '11.5px', color: 'var(--ink3)' }}>{s.email}</div>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
