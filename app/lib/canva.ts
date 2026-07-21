// Shared Canva helpers — access-token resolution and the autofill pipeline
// (upload asset -> autofill template -> export PNG), used by both
// app/api/canva/design/route.ts's 'autofill' action (manual/UI-triggered)
// and app/api/events/stakeholders/announcements/generate/route.ts (the SAE
// generation pipeline). Extracted here rather than having the generate
// route fetch its own /api/canva/design endpoint over HTTP — same process,
// no reason to round-trip through the network.
import { supabaseAdmin } from '@/app/lib/supabase'

const CANVA_API = 'https://api.canva.com/rest/v1'

export async function getCanvaAccessToken(staffId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from('canva_tokens')
    .select('access_token, refresh_token, expires_at')
    .eq('staff_id', staffId)
    .single()

  if (!data) return null

  if (new Date(data.expires_at) < new Date()) {
    const res = await fetch('https://api.canva.com/rest/v1/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + Buffer.from(`${process.env.CANVA_CLIENT_ID}:${process.env.CANVA_CLIENT_SECRET}`).toString('base64'),
      },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: data.refresh_token }),
    })
    if (!res.ok) return null

    const tokens = await res.json()
    await supabaseAdmin
      .from('canva_tokens')
      .update({
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token || data.refresh_token,
        expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('staff_id', staffId)

    return tokens.access_token
  }

  return data.access_token
}

// Polls a Canva async job ({job: {status: 'in_progress'|'success'|'failed', ...}}
// shape, shared by asset-uploads / autofills / exports) until it leaves
// 'in_progress', or times out. Jobs typically resolve in a few seconds;
// 20 attempts x 1.5s gives real headroom without hanging a request forever.
async function pollCanvaJob<T extends { job: { status: string } }>(
  url: string, headers: Record<string, string>, maxAttempts = 20, intervalMs = 1500
): Promise<T> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const res = await fetch(url, { headers })
    if (!res.ok) throw new Error(`Canva job poll failed: ${await res.text()}`)
    const data = await res.json() as T
    if (data.job.status === 'success') return data
    if (data.job.status === 'failed') throw new Error('Canva job failed')
    await new Promise(resolve => setTimeout(resolve, intervalMs))
  }
  throw new Error('Canva job timed out')
}

export type CanvaAutofillField = { type: 'text' | 'image'; value?: string; asset_url?: string }

export async function runCanvaAutofill(
  token: string,
  templateDesignId: string,
  fields: Record<string, CanvaAutofillField>
): Promise<{ designId: string; downloadUrl: string }> {
  const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }

  const dataFields: Record<string, unknown> = {}
  for (const [name, field] of Object.entries(fields)) {
    if (field.type === 'text') {
      dataFields[name] = { type: 'text', text: field.value ?? '' }
      continue
    }
    if (!field.asset_url) throw new Error(`fields.${name}.asset_url required for image field`)

    const uploadRes = await fetch(`${CANVA_API}/asset-uploads`, {
      method: 'POST', headers,
      body: JSON.stringify({ upload_ref: { type: 'url', url: field.asset_url }, title: name }),
    })
    if (!uploadRes.ok) throw new Error(`Asset upload failed for ${name}: ${await uploadRes.text()}`)
    const uploadJob = await uploadRes.json() as { job: { id: string } }

    const uploadResult = await pollCanvaJob<{ job: { status: string; asset?: { id: string } } }>(
      `${CANVA_API}/asset-uploads/${uploadJob.job.id}`, headers
    )
    const assetId = uploadResult.job.asset?.id
    if (!assetId) throw new Error(`Asset upload did not complete for ${name}`)
    dataFields[name] = { type: 'image', asset_id: assetId }
  }

  const autofillRes = await fetch(`${CANVA_API}/autofills`, {
    method: 'POST', headers,
    body: JSON.stringify({ brand_template_id: templateDesignId, data: dataFields }),
  })
  if (!autofillRes.ok) throw new Error(`Autofill failed: ${await autofillRes.text()}`)
  const autofillJob = await autofillRes.json() as { job: { id: string } }

  const autofillResult = await pollCanvaJob<{ job: { status: string; result?: { design?: { id: string } } } }>(
    `${CANVA_API}/autofills/${autofillJob.job.id}`, headers
  )
  const designId = autofillResult.job.result?.design?.id
  if (!designId) throw new Error('Autofill did not produce a design')

  const exportRes = await fetch(`${CANVA_API}/exports`, {
    method: 'POST', headers,
    body: JSON.stringify({ design_id: designId, format: { type: 'png', quality: 'high', pages: [1] } }),
  })
  if (!exportRes.ok) throw new Error(`Export failed: ${await exportRes.text()}`)
  const exportJob = await exportRes.json() as { job: { id: string } }

  const exportResult = await pollCanvaJob<{ job: { status: string; urls?: string[] } }>(
    `${CANVA_API}/exports/${exportJob.job.id}`, headers
  )
  const downloadUrl = exportResult.job.urls?.[0]
  if (!downloadUrl) throw new Error('Export did not produce a download URL')

  return { designId, downloadUrl }
}
