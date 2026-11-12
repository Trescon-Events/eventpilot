'use client'

import { use, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import PageHeader from '@/app/components/PageHeader'

/* The old "Sent" page (2026-11-12): everything now lives on the Emails page. Kept only so older links and notifications (…/emails/sent?open=…) still land in the right place. */
export default function SentRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const open = useSearchParams().get('open')
  useEffect(() => { router.replace(`/admin/events/${id}/stakeholders/emails${open ? `?open=${open}` : ''}`) }, [id, open, router])
  return <PageHeader eyebrow="Stakeholder Hub" title="Emails" description="Taking you to your emails…" />
}
