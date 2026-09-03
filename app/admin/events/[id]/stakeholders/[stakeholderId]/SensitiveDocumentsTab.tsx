'use client'

import { useEffect, useRef, useState } from 'react'
import { Card, Button, Badge } from '@/app/components/ui'

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
  signed_url: string | null
}

type HistoryDoc = {
  id: string
  document_type: DocType
  file_name: string
  uploaded_at: string
  deleted_at: string
  deleted_by: string | null
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

export default function SensitiveDocumentsTab({ speakerId, canManage }: { speakerId: string; canManage: boolean }) {
  const [documents, setDocuments] = useState<ActiveDoc[]>([])
  const [history, setHistory] = useState<HistoryDoc[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [uploadingType, setUploadingType] = useState<DocType | null>(null)
  const [showHistory, setShowHistory] = useState(false)
  const fileInputs = { passport: useRef<HTMLInputElement>(null), national_id: useRef<HTMLInputElement>(null) }

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
    try {
      const res = await fetch(`/api/events/stakeholders/speakers/${speakerId}/sensitive-documents/${docId}`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Delete failed')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed')
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

        {loading ? (
          <div style={{ fontSize: '13px', color: 'var(--ink4)' }}>Loading…</div>
        ) : (
          (['passport', 'national_id'] as DocType[]).map(type => {
            const doc = docByType(type)
            return (
              <Card key={type} padded color={doc ? 'teal' : undefined}>
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
                      </>
                    ) : (
                      <div style={{ fontSize: '13px', color: 'var(--ink4)', marginTop: '4px' }}>Not on file</div>
                    )}
                  </div>
                  <Badge color={doc ? 'teal' : 'grey'}>{doc ? 'On file' : 'Missing'}</Badge>
                </div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '14px' }}>
                  {doc?.signed_url && (
                    <a href={doc.signed_url} target="_blank" rel="noopener noreferrer">
                      <Button variant="ghost">View</Button>
                    </a>
                  )}
                  {canManage && (
                    <>
                      <Button variant="ghost" onClick={() => fileInputs[type].current?.click()} disabled={uploadingType === type}>
                        {uploadingType === type ? 'Uploading…' : doc ? 'Replace' : 'Upload'}
                      </Button>
                      <input ref={fileInputs[type]} type="file" accept={ACCEPT} style={{ display: 'none' }}
                        onChange={e => { const f = e.target.files?.[0]; if (f) onFilePicked(type, f); e.target.value = '' }} />
                      {doc && (
                        <Button variant="red" onClick={() => onDelete(doc.id)}>Delete</Button>
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
                    {' '}by {h.deleted_by === 'system_auto_purge' ? 'automatic retention purge' : 'staff'}
                    {h.notified_at ? ' · speaker notified' : ''}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
