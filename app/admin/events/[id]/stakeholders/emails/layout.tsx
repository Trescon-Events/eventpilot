import EmailsShell from './EmailsShell'

/* Emails module layout (2026-11-12): the side panel (Emails, Lists, Templates) around every page of the module. Access is enforced by the Stakeholder Hub layout above this one. */
export default async function EmailsLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params
  return <EmailsShell eventId={id}>{children}</EmailsShell>
}
