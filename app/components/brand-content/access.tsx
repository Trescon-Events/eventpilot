'use client'

import { useEffect, useState } from 'react'

export type BrandContentAccess = { can_edit_brand: boolean; can_edit_content: boolean; can_approve: boolean }

/* null while loading; everything false when the lookup fails (view-only is the safe default). */
export function useBrandContentAccess(): BrandContentAccess | null {
  const [access, setAccess] = useState<BrandContentAccess | null>(null)
  useEffect(() => {
    let cancelled = false
    fetch('/api/brand-content/access')
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (!cancelled) setAccess(d ?? { can_edit_brand: false, can_edit_content: false, can_approve: false }) })
      .catch(() => { if (!cancelled) setAccess({ can_edit_brand: false, can_edit_content: false, can_approve: false }) })
    return () => { cancelled = true }
  }, [])
  return access
}

/* Wraps an existing editing page. When the person cannot edit, a banner says so and every button, field and upload inside is hidden
   (elements marked data-keep stay: tabs and other navigation). Links, downloads and images are untouched. This is only presentation; the
   server rejects the writes anyway. */
export function ViewOnly({ canEdit, children }: { canEdit: boolean | undefined; children: React.ReactNode }) {
  if (canEdit === undefined) return <div style={{ padding: '24px 0', fontSize: '13px', color: 'var(--ink3)' }}>Loading…</div>
  if (canEdit) return <>{children}</>
  return (
    <div data-view-only>
      <style>{`[data-view-only] button:not([data-keep]), [data-view-only] input:not([data-keep]), [data-view-only] textarea, [data-view-only] select, [data-view-only] label:has(input[type="file"]) { display: none !important; }`}</style>
      <div style={{ padding: '8px 12px', marginBottom: '14px', borderRadius: '8px', fontSize: '12.5px', background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--ink3)' }}>
        View only. You can read and download everything here; editing needs permission.
      </div>
      {children}
    </div>
  )
}
