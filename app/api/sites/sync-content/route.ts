import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

/* ─────────────────────────────────────────────────────────────────────────────
   POST /api/sites/sync-content
   Body: { event_id }

   Regenerates event.ts from the latest Event Pilot data (speakers, sponsors, brand,
   event details) and pushes ONLY that file to the existing GitHub repo.
   GitHub Actions picks up the push and rebuilds the Cloudflare Workers site.

   Returns: { ok, commit_url, sha }
───────────────────────────────────────────────────────────────────────────── */

const GH_TOKEN = process.env.GITHUB_TOKEN

async function gh(path: string, init?: RequestInit) {
  return fetch(`https://api.github.com${path}`, {
    ...init,
    cache: 'no-store',
    headers: {
      Authorization:          `Bearer ${GH_TOKEN}`,
      Accept:                 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type':         'application/json',
      ...((init?.headers as Record<string, string>) ?? {}),
    },
  })
}

export async function POST(req: NextRequest) {
  try {
    const { event_id } = await req.json()
    if (!event_id) return NextResponse.json({ error: 'event_id required' }, { status: 400 })
    if (!GH_TOKEN)  return NextResponse.json({ error: 'GITHUB_TOKEN not configured' }, { status: 500 })

    // 1. Look up existing deployment
    const { data: site } = await supabaseAdmin
      .from('event_sites')
      .select('repo_url, template_id')
      .eq('event_id', event_id)
      .maybeSingle()

    if (!site?.repo_url) {
      return NextResponse.json(
        { error: 'No deployed site found for this event. Deploy first from the Template tab.' },
        { status: 404 },
      )
    }

    // Parse owner/repo from repo_url: https://github.com/Owner/repo-name
    const [owner, repo] = site.repo_url.replace('https://github.com/', '').split('/')

    // 2. Fetch latest event data from Event Pilot
    const { data: templateRow } = await supabaseAdmin
      .from('site_templates').select('*').eq('id', site.template_id).single()
    const templateColors = templateRow
      ? { bg: templateRow.color_bg, accent: templateRow.color_accent, highlight: templateRow.color_highlight }
      : { bg: '#0f1923', accent: '#c0f43c', highlight: '#00a3a3' }

    const { data: event, error: eventErr } = await supabaseAdmin
      .from('events')
      .select('id, name, description, event_date, end_date, city, venue')
      .eq('id', event_id).single()
    if (eventErr || !event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    }

    const [{ data: webRow }, { data: brandLegacy }, { data: speakers }, { data: sponsors }] = await Promise.all([
      // event_websites has ALL brand fields set by the Brand tab (theme_primary, logos, fonts, hero)
      supabaseAdmin.from('event_websites')
        .select('subdomain, custom_domain, hero_video_url, theme_primary, theme_accent, theme_teal, logo_primary_url, logo_white_url, logo_horizontal_url, hero_bg_url, brand_font_heading, brand_font_body')
        .eq('event_id', event_id).maybeSingle(),
      // event_brand is from the AI brand generator — use as fallback if website brand not set
      supabaseAdmin.from('event_brand')
        .select('primary_color, accent_color, logo_url, logo_white_url, hero_image_url')
        .eq('event_id', event_id).maybeSingle(),
      supabaseAdmin.from('event_speakers')
        .select('name, title, company, photo_url, tier')
        .eq('event_id', event_id).eq('active', true).order('tier', { ascending: true }).limit(10),
      supabaseAdmin.from('event_sponsors')
        .select('name, logo_url, website, tier')
        .eq('event_id', event_id).eq('active', true).order('tier', { ascending: true }).limit(8),
    ])

    // 3. Build event.ts content (same structure as deploy route)
    const fmtDate = (iso: string | null) =>
      iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }).toUpperCase() : ''
    const dateStart   = event.event_date ? new Date(event.event_date) : null
    const dateEnd     = event.end_date   ? new Date(event.end_date)   : null
    const dateDisplay = dateStart && dateEnd
      ? `${dateStart.getDate()}–${fmtDate(event.end_date)}`
      : dateStart ? fmtDate(event.event_date) : 'DATE TBA'

    const eventSiteUrl = webRow?.custom_domain
      ? `https://${webRow.custom_domain}`
      : webRow?.subdomain ? `https://${webRow.subdomain}.tresconglobal.com`
      : 'https://tresconglobal.com'

    // Brand tab saves to event_websites; AI brand generator saves to event_brand — prefer website settings
    const bgColor     = webRow?.theme_primary  || brandLegacy?.primary_color  || templateColors.bg
    const accentColor = webRow?.theme_accent   || brandLegacy?.accent_color   || templateColors.accent
    const hlColor     = webRow?.theme_teal     || templateColors.highlight

    type Speaker = { name: string; title?: string; company?: string; photo_url?: string; tier?: string }
    type Sponsor = { name: string; logo_url?: string; website?: string; tier?: string }

    const speakersBlock = speakers?.length
      ? speakers.map((s: Speaker) =>
          `    { name: ${JSON.stringify(s.name)}, title: ${JSON.stringify(s.title || '')}, company: ${JSON.stringify(s.company || '')}, photo_url: ${JSON.stringify(s.photo_url || '')}, tier: ${JSON.stringify(s.tier || 'standard')} }`,
        ).join(',\n')
      : '    // No speakers yet'

    const sponsorsBlock = sponsors?.length
      ? sponsors.map((s: Sponsor) =>
          `    { name: ${JSON.stringify(s.name)}, logo_url: ${JSON.stringify(s.logo_url || '')}, website: ${JSON.stringify(s.website || '')}, tier: ${JSON.stringify(s.tier || 'standard')} }`,
        ).join(',\n')
      : '    // No sponsors yet'

    const config_ts = `// Generated by Event Pilot on ${new Date().toISOString().split('T')[0]}
// Template: ${templateRow?.label ?? site.template_id} | Event: ${event.name}
export const EVENT = {
  name:        ${JSON.stringify(event.name)},
  tagline:     "",
  description: ${JSON.stringify(event.description || '')},
  organiser:   "Trescon Global",
  date_display:   ${JSON.stringify(dateDisplay)},
  date_iso_start: ${JSON.stringify(event.event_date || '')},
  date_iso_end:   ${JSON.stringify(event.end_date || '')},
  venue_name:    ${JSON.stringify(event.venue || 'TBA')},
  venue_city:    ${JSON.stringify(event.city || '')},
  venue_country: "",
  venue_display: ${JSON.stringify([event.venue, event.city].filter(Boolean).join(' · ').toUpperCase())},
  venue_address: "",
  site_url:          ${JSON.stringify(eventSiteUrl)},
  register_url:      "",
  colors: { bg_primary: ${JSON.stringify(bgColor)}, accent: ${JSON.stringify(accentColor)}, highlight: ${JSON.stringify(hlColor)} },
  fonts: { heading: ${JSON.stringify(webRow?.brand_font_heading || '')}, body: ${JSON.stringify(webRow?.brand_font_body || '')} },
  assets: {
    logo:        ${JSON.stringify(webRow?.logo_primary_url  || brandLegacy?.logo_url       || '/logo.svg')},
    logo_white:  ${JSON.stringify(webRow?.logo_white_url    || brandLegacy?.logo_white_url  || '/logo-white.svg')},
    logo_horizontal: ${JSON.stringify(webRow?.logo_horizontal_url || '/logo-horizontal.svg')},
    hero_bg:     ${JSON.stringify(webRow?.hero_bg_url       || brandLegacy?.hero_image_url  || '')},
    hero_video:  ${JSON.stringify(webRow?.hero_video_url    || '/hero-bg.webm')},
    og_image:    "/og-image.jpg",
  },
  speakers_seed: [
${speakersBlock}
  ],
  sponsors_seed: [
${sponsorsBlock}
  ],
  footer: {
    email: "",
    copyright: \`© \${new Date().getFullYear()} Trescon Global. All rights reserved.\`,
  },
  seo: {
    title_default:  ${JSON.stringify(event.name)},
    description:    ${JSON.stringify(event.description || '')},
  },
  _ep: { event_id: ${JSON.stringify(event.id)}, template_id: ${JSON.stringify(site.template_id)}, generated: ${JSON.stringify(new Date().toISOString())} },
}
export type EventConfig = typeof EVENT
`

    // 4. Get current SHA of src/config/event.ts (required for Contents API update)
    const currentRes = await gh(`/repos/${owner}/${repo}/contents/src/config/event.ts?ref=main`)
    const currentFile = currentRes.ok
      ? await currentRes.json() as { sha: string }
      : null

    // 5. Push the updated file
    const putRes = await gh(`/repos/${owner}/${repo}/contents/src/config/event.ts`, {
      method: 'PUT',
      body: JSON.stringify({
        message: `sync: update event data (${new Date().toISOString().split('T')[0]})`,
        content: Buffer.from(config_ts).toString('base64'),
        branch:  'main',
        ...(currentFile?.sha ? { sha: currentFile.sha } : {}),
      }),
    })

    if (!putRes.ok) {
      const err = await putRes.text()
      return NextResponse.json(
        { error: `GitHub push failed: ${putRes.status} — ${err.slice(0, 300)}` },
        { status: 500 },
      )
    }

    const putData = await putRes.json() as { commit: { html_url: string; sha: string } }

    return NextResponse.json({
      ok:         true,
      commit_url: putData.commit?.html_url,
      sha:        putData.commit?.sha?.slice(0, 7),
    })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    )
  }
}
