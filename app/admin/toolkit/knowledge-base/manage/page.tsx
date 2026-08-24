'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import PageHeader from '@/app/components/PageHeader'
import { kbDownloadHref } from '@/app/lib/kb/download-href'
import type { Gap } from '@/app/lib/kb/gaps'
import { suggestDocType, type KbDocType } from '@/app/lib/kb/classify'

const INGEST_STAGES = ['Reading your document…', 'Organising the details…', 'Almost done…']

export default function KnowledgeBaseManagePage() {
  // staffList/events are shared with other admin tabs (People/Events) in the
  // old monolithic admin/page.tsx — this route is now standalone, so it
  // fetches its own minimal copies rather than assuming they already exist.
  const [staffList, setStaffList] = useState<{ id: string; name: string; department: string | null }[]>([])
  const [events,    setEvents]    = useState<{ id: string; name: string }[]>([])
  useEffect(() => {
    fetch('/api/staff-list').then(r => r.json()).then(d => setStaffList(Array.isArray(d) ? d : [])).catch(() => {})
    fetch('/api/events').then(r => r.json()).then(d => setEvents(Array.isArray(d) ? d : [])).catch(() => {})
  }, [])

  type DocRow = {
    id: string; title: string; type: string; visibility: string
    word_count: number; event_id: string | null; created_at: string
    events?: { name: string } | null
    layer: string; department: string; min_level: string
    pilot_use: boolean; confidence: number; flagged: boolean; status: string
    source_url: string | null; version: number; document_group_id: string | null
    superseded_by: string | null; workspace_id: string | null
    doc_category?: string
  }
  const [docs,          setDocs]          = useState<DocRow[]>([])
  const [docsLoading,   setDocsLoading]   = useState(false)
  const [docForm,       setDocForm]       = useState({ title: '', type: 'policy', visibility: 'all', event_id: '', source_url: '', workspace_id: '', doc_category: '' })
  const [docCategoryFilter, setDocCategoryFilter] = useState<'all'|'event_intelligence'|'business_development'|'project_management'|'marketing'|'company_knowledge'|'external'>('all')
  const [otherTypeLabel,setOtherTypeLabel]= useState('')
  const [saveAsNewType, setSaveAsNewType] = useState(false)
  const [customDocTypes,setCustomDocTypes]= useState<{ key: string; label: string }[]>([])
  const [docFilter,       setDocFilter]       = useState<'all'|'knowledge_base'|'general'|'specific'|'flagged'>('all')
  const [supersedesDoc, setSupersedesDoc] = useState<DocRow | null>(null)
  const [versionNote,   setVersionNote]   = useState('')
  // Knowledge — Press Intelligence
  type IntelSource = {
    id: string; name: string; source_type: string; category: string
    config: { url?: string; query?: string }; crawl_frequency: string; crawl_behaviour: string
    is_active: boolean; last_run_at: string | null; last_found_count: number
  }
  type IntelItem = {
    id: string; source_id: string | null; url: string; title: string | null
    published_date: string | null; gemini_score: number | null; gemini_reasoning: string | null
    gemini_summary: string | null; event_mentioned: string | null; article_type: string | null
    status: string; document_id: string | null; run_id: string | null; discovered_at: string
    kb_intel_sources?: { name: string; category: string } | null
  }
  type IntelRun = {
    id: string; started_at: string; completed_at: string | null; status: string
    sources_checked: number; urls_discovered: number; items_auto_published: number
    items_queued: number; items_skipped: number; error_message: string | null; triggered_by: string
  }
  type IntelConfig = {
    id: string; cron_schedule_display: string; is_enabled: boolean
    auto_publish_threshold: number; review_threshold: number
    event_registry_data: { name: string; status?: string; website?: string; description?: string }[] | null
    event_registry_source: string; event_registry_last_updated: string | null
  }
  const [intelSubTab,      setIntelSubTab]      = useState<'overview' | 'review' | 'sources' | 'items'>('overview')
  const [intelSources,     setIntelSources]     = useState<IntelSource[]>([])
  const [intelItems,       setIntelItems]       = useState<IntelItem[]>([])
  const [intelItemsTotal,  setIntelItemsTotal]  = useState(0)
  const [intelPendingItems,setIntelPendingItems]= useState<IntelItem[]>([])
  const [intelRuns,        setIntelRuns]        = useState<IntelRun[]>([])
  const [intelConfig,      setIntelConfig]      = useState<IntelConfig | null>(null)
  const [intelLoading,     setIntelLoading]     = useState(false)
  const [intelRunning,     setIntelRunning]     = useState(false)
  const [intelMsg,         setIntelMsg]         = useState('')
  const [intelThresholds,  setIntelThresholds]  = useState({ auto_publish_threshold: 75, review_threshold: 40 })
  const [expandedIntelItemId, setExpandedIntelItemId] = useState<string | null>(null)
  const [expandedIntelRunId,  setExpandedIntelRunId]  = useState<string | null>(null)
  const [intelItemsFilter, setIntelItemsFilter] = useState({ status: 'all', source_id: '', search: '' })
  const [intelItemsPage,   setIntelItemsPage]   = useState(0)
  const [showIntelSourceForm, setShowIntelSourceForm] = useState<false | 'owned_property' | 'partner_govt' | 'press_media'>(false)
  const [intelSourceForm,  setIntelSourceForm]  = useState({ name: '', url: '', query: '', crawl_behaviour: 'article_discovery', crawl_frequency: 'weekly' })
  const [intelSourceMsg,   setIntelSourceMsg]   = useState('')
  const [editingIntelSourceId, setEditingIntelSourceId] = useState<string | null>(null)
  const [collapsedIntelSections, setCollapsedIntelSections] = useState<Record<string, boolean>>({})
  type VersionRow = {
    id: string; title: string; version: number; version_note: string | null
    source_url: string | null; status: string; superseded_by: string | null
    created_at: string; staff_members: { name: string } | { name: string }[] | null
  }
  const [versionModalGroupId,   setVersionModalGroupId]   = useState<string | null>(null)
  const [versionHistory,        setVersionHistory]        = useState<VersionRow[]>([])
  const [versionHistoryLoading, setVersionHistoryLoading] = useState(false)
  type WorkspaceRow = {
    id: string; name: string; slug: string | null; client_name: string | null
    client_country: string | null; event_name: string | null; event_type: string | null
    status: string; created_at: string
    bd_workspace_members?: { count: number }[]; documents?: { count: number }[]
  }
  const [workspaces,        setWorkspaces]        = useState<WorkspaceRow[]>([])
  const [workspacesLoading, setWorkspacesLoading] = useState(false)
  const [workspaceForm,     setWorkspaceForm]     = useState({ name: '', client_name: '', client_country: '', event_name: '', event_type: 'managed' })
  const [workspaceSaving,   setWorkspaceSaving]   = useState(false)
  const [workspaceMsg,      setWorkspaceMsg]      = useState('')
  const [showWorkspaceForm, setShowWorkspaceForm] = useState(false)
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(null)

  type WorkspaceMember = { id: string; role: string | null; added_at: string; staff_members: { id: string; name: string; email: string; department: string | null } }
  const [workspaceMembers,  setWorkspaceMembers]  = useState<WorkspaceMember[]>([])
  const [addMemberStaffId,  setAddMemberStaffId]  = useState('')
  // Knowledge — smart ingest (classify → process → publish)
  type PendingDoc = {
    id: string; title: string; type: string; layer: string; department: string; min_level: string
    pilot_use: boolean; status: string; source_url: string | null; word_count: number
    extracted_text: string; created_at: string
  }
  type GeneralDocAnalysis = { layer: string; department: string; min_level: string; pilot_use: boolean; ai_reasoning: string; confidence: number; flagged: boolean; suggested_type: string }
  type IngestResult = { success: boolean; detected_type: string; document: PendingDoc; summary?: string; gaps?: Gap[]; gap_session_id?: string | null; analysis?: GeneralDocAnalysis }
  const [showIngestForm, setShowIngestForm] = useState(false)
  const [ingestFile,     setIngestFile]     = useState<File | null>(null)
  // Top-level choice the uploader makes explicitly: summarise into a structured
  // KB entry (reviewed before publish) vs. keep the original wording as-is
  // (still reviewed before publish, just no restructuring/gap detection).
  const [ingestIntent,   setIngestIntent]   = useState<'summarise' | 'verbatim' | null>(null)
  // Only meaningful when intent is 'summarise' — which of the 4 structured
  // types to use, overriding the filename-based suggestion.
  const [ingestTypeChoice, setIngestTypeChoice] = useState<KbDocType | null>(null)
  const [ingesting,      setIngesting]      = useState(false)
  const [ingestStage,    setIngestStage]    = useState(0)
  const [ingestMsg,      setIngestMsg]      = useState('')
  const [ingestResult,   setIngestResult]   = useState<IngestResult | null>(null)
  const [pendingDocs,    setPendingDocs]    = useState<PendingDoc[]>([])
  const [pendingLoading, setPendingLoading] = useState(false)
  const [reviewingId,    setReviewingId]    = useState<string | null>(null)
  const [expandedPendingId, setExpandedPendingId] = useState<string | null>(null)
  const [docActionMsg,   setDocActionMsg]   = useState('')
  const [deletingDoc,    setDeletingDoc]    = useState<DocRow | null>(null)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [deleting,       setDeleting]       = useState(false)
  // Knowledge — self-learning gap detection (KB Self-Learning PRD v3.0)
  type GapStatus = 'unresolved' | 'added' | 'skipped' | 'pending'
  type GapItem = Gap & { status: GapStatus; field_name?: string; field_category?: string; is_required?: boolean }
  type GapSession = {
    id: string; document_id: string; processor_type: string; gaps: GapItem[]; resolved: boolean
    documents?: { title: string; type: string } | null
  }
  type GapResolution = {
    gap_id: string; action: 'add_to_processor' | 'skip' | 'pending'
    field_name?: string; field_description?: string; field_category?: string; is_required?: boolean; example_value?: string
  }
  type GapWizardState = {
    mode: 'ingest' | 'review'
    documentId: string
    sessionId: string
    gapIds: string[]
    cursor: number
    step: 1 | 2 | 3
    selectedOption: string
    otherText: string
    importance: 'always' | 'optional' | 'no' | ''
    fieldChoice: 'suggested' | 'custom'
    customFieldName: string
    resolutions: GapResolution[]
    submitting: boolean
    msg: string
  }
  const [gapSessions,        setGapSessions]        = useState<Record<string, GapSession>>({})
  const [gapWizard,          setGapWizard]          = useState<GapWizardState | null>(null)
  const [pendingGapSessions, setPendingGapSessions] = useState<GapSession[]>([])
  const [pendingGapsLoading, setPendingGapsLoading] = useState(false)

  // Knowledge — sub-tab, version control, BD Workspaces
  type DocSubTab = 'documents' | 'workspaces' | 'intelligence' | 'gaps'
  const [docSubTab, setDocSubTab] = useState<DocSubTab>(() => {
    if (typeof window === 'undefined') return 'documents'
    const s = new URLSearchParams(window.location.search).get('sub') as DocSubTab | null
    return s ?? 'documents'
  })
  // Keeps the ?sub= param in sync with the active sub-tab (replaceState, not
  // pushState) so a reload or shared link lands back on the right sub-tab.
  // Local, simplified version of admin/page.tsx's syncAdminUrl — that one
  // also tracks the outer admin ?tab=, which no longer applies here since
  // this is its own route.
  function syncManageUrl(sub: string) {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    params.set('sub', sub)
    window.history.replaceState(null, '', `${window.location.pathname}?${params.toString()}`)
  }
  async function fetchWorkspaces() {
    setWorkspacesLoading(true)
    const res  = await fetch('/api/bd-workspaces')
    const data = await res.json()
    setWorkspaces(Array.isArray(data) ? data : [])
    setWorkspacesLoading(false)
  }

  async function createWorkspace() {
    if (!workspaceForm.name.trim()) { setWorkspaceMsg('Workspace name is required.'); return }
    setWorkspaceSaving(true); setWorkspaceMsg('')
    const adminStaffId = sessionStorage.getItem('tai_admin_staff_id')
    const res = await fetch('/api/bd-workspaces', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...workspaceForm, created_by: adminStaffId || undefined }),
    })
    if (res.ok) {
      setWorkspaceMsg('Workspace created.')
      setWorkspaceForm({ name: '', client_name: '', client_country: '', event_name: '', event_type: 'managed' })
      setShowWorkspaceForm(false)
      fetchWorkspaces()
    } else {
      setWorkspaceMsg('Failed to create workspace.')
    }
    setWorkspaceSaving(false)
  }

  async function fetchWorkspaceMembers(workspaceId: string) {
    const res  = await fetch(`/api/bd-workspaces/members?workspace_id=${workspaceId}`)
    const data = await res.json()
    setWorkspaceMembers(Array.isArray(data) ? data : [])
  }

  async function openWorkspace(workspaceId: string) {
    setSelectedWorkspaceId(workspaceId)
    fetchWorkspaceMembers(workspaceId)
    // staffList is fetched once on mount above (this page has no other tab
    // to have populated it already, unlike the old shared admin/page.tsx).
  }

  async function addWorkspaceMember() {
    if (!selectedWorkspaceId || !addMemberStaffId) return
    await fetch('/api/bd-workspaces/members', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspace_id: selectedWorkspaceId, staff_id: addMemberStaffId }),
    })
    setAddMemberStaffId('')
    fetchWorkspaceMembers(selectedWorkspaceId)
  }

  async function removeWorkspaceMember(staffId: string) {
    if (!selectedWorkspaceId) return
    await fetch(`/api/bd-workspaces/members?workspace_id=${selectedWorkspaceId}&staff_id=${staffId}`, { method: 'DELETE' })
    fetchWorkspaceMembers(selectedWorkspaceId)
  }

  async function openVersionHistory(groupId: string) {
    setVersionModalGroupId(groupId)
    setVersionHistoryLoading(true)
    const res  = await fetch(`/api/documents/versions?group_id=${groupId}`)
    const data = await res.json()
    setVersionHistory(Array.isArray(data) ? data : [])
    setVersionHistoryLoading(false)
  }

  async function fetchPendingDocs() {
    setPendingLoading(true)
    const res  = await fetch('/api/documents/list?pipeline=1')
    const data = await res.json()
    setPendingDocs(Array.isArray(data) ? data.filter((d: PendingDoc) => d.status === 'pending') : [])
    setPendingLoading(false)
  }

  // What the filename alone would suggest, before the uploader's explicit choice.
  function ingestSuggestedIntent(): 'summarise' | 'verbatim' {
    if (!ingestFile) return 'verbatim'
    return suggestDocType(ingestFile.name) === 'general' ? 'verbatim' : 'summarise'
  }

  function ingestEffectiveIntent(): 'summarise' | 'verbatim' {
    return ingestIntent ?? ingestSuggestedIntent()
  }

  function ingestEffectiveType(): KbDocType | 'general' {
    if (ingestEffectiveIntent() === 'verbatim') return 'general'
    if (ingestTypeChoice) return ingestTypeChoice
    const suggested = ingestFile ? suggestDocType(ingestFile.name) : 'general'
    // Chose "summarise" but the filename gave no structured signal — fall
    // back to Proposal rather than silently reverting to General.
    return suggested === 'general' ? 'proposal' : suggested
  }

  function resetGeneralDocForm() {
    setDocForm({ title: '', type: 'policy', visibility: 'all', event_id: '', source_url: '', workspace_id: '', doc_category: '' })
    setOtherTypeLabel('')
    setSaveAsNewType(false)
    setSupersedesDoc(null)
    setVersionNote('')
    setIngestTypeChoice(null)
    setIngestIntent(null)
  }

  async function ingestDocument() {
    if (!ingestFile) return
    const isGeneral = ingestEffectiveType() === 'general'

    if (isGeneral) {
      if (!docForm.title.trim()) { setIngestMsg('Title is required.'); return }
      if (docForm.type === 'other' && !otherTypeLabel.trim()) { setIngestMsg('Please specify what type this document is.'); return }
      if (!docForm.doc_category) { setIngestMsg('Please select a category.'); return }
    }

    setIngesting(true)
    setIngestMsg('')
    setIngestResult(null)

    const adminStaffId = sessionStorage.getItem('tai_admin_staff_id')
    const form = new FormData()
    form.append('file', ingestFile)
    if (adminStaffId) form.append('uploaded_by', adminStaffId)
    form.append('doc_type_override', ingestEffectiveType())

    if (isGeneral) {
      const finalType = docForm.type === 'other'
        ? otherTypeLabel.trim().toLowerCase().replace(/\s+/g, '_')
        : docForm.type
      form.append('title', docForm.title)
      form.append('type', finalType)
      form.append('visibility', docForm.visibility)
      if (docForm.event_id) form.append('event_id', docForm.event_id)
      if (docForm.source_url.trim()) form.append('source_url', docForm.source_url.trim())
      form.append('doc_category', docForm.doc_category)
      if (docForm.workspace_id) form.append('workspace_id', docForm.workspace_id)
      if (supersedesDoc) form.append('supersedes_id', supersedesDoc.id)
      if (versionNote) form.append('version_note', versionNote)
    }

    try {
      const res  = await fetch('/api/kb/ingest', { method: 'POST', body: form })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.job_id) {
        setIngestMsg(data.error ?? 'Ingestion failed. Please try again.')
        setIngesting(false)
        return
      }
      pollIngestJob(data.job_id, 0)
    } catch {
      setIngestMsg('Could not reach the server. Check your connection and try again.')
      setIngesting(false)
    }
  }

  // Ingest now runs as a background job (2026-08-24 — see /api/kb/ingest's
  // own doc comment: the extract → Gemini summary → gap-detection chain can
  // run past the ~100s the Cloudflare proxy in front of production allows
  // for a single request/response — worked every time in local dev, where
  // that proxy isn't in the path, but not live). This polls
  // .../kb/ingest/job/[jobId] every few seconds until the job leaves
  // 'processing', then applies the exact same result-handling this used to
  // run synchronously.
  const INGEST_POLL_INTERVAL_MS = 3000
  const INGEST_POLL_MAX_ATTEMPTS = 200 // ~10 min ceiling — a backstop against a truly stuck job
  async function pollIngestJob(jobId: string, attempt: number) {
    try {
      const res  = await fetch(`/api/kb/ingest/job/${jobId}`)
      const data = await res.json().catch(() => ({}))
      if (!res.ok || data.status === 'error') {
        setIngestMsg(data.error ?? 'Ingestion failed. Please try again.')
        setIngesting(false)
        return
      }
      if (data.status === 'processing') {
        if (attempt >= INGEST_POLL_MAX_ATTEMPTS) {
          setIngestMsg('This is taking much longer than usual — please try again.')
          setIngesting(false)
          return
        }
        setTimeout(() => pollIngestJob(jobId, attempt + 1), INGEST_POLL_INTERVAL_MS)
        return
      }

      const result = data.result ?? {}
      setIngestMsg('')
      setIngestResult(result)
      setIngestFile(null)
      if (result.gap_session_id && Array.isArray(result.gaps) && result.gaps.length > 0) {
        setGapSessions(prev => ({
          ...prev,
          [result.document.id]: {
            id: result.gap_session_id,
            document_id: result.document.id,
            processor_type: result.detected_type,
            gaps: result.gaps.map((g: Gap) => ({ ...g, status: 'unresolved' })),
            resolved: false,
          },
        }))
      }
      if (result.detected_type === 'general') {
        const wasSavingNewType = saveAsNewType
        resetGeneralDocForm()
        if (wasSavingNewType) fetchCustomDocTypes()
      } else {
        setIngestTypeChoice(null)
        setIngestIntent(null)
      }
      setShowIngestForm(false)
      fetchPendingDocs()
      setIngesting(false)
    } catch {
      // A transient network blip on one poll tick shouldn't fail the whole
      // run — retry like any other tick, same attempt cap as above.
      if (attempt >= INGEST_POLL_MAX_ATTEMPTS) {
        setIngestMsg('Could not reach the server. Check your connection and try again.')
        setIngesting(false)
        return
      }
      setTimeout(() => pollIngestJob(jobId, attempt + 1), INGEST_POLL_INTERVAL_MS)
    }
  }

  async function publishPendingDoc(documentId: string) {
    const adminStaffId = sessionStorage.getItem('tai_admin_staff_id')
    const title = ingestResult?.document.id === documentId ? ingestResult.document.title : pendingDocs.find(d => d.id === documentId)?.title
    setReviewingId(documentId)
    const res = await fetch('/api/documents/review', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ document_id: documentId, reviewer_id: adminStaffId, action: 'approve' }),
    })
    if (ingestResult?.document.id === documentId) setIngestResult(null)
    setReviewingId(null)
    if (res.ok) {
      setDocActionMsg(`✓ Published${title ? ` "${title}"` : ''} to the Knowledge Base — it's now live.`)
      window.setTimeout(() => setDocActionMsg(''), 6000)
    }
    fetchPendingDocs()
    fetchDocs()
  }

  async function rejectPendingDoc(documentId: string) {
    const adminStaffId = sessionStorage.getItem('tai_admin_staff_id')
    const title = ingestResult?.document.id === documentId ? ingestResult.document.title : pendingDocs.find(d => d.id === documentId)?.title
    setReviewingId(documentId)
    const res = await fetch('/api/documents/review', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ document_id: documentId, reviewer_id: adminStaffId, action: 'reject', note: 'Rejected from Knowledge Base ingestion review.' }),
    })
    if (ingestResult?.document.id === documentId) setIngestResult(null)
    setReviewingId(null)
    if (res.ok) {
      setDocActionMsg(`Rejected${title ? ` "${title}"` : ''} — it will not be published.`)
      window.setTimeout(() => setDocActionMsg(''), 6000)
    }
    fetchPendingDocs()
  }

  // ── Self-learning gap detection ─────────────────────────────────────────────
  async function fetchGapSession(documentId: string) {
    const res  = await fetch(`/api/kb/gaps?document_id=${documentId}`)
    const data = await res.json().catch(() => ({}))
    if (data?.session) setGapSessions(prev => ({ ...prev, [documentId]: data.session }))
  }

  async function fetchPendingGapSessions() {
    setPendingGapsLoading(true)
    const res  = await fetch('/api/kb/gaps?pending=1')
    const data = await res.json().catch(() => ({}))
    setPendingGapSessions(Array.isArray(data?.sessions) ? data.sessions : [])
    setPendingGapsLoading(false)
  }

  function startGapWizard(mode: 'ingest' | 'review', documentId: string, sessionId: string, gapIds: string[]) {
    setGapWizard({
      mode, documentId, sessionId, gapIds, cursor: 0, step: 1,
      selectedOption: '', otherText: '', importance: '', fieldChoice: 'suggested', customFieldName: '',
      resolutions: [], submitting: false, msg: '',
    })
  }

  async function submitGapResolutions(sessionId: string, documentId: string, resolutions: GapResolution[], mode: 'ingest' | 'review') {
    setGapWizard(prev => prev ? { ...prev, submitting: true, msg: '' } : prev)
    const adminStaffId = sessionStorage.getItem('tai_admin_staff_id')
    try {
      const res = await fetch('/api/kb/gaps/resolve', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, admin_staff_id: adminStaffId, resolutions }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setGapWizard(prev => prev ? { ...prev, submitting: false, msg: data.error ?? 'Could not save your answers. Please try again.' } : prev)
        return
      }
    } catch {
      setGapWizard(prev => prev ? { ...prev, submitting: false, msg: 'Could not reach the server. Please try again.' } : prev)
      return
    }
    setGapSessions(prev => { const next = { ...prev }; delete next[documentId]; return next })
    setGapWizard(null)
    if (mode === 'ingest') {
      await publishPendingDoc(documentId)
    } else {
      fetchPendingGapSessions()
    }
  }

  function gapWizardResetStep(w: GapWizardState): GapWizardState {
    return { ...w, step: 1, selectedOption: '', otherText: '', importance: '', fieldChoice: 'suggested', customFieldName: '' }
  }

  function finishCurrentGap(resolution: GapResolution) {
    if (!gapWizard) return
    const resolutions = [...gapWizard.resolutions, resolution]
    const cursor = gapWizard.cursor + 1
    setGapWizard(gapWizardResetStep({ ...gapWizard, resolutions, cursor }))
    if (gapWizard.mode === 'review' && cursor >= gapWizard.gapIds.length) {
      submitGapResolutions(gapWizard.sessionId, gapWizard.documentId, resolutions, 'review')
    }
  }

  function gapWizardChooseImportance(gap: GapItem, choice: 'always' | 'optional' | 'no') {
    if (!gapWizard) return
    if (choice === 'no') {
      finishCurrentGap({ gap_id: gap.id, action: 'skip' })
    } else {
      setGapWizard({ ...gapWizard, importance: choice, step: 3 })
    }
  }

  function gapWizardConfirmField(gap: GapItem) {
    if (!gapWizard) return
    const fieldName = gapWizard.fieldChoice === 'custom' && gapWizard.customFieldName.trim()
      ? gapWizard.customFieldName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
      : gap.suggested_field_name
    const description = gapWizard.selectedOption === '__other__'
      ? (gapWizard.otherText.trim() || gap.description)
      : (gapWizard.selectedOption || gap.description)
    finishCurrentGap({
      gap_id: gap.id,
      action: 'add_to_processor',
      field_name: fieldName,
      field_description: description,
      field_category: gap.suggested_category,
      is_required: gapWizard.importance === 'always',
      example_value: gap.example_value,
    })
  }

  function gapWizardSkipGap(gap: GapItem) {
    finishCurrentGap({ gap_id: gap.id, action: 'pending' })
  }

  function gapWizardBack() {
    if (!gapWizard) return
    setGapWizard({ ...gapWizard, step: (Math.max(1, gapWizard.step - 1) as 1 | 2 | 3) })
  }

  function dismissPendingGap(session: GapSession, gap: GapItem) {
    submitGapResolutions(session.id, session.document_id, [{ gap_id: gap.id, action: 'skip' }], 'review')
  }

  // ── Press Intelligence ──────────────────────────────────────────────────────
  async function fetchIntelSources() {
    const res  = await fetch('/api/kb/intel/sources')
    const data = await res.json()
    setIntelSources(Array.isArray(data) ? data : [])
  }

  async function fetchIntelPending() {
    const res  = await fetch('/api/kb/intel/items?status=pending&limit=100')
    const data = await res.json()
    setIntelPendingItems(data.items ?? [])
  }

  async function fetchIntelItems(pageOverride?: number) {
    const page = pageOverride ?? intelItemsPage
    const params = new URLSearchParams()
    if (intelItemsFilter.status !== 'all') params.set('status', intelItemsFilter.status)
    if (intelItemsFilter.source_id) params.set('source_id', intelItemsFilter.source_id)
    if (intelItemsFilter.search) params.set('search', intelItemsFilter.search)
    params.set('limit', '20')
    params.set('offset', String(page * 20))
    const res  = await fetch(`/api/kb/intel/items?${params}`)
    const data = await res.json()
    setIntelItems(data.items ?? [])
    setIntelItemsTotal(data.total ?? 0)
    setIntelItemsPage(page)
  }

  async function fetchIntelRuns() {
    const res  = await fetch('/api/kb/intel/runs')
    const data = await res.json()
    setIntelRuns(Array.isArray(data) ? data : [])
  }

  async function fetchIntelConfig() {
    const res  = await fetch('/api/kb/intel/config')
    const data = await res.json()
    if (!data?.error) {
      setIntelConfig(data)
      setIntelThresholds({ auto_publish_threshold: data.auto_publish_threshold ?? 75, review_threshold: data.review_threshold ?? 40 })
    }
  }

  async function fetchIntelAll() {
    setIntelLoading(true)
    await Promise.all([fetchIntelSources(), fetchIntelPending(), fetchIntelRuns(), fetchIntelConfig()])
    setIntelLoading(false)
  }

  async function runIntelNow() {
    setIntelRunning(true); setIntelMsg('')
    const adminStaffId = sessionStorage.getItem('tai_admin_staff_id')
    try {
      const res  = await fetch('/api/kb/intel/run', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ admin_staff_id: adminStaffId }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setIntelMsg(data.error ?? 'Run failed.'); setIntelRunning(false); return }
      // The pipeline runs in the background (a full run can take several minutes) —
      // poll run history until this run leaves 'running' instead of waiting on the request.
      setIntelMsg('Run started — this can take a few minutes for all sources. Refreshing status…')
      const runId = data.run_id
      let attempts = 0
      const poll = async () => {
        attempts++
        await fetchIntelRuns()
        await fetchIntelPending()
        const latest = (await (await fetch('/api/kb/intel/runs')).json())?.find((r: { id: string }) => r.id === runId)
        if (latest && latest.status !== 'running') {
          setIntelMsg(`Done. ${latest.items_auto_published} auto-published, ${latest.items_queued} queued for review, ${latest.items_skipped} skipped.`)
          setIntelRunning(false)
        } else if (attempts >= 40) {
          setIntelMsg('Still running — check Run History below for progress.')
          setIntelRunning(false)
        } else {
          setTimeout(poll, 8000)
        }
      }
      setTimeout(poll, 8000)
    } catch {
      setIntelMsg('Could not reach the server.')
      setIntelRunning(false)
    }
  }

  async function approveIntelItem(id: string) {
    const adminStaffId = sessionStorage.getItem('tai_admin_staff_id')
    const res = await fetch(`/api/kb/intel/items/${id}/approve`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ admin_staff_id: adminStaffId }),
    })
    if (res.ok) { setIntelPendingItems(p => p.filter(i => i.id !== id)); fetchIntelItems() }
  }

  async function rejectIntelItem(id: string) {
    const adminStaffId = sessionStorage.getItem('tai_admin_staff_id')
    const res = await fetch(`/api/kb/intel/items/${id}/reject`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ admin_staff_id: adminStaffId }),
    })
    if (res.ok) { setIntelPendingItems(p => p.filter(i => i.id !== id)); fetchIntelItems() }
  }

  async function saveIntelThresholds() {
    const adminStaffId = sessionStorage.getItem('tai_admin_staff_id')
    await fetch('/api/kb/intel/config', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ admin_staff_id: adminStaffId, ...intelThresholds }),
    })
    fetchIntelConfig()
  }

  async function toggleIntelEnabled() {
    const adminStaffId = sessionStorage.getItem('tai_admin_staff_id')
    await fetch('/api/kb/intel/config', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ admin_staff_id: adminStaffId, is_enabled: !intelConfig?.is_enabled }),
    })
    fetchIntelConfig()
  }

  async function saveIntelSource() {
    const adminStaffId = sessionStorage.getItem('tai_admin_staff_id')
    const category   = showIntelSourceForm
    const sourceType = category === 'press_media' ? 'search_query' : 'direct_url'
    if (!category) return
    if (!intelSourceForm.name.trim() || (sourceType === 'search_query' ? !intelSourceForm.query.trim() : !intelSourceForm.url.trim())) {
      setIntelSourceMsg(`Name and ${sourceType === 'search_query' ? 'search query' : 'URL'} are required.`); return
    }
    const config = sourceType === 'search_query' ? { query: intelSourceForm.query.trim() } : { url: intelSourceForm.url.trim() }
    const res = editingIntelSourceId
      ? await fetch(`/api/kb/intel/sources/${editingIntelSourceId}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            admin_staff_id: adminStaffId, name: intelSourceForm.name.trim(), config,
            crawl_frequency: intelSourceForm.crawl_frequency, crawl_behaviour: intelSourceForm.crawl_behaviour,
          }),
        })
      : await fetch('/api/kb/intel/sources', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            admin_staff_id: adminStaffId, name: intelSourceForm.name.trim(), source_type: sourceType, category, config,
            crawl_frequency: intelSourceForm.crawl_frequency, crawl_behaviour: intelSourceForm.crawl_behaviour,
          }),
        })
    if (res.ok) {
      setShowIntelSourceForm(false)
      setEditingIntelSourceId(null)
      setIntelSourceForm({ name: '', url: '', query: '', crawl_behaviour: 'article_discovery', crawl_frequency: 'weekly' })
      setIntelSourceMsg('')
      fetchIntelSources()
    } else {
      const data = await res.json().catch(() => ({}))
      setIntelSourceMsg(data.error ?? 'Could not save source.')
    }
  }

  function startEditIntelSource(source: IntelSource) {
    setEditingIntelSourceId(source.id)
    setIntelSourceForm({
      name: source.name, url: source.config.url ?? '', query: source.config.query ?? '',
      crawl_behaviour: source.crawl_behaviour, crawl_frequency: source.crawl_frequency,
    })
    setIntelSourceMsg('')
    setShowIntelSourceForm(source.category as 'owned_property' | 'partner_govt' | 'press_media')
  }

  async function toggleIntelSourceActive(source: IntelSource) {
    const adminStaffId = sessionStorage.getItem('tai_admin_staff_id')
    await fetch(`/api/kb/intel/sources/${source.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ admin_staff_id: adminStaffId, is_active: !source.is_active }),
    })
    fetchIntelSources()
  }

  async function deleteIntelSource(id: string) {
    const adminStaffId = sessionStorage.getItem('tai_admin_staff_id')
    await fetch(`/api/kb/intel/sources/${id}?admin_staff_id=${adminStaffId}`, { method: 'DELETE' })
    fetchIntelSources()
  }

  async function fetchDocs() {
    setDocsLoading(true)
    const res  = await fetch('/api/documents/list?admin=1')
    const data = await res.json()
    setDocs(Array.isArray(data) ? data : [])
    setDocsLoading(false)
  }

  async function fetchCustomDocTypes() {
    const res  = await fetch('/api/document-types')
    const data = await res.json()
    setCustomDocTypes(Array.isArray(data) ? data : [])
  }

  async function confirmDeleteDoc() {
    if (!deletingDoc || deleteConfirmText !== 'DELETE') return
    setDeleting(true)
    const res = await fetch(`/api/documents/list?id=${deletingDoc.id}`, { method: 'DELETE' })
    setDeleting(false)
    if (res.ok) {
      setDocActionMsg(`✓ Removed "${deletingDoc.title}" from the Knowledge Base.`)
      window.setTimeout(() => setDocActionMsg(''), 6000)
      setDeletingDoc(null)
      setDeleteConfirmText('')
      fetchDocs()
    } else {
      setDocActionMsg('Could not remove the document. Please try again.')
    }
  }
  useEffect(() => {
    if (!ingesting) { setIngestStage(0); return }
    const id = setInterval(() => setIngestStage(s => (s + 1) % INGEST_STAGES.length), 2200)
    return () => clearInterval(id)
  }, [ingesting])
          const TYPE_COLOR: Record<string,string> = { policy:'#F1667A', event_brief:'#12C9BD', staff_doc:'#C0F43C', onboarding:'#A78BFA', event_report:'#5AA9F2', other:'#F2F6F8' }
          const LAYER_CFG: Record<string,{label:string;color:string;bg:string}> = {
            knowledge_base: { label:'Knowledge Base', color:'var(--teal-mid)', bg:'var(--teal-light)' },
            general:        { label:'General',        color:'var(--info)',    bg:'var(--info-light)' },
            specific:       { label:'Specific',       color:'var(--amber)',   bg:'var(--amber-light)' },
          }
          const typeLabel = (t: string) => t.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
          const matchesCategoryFilter = (d: DocRow) => {
            if (docCategoryFilter === 'all')      return true
            if (docCategoryFilter === 'external')  return (d.doc_category ?? '').startsWith('external_')
            return d.doc_category === docCategoryFilter
          }
          const filteredDocs = docs.filter(d => {
            if (!matchesCategoryFilter(d)) return false
            if (docFilter === 'flagged')        return d.flagged
            if (docFilter === 'knowledge_base') return d.layer === 'knowledge_base'
            if (docFilter === 'general')        return d.layer === 'general'
            if (docFilter === 'specific')       return d.layer === 'specific'
            return true
          })
          const flaggedCount = docs.filter(d => d.flagged).length
          const categoryCount = (key: typeof docCategoryFilter) =>
            key === 'all' ? docs.length : key === 'external' ? docs.filter(d => (d.doc_category ?? '').startsWith('external_')).length : docs.filter(d => d.doc_category === key).length

          // General-document fields — shown inline in the Ingest form when the
          // resolved type is 'general' (not one of the 4 structured KB types).
          // Relocated from the retired standalone "Upload Document" form; same
          // fields, same state (docForm/otherTypeLabel/saveAsNewType/
          // supersedesDoc/versionNote), just no longer a separate card with
          // its own file picker/submit button — those are unified into the
          // single Ingest form now.
          const generalDocFields = (
            <div style={{ marginBottom: '14px', paddingTop: '4px', borderTop: '1px solid var(--surface)' }}>
              <div style={{ marginBottom: '12px' }}>
                <label style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink3)', letterSpacing: '0.8px', textTransform: 'uppercase', display: 'block', marginBottom: '5px' }}>Document Title</label>
                <input value={docForm.title} onChange={e => setDocForm(p => ({ ...p, title: e.target.value }))} placeholder="e.g. HR Policy Handbook 2026"
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '9px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--ink)', fontSize: '13px', fontFamily: 'inherit', boxSizing: 'border-box' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
                <div>
                  <label style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink3)', letterSpacing: '0.8px', textTransform: 'uppercase', display: 'block', marginBottom: '5px' }}>Type</label>
                  <select value={docForm.type} onChange={e => { setDocForm(p => ({ ...p, type: e.target.value })); setOtherTypeLabel(''); setSaveAsNewType(false) }}
                    style={{ width: '100%', padding: '9px 10px', borderRadius: '9px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--ink)', fontSize: '13px', fontFamily: 'inherit' }}>
                    <option value="policy">Policy</option>
                    <option value="event_brief">Event Brief</option>
                    <option value="staff_doc">Staff Document</option>
                    <option value="onboarding">Onboarding</option>
                    {customDocTypes.map(ct => <option key={ct.key} value={ct.key}>{ct.label}</option>)}
                    <option value="other">Other…</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink3)', letterSpacing: '0.8px', textTransform: 'uppercase', display: 'block', marginBottom: '5px' }}>Visible To</label>
                  <select value={docForm.visibility} onChange={e => setDocForm(p => ({ ...p, visibility: e.target.value }))}
                    style={{ width: '100%', padding: '9px 10px', borderRadius: '9px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--ink)', fontSize: '13px', fontFamily: 'inherit' }}>
                    <option value="all">All Staff</option>
                    <option value="event_only">Event Staff Only</option>
                  </select>
                </div>
              </div>
              <div style={{ marginBottom: '12px' }}>
                <label style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink3)', letterSpacing: '0.8px', textTransform: 'uppercase', display: 'block', marginBottom: '5px' }}>Category</label>
                <select value={docForm.doc_category} onChange={e => setDocForm(p => ({ ...p, doc_category: e.target.value }))}
                  style={{ width: '100%', padding: '9px 10px', borderRadius: '9px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--ink)', fontSize: '13px', fontFamily: 'inherit' }}>
                  <option value="">Select category…</option>
                  <option value="event_intelligence">Event Intelligence</option>
                  <option value="business_development">Business Development</option>
                  <option value="project_management">Project Management</option>
                  <option value="marketing">Marketing</option>
                  <option value="company_knowledge">Company Knowledge</option>
                </select>
              </div>
              {docForm.type === 'other' && (
                <div style={{ marginBottom: '12px', padding: '12px', background: 'rgba(192,244,60,0.04)', border: '1px solid rgba(192,244,60,0.12)', borderRadius: '9px' }}>
                  <label style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink)', letterSpacing: '0.8px', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>What type is this?</label>
                  <input value={otherTypeLabel} onChange={e => setOtherTypeLabel(e.target.value)} placeholder="e.g. SOP, Vendor Contract"
                    style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--ink)', fontSize: '13px', fontFamily: 'inherit', boxSizing: 'border-box' }} />
                  {otherTypeLabel.trim().length > 1 && (
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px', cursor: 'pointer' }}>
                      <input type="checkbox" checked={saveAsNewType} onChange={e => setSaveAsNewType(e.target.checked)} style={{ accentColor: 'var(--lime)', width: '13px', height: '13px' }} />
                      <span style={{ fontSize: '13px', color: 'var(--ink3)', fontWeight: 600 }}>Save &ldquo;{otherTypeLabel.trim()}&rdquo; as a permanent type</span>
                    </label>
                  )}
                </div>
              )}
              {docForm.visibility === 'event_only' && (
                <div style={{ marginBottom: '12px' }}>
                  <label style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink3)', letterSpacing: '0.8px', textTransform: 'uppercase', display: 'block', marginBottom: '5px' }}>Link to Event</label>
                  <select value={docForm.event_id} onChange={e => setDocForm(p => ({ ...p, event_id: e.target.value }))}
                    style={{ width: '100%', padding: '9px 10px', borderRadius: '9px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--ink)', fontSize: '13px', fontFamily: 'inherit' }}>
                    <option value="">Select event…</option>
                    {events.map(ev => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
                  </select>
                </div>
              )}
              <div style={{ marginBottom: '12px' }}>
                <label style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink3)', letterSpacing: '0.8px', textTransform: 'uppercase', display: 'block', marginBottom: '5px' }}>External Link <span style={{ textTransform: 'none', fontWeight: 500 }}>(optional — leave blank to store the original automatically)</span></label>
                <input value={docForm.source_url} onChange={e => setDocForm(p => ({ ...p, source_url: e.target.value }))} placeholder="Only needed if the original lives elsewhere — SharePoint, Drive…"
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '9px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--ink)', fontSize: '13px', fontFamily: 'inherit', boxSizing: 'border-box' }} />
              </div>
              {(docForm.type === 'proposal' || docForm.type === 'tender') && (
                <div style={{ marginBottom: '12px' }}>
                  <label style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink3)', letterSpacing: '0.8px', textTransform: 'uppercase', display: 'block', marginBottom: '5px' }}>BD Workspace <span style={{ textTransform: 'none', fontWeight: 500 }}>(optional)</span></label>
                  <select value={docForm.workspace_id} onChange={e => setDocForm(p => ({ ...p, workspace_id: e.target.value }))}
                    style={{ width: '100%', padding: '9px 10px', borderRadius: '9px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--ink)', fontSize: '13px', fontFamily: 'inherit' }}>
                    <option value="">Not linked to a workspace</option>
                    {workspaces.map(ws => <option key={ws.id} value={ws.id}>{ws.name}</option>)}
                  </select>
                </div>
              )}
              {supersedesDoc && (
                <div style={{ marginBottom: '12px', padding: '12px', background: 'rgba(96,165,250,0.06)', border: '1px solid rgba(96,165,250,0.25)', borderRadius: '9px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--info)' }}>Uploading a new version of &ldquo;{supersedesDoc.title}&rdquo; (v{supersedesDoc.version} → v{supersedesDoc.version + 1})</span>
                    <button onClick={() => { setSupersedesDoc(null); setVersionNote('') }}
                      style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink3)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
                  </div>
                  <input value={versionNote} onChange={e => setVersionNote(e.target.value)} placeholder="What changed in this version? (optional)"
                    style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--ink)', fontSize: '13px', fontFamily: 'inherit', boxSizing: 'border-box' }} />
                </div>
              )}
            </div>
          )

          function renderGapWizard(session: GapSession) {
            if (!gapWizard || gapWizard.sessionId !== session.id) return null
            const total = gapWizard.gapIds.length
            const isXlsx = session.processor_type === 'attendee_data'
            const typeName = typeLabel(session.processor_type)

            if (gapWizard.cursor >= total) {
              if (gapWizard.mode === 'review') {
                // Review mode auto-submits as soon as the (single) gap is actioned — this state is
                // only visible for the instant between that submit firing and the session closing.
                return (
                  <div style={{ background: 'var(--teal-light)', border: '1px solid rgba(0,165,163,0.2)', borderRadius: '10px', padding: '14px', marginBottom: '14px', fontSize: '13px', color: 'var(--ink3)' }}>
                    Saving…
                  </div>
                )
              }
              // Summary screen (ingest mode)
              const added = gapWizard.resolutions.filter(r => r.action === 'add_to_processor')
              const other = gapWizard.resolutions.filter(r => r.action !== 'add_to_processor')
              return (
                <div style={{ background: 'var(--teal-light)', border: '1px solid rgba(0,165,163,0.2)', borderRadius: '10px', padding: '18px', marginBottom: '14px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--teal)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '10px' }}>All gaps resolved</div>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '8px' }}>What I learned from this document</div>
                  {added.length > 0 && (
                    <div style={{ marginBottom: '10px' }}>
                      <div style={{ fontSize: '13px', color: 'var(--ink3)', marginBottom: '4px' }}>Added to {typeName} processor:</div>
                      {added.map(r => (
                        <div key={r.gap_id} style={{ fontSize: '13px', color: 'var(--lime)', fontWeight: 700 }}>✓ {typeLabel(r.field_name ?? '')}{r.is_required ? '' : ' (optional)'}</div>
                      ))}
                    </div>
                  )}
                  {other.length > 0 && (
                    <div style={{ marginBottom: '10px' }}>
                      <div style={{ fontSize: '13px', color: 'var(--ink3)', marginBottom: '4px' }}>{gapWizard.mode === 'ingest' ? 'Skipped:' : 'Deferred:'}</div>
                      {other.map(r => {
                        const gap = session.gaps.find(g => g.id === r.gap_id)
                        return <div key={r.gap_id} style={{ fontSize: '13px', color: 'var(--ink3)', fontWeight: 700 }}>✗ {gap ? typeLabel(gap.suggested_field_name || gap.description) : r.gap_id}</div>
                      })}
                    </div>
                  )}
                  {added.length > 0 && (
                    <p style={{ fontSize: '13px', color: 'var(--ink3)', lineHeight: 1.6, margin: '0 0 14px' }}>
                      These new fields will be captured automatically in all future {typeName.toLowerCase()} uploads.
                    </p>
                  )}
                  {gapWizard.msg && (
                    <div style={{ fontSize: '13px', padding: '9px 12px', borderRadius: '8px', background: 'rgba(255,107,107,0.07)', border: '1px solid rgba(255,107,107,0.2)', color: 'var(--red)', marginBottom: '10px' }}>
                      {gapWizard.msg}
                    </div>
                  )}
                  <button onClick={() => submitGapResolutions(session.id, session.document_id, gapWizard.resolutions, gapWizard.mode)} disabled={gapWizard.submitting}
                    style={{ padding: '9px 18px', borderRadius: '9px', border: 'none', background: gapWizard.submitting ? 'var(--border)' : 'var(--lime)', color: gapWizard.submitting ? 'var(--ink4)' : 'var(--lime-dark)', fontSize: '13px', fontWeight: 800, cursor: gapWizard.submitting ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
                    {gapWizard.submitting ? 'Publishing…' : 'Publish to Knowledge Base →'}
                  </button>
                </div>
              )
            }

            const gap = session.gaps.find(g => g.id === gapWizard.gapIds[gapWizard.cursor])
            if (!gap) return null

            const step = gapWizard.step
            const gapNum = gapWizard.cursor + 1
            const step1Ready = !!gapWizard.selectedOption && (gapWizard.selectedOption !== '__other__' || !!gapWizard.otherText.trim())
            const step3Ready = gapWizard.fieldChoice === 'suggested' || !!gapWizard.customFieldName.trim()
            const radioStyle = (active: boolean) => ({ display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 12px', borderRadius: '9px', border: `1px solid ${active ? 'var(--teal-mid)' : 'var(--border)'}`, background: active ? 'rgba(0,165,163,0.08)' : 'var(--card)', cursor: 'pointer', fontSize: '13px', color: 'var(--ink)' } as const)
            const inputStyle = { width: '100%', padding: '9px 12px', borderRadius: '9px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--ink)', fontSize: '13px', fontFamily: 'inherit', boxSizing: 'border-box' as const }

            return (
              <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '18px', marginBottom: '14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--ink3)', letterSpacing: '1.5px', textTransform: 'uppercase' }}>Gap {gapNum} of {total}</span>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    {[1, 2, 3].map(n => <span key={n} style={{ width: '8px', height: '8px', borderRadius: '50%', background: n <= step ? 'var(--teal-mid)' : 'var(--border)' }} />)}
                  </div>
                </div>

                <div style={{ background: 'var(--teal-light)', border: '1px solid rgba(0,165,163,0.15)', borderRadius: '10px', padding: '12px', marginBottom: '16px' }}>
                  <div style={{ fontSize: '13px', color: 'var(--ink)', fontWeight: 700, marginBottom: '4px' }}>I found:</div>
                  <div style={{ fontSize: '13px', color: 'var(--ink2)' }}>{gap.description}</div>
                  {gap.location && <div style={{ fontSize: '13px', color: 'var(--ink3)', marginTop: '4px' }}>Location: {gap.location}</div>}
                </div>

                <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--teal)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>Step {step} of 3</div>

                {step === 1 && (
                  <div style={{ marginBottom: '16px' }}>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink)', marginBottom: '10px' }}>
                      {isXlsx ? `What does column "${gap.example_value}" contain?` : 'What type of information is this?'}
                    </div>
                    {gap.suggested_options.length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '10px' }}>
                        {gap.suggested_options.filter(o => !/^something else/i.test(o)).map(opt => (
                          <label key={opt} style={radioStyle(gapWizard.selectedOption === opt)}>
                            <input type="radio" checked={gapWizard.selectedOption === opt} onChange={() => setGapWizard({ ...gapWizard, selectedOption: opt })} />
                            {opt}
                          </label>
                        ))}
                        <label style={radioStyle(gapWizard.selectedOption === '__other__')}>
                          <input type="radio" checked={gapWizard.selectedOption === '__other__'} onChange={() => setGapWizard({ ...gapWizard, selectedOption: '__other__' })} />
                          Something else — let me describe it
                        </label>
                      </div>
                    )}
                    {(gap.suggested_options.length === 0 || gapWizard.selectedOption === '__other__') && (
                      <input value={gapWizard.otherText} onChange={e => setGapWizard({ ...gapWizard, otherText: e.target.value, selectedOption: '__other__' })}
                        placeholder={isXlsx ? 'e.g. registration source, ticket tier, payment method' : 'Describe what this is'}
                        style={inputStyle} />
                    )}
                  </div>
                )}

                {step === 2 && (
                  <div style={{ marginBottom: '16px' }}>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink)', marginBottom: '10px' }}>
                      Should I capture this for all future {typeName.toLowerCase()}s?
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {([
                        { key: 'always', label: 'Yes — always look for this and extract it' },
                        { key: 'optional', label: "Only when present — it's optional, not every document will have one" },
                        { key: 'no', label: "No — this was specific to this document, don't capture it again" },
                      ] as { key: 'always' | 'optional' | 'no'; label: string }[]).map(o => (
                        <label key={o.key} style={radioStyle(gapWizard.importance === o.key)}>
                          <input type="radio" checked={gapWizard.importance === o.key} onChange={() => gapWizardChooseImportance(gap, o.key)} />
                          {o.label}
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {step === 3 && (
                  <div style={{ marginBottom: '16px' }}>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink)', marginBottom: '10px' }}>
                      {isXlsx ? 'What should I map this column to?' : 'What should I call this field in the knowledge base?'}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '10px' }}>
                      <label style={radioStyle(gapWizard.fieldChoice === 'suggested')}>
                        <input type="radio" checked={gapWizard.fieldChoice === 'suggested'} onChange={() => setGapWizard({ ...gapWizard, fieldChoice: 'suggested' })} />
                        {typeLabel(gap.suggested_field_name)}
                      </label>
                      <label style={radioStyle(gapWizard.fieldChoice === 'custom')}>
                        <input type="radio" checked={gapWizard.fieldChoice === 'custom'} onChange={() => setGapWizard({ ...gapWizard, fieldChoice: 'custom' })} />
                        Use my own label
                      </label>
                    </div>
                    {gapWizard.fieldChoice === 'custom' && (
                      <input value={gapWizard.customFieldName} onChange={e => setGapWizard({ ...gapWizard, customFieldName: e.target.value })}
                        placeholder="e.g. sustainability_metric" style={inputStyle} />
                    )}
                  </div>
                )}

                {gapWizard.msg && (
                  <div style={{ fontSize: '13px', padding: '9px 12px', borderRadius: '8px', background: 'rgba(255,107,107,0.07)', border: '1px solid rgba(255,107,107,0.2)', color: 'var(--red)', marginBottom: '10px' }}>
                    {gapWizard.msg}
                  </div>
                )}

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={gapWizardBack} disabled={step === 1}
                      style={{ padding: '9px 16px', borderRadius: '9px', border: '1px solid var(--ink4)', background: 'var(--card)', color: step === 1 ? 'var(--ink4)' : 'var(--ink3)', fontSize: '13px', fontWeight: 600, cursor: step === 1 ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
                      ← Back
                    </button>
                    {step === 1 && (
                      <button onClick={() => setGapWizard({ ...gapWizard, step: 2 })} disabled={!step1Ready}
                        style={{ padding: '9px 16px', borderRadius: '9px', border: 'none', background: step1Ready ? 'var(--teal-mid)' : 'var(--border)', color: step1Ready ? 'var(--teal-light)' : 'var(--ink4)', fontSize: '13px', fontWeight: 800, cursor: step1Ready ? 'pointer' : 'not-allowed', fontFamily: 'inherit' }}>
                        Next →
                      </button>
                    )}
                    {step === 3 && (
                      <button onClick={() => gapWizardConfirmField(gap)} disabled={!step3Ready}
                        style={{ padding: '9px 16px', borderRadius: '9px', border: 'none', background: step3Ready ? 'var(--teal-mid)' : 'var(--border)', color: step3Ready ? 'var(--teal-light)' : 'var(--ink4)', fontSize: '13px', fontWeight: 800, cursor: step3Ready ? 'pointer' : 'not-allowed', fontFamily: 'inherit' }}>
                        Confirm
                      </button>
                    )}
                  </div>
                  <button onClick={() => gapWizardSkipGap(gap)}
                    style={{ fontSize: '13px', color: 'var(--ink3)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
                    Skip this gap ›
                  </button>
                </div>
              </div>
            )
          }

          function renderReviewCard(doc: PendingDoc, summary: string, detectedType?: string) {
            const isReviewing = reviewingId === doc.id
            const session = gapSessions[doc.id]
            const unresolvedGaps = session ? session.gaps.filter(g => g.status === 'unresolved') : []
            const hasUnresolvedGaps = unresolvedGaps.length > 0
            const wizardActive = !!gapWizard && gapWizard.sessionId === session?.id

            return (
              <div key={doc.id} style={{ background: 'var(--card)', border: '1px solid rgba(124,58,237,0.25)', borderRadius: '16px', padding: '20px', marginBottom: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 700, padding: '2px 8px', borderRadius: '16px', background: 'rgba(124,58,237,0.12)', color: 'var(--purple)' }}>
                      {typeLabel(detectedType ?? doc.type)}
                    </span>
                    <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--ink)' }}>{doc.title}</span>
                  </div>
                  <span style={{ fontSize: '13px', color: 'var(--ink3)' }}>{doc.word_count?.toLocaleString()} words</span>
                </div>
                <div style={{ maxHeight: '320px', overflowY: 'auto', padding: '14px', background: 'var(--surface)', borderRadius: '10px', marginBottom: '14px', fontSize: '13px', color: 'var(--ink2)', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                  {summary}
                </div>

                {hasUnresolvedGaps && !wizardActive && session && (
                  <div style={{ background: 'var(--teal-light)', border: '1px solid rgba(0,165,163,0.2)', borderRadius: '10px', padding: '14px', marginBottom: '14px' }}>
                    <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--teal)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '6px' }}>Before you publish</div>
                    <p style={{ fontSize: '13px', color: 'var(--ink2)', margin: '0 0 10px', lineHeight: 1.6 }}>
                      I found {unresolvedGaps.length} piece{unresolvedGaps.length === 1 ? '' : 's'} of new information in this document that I haven&apos;t seen before. Help me understand {unresolvedGaps.length === 1 ? 'it' : 'them'} so I can learn from this.
                    </p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                      <button onClick={() => startGapWizard('ingest', doc.id, session.id, unresolvedGaps.map(g => g.id))} disabled={isReviewing}
                        style={{ padding: '9px 18px', borderRadius: '9px', border: 'none', background: 'var(--teal-mid)', color: 'var(--teal-light)', fontSize: '13px', fontWeight: 800, cursor: isReviewing ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
                        Review {unresolvedGaps.length} gap{unresolvedGaps.length === 1 ? '' : 's'} →
                      </button>
                      <button onClick={() => rejectPendingDoc(doc.id)} disabled={isReviewing}
                        style={{ fontSize: '13px', color: 'var(--ink3)', background: 'none', border: 'none', cursor: isReviewing ? 'not-allowed' : 'pointer', fontFamily: 'inherit', fontWeight: 600 }}>
                        Discard this job
                      </button>
                    </div>
                  </div>
                )}

                {wizardActive && session && renderGapWizard(session)}

                {!hasUnresolvedGaps && (
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button onClick={() => publishPendingDoc(doc.id)} disabled={isReviewing}
                      style={{ padding: '9px 18px', borderRadius: '9px', border: 'none', background: isReviewing ? 'var(--border)' : 'var(--lime)', color: isReviewing ? 'var(--ink4)' : 'var(--lime-dark)', fontSize: '13px', fontWeight: 800, cursor: isReviewing ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
                      {isReviewing ? 'Working…' : 'Publish to KB'}
                    </button>
                    <button onClick={() => rejectPendingDoc(doc.id)} disabled={isReviewing}
                      style={{ padding: '9px 18px', borderRadius: '9px', border: '1px solid rgba(255,107,107,0.3)', background: 'rgba(255,107,107,0.08)', color: 'var(--red)', fontSize: '13px', fontWeight: 700, cursor: isReviewing ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
                      Reject
                    </button>
                  </div>
                )}
              </div>
            )
          }

          // This whole route is already gated to kb-admins at the layout level
          // (see manage/layout.tsx), so — unlike the original admin/page.tsx tab,
          // which was reachable by any staff member — there's no need to
          // recompute an isKbAdmin flag here just to hide the Intelligence/Gaps
          // pills or the Settings link; they're simply always shown.
          return (
            <div style={{ fontFamily: 'var(--font-manrope), Manrope, sans-serif', background: 'var(--surface)', minHeight: '100vh', color: 'var(--ink)' }}>
              <PageHeader
                eyebrow="Knowledge Base"
                title="Manage"
                actions={<>
                  {docSubTab === 'documents' && (<>
                    <Link href="/admin/tools/per-creator"
                      style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '10px 18px', borderRadius: '10px', border: '1px solid rgba(96,165,250,0.35)', background: 'rgba(96,165,250,0.08)', color: 'var(--info)', fontSize: '13px', fontWeight: 800, textDecoration: 'none' }}>
                      <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                      PER Creator
                    </Link>
                    <Link href="/admin/toolkit/knowledge-assistant"
                      style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '10px 18px', borderRadius: '10px', border: '1px solid rgba(0,165,163,0.35)', background: 'rgba(0,165,163,0.08)', color: 'var(--teal)', fontSize: '13px', fontWeight: 800, textDecoration: 'none' }}>
                      <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
                      Knowledge Assistant
                    </Link>
                    {!showIngestForm && (
                      <button onClick={() => setShowIngestForm(true)}
                        style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '10px 18px', borderRadius: '10px', border: '1px solid rgba(164,120,255,0.35)', background: 'rgba(164,120,255,0.08)', color: 'var(--purple)', fontSize: '13px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
                        <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                        Ingest Document
                      </button>
                    )}
                  </>)}
                  {docSubTab === 'workspaces' && (<>
                    <Link href="/admin/tools/proposal-creator"
                      style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '10px 18px', borderRadius: '10px', border: '1px solid rgba(124,58,237,0.35)', background: 'rgba(124,58,237,0.08)', color: 'var(--purple)', fontSize: '13px', fontWeight: 800, textDecoration: 'none' }}>
                      <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                      Proposal Creator
                    </Link>
                    {!showWorkspaceForm && (
                      <button onClick={() => setShowWorkspaceForm(true)}
                        style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '10px 18px', borderRadius: '10px', border: 'none', background: 'var(--lime)', color: 'var(--lime-dark)', fontSize: '13px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
                        <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                        New Workspace
                      </button>
                    )}
                  </>)}
                </>}
              />
              <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '32px 24px 80px' }}>

              {/* Sub-tab pills */}
              <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', alignItems: 'center' }}>
                {([
                  { key: 'documents', label: 'Documents' },
                  { key: 'workspaces', label: 'BD Workspaces' },
                  { key: 'intelligence', label: 'Intelligence' },
                  { key: 'gaps', label: `Pending Gaps (${pendingGapSessions.length})` },
                ] as { key: typeof docSubTab; label: string }[]).map(s => (
                  <button key={s.key} onClick={() => { setDocSubTab(s.key); syncManageUrl(s.key) }}
                    style={{ padding: '8px 18px', borderRadius: '10px', border: `1px solid ${docSubTab === s.key ? 'rgba(0,165,163,0.4)' : 'var(--border)'}`, background: docSubTab === s.key ? 'rgba(0,165,163,0.08)' : 'var(--card)', color: docSubTab === s.key ? 'var(--teal)' : 'var(--ink3)', fontSize: '13px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
                    {s.label}
                  </button>
                ))}
              </div>

              {docSubTab === 'documents' && docActionMsg && (() => {
                const isSuccess = docActionMsg.startsWith('✓')
                return (
                  <div style={{ fontSize: '13px', fontWeight: 700, padding: '11px 16px', borderRadius: '10px', background: isSuccess ? 'rgba(192,244,60,0.1)' : 'rgba(255,107,107,0.08)', border: `1px solid ${isSuccess ? 'rgba(192,244,60,0.3)' : 'rgba(255,107,107,0.25)'}`, color: isSuccess ? 'var(--lime)' : 'var(--red)', marginBottom: '16px' }}>
                    {docActionMsg}
                  </div>
                )
              })()}

              {docSubTab === 'documents' && showIngestForm && (() => {
                const effectiveIntent = ingestEffectiveIntent()
                const isGeneral = effectiveIntent === 'verbatim'
                const effectiveType = ingestEffectiveType()
                const generalReady = docForm.title.trim() && docForm.doc_category && (docForm.type !== 'other' || otherTypeLabel.trim())
                const canSubmit = !!ingestFile && (!isGeneral || generalReady)
                const STRUCTURED_TYPE_OPTIONS: { key: KbDocType; label: string }[] = [
                  { key: 'proposal', label: 'Proposal' },
                  { key: 'post_event_report', label: 'Post-Event Report' },
                  { key: 'attendee_data', label: 'Attendee Data' },
                  { key: 'corporate_doc', label: 'Corporate Doc' },
                ]
                const INTENT_OPTIONS: { key: 'summarise' | 'verbatim'; title: string; desc: string }[] = [
                  { key: 'summarise', title: 'Summarise into the Knowledge Base', desc: 'AI restructures the content into a searchable KB entry. You review the summary — and resolve any new fields it found — before it goes live.' },
                  { key: 'verbatim', title: 'Upload as-is', desc: 'Original wording is kept exactly as uploaded, no rewriting. You still review the AI\'s access-level decision before it goes live.' },
                ]
                return (
                  <div style={{ background: 'var(--card)', border: '1px solid rgba(164,120,255,0.25)', borderRadius: '16px', padding: '24px', marginBottom: '20px', maxWidth: '560px' }}>
                    <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--purple)', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '6px' }}>Ingest Document</div>

                    {ingesting ? (
                      <div style={{ padding: '10px 0 4px' }}>
                        <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink)', marginBottom: '18px' }}>{ingestFile?.name}</div>
                        <div style={{ position: 'relative', height: '8px', borderRadius: '999px', background: 'var(--purple-light)', overflow: 'hidden', marginBottom: '14px' }}>
                          <div style={{ position: 'absolute', left: '-40%', top: 0, bottom: 0, width: '40%', borderRadius: '999px', background: 'linear-gradient(90deg, var(--indigo), var(--purple))', animation: 'ingestBarSlide 1.3s ease-in-out infinite' }} />
                        </div>
                        <div key={ingestStage} style={{ fontSize: '13px', fontWeight: 700, color: 'var(--purple)', animation: 'tourPop 0.3s ease' }}>
                          {INGEST_STAGES[ingestStage]}
                        </div>
                        <div style={{ fontSize: '13px', color: 'var(--ink3)', marginTop: '4px' }}>Large files can take a little longer.</div>
                      </div>
                    ) : (
                      <>
                        <p style={{ fontSize: '13px', color: 'var(--ink3)', margin: '0 0 16px', lineHeight: 1.6 }}>
                          Upload a file, choose how it should be processed, then review before it publishes.
                        </p>
                        <label style={{ display: 'block', padding: '18px', border: `1.5px dashed ${ingestFile ? 'rgba(124,58,237,0.4)' : 'var(--border)'}`, borderRadius: '10px', textAlign: 'center', cursor: 'pointer', background: ingestFile ? 'rgba(124,58,237,0.04)' : 'transparent', marginBottom: '14px' }}>
                          <input type="file" accept=".pdf,.xlsx,.xls,.txt,.md" style={{ display: 'none' }} onChange={e => { setIngestFile(e.target.files?.[0] ?? null); setIngestTypeChoice(null); setIngestIntent(null) }} />
                          {ingestFile ? (
                            <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--purple)' }}>{ingestFile.name}</div>
                          ) : (
                            <div style={{ fontSize: '13px', color: 'var(--ink)' }}>Click to select a file — PDF, XLSX, TXT, or MD (max 100 MB)</div>
                          )}
                        </label>

                        {ingestFile && (
                          <div style={{ marginBottom: '14px' }}>
                            <label style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink3)', letterSpacing: '0.8px', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>
                              What should happen with this document?
                            </label>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                              {INTENT_OPTIONS.map(opt => {
                                const active = effectiveIntent === opt.key
                                return (
                                  <button key={opt.key} onClick={() => { setIngestIntent(opt.key); setIngestTypeChoice(null) }}
                                    style={{ textAlign: 'left', padding: '12px 14px', borderRadius: '10px', border: `1.5px solid ${active ? 'rgba(124,58,237,0.4)' : 'var(--border)'}`, background: active ? 'rgba(124,58,237,0.06)' : 'var(--card)', cursor: 'pointer', fontFamily: 'inherit' }}>
                                    <div style={{ fontSize: '13px', fontWeight: 800, color: active ? 'var(--purple)' : 'var(--ink)', marginBottom: '3px' }}>{opt.title}</div>
                                    <div style={{ fontSize: '13px', color: 'var(--ink3)', lineHeight: 1.5 }}>{opt.desc}</div>
                                  </button>
                                )
                              })}
                            </div>
                          </div>
                        )}

                        {ingestFile && !isGeneral && (
                          <div style={{ marginBottom: '14px' }}>
                            <label style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink3)', letterSpacing: '0.8px', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>
                              {ingestTypeChoice ? 'Type' : 'Detected type'}
                            </label>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                              {STRUCTURED_TYPE_OPTIONS.map(opt => (
                                <button key={opt.key} onClick={() => setIngestTypeChoice(opt.key)}
                                  style={{ padding: '6px 12px', borderRadius: '16px', border: `1px solid ${effectiveType === opt.key ? 'rgba(124,58,237,0.4)' : 'var(--border)'}`, background: effectiveType === opt.key ? 'rgba(124,58,237,0.08)' : 'var(--card)', color: effectiveType === opt.key ? 'var(--purple)' : 'var(--ink3)', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                                  {opt.label}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {isGeneral && generalDocFields}

                        {ingestMsg && (
                          <div style={{ fontSize: '13px', padding: '9px 12px', borderRadius: '8px', background: 'rgba(255,107,107,0.07)', border: '1px solid rgba(255,107,107,0.2)', color: 'var(--red)', marginBottom: '10px', lineHeight: 1.5 }}>
                            {ingestMsg}
                          </div>
                        )}
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button onClick={ingestDocument} disabled={!canSubmit}
                            style={{ flex: 1, padding: '11px', borderRadius: '9px', border: 'none', background: !canSubmit ? 'var(--border)' : 'var(--purple)', color: !canSubmit ? 'var(--ink4)' : 'var(--purple-light)', fontSize: '13px', fontWeight: 800, cursor: !canSubmit ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
                            Start Ingestion
                          </button>
                          <button onClick={() => { setShowIngestForm(false); setIngestFile(null); setIngestMsg(''); resetGeneralDocForm() }}
                            style={{ padding: '11px 16px', borderRadius: '9px', border: '1px solid var(--ink4)', background: 'var(--card)', color: 'var(--ink3)', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                            Cancel
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )
              })()}

              {docSubTab === 'documents' && ingestResult && ingestResult.detected_type === 'general' && ingestResult.analysis && (
                <div style={{ background: 'var(--card)', border: '1px solid rgba(192,244,60,0.25)', borderRadius: '16px', padding: '20px', marginBottom: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--ink)' }}>{ingestResult.document.title}</span>
                    <span style={{ fontSize: '13px', color: 'var(--ink3)' }}>{ingestResult.document.word_count?.toLocaleString()} words</span>
                  </div>
                  <div style={{ padding: '14px', background: ingestResult.analysis.flagged ? 'rgba(139,26,26,0.06)' : 'rgba(0,165,163,0.06)', border: `1px solid ${ingestResult.analysis.flagged ? 'rgba(139,26,26,0.2)' : 'rgba(0,165,163,0.2)'}`, borderRadius: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', marginBottom: '10px' }}>
                      <span style={{ fontSize: '13px', fontWeight: 800, color: ingestResult.analysis.flagged ? 'var(--red)' : 'var(--teal-mid)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{ingestResult.analysis.flagged ? 'Low Confidence — Needs Review' : 'Ready to Publish'}</span>
                      <span style={{ marginLeft: 'auto', fontSize: '13px', fontWeight: 800, color: ingestResult.analysis.confidence >= 75 ? 'var(--lime)' : 'var(--red)' }}>{ingestResult.analysis.confidence}%</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px', marginBottom: '10px' }}>
                      {[{ l: 'Layer', v: ingestResult.analysis.layer.replace('_', ' ') }, { l: 'Department', v: ingestResult.analysis.department }, { l: 'Min Level', v: ingestResult.analysis.min_level }].map(({ l, v }) => (
                        <div key={l} style={{ background: 'var(--card)', borderRadius: '7px', padding: '7px 9px' }}>
                          <div style={{ fontSize: '9px', color: 'var(--ink3)', fontWeight: 700, textTransform: 'uppercase', marginBottom: '2px' }}>{l}</div>
                          <div style={{ fontSize: '13px', color: 'var(--ink)', fontWeight: 700, textTransform: 'capitalize' }}>{v}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '6px' }}>
                      <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: ingestResult.analysis.pilot_use ? 'var(--lime)' : 'var(--border)', flexShrink: 0 }} />
                      <span style={{ fontSize: '13px', color: ingestResult.analysis.pilot_use ? 'var(--lime)' : 'var(--ink)', fontWeight: 600 }}>{ingestResult.analysis.pilot_use ? 'Pilot will use this document' : 'Not indexed by Pilot'}</span>
                    </div>
                    <p style={{ fontSize: '13px', color: 'var(--ink3)', lineHeight: 1.6, margin: 0 }}>{ingestResult.analysis.ai_reasoning}</p>
                  </div>
                  <div style={{ display: 'flex', gap: '10px', marginTop: '14px' }}>
                    <button onClick={() => publishPendingDoc(ingestResult.document.id)} disabled={reviewingId === ingestResult.document.id}
                      style={{ padding: '9px 18px', borderRadius: '9px', border: 'none', background: reviewingId === ingestResult.document.id ? 'var(--border)' : 'var(--lime)', color: reviewingId === ingestResult.document.id ? 'var(--ink4)' : 'var(--lime-dark)', fontSize: '13px', fontWeight: 800, cursor: reviewingId === ingestResult.document.id ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
                      {reviewingId === ingestResult.document.id ? 'Working…' : 'Publish to KB'}
                    </button>
                    <button onClick={() => rejectPendingDoc(ingestResult.document.id)} disabled={reviewingId === ingestResult.document.id}
                      style={{ padding: '9px 18px', borderRadius: '9px', border: '1px solid rgba(255,107,107,0.3)', background: 'rgba(255,107,107,0.08)', color: 'var(--red)', fontSize: '13px', fontWeight: 700, cursor: reviewingId === ingestResult.document.id ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
                      Reject
                    </button>
                  </div>
                </div>
              )}

              {docSubTab === 'documents' && ingestResult && ingestResult.detected_type !== 'general' && renderReviewCard(ingestResult.document, ingestResult.summary ?? '', ingestResult.detected_type)}

              {docSubTab === 'documents' && (() => {
                const others = pendingDocs.filter(d => d.id !== ingestResult?.document.id)
                if (pendingLoading || others.length === 0) return null
                return (
                  <div style={{ marginBottom: '24px' }}>
                    <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--purple)', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '12px' }}>
                      Pending Review ({others.length})
                    </div>
                    {others.map(d => expandedPendingId === d.id
                      ? renderReviewCard(d, d.extracted_text)
                      : (
                        <div key={d.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '12px', marginBottom: '8px' }}>
                          <div>
                            <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink)' }}>{d.title}</span>
                            <span style={{ fontSize: '13px', color: 'var(--ink3)', marginLeft: '8px' }}>{typeLabel(d.type)}</span>
                          </div>
                          <button onClick={() => { setExpandedPendingId(d.id); if (!gapSessions[d.id]) fetchGapSession(d.id) }}
                            style={{ fontSize: '13px', fontWeight: 700, color: 'var(--purple)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
                            Review →
                          </button>
                        </div>
                      )
                    )}
                  </div>
                )
              })()}

              {docSubTab === 'workspaces' ? (
                <div>
                  {showWorkspaceForm && (
                    <div style={{ background: 'var(--card)', border: '1px solid rgba(192,244,60,0.2)', borderRadius: '16px', padding: '24px', marginBottom: '24px', maxWidth: '520px' }}>
                      <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--teal)', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '16px' }}>New BD Workspace</div>
                      <div style={{ marginBottom: '12px' }}>
                        <label style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink3)', letterSpacing: '0.8px', textTransform: 'uppercase', display: 'block', marginBottom: '5px' }}>Workspace Name</label>
                        <input value={workspaceForm.name} onChange={e => setWorkspaceForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. DLD LivingSphere Summit"
                          style={{ width: '100%', padding: '9px 12px', borderRadius: '9px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--ink)', fontSize: '13px', fontFamily: 'inherit', boxSizing: 'border-box' }} />
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
                        <div>
                          <label style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink3)', letterSpacing: '0.8px', textTransform: 'uppercase', display: 'block', marginBottom: '5px' }}>Client Name</label>
                          <input value={workspaceForm.client_name} onChange={e => setWorkspaceForm(p => ({ ...p, client_name: e.target.value }))} placeholder="e.g. Dubai Land Department"
                            style={{ width: '100%', padding: '9px 10px', borderRadius: '9px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--ink)', fontSize: '13px', fontFamily: 'inherit', boxSizing: 'border-box' }} />
                        </div>
                        <div>
                          <label style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink3)', letterSpacing: '0.8px', textTransform: 'uppercase', display: 'block', marginBottom: '5px' }}>Client Country</label>
                          <input value={workspaceForm.client_country} onChange={e => setWorkspaceForm(p => ({ ...p, client_country: e.target.value }))} placeholder="e.g. UAE"
                            style={{ width: '100%', padding: '9px 10px', borderRadius: '9px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--ink)', fontSize: '13px', fontFamily: 'inherit', boxSizing: 'border-box' }} />
                        </div>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '14px' }}>
                        <div>
                          <label style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink3)', letterSpacing: '0.8px', textTransform: 'uppercase', display: 'block', marginBottom: '5px' }}>Event Name</label>
                          <input value={workspaceForm.event_name} onChange={e => setWorkspaceForm(p => ({ ...p, event_name: e.target.value }))} placeholder="e.g. LivingSphere Summit"
                            style={{ width: '100%', padding: '9px 10px', borderRadius: '9px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--ink)', fontSize: '13px', fontFamily: 'inherit', boxSizing: 'border-box' }} />
                        </div>
                        <div>
                          <label style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink3)', letterSpacing: '0.8px', textTransform: 'uppercase', display: 'block', marginBottom: '5px' }}>Event Type</label>
                          <select value={workspaceForm.event_type} onChange={e => setWorkspaceForm(p => ({ ...p, event_type: e.target.value }))}
                            style={{ width: '100%', padding: '9px 10px', borderRadius: '9px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--ink)', fontSize: '13px', fontFamily: 'inherit' }}>
                            <option value="managed">Managed</option>
                            <option value="bespoke">Bespoke</option>
                            <option value="tender">Tender</option>
                            <option value="other">Other</option>
                          </select>
                        </div>
                      </div>
                      {workspaceMsg && <div style={{ fontSize: '13px', padding: '9px 12px', borderRadius: '8px', background: workspaceMsg.includes('created') ? 'rgba(192,244,60,0.07)' : 'rgba(255,107,107,0.07)', border: `1px solid ${workspaceMsg.includes('created') ? 'rgba(192,244,60,0.2)' : 'rgba(255,107,107,0.2)'}`, color: workspaceMsg.includes('created') ? 'var(--lime)' : 'var(--red)', marginBottom: '10px' }}>{workspaceMsg}</div>}
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button onClick={createWorkspace} disabled={workspaceSaving}
                          style={{ flex: 1, padding: '11px', borderRadius: '9px', border: 'none', background: workspaceSaving ? 'var(--border)' : 'var(--lime)', color: workspaceSaving ? 'var(--ink4)' : 'var(--lime-dark)', fontSize: '13px', fontWeight: 800, cursor: workspaceSaving ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
                          {workspaceSaving ? 'Creating…' : 'Create Workspace'}
                        </button>
                        <button onClick={() => setShowWorkspaceForm(false)}
                          style={{ padding: '11px 16px', borderRadius: '9px', border: '1px solid var(--ink4)', background: 'var(--card)', color: 'var(--ink3)', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
                      </div>
                    </div>
                  )}

                  {workspacesLoading && <div style={{ color: 'var(--ink)', fontSize: '13px', padding: '40px 0', textAlign: 'center' }}>Loading workspaces…</div>}

                  {!workspacesLoading && workspaces.length === 0 && (
                    <div style={{ padding: '40px', textAlign: 'center', color: 'var(--ink)', fontSize: '13px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '16px' }}>
                      No BD workspaces yet. Create one to track a proposal or bid, its team, and its linked documents together.
                    </div>
                  )}

                  {!workspacesLoading && workspaces.length > 0 && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px' }}>
                      {workspaces.map(ws => {
                        const memberCount = ws.bd_workspace_members?.[0]?.count ?? 0
                        const docCount    = ws.documents?.[0]?.count ?? 0
                        const STATUS_CFG: Record<string, { color: string; bg: string }> = {
                          active:    { color: 'var(--teal-mid)', bg: 'rgba(0,165,163,0.12)' },
                          won:       { color: 'var(--lime)', bg: 'rgba(192,244,60,0.12)' },
                          lost:      { color: 'var(--red)', bg: 'rgba(139,26,26,0.1)' },
                          pending:   { color: 'var(--amber)', bg: 'rgba(245,158,11,0.12)' },
                          withdrawn: { color: 'var(--ink3)', bg: 'var(--surface)' },
                        }
                        const sc = STATUS_CFG[ws.status] ?? STATUS_CFG.active
                        return (
                          <button key={ws.id} onClick={() => openWorkspace(ws.id)}
                            style={{ textAlign: 'left', background: 'var(--card)', border: `1px solid ${selectedWorkspaceId === ws.id ? 'rgba(0,165,163,0.4)' : 'var(--border)'}`, borderRadius: '14px', padding: '16px', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                              <span style={{ fontSize: '13px', fontWeight: 700, padding: '2px 8px', borderRadius: '16px', background: sc.bg, color: sc.color, textTransform: 'capitalize' }}>{ws.status}</span>
                              {ws.event_type && <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink3)', textTransform: 'capitalize' }}>{ws.event_type}</span>}
                            </div>
                            <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--ink)' }}>{ws.name}</div>
                            {(ws.client_name || ws.client_country) && (
                              <div style={{ fontSize: '13px', color: 'var(--ink3)' }}>{[ws.client_name, ws.client_country].filter(Boolean).join(' · ')}</div>
                            )}
                            <div style={{ display: 'flex', gap: '14px', marginTop: 'auto', paddingTop: '8px', borderTop: '1px solid var(--border)', fontSize: '13px', color: 'var(--ink)' }}>
                              <span>{memberCount} member{memberCount !== 1 ? 's' : ''}</span>
                              <span>{docCount} document{docCount !== 1 ? 's' : ''}</span>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  )}

                  {selectedWorkspaceId && (() => {
                    const ws = workspaces.find(w => w.id === selectedWorkspaceId)
                    if (!ws) return null
                    const wsDocs = docs.filter(d => d.workspace_id === selectedWorkspaceId)
                    const memberIds = new Set(workspaceMembers.map(m => m.staff_members.id))
                    return (
                      <div style={{ marginTop: '20px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '16px', padding: '20px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                          <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--ink)' }}>{ws.name} — Team</div>
                          <button onClick={() => setSelectedWorkspaceId(null)}
                            style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink3)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>Close</button>
                        </div>

                        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
                          {workspaceMembers.map(m => (
                            <span key={m.id} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 700, padding: '4px 6px 4px 10px', borderRadius: '16px', background: 'var(--surface)', color: 'var(--ink)' }}>
                              {m.staff_members.name}
                              <button onClick={() => removeWorkspaceMember(m.staff_members.id)}
                                style={{ width: '16px', height: '16px', borderRadius: '50%', border: 'none', background: 'rgba(255,107,107,0.15)', color: 'var(--red)', cursor: 'pointer', fontSize: '13px', lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>×</button>
                            </span>
                          ))}
                          {workspaceMembers.length === 0 && <span style={{ fontSize: '13px', color: 'var(--ink3)' }}>No members yet.</span>}
                        </div>

                        <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
                          <select value={addMemberStaffId} onChange={e => setAddMemberStaffId(e.target.value)}
                            style={{ flex: 1, padding: '9px 10px', borderRadius: '9px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--ink)', fontSize: '13px', fontFamily: 'inherit' }}>
                            <option value="">Add a team member…</option>
                            {staffList.filter(s => !memberIds.has(s.id)).map(s => <option key={s.id} value={s.id}>{s.name} — {s.department}</option>)}
                          </select>
                          <button onClick={addWorkspaceMember} disabled={!addMemberStaffId}
                            style={{ padding: '9px 18px', borderRadius: '9px', border: 'none', background: addMemberStaffId ? 'var(--lime)' : 'var(--border)', color: addMemberStaffId ? 'var(--lime-dark)' : 'var(--ink4)', fontSize: '13px', fontWeight: 800, cursor: addMemberStaffId ? 'pointer' : 'not-allowed', fontFamily: 'inherit' }}>Add</button>
                        </div>

                        <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--ink)', marginBottom: '10px' }}>Linked Documents ({wsDocs.length})</div>
                        {wsDocs.length === 0 ? (
                          <div style={{ fontSize: '13px', color: 'var(--ink3)' }}>No documents linked yet. Set &ldquo;BD Workspace&rdquo; when uploading a proposal or tender document to link it here.</div>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {wsDocs.map(d => (
                              <div key={d.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', background: 'var(--surface)', borderRadius: '9px' }}>
                                <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink)' }}>{d.title}</span>
                                {kbDownloadHref(d.source_url, d.id) && <a href={kbDownloadHref(d.source_url, d.id)!} target="_blank" rel="noopener noreferrer" style={{ fontSize: '13px', fontWeight: 700, color: 'var(--teal-mid)', textDecoration: 'none' }}>Download</a>}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })()}
                </div>
              ) : docSubTab === 'intelligence' ? (() => {
                function scoreBadge(score: number | null) {
                  if (score == null) return { color: 'var(--ink3)', background: '#7E93A115' }
                  if (score >= 75) return { color: 'var(--lime)', background: 'rgba(61,107,0,0.1)' }
                  if (score >= 40) return { color: 'var(--amber)', background: 'rgba(139,26,26,0.1)' }
                  return { color: 'var(--ink3)', background: '#7E93A115' }
                }

                function renderIntelReviewCard(item: IntelItem) {
                  const badge = scoreBadge(item.gemini_score)
                  const isExpanded = expandedIntelItemId === item.id
                  return (
                    <div key={item.id} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '16px', padding: '20px', marginBottom: '14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink3)' }}>{item.kb_intel_sources?.name ?? 'Unknown source'}</span>
                        <span style={{ fontSize: '13px', color: 'var(--ink3)' }}>·</span>
                        <span style={{ fontSize: '13px', color: 'var(--ink3)' }}>{new Date(item.discovered_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                        <span style={{ marginLeft: 'auto', fontSize: '13px', fontWeight: 800, padding: '2px 10px', borderRadius: '10px', color: badge.color, background: badge.background }}>Score: {item.gemini_score ?? '—'}</span>
                      </div>
                      <a href={item.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: '13px', fontWeight: 800, color: 'var(--ink)', textDecoration: 'none', display: 'block', marginBottom: '8px' }}>
                        {item.title ?? item.url}
                      </a>
                      <div style={{ display: 'flex', gap: '6px', marginBottom: '8px', flexWrap: 'wrap' }}>
                        {item.event_mentioned && <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--teal)', background: 'rgba(0,165,163,0.1)', padding: '2px 8px', borderRadius: '10px' }}>{item.event_mentioned}</span>}
                        {item.article_type && <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink3)', background: 'var(--surface)', padding: '2px 8px', borderRadius: '10px', textTransform: 'capitalize' }}>{item.article_type.replace(/_/g, ' ')}</span>}
                      </div>
                      {item.gemini_reasoning && <p style={{ fontSize: '13px', color: 'var(--ink3)', fontStyle: 'italic', margin: '0 0 10px', lineHeight: 1.6 }}>{item.gemini_reasoning}</p>}
                      {item.gemini_summary && (
                        <div style={{ marginBottom: '10px' }}>
                          <button onClick={() => setExpandedIntelItemId(isExpanded ? null : item.id)}
                            style={{ fontSize: '13px', fontWeight: 700, color: 'var(--purple)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>
                            {isExpanded ? 'Hide Summary ▲' : 'Preview Summary ▼'}
                          </button>
                          {isExpanded && (
                            <div style={{ marginTop: '8px', padding: '14px', background: 'var(--surface)', borderRadius: '10px', fontSize: '13px', color: 'var(--ink2)', whiteSpace: 'pre-wrap', lineHeight: 1.6, maxHeight: '320px', overflowY: 'auto' }}>
                              {item.gemini_summary}
                            </div>
                          )}
                        </div>
                      )}
                      <div style={{ display: 'flex', gap: '10px' }}>
                        <button onClick={() => approveIntelItem(item.id)}
                          style={{ padding: '9px 18px', borderRadius: '9px', border: 'none', background: 'var(--lime)', color: 'var(--lime-dark)', fontSize: '13px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
                          Add to KB ✓
                        </button>
                        <button onClick={() => rejectIntelItem(item.id)}
                          style={{ padding: '9px 18px', borderRadius: '9px', border: '1px solid rgba(255,107,107,0.3)', background: 'rgba(255,107,107,0.08)', color: 'var(--red)', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                          Reject ✗
                        </button>
                      </div>
                    </div>
                  )
                }

                return (
                <div>
                  {/* Internal tab bar */}
                  <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
                    {([
                      { key: 'overview', label: 'Overview' },
                      { key: 'review',   label: `Review Queue${intelPendingItems.length ? ` (${intelPendingItems.length})` : ''}` },
                      { key: 'sources',  label: 'Sources' },
                      { key: 'items',    label: 'All Items' },
                    ] as { key: typeof intelSubTab; label: string }[]).map(s => (
                      <button key={s.key} onClick={() => { setIntelSubTab(s.key); if (s.key === 'items') fetchIntelItems(0) }}
                        style={{ padding: '8px 16px', borderRadius: '10px', border: `1px solid ${intelSubTab === s.key ? 'rgba(124,58,237,0.4)' : 'var(--border)'}`, background: intelSubTab === s.key ? 'rgba(124,58,237,0.08)' : 'var(--card)', color: intelSubTab === s.key ? 'var(--purple)' : 'var(--ink3)', fontSize: '13px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
                        {s.label}
                      </button>
                    ))}
                  </div>

                  {intelLoading && <div style={{ fontSize: '13px', color: 'var(--ink3)', marginBottom: '16px' }}>Loading…</div>}

                  {intelSubTab === 'overview' && (
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
                        <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--ink)' }}>Press Intelligence</div>
                        <button onClick={runIntelNow} disabled={intelRunning}
                          style={{ padding: '10px 18px', borderRadius: '10px', border: 'none', background: intelRunning ? 'var(--border)' : 'var(--lime)', color: intelRunning ? 'var(--ink4)' : 'var(--lime-dark)', fontSize: '13px', fontWeight: 800, cursor: intelRunning ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
                          {intelRunning ? 'Running…' : 'Run Now ▶'}
                        </button>
                      </div>

                      {intelMsg && <div style={{ fontSize: '13px', padding: '9px 12px', borderRadius: '8px', background: 'rgba(0,165,163,0.06)', border: '1px solid rgba(0,165,163,0.2)', color: 'var(--teal)', marginBottom: '16px' }}>{intelMsg}</div>}

                      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' }}>
                        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '12px 16px' }}>
                          <div style={{ fontSize: '13px', color: 'var(--ink3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: '4px' }}>Last Run</div>
                          <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--ink)' }}>
                            {intelRuns[0] ? new Date(intelRuns[0].started_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Never run'}
                          </div>
                        </div>
                        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '12px 16px' }}>
                          <div style={{ fontSize: '13px', color: 'var(--ink3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: '4px' }}>Next Run</div>
                          <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--ink)' }}>{intelConfig?.cron_schedule_display ?? '—'}</div>
                        </div>
                        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <div>
                            <div style={{ fontSize: '13px', color: 'var(--ink3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: '4px' }}>Pipeline</div>
                            <div style={{ fontSize: '13px', fontWeight: 800, color: intelConfig?.is_enabled ? 'var(--lime)' : 'var(--red)' }}>{intelConfig?.is_enabled ? 'Enabled' : 'Disabled'}</div>
                          </div>
                          <button onClick={toggleIntelEnabled}
                            style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--ink3)', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                            {intelConfig?.is_enabled ? 'Disable' : 'Enable'}
                          </button>
                        </div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '24px' }}>
                        {[
                          { label: 'Auto-Published', value: intelRuns[0]?.items_auto_published ?? 0, color: 'var(--lime)' },
                          { label: 'Needs Review',   value: intelRuns[0]?.items_queued ?? 0,          color: 'var(--amber)' },
                          { label: 'Skipped',        value: intelRuns[0]?.items_skipped ?? 0,         color: 'var(--ink3)' },
                        ].map(stat => (
                          <div key={stat.label} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '16px' }}>
                            <div style={{ fontSize: '13px', color: 'var(--ink3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: '6px' }}>{stat.label}</div>
                            <div style={{ fontSize: '24px', fontWeight: 800, color: stat.color }}>{stat.value}</div>
                          </div>
                        ))}
                      </div>

                      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '16px', padding: '20px', marginBottom: '24px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                          <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--ink)' }}>Event Registry — Powers Relevance Scoring</div>
                          <span style={{ fontSize: '13px', color: 'var(--ink3)' }}>Source: {intelConfig?.event_registry_source === 'eventpilot_internal' ? 'EventPilot Internal' : 'tresconglobal.com'}</span>
                        </div>
                        <div style={{ fontSize: '13px', color: 'var(--ink3)', marginBottom: '12px' }}>
                          Last refreshed: {intelConfig?.event_registry_last_updated ? new Date(intelConfig.event_registry_last_updated).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Never'} · {intelConfig?.event_registry_data?.length ?? 0} events found
                        </div>
                        {(intelConfig?.event_registry_data?.length ?? 0) > 0 && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            {intelConfig!.event_registry_data!.map((ev, i) => (
                              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px', background: 'var(--surface)', borderRadius: '8px' }}>
                                <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink)', flex: 1 }}>{ev.name}</span>
                                {ev.status && <span style={{ fontSize: '13px', color: 'var(--ink3)' }}>{ev.status}</span>}
                                {ev.website && <a href={ev.website} target="_blank" rel="noopener noreferrer" style={{ fontSize: '13px', color: 'var(--teal-mid)', textDecoration: 'none' }}>Visit ↗</a>}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '16px', padding: '20px', marginBottom: '24px' }}>
                        <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--ink)', marginBottom: '12px' }}>Run History</div>
                        {intelRuns.length === 0 ? (
                          <div style={{ fontSize: '13px', color: 'var(--ink3)' }}>No runs yet.</div>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            {intelRuns.map(run => {
                              const isExp = expandedIntelRunId === run.id
                              return (
                                <div key={run.id}>
                                  <button onClick={() => setExpandedIntelRunId(isExp ? null : run.id)}
                                    style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px', background: 'var(--surface)', border: 'none', borderRadius: '8px', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}>
                                    <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink)' }}>{new Date(run.started_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                                    <span style={{ fontSize: '13px', color: 'var(--ink3)', textTransform: 'capitalize' }}>{run.triggered_by}</span>
                                    <span style={{ fontSize: '13px', color: 'var(--ink3)' }}>{run.sources_checked} sources</span>
                                    <span style={{ fontSize: '13px', color: 'var(--ink3)' }}>{run.urls_discovered} found</span>
                                    <span style={{ fontSize: '13px', color: 'var(--lime)' }}>{run.items_auto_published} published</span>
                                    <span style={{ fontSize: '13px', color: 'var(--amber)' }}>{run.items_queued} queued</span>
                                    <span style={{ fontSize: '13px', color: 'var(--ink3)' }}>{run.items_skipped} skipped</span>
                                    <span style={{ marginLeft: 'auto', fontSize: '13px', fontWeight: 700, padding: '2px 8px', borderRadius: '10px', color: run.status === 'completed' ? 'var(--lime)' : run.status === 'failed' ? 'var(--red)' : 'var(--ink3)', background: run.status === 'completed' ? 'rgba(61,107,0,0.1)' : run.status === 'failed' ? 'rgba(139,26,26,0.1)' : '#7E93A115' }}>{run.status}</span>
                                  </button>
                                  {isExp && run.error_message && (
                                    <div style={{ padding: '10px 12px', fontSize: '13px', color: 'var(--red)', background: 'rgba(255,107,107,0.06)', borderRadius: '8px', marginTop: '4px' }}>{run.error_message}</div>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>

                      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '16px', padding: '20px' }}>
                        <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--ink)', marginBottom: '12px' }}>Thresholds</div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
                          <div>
                            <label style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink3)', letterSpacing: '0.8px', textTransform: 'uppercase', display: 'block', marginBottom: '5px' }}>Auto-Publish Threshold</label>
                            <input type="number" min={0} max={100} value={intelThresholds.auto_publish_threshold}
                              onChange={e => setIntelThresholds(p => ({ ...p, auto_publish_threshold: Number(e.target.value) }))}
                              style={{ width: '100%', padding: '9px 12px', borderRadius: '9px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--ink)', fontSize: '13px', fontFamily: 'inherit', boxSizing: 'border-box' }} />
                            <div style={{ fontSize: '13px', color: 'var(--ink3)', marginTop: '4px' }}>Articles scoring above this are published automatically</div>
                          </div>
                          <div>
                            <label style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink3)', letterSpacing: '0.8px', textTransform: 'uppercase', display: 'block', marginBottom: '5px' }}>Review Threshold</label>
                            <input type="number" min={0} max={100} value={intelThresholds.review_threshold}
                              onChange={e => setIntelThresholds(p => ({ ...p, review_threshold: Number(e.target.value) }))}
                              style={{ width: '100%', padding: '9px 12px', borderRadius: '9px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--ink)', fontSize: '13px', fontFamily: 'inherit', boxSizing: 'border-box' }} />
                            <div style={{ fontSize: '13px', color: 'var(--ink3)', marginTop: '4px' }}>Articles scoring above this but below auto-publish appear in the Review Queue</div>
                          </div>
                        </div>
                        <button onClick={saveIntelThresholds}
                          style={{ padding: '9px 18px', borderRadius: '9px', border: 'none', background: 'var(--lime)', color: 'var(--lime-dark)', fontSize: '13px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
                          Save Changes
                        </button>
                      </div>
                    </div>
                  )}

                  {intelSubTab === 'review' && (
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--ink)', marginBottom: '16px' }}>Needs Review ({intelPendingItems.length})</div>
                      {intelPendingItems.length === 0 ? (
                        <div style={{ fontSize: '13px', color: 'var(--ink3)' }}>No items awaiting review.</div>
                      ) : (
                        intelPendingItems.map(item => renderIntelReviewCard(item))
                      )}
                    </div>
                  )}

                  {intelSubTab === 'sources' && (
                    <div>
                      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '14px 16px', marginBottom: '16px' }}>
                        <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--ink)', marginBottom: '4px' }}>Event Registry (special — not editable)</div>
                        <div style={{ fontSize: '13px', color: 'var(--ink3)' }}>tresconglobal.com/events · weekly · event_extraction</div>
                      </div>

                      {([
                        { category: 'owned_property', label: 'Owned Properties' },
                        { category: 'partner_govt',   label: 'Partner & Government' },
                        { category: 'press_media',    label: 'Press & Media' },
                      ] as { category: 'owned_property' | 'partner_govt' | 'press_media'; label: string }[]).map(section => {
                        const sectionSources = intelSources.filter(s => s.category === section.category)
                        const isCollapsed = collapsedIntelSections[section.category] ?? false
                        return (
                          <div key={section.category} style={{ marginBottom: '20px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                              <button onClick={() => setCollapsedIntelSections(p => ({ ...p, [section.category]: !isCollapsed }))}
                                style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>
                                <span style={{ fontSize: '11px', color: 'var(--ink3)', transform: isCollapsed ? 'rotate(-90deg)' : 'none', transition: 'transform 0.15s' }}>▼</span>
                                <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--ink)' }}>{section.label} ({sectionSources.length})</span>
                              </button>
                              <button onClick={() => { setEditingIntelSourceId(null); setShowIntelSourceForm(section.category); setIntelSourceForm({ name: '', url: '', query: '', crawl_behaviour: 'article_discovery', crawl_frequency: 'weekly' }); setIntelSourceMsg('') }}
                                style={{ padding: '6px 14px', borderRadius: '8px', border: '1px solid rgba(0,165,163,0.35)', background: 'rgba(0,165,163,0.08)', color: 'var(--teal)', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                                + Add {section.category === 'press_media' ? 'Search Query' : 'Source'}
                              </button>
                            </div>

                            {!isCollapsed && showIntelSourceForm === section.category && (
                              <div style={{ background: 'var(--card)', border: '1px solid rgba(0,165,163,0.25)', borderRadius: '12px', padding: '16px', marginBottom: '10px' }}>
                                <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--teal)', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.8px' }}>{editingIntelSourceId ? 'Edit Source' : 'New Source'}</div>
                                <div style={{ marginBottom: '10px' }}>
                                  <label style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink3)', letterSpacing: '0.8px', textTransform: 'uppercase', display: 'block', marginBottom: '5px' }}>Name</label>
                                  <input value={intelSourceForm.name} onChange={e => setIntelSourceForm(p => ({ ...p, name: e.target.value }))}
                                    style={{ width: '100%', padding: '9px 12px', borderRadius: '9px', border: '1px solid var(--border)', fontSize: '13px', fontFamily: 'inherit', boxSizing: 'border-box' }} />
                                </div>
                                {section.category === 'press_media' ? (
                                  <div style={{ marginBottom: '10px' }}>
                                    <label style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink3)', letterSpacing: '0.8px', textTransform: 'uppercase', display: 'block', marginBottom: '5px' }}>Search Query</label>
                                    <input value={intelSourceForm.query} onChange={e => setIntelSourceForm(p => ({ ...p, query: e.target.value }))} placeholder="e.g. Trescon site:arabianbusiness.com"
                                      style={{ width: '100%', padding: '9px 12px', borderRadius: '9px', border: '1px solid var(--border)', fontSize: '13px', fontFamily: 'inherit', boxSizing: 'border-box' }} />
                                    <div style={{ fontSize: '13px', color: 'var(--ink3)', marginTop: '4px' }}>Google search query. Use site: to restrict to a domain.</div>
                                  </div>
                                ) : (
                                  <>
                                    <div style={{ marginBottom: '10px' }}>
                                      <label style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink3)', letterSpacing: '0.8px', textTransform: 'uppercase', display: 'block', marginBottom: '5px' }}>URL</label>
                                      <input value={intelSourceForm.url} onChange={e => setIntelSourceForm(p => ({ ...p, url: e.target.value }))} placeholder="https://difc.ae/newsroom"
                                        style={{ width: '100%', padding: '9px 12px', borderRadius: '9px', border: '1px solid var(--border)', fontSize: '13px', fontFamily: 'inherit', boxSizing: 'border-box' }} />
                                    </div>
                                    <div style={{ marginBottom: '10px' }}>
                                      <label style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink3)', letterSpacing: '0.8px', textTransform: 'uppercase', display: 'block', marginBottom: '5px' }}>Crawl Behaviour</label>
                                      <div style={{ display: 'flex', gap: '14px' }}>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'var(--ink)', cursor: 'pointer' }}>
                                          <input type="radio" checked={intelSourceForm.crawl_behaviour === 'article_discovery'} onChange={() => setIntelSourceForm(p => ({ ...p, crawl_behaviour: 'article_discovery' }))} />
                                          Article Discovery
                                        </label>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'var(--ink)', cursor: 'pointer' }}>
                                          <input type="radio" checked={intelSourceForm.crawl_behaviour === 'fact_extraction'} onChange={() => setIntelSourceForm(p => ({ ...p, crawl_behaviour: 'fact_extraction' }))} />
                                          Fact Extraction
                                        </label>
                                      </div>
                                    </div>
                                  </>
                                )}
                                <div style={{ marginBottom: '10px' }}>
                                  <label style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink3)', letterSpacing: '0.8px', textTransform: 'uppercase', display: 'block', marginBottom: '5px' }}>Frequency</label>
                                  <div style={{ display: 'flex', gap: '14px' }}>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'var(--ink)', cursor: 'pointer' }}>
                                      <input type="radio" checked={intelSourceForm.crawl_frequency === 'weekly'} onChange={() => setIntelSourceForm(p => ({ ...p, crawl_frequency: 'weekly' }))} />
                                      Weekly
                                    </label>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'var(--ink)', cursor: 'pointer' }}>
                                      <input type="radio" checked={intelSourceForm.crawl_frequency === 'monthly'} onChange={() => setIntelSourceForm(p => ({ ...p, crawl_frequency: 'monthly' }))} />
                                      Monthly
                                    </label>
                                  </div>
                                </div>
                                {intelSourceMsg && <div style={{ fontSize: '13px', color: 'var(--red)', marginBottom: '10px' }}>{intelSourceMsg}</div>}
                                <div style={{ display: 'flex', gap: '8px' }}>
                                  <button onClick={saveIntelSource}
                                    style={{ padding: '9px 18px', borderRadius: '9px', border: 'none', background: 'var(--lime)', color: 'var(--lime-dark)', fontSize: '13px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
                                    Save Source
                                  </button>
                                  <button onClick={() => { setShowIntelSourceForm(false); setEditingIntelSourceId(null); setIntelSourceMsg('') }}
                                    style={{ padding: '9px 16px', borderRadius: '9px', border: '1px solid var(--ink4)', background: 'var(--card)', color: 'var(--ink3)', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            )}

                            {!isCollapsed && (sectionSources.length === 0 ? (
                              <div style={{ fontSize: '13px', color: 'var(--ink3)' }}>No sources yet.</div>
                            ) : (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                {sectionSources.map(source => (
                                  <div key={source.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '10px' }}>
                                    <button onClick={() => toggleIntelSourceActive(source)} title={source.is_active ? 'Active — click to pause' : 'Paused — click to activate'}
                                      style={{ width: '10px', height: '10px', borderRadius: '50%', border: 'none', background: source.is_active ? 'var(--lime)' : 'var(--border)', cursor: 'pointer', flexShrink: 0, padding: 0 }} />
                                    <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink)' }}>{source.name}</span>
                                    <span style={{ fontSize: '13px', color: 'var(--ink3)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{source.config.url ?? source.config.query}</span>
                                    <span style={{ fontSize: '13px', color: 'var(--ink3)', textTransform: 'capitalize' }}>{source.crawl_frequency}</span>
                                    <span style={{ fontSize: '13px', color: 'var(--ink3)' }}>Last found: {source.last_found_count}</span>
                                    <button onClick={() => startEditIntelSource(source)}
                                      style={{ fontSize: '13px', fontWeight: 700, color: 'var(--purple)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
                                      Edit
                                    </button>
                                    <button onClick={() => deleteIntelSource(source.id)}
                                      style={{ fontSize: '13px', fontWeight: 700, color: 'var(--red)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
                                      Delete
                                    </button>
                                  </div>
                                ))}
                              </div>
                            ))}
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {intelSubTab === 'items' && (
                    <div>
                      <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
                        <input value={intelItemsFilter.search} onChange={e => setIntelItemsFilter(p => ({ ...p, search: e.target.value }))}
                          onKeyDown={e => { if (e.key === 'Enter') fetchIntelItems(0) }}
                          placeholder="Search title or URL…"
                          style={{ padding: '8px 12px', borderRadius: '9px', border: '1px solid var(--border)', fontSize: '13px', fontFamily: 'inherit', minWidth: '220px' }} />
                        <select value={intelItemsFilter.status} onChange={e => setIntelItemsFilter(p => ({ ...p, status: e.target.value }))}
                          style={{ padding: '8px 12px', borderRadius: '9px', border: '1px solid var(--border)', fontSize: '13px', fontFamily: 'inherit' }}>
                          <option value="all">All Statuses</option>
                          <option value="auto_published">Auto-published</option>
                          <option value="pending">Needs review</option>
                          <option value="approved">Approved</option>
                          <option value="rejected">Rejected</option>
                          <option value="skipped">Skipped</option>
                        </select>
                        <select value={intelItemsFilter.source_id} onChange={e => setIntelItemsFilter(p => ({ ...p, source_id: e.target.value }))}
                          style={{ padding: '8px 12px', borderRadius: '9px', border: '1px solid var(--border)', fontSize: '13px', fontFamily: 'inherit' }}>
                          <option value="">All Sources</option>
                          {intelSources.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                        <button onClick={() => fetchIntelItems(0)}
                          style={{ padding: '8px 16px', borderRadius: '9px', border: 'none', background: 'var(--lime)', color: 'var(--lime-dark)', fontSize: '13px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
                          Apply
                        </button>
                      </div>

                      {intelItems.length === 0 ? (
                        <div style={{ fontSize: '13px', color: 'var(--ink3)' }}>No items match these filters.</div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          {intelItems.map(item => {
                            const isExp = expandedIntelItemId === item.id
                            const badge = scoreBadge(item.gemini_score)
                            return (
                              <div key={item.id} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '10px', padding: '12px 14px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                                  <button onClick={() => setExpandedIntelItemId(isExp ? null : item.id)}
                                    style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', flex: 1 }}>
                                    {item.title ?? item.url}
                                  </button>
                                  <span style={{ fontSize: '13px', color: 'var(--ink3)' }}>{item.kb_intel_sources?.name ?? '—'}</span>
                                  <span style={{ fontSize: '13px', color: 'var(--ink3)' }}>{new Date(item.discovered_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
                                  <span style={{ fontSize: '13px', fontWeight: 800, padding: '2px 8px', borderRadius: '10px', color: badge.color, background: badge.background }}>{item.gemini_score ?? '—'}</span>
                                  <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink3)', textTransform: 'capitalize' }}>{item.status.replace(/_/g, ' ')}</span>
                                  <a href={item.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: '13px', color: 'var(--teal-mid)', textDecoration: 'none' }}>View original ↗</a>
                                  {item.document_id && <Link href="/admin/toolkit/knowledge-base" style={{ fontSize: '13px', color: 'var(--purple)', textDecoration: 'none' }}>View in KB</Link>}
                                </div>
                                {isExp && (
                                  <div style={{ marginTop: '10px', padding: '12px', background: 'var(--surface)', borderRadius: '8px' }}>
                                    {item.gemini_reasoning && <p style={{ fontSize: '13px', color: 'var(--ink3)', fontStyle: 'italic', margin: '0 0 8px' }}>{item.gemini_reasoning}</p>}
                                    {item.gemini_summary && <div style={{ fontSize: '13px', color: 'var(--ink2)', whiteSpace: 'pre-wrap', lineHeight: 1.6, maxHeight: '260px', overflowY: 'auto' }}>{item.gemini_summary}</div>}
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )}

                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '16px' }}>
                        <button onClick={() => fetchIntelItems(Math.max(0, intelItemsPage - 1))} disabled={intelItemsPage === 0}
                          style={{ padding: '7px 14px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--ink3)', fontSize: '13px', fontWeight: 700, cursor: intelItemsPage === 0 ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
                          ← Previous
                        </button>
                        <span style={{ fontSize: '13px', color: 'var(--ink3)' }}>Page {intelItemsPage + 1} of {Math.max(1, Math.ceil(intelItemsTotal / 20))}</span>
                        <button onClick={() => fetchIntelItems(intelItemsPage + 1)} disabled={(intelItemsPage + 1) * 20 >= intelItemsTotal}
                          style={{ padding: '7px 14px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--ink3)', fontSize: '13px', fontWeight: 700, cursor: (intelItemsPage + 1) * 20 >= intelItemsTotal ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
                          Next →
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                )
              })() : docSubTab === 'gaps' ? (() => {
                const actionable = (s: GapSession) => s.gaps.filter(g => g.status === 'pending' || g.status === 'unresolved')
                return (
                  <div>
                    <p style={{ fontSize: '13px', color: 'var(--ink3)', margin: '0 0 16px', lineHeight: 1.6 }}>
                      Gaps an uploader deferred with &quot;Skip this gap&quot;, or left unresolved. Action each one using the same 3-step flow they saw at ingest.
                    </p>
                    {pendingGapsLoading && (
                      <div style={{ color: 'var(--ink3)', fontSize: '13px', padding: '40px 0', textAlign: 'center' }}>Loading…</div>
                    )}
                    {!pendingGapsLoading && pendingGapSessions.every(s => actionable(s).length === 0) && (
                      <div style={{ color: 'var(--ink3)', fontSize: '13px', padding: '40px 0', textAlign: 'center' }}>No pending gaps — every uploader has fully resolved their documents.</div>
                    )}
                    {!pendingGapsLoading && pendingGapSessions.map(session => {
                      const gaps = actionable(session)
                      if (gaps.length === 0) return null
                      const wizardActive = gapWizard?.sessionId === session.id
                      return (
                        <div key={session.id} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '16px', padding: '20px', marginBottom: '16px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
                            <span style={{ fontSize: '13px', fontWeight: 700, padding: '2px 8px', borderRadius: '16px', background: 'rgba(124,58,237,0.12)', color: 'var(--purple)' }}>
                              {typeLabel(session.processor_type)}
                            </span>
                            <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--ink)' }}>{session.documents?.title ?? session.document_id}</span>
                          </div>

                          {wizardActive ? renderGapWizard(session) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                              {gaps.map(gap => (
                                <div key={gap.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', padding: '12px 14px', background: 'var(--teal-light)', border: '1px solid rgba(0,165,163,0.15)', borderRadius: '10px' }}>
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: '13px', color: 'var(--ink)' }}>{gap.description}</div>
                                    {gap.location && <div style={{ fontSize: '13px', color: 'var(--ink3)', marginTop: '2px' }}>Location: {gap.location}</div>}
                                  </div>
                                  <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                                    <button onClick={() => startGapWizard('review', session.document_id, session.id, [gap.id])}
                                      style={{ padding: '7px 14px', borderRadius: '8px', border: 'none', background: 'var(--teal-mid)', color: 'var(--teal-light)', fontSize: '13px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
                                      Resolve ✓
                                    </button>
                                    <button onClick={() => dismissPendingGap(session, gap)}
                                      style={{ padding: '7px 14px', borderRadius: '8px', border: '1px solid rgba(255,107,107,0.3)', background: 'rgba(255,107,107,0.08)', color: 'var(--red)', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                                      Dismiss ✗
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )
                            })() : (
              <>
              {/* EMPTY STATE */}
              {!docsLoading && docs.length === 0 && (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: '32px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '14px', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                    {[
                      { n:'1', label:'Upload a document', sub:'PDF or text — policy, brief, report, anything' },
                      { n:'2', label:'AI classifies it', sub:'Decides who sees it, what it is for, confidence score' },
                      { n:'3', label:'Goes live or flagged', sub:'High confidence = auto-live. Low = you review first' },
                      { n:'4', label:'Pilot answers from it', sub:'Staff ask questions — Pilot reads docs to reply' },
                    ].map((s, i) => (
                      <div key={s.n} style={{ padding: '18px 16px', borderRight: i < 3 ? '1px solid var(--border)' : 'none' }}>
                        <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: 'var(--teal-mid)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '10px' }}>
                          <span style={{ fontSize: '11px', fontWeight: 900, color: 'var(--teal-light)' }}>{s.n}</span>
                        </div>
                        <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--ink)', marginBottom: '4px' }}>{s.label}</div>
                        <div style={{ fontSize: '13px', color: 'var(--ink3)', lineHeight: 1.4 }}>{s.sub}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ maxWidth: '520px', margin: '0 auto', textAlign: 'center' }}>
                    <button onClick={() => setShowIngestForm(true)}
                      style={{ padding: '11px 24px', borderRadius: '9px', border: 'none', background: 'var(--purple)', color: 'var(--purple-light)', fontSize: '13px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
                      Ingest Document
                    </button>
                  </div>
                </>
              )}

              {docsLoading && <div style={{ color: 'var(--ink)', fontSize: '13px', padding: '40px 0', textAlign: 'center' }}>Loading documents…</div>}

              {/* POPULATED STATE */}
              {!docsLoading && docs.length > 0 && (
                <>
                  {/* Collapsible guide */}
                  <details style={{ marginBottom: '20px' }}>
                    <summary style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink3)', cursor: 'pointer', userSelect: 'none', listStyle: 'none', display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                      <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                      How this section works
                    </summary>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', marginTop: '12px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden' }}>
                      {[
                        { n:'1', label:'Upload a document', sub:'PDF or text — policy, brief, report' },
                        { n:'2', label:'AI classifies it', sub:'Layer, department, audience, confidence' },
                        { n:'3', label:'Goes live or flagged', sub:'High confidence = auto-live, low = review' },
                        { n:'4', label:'Pilot answers from it', sub:'Staff questions answered from your docs' },
                      ].map((s, i) => (
                        <div key={s.n} style={{ padding: '12px 14px', borderRight: i < 3 ? '1px solid var(--border)' : 'none' }}>
                          <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: 'var(--teal-mid)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '7px' }}>
                            <span style={{ fontSize: '9px', fontWeight: 900, color: 'var(--teal-light)' }}>{s.n}</span>
                          </div>
                          <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--ink)', marginBottom: '2px' }}>{s.label}</div>
                          <div style={{ fontSize: '13px', color: 'var(--ink3)', lineHeight: 1.4 }}>{s.sub}</div>
                        </div>
                      ))}
                    </div>
                  </details>

                  {/* Category filter pills */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px', flexWrap: 'wrap' }}>
                    {([
                      { key:'all',                    label:`All (${categoryCount('all')})` },
                      { key:'event_intelligence',     label:`Event Intelligence (${categoryCount('event_intelligence')})` },
                      { key:'business_development',   label:`Business Development (${categoryCount('business_development')})` },
                      { key:'project_management',     label:`Project Management (${categoryCount('project_management')})` },
                      { key:'marketing',               label:`Marketing (${categoryCount('marketing')})` },
                      { key:'company_knowledge',       label:`Company Knowledge (${categoryCount('company_knowledge')})` },
                      { key:'external',                label:`External (${categoryCount('external')})` },
                    ] as {key:typeof docCategoryFilter;label:string}[]).map(f => (
                      <button key={f.key} onClick={() => setDocCategoryFilter(f.key)}
                        style={{ padding: '6px 14px', borderRadius: '16px', border: `1px solid ${docCategoryFilter === f.key ? 'rgba(0,165,163,0.4)' : 'var(--border)'}`, background: docCategoryFilter === f.key ? 'rgba(0,165,163,0.08)' : 'transparent', color: docCategoryFilter === f.key ? 'var(--teal)' : 'var(--ink3)', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                        {f.label}
                      </button>
                    ))}
                  </div>

                  {/* Filter pills + count */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
                    {([
                      { key:'all',           label:`All (${docs.length})` },
                      { key:'knowledge_base',label:`Knowledge Base (${docs.filter(d=>d.layer==='knowledge_base').length})` },
                      { key:'general',       label:`General (${docs.filter(d=>d.layer==='general').length})` },
                      { key:'specific',      label:`Specific (${docs.filter(d=>d.layer==='specific').length})` },
                      ...(flaggedCount > 0 ? [{ key:'flagged', label:`Flagged (${flaggedCount})` }] : []),
                    ] as {key:string;label:string}[]).map(f => (
                      <button key={f.key} onClick={() => setDocFilter(f.key as typeof docFilter)}
                        style={{ padding: '6px 14px', borderRadius: '16px', border: `1px solid ${docFilter === f.key ? (f.key === 'flagged' ? 'rgba(139,26,26,0.5)' : 'rgba(192,244,60,0.4)') : 'var(--border)'}`, background: docFilter === f.key ? (f.key === 'flagged' ? 'rgba(139,26,26,0.1)' : 'rgba(192,244,60,0.08)') : 'transparent', color: docFilter === f.key ? (f.key === 'flagged' ? 'var(--red)' : 'var(--lime)') : 'var(--ink3)', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                        {f.label}
                      </button>
                    ))}
                  </div>

                  {/* Document grid */}
                  {filteredDocs.length === 0 ? (
                    <div style={{ padding: '40px', textAlign: 'center', color: 'var(--ink)', fontSize: '13px' }}>No documents match this filter.</div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px' }}>
                      {filteredDocs.map(doc => {
                        const tc   = TYPE_COLOR[doc.type] ?? '#7E93A1'
                        const lCfg = LAYER_CFG[doc.layer] ?? { label: doc.layer, color: 'var(--ink)', bg: 'var(--border)' }
                        return (
                          <div key={doc.id} style={{ background: 'var(--card)', border: `1px solid ${doc.flagged ? 'rgba(139,26,26,0.25)' : 'var(--border)'}`, borderRadius: '14px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                            {/* Top colour strip */}
                            <div style={{ height: '3px', background: tc, opacity: 0.8 }} />
                            <div style={{ padding: '16px', flex: 1, display: 'flex', flexDirection: 'column', gap: '10px' }}>
                              {/* Badges row */}
                              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                <span style={{ fontSize: '13px', fontWeight: 700, padding: '2px 8px', borderRadius: '16px', background: `${tc}18`, color: tc, border: `1px solid ${tc}35` }}>
                                  {typeLabel(doc.type)}
                                </span>
                                <span style={{ fontSize: '13px', fontWeight: 700, padding: '2px 8px', borderRadius: '16px', background: lCfg.bg, color: lCfg.color }}>
                                  {lCfg.label}
                                </span>
                                {doc.flagged && (
                                  <span style={{ fontSize: '13px', fontWeight: 700, padding: '2px 8px', borderRadius: '16px', background: 'rgba(139,26,26,0.12)', color: 'var(--red)' }}>Flagged</span>
                                )}
                                {doc.version > 1 && (
                                  <button onClick={() => openVersionHistory(doc.document_group_id ?? doc.id)}
                                    style={{ fontSize: '13px', fontWeight: 700, padding: '2px 8px', borderRadius: '16px', background: 'rgba(96,165,250,0.12)', color: 'var(--info)', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
                                    v{doc.version} · History
                                  </button>
                                )}
                              </div>

                              {/* Title */}
                              <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--ink)', lineHeight: 1.4 }}>{doc.title}</div>

                              {/* Source link + workspace tag */}
                              {(doc.source_url || doc.workspace_id) && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                                  {kbDownloadHref(doc.source_url, doc.id) && (
                                    <a href={kbDownloadHref(doc.source_url, doc.id)!} target="_blank" rel="noopener noreferrer"
                                      style={{ fontSize: '13px', fontWeight: 700, color: 'var(--teal-mid)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                      <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                                      Download original
                                    </a>
                                  )}
                                  {doc.workspace_id && (
                                    <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink3)' }}>
                                      {workspaces.find(w => w.id === doc.workspace_id)?.name ?? 'BD Workspace'}
                                    </span>
                                  )}
                                </div>
                              )}

                              {/* Department + level (if specific) */}
                              {doc.layer === 'specific' && (
                                <div style={{ fontSize: '13px', color: 'var(--ink)', display: 'flex', gap: '8px' }}>
                                  <span>{doc.department}</span>
                                  <span style={{ color: 'var(--ink3)' }}>·</span>
                                  <span>{doc.min_level}</span>
                                </div>
                              )}

                              {/* Pilot indicator + confidence */}
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                  <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: doc.pilot_use ? 'var(--lime)' : 'var(--border)', flexShrink: 0 }} />
                                  <span style={{ fontSize: '13px', fontWeight: 600, color: doc.pilot_use ? 'var(--lime)' : 'var(--ink3)' }}>
                                    {doc.pilot_use ? 'Used by Pilot' : 'Not indexed'}
                                  </span>
                                </div>
                                <span style={{ fontSize: '13px', fontWeight: 700, color: doc.confidence >= 75 ? 'var(--ink)' : 'var(--red)' }}>
                                  {doc.confidence}% AI confidence
                                </span>
                              </div>

                              {/* Footer: word count + date + actions */}
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto', paddingTop: '8px', borderTop: '1px solid var(--border)' }}>
                                <span style={{ fontSize: '13px', color: 'var(--ink)' }}>
                                  {doc.word_count?.toLocaleString()} words · {new Date(doc.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                                </span>
                                <div style={{ display: 'flex', gap: '10px' }}>
                                  <button onClick={() => { setSupersedesDoc(doc); setDocForm(p => ({ ...p, title: doc.title, type: doc.type, workspace_id: doc.workspace_id ?? '', doc_category: doc.doc_category ?? '' })); setIngestIntent('verbatim'); setShowIngestForm(true); window.scrollTo({ top: 0, behavior: 'smooth' }) }}
                                    style={{ fontSize: '13px', fontWeight: 700, color: 'var(--teal-mid)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: '2px 4px' }}>
                                    New Version
                                  </button>
                                  <button onClick={() => setDeletingDoc(doc)}
                                    style={{ fontSize: '13px', fontWeight: 700, color: 'rgba(255,107,107,0.6)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: '2px 4px' }}>
                                    Remove
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </>
              )}
              </>
              )}

              {/* Version history modal */}
              {versionModalGroupId && (
                <div onClick={() => setVersionModalGroupId(null)}
                  style={{ position: 'fixed', inset: 0, background: 'rgba(15,25,35,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
                  <div onClick={e => e.stopPropagation()}
                    style={{ background: 'var(--card)', borderRadius: '16px', padding: '24px', width: '520px', maxWidth: '90vw', maxHeight: '80vh', overflowY: 'auto' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                      <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--ink)' }}>Version History</div>
                      <button onClick={() => setVersionModalGroupId(null)}
                        style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink3)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>Close</button>
                    </div>
                    {versionHistoryLoading ? (
                      <div style={{ fontSize: '13px', color: 'var(--ink3)', padding: '20px 0', textAlign: 'center' }}>Loading…</div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {versionHistory.map(v => {
                          const uploader = Array.isArray(v.staff_members) ? v.staff_members[0] : v.staff_members
                          const isCurrent = !v.superseded_by
                          return (
                            <div key={v.id} style={{ padding: '12px 14px', background: isCurrent ? 'rgba(192,244,60,0.06)' : 'var(--surface)', border: `1px solid ${isCurrent ? 'rgba(192,244,60,0.25)' : 'var(--border)'}`, borderRadius: '10px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                                <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--ink)' }}>v{v.version}</span>
                                {isCurrent && <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--lime)', background: 'rgba(192,244,60,0.15)', padding: '1px 8px', borderRadius: '10px' }}>Current</span>}
                                <span style={{ fontSize: '13px', color: 'var(--ink3)', marginLeft: 'auto' }}>{new Date(v.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                              </div>
                              {v.version_note && <div style={{ fontSize: '13px', color: 'var(--ink)', marginBottom: '4px' }}>{v.version_note}</div>}
                              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                {uploader?.name && <span style={{ fontSize: '13px', color: 'var(--ink3)' }}>Uploaded by {uploader.name}</span>}
                                {kbDownloadHref(v.source_url, v.id) && <a href={kbDownloadHref(v.source_url, v.id)!} target="_blank" rel="noopener noreferrer" style={{ fontSize: '13px', fontWeight: 700, color: 'var(--teal-mid)', textDecoration: 'none' }}>Download</a>}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {deletingDoc && (
                <div onClick={() => { setDeletingDoc(null); setDeleteConfirmText('') }}
                  style={{ position: 'fixed', inset: 0, background: 'rgba(15,25,35,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '20px' }}>
                  <div onClick={e => e.stopPropagation()}
                    style={{ background: 'var(--card)', borderRadius: '16px', padding: '28px', maxWidth: '440px', width: '100%' }}>
                    <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--ink)', marginBottom: '10px' }}>Remove this document?</div>
                    <div style={{ fontSize: '13px', color: 'var(--ink3)', lineHeight: 1.6, marginBottom: '16px' }}>
                      This removes <strong>&ldquo;{deletingDoc.title}&rdquo;</strong> from the Knowledge Base — it will no longer be visible to staff or Pilot. Type <strong>DELETE</strong> below to confirm.
                    </div>
                    <input
                      value={deleteConfirmText}
                      onChange={e => setDeleteConfirmText(e.target.value)}
                      placeholder="Type DELETE to confirm"
                      style={{ width: '100%', padding: '10px 12px', borderRadius: '9px', border: '1px solid var(--border)', fontSize: '13px', fontFamily: 'inherit', boxSizing: 'border-box', marginBottom: '16px' }}
                      autoFocus
                    />
                    <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                      <button onClick={() => { setDeletingDoc(null); setDeleteConfirmText('') }}
                        style={{ padding: '10px 16px', borderRadius: '9px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--ink3)', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                        Cancel
                      </button>
                      <button onClick={confirmDeleteDoc} disabled={deleteConfirmText !== 'DELETE' || deleting}
                        style={{ padding: '10px 16px', borderRadius: '9px', border: 'none', background: 'var(--red)', color: 'var(--red-light)', opacity: deleteConfirmText !== 'DELETE' || deleting ? 0.5 : 1, fontSize: '13px', fontWeight: 800, cursor: deleteConfirmText !== 'DELETE' || deleting ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
                        {deleting ? 'Removing…' : 'Remove permanently'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
              </div>

              <style>{`
                @keyframes ingestBarSlide { 0% { left: -40%; } 100% { left: 100%; } }
                @keyframes tourPop { 0% { opacity: 0; transform: scale(0.95) translateY(6px); } 100% { opacity: 1; transform: scale(1) translateY(0); } }
              `}</style>
            </div>
          )
}
