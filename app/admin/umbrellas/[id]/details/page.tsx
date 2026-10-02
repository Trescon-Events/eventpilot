import { redirect } from 'next/navigation'
import { getServerSession } from '@/app/lib/registry/access'
import UmbrellaDetails from '../UmbrellaDetails'

/* Umbrella Event Details — platform admin only (middleware's blanket /admin/* rule also enforces it). */
export default async function UmbrellaDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession()
  if (!session?.adm) redirect('/no-access?tool=admin')
  return <UmbrellaDetails params={params} />
}
