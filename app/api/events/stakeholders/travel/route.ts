import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { requireGuestInviteAccess } from '@/app/lib/guest-invites/access'
import { checkEmailCompliance, htmlToPlainText } from '@/app/lib/guest-invites/template'
import { cleanBodyHtml, hasContent } from '@/app/lib/speaker-emails/render'
import { loadSpeakerList, sendSpeakerEmail, type SendOne } from '@/app/lib/speaker-emails/server'
import { sendKeyedThreadMail } from '@/app/lib/email/keyed-thread'
import { CLASS_LABEL, DEFAULT_DET_NOTE, DEFAULT_EMAIL_BODY, detLink, ensureTravelRow, isUaeCountry, loadSettings, newToken, travelLink, type TravelRow } from '@/app/lib/travel/travel'

/* Arrival & Travel — producer side.
   GET  ?event_id=            settings, the default email, and every speaker with their travel status (+ ?format=xlsx for the formatted Excel for DET)
   PUT  { event_id, enabled?, deadline?, det_name?, det_email? }   settings (the module switch lives here)
   POST { event_id, action: 'send', speaker_ids (≤8), body_html, batch_id? }   sends the email to each speaker (as their producer, with Additional Contacts on Cc), a personal link in each
   POST { event_id, action: 'send_det' }                              emails the DET contact the live read-only link */
export const maxDuration = 60
const MAX_PER_CALL = 8
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const fmtDeadline = (d: string | null) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : null)

async function eventNameOf(eventId: string) {
  const { data } = await supabaseAdmin.from('events').select('name, public_name').eq('id', eventId).maybeSingle()
  return ((data?.public_name as string | null) || (data?.name as string | null) || 'the event')
}

async function loadRows(eventId: string) {
  const [speakers, { data: travel }] = await Promise.all([loadSpeakerList(eventId), supabaseAdmin.from('speaker_travel').select('*').eq('event_id', eventId)])
  const byId = new Map((travel ?? []).map(t => [t.speaker_id as string, t as TravelRow]))
  return speakers.map(s => {
    const t = byId.get(s.speaker_id)
    const status = !t?.invited_at && !t?.submitted_at ? 'not_invited' : t?.submitted_at ? (t.no_reception ? 'no_reception' : 'submitted') : 'invited'
    return { ...s, is_uae: isUaeCountry(s.country), status, travel: t ?? null, link: t ? travelLink(t.token) : null }
  })
}

