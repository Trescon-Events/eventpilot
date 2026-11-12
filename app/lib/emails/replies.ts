import { supabaseAdmin } from '@/app/lib/supabase'
import { getGraphAppToken } from '@/app/lib/email/graph-mail'
import { notifyOwner } from './owner-notify'
import { classifyMessage, bounceKind, pickBest, RANK, type GraphMsg, type Kind } from './reply-classify'

/* Emails module, phase 5 (2026-11-12) — replies and bounces. EventPilot reads each sending producer's inbox (Microsoft Graph, the Mail.ReadWrite application permission it
   already holds) for messages in the conversations it started, and records only the TYPE of each: bounce / auto_reply / reply. Message text is looked at in memory to decide
   the type and is never stored. Findings:
     hard bounce      the person's address is marked bounced (left out of lists from then on)
     soft bounce      recorded on the email, the person is untouched (a full mailbox or a temporary failure is not a bad address)
     auto-reply that says the person has left   the address is flagged "check it" (never set do-not-email automatically)
     reply that asks to stop                    raised to the owner to confirm with one click (never set automatically)
   Only the inbox is read, and only for 30 days after a send. */

// ── reading the mailboxes ───────────────────────────────────────────────────────────────────────────────────────

type Row = { id: string; campaign_id: string; contact_id: string | null; name: string; conversation_id: string; to_email: string; sender_email: string; sent_at: string; reply_type: string }
type Finding = { row: Row; kind: Exclude<Kind, 'ignore'>; receivedAt: string; stopRequested: boolean; leftCompany: boolean; bounce: 'hard' | 'soft' | null }

async function graphGet<T>(url: string, token: string): Promise<T> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) throw new Error(`Graph read failed (${res.status}): ${(await res.text().catch(() => '')).slice(0, 200)}`)
  return res.json() as Promise<T>
}

async function readInbox(mailbox: string, since: Date, token: string): Promise<GraphMsg[]> {
  const out: GraphMsg[] = []
  let url: string | null = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailbox)}/mailFolders/inbox/messages?$filter=${encodeURIComponent(`receivedDateTime ge ${since.toISOString()}`)}&$select=id,subject,from,receivedDateTime,conversationId,bodyPreview&$orderby=${encodeURIComponent('receivedDateTime desc')}&$top=50`
  for (let page = 0; url && page < 10; page++) {
    const j: { value: { id: string; subject?: string; from?: { emailAddress?: { address?: string; name?: string } }; receivedDateTime: string; conversationId: string; bodyPreview?: string }[]; '@odata.nextLink'?: string } = await graphGet(url, token)
    for (const m of j.value) out.push({ id: m.id, subject: m.subject ?? null, from: m.from?.emailAddress?.address ?? null, fromName: m.from?.emailAddress?.name ?? null, receivedDateTime: m.receivedDateTime, conversationId: m.conversationId, bodyPreview: m.bodyPreview ?? null })
    url = j['@odata.nextLink'] ?? null
  }
  return out
}

async function bounceText(mailbox: string, messageId: string, token: string, fallback: string): Promise<string> {
  try {
    const j = await graphGet<{ body?: { content?: string } }>(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailbox)}/messages/${encodeURIComponent(messageId)}?$select=body`, token)
    return (j.body?.content ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ') || fallback
  } catch { return fallback }
}

async function scanMailbox(mailbox: string, rows: Row[], since: Date, token: string): Promise<{ seen: number; findings: Finding[] }> {
  const byConv = new Map<string, Row[]>()
  for (const r of rows) byConv.set(r.conversation_id, [...(byConv.get(r.conversation_id) ?? []), r])
  const msgs = await readInbox(mailbox, since, token)
  const found = new Map<string, Finding[]>()
  for (const m of msgs) {
    const rs = byConv.get(m.conversationId); if (!rs) continue
    const c = classifyMessage(m, mailbox)
    if (c.kind === 'ignore') continue
    for (const row of rs) {
      // a reply must come after the email was sent
      if (new Date(m.receivedDateTime).getTime() < new Date(row.sent_at).getTime() - 60_000) continue
      let bounce: 'hard' | 'soft' | null = null
      if (c.kind === 'bounce') bounce = bounceKind(await bounceText(mailbox, m.id, token, m.bodyPreview ?? ''))
      const f: Finding = { row, kind: c.kind, receivedAt: m.receivedDateTime, stopRequested: c.stopRequested, leftCompany: c.leftCompany, bounce }
      found.set(row.id, [...(found.get(row.id) ?? []), f])
    }
  }
  const findings: Finding[] = []
  for (const list of found.values()) { const best = pickBest(list); if (best && best.row.reply_type !== best.kind && RANK[best.kind] > (RANK[best.row.reply_type as Kind] ?? 0)) findings.push(best) }
  return { seen: msgs.length, findings }
}

export type ReplyResult = { mailboxes: number; messages: number; replies: number; auto_replies: number; bounces_hard: number; bounces_soft: number; stop_requests: number; problems: string[] }

