import { redirect } from 'next/navigation'
import { getServerSession } from '@/app/lib/registry/access'
import UmbrellaReferenceDocs from '../UmbrellaReferenceDocs'

/* Umbrella Reference Documents — platform admin only (middleware's blanket /admin/* rule also enforces it). */
export default async function UmbrellaReferenceDocsPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession()
  if (!session?.adm) redirect('/no-access?tool=admin')
  return <UmbrellaReferenceDocs params={params} />
}
