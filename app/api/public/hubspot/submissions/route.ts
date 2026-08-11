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

   Expected body (the producer configures this shape in HubSpot's Workflow
   webhook action, using its token picker for every value):
   {
     "hubspot_form_id": "<static text, same Form ID connected in Phase A>",
     "contact_id": "<HubSpot contact object ID token>",
     "properties": { "<hubspot field name>": "<token value>", ... }
   }
   One key per field the producer mapped in the Connect HubSpot Form UI. */

type WebhookBody = {
  hubspot_form_id?: string
  contact_id?: string
  properties?: Record<string, string>
}

const DEDUPE_WINDOW_MS = 10 * 60 * 1000

function verifyAuth(req: NextRequest): boolean {
  const secret = process.env.HUBSPOT_WEBHOOK_SECRET
  if (!secret) return false
  const header = req.headers.get('authorization')
  return header === `Bearer ${secret}`
}

function submissionHash(body: WebhookBody): string {
  return crypto.createHash('sha256').update(JSON.stringify({ f: body.hubspot_form_id, c: body.contact_id, p: body.properties })).digest('hex')
}

export async function POST(req: NextRequest) {
  if (!verifyAuth(req)) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })

  const body = await req.json().catch(() => null) as WebhookBody | null
  if (!body?.hubspot_form_id || !body.properties) {
    return NextResponse.json({ error: 'hubspot_form_id and properties required' }, { status: 400 })
  }

  const { data: connection } = await supabaseAdmin
    .from('event_hubspot_forms')
    .select('event_id, form_type, field_mapping')
    .eq('hubspot_form_id', body.hubspot_form_id)
    .maybeSingle()

  if (!connection) return NextResponse.json({ error: 'No event is connected to this HubSpot form.' }, { status: 404 })

  // Dedupe: HubSpot Workflow webhook retries send the identical payload.
  // No reliable HubSpot-native submission ID is exposed as a Workflow
  // token, so a content-hash within a short window is the self-contained
  // alternative — coalesces retries of the SAME submission while still
  // allowing a genuine resubmission (different values, or same values
  // after the window) to land as a new row.
  const hash = submissionHash(body)
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
    const value = body.properties[m.hubspot_field_name]
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
