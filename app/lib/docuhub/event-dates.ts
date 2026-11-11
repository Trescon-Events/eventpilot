import { supabaseAdmin } from '@/app/lib/supabase'
import { strictEventDays } from '@/app/lib/events/event-days'

/* DocuHub event dates (2026-11-11). A document linked to an EventPilot event takes that event's real days (Staff Portal Event Start/End) and nobody
   types them. A document with no link is an archive record (an old post-event report for an event EventPilot never held) and keeps the dates typed on it. */

export const LINKED_DATES_MESSAGE = 'The dates of a linked event come from the event itself and cannot be edited here.'

export type LinkedDates = { ok: true; start: string; end: string } | { ok: false; error: string; status: number }

export async function datesForLinkedEvent(eventId: string): Promise<LinkedDates> {
  const { data: ev } = await supabaseAdmin.from('events').select('name, actual_start_date, actual_end_date').eq('id', eventId).maybeSingle()
  if (!ev) return { ok: false, error: 'That event was not found.', status: 400 }
  const d = strictEventDays(ev as { actual_start_date: string | null; actual_end_date: string | null })
  if (!d.start || !d.end) return { ok: false, error: `${ev.name} has no event days yet. Add them in the Staff Portal and refresh the event in EventPilot, then link the document.`, status: 400 }
  return { ok: true, start: d.start, end: d.end }
}
