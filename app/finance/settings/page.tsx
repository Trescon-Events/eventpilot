'use client'

import PageHeader from '@/app/components/PageHeader'
import AccessTab from '@/app/components/AccessTab'

/*
  Finance's "Toolkit hub visibility" grant is a DIFFERENT gate from real
  access to /finance — that one is enforced in middleware.ts via session.adm
  or an explicit 'finance' access_role and is untouched by this page. The
  banner below exists so granting someone here can't be mistaken for actually
  letting them into Finance — see app/lib/registry/modules.tsx's 'finance'
  toolkitHub.access for the grant this page manages.
*/
export default function FinanceSettingsPage() {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--surface)', fontFamily: 'var(--font-manrope), sans-serif' }}>
      <PageHeader eyebrow="Finance Portal" title="Settings" />
      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '24px' }}>
        <div style={{
          display: 'flex', gap: '10px', alignItems: 'flex-start',
          padding: '14px 16px', borderRadius: '10px', marginBottom: '24px',
          background: 'var(--info-light)', border: '1px solid var(--info)',
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--info)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: '2px' }}>
            <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
          <div style={{ fontSize: '13px', color: 'var(--info)', lineHeight: 1.55 }}>
            This controls whether <strong>Finance Portal</strong> appears in the Toolkit hub. It does not yet control real access to <strong>/finance</strong> — that&apos;s still based on role/department, managed separately.
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
          <button style={{ padding: '8px 16px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--card-hi)', color: 'var(--ink3)', fontSize: '13px', fontWeight: 800, fontFamily: 'inherit' }}>
            Access
          </button>
        </div>
        <AccessTab moduleKey="finance" moduleLabel="Finance Portal" />
      </div>
    </div>
  )
}
