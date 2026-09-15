import { supabaseAdmin } from '@/app/lib/supabase'
import { getGoogleServiceAccountToken } from '@/app/lib/security/google-service-account-auth'

/* Site Operations module, Phase 3 — health check functions. Each one is
   independent and best-effort: a site with no GA4/Search Console
   connection yet doesn't fail, it warns (a site can be legitimately
   mid-commissioning). See docs/EventPilot-SiteOps-Build-Spec-v1.1.md
   section 5.6 for the full eventual check list — this covers the four the
   build order calls out first ("highest assurance per line of code"),
   plus site_reachable since it's essentially free.

   v1.4: GA4/Search Console auth is a single shared service account, not
   a per-account OAuth connection — see google-service-account-auth.ts.

   `private_routes_excluded` is intentionally partial: without a per-route
   indexing registry (that's the SEO & Discovery phase, not built yet),
   this can only check that robots.txt exists and isn't blanket-disallowing
   the whole site — real signal, but not the full per-route check the spec
   describes. Don't read a 'pass' here as "every private route is
   confirmed excluded." */

export type CheckStatus = 'pass' | 'warn' | 'fail'
export type CheckResult = { checkKey: string; status: CheckStatus; detail: string }

type SiteRow = {
  id: string
  live_url: string | null
}

async function fetchWithTimeout(url: string, ms = 10000): Promise<Response> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), ms)
  try {
    return await fetch(url, { signal: controller.signal, redirect: 'follow' })
  } finally {
    clearTimeout(timeout)
  }
}

async function checkSiteReachable(site: SiteRow): Promise<CheckResult> {
  if (!site.live_url) return { checkKey: 'site_reachable', status: 'warn', detail: 'No live URL registered yet.' }
  try {
    const res = await fetchWithTimeout(site.live_url)
    if (res.ok) return { checkKey: 'site_reachable', status: 'pass', detail: `HTTP ${res.status}` }
    return { checkKey: 'site_reachable', status: 'fail', detail: `HTTP ${res.status}` }
  } catch (e) {
    return { checkKey: 'site_reachable', status: 'fail', detail: e instanceof Error ? e.message : 'Request failed' }
  }
}

