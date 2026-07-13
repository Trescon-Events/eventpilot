/**
 * Corporate Deck — Readiness Dashboard data source.
 *
 * GET /api/corporate-marketing/deck/readiness
 *   → {
 *       current_version: number,               // next version number if published; 0 draft-only
 *       published_version: number | null,      // latest published version_number (null if never)
 *       last_published_at: string | null,      // ISO
 *       overall_status: 'up_to_date' | 'needs_review' | 'not_yet_published',
 *       sections: [{
 *         key: 'company_information' | 'statistics' | 'events' | 'leadership' | 'testimonials' | 'images',
 *         name: string,
 *         status: 'up_to_date' | 'needs_review' | 'not_yet_published',
 *         last_modified: string | null,
 *         last_synced?: string | null,         // only on `events`
 *       }],
 *       changes_since_publish: [{
 *         section: string,                     // human name
 *         section_key: string,
 *         field: string,                       // what changed, human label
 *         updated_at: string,
 *       }],
 *     }
 *
 * Change detection strategy:
 *   - The publish flow (see /deck/publish/route.ts) writes a full
 *     content_snapshot JSONB on each corporate_deck_versions row:
 *       { company_content, testimonials, assets, leadership, mappings,
 *         canva_url, deck_title }
 *   - Here we diff the CURRENT DB state against that snapshot per section.
 *   - "changed" is a stable-canonical shape comparison + a MAX(updated_at)
 *     of the underlying rows (only kept if it's more recent than the
 *     published_at timestamp, so we don't surface stale updated_at values
 *     that pre-date the publish).
 *   - Events is not part of the snapshot (events live in the Events
 *     module — we only project them into the deck at render time). We
 *     surface events.updated_at MAX + note "Last synced" is derived from
 *     events.updated_at (no dedicated sync timestamp exists on the deck
 *     side yet).
 *
 * Auth: admin OR tool_grants.corporate_marketing.
 */
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { requireCorporateMarketingAccess } from '@/app/lib/corporate-marketing/auth'

type SectionKey = 'company_information' | 'statistics' | 'events' | 'leadership' | 'testimonials' | 'images'
type SectionStatus = 'up_to_date' | 'needs_review' | 'not_yet_published'

const PROSE_KEYS   = ['company_overview', 'vision', 'mission', 'tagline', 'boilerplate']
const STATS_KEYS   = ['company_stats', 'event_series_stats', 'event_stats']

const SECTION_META: { key: SectionKey; name: string }[] = [
  { key: 'company_information', name: 'Company Information' },
  { key: 'statistics',          name: 'Statistics' },
  { key: 'events',              name: 'Events' },
  { key: 'leadership',          name: 'Leadership' },
  { key: 'testimonials',        name: 'Testimonials' },
  { key: 'images',              name: 'Images' },
]

// Deterministic stringify — same object shape ⇒ same string ⇒ safe equality.
function canon(v: unknown): string {
  if (v === null || v === undefined) return 'null'
  if (Array.isArray(v)) return `[${v.map(canon).join(',')}]`
  if (typeof v === 'object') {
    const keys = Object.keys(v as Record<string, unknown>).sort()
    return `{${keys.map(k => `${JSON.stringify(k)}:${canon((v as Record<string, unknown>)[k])}`).join(',')}}`
  }
  return JSON.stringify(v)
}

// Pull only the fields that meaningfully drive "did this content change?" — mirrors
// what the publish endpoint writes into content_snapshot so we compare apples to apples.
function normaliseContentRow(r: { key: string; label: string; value_text: string | null; value_json: unknown }) {
  return { key: r.key, label: r.label, value_text: r.value_text, value_json: r.value_json }
}
function normaliseTestimonial(r: { id: string; quote: string; author_name: string; author_title: string | null; author_company: string | null; author_photo_url: string | null; event_id: string | null; display_order: number | null }) {
  return {
    id: r.id, quote: r.quote, author_name: r.author_name,
    author_title: r.author_title, author_company: r.author_company,
    author_photo_url: r.author_photo_url, event_id: r.event_id,
    display_order: r.display_order ?? 0,
  }
}
function normaliseAsset(r: { id: string; title: string | null; storage_path: string; file_name: string | null; mime_type: string | null; tags: string[] | null; display_order: number | null }) {
  return {
    id: r.id, title: r.title, storage_path: r.storage_path,
    file_name: r.file_name, mime_type: r.mime_type,
    tags: r.tags ?? [], display_order: r.display_order ?? 0,
  }
}
function normaliseLeadership(r: { staff_id: string; name: string; role: string | null; department: string | null; display_order: number | null; corporate_bio: string | null }) {
  return {
    staff_id: r.staff_id, name: r.name, role: r.role,
    department: r.department, display_order: r.display_order ?? 0,
    corporate_bio: r.corporate_bio,
  }
}

