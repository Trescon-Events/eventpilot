import { redirect } from 'next/navigation'
import { getServerSession } from '@/app/lib/registry/access'
import { supabaseAdmin } from '@/app/lib/supabase'
import UmbrellaAccessTab from './UmbrellaAccessTab'

/* Umbrella Access (2026-10-01) — platform admin only, like every access screen. */
export default async function UmbrellaAccessPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession()
  if (!session?.adm) redirect('/no-access?tool=admin')
  const { id } = await params
  const [{ data: umbrella }, { count }] = await Promise.all([
    supabaseAdmin.from('event_umbrellas').select('id, name').eq('id', id).maybeSingle(),
    supabaseAdmin.from('events').select('id', { count: 'exact', head: true }).eq('umbrella_id', id),
  ])
  if (!umbrella) redirect('/no-access?tool=admin')
  return <UmbrellaAccessTab umbrellaId={umbrella.id} umbrellaName={umbrella.name} eventCount={count ?? 0} />
}
