import { redirect } from 'next/navigation'
import { getServerSession } from '@/app/lib/registry/access'
import { canEditEmailTemplates } from '@/app/lib/access/email-template-access'

/* Email Templates are editable by platform admins and producers (anyone who can edit the Stakeholder Hub on some event). The middleware only checks that you are signed in
   for this route; this layout is the real gate. Creating a template is admin-only (see ./new/layout.tsx). */
export default async function EmailTemplatesLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession()
  if (!session) redirect('/login')
  if (!(await canEditEmailTemplates(session))) redirect('/no-access?tool=email-templates')
  return <>{children}</>
}
