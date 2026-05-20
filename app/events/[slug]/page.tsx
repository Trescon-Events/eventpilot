import { notFound } from 'next/navigation'
import { supabaseAdmin } from '@/app/lib/supabase'

// ── Types ─────────────────────────────────────────────────────────────────────
type Speaker = {
  id: string; name: string; role: string | null; company: string | null; bio: string | null
  photo_url: string | null; linkedin_url: string | null; tier: string; session_title: string | null
}
type AgendaItem = {
  id: string; day: number; time_slot: string | null; title: string; description: string | null
  speaker_name: string | null; type: string; track: string | null
}
type Sponsor = {
  id: string; name: string; tier: string; logo_url: string | null; website_url: string | null
}
type Website = {
  id: string; event_id: string; slug: string; status: string; template: string
  hero_headline: string | null; hero_subheadline: string | null
  hero_bg_url: string | null; hero_video_url: string | null
  hero_cta_label: string | null; hero_cta_url: string | null
  about_title: string | null; about_body: string | null
  stat_attendees: string | null; stat_speakers: string | null
  stat_exhibitors: string | null; stat_countries: string | null
  venue_name: string | null; venue_city: string | null
  venue_address: string | null; venue_date_display: string | null
  theme_primary: string; theme_accent: string; theme_teal: string
}
type EventRow = { name: string; event_date: string | null; city: string | null; description: string | null }

const TIER_ORDER    = ['keynote','speaker','panelist','moderator']
const SPONSOR_ORDER = ['platinum','gold','silver','bronze','media','association','government','startup']