async function applyFindings(findings: Finding[], res: ReplyResult): Promise<void> {
  const owners = new Map<string, { hard: string[]; stops: string[] }>()
  for (const f of findings) {
    await supabaseAdmin.from('email_campaign_recipients').update({ reply_type: f.kind, reply_at: f.receivedAt, bounce_kind: f.bounce, stop_requested: f.stopRequested }).eq('id', f.row.id)
    const now = new Date().toISOString()
    if (f.kind === 'reply') res.replies++
    if (f.kind === 'auto_reply') res.auto_replies++
    if (f.kind === 'bounce') { if (f.bounce === 'hard') res.bounces_hard++; else res.bounces_soft++ }
    if (f.stopRequested) res.stop_requests++
    const o = owners.get(f.row.campaign_id) ?? { hard: [], stops: [] }
    if (f.kind === 'bounce' && f.bounce === 'hard' && f.row.contact_id) {
      await supabaseAdmin.from('crm_contacts').update({ email_status: 'bounced', email_status_source: 'bounce', email_status_at: now }).eq('id', f.row.contact_id)
      o.hard.push(f.row.name)
    }
    if (f.kind === 'auto_reply' && f.leftCompany && f.row.contact_id) {
      await supabaseAdmin.from('crm_contacts').update({ email_status: 'review', email_status_source: 'reply', email_status_at: now }).eq('id', f.row.contact_id).eq('email_status', 'ok')
    }
    if (f.stopRequested) o.stops.push(f.row.name)
    owners.set(f.row.campaign_id, o)
  }
  for (const [campaignId, o] of owners) {
    if (!o.hard.length && !o.stops.length) continue
    const { data: c } = await supabaseAdmin.from('email_campaigns').select('id, name, event_id, owner_staff_id, created_by').eq('id', campaignId).maybeSingle()
    if (!c) continue
    if (o.stops.length) await notifyOwner(c, 'stop_request', `Asked to stop: “${c.name}”`, `${o.stops.join(', ')} replied asking not to be emailed. Open the email under Emails → Sent and confirm “Do not email” if you agree. Nothing is changed until you do.`)
    if (o.hard.length) await notifyOwner(c, 'bounced', `Bounced: “${c.name}”`, `${o.hard.join(', ')} could not be reached: the address does not exist. Their address is now marked as bounced and they are left out of future lists until it is corrected.`)
  }
}

const SCAN_EVERY_MS = 25 * 60_000
const WINDOW_MS = 30 * 86_400_000

/** Reads the mailboxes that have recent emails still waiting for a reply. `only` limits it to one campaign's mailboxes and ignores the 25-minute pause (the "Check for replies" button). */
export async function runReplyScan(opts: { budgetMs?: number; onlyCampaignId?: string } = {}): Promise<ReplyResult> {
  const t0 = Date.now(); const budget = opts.budgetMs ?? 40_000
  const res: ReplyResult = { mailboxes: 0, messages: 0, replies: 0, auto_replies: 0, bounces_hard: 0, bounces_soft: 0, stop_requests: 0, problems: [] }
  let q = supabaseAdmin.from('email_campaign_recipients').select('id, campaign_id, contact_id, name, conversation_id, to_email, sender_email, sent_at, reply_type')
    .eq('status', 'sent').not('conversation_id', 'is', null).not('sender_email', 'is', null).in('reply_type', ['none', 'auto_reply']).gte('sent_at', new Date(Date.now() - WINDOW_MS).toISOString())
  if (opts.onlyCampaignId) q = q.eq('campaign_id', opts.onlyCampaignId)
  const { data } = await q.limit(5000)
  const byMailbox = new Map<string, Row[]>()
  for (const r of (data ?? []) as Row[]) { const k = r.sender_email.toLowerCase(); byMailbox.set(k, [...(byMailbox.get(k) ?? []), r]) }
  if (!byMailbox.size) return res
  const token = await getGraphAppToken()
  const { data: scans } = await supabaseAdmin.from('email_mailbox_scans').select('mailbox, last_scan_at').in('mailbox', [...byMailbox.keys()])
  const lastScan = new Map((scans ?? []).map(s => [s.mailbox as string, new Date(s.last_scan_at as string).getTime()]))

  for (const [mailbox, rows] of byMailbox) {
    if (Date.now() - t0 > budget) break
    const last = lastScan.get(mailbox)
    if (!opts.onlyCampaignId && last && Date.now() - last < SCAN_EVERY_MS) continue
    const oldest = Math.min(...rows.map(r => new Date(r.sent_at).getTime()))
    const since = new Date(Math.max(Date.now() - WINDOW_MS, opts.onlyCampaignId || !last ? oldest - 3_600_000 : last - 2 * 3_600_000))
    try {
      const { seen, findings } = await scanMailbox(mailbox, rows, since, token)
      await applyFindings(findings, res)
      res.mailboxes++; res.messages += seen
      await supabaseAdmin.from('email_mailbox_scans').upsert({ mailbox, last_scan_at: new Date().toISOString(), last_error: null, messages_seen: seen })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      res.problems.push(`${mailbox}: ${msg}`)
      await supabaseAdmin.from('email_mailbox_scans').upsert({ mailbox, last_scan_at: new Date().toISOString(), last_error: msg.slice(0, 300), messages_seen: 0 })
    }
  }
  return res
}
