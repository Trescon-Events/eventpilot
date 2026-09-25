'use client'

import { use } from 'react'
import { OpsScopeProvider } from '@/app/admin/operations-shared/scope-context'
import LicensesView from '@/app/admin/operations-shared/LicensesView'

/* Umbrella-level Operations (e.g. Dubai Future Finance Week): licence processing for every
   child event happens here, not per event. */
export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  return <OpsScopeProvider kind="umbrella" id={id}><LicensesView /></OpsScopeProvider>
}
