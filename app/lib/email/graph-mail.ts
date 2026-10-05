// "Send as" delivery via Microsoft Graph, app-only (client-credentials,
// Mail.Send Application permission — NOT the delegated SSO login flow in
// app/api/auth/callback/route.ts, which only ever exchanges a login code
// and never acquires/stores a Graph access token). Reuses the same 3 env
// vars already present for SSO (MICROSOFT_CLIENT_ID/TENANT_ID/CLIENT_SECRET)
// — no new credentials needed, just an additional Azure AD app permission
// (see the Phase 2 plan's Azure Portal steps). Raw fetch, no SDK — matches
// the existing hand-rolled OAuth convention in auth/callback/route.ts.
//
// Caveat (confirmed via Microsoft's own docs, verify empirically with a
// real "send test" before Phase 3 depends on it): from.emailAddress.name
// on an app-only sendMail call is typically cosmetic — most tenants render
// the recipient-visible sender name as the mailbox's real Exchange display
// name, not this payload value.

let tokenCache: { token: string; expiresAt: number } | null = null

export async function getGraphAppToken(): Promise<string> {
  if (tokenCache && Date.now() < tokenCache.expiresAt - 60_000) return tokenCache.token

  const tenantId = process.env.MICROSOFT_TENANT_ID!
  const res = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.MICROSOFT_CLIENT_ID!,
      client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
      grant_type: 'client_credentials',
      scope: 'https://graph.microsoft.com/.default',
    }),
  })
  if (!res.ok) throw new Error(`Graph token request failed: ${res.status} ${await res.text()}`)

  const json = await res.json() as { access_token: string; expires_in: number }
  tokenCache = { token: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 }
  return tokenCache.token
}

export async function sendGraphMail(opts: {
  senderEmail: string
  senderName?: string
  to: string | string[]
  // 2026-08-18: Self Promo's "Send to Speaker" needs CC (producer wants a
  // copy / wants to loop in a colleague) and a real attachment (the
  // creative image) — both optional, so the two pre-existing callers
  // (invite send, template send-test) are untouched.
  cc?: string[]
  subject: string
  html: string
  attachments?: { filename: string; contentType: string; contentBytes: string }[]
}): Promise<void> {
  const token = await getGraphAppToken()
  const toList = Array.isArray(opts.to) ? opts.to : [opts.to]

  const res = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(opts.senderEmail)}/sendMail`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: {
        subject: opts.subject,
        body: { contentType: 'HTML', content: opts.html },
        toRecipients: toList.map(address => ({ emailAddress: { address } })),
        ...(opts.cc?.length ? { ccRecipients: opts.cc.map(address => ({ emailAddress: { address } })) } : {}),
        from: { emailAddress: { address: opts.senderEmail, name: opts.senderName } },
        ...(opts.attachments?.length ? {
          attachments: opts.attachments.map(a => ({
            '@odata.type': '#microsoft.graph.fileAttachment',
            name: a.filename,
            contentType: a.contentType,
            contentBytes: a.contentBytes,
          })),
        } : {}),
      },
      saveToSentItems: true,
    }),
  })
  if (!res.ok) throw new Error(`Graph sendMail failed (${res.status}): ${await res.text().catch(() => '')}`)
}

// ── Threaded sending ─────────────────────────────────────────────────────────
// sendMail can't set In-Reply-To/References, so every call starts a new
// conversation. To keep one thread per speaker we create the first message as
// a draft (so we get an id back), send it, and answer later sends with
// createReply on that message. Immutable ids are requested so the id survives
// the draft moving to Sent Items.

type MailOpts = Parameters<typeof sendGraphMail>[0]
const IMMUTABLE = { Prefer: 'IdType="ImmutableId"' }

function graphHeaders(token: string, extra: Record<string, string> = {}) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...extra }
}

async function graphJson<T>(res: Response, what: string): Promise<T> {
  if (!res.ok) throw new Error(`Graph ${what} failed (${res.status}): ${await res.text().catch(() => '')}`)
  return res.json() as Promise<T>
}

function recipients(list: string[]) {
  return list.map(address => ({ emailAddress: { address } }))
}

async function attachAll(base: string, token: string, attachments: MailOpts['attachments']) {
  for (const a of attachments ?? []) {
    const res = await fetch(`${base}/attachments`, {
      method: 'POST', headers: graphHeaders(token),
      body: JSON.stringify({ '@odata.type': '#microsoft.graph.fileAttachment', name: a.filename, contentType: a.contentType, contentBytes: a.contentBytes }),
    })
    if (!res.ok) throw new Error(`Graph attachment failed (${res.status}): ${await res.text().catch(() => '')}`)
  }
}

// Starts a new conversation; returns ids to anchor later replies on.
export async function sendGraphMailNewThread(opts: MailOpts): Promise<{ messageId: string; conversationId: string | null }> {
  const token = await getGraphAppToken()
  const user = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(opts.senderEmail)}`
  const toList = Array.isArray(opts.to) ? opts.to : [opts.to]

  const draft = await graphJson<{ id: string; conversationId?: string }>(await fetch(`${user}/messages`, {
    method: 'POST', headers: graphHeaders(token, IMMUTABLE),
    body: JSON.stringify({
      subject: opts.subject,
      body: { contentType: 'HTML', content: opts.html },
      toRecipients: recipients(toList),
      ...(opts.cc?.length ? { ccRecipients: recipients(opts.cc) } : {}),
    }),
  }), 'create draft')

  const base = `${user}/messages/${encodeURIComponent(draft.id)}`
  await attachAll(base, token, opts.attachments)
  const sent = await fetch(`${base}/send`, { method: 'POST', headers: graphHeaders(token) })
  if (!sent.ok) throw new Error(`Graph send draft failed (${sent.status}): ${await sent.text().catch(() => '')}`)
  return { messageId: draft.id, conversationId: draft.conversationId ?? null }
}

