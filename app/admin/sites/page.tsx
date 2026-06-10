'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

const C = {
  bg:      '#E8EEF4',
  surface: '#FFFFFF',
  border:  '#DDE8EE',
  text:    '#0F1923',
  muted:   '#5B7080',
  teal:    '#00695C',
  green:   '#C0F43C',
  amber:   '#F59E0B',
  red:     '#FF6B6B',
}

type EventRow = { id: string; name: string; city: string | null; status: string; event_date: string | null }
type TemplateInfo = {
  id: string; label: string; event_name: string; description: string
  pages: string[]; style_tags: string[]
  color_scheme: { bg: string; accent: string; highlight: string }
}
type DeployResult = { repo_url: string; gh_actions_url: string; worker_name: string; site_url: string }
type ExistingSite = { repo_url: string; gh_actions_url?: string; site_url?: string; status: string; template_id: string; worker_name?: string }

export default function SiteBuilderPage() {
  const [events,          setEvents]          = useState<EventRow[]>([])
  const [templates,       setTemplates]       = useState<TemplateInfo[]>([])
  const [selectedEvent,   setSelectedEvent]   = useState<string>('')
  const [selectedTemplate, setSelectedTemplate] = useState<string>('')
  const [deploying,       setDeploying]       = useState(false)
  const [deployResult,    setDeployResult]    = useState<DeployResult | null>(null)
  const [existingSite,    setExistingSite]    = useState<ExistingSite | null>(null)
  const [error,           setError]           = useState('')
  const [loading,         setLoading]         = useState(true)

  // Load events + templates
  useEffect(() => {
    Promise.all([
      fetch('/api/events').then(r => r.json()),
      fetch('/api/templates').then(r => r.json()),
    ]).then(([evData, tmData]) => {
      const evList = evData.events ?? evData ?? []
      setEvents(Array.isArray(evList) ? evList : [])
      if (tmData.templates) setTemplates(tmData.templates)
    }).catch(() => {}).finally(() => setLoading(false))
  }, [])

  // Load existing site when event changes
  useEffect(() => {
    if (!selectedEvent) { setExistingSite(null); setDeployResult(null); return }
    setExistingSite(null)
    setDeployResult(null)
    fetch(`/api/sites/deploy?event_id=${selectedEvent}`)
      .then(r => r.json())
      .then(d => {
        if (d.site) {
          setExistingSite({ ...d.site, gh_actions_url: `${d.site.repo_url}/actions` })
          setSelectedTemplate(d.site.template_id)
        }
      }).catch(() => {})
  }, [selectedEvent])

  async function deploy() {
    if (!selectedEvent || !selectedTemplate) return
    setDeploying(true)
    setError('')
    setDeployResult(null)
    try {
      const res = await fetch('/api/sites/deploy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_id: selectedEvent, template_id: selectedTemplate }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Deploy failed'); return }
      setDeployResult(data)
      setExistingSite({ repo_url: data.repo_url, gh_actions_url: data.gh_actions_url, site_url: data.site_url, status: 'deploying', template_id: selectedTemplate, worker_name: data.worker_name })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Deploy failed')
    } finally {
      setDeploying(false)
    }
  }

  const selectedEventObj   = events.find(e => e.id === selectedEvent)
  const selectedTemplateObj = templates.find(t => t.id === selectedTemplate)
  const readyToDeploy = selectedEvent && selectedTemplate && !deploying

  return (
    <div style={{ minHeight: '100vh', background: C.bg }}>

      {/* Nav */}
      <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, padding: '0 32px', height: '58px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Link href="/admin" style={{ textDecoration: 'none' }}>
            <img src="/trescon-logo.png" alt="Trescon" style={{ height: '34px', width: 'auto' }} />
          </Link>
          <div style={{ width: '1px', height: '20px', background: C.border }} />
          <div style={{ fontSize: '13px', fontWeight: 800, color: C.text }}>Site Builder</div>
        </div>
        <Link href="/admin/templates" style={{ fontSize: '12px', fontWeight: 700, color: C.teal, textDecoration: 'none', padding: '6px 14px', border: `1px solid ${C.teal}40`, borderRadius: '8px' }}>
          Manage Templates
        </Link>
      </div>

      <div style={{ maxWidth: '960px', margin: '0 auto', padding: '40px 24px', display: 'grid', gap: '28px' }}>

        {/* Header */}
        <div>
          <div style={{ fontSize: '22px', fontWeight: 900, color: C.text, marginBottom: '6px' }}>Create an Event Site</div>
          <div style={{ fontSize: '14px', color: C.muted }}>Pick an event and a template. Event Pilot creates the GitHub repo, injects your data, and deploys automatically.</div>
        </div>

        {/* Step 1 — Pick Event */}
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '16px', padding: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
            <div style={{ width: '26px', height: '26px', borderRadius: '50%', background: selectedEvent ? C.teal : C.border, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 900, color: selectedEvent ? '#fff' : C.muted, flexShrink: 0 }}>1</div>
            <div style={{ fontSize: '14px', fontWeight: 800, color: C.text }}>Select Event</div>
          </div>

          {loading ? (
            <div style={{ fontSize: '13px', color: C.muted }}>Loading events…</div>
          ) : (
            <select
              value={selectedEvent}
              onChange={e => setSelectedEvent(e.target.value)}
              style={{ width: '100%', padding: '10px 14px', borderRadius: '10px', border: `1px solid ${C.border}`, fontSize: '13px', fontFamily: 'inherit', color: C.text, background: C.bg, cursor: 'pointer' }}
            >
              <option value="">— choose an event —</option>
              {events.map(ev => (
                <option key={ev.id} value={ev.id}>
                  {ev.name}{ev.city ? ` · ${ev.city}` : ''}{ev.event_date ? ` · ${new Date(ev.event_date).getFullYear()}` : ''}
                </option>
              ))}
            </select>
          )}

          {/* Existing site banner */}
          {existingSite && !deployResult && (
            <div style={{ marginTop: '14px', background: `${C.teal}10`, border: `1px solid ${C.teal}30`, borderRadius: '10px', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
              <div>
                <div style={{ fontSize: '12px', fontWeight: 800, color: C.teal }}>Site already deployed</div>
                <div style={{ fontSize: '11px', color: C.muted, marginTop: '2px' }}>Template: {templates.find(t => t.id === existingSite.template_id)?.label ?? existingSite.template_id}</div>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                {existingSite.site_url && (
                  <a href={existingSite.site_url} target="_blank" rel="noreferrer"
                    style={{ fontSize: '11px', fontWeight: 700, color: '#fff', background: C.teal, padding: '5px 12px', borderRadius: '7px', textDecoration: 'none' }}>
                    Visit Site
                  </a>
                )}
                <a href={existingSite.repo_url} target="_blank" rel="noreferrer"
                  style={{ fontSize: '11px', fontWeight: 700, color: C.text, background: C.bg, border: `1px solid ${C.border}`, padding: '5px 12px', borderRadius: '7px', textDecoration: 'none' }}>
                  GitHub
                </a>
              </div>
            </div>
          )}
        </div>

        {/* Step 2 — Pick Template */}
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '16px', padding: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
            <div style={{ width: '26px', height: '26px', borderRadius: '50%', background: selectedTemplate ? C.teal : C.border, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 900, color: selectedTemplate ? '#fff' : C.muted, flexShrink: 0 }}>2</div>
            <div style={{ fontSize: '14px', fontWeight: 800, color: C.text }}>Choose Template</div>
          </div>

          {templates.length === 0 ? (
            <div style={{ fontSize: '13px', color: C.muted }}>Loading templates…</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '14px' }}>
              {templates.map(t => {
                const sel = selectedTemplate === t.id
                return (
                  <button key={t.id} onClick={() => setSelectedTemplate(sel ? '' : t.id)}
                    style={{ background: C.surface, border: `2px solid ${sel ? C.teal : C.border}`, borderRadius: '14px', padding: 0, textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', transition: 'border-color 0.15s', overflow: 'hidden' }}>
                    <div style={{ height: '72px', background: t.color_scheme.bg, position: 'relative', display: 'flex', alignItems: 'flex-end', padding: '10px 12px', gap: '6px' }}>
                      <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: t.color_scheme.accent, border: '2px solid rgba(255,255,255,0.2)' }} />
                      <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: t.color_scheme.highlight, border: '2px solid rgba(255,255,255,0.2)' }} />
                      {sel && <div style={{ position: 'absolute', top: '8px', right: '8px', background: C.teal, color: '#fff', fontSize: '10px', fontWeight: 800, padding: '2px 8px', borderRadius: '20px' }}>SELECTED</div>}
                      <div style={{ position: 'absolute', top: '8px', left: '12px', background: 'rgba(0,0,0,0.5)', color: 'rgba(255,255,255,0.85)', fontSize: '9px', fontWeight: 700, padding: '2px 7px', borderRadius: '20px' }}>{t.event_name}</div>
                    </div>
                    <div style={{ padding: '12px 14px' }}>
                      <div style={{ fontSize: '13px', fontWeight: 800, color: C.text, marginBottom: '4px' }}>{t.label}</div>
                      <div style={{ fontSize: '11px', color: C.muted, lineHeight: 1.5, marginBottom: '8px' }}>{t.description}</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                        {t.style_tags.map(tag => (
                          <span key={tag} style={{ fontSize: '10px', fontWeight: 700, padding: '2px 6px', borderRadius: '20px', background: `${C.teal}18`, color: C.teal }}>{tag}</span>
                        ))}
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Step 3 — Deploy */}
        {!deployResult && (
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '16px', padding: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
              <div style={{ width: '26px', height: '26px', borderRadius: '50%', background: readyToDeploy ? C.teal : C.border, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 900, color: readyToDeploy ? '#fff' : C.muted, flexShrink: 0 }}>3</div>
              <div style={{ fontSize: '14px', fontWeight: 800, color: C.text }}>Deploy</div>
            </div>

            {selectedEventObj && selectedTemplateObj ? (
              <div style={{ marginBottom: '16px', padding: '12px 16px', background: C.bg, borderRadius: '10px', display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                <div><span style={{ fontSize: '11px', fontWeight: 700, color: C.muted, textTransform: 'uppercase' }}>Event</span><div style={{ fontSize: '13px', fontWeight: 700, color: C.text, marginTop: '2px' }}>{selectedEventObj.name}</div></div>
                <div style={{ width: '1px', background: C.border }} />
                <div><span style={{ fontSize: '11px', fontWeight: 700, color: C.muted, textTransform: 'uppercase' }}>Template</span><div style={{ fontSize: '13px', fontWeight: 700, color: C.text, marginTop: '2px' }}>{selectedTemplateObj.label}</div></div>
              </div>
            ) : (
              <div style={{ fontSize: '13px', color: C.muted, marginBottom: '16px' }}>Select an event and template above to continue.</div>
            )}

            {deploying && (
              <div style={{ marginBottom: '16px', display: 'grid', gap: '8px' }}>
                {['Reading template files from GitHub', 'Creating site repo under Trescon-Events', 'Injecting event data — brand, speakers, sponsors', 'Setting up GitHub Actions for auto-deploy', 'Pushing to GitHub — build starting…'].map((step, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: C.teal, flexShrink: 0 }} />
                    <div style={{ fontSize: '12px', color: C.muted }}>{step}</div>
                  </div>
                ))}
              </div>
            )}

            {error && <div style={{ marginBottom: '14px', padding: '10px 14px', background: 'rgba(255,107,107,0.08)', border: '1px solid rgba(255,107,107,0.3)', borderRadius: '8px', fontSize: '12px', color: C.red }}>{error}</div>}

            <button
              disabled={!readyToDeploy}
              onClick={deploy}
              style={{ padding: '12px 28px', background: readyToDeploy ? C.teal : C.border, color: readyToDeploy ? '#fff' : C.muted, border: 'none', borderRadius: '10px', fontSize: '13px', fontWeight: 700, cursor: readyToDeploy ? 'pointer' : 'not-allowed', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
              {deploying
                ? <><svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24" className="spin"><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"/><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/></svg>Creating site…</>
                : <><svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" viewBox="0 0 24 24"><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0018 9h-1.26A8 8 0 103 16.3"/></svg>
                  {existingSite ? 'Redeploy with New Template' : 'Create & Deploy Site'}</>
              }
            </button>
          </div>
        )}

        {/* Result */}
        {deployResult && (
          <div style={{ background: `${C.teal}08`, border: `2px solid ${C.teal}40`, borderRadius: '16px', padding: '28px', display: 'grid', gap: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <div style={{ width: '44px', height: '44px', borderRadius: '50%', background: `${C.teal}20`, border: `2px solid ${C.teal}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="20" height="20" fill="none" stroke={C.teal} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
              </div>
              <div>
                <div style={{ fontSize: '16px', fontWeight: 900, color: C.teal }}>Site created successfully</div>
                <div style={{ fontSize: '13px', color: C.muted, marginTop: '2px' }}>GitHub repo is ready. Build running — live in 5–8 minutes.</div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px' }}>
              {[
                { label: 'GitHub Repo', url: deployResult.repo_url, sub: deployResult.repo_url.replace('https://github.com/', ''), color: C.text },
                { label: 'Build Logs', url: deployResult.gh_actions_url, sub: 'GitHub Actions — live progress', color: C.amber },
                { label: 'Live URL', url: deployResult.site_url, sub: deployResult.site_url + ' (active after build)', color: C.teal },
              ].map(item => (
                <a key={item.label} href={item.url} target="_blank" rel="noreferrer"
                  style={{ padding: '14px 16px', background: C.surface, border: `1px solid ${C.border}`, borderRadius: '12px', textDecoration: 'none', display: 'block' }}>
                  <div style={{ fontSize: '11px', fontWeight: 800, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>{item.label}</div>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: item.color, wordBreak: 'break-all' }}>{item.sub}</div>
                </a>
              ))}
            </div>

            <button onClick={() => { setDeployResult(null); setSelectedEvent(''); setSelectedTemplate('') }}
              style={{ padding: '10px 20px', background: C.bg, border: `1px solid ${C.border}`, borderRadius: '9px', fontSize: '12px', fontWeight: 700, color: C.text, cursor: 'pointer', fontFamily: 'inherit', width: 'fit-content' }}>
              Deploy another site
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
