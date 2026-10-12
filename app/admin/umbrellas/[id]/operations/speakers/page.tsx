'use client'

import { use } from 'react'
import { OpsScopeProvider } from '@/app/admin/operations-shared/scope-context'
import SpeakerDocumentsView from '@/app/admin/operations-shared/SpeakerDocumentsView'

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  return <OpsScopeProvider kind="umbrella" id={id}><SpeakerDocumentsView /></OpsScopeProvider>
}