export async function GET(req: NextRequest) {
  const eventId = req.nextUrl.searchParams.get('event_id')
  if (!eventId) return NextResponse.json({ error: 'event_id is required' }, { status: 400 })
  const denied = await requireGuestInviteAccess(req, eventId, 'view'); if (denied) return denied
  const settings = await loadSettings(eventId)
  const rows = await loadRows(eventId)

  if (req.nextUrl.searchParams.get('format') === 'xlsx') {
    const name = await eventNameOf(eventId)
    const ExcelJS = (await import('exceljs')).default
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Arrivals', { views: [{ state: 'frozen', ySplit: 3 }] })
    const cols = ['Speaker', 'Organisation', 'Country', 'Airport reception', 'Arrival flight', 'Arrival class', 'Arrival date', 'Arrival time', 'Departure flight', 'Departure class', 'Departure date', 'Departure time', 'Contact number', 'Filled in by', 'Last updated']
    ws.mergeCells(1, 1, 1, cols.length); ws.getCell(1, 1).value = `${name} — speaker arrivals and departures`; ws.getCell(1, 1).font = { bold: true, size: 14 }
    ws.mergeCells(2, 1, 2, cols.length); ws.getCell(2, 1).value = `Exported ${new Date().toLocaleString('en-GB')}`; ws.getCell(2, 1).font = { italic: true, color: { argb: 'FF666666' } }
    const head = ws.getRow(3); head.values = cols
    head.eachCell(c => { c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF00807E' } }; c.alignment = { vertical: 'middle', wrapText: true } })
    head.height = 24
    const done = rows.filter(r => r.travel?.submitted_at).sort((a, b) => (a.travel!.arr_date ?? '9999').localeCompare(b.travel!.arr_date ?? '9999') || (a.travel!.arr_time ?? '').localeCompare(b.travel!.arr_time ?? '') || a.name.localeCompare(b.name))
    for (const r of done) {
      const t = r.travel!
      const cls = (c: string | null) => (c ? CLASS_LABEL[c as keyof typeof CLASS_LABEL] : '')
      ws.addRow([r.name, r.company ?? '', r.country ?? '', t.no_reception ? 'Not needed' : 'Needed', t.arr_flight ?? '', cls(t.arr_class), t.arr_date ?? '', t.arr_time ?? '', t.dep_flight ?? '', cls(t.dep_class), t.dep_date ?? '', t.dep_time ?? '', t.phone ?? '', t.submitted_by ?? '', new Date(t.updated_at).toLocaleString('en-GB')])
    }
    const widths = [28, 26, 16, 16, 14, 14, 14, 12, 14, 14, 14, 12, 20, 22, 20]
    widths.forEach((w, i) => { ws.getColumn(i + 1).width = w })
    ws.eachRow((row, n) => { if (n > 3) { row.alignment = { vertical: 'top', wrapText: true }; row.eachCell(c => { c.border = { bottom: { style: 'thin', color: { argb: 'FFDDDDDD' } } } }); if (n % 2 === 0) row.eachCell(c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF4F8F8' } } }) } })
    ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: cols.length } }
    const buf = await wb.xlsx.writeBuffer()
    return new NextResponse(buf as ArrayBuffer, { headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename="speaker-arrivals-${name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.xlsx"` } })
  }

  const session = getSession(req)
  const { hasEventPermission } = await import('@/app/lib/access/event-access')
  const canEdit = !!session?.adm || (await hasEventPermission(session?.sid, eventId, 'sae.stakeholders.edit'))
  return NextResponse.json({
    settings: { ...settings, det_link: settings.det_token ? detLink(settings.det_token) : null, det_token: undefined },
    default_body: DEFAULT_EMAIL_BODY(await eventNameOf(eventId), fmtDeadline(settings.deadline)),
    default_det_note: DEFAULT_DET_NOTE(await eventNameOf(eventId)),
    staff: canEdit ? ((await supabaseAdmin.from('staff_members').select('id, name').eq('access_enabled', true).order('name')).data ?? []) : [],
    rows, can_edit: canEdit,
  })
}

export async function PUT(req: NextRequest) {
  const b = await req.json().catch(() => null) as { event_id?: string; enabled?: boolean; deadline?: string | null; det_name?: string | null; det_email?: string | null; owner_staff_id?: string | null } | null
  if (!b?.event_id) return NextResponse.json({ error: 'event_id is required' }, { status: 400 })
  const denied = await requireGuestInviteAccess(req, b.event_id, 'edit'); if (denied) return denied
  const cur = await loadSettings(b.event_id)
  const next = { ...cur }
  if (b.enabled !== undefined) next.enabled = !!b.enabled
  if (b.deadline !== undefined) {
    if (b.deadline && !/^\d{4}-\d{2}-\d{2}$/.test(b.deadline)) return NextResponse.json({ error: 'Deadline must be a date.' }, { status: 400 })
    next.deadline = b.deadline || null
  }
  if (b.det_name !== undefined) next.det_name = (b.det_name ?? '').trim().slice(0, 120) || null
  if (b.det_email !== undefined) {
    const e = (b.det_email ?? '').trim()
    if (e && !EMAIL.test(e)) return NextResponse.json({ error: 'That is not a valid email address.' }, { status: 400 })
    next.det_email = e || null
  }
  if (b.owner_staff_id !== undefined) {
    if (b.owner_staff_id) {
      const { data: o } = await supabaseAdmin.from('staff_members').select('id, email, access_enabled').eq('id', b.owner_staff_id).maybeSingle()
      if (!o || !o.email || o.access_enabled === false) return NextResponse.json({ error: 'That person cannot be the owner (no active account with an email address).' }, { status: 400 })
    }
    next.owner_staff_id = b.owner_staff_id || null
  }
  if (!next.det_token) next.det_token = newToken()
  const { error } = await supabaseAdmin.from('event_travel_settings').upsert({ event_id: b.event_id, enabled: next.enabled, deadline: next.deadline, det_name: next.det_name, det_email: next.det_email, det_token: next.det_token, det_sent_at: next.det_sent_at, owner_staff_id: next.owner_staff_id, updated_at: new Date().toISOString() }, { onConflict: 'event_id' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => null) as { event_id?: string; action?: string; speaker_ids?: string[]; body_html?: string; batch_id?: string; message?: string } | null
  if (!b?.event_id) return NextResponse.json({ error: 'event_id is required' }, { status: 400 })
  const denied = await requireGuestInviteAccess(req, b.event_id, 'edit'); if (denied) return denied
  const session = getSession(req)
  const settings = await loadSettings(b.event_id)
  if (!settings.enabled) return NextResponse.json({ error: 'Arrival & Travel is switched off for this event.' }, { status: 409 })

  if (b.action === 'send_det') {
    if (!settings.det_email || !settings.det_token) return NextResponse.json({ error: 'Add the DET contact’s name and email first.' }, { status: 422 })
    if (!settings.owner_staff_id) return NextResponse.json({ error: 'Choose the module owner first. The email to DET is sent from the owner’s own address.' }, { status: 422 })
    const { data: owner } = await supabaseAdmin.from('staff_members').select('name, email, role').eq('id', settings.owner_staff_id).maybeSingle()
    if (!owner?.email) return NextResponse.json({ error: 'The owner has no email address on file.' }, { status: 422 })
    const name = await eventNameOf(b.event_id)
    const link = detLink(settings.det_token)
    const note = (b.message ?? '').trim().slice(0, 1500) || DEFAULT_DET_NOTE(name)
    const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    const paras = note.split(/\n{2,}/).map(p => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('')
    const sign = [esc(owner.name as string), owner.role ? esc(owner.role as string) : '', 'Trescon', esc(owner.email as string)].filter(Boolean).join('<br>')
    // Email HTML needs literal colours (mail clients cannot read CSS variables).
    /* eslint-disable no-restricted-syntax */
    const html = `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#1A2530;max-width:560px"><p>Dear ${esc(settings.det_name ?? 'colleague')},</p>${paras}<p><a href="${link}" style="color:#00807E;font-weight:bold">Open the speaker arrivals</a></p><p>Kind regards,<br><strong>${sign}</strong></p></div>`
    /* eslint-enable no-restricted-syntax */
    // Sent from the owner's own mailbox, in one Outlook thread per DET contact, so DET knows who to reply to and a resend stays in the same conversation.
    try { await sendKeyedThreadMail(b.event_id, `travel-det:${settings.det_email.toLowerCase()}`, { senderEmail: owner.email as string, senderName: owner.name as string, to: settings.det_email, subject: `Speaker arrivals — ${name}`, html }) } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not send the email.' }, { status: 502 }) }
    await supabaseAdmin.from('event_travel_settings').update({ det_sent_at: new Date().toISOString() }).eq('event_id', b.event_id)
    return NextResponse.json({ ok: true })
  }

  if (b.action === 'send') {
    if (!Array.isArray(b.speaker_ids) || !b.speaker_ids.length || typeof b.body_html !== 'string') return NextResponse.json({ error: 'speaker_ids and body_html are required' }, { status: 400 })
    if (b.speaker_ids.length > MAX_PER_CALL) return NextResponse.json({ error: `Send at most ${MAX_PER_CALL} speakers per request.` }, { status: 400 })
    if (!b.body_html.includes('{{link}}')) return NextResponse.json({ error: 'The email must contain {{link}}, which becomes each speaker’s personal link.' }, { status: 422 })
    const bodyHtml = cleanBodyHtml(b.body_html)
    if (!hasContent(bodyHtml)) return NextResponse.json({ error: 'The email is empty.' }, { status: 422 })
    const { errors, warnings } = await checkEmailCompliance(b.event_id, htmlToPlainText(bodyHtml.replace(/\{\{link\}\}/g, 'link')))
    const f = (x: { message: string; match: string }) => ({ message: x.message, match: x.match })
    if (errors.length) return NextResponse.json({ error: 'The email breaks the event’s content rules.', errors: errors.map(f), warnings: warnings.map(f) }, { status: 422 })

    let batchId = b.batch_id
    if (!batchId) {
      const { data: batch, error } = await supabaseAdmin.from('speaker_email_batches').insert({ event_id: b.event_id, created_by: session?.sid ?? null, body_html: bodyHtml, polished: false, original_html: null, attachments: [] }).select('id').single()
      if (error || !batch) return NextResponse.json({ error: 'Could not start the send.' }, { status: 500 })
      batchId = batch.id as string
    }
    const results: SendOne[] = []
    for (const id of b.speaker_ids) {
      const t = await ensureTravelRow(b.event_id, id)
      const html = bodyHtml.replace(/\{\{link\}\}/g, `<a href="${travelLink(t.token)}">Share my arrival details</a>`)
      const r = await sendSpeakerEmail({ eventId: b.event_id, batchId, speakerId: id, bodyHtml: html, attachments: [], session })
      if (r.status === 'sent') await supabaseAdmin.from('speaker_travel').update({ invited_at: new Date().toISOString() }).eq('id', t.id)
      results.push(r)
      await new Promise(res => setTimeout(res, 400))
    }
    return NextResponse.json({ batch_id: batchId, results, warnings: warnings.map(f) })
  }
  return NextResponse.json({ error: 'Unknown action.' }, { status: 400 })
}
