'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import ScoringGuideContent from './ScoringGuideContent'
import QuestionnaireContent from './QuestionnaireContent'
import PlaybookContent from './PlaybookContent'
import NavBar, { MOD_KNOWLEDGE } from '@/app/components/NavBar'

type Doc = {
  id: string
  slug: string
  category: string
  title: string
  content: string
  order_index: number
  updated_at: string
}

// Built-in docs rendered as components (not Supabase text)
const BUILT_IN: { slug: string; title: string; category: string }[] = [
  { slug: '__scoring',       title: 'TAIRS Scoring Guide',     category: 'Platform Reference' },
  { slug: '__questionnaire', title: 'Discovery Questionnaire', category: 'Platform Reference' },
  { slug: '__playbook',      title: 'AI Readiness Playbook',   category: 'Operations Reference' },
]

// Priority order — determines sidebar section sequence
const SECTION_ORDER = [
  'Platform Reference',
  'Platform Overview',
  'How the Platform Works',
  'User Guide',
  'Operations Reference',
  'Technical Reference',
]

const SECTION_DESC: Record<string, string> = {
  'Platform Reference':    'Scoring methodology and the staff discovery questionnaire',
  'Platform Overview':     'What EventPilot is, how it works, and what the numbers mean',
  'How the Platform Works': 'The logic behind recommendations, hierarchy, and learning tracks',
  'User Guide':            'Step-by-step guides for staff, managers, and admins',
  'Operations Reference':  'Event execution workflows, RACI governance, and access control',
  'Technical Reference':   'API endpoints, data structure, and platform architecture',
}

const SECTION_COLOR: Record<string, string> = {
  'Platform Reference':    '#FF6B6B',
  'Platform Overview':     '#00897B',
  'How the Platform Works': '#C0F43C',
  'User Guide':            '#A478FF',
  'Operations Reference':  '#7C3AED',
  'Technical Reference':   '#8B1A1A',
}

const SECTION_ICON: Record<string, React.ReactNode> = {
  'Platform Reference':    <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
  'Platform Overview':     <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>,
  'How the Platform Works': <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
  'User Guide':            <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
  'Operations Reference':  <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>,
  'Technical Reference':   <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>,
}

function formatContent(text: string) {
  const lines = text.split('\n')
  const elements: React.ReactNode[] = []
  let key = 0
  for (const line of lines) {
    if (!line.trim()) {
      elements.push(<div key={key++} style={{ height: '10px' }} />)
    } else if (/^[A-Z][A-Z\s&:]+$/.test(line.trim()) && line.trim().length > 3) {
      elements.push(
        <div key={key++} style={{ fontSize: '13px', fontWeight: 800, letterSpacing: '1.5px', color: '#00695C', textTransform: 'uppercase', marginTop: '20px', marginBottom: '6px' }}>
          {line.trim()}
        </div>
      )
    } else if (line.startsWith('- ') || line.startsWith('• ')) {
      elements.push(
        <div key={key++} style={{ display: 'flex', gap: '10px', marginBottom: '5px', paddingLeft: '4px' }}>
          <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#00897B', marginTop: '8px', flexShrink: 0 }} />
          <span style={{ fontSize: '13px', color: '#2D3E50', lineHeight: 1.65 }}>{line.replace(/^[-•]\s/, '')}</span>
        </div>
      )
    } else {
      const parts = line.split(/(\*\*[^*]+\*\*)/g)
      elements.push(
        <p key={key++} style={{ fontSize: '13px', color: '#2D3E50', lineHeight: 1.72, margin: '0 0 4px' }}>
          {parts.map((part, i) =>
            part.startsWith('**') && part.endsWith('**')
              ? <strong key={i} style={{ color: '#0F1923', fontWeight: 700 }}>{part.slice(2, -2)}</strong>
              : part
          )}
        </p>
      )
    }
  }
  return elements
}

