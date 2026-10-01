/* Same gate as /dashboard: vendor accounts (session.vt) are restricted agency logins and never see
   anything but the module(s) granted to them — send them straight there. */
import { redirect } from 'next/navigation'
import { getServerSession } from '@/app/lib/registry/access'

export default async function MyEventsLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession()
  if (session?.vt) redirect('/admin/task-manager')
  return <>{children}</>
}
