import { redirect } from 'next/navigation'

// Module landing → for now the only feature is Corporate Deck Management.
// Future sub-modules (Website, Proposals, Brochures, Social) will surface here.
export default function CorporateMarketingLanding() {
  redirect('/admin/toolkit/corporate-marketing/deck')
}
