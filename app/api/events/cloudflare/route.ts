import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

/*
  POST /api/events/cloudflare
  Body: { website_id, cf_token, cf_zone_id, domain }

  Creates a CNAME DNS record for a custom domain and saves custom_domain +
  cf_zone_id to the event_websites record.

  NOTE (Site Operations Phase 0, 13 Sep 2026): this previously derived its
  CNAME target from event_sites.worker_name, a table from an abandoned
  site-deploy pipeline that was dropped after confirming it had 0 rows in
  production (see docs/EventPilot-SiteOps-Build-Spec-v1.1.md). That lookup
  always failed and silently fell back to a Vercel hostname that has not
  existed since Vercel was removed 18 Jun 2026 — so this endpoint has likely
  never written a working DNS record. Rather than guess another wrong target,
  it now requires the caller to supply one explicitly, until the Site
  Registry (Phase 1) can resolve it from a real, verified hosting record.

  The CF API token is never stored — used only for this one-time call.
*/

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const { website_id, cf_token, cf_zone_id, domain, cname_target } = body ?? {}

  if (!website_id || !cf_token || !cf_zone_id || !domain) {
    return NextResponse.json({ error: 'website_id, cf_token, cf_zone_id, and domain are required' }, { status: 400 })
  }

  if (!cname_target) {
    return NextResponse.json({
      error: 'Custom domain automation is temporarily unavailable: no verified hosting target for this site. This is being rebuilt as part of the Site Registry — pass cname_target explicitly to proceed manually in the meantime.',
    }, { status: 400 })
  }

  const cnameTarget = cname_target as string

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