function maxDate(dates: (string | null | undefined)[]): string | null {
  const filtered = dates.filter((d): d is string => !!d)
  if (filtered.length === 0) return null
  return filtered.reduce((a, b) => (new Date(a) > new Date(b) ? a : b))
}

export async function GET(req: NextRequest) {
  const auth = await requireCorporateMarketingAccess(req)
  if (!auth.ok) return auth.res

  // 1. Deck row + latest published version
  const { data: deck } = await supabaseAdmin
    .from('corporate_decks')
    .select('id, updated_at')
    .order('uploaded_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  type PublishedVersion = {
    version_number: number
    published_at: string
    content_snapshot: {
      company_content?: Array<{ key: string; label: string; value_text: string | null; value_json: unknown; updated_at?: string }>
      testimonials?:    Array<{ id: string; quote: string; author_name: string; author_title: string | null; author_company: string | null; author_photo_url: string | null; event_id: string | null; display_order: number | null }>
      assets?:          Array<{ id: string; title: string | null; storage_path: string; file_name: string | null; mime_type: string | null; tags: string[] | null; display_order: number | null }>
      leadership?:      Array<{ staff_id: string; name: string; role: string | null; department: string | null; display_order: number | null; corporate_bio: string | null }>
    }
  }
  let publishedVersion: PublishedVersion | null = null

  if (deck?.id) {
    const { data: v } = await supabaseAdmin
      .from('corporate_deck_versions')
      .select('version_number, published_at, content_snapshot')
      .eq('deck_id', deck.id)
      .order('version_number', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (v) publishedVersion = v as unknown as PublishedVersion
  }

  const publishedAt = publishedVersion?.published_at ?? null
  const publishedNum = publishedVersion?.version_number ?? null
  const currentVersion = (publishedNum ?? 0) + 1

  // 2. Load current state for every section (parallel).
  const today = new Date().toISOString().slice(0, 10)
  const [
    contentQ,
    testimonialsQ,
    assetsQ,
    leadershipOverridesQ,
    eventsUpcomingQ,
    eventsPastQ,
  ] = await Promise.all([
    supabaseAdmin.from('corporate_company_content')
      .select('key, label, value_text, value_json, updated_at'),
    supabaseAdmin.from('corporate_testimonials')
      .select('id, quote, author_name, author_title, author_company, author_photo_url, event_id, display_order, approved, include_in_deck, updated_at')
      .eq('approved', true).eq('include_in_deck', true)
      .order('display_order', { ascending: true }),
    supabaseAdmin.from('corporate_assets')
      .select('id, title, storage_path, file_name, mime_type, tags, display_order, approved, include_in_deck, uploaded_at')
      .eq('approved', true).eq('include_in_deck', true)
      .order('display_order', { ascending: true }),
    supabaseAdmin.from('corporate_leadership_overrides')
      .select('staff_id, display_order, corporate_bio, include_in_deck, updated_at')
      .eq('include_in_deck', true),
    supabaseAdmin.from('events')
      .select('id, updated_at, event_date, status')
      .in('status', ['planning', 'active'])
      .gte('event_date', today),
    supabaseAdmin.from('events')
      .select('id, updated_at, event_date, status')
      .or(`status.eq.completed,and(event_date.lt.${today})`)
      .order('event_date', { ascending: false })
      .limit(24),
  ])

  const contentRows       = contentQ.data ?? []
  const testimonialRows   = testimonialsQ.data ?? []
  const assetRows         = assetsQ.data ?? []
  const leadershipRows    = leadershipOverridesQ.data ?? []
  const upcomingEvents    = eventsUpcomingQ.data ?? []
  const pastEvents        = eventsPastQ.data ?? []

  // Join leadership with staff_members core fields (matches publish snapshot shape)
  const leaderIds = leadershipRows.map(l => l.staff_id)
  const leaderStaffMap = new Map<string, { name: string; role: string | null; department: string | null }>()
  if (leaderIds.length > 0) {
    const { data: staff } = await supabaseAdmin
      .from('staff_members')
      .select('id, name, role, department, updated_at')
      .in('id', leaderIds)
    for (const s of staff ?? []) leaderStaffMap.set(s.id, { name: s.name, role: s.role, department: s.department })
  }
  const currentLeadership = leadershipRows
    .map(l => {
      const s = leaderStaffMap.get(l.staff_id)
      if (!s) return null
      return {
        staff_id: l.staff_id, name: s.name, role: s.role,
        department: s.department, display_order: l.display_order ?? 0,
        corporate_bio: l.corporate_bio,
      }
    })
    .filter((x): x is NonNullable<typeof x> => !!x)
    .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0))

  const snap = publishedVersion?.content_snapshot ?? {}
  const snapContent      = snap.company_content ?? []
  const snapTestimonials = snap.testimonials    ?? []
  const snapAssets       = snap.assets          ?? []
  const snapLeadership   = snap.leadership      ?? []

  // ── Section: Company Information (prose keys) ──────────────────────────
  const currentProse = contentRows
    .filter(r => PROSE_KEYS.includes(r.key))
    .sort((a, b) => a.key.localeCompare(b.key))
    .map(normaliseContentRow)
  const snapProse = (snapContent as typeof contentRows)
    .filter(r => PROSE_KEYS.includes(r.key))
    .sort((a, b) => a.key.localeCompare(b.key))
    .map(normaliseContentRow)
  const proseChanged = canon(currentProse) !== canon(snapProse)
  const proseLastMod = maxDate(contentRows.filter(r => PROSE_KEYS.includes(r.key)).map(r => r.updated_at))

  // ── Section: Statistics (stats JSON keys) ──────────────────────────────
  const currentStats = contentRows
    .filter(r => STATS_KEYS.includes(r.key))
    .sort((a, b) => a.key.localeCompare(b.key))
    .map(normaliseContentRow)
  const snapStats = (snapContent as typeof contentRows)
    .filter(r => STATS_KEYS.includes(r.key))
    .sort((a, b) => a.key.localeCompare(b.key))
    .map(normaliseContentRow)
  const statsChanged = canon(currentStats) !== canon(snapStats)
  const statsLastMod = maxDate(contentRows.filter(r => STATS_KEYS.includes(r.key)).map(r => r.updated_at))

  // ── Section: Testimonials ──────────────────────────────────────────────
  const currentTestimonials = testimonialRows
    .map(normaliseTestimonial)
    .sort((a, b) => a.id.localeCompare(b.id))
  const snapTestimonialsSorted = (snapTestimonials as typeof testimonialRows)
    .map(normaliseTestimonial)
    .sort((a, b) => a.id.localeCompare(b.id))
  const testimonialsChanged = canon(currentTestimonials) !== canon(snapTestimonialsSorted)
  const testimonialsLastMod = maxDate(testimonialRows.map(r => r.updated_at))

  // ── Section: Images (assets) ───────────────────────────────────────────
  const currentAssets = assetRows.map(normaliseAsset).sort((a, b) => a.id.localeCompare(b.id))
  const snapAssetsSorted = (snapAssets as typeof assetRows).map(normaliseAsset).sort((a, b) => a.id.localeCompare(b.id))
  const assetsChanged = canon(currentAssets) !== canon(snapAssetsSorted)
  const assetsLastMod = maxDate(assetRows.map(r => r.uploaded_at))

  // ── Section: Leadership ────────────────────────────────────────────────
  const currentLead = currentLeadership.map(normaliseLeadership).sort((a, b) => a.staff_id.localeCompare(b.staff_id))
  const snapLead = (snapLeadership as ReturnType<typeof normaliseLeadership>[])
    .map(normaliseLeadership)
    .sort((a, b) => a.staff_id.localeCompare(b.staff_id))
  const leadershipChanged = canon(currentLead) !== canon(snapLead)
  const leadershipLastMod = maxDate(leadershipRows.map(r => r.updated_at))

  // ── Section: Events (live, not snapshotted) ────────────────────────────
  const eventUpdatedTimes = [...upcomingEvents, ...pastEvents].map(e => e.updated_at)
  const eventsLastSynced = maxDate(eventUpdatedTimes)
  // "changed" for events = any event was updated after the last publish
  const eventsChanged = publishedAt
    ? Boolean(eventsLastSynced && new Date(eventsLastSynced) > new Date(publishedAt))
    : false

  // ── Assemble sections output ──────────────────────────────────────────
  const notYetPublished = !publishedVersion
  const flag = (changed: boolean): SectionStatus => {
    if (notYetPublished) return 'not_yet_published'
    return changed ? 'needs_review' : 'up_to_date'
  }

  const sectionResults: Record<SectionKey, { changed: boolean; lastMod: string | null; lastSynced?: string | null }> = {
    company_information: { changed: proseChanged,        lastMod: proseLastMod },
    statistics:          { changed: statsChanged,        lastMod: statsLastMod },
    events:              { changed: eventsChanged,       lastMod: eventsLastSynced, lastSynced: eventsLastSynced },
    leadership:          { changed: leadershipChanged,   lastMod: leadershipLastMod },
    testimonials:        { changed: testimonialsChanged, lastMod: testimonialsLastMod },
    images:              { changed: assetsChanged,       lastMod: assetsLastMod },
  }

  const sections = SECTION_META.map(m => ({
    key:            m.key,
    name:           m.name,
    status:         flag(sectionResults[m.key].changed),
    last_modified:  sectionResults[m.key].lastMod,
    ...(m.key === 'events' ? { last_synced: sectionResults.events.lastSynced ?? null } : {}),
  }))

  const overall_status: SectionStatus = notYetPublished
    ? 'not_yet_published'
    : sections.some(s => s.status === 'needs_review') ? 'needs_review' : 'up_to_date'

  // ── Changes-since-publish timeline ────────────────────────────────────
  // Best-effort feed: iterate the underlying rows whose updated_at > published_at.
  // Limited to top 10 most recent, newest first.
  type Change = { section: string; section_key: SectionKey; field: string; updated_at: string }
  const changes: Change[] = []

  const nameOf: Record<SectionKey, string> = Object.fromEntries(SECTION_META.map(m => [m.key, m.name])) as Record<SectionKey, string>

  if (publishedAt) {
    const publishedTime = new Date(publishedAt).getTime()

    // Company Information + Statistics: per-key changes from corporate_company_content
    for (const row of contentRows) {
      if (!row.updated_at) continue
      if (new Date(row.updated_at).getTime() <= publishedTime) continue
      const isProse = PROSE_KEYS.includes(row.key)
      const isStat  = STATS_KEYS.includes(row.key)
      if (!isProse && !isStat) continue
      const key: SectionKey = isProse ? 'company_information' : 'statistics'
      changes.push({
        section:      nameOf[key],
        section_key:  key,
        field:        row.label || row.key,
        updated_at:   row.updated_at,
      })
    }

    // Testimonials
    for (const t of testimonialRows) {
      if (!t.updated_at) continue
      if (new Date(t.updated_at).getTime() <= publishedTime) continue
      changes.push({
        section:      nameOf.testimonials,
        section_key:  'testimonials',
        field:        `${t.author_name || 'Testimonial'} updated`,
        updated_at:   t.updated_at,
      })
    }

    // Leadership
    for (const l of leadershipRows) {
      if (!l.updated_at) continue
      if (new Date(l.updated_at).getTime() <= publishedTime) continue
      const s = leaderStaffMap.get(l.staff_id)
      changes.push({
        section:      nameOf.leadership,
        section_key:  'leadership',
        field:        `${s?.name ?? 'Leader'} updated`,
        updated_at:   l.updated_at,
      })
    }

    // Images
    for (const a of assetRows) {
      if (!a.uploaded_at) continue
      if (new Date(a.uploaded_at).getTime() <= publishedTime) continue
      changes.push({
        section:      nameOf.images,
        section_key:  'images',
        field:        a.title || a.file_name || 'Image added',
        updated_at:   a.uploaded_at,
      })
    }

    // Events — grouped, not per-event, to avoid flooding the timeline
    // when the events module makes bulk edits.
    if (eventsChanged && eventsLastSynced) {
      changes.push({
        section:      nameOf.events,
        section_key:  'events',
        field:        'Events data synced from Events module',
        updated_at:   eventsLastSynced,
      })
    }
  }

  changes.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
  const changes_since_publish = changes.slice(0, 10)

  return NextResponse.json({
    current_version:       currentVersion,
    published_version:     publishedNum,
    last_published_at:     publishedAt,
    overall_status,
    sections,
    changes_since_publish,
  })
}
