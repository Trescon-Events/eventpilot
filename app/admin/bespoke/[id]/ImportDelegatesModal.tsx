'use client'
/**
 * Bulk Delegate Import Modal — Nic PRD 16 Jul 2026
 *
 * Client-side flow:
 *   1. User picks a CSV or XLSX file
 *   2. We parse it in the browser (xlsx handles both)
 *   3. User maps source columns → delegate fields (dropdowns per column)
 *   4. User confirms → POST mapped rows to /api/bespoke/delegates/import
 *   5. Show result (imported / skipped duplicates / errors)
 *
 * Deliberately does NOT change the tab's existing styling — inserts inline
 * inside the same card language (bg #FFFFFF, radius 12, border #DDE8EE)
 * per Nic's "functional changes only" rule.
 */
import { useCallback, useRef, useState } from 'react'
import * as XLSX from 'xlsx'

type ImportResult = {
  imported: number
  skipped_duplicates: number
  skipped_no_name: number
  errors: string[]
  duplicate_emails: string[]
}

// Fields on bespoke_delegates that we can import into. "ignore" means the
// column is not imported.
const TARGET_FIELDS = [
  { key: 'ignore',       label: '— Ignore this column —' },
  { key: 'name',         label: 'Name *' },
  { key: 'company',      label: 'Company' },
  { key: 'title',        label: 'Title / Role' },
  { key: 'industry',     label: 'Industry' },
  { key: 'email',        label: 'Email' },
  { key: 'phone',        label: 'Phone' },
  { key: 'linkedin_url', label: 'LinkedIn URL' },
  { key: 'notes',        label: 'Notes' },
  { key: 'source',       label: 'Source (client_wishlist/internal_db/linkedin/referral/marketing/other)' },
  { key: 'priority',     label: 'Priority (nice_to_have/important/must_have)' },
  { key: 'stage',        label: 'Stage (sourced/contacted/interested/registered/confirmed/attended)' },
] as const

type TargetField = typeof TARGET_FIELDS[number]['key']

interface Props {
  projectId: string
  onImportComplete: (result: ImportResult) => void
  onClose: () => void
}

// Best-guess an auto-mapping from a header name
function guessField(header: string): TargetField {
  const h = header.toLowerCase().trim()
  if (/^(name|full[\s_-]*name|delegate[\s_-]*name|contact[\s_-]*name)$/.test(h)) return 'name'
  if (/^(company|organi[sz]ation|firm|employer|account)$/.test(h)) return 'company'
  if (/^(title|job[\s_-]*title|position|role|designation)$/.test(h)) return 'title'
  if (/^(industry|sector|vertical)$/.test(h)) return 'industry'
  if (/^(email|e-?mail|email[\s_-]*address)$/.test(h)) return 'email'
  if (/^(phone|mobile|contact[\s_-]*number|tel)$/.test(h)) return 'phone'
  if (/(linkedin)/.test(h)) return 'linkedin_url'
  if (/^(notes?|remarks?|comments?)$/.test(h)) return 'notes'
  if (/^(source|origin)$/.test(h)) return 'source'
  if (/^(priority|importance)$/.test(h)) return 'priority'
  if (/^(stage|status)$/.test(h)) return 'stage'
  return 'ignore'
}

