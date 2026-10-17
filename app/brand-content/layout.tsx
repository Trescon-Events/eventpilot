import { redirect } from 'next/navigation'
import { getServerSession } from '@/app/lib/registry/access'
import BrandContentShell from './BrandContentShell'

/* Brand & Content workspace shell: the left-panel navigation around every page under /brand-content. Everyone signed in may open it. */
export default async function BrandContentLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession()
  if (!session) redirect('/login')
  return <BrandContentShell>{children}</BrandContentShell>
}
