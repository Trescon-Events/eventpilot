import type { Metadata } from 'next'

/*
  Vendor Portal shell — deliberately bare. External licence vendors see ONLY
  this: a header with the portal name and their own page. No staff sidebar,
  breadcrumbs, search, help menu or internal links (the root layout skips all
  of that for /vendor-portal — see AuthedShellGate and StaffOnlyWidgets).
*/

export const metadata: Metadata = {
  title: 'Trescon Vendor Portal',
  description: 'Secure portal for Trescon licence vendors.',
  robots: { index: false, follow: false, nocache: true },
  openGraph: undefined,
  twitter: undefined,
}

export default function VendorPortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--surface)' }}>
      <header style={{ padding: '16px 28px', borderBottom: '1px solid var(--border)', background: 'var(--card)' }}>
        <span style={{ fontSize: '15px', fontWeight: 800, color: 'var(--ink)' }}>Trescon · Vendor Portal</span>
      </header>
      <main style={{ maxWidth: '960px', margin: '0 auto', padding: '32px 20px' }}>{children}</main>
    </div>
  )
}
