import { redirect } from 'next/navigation'
import { getServerSession } from '@/app/lib/registry/access'

/* Creating a new template stays platform-admin only (editing existing ones is open to producers — see ../layout.tsx). */
export default async function NewEmailTemplateLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession()
  if (!session) redirect('/login')
  if (!session.adm) redirect('/no-access?tool=email-templates')
  return <>{children}</>
}
