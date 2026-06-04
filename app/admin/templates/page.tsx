'use client'

import { useState, useEffect } from 'react'

const C = {
  bg:      '#E8EEF4',
  surface: '#FFFFFF',
  border:  '#DDE8EE',
  text:    '#0F1923',
  muted:   '#5B7080',
  teal:    '#00695C',
  green:   '#C0F43C',
  red:     '#FF6B6B',
  amber:   '#F59E0B',
}

type Template = {
  id: string; label: string; event_name: string; description: string
  preview_url: string; repo_url: string; folder_name: string
  tech: string[]; pages: string[]; style_tags: string[]
  color_scheme: { bg: string; accent: string; highlight: string }
  sort_order: number
}

const BLANK: Partial<Template> = {
  id: '', label: '', event_name: '', description: '', repo_url: '', folder_name: '',
  tech: [], pages: [], style_tags: [],
  color_scheme: { bg: '#0D0F14', accent: '#00A5A3', highlight: '#F0B732' },
  sort_order: 99,
}

export default function TemplatesPage() {
  const [templates, setTemplates]   = useState<Template[]>([])
  const [loading,   setLoading]     = useState(true)
  const [showForm,  setShowForm]    = useState(false)
  const [form,      setForm]        = useState<Partial<Template>>(BLANK)
  const [saving,    setSaving]      = useState(false)
  const [msg,       setMsg]         = useState('')
  const [msgOk,     setMsgOk]       = useState(true)

  const showMsg = (m: string, ok = true) => { setMsg(m); setMsgOk(ok); setTimeout(() => setMsg(''), 4000) }

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const res  = await fetch('/api/templates')
    const data = await res.json()
    setTemplates(data.templates || [])
    setLoading(false)
  }

  async function save() {
    if (!form.id || !form.label || !form.event_name || !form.folder_name || !form.repo_url) {
      showMsg('ID, Label, Event Name, Folder Name and Repo URL are required', false); return
    }
    setSaving(true)
    const res = await fetch('/api/templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        color_bg:        form.color_scheme?.bg,
        color_accent:    form.color_scheme?.accent,
        color_highlight: form.color_scheme?.highlight,
        tech:       typeof form.tech === 'string' ? (form.tech as string).split(',').map((s: string) => s.trim()).filter(Boolean) : form.tech,
        pages:      typeof form.pages === 'string' ? (form.pages as string).split(',').map((s: string) => s.trim()).filter(Boolean) : form.pages,
        style_tags: typeof form.style_tags === 'string' ? (form.style_tags as string).split(',').map((s: string) => s.trim()).filter(Boolean) : form.style_tags,
      }),
    })
    const data = await res.json()
    setSaving(false)
    if (!res.ok) { showMsg(data.error ?? 'Save failed', false); return }
    showMsg('Template saved.')
    setShowForm(false)
    setForm(BLANK)
    load()
  }

  async function toggleActive(id: string, current: boolean) {
    await fetch('/api/templates', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, active: !current }),
    })
    load()
  }

  const F = ({ label, value, onChange, placeholder = '', mono = false }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; mono?: boolean }) => (
    <div>
      <label style={{ fontSize: '11px', fontWeight: 700, color: C.muted, display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</label>
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, fontFamily: mono ? 'monospace' : 'inherit', color: C.text, boxSizing: 'border-box' }} />
    </div>
  )

  return (
    <div style={{ padding: '32px', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, color: C.text }}>Site Templates</div>
          <div style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>Manage the event site templates available in the website builder. Super admins only.</div>
        </div>
        <button onClick={() => { setShowForm(true); setForm(BLANK) }}
          style={{ padding: '10px 20px', background: C.teal, color: '#fff', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
          + Add Template
        </button>
      </div>

      {/* Setup instructions */}
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: 20, marginBottom: 24 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: C.text, marginBottom: 10 }}>One-time setup — run on each machine (yours + Madhu's)</div>
        <div style={{ display: 'grid', gap: 8 }}>
          {[
            { step: '1', label: 'Clone the templates repo', cmd: 'git clone https://github.com/Trescon-Events/taos-templates.git ~/taos-templates' },
            { step: '2', label: 'Update when new templates are added', cmd: 'cd ~/taos-templates && git pull' },
            { step: '3', label: 'Generate a new event site', cmd: 'node ~/taos-templates/generate-site.mjs --template template-2-vault2047 --name my-event --event-id <id> --api-url https://taos.trescon.com' },
          ].map(item => (
            <div key={item.step} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <div style={{ width: 22, height: 22, borderRadius: '50%', background: C.teal, color: '#fff', fontSize: 11, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>{item.step}</div>
              <div>
                <div style={{ fontSize: 12, color: C.muted, marginBottom: 3 }}>{item.label}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <code style={{ fontSize: 11, background: C.bg, padding: '4px 10px', borderRadius: 6, color: C.text, display: 'block', wordBreak: 'break-all' }}>{item.cmd}</code>
                  <button onClick={() => navigator.clipboard.writeText(item.cmd)}
                    style={{ fontSize: 11, padding: '3px 10px', background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 6, cursor: 'pointer', color: C.muted, whiteSpace: 'nowrap', fontFamily: 'inherit' }}>
                    Copy
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* How to add a new template */}
      <div style={{ background: `${C.teal}0A`, border: `1px solid ${C.teal}30`, borderRadius: 14, padding: 20, marginBottom: 24 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: C.teal, marginBottom: 8 }}>Adding a new template</div>
        <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.7 }}>
          When you build a new standalone event website, register it here so it appears in the Template Gallery for all events.
          <ol style={{ margin: '10px 0 0 18px', display: 'grid', gap: 4 }}>
            <li>Build the site as normal, wire all components to read from <code style={{ background: 'rgba(0,105,92,0.1)', padding: '1px 5px', borderRadius: 4 }}>src/config/event.ts</code></li>
            <li>Copy the project folder into <code style={{ background: 'rgba(0,105,92,0.1)', padding: '1px 5px', borderRadius: 4 }}>~/taos-templates/template-6-your-event-name/</code></li>
            <li>Push: <code style={{ background: 'rgba(0,105,92,0.1)', padding: '1px 5px', borderRadius: 4 }}>cd ~/taos-templates && git add . && git commit -m "add template-6" && git push</code></li>
            <li>Click <strong>+ Add Template</strong> above and fill in the details — it immediately appears in the builder for all events</li>
          </ol>
        </div>
      </div>

      {msg && (
        <div style={{ marginBottom: 16, padding: '10px 16px', borderRadius: 10, background: msgOk ? 'rgba(192,244,60,0.08)' : 'rgba(255,107,107,0.08)', border: `1px solid ${msgOk ? 'rgba(192,244,60,0.3)' : 'rgba(255,107,107,0.3)'}`, color: msgOk ? C.teal : C.red, fontSize: 13 }}>
          {msg}
        </div>
      )}

      {/* Add template form */}
      {showForm && (
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: 24, marginBottom: 24 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: C.text, marginBottom: 20 }}>Register New Template</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
            <F label="Template ID *" value={form.id || ''} onChange={v => setForm(s => ({ ...s, id: v.toLowerCase().replace(/\s+/g, '-') }))} placeholder="template-6-world-bfsi-summit" mono />
            <F label="Display Label *" value={form.label || ''} onChange={v => setForm(s => ({ ...s, label: v }))} placeholder="Template 6 — World BFSI Summit" />
            <F label="Event Name *" value={form.event_name || ''} onChange={v => setForm(s => ({ ...s, event_name: v }))} placeholder="World BFSI Summit" />
            <F label="Folder Name in taos-templates *" value={form.folder_name || ''} onChange={v => setForm(s => ({ ...s, folder_name: v }))} placeholder="template-6-world-bfsi-summit" mono />
          </div>
          <div style={{ marginBottom: 14 }}>
            <F label="GitHub Repo URL *" value={form.repo_url || ''} onChange={v => setForm(s => ({ ...s, repo_url: v }))} placeholder="https://github.com/Trescon-Events/taos-templates/tree/main/template-6-..." />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: '11px', fontWeight: 700, color: C.muted, display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Description</label>
            <textarea value={form.description || ''} onChange={e => setForm(s => ({ ...s, description: e.target.value }))} rows={2}
              placeholder="Describe the design style, what events it suits, key features..."
              style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, fontFamily: 'inherit', color: C.text, resize: 'vertical', boxSizing: 'border-box' }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginBottom: 14 }}>
            <F label="Tech stack (comma-separated)" value={Array.isArray(form.tech) ? form.tech.join(', ') : (form.tech as unknown as string) || ''} onChange={v => setForm(s => ({ ...s, tech: v as unknown as string[] }))} placeholder="Next.js, Framer Motion, Tailwind" />
            <F label="Pages (comma-separated)" value={Array.isArray(form.pages) ? form.pages.join(', ') : (form.pages as unknown as string) || ''} onChange={v => setForm(s => ({ ...s, pages: v as unknown as string[] }))} placeholder="home, speakers, agenda, partners" />
            <F label="Style tags (comma-separated)" value={Array.isArray(form.style_tags) ? form.style_tags.join(', ') : (form.style_tags as unknown as string) || ''} onChange={v => setForm(s => ({ ...s, style_tags: v as unknown as string[] }))} placeholder="dark, glassmorphism, awards" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr', gap: 14, marginBottom: 20 }}>
            <F label="BG Colour" value={form.color_scheme?.bg || '#0D0F14'} onChange={v => setForm(s => ({ ...s, color_scheme: { ...s.color_scheme!, bg: v } }))} placeholder="#0D0F14" mono />
            <F label="Accent Colour" value={form.color_scheme?.accent || '#00A5A3'} onChange={v => setForm(s => ({ ...s, color_scheme: { ...s.color_scheme!, accent: v } }))} placeholder="#00A5A3" mono />
            <F label="Highlight Colour" value={form.color_scheme?.highlight || '#F0B732'} onChange={v => setForm(s => ({ ...s, color_scheme: { ...s.color_scheme!, highlight: v } }))} placeholder="#F0B732" mono />
            <F label="Preview Image URL" value={form.preview_url || ''} onChange={v => setForm(s => ({ ...s, preview_url: v }))} placeholder="/template-previews/template-6.jpg" />
            <F label="Sort Order" value={String(form.sort_order ?? 99)} onChange={v => setForm(s => ({ ...s, sort_order: parseInt(v) || 99 }))} placeholder="6" />
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={save} disabled={saving}
              style={{ padding: '10px 24px', background: C.teal, color: '#fff', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1, fontFamily: 'inherit' }}>
              {saving ? 'Saving…' : 'Save Template'}
            </button>
            <button onClick={() => { setShowForm(false); setForm(BLANK) }}
              style={{ padding: '10px 20px', background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer', color: C.muted, fontFamily: 'inherit' }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Template list */}
      {loading ? (
        <div style={{ fontSize: 13, color: C.muted, padding: 20 }}>Loading templates…</div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {templates.map(t => (
            <div key={t.id} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: 20, display: 'flex', gap: 20, alignItems: 'flex-start' }}>
              {/* Colour swatch */}
              <div style={{ width: 56, height: 56, borderRadius: 10, background: t.color_scheme.bg, flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', padding: 6, gap: 4 }}>
                <div style={{ display: 'flex', gap: 3 }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: t.color_scheme.accent }} />
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: t.color_scheme.highlight }} />
                </div>
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 14, fontWeight: 800, color: C.text }}>{t.label}</span>
                  <span style={{ fontSize: 11, color: C.muted }}>{t.event_name}</span>
                  {t.style_tags.slice(0, 3).map(tag => (
                    <span key={tag} style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20, background: `${C.teal}18`, color: C.teal }}>{tag}</span>
                  ))}
                </div>
                <div style={{ fontSize: 12, color: C.muted, marginBottom: 8, lineHeight: 1.5 }}>{t.description}</div>
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 11, color: C.muted }}><strong>Folder:</strong> <code style={{ background: C.bg, padding: '1px 5px', borderRadius: 4 }}>{t.folder_name}</code></span>
                  <a href={t.repo_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: C.teal, textDecoration: 'none' }}>View on GitHub</a>
                  <span style={{ fontSize: 11, color: C.muted }}>{t.pages.length} pages</span>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                <button onClick={() => { setForm({ ...t }); setShowForm(true) }}
                  style={{ padding: '6px 14px', background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', color: C.text, fontFamily: 'inherit' }}>
                  Edit
                </button>
                <button onClick={() => toggleActive(t.id, true)}
                  style={{ padding: '6px 14px', background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', color: C.red, fontFamily: 'inherit' }}>
                  Hide
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
