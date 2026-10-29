import crypto from 'crypto'
import { supabaseAdmin } from '@/app/lib/supabase'
import { siteUrl } from '@/app/lib/badges/client-approval'

/* Arrival & Travel (2026-10-28): one private link per speaker (no login) to give flight details for DET's airport reception; one read-only link for the DET contact.
   The module is switched on per event (event_travel_settings.enabled); when it is off, every link stops working. */

export const TRAVEL_CLASSES = ['first', 'business', 'economy'] as const
export type TravelClass = (typeof TRAVEL_CLASSES)[number]
export const CLASS_LABEL: Record<TravelClass, string> = { first: 'First', business: 'Business', economy: 'Economy' }

export type TravelRow = {
  id: string; event_id: string; speaker_id: string; token: string; no_reception: boolean
  arr_flight: string | null; arr_class: TravelClass | null; arr_date: string | null; arr_time: string | null
  dep_flight: string | null; dep_class: TravelClass | null; dep_date: string | null; dep_time: string | null
  phone: string | null; submitted_by: string | null; submitted_at: string | null; updated_at: string; invited_at: string | null
}
export type TravelSettings = { event_id: string; enabled: boolean; deadline: string | null; det_name: string | null; det_email: string | null; det_token: string | null; det_sent_at: string | null; notify_staff_ids: string[] }

export const newToken = () => crypto.randomBytes(24).toString('hex')
export const travelLink = (token: string) => `${siteUrl()}/public/travel/${token}`
export const detLink = (token: string) => `${siteUrl()}/public/travel-det/${token}`

/** True for UAE-based speakers, who do not need airport reception (matches how the country is typed on speaker records). */
export const isUaeCountry = (c: string | null | undefined) => /^(uae|ae|u\.a\.e\.?|united arab emirates|emirates)$/i.test((c ?? '').trim())

export async function loadSettings(eventId: string): Promise<TravelSettings> {
  const { data } = await supabaseAdmin.from('event_travel_settings').select('*').eq('event_id', eventId).maybeSingle()
  return (data as TravelSettings | null) ?? { event_id: eventId, enabled: false, deadline: null, det_name: null, det_email: null, det_token: null, det_sent_at: null, notify_staff_ids: [] }
}

/** The travel row for a speaker, created (with its private token) on first use. */
export async function ensureTravelRow(eventId: string, speakerId: string): Promise<TravelRow> {
  const { data: existing } = await supabaseAdmin.from('speaker_travel').select('*').eq('speaker_id', speakerId).maybeSingle()
  if (existing) return existing as TravelRow
  const { data, error } = await supabaseAdmin.from('speaker_travel').insert({ event_id: eventId, speaker_id: speakerId, token: newToken() }).select('*').single()
  if (error || !data) {
    const { data: again } = await supabaseAdmin.from('speaker_travel').select('*').eq('speaker_id', speakerId).maybeSingle()
    if (again) return again as TravelRow
    throw new Error(error?.message ?? 'Could not create the travel record.')
  }
  return data as TravelRow
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/
const DATE = /^\d{4}-\d{2}-\d{2}$/
const clean = (v: unknown, max = 60) => (typeof v === 'string' ? v.trim().slice(0, max) : '') || null

export type TravelInput = {
  by_name?: unknown; no_reception?: unknown; phone?: unknown
  arr_flight?: unknown; arr_class?: unknown; arr_date?: unknown; arr_time?: unknown
  dep_flight?: unknown; dep_class?: unknown; dep_date?: unknown; dep_time?: unknown
}

/** Validates what a speaker (or their assistant) typed. Arrival and the phone number are required unless "no reception needed"; departure is optional but all-or-nothing in its date/time. */
export function validateTravel(i: TravelInput): { ok: true; by: string; values: Omit<TravelRow, 'id' | 'event_id' | 'speaker_id' | 'token' | 'submitted_at' | 'updated_at' | 'invited_at' | 'submitted_by'> } | { ok: false; error: string } {
  const by = clean(i.by_name, 80)
  if (!by) return { ok: false, error: 'Please tell us who is filling this in.' }
  const none = i.no_reception === true
  const cls = (v: unknown): TravelClass | null => (TRAVEL_CLASSES as readonly string[]).includes(v as string) ? (v as TravelClass) : null
  const date = (v: unknown) => (typeof v === 'string' && DATE.test(v) ? v : null)
  const time = (v: unknown) => (typeof v === 'string' && TIME.test(v) ? v : null)
  const values = {
    no_reception: none, phone: clean(i.phone, 40),
    arr_flight: clean(i.arr_flight, 20)?.toUpperCase() ?? null, arr_class: cls(i.arr_class), arr_date: date(i.arr_date), arr_time: time(i.arr_time),
    dep_flight: clean(i.dep_flight, 20)?.toUpperCase() ?? null, dep_class: cls(i.dep_class), dep_date: date(i.dep_date), dep_time: time(i.dep_time),
  }
  if (!none) {
    if (!values.arr_flight) return { ok: false, error: 'Please enter your arrival flight number.' }
    if (!values.arr_class) return { ok: false, error: 'Please choose your travel class for the arrival flight.' }
    if (!values.arr_date) return { ok: false, error: 'Please enter your arrival date.' }
    if (!values.arr_time) return { ok: false, error: 'Please enter your arrival time.' }
    if (!values.phone || values.phone.replace(/\D/g, '').length < 6) return { ok: false, error: 'Please enter a mobile or WhatsApp number we can reach you on.' }
    const anyDep = values.dep_flight || values.dep_class || values.dep_date || values.dep_time
    if (anyDep && !(values.dep_flight && values.dep_class && values.dep_date && values.dep_time)) return { ok: false, error: 'For the departure flight, please fill in all four fields, or leave them all empty for now.' }
  }
  return { ok: true, by, values }
}

export const DEFAULT_DET_NOTE = (eventName: string) => `This is the live list of speaker arrival and departure details for ${eventName}, for airport reception. It updates by itself as each speaker submits, so you can keep this one link and check it any time. Some speakers are still to respond.`

export const DEFAULT_EMAIL_BODY = (eventName: string, deadlineText: string | null) => `<p>We are looking forward to welcoming you to Dubai for ${eventName}. The Dubai Department of Economy and Tourism (DET) is arranging airport reception for our speakers, and we need your travel details to set it up.</p><p>It takes about a minute and works on your phone:</p><p><strong>{{link}}</strong></p><p>You will be asked for your flight number, travel class, arrival date and time, your departure flight if you know it, and a mobile or WhatsApp number we can reach you on at the airport. Your assistant can fill it in for you using the same link, and if your plans change you can update it there at any time.</p><p>Could you complete it${deadlineText ? ` by ${deadlineText}` : ' as soon as you can'}? If you do not need airport reception, just tick that option on the same page and submit.</p>`
