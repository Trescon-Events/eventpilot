import { redirect } from 'next/navigation'
import { getServerSession } from '@/app/lib/registry/access'
import UmbrellaOverview from './UmbrellaOverview'

/* The umbrella overview (Common Details, Content Approval, Reference Documents) is a platform-admin
   screen. Middleware lets any signed-in person reach this URL (so an Operations user can enter the
   umbrella's workspace at all); anyone who isn't an admin is sent to the one part of it they can
   use — Operations — whose own layout does the real ops.view check. */
export default async function UmbrellaPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession()
  if (!session) redirect('/login')
  const { id } = await params
  if (!session.adm) redirect(`/admin/umbrellas/${id}/operations`)
  return <UmbrellaOverview params={params} />
}