export class GraphThreadGoneError extends Error {}

// Replies on an existing thread. Recipients/body are set explicitly (the quoted
// history is dropped). Throws GraphThreadGoneError if the anchor message no
// longer exists (producer deleted it) so the caller can start a fresh thread.
export async function sendGraphMailReply(opts: MailOpts & { anchorMessageId: string }): Promise<void> {
  const token = await getGraphAppToken()
  const user = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(opts.senderEmail)}`
  const toList = Array.isArray(opts.to) ? opts.to : [opts.to]

  // Right after a send the anchor can still be settling into Sent Items, and
  // createReply answers 400 ErrorInvalidReferenceItem until it has — retry briefly.
  let created: Response
  for (let attempt = 0; ; attempt++) {
    created = await fetch(`${user}/messages/${encodeURIComponent(opts.anchorMessageId)}/createReply`, {
      method: 'POST', headers: graphHeaders(token, IMMUTABLE), body: '{}',
    })
    if (created.status !== 400 || attempt >= 4) break
    const peek = await created.clone().text().catch(() => '')
    if (peek.includes('ErrorInvalidIdMalformed')) throw new GraphThreadGoneError('anchor id invalid')
    await new Promise(r => setTimeout(r, 2000))
  }
  if (created.status === 404) throw new GraphThreadGoneError('anchor message not found')
  const draft = await graphJson<{ id: string }>(created, 'createReply')

  const base = `${user}/messages/${encodeURIComponent(draft.id)}`
  const patched = await fetch(base, {
    method: 'PATCH', headers: graphHeaders(token),
    body: JSON.stringify({
      body: { contentType: 'HTML', content: opts.html },
      toRecipients: recipients(toList),
      ccRecipients: recipients(opts.cc ?? []),
    }),
  })
  if (!patched.ok) throw new Error(`Graph patch reply failed (${patched.status}): ${await patched.text().catch(() => '')}`)
  await attachAll(base, token, opts.attachments)
  const sent = await fetch(`${base}/send`, { method: 'POST', headers: graphHeaders(token) })
  if (!sent.ok) throw new Error(`Graph send reply failed (${sent.status}): ${await sent.text().catch(() => '')}`)
}
