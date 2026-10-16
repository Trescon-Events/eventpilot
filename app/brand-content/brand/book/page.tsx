'use client'

import PageHeader from '@/app/components/PageHeader'
import { ViewOnly, useBrandContentAccess } from '@/app/components/brand-content/access'
import BrandBookView from './BrandBookView'

export default function BrandBookPage() {
  const access = useBrandContentAccess()
  return (
    <div>
      <div style={{ padding: '24px 32px 0' }}>
        <PageHeader eyebrow="Brand" title="Brand book" description="The Trescon brand book: guidelines, logos, colours, fonts and templates." />
      </div>
      <div style={{ padding: '0 32px' }}><ViewOnly canEdit={access?.can_edit_brand}><BrandBookView /></ViewOnly></div>
    </div>
  )
}