function groupBy<T extends Record<string, unknown>>(arr: T[], key: keyof T) {
  return arr.reduce<Record<string, T[]>>((acc, item) => {
    const k = String(item[key])
    acc[k] = [...(acc[k] ?? []), item]
    return acc
  }, {})
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default async function EventPublicPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params

  const { data: web, error } = await supabaseAdmin
    .from('event_websites')
    .select('*, events(name, event_date, city, description)')
    .eq('slug', slug)
    .eq('status', 'live')
    .single()

  if (error || !web) notFound()
  const w = web as Website
  const ev = (web as { events: EventRow | null }).events

  const P  = w.theme_primary || '#080A0C'
  const A  = w.theme_accent  || '#E07B2C'
  const T  = w.theme_teal    || '#00B4B0'

  const eventId = w.event_id

  const [spRes, agRes, spnRes] = await Promise.all([
    supabaseAdmin.from('event_speakers').select('id,name,role,company,bio,photo_url,linkedin_url,tier,session_title')
      .eq('event_id', eventId).eq('active', true).eq('status', 'approved')
      .order('tier').order('order_index').order('name'),
    supabaseAdmin.from('event_agenda').select('id,day,time_slot,title,description,speaker_name,type,track')
      .eq('event_id', eventId).eq('active', true)
      .order('day').order('order_index').order('time_slot'),
    supabaseAdmin.from('event_sponsors').select('id,name,tier,logo_url,website_url')
      .eq('event_id', eventId).eq('active', true)
      .order('order_index').order('name'),
  ])

  const speakers  = (spRes.data  ?? []) as Speaker[]
  const agenda    = (agRes.data  ?? []) as AgendaItem[]
  const sponsors  = (spnRes.data ?? []) as Sponsor[]

  const spByTier  = groupBy(speakers, 'tier')
  const agByDay   = groupBy(agenda,   'day')
  const spnByTier = groupBy(sponsors, 'tier')

  const hasStats = w.stat_attendees || w.stat_speakers || w.stat_exhibitors || w.stat_countries

  // ── Styles (scoped to avoid any bleed from TAOS globals) ─────────────────
  const css = `
    .ev-root { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, sans-serif; background: ${P}; color: rgba(240,237,232,0.9); margin:0; }
    .ev-root *, .ev-root *::before, .ev-root *::after { box-sizing: border-box; }
    .ev-root a { color: inherit; text-decoration: none; }
    .ev-root img { max-width: 100%; }
    .ev-wrap  { max-width: 1200px; margin: 0 auto; padding: 0 40px; }
    .ev-section { padding: 100px 0; }
    .ev-section-alt { padding: 100px 0; background: rgba(255,255,255,0.02); }
    .ev-label { font-size: 11px; font-weight: 800; letter-spacing: 0.18em; text-transform: uppercase; color: ${A}; margin-bottom: 16px; }
    .ev-h2 { font-size: clamp(28px,3.5vw,44px); font-weight: 900; letter-spacing: -0.03em; margin: 0 0 20px; color: rgba(240,237,232,1); }
    .ev-h2-center { text-align: center; }
    .ev-muted { color: rgba(240,237,232,0.55); }
    .ev-body { font-size: 16px; line-height: 1.8; color: rgba(240,237,232,0.65); }

    /* Navbar */
    .ev-nav { position: sticky; top: 0; z-index: 100; background: rgba(8,10,12,0.9); backdrop-filter: blur(12px); border-bottom: 1px solid rgba(240,237,232,0.06); height: 64px; display: flex; align-items: center; padding: 0 40px; justify-content: space-between; }
    .ev-nav-logo { font-size: 18px; font-weight: 900; letter-spacing: -0.03em; color: rgba(240,237,232,1); }
    .ev-nav-cta { display: inline-flex; align-items: center; padding: 9px 20px; border-radius: 8px; background: ${A}; color: #fff; font-size: 13px; font-weight: 700; }

    /* Hero */
    .ev-hero { position: relative; min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 80px 40px; overflow: hidden; }
    .ev-hero-overlay { position: absolute; inset: 0; background: linear-gradient(180deg, rgba(8,10,12,0.35) 0%, rgba(8,10,12,0.6) 60%, ${P} 100%); }
    .ev-hero-video { position: absolute; inset: 0; object-fit: cover; width: 100%; height: 100%; opacity: 0.55; }
    .ev-hero-bg { position: absolute; inset: 0; background-size: cover; background-position: center; opacity: 0.55; }
    .ev-hero-inner { position: relative; z-index: 2; max-width: 820px; }
    .ev-hero-date { font-size: 13px; font-weight: 700; letter-spacing: 0.18em; text-transform: uppercase; color: ${A}; margin-bottom: 24px; }
    .ev-hero-h1 { font-size: clamp(36px,5.5vw,72px); font-weight: 900; letter-spacing: -0.04em; line-height: 1; margin: 0 0 24px; color: rgba(240,237,232,1); }
    .ev-hero-sub { font-size: clamp(15px,2vw,20px); color: rgba(240,237,232,0.7); margin: 0 0 40px; line-height: 1.6; }
    .ev-cta-primary { display: inline-block; padding: 16px 36px; border-radius: 10px; background: ${A}; color: #fff; font-size: 15px; font-weight: 800; letter-spacing: 0.02em; transition: opacity 0.15s; margin-right: 12px; }
    .ev-cta-primary:hover { opacity: 0.88; }
    .ev-cta-outline { display: inline-block; padding: 16px 36px; border-radius: 10px; border: 1px solid rgba(240,237,232,0.2); color: rgba(240,237,232,0.85); font-size: 15px; font-weight: 700; }

    /* Stats */
    .ev-stats { display: flex; gap: 0; border-top: 1px solid rgba(240,237,232,0.06); border-bottom: 1px solid rgba(240,237,232,0.06); }
    .ev-stat { flex: 1; padding: 28px 32px; text-align: center; border-right: 1px solid rgba(240,237,232,0.06); }
    .ev-stat:last-child { border-right: none; }
    .ev-stat-num { font-size: clamp(28px,4vw,44px); font-weight: 900; color: ${T}; letter-spacing: -0.04em; line-height: 1; margin-bottom: 6px; font-variant-numeric: tabular-nums; }
    .ev-stat-label { font-size: 12px; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase; color: rgba(240,237,232,0.4); }

    /* Speaker cards */
    .ev-speaker-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px,1fr)); gap: 20px; }
    .ev-speaker-card { position: relative; background: rgba(255,255,255,0.03); border: 1px solid rgba(240,237,232,0.06); border-radius: 16px; padding: 28px 20px; text-align: center; transition: border-color 0.2s; }
    .ev-speaker-card:hover { border-color: rgba(224,123,44,0.35); }
    .ev-speaker-photo { width: 96px; height: 96px; border-radius: 48px; object-fit: cover; margin: 0 auto 16px; display: block; border: 2px solid ${A}; }
    .ev-speaker-initial { width: 96px; height: 96px; border-radius: 48px; background: ${A}22; margin: 0 auto 16px; display: flex; align-items: center; justify-content: center; font-size: 32px; font-weight: 900; color: ${A}; }
    .ev-speaker-name { font-size: 15px; font-weight: 800; color: rgba(240,237,232,1); margin-bottom: 4px; }
    .ev-speaker-role { font-size: 12px; color: ${A}; font-weight: 600; margin-bottom: 2px; }
    .ev-speaker-company { font-size: 12px; color: rgba(240,237,232,0.45); }
    .ev-speaker-session { font-size: 11px; color: rgba(240,237,232,0.35); margin-top: 10px; line-height: 1.5; font-style: italic; }
    .ev-tier-label { font-size: 10px; font-weight: 800; letter-spacing: 0.18em; text-transform: uppercase; color: rgba(240,237,232,0.3); margin-bottom: 20px; }

    /* Agenda */
    .ev-agenda-item { display: flex; gap: 24px; padding: 20px 0; border-bottom: 1px solid rgba(240,237,232,0.05); align-items: flex-start; }
    .ev-agenda-time { font-size: 12px; font-weight: 700; color: ${A}; width: 110px; flex-shrink: 0; padding-top: 3px; }
    .ev-agenda-title { font-size: 15px; font-weight: 700; color: rgba(240,237,232,0.95); margin-bottom: 4px; }
    .ev-agenda-speaker { font-size: 13px; color: rgba(240,237,232,0.5); margin-bottom: 4px; }
    .ev-agenda-desc { font-size: 13px; color: rgba(240,237,232,0.4); line-height: 1.6; }
    .ev-tag { display: inline-block; font-size: 10px; font-weight: 700; letter-spacing: 0.08em; padding: 3px 10px; border-radius: 20px; border: 1px solid rgba(240,237,232,0.1); color: rgba(240,237,232,0.4); text-transform: uppercase; margin-right: 6px; }
    .ev-tag-accent { border-color: ${A}44; color: ${A}; }

    /* Sponsors */
    .ev-sponsor-grid { display: flex; flex-wrap: wrap; gap: 16px; justify-content: center; }
    .ev-sponsor-logo { display: flex; align-items: center; justify-content: center; padding: 18px 28px; background: rgba(255,255,255,0.04); border: 1px solid rgba(240,237,232,0.07); border-radius: 12px; min-width: 150px; }
    .ev-sponsor-logo img { max-height: 52px; max-width: 160px; object-fit: contain; opacity: 0.85; filter: brightness(0) invert(1); }
    .ev-sponsor-logo:hover img { opacity: 1; filter: none; }
    .ev-sponsor-name { font-size: 13px; font-weight: 700; color: rgba(240,237,232,0.6); }

    /* Register */
    .ev-register { padding: 120px 40px; text-align: center; background: linear-gradient(135deg, ${A}18 0%, ${T}10 100%); border-top: 1px solid rgba(240,237,232,0.06); }

    /* Grid bg overlay */
    .ev-grid-bg { position: absolute; inset: 0; background-image: linear-gradient(${A}08 1px, transparent 1px), linear-gradient(to right, ${A}08 1px, transparent 1px); background-size: 60px 60px; pointer-events: none; }

    /* Footer */
    .ev-footer { padding: 32px 40px; border-top: 1px solid rgba(240,237,232,0.06); display: flex; align-items: center; justify-content: space-between; }

    @media (max-width: 768px) {
      .ev-wrap { padding: 0 20px; }
      .ev-hero { padding: 60px 20px; }
      .ev-section, .ev-section-alt { padding: 60px 0; }
      .ev-stats { flex-wrap: wrap; }
      .ev-stat { min-width: 50%; }
      .ev-speaker-grid { grid-template-columns: 1fr 1fr; }
      .ev-nav { padding: 0 20px; }
      .ev-agenda-item { flex-direction: column; gap: 8px; }
      .ev-agenda-time { width: auto; }
      .ev-footer { flex-direction: column; gap: 12px; text-align: center; }
    }
  `

  const title = w.hero_headline || ev?.name || 'Event'
  const eventDate = ev?.event_date ? new Date(ev.event_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : null

  return (
    <>
      <style>{css}</style>
      <div className="ev-root">

        {/* Navbar */}
        <nav className="ev-nav">
          <div className="ev-nav-logo">{ev?.name ?? title}</div>
          <div style={{ display: 'flex', gap: '28px', alignItems: 'center' }}>
            {speakers.length > 0 && <a href="#speakers" style={{ fontSize: '13px', color: 'rgba(240,237,232,0.6)', fontWeight: 500 }}>Speakers</a>}
            {agenda.length   > 0 && <a href="#agenda"   style={{ fontSize: '13px', color: 'rgba(240,237,232,0.6)', fontWeight: 500 }}>Agenda</a>}
            {sponsors.length > 0 && <a href="#sponsors" style={{ fontSize: '13px', color: 'rgba(240,237,232,0.6)', fontWeight: 500 }}>Partners</a>}
            {w.hero_cta_url && (
              <a href={w.hero_cta_url} className="ev-nav-cta" target="_blank" rel="noreferrer">
                {w.hero_cta_label || 'Register'}
              </a>
            )}
          </div>
        </nav>

        {/* Hero */}
        <section className="ev-hero">
          {w.hero_video_url && (
            <video autoPlay muted loop playsInline className="ev-hero-video" src={w.hero_video_url} />
          )}
          {!w.hero_video_url && w.hero_bg_url && (
            <div className="ev-hero-bg" style={{ backgroundImage: `url(${w.hero_bg_url})` }} />
          )}
          <div className="ev-grid-bg" />
          <div className="ev-hero-overlay" />
          <div className="ev-hero-inner">
            {(w.venue_date_display || eventDate || ev?.city) && (
              <div className="ev-hero-date">
                {w.venue_date_display || [eventDate, ev?.city].filter(Boolean).join(' · ')}
              </div>
            )}
            <h1 className="ev-hero-h1">{w.hero_headline || ev?.name}</h1>
            {w.hero_subheadline && <p className="ev-hero-sub">{w.hero_subheadline}</p>}
            {w.hero_cta_url && (
              <div>
                <a href={w.hero_cta_url} className="ev-cta-primary" target="_blank" rel="noreferrer">
                  {w.hero_cta_label || 'Register Now'}
                </a>
                {agenda.length > 0 && <a href="#agenda" className="ev-cta-outline">View Agenda</a>}
              </div>
            )}
          </div>
        </section>

        {/* Stats bar */}
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
          <section className="ev-section">
            <div className="ev-wrap">
              <div className="ev-label">About</div>
              <h2 className="ev-h2">{w.about_title || 'About the Event'}</h2>
              <p className="ev-body" style={{ maxWidth: '760px', whiteSpace: 'pre-wrap' }}>{w.about_body}</p>
            </div>
          </section>
        )}

        {/* Speakers */}
        {speakers.length > 0 && (
          <section id="speakers" className="ev-section-alt">
            <div className="ev-wrap">
              <div className="ev-label">Speakers</div>
              <h2 className="ev-h2">Industry Leaders</h2>
              {TIER_ORDER.map(tier => (spByTier[tier] ?? []).length > 0 && (
                <div key={tier} style={{ marginBottom: '48px' }}>
                  <div className="ev-tier-label">{tier === 'keynote' ? 'Keynote' : tier === 'panelist' ? 'Panelists' : tier === 'moderator' ? 'Moderators' : 'Speakers'}</div>
                  <div className="ev-speaker-grid">
                    {(spByTier[tier] ?? []).map(sp => (
                      <div key={sp.id} className="ev-speaker-card">
                        {sp.photo_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={sp.photo_url} alt={sp.name} className="ev-speaker-photo" />
                        ) : (
                          <div className="ev-speaker-initial">{sp.name.charAt(0)}</div>
                        )}
                        <div className="ev-speaker-name">{sp.name}</div>
                        {sp.role && <div className="ev-speaker-role">{sp.role}</div>}
                        {sp.company && <div className="ev-speaker-company">{sp.company}</div>}
                        {sp.session_title && <div className="ev-speaker-session">&ldquo;{sp.session_title}&rdquo;</div>}
                        {sp.linkedin_url && (
                          <a href={sp.linkedin_url} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', marginTop: '12px', gap: '4px', fontSize: '11px', color: T, fontWeight: 600 }}>
                            LinkedIn ↗
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Agenda */}
        {agenda.length > 0 && (
          <section id="agenda" className="ev-section">
            <div className="ev-wrap">
              <div className="ev-label">Programme</div>
              <h2 className="ev-h2">Agenda</h2>
              {Object.entries(agByDay).map(([day, items]) => (
                <div key={day} style={{ marginBottom: '48px' }}>
                  {Object.keys(agByDay).length > 1 && (
                    <div style={{ fontSize: '12px', fontWeight: 800, letterSpacing: '0.15em', textTransform: 'uppercase', color: T, marginBottom: '20px', paddingBottom: '12px', borderBottom: `1px solid ${A}33` }}>
                      Day {day}
                    </div>
                  )}
                  {(items as AgendaItem[]).map(ag => (
                    <div key={ag.id} className="ev-agenda-item">
                      <div className="ev-agenda-time">{ag.time_slot ?? ''}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '6px' }}>
                          <div className="ev-agenda-title">{ag.title}</div>
                          {ag.type !== 'session' && <span className="ev-tag">{ag.type}</span>}
                          {ag.track && <span className="ev-tag ev-tag-accent">{ag.track}</span>}
                        </div>
                        {ag.speaker_name && <div className="ev-agenda-speaker">{ag.speaker_name}</div>}
                        {ag.description && <div className="ev-agenda-desc">{ag.description}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Sponsors */}
        {sponsors.length > 0 && (
          <section id="sponsors" className="ev-section-alt">
            <div className="ev-wrap" style={{ textAlign: 'center' }}>
              <div className="ev-label">Sponsors &amp; Partners</div>
              <h2 className="ev-h2 ev-h2-center">Our Partners</h2>
              {SPONSOR_ORDER.map(tier => (spnByTier[tier] ?? []).length > 0 && (
                <div key={tier} style={{ marginBottom: '40px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(240,237,232,0.3)', marginBottom: '20px' }}>{tier}</div>
                  <div className="ev-sponsor-grid">
                    {(spnByTier[tier] as Sponsor[]).map(sp => (
                      <a key={sp.id} href={sp.website_url || undefined} target="_blank" rel="noreferrer" className="ev-sponsor-logo">
                        {sp.logo_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={sp.logo_url} alt={sp.name} />
                        ) : (
                          <span className="ev-sponsor-name">{sp.name}</span>
                        )}
                      </a>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Venue */}
        {(w.venue_name || w.venue_city) && (
          <section className="ev-section">
            <div className="ev-wrap">
              <div className="ev-label">Location</div>
              <h2 className="ev-h2">{w.venue_name}</h2>
              {(w.venue_address || w.venue_city) && (
                <p className="ev-body">{[w.venue_address, w.venue_city].filter(Boolean).join(', ')}</p>
              )}
              {w.venue_date_display && (
                <div style={{ fontSize: '16px', color: A, fontWeight: 700, marginTop: '8px' }}>{w.venue_date_display}</div>
              )}
            </div>
          </section>
        )}

        {/* Register CTA */}
        {w.hero_cta_url && (
          <section className="ev-register" id="register">
            <div className="ev-label" style={{ textAlign: 'center' }}>Secure Your Seat</div>
            <h2 className="ev-h2 ev-h2-center" style={{ marginBottom: '32px' }}>Join {w.stat_attendees ?? 'thousands of'} leaders</h2>
            <a href={w.hero_cta_url} className="ev-cta-primary" target="_blank" rel="noreferrer" style={{ fontSize: '17px', padding: '18px 44px' }}>
              {w.hero_cta_label || 'Register Now'}
            </a>
          </section>
        )}

        {/* Footer */}
        <footer className="ev-footer">
          <div style={{ fontWeight: 800, fontSize: '16px', letterSpacing: '-0.03em', color: 'rgba(240,237,232,0.85)' }}>{ev?.name ?? title}</div>
          <div style={{ fontSize: '12px', color: 'rgba(240,237,232,0.3)' }}>
            {w.venue_date_display || [eventDate, ev?.city].filter(Boolean).join(' · ')}
          </div>
        </footer>

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
  return {
    title: data.hero_headline ?? ev?.name ?? slug,
    description: data.hero_subheadline ?? '',
    openGraph: { images: data.hero_bg_url ? [data.hero_bg_url] : [] },
  }
}
