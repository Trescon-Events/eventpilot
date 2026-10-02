'use client'

import { use } from 'react'
import { OpsScopeProvider } from '@/app/admin/operations-shared/scope-context'
import OpsAccessView from '@/app/admin/operations-shared/OpsAccessView'

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  return <OpsScopeProvider kind="event" id={id}><OpsAccessView /></OpsScopeProvider>
}
