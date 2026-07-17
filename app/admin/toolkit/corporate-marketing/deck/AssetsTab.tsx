'use client'

/*
  Approved Images tab. Grid of assets. Upload adds to bucket +
  corporate_assets. Per-tile controls: approved / include / delete.
*/

import { useCallback, useEffect, useRef, useState } from 'react'
import { BRAND, Card, SectionLabel, H2, PrimaryButton, ErrorBox, inputStyle } from './_shared'

type Asset = {
  id:              string
  asset_type:      string
  title:           string | null
  storage_path:    string
  file_name:       string | null
  file_bytes:      number | null
  mime_type:       string | null
  tags:            string[]
  approved:        boolean
  include_in_deck: boolean
  display_order:   number
  uploaded_at:     string
  signed_url:      string | null
}

export default function AssetsTab() {
  const [assets, setAssets] = useState<Asset[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    const res = await fetch('/api/corporate-marketing/assets', { cache: 'no-store' })
    if (res.ok) {
      const d = await res.json()
      setAssets(d.assets ?? [])
    }
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  async function onUpload(files: FileList | null) {
    if (!files || files.length === 0) return
    setUploading(true)
    setErr(null)
    try {
      for (const file of Array.from(files)) {
        const form = new FormData()
        form.append('file', file)
        form.append('title', file.name.replace(/\.[^.]+$/, ''))
        const res = await fetch('/api/corporate-marketing/assets', { method: 'POST', body: form })
        if (!res.ok) {
          const d = await res.json().catch(() => ({}))
          throw new Error(d?.error ?? `Upload failed for ${file.name}`)
        }
      }
      await load()
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function patchAsset(id: string, patch: Partial<Asset>) {
    setAssets(prev => prev.map(a => a.id === id ? { ...a, ...patch } : a))
    setErr(null)
    try {
      const res = await fetch(`/api/corporate-marketing/assets/${id}`, {
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

  async function deleteAsset(id: string) {
    if (!confirm('Delete this image?')) return
    setErr(null)
    try {
      const res = await fetch(`/api/corporate-marketing/assets/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d?.error ?? 'Delete failed')
      }
      await load()
    } catch (e) {
      setErr((e as Error).message)
    }
  }

  if (loading) return <Card><div style={{ fontSize: '13px', color: 'var(--ink3)' }}>Loading images…</div></Card>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px', maxWidth: '1200px' }}>
      <Card>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '20px', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <SectionLabel>Approved Images</SectionLabel>
            <H2 style={{ marginBottom: '6px' }}>{assets.length} image{assets.length === 1 ? '' : 's'} in library</H2>
            <div style={{ fontSize: '13px', color: 'var(--ink3)', lineHeight: 1.6 }}>
              Corporate image library. Upload JPG / PNG / WEBP / GIF (max 10 MB each). Only <strong>Approved</strong> + <strong>Include in deck</strong> images appear in published versions.
            </div>
          </div>
          <div>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              multiple
              onChange={e => onUpload(e.target.files)}
              style={{ display: 'none' }}
            />
            <PrimaryButton onClick={() => fileRef.current?.click()} disabled={uploading}>
              {uploading ? 'Uploading…' : '+ Upload images'}
            </PrimaryButton>
          </div>
        </div>
      </Card>

      {err && <ErrorBox>{err}</ErrorBox>}

      {assets.length === 0 ? (
        <Card>
          <div style={{ fontSize: '13px', color: 'var(--ink3)', fontStyle: 'italic', textAlign: 'center', padding: '20px' }}>
            No images yet — upload above.
          </div>
        </Card>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '16px' }}>
          {assets.map(a => (
            <div key={a.id} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '14px', overflow: 'hidden', boxShadow: 'var(--shadow-sm)' }}>
              <div style={{ aspectRatio: '4 / 3', background: 'var(--border-light)', position: 'relative', overflow: 'hidden' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {a.signed_url && <img src={a.signed_url} alt={a.title ?? a.file_name ?? 'asset'} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                <div style={{ position: 'absolute', top: '8px', right: '8px', display: 'flex', gap: '4px' }}>
                  {!a.approved && (
                    <span style={{ fontSize: '9px', fontWeight: 800, color: 'var(--amber)', background: 'var(--amber-light)', padding: '3px 8px', borderRadius: '10px', letterSpacing: '0.3px' }}>
                      NEEDS APPROVAL
                    </span>
                  )}
                </div>
              </div>
              <div style={{ padding: '12px 14px' }}>
                <input
                  value={a.title ?? ''}
                  placeholder={a.file_name ?? 'Untitled'}
                  onChange={e => setAssets(prev => prev.map(x => x.id === a.id ? { ...x, title: e.target.value } : x))}
                  onBlur={e => patchAsset(a.id, { title: e.target.value })}
                  style={{ ...inputStyle, fontSize: '12px', padding: '6px 10px', fontWeight: 700, border: 'none', background: 'transparent' }}
                />
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginTop: '8px', flexWrap: 'wrap' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer', fontSize: '11px', fontWeight: 700, color: 'var(--ink)' }}>
                    <input
                      type="checkbox"
                      checked={a.approved}
                      onChange={e => patchAsset(a.id, { approved: e.target.checked })}
                      style={{ accentColor: BRAND }}
                    />
                    Approved
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer', fontSize: '11px', fontWeight: 700, color: 'var(--ink)' }}>
                    <input
                      type="checkbox"
                      checked={a.include_in_deck}
                      onChange={e => patchAsset(a.id, { include_in_deck: e.target.checked })}
                      style={{ accentColor: BRAND }}
                    />
                    In deck
                  </label>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px' }}>
                  <span style={{ fontSize: '10px', color: 'var(--ink4)', fontWeight: 600 }}>
                    {a.file_bytes ? `${Math.round(a.file_bytes / 1024)} KB` : ''}
                  </span>
                  <button
                    onClick={() => deleteAsset(a.id)}
                    style={{ background: 'transparent', border: 'none', color: 'var(--red)', cursor: 'pointer', fontSize: '11px', fontWeight: 700, padding: '2px 6px' }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
