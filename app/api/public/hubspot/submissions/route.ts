import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { supabaseAdmin } from '@/app/lib/supabase'
import { HubSpotFieldMapping } from '@/app/lib/hubspot/types'
import { SubmittedValue } from '@/app/lib/forms/types'
import { copySecureDocument } from '@/app/lib/security/secure-document-copy'

/* POST /api/public/hubspot/submissions — the HubSpot Workflow webhook
   receiver. Public (under the /api/public prefix middleware.ts already
   exempts), authenticated by a bearer shared secret rather than a session
   — HubSpot can't hold an EventPilot cookie. Configured as the target of
   a HubSpot Workflow's "Send a webhook" action (Form submission trigger),
   one per connected event+form_type — see the numbered HubSpot-side setup
   steps in the implementation plan.

   The connected HubSpot form ID is read from the "hubspot_form_id" QUERY
   PARAM on the webhook URL, not the body — this lets the workflow action
   just use HubSpot's built-in "Include all triggered contact properties"
   body mode instead of hand-typing every field as a custom body key. Only
   the URL needs to change per event/form_type connection:
     https://.../api/public/hubspot/submissions?hubspot_form_id=<form id>

   "Include all triggered contact properties" sends HubSpot's legacy v1
   Contact-object shape, not flat fields:
   { vid, canonical-vid, portal-id, properties: { <field>: { value, versions }, ... }, ... }
   normalizeProperties() unwraps that (or accepts flat top-level fields,
   for a manually-configured "Customize request body" action instead). */

type WebhookBody = Record<string, unknown>

const DEDUPE_WINDOW_MS = 10 * 60 * 1000

function verifyAuth(req: NextRequest): boolean {
  const secret = process.env.HUBSPOT_WEBHOOK_SECRET
  if (!secret) return false
  const header = req.headers.get('authorization')
  return header === `Bearer ${secret}`
}

function submissionHash(formId: string, contactId: string | number | undefined, properties: Record<string, string | undefined>): string {
  return crypto.createHash('sha256').update(JSON.stringify({ f: formId, c: contactId, p: properties })).digest('hex')
}

function normalizeProperties(body: WebhookBody): Record<string, string | undefined> {
  const raw = body.properties
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    // Legacy v1 Contact object: { "<field>": { "value": "...", "versions": [...] } }
    const out: Record<string, string | undefined> = {}
    for (const [key, entry] of Object.entries(raw as Record<string, unknown>)) {
      if (entry && typeof entry === 'object' && 'value' in (entry as Record<string, unknown>)) {
        out[key] = (entry as { value?: unknown }).value as string | undefined
      } else if (typeof entry === 'string') {
        out[key] = entry
      }
    }
    return out
  }
  // Flat body (manually configured "Customize request body" action) —
  // every top-level key except the reserved ones is a property.
  const out: Record<string, string | undefined> = {}
  for (const [key, value] of Object.entries(body)) {
    if (key === 'hubspot_form_id' || key === 'contact_id') continue
    if (typeof value === 'string') out[key] = value
  }
  return out
}

export async function POST(req: NextRequest) {
  if (!verifyAuth(req)) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })

  const body = await req.json().catch(() => null) as WebhookBody | null
  if (!body) {
    return NextResponse.json({ error: 'JSON body required' }, { status: 400 })
  }

  const hubspot_form_id = req.nextUrl.searchParams.get('hubspot_form_id') ?? (body.hubspot_form_id as string | undefined)
  if (!hubspot_form_id) {
    return NextResponse.json({ error: 'hubspot_form_id query param required' }, { status: 400 })
  }

  const contact_id = (body.contact_id ?? body.vid ?? body['canonical-vid']) as string | number | undefined
  const properties = normalizeProperties(body)

  const { data: connection } = await supabaseAdmin
    .from('event_hubspot_forms')
    .select('event_id, form_type, field_mapping')
    .eq('hubspot_form_id', hubspot_form_id)
    .maybeSingle()

  if (!connection) return NextResponse.json({ error: 'No event is connected to this HubSpot form.' }, { status: 404 })

  // Dedupe: HubSpot Workflow webhook retries send the identical payload.
  // No reliable HubSpot-native submission ID is exposed as a Workflow
  // token, so a content-hash within a short window is the self-contained
  // alternative — coalesces retries of the SAME submission while still
  // allowing a genuine resubmission (different values, or same values
  // after the window) to land as a new row.
  const hash = submissionHash(hubspot_form_id, contact_id, properties)
  const { data: dupe } = await supabaseAdmin
    .from('stakeholder_form_submissions')
    .select('id')
    .eq('hubspot_submission_key', hash)
    .gte('submitted_at', new Date(Date.now() - DEDUPE_WINDOW_MS).toISOString())
    .maybeSingle()
  if (dupe) return NextResponse.json({ success: true, duplicate: true })

  const submittedData: Record<string, SubmittedValue> = {}
  const fileUrls: Record<string, string> = {}
  const secureDocuments: { role: string; url: string }[] = []

  const mapping = (connection.field_mapping ?? []) as HubSpotFieldMapping[]
  for (const m of mapping) {
    const value = properties[m.hubspot_field_name]
    if (value === undefined || value === null || value === '') continue
    switch (m.target.type) {
      case 'concept':
        submittedData[m.target.key] = value
        break
      case 'asset':
        fileUrls[m.target.role] = value
        break
      case 'secure_document':
        secureDocuments.push({ role: m.target.role, url: value })
        break
      case 'custom':
        submittedData[m.hubspot_field_name] = value
        break
    }
  }

  const { data: submission, error } = await supabaseAdmin
    .from('stakeholder_form_submissions')
    .insert({
      event_id: connection.event_id,
      form_type: connection.form_type,
      submitted_data: submittedData,
      file_urls: fileUrls,
      source: 'hubspot',
      hubspot_submission_key: hash,
    })
    .select('id')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (secureDocuments.length > 0) {
    const rows = secureDocuments.map(d => ({
      submission_id: submission.id,
      event_id: connection.event_id,
      document_role: d.role,
      source_url: d.url,
      filename: d.url.split('/').pop() || d.role,
    }))
    const { data: transfers } = await supabaseAdmin.from('secure_document_transfers').insert(rows).select('id')
    for (const t of transfers ?? []) {
      // Fire-and-forget — this app runs on a persistent Railway Node
      // process (not serverless), so this keeps running after the
      // response is sent. Failures are caught inside copySecureDocument()
      // itself and left for the retry sweep; nothing here can crash the
      // response.
      copySecureDocument(t.id).catch(e => console.error('Secure document copy failed', t.id, e))
    }
  }

  return NextResponse.json({ success: true })
}
