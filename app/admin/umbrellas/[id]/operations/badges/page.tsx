'use client'

import { use } from 'react'
import { OpsScopeProvider } from '@/app/admin/operations-shared/scope-context'
import BadgePrintingView from '@/app/admin/operations-shared/BadgePrintingView'

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  return <OpsScopeProvider kind="umbrella" id={id}><BadgePrintingView /></OpsScopeProvider>
}