export function ImportDelegatesModal({ projectId, onImportComplete, onClose }: Props) {
  const [file, setFile] = useState<File | null>(null)
  const [headers, setHeaders] = useState<string[]>([])
  const [rows, setRows] = useState<Record<string, unknown>[]>([])
  const [mapping, setMapping] = useState<Record<string, TargetField>>({})
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const parseFile = useCallback(async (f: File) => {
    setError(null)
    try {
      const buf = await f.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array' })
      const firstSheet = wb.SheetNames[0]
      if (!firstSheet) throw new Error('No sheet found in file')
      const ws = wb.Sheets[firstSheet]
      const parsed = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: null, raw: false })
      if (parsed.length === 0) throw new Error('No data rows found in file')

      const hdrs = Object.keys(parsed[0])
      if (hdrs.length === 0) throw new Error('No column headers found')

      // Auto-guess mapping
      const guessed: Record<string, TargetField> = {}
      hdrs.forEach(h => { guessed[h] = guessField(h) })

      setHeaders(hdrs)
      setRows(parsed)
      setMapping(guessed)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to parse file'
      setError(msg)
      setHeaders([])
      setRows([])
    }
  }, [])

  const onFilePick = (f: File | null) => {
    setFile(f)
    setResult(null)
    if (f) void parseFile(f)
  }

  const canImport = headers.length > 0 && Object.values(mapping).some(v => v === 'name')

  const doImport = async () => {
    if (!canImport) return
    setImporting(true)
    setError(null)

    // Build the mapped rows
    const mappedRows = rows.map(r => {
      const out: Record<string, unknown> = {}
      for (const [hdr, target] of Object.entries(mapping)) {
        if (target === 'ignore') continue
        out[target] = r[hdr]
      }
      return out
    })

    try {
      const res = await fetch('/api/bespoke/delegates/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: projectId, rows: mappedRows }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data?.error ?? 'Import failed')
      } else {
        setResult(data as ImportResult)
        onImportComplete(data as ImportResult)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error')
    } finally {
      setImporting(false)
    }
  }

  const previewRows = rows.slice(0, 5)

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed', inset: 0, background: 'rgba(15, 25, 35, 0.55)', display: 'flex',
        alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '20px',
      }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#FFFFFF', borderRadius: '12px', border: '1px solid #DDE8EE',
          width: '100%', maxWidth: '860px', maxHeight: '90vh', overflow: 'auto',
          fontFamily: 'var(--font-manrope)',
        }}
      >
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #DDE8EE', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 800, color: '#0F1923' }}>Import Delegates from Spreadsheet</h3>
          <button
            onClick={onClose}
            style={{
              padding: '4px 10px', borderRadius: '6px', border: '1px solid #DDE8EE', background: '#FFFFFF',
              fontSize: '13px', fontWeight: 600, color: '#5B7080', cursor: 'pointer', fontFamily: 'var(--font-manrope)',
            }}
          >
            Close
          </button>
        </div>

        <div style={{ padding: '20px 24px' }}>
          {/* Step 1: file picker */}
          <div style={{ marginBottom: '20px' }}>
            <div style={{ fontSize: '12px', fontWeight: 700, color: '#B45309', letterSpacing: '1px', marginBottom: '6px' }}>STEP 1</div>
            <div style={{ fontSize: '14px', fontWeight: 700, color: '#0F1923', marginBottom: '10px' }}>Pick a CSV or XLSX file</div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
              onChange={e => onFilePick(e.target.files?.[0] ?? null)}
              style={{ fontSize: '13px', fontFamily: 'var(--font-manrope)' }}
            />
            {file && (
              <div style={{ fontSize: '12px', color: '#5B7080', marginTop: '6px' }}>
                {file.name} · {rows.length} row{rows.length === 1 ? '' : 's'} parsed
              </div>
            )}
            {error && (
              <div style={{ marginTop: '10px', padding: '10px 14px', background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: '8px', fontSize: '13px', color: '#B91C1C' }}>
                {error}
              </div>
            )}
          </div>

          {/* Step 2: mapping */}
          {headers.length > 0 && !result && (
            <>
              <div style={{ marginBottom: '20px' }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#B45309', letterSpacing: '1px', marginBottom: '6px' }}>STEP 2</div>
                <div style={{ fontSize: '14px', fontWeight: 700, color: '#0F1923', marginBottom: '10px' }}>Map columns to delegate fields</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  {headers.map(h => (
                    <div key={h} style={{ display: 'flex', flexDirection: 'column', gap: '4px', padding: '10px 12px', border: '1px solid #DDE8EE', borderRadius: '8px', background: '#F8FAFC' }}>
                      <div style={{ fontSize: '11px', fontWeight: 700, color: '#5B7080', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Source column</div>
                      <div style={{ fontSize: '13px', fontWeight: 700, color: '#0F1923', marginBottom: '4px' }}>{h}</div>
                      <select
                        value={mapping[h] ?? 'ignore'}
                        onChange={e => setMapping(m => ({ ...m, [h]: e.target.value as TargetField }))}
                        style={{
                          padding: '6px 8px', borderRadius: '6px', border: '1px solid #DDE8EE', fontSize: '12px',
                          fontFamily: 'var(--font-manrope)', background: '#FFFFFF', cursor: 'pointer',
                        }}
                      >
                        {TARGET_FIELDS.map(t => (
                          <option key={t.key} value={t.key}>{t.label}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
                {!Object.values(mapping).some(v => v === 'name') && (
                  <div style={{ marginTop: '10px', padding: '8px 12px', background: '#FEF3C7', border: '1px solid #FCD34D', borderRadius: '6px', fontSize: '12px', color: '#92400E' }}>
                    You must map at least one column to <strong>Name</strong> before importing.
                  </div>
                )}
              </div>

              {/* Step 3: preview */}
              <div style={{ marginBottom: '20px' }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#B45309', letterSpacing: '1px', marginBottom: '6px' }}>STEP 3</div>
                <div style={{ fontSize: '14px', fontWeight: 700, color: '#0F1923', marginBottom: '10px' }}>Preview (first {previewRows.length} of {rows.length})</div>
                <div style={{ overflow: 'auto', border: '1px solid #DDE8EE', borderRadius: '8px' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                    <thead style={{ background: '#F8FAFC' }}>
                      <tr>
                        {headers.map(h => (
                          <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 700, color: '#5B7080', borderBottom: '1px solid #DDE8EE', whiteSpace: 'nowrap' }}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {previewRows.map((r, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid #F0F4F8' }}>
                          {headers.map(h => (
                            <td key={h} style={{ padding: '8px 10px', color: '#2D3E50', whiteSpace: 'nowrap', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {r[h] === null || r[h] === undefined ? '' : String(r[h])}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div style={{ marginTop: '8px', fontSize: '12px', color: '#5B7080' }}>
                  Rows with the same email as an existing delegate on this project will be skipped. Rows without a Name will be skipped.
                </div>
              </div>

              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', paddingTop: '12px', borderTop: '1px solid #DDE8EE' }}>
                <button
                  onClick={onClose}
                  disabled={importing}
                  style={{
                    padding: '8px 16px', borderRadius: '8px', border: '1px solid #B8CDD8', background: '#FFFFFF',
                    fontSize: '13px', fontWeight: 600, color: '#5B7080', cursor: importing ? 'not-allowed' : 'pointer',
                    fontFamily: 'var(--font-manrope)', opacity: importing ? 0.5 : 1,
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={doImport}
                  disabled={!canImport || importing}
                  style={{
                    padding: '8px 20px', borderRadius: '8px', border: 'none',
                    background: (canImport && !importing) ? '#B45309' : '#D6DFE5',
                    color: '#FFFFFF', fontSize: '13px', fontWeight: 700,
                    cursor: (canImport && !importing) ? 'pointer' : 'not-allowed',
                    fontFamily: 'var(--font-manrope)',
                  }}
                >
                  {importing ? 'Importing…' : `Import ${rows.length} row${rows.length === 1 ? '' : 's'}`}
                </button>
              </div>
            </>
          )}

          {/* Result */}
          {result && (
            <div style={{ padding: '16px 20px', background: '#F0FDF4', border: '1px solid #86EFAC', borderRadius: '10px' }}>
              <div style={{ fontSize: '14px', fontWeight: 800, color: '#166534', marginBottom: '8px' }}>Import complete</div>
              <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '13px', color: '#166534', lineHeight: 1.8 }}>
                <li><strong>{result.imported}</strong> imported</li>
                <li><strong>{result.skipped_duplicates}</strong> skipped (duplicate email on this project)</li>
                <li><strong>{result.skipped_no_name}</strong> skipped (no Name column value)</li>
              </ul>
              {result.errors.length > 0 && (
                <div style={{ marginTop: '12px', padding: '10px 12px', background: '#FEF3C7', border: '1px solid #FCD34D', borderRadius: '8px', fontSize: '12px', color: '#92400E' }}>
                  <div style={{ fontWeight: 700, marginBottom: '4px' }}>Warnings ({result.errors.length}):</div>
                  <ul style={{ margin: 0, paddingLeft: '18px' }}>
                    {result.errors.slice(0, 10).map((e, i) => <li key={i}>{e}</li>)}
                    {result.errors.length > 10 && <li>… and {result.errors.length - 10} more</li>}
                  </ul>
                </div>
              )}
              <div style={{ marginTop: '14px', display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  onClick={onClose}
                  style={{
                    padding: '8px 20px', borderRadius: '8px', border: 'none', background: '#166534', color: '#FFFFFF',
                    fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-manrope)',
                  }}
                >
                  Done
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
