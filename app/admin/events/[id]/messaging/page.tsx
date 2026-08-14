import { redirect } from 'next/navigation'

// The Messaging Doc no longer has its own page — as of the 2026-08-13
// redesign it's a tab on the Event Details page, alongside Common
// Details, so there's one destination for both (Madhu: "everything to do
// with messaging doc and event details stay in [one] place for easy
// reference"). This redirect exists only so old links/bookmarks to this
// URL keep working.
export default async function MessagingDocRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  redirect(`/admin/events/${id}/details?tab=messaging`)
}
