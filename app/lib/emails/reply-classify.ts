/* Emails module, phase 5 — deciding what kind of message a reply is. Pure: no database, no network, so every rule is tested. See replies.ts for how mailboxes are read. */

export type GraphMsg = { id: string; subject: string | null; from: string | null; fromName: string | null; receivedDateTime: string; conversationId: string; bodyPreview: string | null }
export type Kind = 'bounce' | 'auto_reply' | 'reply' | 'ignore'
export type Classified = { kind: Kind; stopRequested: boolean; leftCompany: boolean }

const BOUNCE_SUBJECT = /^(undeliverable|delivery (status notification|has failed|failure)|mail delivery (failed|system)|returned mail|failure notice|non[- ]delivery)/i
const SYSTEM_SENDER = /microsoftexchange|postmaster|mailer-daemon|mail delivery subsystem/i
const AUTO_SUBJECT = /^(automatic reply|auto[- ]?reply|autoreply|out of office|ooo\b|abwesenheit)/i
const STOP = /\b(unsubscribe|remove me|take me off|stop (emailing|sending|contacting|these|the emails)|do not (email|contact|send)|don'?t (email|contact|send)|no longer (wish|want|need) to (receive|hear)|opt[- ]?out|please stop)\b/i
const LEFT = /\b(no longer (with|works?|working|employed|at)|has left|have left|left (the )?(company|organi[sz]ation|firm)|is no longer (with|at|employed)|ceased to be)\b/i
const GONE = /(wasn['’]t found|was not found|does not exist|doesn['’]t exist|unknown (user|recipient)|no such (user|mailbox)|address (rejected|not found)|recipient unknown)/i

/** What kind of message this is, judged from the sender, the subject and the first part of the text. Our own messages are ignored. */
export function classifyMessage(msg: GraphMsg, senderEmail: string): Classified {
  const from = (msg.from ?? '').toLowerCase()
  const none = { stopRequested: false, leftCompany: false }
  if (from && from === senderEmail.toLowerCase()) return { kind: 'ignore', ...none }
  const subject = (msg.subject ?? '').trim()
  const preview = msg.bodyPreview ?? ''
  if (BOUNCE_SUBJECT.test(subject) || (SYSTEM_SENDER.test(from) || SYSTEM_SENDER.test(msg.fromName ?? '')) && /couldn['’]?t be delivered|could not be delivered|delivery (has )?failed/i.test(`${subject} ${preview}`)) return { kind: 'bounce', ...none }
  if (AUTO_SUBJECT.test(subject)) return { kind: 'auto_reply', stopRequested: false, leftCompany: LEFT.test(preview) }
  return { kind: 'reply', stopRequested: STOP.test(preview), leftCompany: false }
}

/** A permanently bad address (hard) or a temporary / policy problem (soft). Only a hard bounce changes the person. */
export function bounceKind(text: string): 'hard' | 'soft' {
  const codes = [...text.matchAll(/\b([45])\.(\d{1,3})\.(\d{1,3})\b/g)].map(m => `${m[1]}.${m[2]}.${m[3]}`)
  if (codes.some(c => c.startsWith('5.1.') || c === '5.4.1')) return 'hard'
  if (codes.length && codes.every(c => c.startsWith('4.') || c.startsWith('5.2.') || c.startsWith('5.3.') || c.startsWith('5.7.'))) return 'soft'
  return GONE.test(text) ? 'hard' : 'soft'
}

export const RANK: Record<Kind, number> = { bounce: 3, reply: 2, auto_reply: 1, ignore: 0 }
/** When several messages in one conversation arrived, the most telling one wins: a bounce over a reply over an auto-reply. */
export function pickBest<T extends { kind: Kind; receivedAt: string }>(list: T[]): T | null {
  let best: T | null = null
  for (const f of list) { if (!best || RANK[f.kind] > RANK[best.kind] || (RANK[f.kind] === RANK[best.kind] && f.receivedAt < best.receivedAt)) best = f }
  return best && best.kind !== 'ignore' ? best : null
}

