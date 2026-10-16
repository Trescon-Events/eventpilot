'use client'

import PageHeader from '@/app/components/PageHeader'
import { ViewOnly, useBrandContentAccess } from '@/app/components/brand-content/access'
import FontLibraryView from './FontLibraryView'

export default function FontLibraryPage() {
  const access = useBrandContentAccess()
  return (
    <div>
      <div style={{ padding: '24px 32px 0' }}>
        <PageHeader eyebrow="Brand" title="Font library" description="Brand fonts for every creative. Upload brand fonts or fetch any free Google Font by name; any text layer in any event's Creative Templates editor can use them." />
      </div>
      <div style={{ padding: '0 32px' }}><ViewOnly canEdit={access?.can_edit_brand}><FontLibraryView /></ViewOnly></div>
    </div>
  )
}
