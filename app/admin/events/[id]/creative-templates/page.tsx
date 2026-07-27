'use client'

import { use } from 'react'
import Link from 'next/link'
import PageHeader from '@/app/components/PageHeader'
import { Card } from '@/app/components/ui'

/* Stakeholder Announcement Engine — module landing page (PRD v1.4, split
   into landing + admin console per Madhu's 2026-07-27 restructure request).
   The layer-stack editor itself (variant creation) now lives at
   ./admin, gated to admin-tier 'sae' module_access — branding team only for
   now, with an Access Control tab there to grant others.

   This landing page is deliberately light: actually generating a real
   announcement for a specific speaker/partner still happens in the
   Stakeholder Hub (Generate Announcement) — that flow hasn't moved here,
   this page just orients whoever lands on this URL and links onward. */
export default function CreativeTemplatesLandingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = use(params)

  return (
    <div style={{ minHeight: '100vh', background: 'var(--surface)' }}>
      <PageHeader
        eyebrow="Event Workspace"
        title="Stakeholder Announcement Engine"
        description="Layer-based creative variants for stakeholder announcements — background art, face-aligned speaker photos, logos and text, composited server-side."
      />

      <div style={{ padding: '24px 32px', display: 'grid', gap: '16px', maxWidth: '640px' }}>
        <Link href={`/admin/events/${eventId}/creative-templates/admin`} style={{ textDecoration: 'none' }}>
          <Card padded>
            <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--ink)', marginBottom: '4px' }}>Open Admin Console →</div>
            <div style={{ fontSize: '12.5px', color: 'var(--ink3)', lineHeight: 1.5 }}>
              Build and edit creative variants (layer stacks), and manage who has access to this tool.
              Admin-tier access required — right now that&apos;s admins only; grant branding-team staff
              admin access and MMs standard access from inside the console once you&apos;re ready.
            </div>
          </Card>
        </Link>

        <Link href={`/admin/events/${eventId}/stakeholders`} style={{ textDecoration: 'none' }}>
          <Card padded>
            <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--ink)', marginBottom: '4px' }}>Go to Stakeholder Hub →</div>
            <div style={{ fontSize: '12.5px', color: 'var(--ink3)', lineHeight: 1.5 }}>
              Manage speakers and partners, process onboarding-form submissions, and generate a real
              announcement creative for a specific person using the variants built in the Admin Console.
            </div>
          </Card>
        </Link>
      </div>
    </div>
  )
}
