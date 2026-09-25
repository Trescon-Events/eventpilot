'use client'

import { useEffect, useRef, useState } from 'react'
import { Card, Button, Badge } from '@/app/components/ui'
import DeleteSensitiveDocumentModal from './DeleteSensitiveDocumentModal'
import SensitiveDocViewer from '@/app/components/SensitiveDocViewer'

/* Passport / National ID storage — isolated from the general speaker
   record (see app/lib/events/sensitive-storage.ts's doc comment for the
   full design: private bucket, signed URLs, retention + permanent audit
   trail). Gated on the caller side by sae.sensitive_documents.view/.manage
   — this component itself trusts `canManage` and only ever talks to
   routes that re-check the permission server-side. */

type DocType = 'passport' | 'national_id'

type ActiveDoc = {
  id: string
  document_type: DocType
  file_name: string
  file_size: number | null
  uploaded_at: string
  retention_expires_at: string
  reviewed_at: string | null
  reviewed_by_name: string | null
}

type HistoryDoc = {
  id: string
  document_type: DocType
  file_name: string
  uploaded_at: string
  deleted_at: string
  deleted_by: string | null
  deleted_by_name: string | null
  notified_at: string | null
}

const DOC_LABELS: Record<DocType, string> = { passport: 'Passport', national_id: 'National ID' }
const ACCEPT = 'application/pdf,image/jpeg,image/png,image/webp'

function fmtDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function fmtSize(bytes: number | null) {
  if (!bytes) return ''
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function SensitiveDocumentsTab({
  speakerId, canManage, isUaeResident, canEditUaeResident, onUaeResidentChange,
}: {
  speakerId: string
  canManage: boolean
  // UAE Resident (2026-09-08, per Madhu) — mirrors the HubSpot onboarding
  // form's own rule: UAE residents must provide BOTH Passport and National
  // ID; everyone else only needs Passport, and the Status Board shows
  // National ID as Not Applicable for them. null = not yet determined —
  // every speaker confirmed before this flag existed predates the form
  // asking, so producers backfill it here by hand, one speaker at a time.
  isUaeResident: boolean | null
  canEditUaeResident: boolean
  onUaeResidentChange: (value: boolean | null) => Promise<boolean>
}) {
  const [documents, setDocuments] = useState<ActiveDoc[]>([])
  const [history, setHistory] = useState<HistoryDoc[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [uploadingType, setUploadingType] = useState<DocType | null>(null)
  const [showHistory, setShowHistory] = useState(false)
  const [savingUaeResident, setSavingUaeResident] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<ActiveDoc | null>(null)
  const [viewing, setViewing] = useState<{ docId: string; title: string } | null>(null)
  const [deleting, setDeleting] = useState(false)
  const fileInputs = { passport: useRef<HTMLInputElement>(null), national_id: useRef<HTMLInputElement>(null) }

  const setUaeResident = async (value: boolean | null) => {
    setSavingUaeResident(true)
    setError(null)
    const ok = await onUaeResidentChange(value)
    if (!ok) setError('Could not save UAE Resident status — please try again.')
    setSavingUaeResident(false)
  }

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/events/stakeholders/speakers/${speakerId}/sensitive-documents`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load documents')
      setDocuments(data.documents ?? [])
      setHistory(data.history ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load documents')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch-on-mount, matches this app's other top-level fetchAll effects
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refetch only when the speaker itself changes, not on every render
  }, [speakerId])

  const onFilePicked = async (documentType: DocType, file: File) => {
    setError(null)
    setUploadingType(documentType)
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('document_type', documentType)
      const res = await fetch(`/api/events/stakeholders/speakers/${speakerId}/sensitive-documents`, { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Upload failed')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setUploadingType(null)
    }
  }

  const onDelete = async (docId: string) => {
    setError(null)
    setDeleting(true)
    try {
      const res = await fetch(`/api/events/stakeholders/speakers/${speakerId}/sensitive-documents/${docId}`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Delete failed')
      setDeleteTarget(null)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed')
    } finally {
      setDeleting(false)
    }
  }

  // Review (2026-09-24) — the Status Board's Passport/National ID columns
  // need a real "a producer has actually checked this" signal, distinct
  // from just being uploaded, before counting a document as done (per
  // Madhu: only a reviewed document is available for further processing,
  // e.g. an Operations team's future badge/visa workflow).
  const [reviewingId, setReviewingId] = useState<string | null>(null)
  const toggleReview = async (docId: string, reviewed: boolean) => {
    setError(null)
    setReviewingId(docId)
    try {
      const res = await fetch(`/api/events/stakeholders/speakers/${speakerId}/sensitive-documents/${docId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reviewed }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Could not update review status')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update review status')
    } finally {
      setReviewingId(null)
    }
  }

  const docByType = (t: DocType) => documents.find(d => d.document_type === t)

  return (
    <div style={{ maxWidth: '1240px', margin: '0 auto', padding: '24px 32px' }}>
      <div style={{ display: 'grid', gap: '20px', maxWidth: '760px' }}>
        {error && (
          <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'var(--red-light)', border: '1px solid var(--red-border)', color: 'var(--red)', fontSize: '14.5px' }}>
            {error} <button onClick={() => setError(null)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontWeight: 700, marginLeft: '8px' }}>×</button>
          </div>
        )}

        <Card padded color="amber">
          <div style={{ fontSize: '13px', color: 'var(--ink)', lineHeight: 1.6 }}>
            🔒 <strong>Sensitive Documents</strong> — kept separate from the speaker&apos;s public record. Never shown on the event website or in any speaker email. Automatically and permanently deleted a set number of days after the event ends (the speaker is notified when that happens), with an audit record kept of the deletion itself even after the file is gone.
          </div>
        </Card>

        <Card padded>
          <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--ink)' }}>UAE Resident?</div>
          <div style={{ fontSize: '12.5px', color: 'var(--ink3)', marginTop: '4px', marginBottom: '12px' }}>
            Determines what&apos;s actually required below — a UAE resident needs both Passport and National ID; everyone else only needs Passport. Not yet asked on the onboarding form for anyone confirmed before it existed, so this is set by hand.
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {([
              { value: true, label: 'UAE Resident' },
              { value: false, label: 'Not a UAE Resident' },
              { value: null, label: 'Not determined yet' },
            ] as const).map(opt => (
              <Button
                key={String(opt.value)}
                variant={isUaeResident === opt.value ? 'teal' : 'ghost'}
                onClick={() => setUaeResident(opt.value)}
                disabled={!canEditUaeResident || savingUaeResident}
              >
                {opt.label}
              </Button>
            ))}
          </div>
        </Card>

        {loading ? (
          <div style={{ fontSize: '13px', color: 'var(--ink4)' }}>Loading…</div>
        ) : (
          (['passport', 'national_id'] as DocType[]).map(type => {
            const doc = docByType(type)
            // National ID only matters for a UAE resident (see the card
            // above) — isUaeResident === false is the only case that
            // excuses it; still not on file for an undetermined residency
            // reads as ordinary "Missing," same as before this flag
            // existed, since it might still turn out to be required.
            const notApplicable = type === 'national_id' && isUaeResident === false && !doc
            const reviewed = !!doc?.reviewed_at
            const badgeLabel = !doc ? (notApplicable ? 'Not Applicable' : 'Missing') : reviewed ? 'Reviewed' : 'On file — not reviewed'
            const badgeColor = !doc ? (notApplicable ? 'grey' : 'amber') : reviewed ? 'teal' : 'amber'
            return (
              <Card key={type} padded color={reviewed ? 'teal' : undefined}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--ink)' }}>{DOC_LABELS[type]}</div>
                    {doc ? (
                      <>
                        <div style={{ fontSize: '13px', color: 'var(--ink3)', marginTop: '4px' }}>
                          {doc.file_name} {doc.file_size ? `· ${fmtSize(doc.file_size)}` : ''}
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--ink4)', marginTop: '4px' }}>
                          Uploaded {fmtDate(doc.uploaded_at)} · auto-deletes {fmtDate(doc.retention_expires_at)}
                        </div>
                        {reviewed && (
                          <div style={{ fontSize: '12px', color: 'var(--teal-mid)', marginTop: '4px', fontWeight: 700 }}>
                            ✓ Reviewed {fmtDate(doc.reviewed_at)}{doc.reviewed_by_name ? ` by ${doc.reviewed_by_name}` : ''}
                          </div>
                        )}
                      </>
                    ) : (
                      <div style={{ fontSize: '13px', color: 'var(--ink4)', marginTop: '4px' }}>
                        {notApplicable ? 'Not required — not a UAE resident' : 'Not on file'}
                      </div>
                    )}
                  </div>
                  <Badge color={badgeColor}>{badgeLabel}</Badge>
                </div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '14px' }}>
                  {doc && (
                    <Button variant="ghost" onClick={() => setViewing({ docId: doc.id, title: DOC_LABELS[type] })}>View</Button>
                  )}
                  {canManage && (
                    <>
                      <Button variant="ghost" onClick={() => fileInputs[type].current?.click()} disabled={uploadingType === type}>
                        {uploadingType === type ? 'Uploading…' : doc ? 'Replace' : 'Upload'}
                      </Button>
                      <input ref={fileInputs[type]} type="file" accept={ACCEPT} style={{ display: 'none' }}
                        onChange={e => { const f = e.target.files?.[0]; if (f) onFilePicked(type, f); e.target.value = '' }} />
                      {doc && !reviewed && (
                        <Button variant="teal" onClick={() => toggleReview(doc.id, true)} disabled={reviewingId === doc.id}>
                          {reviewingId === doc.id ? 'Saving…' : 'Mark as Reviewed'}
                        </Button>
                      )}
                      {doc && reviewed && (
                        <Button variant="ghost" onClick={() => toggleReview(doc.id, false)} disabled={reviewingId === doc.id}>
                          {reviewingId === doc.id ? 'Saving…' : 'Unmark Reviewed'}
                        </Button>
                      )}
                      {doc && (
                        <Button variant="red" onClick={() => setDeleteTarget(doc)}>Delete</Button>
                      )}
                    </>
                  )}
                </div>
              </Card>
            )
          })
        )}

        {history.length > 0 && (
          <div>
            <button onClick={() => setShowHistory(s => !s)}
              style={{ background: 'none', border: 'none', color: 'var(--ink3)', fontSize: '12.5px', fontWeight: 700, cursor: 'pointer', padding: 0 }}>
              {showHistory ? '▾' : '▸'} Deletion history ({history.length})
            </button>
            {showHistory && (
              <div style={{ marginTop: '10px', display: 'grid', gap: '8px' }}>
                {history.map(h => (
                  <div key={h.id} style={{ fontSize: '12.5px', color: 'var(--ink3)', padding: '8px 12px', background: 'var(--surface2)', borderRadius: '8px' }}>
                    <strong>{DOC_LABELS[h.document_type]}</strong> ({h.file_name}) — deleted {fmtDate(h.deleted_at)}
                    {' '}by {
                      h.deleted_by === 'system_auto_purge' ? 'automatic retention purge'
                      : h.deleted_by === 'unknown' ? 'an admin'
                      : h.deleted_by_name ?? 'a staff member (no longer in the system)'
                    }
                    {h.notified_at ? ' · speaker notified' : ''}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {viewing && <SensitiveDocViewer docId={viewing.docId} title={viewing.title} onClose={() => setViewing(null)} />}
      {deleteTarget && (
        <DeleteSensitiveDocumentModal
          docLabel={DOC_LABELS[deleteTarget.document_type]}
          fileName={deleteTarget.file_name}
          deleting={deleting}
          onConfirm={() => onDelete(deleteTarget.id)}
          onClose={() => setDeleteTarget(null)}
        />
      )}
    </div>
  )
}
