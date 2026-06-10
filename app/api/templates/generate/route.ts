import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import type { TemplateInfo } from '../route'

/* POST /api/templates/generate
   Body: { event_id: string, template_id: string }

   Pulls event data from Event Pilot DB and generates a populated event.ts config
   that can be dropped into the chosen template's src/config/event.ts.
   Returns: { config_ts: string, template: TemplateInfo, event: object }
*/

export async function POST(req: NextRequest) {
  try {
    const { event_id, template_id } = await req.json()
    if (!event_id || !template_id) {
      return NextResponse.json({ error: 'event_id and template_id are required' }, { status: 400 })
    }

    // Look up template from DB
    const { data: templateRow } = await supabaseAdmin
      .from('site_templates')
      .select('*')
      .eq('id', template_id)
      .single()

    if (!templateRow) {
      return NextResponse.json({ error: `Unknown template: ${template_id}` }, { status: 400 })
    }

    const template: TemplateInfo = {
      id:           templateRow.id,
      label:        templateRow.label,
      event_name:   templateRow.event_name,
      description:  templateRow.description,
      preview_url:  templateRow.preview_url || '',
      repo_url:     templateRow.repo_url,
      folder_name:  templateRow.folder_name,
      tech:         templateRow.tech || [],
      pages:        templateRow.pages || [],
      style_tags:   templateRow.style_tags || [],
      color_scheme: { bg: templateRow.color_bg, accent: templateRow.color_accent, highlight: templateRow.color_highlight },
      sort_order:   templateRow.sort_order || 0,
    }

    // ── Fetch event core data ─────────────────────────────────────────────
    const { data: event, error: eventErr } = await supabaseAdmin
      .from('events')
      .select('id, name, tagline, description, start_date, end_date, city, country, venue_name, venue_address, website, contact_email, konfhub_event_id')
      .eq('id', event_id)
      .single()

    if (eventErr || !event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    }

    // ── Fetch brand data ──────────────────────────────────────────────────
    const { data: brand } = await supabaseAdmin
      .from('event_brand')
      .select('primary_color, accent_color, heading_font, body_font, logo_url, logo_white_url, logo_horizontal_url, hero_image_url')
      .eq('event_id', event_id)
      .maybeSingle()

    // ── Fetch website config ──────────────────────────────────────────────
    const { data: website } = await supabaseAdmin
      .from('event_websites')
      .select('subdomain, custom_domain, hero_video_url')
      .eq('event_id', event_id)
      .maybeSingle()

    // ── Fetch speakers (top 10 for seeding) ──────────────────────────────
    const { data: speakers } = await supabaseAdmin
      .from('event_speakers')
      .select('name, title, company, photo_url, tier')
      .eq('event_id', event_id)
      .order('tier', { ascending: true })
      .limit(10)

    // ── Fetch sponsors (top 8 for seeding) ───────────────────────────────
    const { data: sponsors } = await supabaseAdmin
      .from('event_sponsors')
      .select('name, logo_url, website, tier')
      .eq('event_id', event_id)
      .order('tier', { ascending: true })
      .limit(8)

    // ── Build date strings ─────────────────────────────────────────────────
    const fmtDate = (iso: string | null) => {
      if (!iso) return ''
      return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }).toUpperCase()
    }
    const dateStart = event.start_date ? new Date(event.start_date) : null
    const dateEnd   = event.end_date   ? new Date(event.end_date)   : null
    const dateDisplay = dateStart && dateEnd
      ? `${dateStart.getDate()}–${fmtDate(event.end_date)}`
      : dateStart ? fmtDate(event.start_date) : 'DATE TBA'

    // ── Build safe site URL ────────────────────────────────────────────────
    const siteUrl = website?.custom_domain
      ? `https://${website.custom_domain}`
      : website?.subdomain
        ? `https://${website.subdomain}.tresconglobal.com`
        : event.website || 'https://example.com'

    // ── Colors — fall back to template defaults ────────────────────────────
    const bgColor     = brand?.primary_color || template.color_scheme.bg
    const accentColor = brand?.accent_color  || template.color_scheme.accent
    const hlColor     = template.color_scheme.highlight

    // ── Generate the event.ts config ──────────────────────────────────────
    const speakersBlock = speakers?.length
      ? speakers.map((s: { name: string; title?: string; company?: string; photo_url?: string; tier?: string }) => `    { name: ${JSON.stringify(s.name)}, title: ${JSON.stringify(s.title || '')}, company: ${JSON.stringify(s.company || '')}, photo_url: ${JSON.stringify(s.photo_url || '')}, tier: ${JSON.stringify(s.tier || 'standard')} }`).join(',\n')
      : '    // No speakers yet — add from Event Pilot or directly here'

    const sponsorsBlock = sponsors?.length
      ? sponsors.map((s: { name: string; logo_url?: string; website?: string; tier?: string }) => `    { name: ${JSON.stringify(s.name)}, logo_url: ${JSON.stringify(s.logo_url || '')}, website: ${JSON.stringify(s.website || '')}, tier: ${JSON.stringify(s.tier || 'standard')} }`).join(',\n')
      : '    // No sponsors yet — add from Event Pilot or directly here'

    const configTs = `// ── Generated by Event Pilot on ${new Date().toISOString().split('T')[0]} ────────────────────────────────────────
// Template: ${template.label}
// Event:    ${event.name} (ID: ${event.id})
//
// INSTRUCTIONS:
// 1. Drop this file into src/config/event.ts in your template folder
// 2. Run: npm run dev  to preview
// 3. Edit any values directly — this is your single source of truth
// 4. Deploy: npx opennextjs-cloudflare build && npx wrangler deploy
// ─────────────────────────────────────────────────────────────────────────────

export const EVENT = {
  // ── Identity ──────────────────────────────────────────────────────────────
  name:        ${JSON.stringify(event.name)},
  short_name:  ${JSON.stringify(event.name.split(' ').map((w: string) => w[0]).join('').toUpperCase())},
  tagline:     ${JSON.stringify(event.tagline || '')},
  description: ${JSON.stringify(event.description || '')},
  organiser:   "Trescon Global",

  // ── Dates ─────────────────────────────────────────────────────────────────
  date_display:   ${JSON.stringify(dateDisplay)},
  date_iso_start: ${JSON.stringify(event.start_date || '')},
  date_iso_end:   ${JSON.stringify(event.end_date || '')},

  // ── Venue ─────────────────────────────────────────────────────────────────
  venue_name:    ${JSON.stringify(event.venue_name || 'TBA')},
  venue_city:    ${JSON.stringify(event.city || '')},
  venue_country: ${JSON.stringify(event.country || '')},
  venue_display: ${JSON.stringify([event.venue_name, event.city, event.country].filter(Boolean).join(' · ').toUpperCase())},
  venue_address: ${JSON.stringify(event.venue_address || '')},

  // ── URLs ──────────────────────────────────────────────────────────────────
  site_url:            ${JSON.stringify(siteUrl)},
  register_url:        ${event.konfhub_event_id ? JSON.stringify(`https://konfhub.com/checkout/${event.konfhub_event_id}`) : '""  // Add Konfhub ticket URL'},
  enquire_url:         "/enquire",
  cta_primary_label:   "Register Now",
  cta_secondary_label: "Enquire",

  // ── Brand Colors ─────────────────────────────────────────────────────────
  colors: {
    bg_primary: ${JSON.stringify(bgColor)},
    accent:     ${JSON.stringify(accentColor)},
    highlight:  ${JSON.stringify(hlColor)},
  },

  // ── Media Assets (upload to /public or use full Supabase URLs) ───────────
  assets: {
    logo:        ${JSON.stringify(brand?.logo_url || '/logo.svg')},
    logo_white:  ${JSON.stringify(brand?.logo_white_url || brand?.logo_url || '/logo-white.svg')},
    logo_h:      ${JSON.stringify(brand?.logo_horizontal_url || '')},
    hero_video:  ${JSON.stringify(website?.hero_video_url || '/hero-bg.webm')},
    hero_poster: ${JSON.stringify(brand?.hero_image_url || '/hero-poster.jpg')},
    og_image:    "/og-image.jpg",  // Replace with actual OG image
  },

  // ── Seeded Content (from Event Pilot DB — edit freely) ───────────────────────────
  speakers_seed: [
${speakersBlock}
  ],

  sponsors_seed: [
${sponsorsBlock}
  ],

  // ── Footer ────────────────────────────────────────────────────────────────
  footer: {
    email: ${JSON.stringify(event.contact_email || '')},
    copyright: \`© \${new Date().getFullYear()} Trescon Global. All rights reserved.\`,
  },

  // ── SEO ───────────────────────────────────────────────────────────────────
  seo: {
    title_default:  ${JSON.stringify(`${event.name} | ${event.tagline || event.description?.slice(0, 60) || ''}`)},
    title_template: ${JSON.stringify(`%s | ${event.name}`)},
    description:    ${JSON.stringify(event.description || '')},
  },

  // ── Event Pilot metadata (do not edit) ───────────────────────────────────────────
  _taos: {
    event_id:    ${JSON.stringify(event.id)},
    template_id: ${JSON.stringify(template_id)},
    generated:   ${JSON.stringify(new Date().toISOString())},
  },
}

export type EventConfig = typeof EVENT
`

    return NextResponse.json({
      config_ts:  configTs,
      template,
      event: {
        id:    event.id,
        name:  event.name,
        brand: { primary_color: bgColor, accent_color: accentColor },
        assets: {
          logo:       brand?.logo_url,
          logo_white: brand?.logo_white_url,
          hero_image: brand?.hero_image_url,
          hero_video: website?.hero_video_url,
        },
      },
      shell_command: `node ~/taos-templates/generate-site.mjs --template ${template_id} --name ${event.name.toLowerCase().replace(/\s+/g, '-')} --event-id ${event.id} --api-url https://taos.trescon.com`,
      instructions: [
        `1. Run the generator (one command does everything):`,
        `   node ~/taos-templates/generate-site.mjs --template ${template_id} --name ${event.name.toLowerCase().replace(/\s+/g, '-')} --event-id ${event.id} --api-url https://taos.trescon.com`,
        `2. Preview: cd ~/my-events/${event.name.toLowerCase().replace(/\s+/g, '-')} && npm run dev`,
        `3. Edit in Claude Code — change anything in src/config/event.ts or components`,
        `4. Deploy to Cloudflare: npm run build && npx wrangler deploy`,
      ],
    })

  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