export async function checkGa4Receiving(siteId: string): Promise<CheckResult> {
  const { data: conn } = await supabaseAdmin
    .from('site_connections')
    .select('property_ref, stream_ref, status')
    .eq('site_id', siteId).eq('provider', 'ga4')
    .maybeSingle()

  if (!conn?.property_ref) return { checkKey: 'ga4_receiving', status: 'warn', detail: 'GA4 not connected for this site yet.' }

  const accessToken = await getGoogleServiceAccountToken()
  if (!accessToken) return { checkKey: 'ga4_receiving', status: 'warn', detail: 'Google service account not configured.' }

  const res = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${conn.property_ref}:runReport`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      dateRanges: [{ startDate: '1daysAgo', endDate: 'today' }],
      metrics: [{ name: 'eventCount' }],
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    return { checkKey: 'ga4_receiving', status: 'fail', detail: err?.error?.message ?? `GA4 Data API error (HTTP ${res.status})` }
  }

  const data = await res.json() as { rows?: { metricValues?: { value?: string }[] }[] }
  const count = Number(data.rows?.[0]?.metricValues?.[0]?.value ?? 0)
  if (count > 0) return { checkKey: 'ga4_receiving', status: 'pass', detail: `${count} events in the last 24h` }
  return { checkKey: 'ga4_receiving', status: 'warn', detail: 'Connected, but no hits in the last 24h.' }
}

export async function checkSearchConsoleVerified(siteId: string): Promise<CheckResult> {
  const { data: conn } = await supabaseAdmin
    .from('site_connections')
    .select('property_ref')
    .eq('site_id', siteId).eq('provider', 'search_console')
    .maybeSingle()

  if (!conn?.property_ref) return { checkKey: 'search_console_verified', status: 'warn', detail: 'Search Console not connected for this site yet.' }

  const accessToken = await getGoogleServiceAccountToken()
  if (!accessToken) return { checkKey: 'search_console_verified', status: 'warn', detail: 'Google service account not configured.' }

  const res = await fetch(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(conn.property_ref)}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    return { checkKey: 'search_console_verified', status: 'fail', detail: err?.error?.message ?? `Search Console API error (HTTP ${res.status})` }
  }

  const data = await res.json() as { permissionLevel?: string }
  if (data.permissionLevel && data.permissionLevel !== 'siteUnverifiedUser') {
    return { checkKey: 'search_console_verified', status: 'pass', detail: data.permissionLevel }
  }
  return { checkKey: 'search_console_verified', status: 'fail', detail: 'Property found but not verified.' }
}

async function checkSchemaValid(site: SiteRow): Promise<CheckResult> {
  if (!site.live_url) return { checkKey: 'schema_valid', status: 'warn', detail: 'No live URL registered yet.' }
  let html: string
  try {
    const res = await fetchWithTimeout(site.live_url)
    html = await res.text()
  } catch (e) {
    return { checkKey: 'schema_valid', status: 'fail', detail: e instanceof Error ? e.message : 'Could not fetch page.' }
  }

  const matches = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
  if (matches.length === 0) return { checkKey: 'schema_valid', status: 'warn', detail: 'No structured data (JSON-LD) found.' }

  let hasEventSchema = false
  for (const m of matches) {
    try {
      const parsed = JSON.parse(m[1])
      const entries = Array.isArray(parsed) ? parsed : [parsed]
      for (const entry of entries) {
        const type = entry?.['@type']
        const types = Array.isArray(type) ? type : [type]
        if (types.some((t: unknown) => typeof t === 'string' && t.toLowerCase().includes('event'))) {
          hasEventSchema = entry.name && (entry.startDate || entry.location) ? true : hasEventSchema
        }
      }
    } catch {
      return { checkKey: 'schema_valid', status: 'fail', detail: 'Structured data present but unparseable JSON.' }
    }
  }

  if (hasEventSchema) return { checkKey: 'schema_valid', status: 'pass', detail: 'Valid Event structured data found.' }
  return { checkKey: 'schema_valid', status: 'warn', detail: 'Structured data present, but no complete Event schema.' }
}

async function checkPrivateRoutesExcluded(site: SiteRow): Promise<CheckResult> {
  if (!site.live_url) return { checkKey: 'private_routes_excluded', status: 'warn', detail: 'No live URL registered yet.' }
  let robotsUrl: string
  try {
    robotsUrl = new URL('/robots.txt', site.live_url).toString()
  } catch {
    return { checkKey: 'private_routes_excluded', status: 'warn', detail: 'Could not resolve robots.txt URL.' }
  }

  let text: string
  try {
    const res = await fetchWithTimeout(robotsUrl)
    if (!res.ok) return { checkKey: 'private_routes_excluded', status: 'warn', detail: 'robots.txt not found.' }
    text = await res.text()
  } catch (e) {
    return { checkKey: 'private_routes_excluded', status: 'warn', detail: e instanceof Error ? e.message : 'Could not fetch robots.txt.' }
  }

  const blanketDisallow = /user-agent:\s*\*[\s\S]*?disallow:\s*\/\s*(\n|$)/i.test(text)
  if (blanketDisallow) return { checkKey: 'private_routes_excluded', status: 'fail', detail: 'robots.txt disallows the entire site.' }
  return { checkKey: 'private_routes_excluded', status: 'pass', detail: 'robots.txt present, not blanket-disallowing (partial check only — no per-route registry yet).' }
}

export async function runHealthChecks(site: SiteRow): Promise<CheckResult[]> {
  return Promise.all([
    checkSiteReachable(site),
    checkGa4Receiving(site.id),
    checkSearchConsoleVerified(site.id),
    checkSchemaValid(site),
    checkPrivateRoutesExcluded(site),
  ])
}
