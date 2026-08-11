'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import PageHeader from '@/app/components/PageHeader'
import { Button, Card, Badge } from '@/app/components/ui'
import type { EmailTemplate } from './EmailTemplateEditor'

/* Workspace-level Email Templates — Phase 2 of the SAE producer-workflow
   initiative. Reusable across events/teams (not nested under
   app/admin/events/[id]/), same placement convention as the Corporate
   Brand hub. Platform admin only in v1. */

export default function EmailTemplatesPage() {
  const [templates, setTemplates] = useState<EmailTemplate[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/admin/email-templates').then(r => r.json()).then(d => setTemplates(Array.isArray(d) ? d : [])).finally(() => setLoading(false))
  }, [])

  return (
    <div>
      <PageHeader
        eyebrow="Workspace"
        title="Email Templates"
        description="Reusable email templates — rich-text editor, AI rewrite, and real send-as delivery. Used across events and teams."
        actions={<Link href="/admin/email-templates/new"><Button variant="lime">+ New Template</Button></Link>}
      />
      <div style={{ padding: '24px 32px', maxWidth: '900px', margin: '0 auto' }}>
        {loading && <div style={{ fontSize: '13px', color: 'var(--ink3)' }}>Loading…</div>}
        {!loading && templates.length === 0 && (
          <div style={{ fontSize: '13px', color: 'var(--ink3)', padding: '32px', textAlign: 'center' }}>No templates yet.</div>
        )}
        <div style={{ display: 'grid', gap: '10px' }}>
          {templates.map(t => (
            <Link key={t.id} href={`/admin/email-templates/${t.id}`} style={{ textDecoration: 'none' }}>
              <Card padded>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--ink)' }}>{t.name}</div>
                    {t.description && <div style={{ fontSize: '12.5px', color: 'var(--ink3)', marginTop: '2px' }}>{t.description}</div>}
                    <div style={{ fontSize: '11.5px', color: 'var(--ink4)', marginTop: '6px' }}>Sender: {t.sender_name} · {t.sender_email}</div>
                  </div>
                  <Badge color="grey">{t.category}</Badge>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
