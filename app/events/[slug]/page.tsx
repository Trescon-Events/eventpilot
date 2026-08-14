import { notFound } from 'next/navigation'
import { cookies } from 'next/headers'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getDefaultFaviconUrl, getDefaultSocialShareImageUrl } from '@/app/lib/branding/email-header'
import type { PageStructure, Section, SectionDesign, SectionItem } from '@/app/lib/event-page-types'
import { defaultFooter } from '@/app/lib/event-page-types'
import AgendaTabs          from './sections/AgendaTabs'
import SpeakerTabs         from './sections/SpeakerTabs'
import PartnerTabs         from './sections/PartnerTabs'
import CountdownTimer      from './sections/CountdownTimer'
import TestimonialsSection from './sections/TestimonialsSection'
import FAQAccordion        from './sections/FAQAccordion'
import LogoTicker          from './sections/LogoTicker'
import GallerySection      from './sections/GallerySection'
import VideoEmbed          from './sections/VideoEmbed'
import ScheduleTimeline    from './sections/ScheduleTimeline'

// ── Types ─────────────────────────────────────────────────────────────────────
type Speaker  = { id: string; name: string; role: string|null; company: string|null; bio: string|null; photo_url: string|null; linkedin_url: string|null; tier: string; session_title: string|null }
type Agenda   = { id: string; day: number; time_slot: string|null; title: string; description: string|null; speaker_name: string|null; type: string; track: string|null }
type Sponsor  = { id: string; name: string; tier: string; logo_url: string|null; website_url: string|null }
type Website  = {
  id: string; event_id: string; slug: string; status: string
  hero_headline: string|null; hero_subheadline: string|null
  hero_bg_url: string|null; hero_video_url: string|null
  hero_cta_label: string|null; hero_cta_url: string|null
  about_title: string|null; about_body: string|null
  stat_attendees: string|null; stat_speakers: string|null; stat_exhibitors: string|null; stat_countries: string|null
  venue_name: string|null; venue_city: string|null; venue_address: string|null; venue_date_display: string|null
  theme_primary: string; theme_accent: string; theme_teal: string
  media_kit_url: string|null; brand_kit_url: string|null
  logo_white_url: string|null; logo_primary_url: string|null; logo_horizontal_url: string|null; logo_dark_url: string|null
  pattern_1_url: string|null; pattern_2_url: string|null; pattern_3_url: string|null; pattern_4_url: string|null; pattern_5_url: string|null
  brand_font_heading: string|null; brand_font_body: string|null
  page_structure_full: PageStructure | null
  draft_structure: PageStructure | null
}

/*
  Preview mode — Khalifat review 6c2d9724. The Publish tab embeds this
  route in an iframe so admins can preview the site before it's live.
  Previously that iframe 404'd because the route required status='live'.
  Now the route also honours `?preview=1` for signed-in admins: it skips
  the status filter and prefers draft_structure when present.
*/
async function isAdminPreview(): Promise<boolean> {
  try {
    const store = await cookies()
    const raw = store.get('tcs_session')?.value
    if (!raw) return false
    const s = JSON.parse(Buffer.from(raw, 'base64').toString('utf-8'))
    return s?.adm === true || !!s?.sid
  } catch { return false }
}
// event_date deliberately excluded — it's the Staff Portal project's
// staff-allocation window, not the event's actual dates (Madhu,
// 2026-08-13). public_dates_display (Event Details page) is the real
// source for the free-text date badge; there's no structured public date
// field yet, so the countdown widget (below) requires an explicit
// per-section custom_body instead of ever falling back to event_date.
type EventRow = { name: string; public_dates_display: string|null; city: string|null; description: string|null }

function groupBy<T extends Record<string,unknown>>(arr: T[], key: keyof T) {
  return arr.reduce<Record<string, T[]>>((acc, item) => {
    const k = String(item[key]); acc[k] = [...(acc[k]??[]),item]; return acc
  }, {})
}

// ── Section design → CSS ──────────────────────────────────────────────────────
function designStyle(d: SectionDesign, patterns: Record<string, string|null>): React.CSSProperties {
  const pad = d.padding === 'compact' ? '48px 0' : d.padding === 'spacious' ? '120px 0' : '80px 0'
  const color = d.text_light ? 'rgba(240,237,232,0.9)' : '#0F1923'
  const base: React.CSSProperties = { padding: pad, color }
  if (d.bg_type === 'colour')      return { ...base, background: d.bg_value }
  if (d.bg_type === 'gradient')    return { ...base, background: `linear-gradient(135deg, ${d.bg_value}ee 0%, ${d.bg_value}66 100%)` }
  if (d.bg_type === 'transparent') return { ...base, background: 'transparent' }
  if (d.bg_type === 'image')       return { ...base, backgroundImage: `url(${d.bg_value})`, backgroundSize: 'cover', backgroundPosition: 'center' }
  if (d.bg_type === 'pattern') {
    const url = patterns[d.bg_value]
    return url ? { ...base, backgroundImage: `url(${url})`, backgroundSize: 'cover', backgroundPosition: 'center' } : { ...base, background: 'transparent' }
  }
  return base
}

function wrapStyle(sec: Section): React.CSSProperties {
  return sec.design.full_width
    ? { padding: '0 40px' }
    : { maxWidth: '1200px', margin: '0 auto', padding: '0 40px' }
}