export default function DocsPage() {
  const [docs,       setDocs]       = useState<Doc[]>([])
  const [activeSlug, setActiveSlug] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const p = new URLSearchParams(window.location.search).get('slug')
      if (p) return p
    }
    return '__scoring'
  })
  const [loading,    setLoading]    = useState(true)
  const [search,     setSearch]     = useState('')
  const [isAdmin,    setIsAdmin]    = useState(false)
  // Sections open by default
  const [openSections, setOpenSections] = useState<Set<string>>(
    new Set(['Platform Reference', 'Platform Overview', 'Operations Reference'])
  )

  useEffect(() => {
    setIsAdmin(sessionStorage.getItem('tai_admin_authed') === '1')
    fetch('/api/platform-docs')
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data) && data.length > 0) setDocs(data)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  function toggleSection(name: string) {
    setOpenSections(prev => {
      const next = new Set(prev)
      next.has(name) ? next.delete(name) : next.add(name)
      return next
    })
  }

  function selectDoc(slug: string, category: string) {
    setActiveSlug(slug)
    setSearch('')
    // Auto-open the section containing this doc
    setOpenSections(prev => new Set([...prev, category]))
  }

  const isBuiltIn     = BUILT_IN.some(b => b.slug === activeSlug)
  const activeBuiltIn = BUILT_IN.find(b => b.slug === activeSlug)
  const activeDoc     = docs.find(d => d.slug === activeSlug)
  const activeCategory = (activeBuiltIn ?? activeDoc)?.category ?? ''

  // Build ordered sections for sidebar
  const allDbCategories = [...new Set(docs.map(d => d.category))]
  const orderedSections = [
    ...SECTION_ORDER.filter(s => s === 'Platform Reference' || allDbCategories.includes(s)),
    ...allDbCategories.filter(c => !SECTION_ORDER.includes(c)),
  ]

  // Search across all items
  const searchResults = search.trim()
    ? [
        ...BUILT_IN.filter(b => b.title.toLowerCase().includes(search.toLowerCase())),
        ...docs.filter(d =>
          d.title.toLowerCase().includes(search.toLowerCase()) ||
          d.content.toLowerCase().includes(search.toLowerCase())
        ),
      ]
    : []

  return (
    <div style={{ fontFamily: 'var(--font-manrope), Manrope, sans-serif', background: '#E8EEF4', minHeight: '100vh', color: '#0F1923' }}>

      {/* Nav */}
      <NavBar
        module={MOD_KNOWLEDGE}
        subtitle="Platform Docs"
        homeHref="/dashboard"
        rightSlot={isAdmin ? (
          <Link className="tbtn tbtn-teal" href="/admin">Admin Dashboard</Link>
        ) : undefined}
      />

      <div style={{ display: 'grid', gridTemplateColumns: '256px 1fr', minHeight: 'calc(100vh - 56px)' }}>

        {/* ── Sidebar ── */}
        <aside style={{ borderRight: '1px solid #C8DFE0', padding: '20px 12px', position: 'sticky', top: '64px', height: 'calc(100vh - 64px)', overflowY: 'auto' }}>

          {/* Search */}
          <div style={{ marginBottom: '16px', padding: '0 4px' }}>
            <input type="text" placeholder="Search docs..." value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ width: '100%', padding: '8px 12px', borderRadius: '9px', border: '1px solid #9EC8C8', background: '#FFFFFF', color: '#0F1923', fontSize: '13px', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }}
            />
          </div>

          {/* Search results */}
          {search.trim() ? (
            <div>
              <div style={{ fontSize: '13px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: '#0F1923', padding: '0 8px', marginBottom: '6px' }}>
                {searchResults.length} result{searchResults.length !== 1 ? 's' : ''}
              </div>
              {searchResults.length === 0 ? (
                <div style={{ fontSize: '13px', color: '#2D3E50', padding: '12px 8px' }}>No matches found.</div>
              ) : (
                searchResults.map(item => (
                  <button key={item.slug} onClick={() => selectDoc(item.slug, item.category)}
                    style={{ width: '100%', textAlign: 'left', padding: '8px 12px', borderRadius: '8px', border: 'none', background: activeSlug === item.slug ? '#FFFFFF' : 'transparent', color: activeSlug === item.slug ? '#1E2124' : '#2A3038', fontSize: '13px', fontWeight: activeSlug === item.slug ? 700 : 500, cursor: 'pointer', fontFamily: 'inherit', marginBottom: '2px', borderLeft: activeSlug === item.slug ? `2px solid ${SECTION_COLOR[item.category] ?? '#00897B'}` : '2px solid transparent' }}>
                    {item.title}
                    <div style={{ fontSize: '13px', color: '#0F1923', marginTop: '2px' }}>{item.category}</div>
                  </button>
                ))
              )}
            </div>
          ) : (
            /* Collapsible sections */
            orderedSections.map(sectionName => {
              const color   = SECTION_COLOR[sectionName] ?? '#00897B'
              const icon    = SECTION_ICON[sectionName]
              const isOpen  = openSections.has(sectionName)
              const items   = sectionName === 'Platform Reference'
                ? BUILT_IN
                : docs.filter(d => d.category === sectionName)

              return (
                <div key={sectionName} style={{ marginBottom: '4px' }}>
                  {/* Section header — clickable to collapse */}
                  <button onClick={() => toggleSection(sectionName)}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 8px', borderRadius: '8px', border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ color, flexShrink: 0 }}>{icon}</span>
                      <span style={{ fontSize: '13px', fontWeight: 800, letterSpacing: '1.2px', color, textTransform: 'uppercase' }}>{sectionName}</span>
                    </div>
                    <svg width="10" height="10" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"
                      style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s', flexShrink: 0, opacity: 0.7 }}>
                      <polyline points="6 9 12 15 18 9"/>
                    </svg>
                  </button>

                  {/* Description — shown when collapsed */}
                  {!isOpen && SECTION_DESC[sectionName] && (
                    <div style={{ fontSize: '13px', color: '#0F1923', padding: '0 8px 8px 27px', lineHeight: 1.5 }}>
                      {SECTION_DESC[sectionName]}
                    </div>
                  )}

                  {/* Items */}
                  {isOpen && (
                    <div style={{ paddingLeft: '4px', marginBottom: '8px' }}>
                      {items.map(item => {
                        const active = activeSlug === item.slug
                        return (
                          <button key={item.slug} onClick={() => selectDoc(item.slug, sectionName)}
                            style={{ width: '100%', textAlign: 'left', padding: '7px 12px', borderRadius: '8px', border: 'none', background: active ? '#FFFFFF' : 'transparent', color: active ? '#1E2124' : '#2A3038', fontSize: '13px', fontWeight: active ? 700 : 500, cursor: 'pointer', fontFamily: 'inherit', marginBottom: '1px', borderLeft: active ? `2px solid ${color}` : '2px solid transparent', lineHeight: 1.4 }}>
                            {item.title}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })
          )}

          {loading && !search && (
            <div style={{ fontSize: '13px', color: '#0F1923', textAlign: 'center', paddingTop: '12px' }}>Loading…</div>
          )}
        </aside>

        {/* ── Main content ── */}
        <main style={{ padding: '48px 64px', maxWidth: '860px' }}>
          {/* Category badge */}
          {activeCategory && (
            <div style={{ marginBottom: '16px' }}>
              <span style={{ fontSize: '13px', fontWeight: 700, color: SECTION_COLOR[activeCategory] ?? '#00897B', background: `${SECTION_COLOR[activeCategory] ?? '#00897B'}15`, padding: '3px 10px', borderRadius: '6px' }}>
                {activeCategory}
              </span>
            </div>
          )}

          {/* Title + subtitle */}
          <h1 style={{ fontSize: '36px', fontWeight: 900, color: '#0F1923', margin: '0 0 10px', letterSpacing: '-0.5px', lineHeight: 1.2 }}>
            {activeSlug === '__scoring'       ? 'How AI Readiness Is Measured'
           : activeSlug === '__questionnaire' ? 'EventPilot Discovery Questionnaire'
           : activeSlug === '__playbook'      ? 'AI Readiness Playbook'
           : activeDoc?.title ?? ''}
          </h1>

          {/* Page subtitle — context for every doc */}
          {(() => {
            const subtitles: Record<string, string> = {
              '__scoring':       'Reference only — explains how TAIRS scores are calculated. Nothing here changes your score.',
              '__questionnaire': 'A read-only preview of what your staff will see when they join. Select a department to explore the questions. No answers are collected here.',
              '__playbook':      'What each TAIRS tier means and exactly what to do next. Use alongside the live Department Action Matrix in the Admin Intelligence tab.',
            }
            const subtitle = subtitles[activeSlug] ?? (activeDoc ? `Part of ${activeDoc.category} — for reference.` : '')
            return subtitle ? (
              <p style={{ fontSize: '13px', color: '#2D3E50', lineHeight: 1.65, margin: '0 0 28px', maxWidth: '600px' }}>
                {subtitle}
              </p>
            ) : null
          })()}

          {/* Content */}
          <div style={{ borderTop: '1px solid #C8DFE0', paddingTop: '28px' }}>
            {activeSlug === '__scoring'       && <ScoringGuideContent />}
            {activeSlug === '__questionnaire' && <QuestionnaireContent />}
            {activeSlug === '__playbook'      && <PlaybookContent />}
            {!isBuiltIn && activeDoc         && formatContent(activeDoc.content)}
            {!isBuiltIn && !activeDoc && loading && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '300px' }}>
                <div style={{ width: '32px', height: '32px', border: '3px solid rgba(0,165,163,0.15)', borderTopColor: '#00897B', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
              </div>
            )}
            {!isBuiltIn && !activeDoc && !loading && (
              <div style={{ color: '#0F1923', fontSize: '13px' }}>Select a document from the sidebar.</div>
            )}
          </div>

          {/* Footer for DB docs */}
          {!isBuiltIn && activeDoc && (
            <div style={{ marginTop: '48px', paddingTop: '20px', borderTop: '1px solid #C8DFE0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '13px', color: '#0F1923' }}>
                Last updated: {new Date(activeDoc.updated_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
              </span>
              <a href={`/api/platform-docs?slug=${activeDoc.slug}`} target="_blank" rel="noreferrer"
                style={{ fontSize: '13px', color: '#00695C', textDecoration: 'none', fontWeight: 600 }}>
                Raw JSON
              </a>
            </div>
          )}
        </main>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        input::placeholder { color: #9CA3AF; }
        input:focus { border-color: rgba(0,165,163,0.4) !important; background: #FFFFFF !important; }
        aside::-webkit-scrollbar { width: 4px; }
        aside::-webkit-scrollbar-track { background: transparent; }
        aside::-webkit-scrollbar-thumb { background: rgba(0,165,163,0.15); border-radius: 4px; }
      `}</style>
    </div>
  )
}
