import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

/*
  POST /api/events/cloudflare
  Body: { website_id, cf_token, cf_zone_id, domain }

  1. Calls Cloudflare API to create a CNAME DNS record:
       domain → CNAME → eventpilot-trescons-projects.vercel.app (proxied)
  2. Saves custom_domain + cf_zone_id to event_websites record.

  The CF API token is never stored — used only for this one-time call.
*/

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const { website_id, cf_token, cf_zone_id, domain } = body ?? {}

  if (!website_id || !cf_token || !cf_zone_id || !domain) {
    return NextResponse.json({ error: 'website_id, cf_token, cf_zone_id, and domain are required' }, { status: 400 })
  }

  // Look up the deployed site to get the Workers URL as CNAME target
  const { data: websiteRecord } = await supabaseAdmin
    .from('event_websites')
    .select('event_id')
    .eq('id', website_id)
    .single()

  let cnameTarget = 'cname.vercel-dns.com' // fallback
  if (websiteRecord?.event_id) {
    const { data: siteRecord } = await supabaseAdmin
      .from('event_sites')
      .select('worker_name, site_url')
      .eq('event_id', websiteRecord.event_id)
      .single()
    if (siteRecord?.worker_name) {
      // Cloudflare Workers custom domains need a CNAME to the workers.dev subdomain
      cnameTarget = `${siteRecord.worker_name}.workers.dev`
    }
  }

  // Normalise domain — strip protocol and trailing slash
  const cleanDomain = domain.replace(/^https?:\/\//i, '').replace(/\/$/, '').toLowerCase()

  // Determine CNAME record name: root (@) or subdomain
  // e.g. "vault2047.com" → name = "@"
  //      "www.vault2047.com" → name = "www"
  //      "event.vault2047.com" → name = "event"
  // Cloudflare expects the full subdomain or "@" for root.
  const recordName = cleanDomain  // Cloudflare accepts the full domain as name

  // ── Call Cloudflare API ──────────────────────────────────────────────
  const cfUrl = `https://api.cloudflare.com/client/v4/zones/${cf_zone_id}/dns_records`

  // First check if record already exists
  const listRes = await fetch(`${cfUrl}?name=${encodeURIComponent(cleanDomain)}&type=CNAME`, {
    headers: {
      'Authorization': `Bearer ${cf_token}`,
      'Content-Type': 'application/json',
    },
  })
  const listData = await listRes.json()

  let cfResult
  const existing = listData?.result?.[0]

  if (existing) {
    // Update existing record
    const updateRes = await fetch(`${cfUrl}/${existing.id}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${cf_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'CNAME',
        name: recordName,
        content: cnameTarget,
        proxied: true,
        ttl: 1,
      }),
    })
    cfResult = await updateRes.json()
  } else {
    // Create new record
    const createRes = await fetch(cfUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${cf_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'CNAME',
        name: recordName,
        content: cnameTarget,
        proxied: true,
        ttl: 1,
      }),
    })
    cfResult = await createRes.json()
  }

  if (!cfResult?.success) {
    const errMsg = cfResult?.errors?.[0]?.message ?? 'Cloudflare API error'
    return NextResponse.json({ error: errMsg, details: cfResult?.errors }, { status: 400 })
  }

  // ── Save domain + zone to DB ────────────────────────────────────────
  const { error: dbErr } = await supabaseAdmin
    .from('event_websites')
    .update({ custom_domain: cleanDomain, cf_zone_id })
    .eq('id', website_id)

  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 })

  return NextResponse.json({
    ok: true,
    domain: cleanDomain,
    record_id: cfResult.result?.id,
    message: `CNAME record created: ${cleanDomain} → ${cnameTarget}`,
  })
}