// ── Social icon helper (inline SVG JSX, no dangerouslySetInnerHTML) ───────────
function getSocialIcon(platform: string) {
  switch (platform) {
    case 'linkedin':
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
          <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/>
          <rect x="2" y="9" width="4" height="12"/>
          <circle cx="4" cy="4" r="2"/>
        </svg>
      )
    case 'twitter':
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
        </svg>
      )
    case 'instagram':
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <rect x="2" y="2" width="20" height="20" rx="5"/>
          <circle cx="12" cy="12" r="4"/>
          <circle cx="17.5" cy="6.5" r="0.5" fill="currentColor"/>
        </svg>
      )
    case 'youtube':
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
          <path d="M22.54 6.42a2.78 2.78 0 0 0-1.95-1.96C18.88 4 12 4 12 4s-6.88 0-8.59.46A2.78 2.78 0 0 0 1.46 6.42 29 29 0 0 0 1 12a29 29 0 0 0 .46 5.58 2.78 2.78 0 0 0 1.95 1.96C5.12 20 12 20 12 20s6.88 0 8.59-.46a2.78 2.78 0 0 0 1.96-1.96A29 29 0 0 0 23 12a29 29 0 0 0-.46-5.58z"/>
          <polygon points="9.75 15.02 15.5 12 9.75 8.98 9.75 15.02" fill="white"/>
        </svg>
      )
    case 'facebook':
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
          <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/>
        </svg>
      )
    default:
      return null
  }
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default async function EventPublicPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ preview?: string }>
}) {
  const { slug } = await params
  const sp = await searchParams
  const previewRequested = sp?.preview === '1' || sp?.preview === 'true'
  const preview = previewRequested && await isAdminPreview()

  // In preview mode (admin session + ?preview=1), skip the status='live'
  // filter so unpublished drafts render for admins previewing before publish.
  let query = supabaseAdmin
    .from('event_websites')
    .select('*, events(name, public_dates_display, city, description)')
    .eq('slug', slug)
  if (!preview) query = query.eq('status', 'live')

  const { data: web, error } = await query.single()

  if (error || !web) notFound()
  const w  = web as Website
  const ev = (web as { events: EventRow|null }).events

  // Preview mode should render the draft in progress; fall back to
  // page_structure_full if there's no separate draft.
  if (preview && w.draft_structure) {
    w.page_structure_full = w.draft_structure
  }

  const P = w.theme_primary || '#080A0C'
  const A = w.theme_accent  || '#E07B2C'
  const T = w.theme_teal    || '#00B4B0'

  const patterns: Record<string, string|null> = {
    '1': w.pattern_1_url, '2': w.pattern_2_url, '3': w.pattern_3_url,
    '4': w.pattern_4_url, '5': w.pattern_5_url,
  }

  const logos: Record<string, string|null> = {
    primary:    w.logo_primary_url,
    white:      w.logo_white_url,
    horizontal: w.logo_horizontal_url,
    dark:       w.logo_dark_url,
  }

  const eventDate = ev?.public_dates_display ?? null

  // Normalize: some legacy rows store page_structure_full as an empty
  // object {} instead of null. Treat missing `pages` array as null so
  // downstream logic doesn't crash on ps.pages.find(...).
  const rawPs = w.page_structure_full ?? null
  const ps = rawPs && Array.isArray((rawPs as PageStructure).pages) ? rawPs : null
  const ft = ps?.footer ?? defaultFooter(P)

  // ── Fonts ──────────────────────────────────────────────────────────────────
  const headingFont = w.brand_font_heading ?? 'Inter'
  const bodyFont    = w.brand_font_body    ?? 'Inter'
  const useFonts    = !!(w.brand_font_heading || w.brand_font_body)

  // ── CSS ───────────────────────────────────────────────────────────────────
  const css = `
    *,*::before,*::after{box-sizing:border-box}
    .ev-root{font-family:'${bodyFont}',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:${P};color:rgba(240,237,232,.9);margin:0;min-height:100vh}
    .ev-root h1,.ev-root h2,.ev-root h3,.ev-root h4,.ev-h1,.ev-h2{font-family:'${headingFont}',-apple-system,sans-serif}
    .ev-root a{color:inherit;text-decoration:none}
    .ev-root img{max-width:100%}
    /* Nav */
    .ev-nav{position:sticky;top:0;z-index:100;background:rgba(8,10,12,.92);backdrop-filter:blur(12px);border-bottom:1px solid rgba(240,237,232,.06);height:64px;display:flex;align-items:center;padding:0 40px;justify-content:space-between}
    .ev-nav-logo{font-size:18px;font-weight:900;letter-spacing:-.03em;color:rgba(240,237,232,1)}
    .ev-nav-cta{display:inline-flex;align-items:center;padding:9px 20px;border-radius:8px;background:${A};color:#fff;font-size:13px;font-weight:700;white-space:nowrap}
    .ev-nav-link{font-size:13px;color:rgba(240,237,232,.6);font-weight:500;transition:color .15s;white-space:nowrap}
    .ev-nav-link:hover,.ev-nav-link.ev-active{color:${A}}
    .ev-nav-links{display:flex;gap:24px;align-items:center}
    /* Page hero */
    .ev-page-hero{position:relative;overflow:hidden}
    .ev-page-hero-inner{position:relative;z-index:2;padding:80px 40px}
    .ev-page-hero-overlay{position:absolute;inset:0;background:rgba(8,10,12,.5)}
    .ev-eyebrow{font-size:11px;font-weight:800;letter-spacing:.18em;text-transform:uppercase;color:${A};margin-bottom:16px}
    .ev-h1{font-size:clamp(32px,4vw,56px);font-weight:900;letter-spacing:-.03em;margin:0;line-height:1.05}
    .ev-h2{font-size:clamp(28px,3.5vw,44px);font-weight:900;letter-spacing:-.03em;margin:0 0 20px}
    .ev-body{font-size:16px;line-height:1.8;color:rgba(240,237,232,.65)}
    .ev-label{font-size:11px;font-weight:800;letter-spacing:.18em;text-transform:uppercase;color:${A};margin-bottom:16px}
    /* Stats */
    .ev-stats{display:flex;border-top:1px solid rgba(240,237,232,.06);border-bottom:1px solid rgba(240,237,232,.06)}
    .ev-stat{flex:1;padding:28px 32px;text-align:center;border-right:1px solid rgba(240,237,232,.06)}
    .ev-stat:last-child{border-right:none}
    .ev-stat-num{font-size:clamp(28px,4vw,44px);font-weight:900;color:${T};letter-spacing:-.04em;line-height:1;margin-bottom:6px;font-variant-numeric:tabular-nums}
    .ev-stat-label{font-size:12px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:rgba(240,237,232,.4)}
    /* Responsive */
    @media(max-width:768px){
      .ev-nav{padding:0 20px}
      .ev-nav-links{gap:16px}
      .ev-page-hero-inner{padding:60px 20px}
      .ev-stats{flex-wrap:wrap}
      .ev-stat{min-width:50%}
      .ev-h1{font-size:clamp(28px,7vw,48px)}
    }
    @media(max-width:480px){
      .ev-nav-links .ev-nav-link:not(:last-child){display:none}
    }
  `

  // ── Fetch data needed for home page sections ───────────────────────────────
  const homePage = ps?.pages?.find(p => p.slug === '')
  const homeTypes = homePage?.sections.map(s => s.type) ?? []

  const needsSpeakers = homeTypes.includes('speakers')
  const needsAgenda   = homeTypes.some(t => t === 'agenda' || t === 'schedule')
  const needsPartners = homeTypes.some(t => t === 'partners' || t === 'logo_ticker')

  // If no page_structure_full, always fetch all for legacy fallback
  const fetchAll = !ps

  const [spRes, agRes, spnRes] = await Promise.all([
    (needsSpeakers || fetchAll) ? supabaseAdmin.from('event_speakers').select('id,name,role,company,bio,photo_url,linkedin_url,tier,session_title')
      .eq('event_id', w.event_id).eq('active', true).eq('status', 'approved')
      .order('tier').order('order_index').order('name') : Promise.resolve({ data: [] }),
    (needsAgenda || fetchAll) ? supabaseAdmin.from('event_agenda').select('id,day,time_slot,title,description,speaker_name,type,track')
      .eq('event_id', w.event_id).eq('active', true).order('day').order('order_index').order('time_slot') : Promise.resolve({ data: [] }),
    (needsPartners || fetchAll) ? supabaseAdmin.from('event_sponsors').select('id,name,tier,logo_url,website_url')
      .eq('event_id', w.event_id).eq('active', true).order('order_index').order('name') : Promise.resolve({ data: [] }),
  ])

  const speakers = (spRes.data ?? []) as Speaker[]
  const agenda   = (agRes.data ?? []) as Agenda[]
  const sponsors = (spnRes.data ?? []) as Sponsor[]
  const agByDay  = groupBy(agenda, 'day')

  // ── Section renderer (home page — includes hero) ──────────────────────────
  function renderSection(sec: Section) {
    if (!sec.enabled) return null
    const ds = designStyle(sec.design, patterns)
    const ws = wrapStyle(sec)
    const ta = sec.text_align === 'left' ? 'left' : 'center'
    const items: SectionItem[] = sec.items ?? []

    switch (sec.type) {

      // ── Full-screen Hero ──────────────────────────────────────────────────
      case 'hero': {
        const logoUrl = sec.logo_slot && sec.logo_slot !== 'none' ? logos[sec.logo_slot] ?? null : null
        const logoH   = { sm: '40px', md: '64px', lg: '96px' }[sec.logo_size ?? 'md']
        const ov      = (sec.overlay_opacity ?? 55) / 100
        return (
          <section key={sec.id} style={{ position: 'relative', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: ta === 'center' ? 'center' : 'flex-start', justifyContent: 'center', overflow: 'hidden', ...designStyle(sec.design, patterns) }}>
            {/* background image */}
            {sec.design.bg_type === 'image' && sec.design.bg_value && (
              <div style={{ position: 'absolute', inset: 0, backgroundImage: `url(${sec.design.bg_value})`, backgroundSize: 'cover', backgroundPosition: 'center', opacity: 0.7 }} />
            )}
            {/* fallback hero_bg_url */}
            {sec.design.bg_type !== 'image' && w.hero_bg_url && !w.hero_video_url && (
              <div style={{ position: 'absolute', inset: 0, backgroundImage: `url(${w.hero_bg_url})`, backgroundSize: 'cover', backgroundPosition: 'center', opacity: 0.55 }} />
            )}
            {w.hero_video_url && (
              <video autoPlay muted loop playsInline style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.55 }} src={w.hero_video_url} />
            )}
            {/* overlay */}
            <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(180deg, rgba(8,10,12,${ov * 0.5}) 0%, rgba(8,10,12,${ov}) 60%, ${P} 100%)`, pointerEvents: 'none' }} />
            {/* content */}
            <div style={{ position: 'relative', zIndex: 2, textAlign: ta as 'center'|'left', padding: '0 40px', maxWidth: ta === 'center' ? '860px' : '800px', width: '100%', margin: ta === 'center' ? '0 auto' : '0', paddingLeft: ta === 'left' ? '80px' : '40px' }}>
              {logoUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoUrl} alt="" style={{ height: logoH, maxWidth: '280px', objectFit: 'contain', marginBottom: '32px', display: ta === 'center' ? 'block' : 'inline-block', margin: ta === 'center' ? '0 auto 32px' : '0 0 32px' }} />
              )}
              {sec.show_venue_badge && (w.venue_date_display || eventDate || ev?.city) && (
                <div style={{ fontSize: '12px', fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase', color: A, marginBottom: '24px' }}>
                  {w.venue_date_display || [eventDate, ev?.city].filter(Boolean).join(' · ')}
                </div>
              )}
              <h1 style={{ fontSize: 'clamp(36px,5.5vw,72px)', fontWeight: 900, letterSpacing: '-0.04em', lineHeight: 1, margin: '0 0 24px', color: sec.design.text_light ? 'rgba(240,237,232,1)' : '#0F1923' }}>
                {w.hero_headline || ev?.name}
              </h1>
              {w.hero_subheadline && (
                <p style={{ fontSize: 'clamp(15px,2vw,20px)', lineHeight: 1.6, color: sec.design.text_light ? 'rgba(240,237,232,0.7)' : 'rgba(15,25,35,0.7)', margin: '0 0 40px' }}>
                  {w.hero_subheadline}
                </p>
              )}
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: ta === 'center' ? 'center' : 'flex-start' }}>
                {(sec.custom_body || w.hero_cta_url) && (
                  <a href={sec.custom_body || w.hero_cta_url || '#'} target="_blank" rel="noreferrer"
                    style={{ display: 'inline-flex', padding: '16px 36px', borderRadius: '10px', background: A, color: '#fff', fontSize: '15px', fontWeight: 800, textDecoration: 'none' }}>
                    {sec.custom_title || w.hero_cta_label || 'Register Now'}
                  </a>
                )}
                {sec.cta2_href && (
                  <a href={sec.cta2_href.startsWith('http') ? sec.cta2_href : `/events/${w.slug}/${sec.cta2_href}`}
                    style={{ display: 'inline-flex', padding: '16px 36px', borderRadius: '10px', border: '1px solid rgba(240,237,232,0.2)', color: 'rgba(240,237,232,0.85)', fontSize: '15px', fontWeight: 700, textDecoration: 'none' }}>
                    {sec.cta2_label || 'Learn More'}
                  </a>
                )}
              </div>
            </div>
          </section>
        )
      }

      // ── Page Header ───────────────────────────────────────────────────────
      case 'page_hero': {
        const logoUrl  = sec.logo_slot && sec.logo_slot !== 'none' ? logos[sec.logo_slot] : null
        const logoH    = { sm: '40px', md: '64px', lg: '96px' }[sec.logo_size ?? 'md']
        const hasBg    = ds.backgroundImage
        const opacity  = (sec.overlay_opacity ?? 50) / 100
        return (
          <section key={sec.id} className="ev-page-hero" style={ds}>
            {hasBg && <div className="ev-page-hero-overlay" style={{ background: `rgba(8,10,12,${opacity})` }} />}
            <div className="ev-page-hero-inner" style={{ textAlign: ta }}>
              {logoUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoUrl} alt="" style={{ height: logoH, maxWidth: '240px', objectFit: 'contain', marginBottom: '28px', display: ta === 'center' ? 'block' : 'inline-block', margin: ta === 'center' ? '0 auto 28px' : '0 0 28px' }} />
              )}
              {sec.show_venue_badge && w.venue_date_display && (
                <div className="ev-eyebrow">{w.venue_date_display}</div>
              )}
              <h1 className="ev-h1" style={{ color: sec.design.text_light ? 'rgba(240,237,232,1)' : '#0F1923', textAlign: ta }}>{ev?.name ?? w.hero_headline}</h1>
              {sec.custom_title && <p style={{ fontSize: '16px', color: sec.design.text_light ? 'rgba(240,237,232,0.6)' : 'rgba(15,25,35,0.6)', marginTop: '16px', lineHeight: 1.6 }}>{sec.custom_title}</p>}
            </div>
          </section>
        )
      }

      // ── Speakers ──────────────────────────────────────────────────────────
      case 'speakers':
        return (
          <section key={sec.id} style={ds}>
            <div style={ws}>
              <SpeakerTabs speakers={speakers} accent={A} showBio={sec.show_bio} layout={sec.layout} />
            </div>
          </section>
        )

      // ── Agenda ────────────────────────────────────────────────────────────
      case 'agenda':
        return (
          <section key={sec.id} style={ds}>
            <div style={ws}>
              <AgendaTabs agByDay={agByDay} accent={A} teal={T} />
            </div>
          </section>
        )

      // ── Partners ──────────────────────────────────────────────────────────
      case 'partners':
        return (
          <section key={sec.id} style={ds}>
            <div style={ws}>
              <PartnerTabs sponsors={sponsors} accent={A} showWebsite={sec.show_website} />
            </div>
          </section>
        )

      // ── Schedule timeline ─────────────────────────────────────────────────
      case 'schedule':
        return (
          <section key={sec.id} style={ds}>
            <div style={ws}>
              {sec.custom_title && <h2 className="ev-h2">{sec.custom_title}</h2>}
              <ScheduleTimeline agByDay={agByDay} accent={A} layout={sec.layout} />
            </div>
          </section>
        )

      // ── Logo ticker ───────────────────────────────────────────────────────
      case 'logo_ticker':
        return (
          <section key={sec.id} style={ds}>
            {sec.custom_title && (
              <div style={{ ...ws, marginBottom: '32px', textAlign: 'center' }}>
                <h2 className="ev-h2">{sec.custom_title}</h2>
              </div>
            )}
            <LogoTicker sponsors={sponsors} layout={sec.layout} accent={A} />
          </section>
        )

      // ── Testimonials ──────────────────────────────────────────────────────
      case 'testimonials':
        return (
          <section key={sec.id} style={ds}>
            <div style={ws}>
              <TestimonialsSection items={items} layout={sec.layout} accent={A} customTitle={sec.custom_title} visibleCount={sec.visible_count} />
            </div>
          </section>
        )

      // ── FAQ ───────────────────────────────────────────────────────────────
      case 'faq':
        return (
          <section key={sec.id} style={ds}>
            <div style={ws}>
              <FAQAccordion items={items} layout={sec.layout} accent={A} customTitle={sec.custom_title} />
            </div>
          </section>
        )

      // ── CTA Banner ────────────────────────────────────────────────────────
      case 'cta_banner': {
        const isSplit  = sec.layout === 'split'
        const ctaItems = items.length > 0 ? items : (sec.custom_title ? [{ id: '0', label: sec.custom_title, href: sec.custom_body ?? '' }] : [])
        return (
          <section key={sec.id} style={{ ...ds, padding: '60px 0' }}>
            <div style={{ ...ws, display: isSplit ? 'flex' : 'block', alignItems: 'center', justifyContent: 'space-between', gap: '40px', textAlign: isSplit ? 'left' : 'center' }}>
              {sec.custom_title && <h2 style={{ fontSize: 'clamp(24px,3vw,40px)', fontWeight: 900, letterSpacing: '-0.03em', margin: 0, flex: isSplit ? 1 : undefined }}>{sec.custom_title}</h2>}
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: isSplit ? 'flex-end' : 'center', marginTop: isSplit ? 0 : '28px' }}>
                {ctaItems.map((item, i) => (
                  <a key={item.id} href={item.href ?? '#'} target={item.href?.startsWith('http') ? '_blank' : undefined} rel="noreferrer"
                    style={{ display: 'inline-flex', padding: '14px 32px', borderRadius: '10px', background: i === 0 ? A : 'transparent', color: i === 0 ? '#fff' : 'rgba(240,237,232,0.7)', fontSize: '15px', fontWeight: 700, border: i === 0 ? 'none' : '1px solid rgba(240,237,232,0.2)' }}>
                    {item.label}
                  </a>
                ))}
              </div>
            </div>
          </section>
        )
      }

      // ── Gallery ───────────────────────────────────────────────────────────
      case 'gallery':
        return (
          <section key={sec.id} style={ds}>
            <div style={ws}>
              {sec.custom_title && <h2 className="ev-h2">{sec.custom_title}</h2>}
              <GallerySection items={items} layout={sec.layout} accent={A} />
            </div>
          </section>
        )

      // ── Video embed ───────────────────────────────────────────────────────
      case 'video_embed': {
        const url = sec.video_url ?? sec.custom_body ?? ''
        if (!url) return null
        return (
          <section key={sec.id} style={ds}>
            <div style={ws}>
              <VideoEmbed videoUrl={url} layout={sec.layout} accent={A} customTitle={sec.custom_title} />
            </div>
          </section>
        )
      }

      // ── Countdown ─────────────────────────────────────────────────────────
      // Requires an explicit custom_body (an ISO date a producer sets on
      // this section) — no fallback to any events-table date. event_date
      // is the Staff Portal's staff-allocation window, not the event's
      // actual date, and public_dates_display is free text, not a
      // parseable ISO date, so neither is safe to count down to.
      case 'countdown': {
        const target = sec.custom_body
        if (!target) return null
        return (
          <section key={sec.id} style={{ ...ds, textAlign: 'center' }}>
            <div style={{ ...ws, textAlign: 'center' }}>
              {sec.custom_title && <h2 className="ev-h2" style={{ marginBottom: '40px' }}>{sec.custom_title}</h2>}
              <CountdownTimer targetDate={target} layout={sec.layout} accent={A} teal={T} />
            </div>
          </section>
        )
      }

      // ── About ─────────────────────────────────────────────────────────────
      case 'about':
        return (
          <section key={sec.id} style={ds}>
            <div style={ws}>
              {(sec.custom_title || w.about_title) && <h2 className="ev-h2">{sec.custom_title || w.about_title}</h2>}
              {(sec.custom_body || w.about_body) && <p className="ev-body">{sec.custom_body || w.about_body}</p>}
            </div>
          </section>
        )

      // ── Stats ─────────────────────────────────────────────────────────────
      case 'stats': {
        const stats = [
          { num: w.stat_attendees, label: 'Attendees' }, { num: w.stat_speakers, label: 'Speakers' },
          { num: w.stat_exhibitors, label: 'Exhibitors' }, { num: w.stat_countries, label: 'Countries' },
        ].filter(s => s.num)
        if (!stats.length) return null
        return (
          <section key={sec.id} style={{ ...ds, padding: 0 }}>
            <div className="ev-stats">
              {stats.map(s => (
                <div key={s.label} className="ev-stat">
                  <div className="ev-stat-num">{s.num}</div>
                  <div className="ev-stat-label">{s.label}</div>
                </div>
              ))}
            </div>
          </section>
        )
      }

      // ── Media ─────────────────────────────────────────────────────────────
      case 'media':
        if (!w.media_kit_url && !w.brand_kit_url) return null
        return (
          <section key={sec.id} style={ds}>
            <div style={ws}>
              <div className="ev-label">Press &amp; Media</div>
              <h2 className="ev-h2">Media Resources</h2>
              <p className="ev-body" style={{ marginBottom: '40px' }}>Download our press kit and brand resources.</p>
              <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                {w.media_kit_url && (
                  <a href={w.media_kit_url} target="_blank" rel="noreferrer"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', padding: '14px 28px', borderRadius: '10px', border: `1px solid ${A}44`, background: `${A}12`, fontSize: '14px', fontWeight: 700 }}>
                    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                    Download Media Kit
                  </a>
                )}
                {w.brand_kit_url && (
                  <a href={w.brand_kit_url} target="_blank" rel="noreferrer"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', padding: '14px 28px', borderRadius: '10px', border: '1px solid rgba(240,237,232,0.12)', fontSize: '14px', fontWeight: 700 }}>
                    Brand Hub
                  </a>
                )}
              </div>
            </div>
          </section>
        )

      // ── Venue ─────────────────────────────────────────────────────────────
      case 'venue':
        if (!w.venue_name && !w.venue_address) return null
        return (
          <section key={sec.id} style={ds}>
            <div style={ws}>
              <div className="ev-label">Location</div>
              <h2 className="ev-h2">{w.venue_name ?? 'Venue'}</h2>
              {w.venue_date_display && <div style={{ fontSize: '16px', color: A, fontWeight: 700, marginBottom: '12px' }}>{w.venue_date_display}</div>}
              {w.venue_city    && <div style={{ fontSize: '15px', color: 'rgba(240,237,232,0.7)', marginBottom: '6px' }}>{w.venue_city}</div>}
              {w.venue_address && <div style={{ fontSize: '15px', color: 'rgba(240,237,232,0.5)' }}>{w.venue_address}</div>}
            </div>
          </section>
        )

      // ── Register CTA ──────────────────────────────────────────────────────
      case 'register': {
        const cta1 = { label: sec.custom_title || w.hero_cta_label || 'Register Now', href: sec.custom_body || w.hero_cta_url || '#' }
        const cta2 = sec.cta2_href ? { label: sec.cta2_label || 'Learn More', href: sec.cta2_href } : null
        return (
          <section key={sec.id} style={{ ...ds, textAlign: 'center' }}>
            <div style={{ maxWidth: '600px', margin: '0 auto', padding: '0 40px' }}>
              <h2 className="ev-h2">Join Us</h2>
              <p className="ev-body" style={{ marginBottom: '32px' }}>Secure your place at {w.hero_headline || ev?.name}.</p>
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
                <a href={cta1.href} target="_blank" rel="noreferrer"
                  style={{ display: 'inline-flex', padding: '16px 36px', borderRadius: '10px', background: A, color: '#fff', fontSize: '15px', fontWeight: 800 }}>
                  {cta1.label}
                </a>
                {cta2 && (
                  <a href={cta2.href} style={{ display: 'inline-flex', padding: '16px 28px', borderRadius: '10px', border: '1px solid rgba(240,237,232,0.2)', color: 'rgba(240,237,232,0.7)', fontSize: '15px', fontWeight: 600 }}>
                    {cta2.label}
                  </a>
                )}
              </div>
            </div>
          </section>
        )
      }

      // ── Text block ────────────────────────────────────────────────────────
      case 'text_block': {
        const HL = sec.heading_level ?? 'h2'
        const bodySizePx = sec.body_size === 'sm' ? '15px' : sec.body_size === 'lg' ? '20px' : '17px'
        const headingStyle = HL === 'h2'
          ? { fontSize: 'clamp(28px,3.5vw,44px)', fontWeight: 900, letterSpacing: '-0.03em', margin: '0 0 20px' }
          : HL === 'h3'
          ? { fontSize: 'clamp(22px,2.5vw,32px)', fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 16px' }
          : { fontSize: 'clamp(18px,2vw,24px)', fontWeight: 700, letterSpacing: '-0.01em', margin: '0 0 14px' }
        return (
          <section key={sec.id} style={ds}>
            <div style={ws}>
              {sec.custom_title && <HL style={headingStyle}>{sec.custom_title}</HL>}
              {sec.custom_body  && <div style={{ fontSize: bodySizePx, lineHeight: 1.75, whiteSpace: 'pre-wrap', color: 'inherit', opacity: 0.85 }}>{sec.custom_body}</div>}
            </div>
          </section>
        )
      }

      default: return null
    }
  }

  // ── Shared footer render ──────────────────────────────────────────────────
  function renderFooter() {
    return (
      <footer style={{ background: ft.bg_color ?? '#0F1923', borderTop: '1px solid rgba(240,237,232,0.08)', padding: '60px 40px 32px' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          <div style={{ display: 'flex', gap: '48px', flexWrap: 'wrap', marginBottom: '48px' }}>
            {/* Logo + tagline */}
            <div style={{ flex: '0 0 240px' }}>
              {ft.logo_slot !== 'none' && logos[ft.logo_slot] && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logos[ft.logo_slot]!} alt={ev?.name ?? ''} style={{ height: '48px', objectFit: 'contain', marginBottom: '16px', display: 'block' }} />
              )}
              {(!ft.logo_slot || ft.logo_slot === 'none' || !logos[ft.logo_slot]) && (
                <div style={{ fontSize: '18px', fontWeight: 900, letterSpacing: '-0.03em', color: ft.text_light ? 'rgba(240,237,232,1)' : '#0F1923', marginBottom: '16px' }}>{ev?.name ?? w.hero_headline}</div>
              )}
              {ft.tagline && <p style={{ fontSize: '14px', lineHeight: 1.6, color: ft.text_light ? 'rgba(240,237,232,0.5)' : 'rgba(15,25,35,0.5)', margin: 0 }}>{ft.tagline}</p>}
            </div>
            {/* Link columns */}
            {ft.columns.map(col => (
              <div key={col.id} style={{ flex: '0 0 140px' }}>
                <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: ft.text_light ? 'rgba(240,237,232,0.35)' : 'rgba(15,25,35,0.35)', marginBottom: '16px' }}>{col.heading}</div>
                {col.links.map(lnk => {
                  const href = lnk.href.startsWith('http') ? lnk.href : lnk.href ? `/events/${w.slug}/${lnk.href}` : '#'
                  return (
                    <a key={lnk.id} href={href} style={{ display: 'block', fontSize: '14px', fontWeight: 500, color: ft.text_light ? 'rgba(240,237,232,0.6)' : 'rgba(15,25,35,0.6)', marginBottom: '10px', textDecoration: 'none' }}>
                      {lnk.label}
                    </a>
                  )
                })}
              </div>
            ))}
            {/* Social links */}
            {ft.socials.filter(s => s.url).length > 0 && (
              <div style={{ marginLeft: 'auto' }}>
                <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: ft.text_light ? 'rgba(240,237,232,0.35)' : 'rgba(15,25,35,0.35)', marginBottom: '16px' }}>Follow</div>
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                  {ft.socials.filter(s => s.url).map(s => (
                    <a key={s.platform} href={s.url} target="_blank" rel="noreferrer"
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '36px', height: '36px', borderRadius: '8px', background: ft.text_light ? 'rgba(240,237,232,0.08)' : 'rgba(15,25,35,0.08)', color: ft.text_light ? 'rgba(240,237,232,0.7)' : 'rgba(15,25,35,0.7)' }}>
                      {getSocialIcon(s.platform)}
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
          {/* Copyright */}
          <div style={{ paddingTop: '24px', borderTop: `1px solid ${ft.text_light ? 'rgba(240,237,232,0.08)' : 'rgba(15,25,35,0.08)'}`, fontSize: '12px', color: ft.text_light ? 'rgba(240,237,232,0.3)' : 'rgba(15,25,35,0.3)' }}>
            {ft.copyright ?? `© ${new Date().getFullYear()} ${ev?.name ?? ''}. All rights reserved.`}
          </div>
        </div>
      </footer>
    )
  }

  // ── If page_structure_full exists, use it ─────────────────────────────────
  if (ps && homePage) {
    const navItems = ps.nav
    return (
      <>
        {useFonts && (
          <link rel="stylesheet" href={`https://fonts.googleapis.com/css2?family=${encodeURIComponent(headingFont)}:wght@400;500;600;700;800;900&family=${encodeURIComponent(bodyFont)}:wght@400;500;600&display=swap`} />
        )}
        <style>{css}</style>
        <div className="ev-root">
          <nav className="ev-nav">
            <a href={`/events/${slug}`} className="ev-nav-logo">
              {logos.white
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={logos.white} alt={ev?.name ?? ''} style={{ height: '32px', objectFit: 'contain' }} />
                : (ev?.name ?? w.hero_headline)
              }
            </a>
            <div className="ev-nav-links">
              {navItems.map(item => {
                const href = item.href.startsWith('http') ? item.href : item.href ? `/events/${slug}/${item.href}` : '#'
                return item.type === 'cta'
                  ? <a key={item.id} href={href} className="ev-nav-cta" target={item.href.startsWith('http') ? '_blank' : undefined} rel="noreferrer">{item.label}</a>
                  : <a key={item.id} href={href} className="ev-nav-link">{item.label}</a>
              })}
            </div>
          </nav>
          {homePage.sections.map(sec => renderSection(sec))}
          {renderFooter()}
        </div>
      </>
    )
  }

  // ── Legacy fallback (no page_structure_full) ───────────────────────────────
  const hasStats = w.stat_attendees || w.stat_speakers || w.stat_exhibitors || w.stat_countries

  return (
    <>
      {useFonts && (
        <link rel="stylesheet" href={`https://fonts.googleapis.com/css2?family=${encodeURIComponent(headingFont)}:wght@400;500;600;700;800;900&family=${encodeURIComponent(bodyFont)}:wght@400;500;600&display=swap`} />
      )}
      <style>{css}</style>
      <div className="ev-root">

        {/* Navbar */}
        <nav className="ev-nav">
          <div className="ev-nav-logo">{ev?.name ?? w.hero_headline}</div>
          <div className="ev-nav-links">
            {speakers.length > 0 && <a href="#speakers" className="ev-nav-link">Speakers</a>}
            {agenda.length   > 0 && <a href="#agenda"   className="ev-nav-link">Agenda</a>}
            {sponsors.length > 0 && <a href="#sponsors" className="ev-nav-link">Partners</a>}
            {w.media_kit_url   && <a href="#media"     className="ev-nav-link">Media</a>}
            {w.hero_cta_url && (
              <a href={w.hero_cta_url} className="ev-nav-cta" target="_blank" rel="noreferrer">
                {w.hero_cta_label || 'Register'}
              </a>
            )}
          </div>
        </nav>

        {/* Hero */}
        <section style={{ position: 'relative', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', background: P }}>
          {w.hero_video_url && (
            <video autoPlay muted loop playsInline style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.55 }} src={w.hero_video_url} />
          )}
          {!w.hero_video_url && w.hero_bg_url && (
            <div style={{ position: 'absolute', inset: 0, backgroundImage: `url(${w.hero_bg_url})`, backgroundSize: 'cover', backgroundPosition: 'center', opacity: 0.55 }} />
          )}
          <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(180deg, rgba(8,10,12,0.35) 0%, rgba(8,10,12,0.6) 60%, ${P} 100%)` }} />
          <div style={{ position: 'relative', zIndex: 2, textAlign: 'center', padding: '0 40px', maxWidth: '860px', margin: '0 auto' }}>
            {(w.venue_date_display || eventDate || ev?.city) && (
              <div style={{ fontSize: '12px', fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase', color: A, marginBottom: '24px' }}>
                {w.venue_date_display || [eventDate, ev?.city].filter(Boolean).join(' · ')}
              </div>
            )}
            <h1 style={{ fontSize: 'clamp(36px,5.5vw,72px)', fontWeight: 900, letterSpacing: '-0.04em', lineHeight: 1, margin: '0 0 24px', color: 'rgba(240,237,232,1)' }}>
              {w.hero_headline || ev?.name}
            </h1>
            {w.hero_subheadline && (
              <p style={{ fontSize: 'clamp(15px,2vw,20px)', lineHeight: 1.6, color: 'rgba(240,237,232,0.7)', margin: '0 0 40px' }}>
                {w.hero_subheadline}
              </p>
            )}
            {w.hero_cta_url && (
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
                <a href={w.hero_cta_url} target="_blank" rel="noreferrer"
                  style={{ display: 'inline-flex', padding: '16px 36px', borderRadius: '10px', background: A, color: '#fff', fontSize: '15px', fontWeight: 800, textDecoration: 'none' }}>
                  {w.hero_cta_label || 'Register Now'}
                </a>
                {agenda.length > 0 && (
                  <a href="#agenda" style={{ display: 'inline-flex', padding: '16px 36px', borderRadius: '10px', border: '1px solid rgba(240,237,232,0.2)', color: 'rgba(240,237,232,0.85)', fontSize: '15px', fontWeight: 700, textDecoration: 'none' }}>
                    View Agenda
                  </a>
                )}
              </div>
            )}
          </div>
        </section>

        {/* Stats */}
        {hasStats && (
          <div className="ev-stats">
            {[
              { num: w.stat_attendees,  label: 'Attendees'  },
              { num: w.stat_speakers,   label: 'Speakers'   },
              { num: w.stat_exhibitors, label: 'Exhibitors' },
              { num: w.stat_countries,  label: 'Countries'  },
            ].filter(s => s.num).map(s => (
              <div key={s.label} className="ev-stat">
                <div className="ev-stat-num">{s.num}</div>
                <div className="ev-stat-label">{s.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* About */}
        {w.about_body && (
          <section style={{ padding: '100px 0', background: P }}>
            <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 40px' }}>
              <div className="ev-label">About</div>
              <h2 className="ev-h2">{w.about_title || 'About the Event'}</h2>
              <p className="ev-body" style={{ maxWidth: '760px', whiteSpace: 'pre-wrap' }}>{w.about_body}</p>
            </div>
          </section>
        )}

        {/* Speakers */}
        {speakers.length > 0 && (
          <section id="speakers" style={{ padding: '100px 0', background: 'rgba(255,255,255,0.02)' }}>
            <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 40px' }}>
              <div className="ev-label">Speakers</div>
              <h2 className="ev-h2">Industry Leaders</h2>
              <SpeakerTabs speakers={speakers} accent={A} showBio layout="grid" />
            </div>
          </section>
        )}

        {/* Agenda */}
        {agenda.length > 0 && (
          <section id="agenda" style={{ padding: '100px 0', background: P }}>
            <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 40px' }}>
              <div className="ev-label">Programme</div>
              <h2 className="ev-h2">Agenda</h2>
              <AgendaTabs agByDay={agByDay} accent={A} teal={T} />
            </div>
          </section>
        )}

        {/* Partners */}
        {sponsors.length > 0 && (
          <section id="sponsors" style={{ padding: '100px 0', background: 'rgba(255,255,255,0.02)' }}>
            <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 40px', textAlign: 'center' }}>
              <div className="ev-label">Sponsors &amp; Partners</div>
              <h2 className="ev-h2">Our Partners</h2>
              <PartnerTabs sponsors={sponsors} accent={A} showWebsite />
            </div>
          </section>
        )}

        {/* Venue */}
        {(w.venue_name || w.venue_city) && (
          <section style={{ padding: '100px 0', background: P }}>
            <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 40px' }}>
              <div className="ev-label">Location</div>
              <h2 className="ev-h2">{w.venue_name}</h2>
              {(w.venue_address || w.venue_city) && (
                <p className="ev-body">{[w.venue_address, w.venue_city].filter(Boolean).join(', ')}</p>
              )}
              {w.venue_date_display && <div style={{ fontSize: '16px', color: A, fontWeight: 700, marginTop: '8px' }}>{w.venue_date_display}</div>}
            </div>
          </section>
        )}

        {/* Media */}
        {(w.media_kit_url || w.brand_kit_url) && (
          <section id="media" style={{ padding: '100px 0', background: 'rgba(255,255,255,0.02)' }}>
            <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 40px' }}>
              <div className="ev-label">Press &amp; Media</div>
              <h2 className="ev-h2">Media Resources</h2>
              <p className="ev-body" style={{ maxWidth: '620px', marginBottom: '40px' }}>
                Download logos, brand assets, speaker profiles, and press materials for editorial and promotional use.
              </p>
              <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                {w.media_kit_url && (
                  <a href={w.media_kit_url} target="_blank" rel="noreferrer"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', padding: '16px 28px', borderRadius: '12px', background: `${A}18`, border: `1px solid ${A}33`, color: 'rgba(240,237,232,0.95)', fontWeight: 700, fontSize: '15px', textDecoration: 'none' }}>
                    <svg width="18" height="18" fill="none" stroke={A} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                    Download Media Kit
                  </a>
                )}
                {w.brand_kit_url && (
                  <a href={w.brand_kit_url} target="_blank" rel="noreferrer"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', padding: '16px 28px', borderRadius: '12px', background: `${T}10`, border: `1px solid ${T}30`, color: 'rgba(240,237,232,0.85)', fontWeight: 700, fontSize: '15px', textDecoration: 'none' }}>
                    Brand Guidelines
                  </a>
                )}
              </div>
            </div>
          </section>
        )}

        {/* Register */}
        {w.hero_cta_url && (
          <section id="register" style={{ padding: '120px 40px', textAlign: 'center', background: `linear-gradient(135deg, ${A}18 0%, ${T}10 100%)`, borderTop: '1px solid rgba(240,237,232,0.06)' }}>
            <div className="ev-label" style={{ textAlign: 'center' }}>Secure Your Seat</div>
            <h2 className="ev-h2" style={{ textAlign: 'center', marginBottom: '32px' }}>Join {w.stat_attendees ?? 'thousands of'} leaders</h2>
            <a href={w.hero_cta_url} target="_blank" rel="noreferrer"
              style={{ display: 'inline-flex', padding: '18px 44px', borderRadius: '10px', background: A, color: '#fff', fontSize: '17px', fontWeight: 800, textDecoration: 'none' }}>
              {w.hero_cta_label || 'Register Now'}
            </a>
          </section>
        )}

        {renderFooter()}
      </div>
    </>
  )
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const { data } = await supabaseAdmin
    .from('event_websites')
    .select('hero_headline, hero_subheadline, hero_bg_url, events(name)')
    .eq('slug', slug)
    .single()
  if (!data) return {}
  const ev = (data as unknown as { events: { name: string } | null }).events

  // event_websites has no per-event favicon/OG-image columns yet, so these
  // are always the corporate default for now — that's still correct
  // "unless a different one is defined" behavior, since no override exists
  // to be defined. hero_bg_url doubles as the one per-event OG override
  // that does exist today.
  const [favicon, defaultSocialImage] = await Promise.all([getDefaultFaviconUrl(), getDefaultSocialShareImageUrl()])
  const ogImage = data.hero_bg_url || defaultSocialImage

  return {
    title: data.hero_headline ?? ev?.name ?? slug,
    description: data.hero_subheadline ?? '',
    icons: favicon ? { icon: favicon } : undefined,
    openGraph: { images: ogImage ? [ogImage] : [] },
    twitter: { card: 'summary_large_image', images: ogImage ? [ogImage] : [] },
  }
}
