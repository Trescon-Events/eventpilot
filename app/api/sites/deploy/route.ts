import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

/* ─────────────────────────────────────────────────────────────────────────────
   POST /api/sites/deploy
   Body: { event_id, template_id }

   1. Generates the event.ts config from TAOS data
   2. Reads template source files from GitHub (Trescon-Events/taos-templates)
   3. Creates a new private GitHub repo under Trescon-Events org
   4. Pushes all template files + injects generated event.ts
   5. Adds GitHub Actions workflow for automatic Cloudflare Workers deploy
   6. Records the deployment in event_sites table
   Returns: { repo_url, gh_actions_url, worker_name, site_url }

   GET /api/sites/deploy?event_id=xxx
   Returns existing deployment for the event (if any)

   Required env vars:
     GITHUB_TOKEN         — fine-grained PAT with Trescon-Events org: read/write repos + actions
   Required GitHub org secrets (set once in Trescon-Events org settings):
     CLOUDFLARE_API_TOKEN — Cloudflare API token with Workers:Edit permission
     CLOUDFLARE_ACCOUNT_ID — Cloudflare account ID
───────────────────────────────────────────────────────────────────────────── */

const GH_TOKEN        = process.env.GITHUB_TOKEN
const GH_ORG          = 'Trescon-Events'
const TEMPLATES_REPO  = 'taos-templates'

// GitHub Actions workflow embedded in every generated site repo
const DEPLOY_WORKFLOW = `name: Deploy to Cloudflare Workers
on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npx opennextjs-cloudflare build
      - name: Deploy to Cloudflare Workers
        run: npx wrangler deploy
        env:
          CLOUDFLARE_API_TOKEN: \${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: \${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
`

// ── GitHub API helper ────────────────────────────────────────────────────────
async function gh(path: string, init?: RequestInit) {
  return fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Authorization:          `Bearer ${GH_TOKEN}`,
      Accept:                 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type':         'application/json',
      ...((init?.headers as Record<string, string>) ?? {}),
    },
  })
}

async function ghJson<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const res = await gh(path, init)
  return res.json() as Promise<T>
}

// ── GET — fetch existing deployment for an event ─────────────────────────────
export async function GET(req: NextRequest) {
  const event_id = req.nextUrl.searchParams.get('event_id')
  if (!event_id) return NextResponse.json({ site: null })

  const { data: site } = await supabaseAdmin
    .from('event_sites')
    .select('*')
    .eq('event_id', event_id)
    .maybeSingle()

  return NextResponse.json({ site: site ?? null })
}

// ── POST — create + deploy a new site ────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    if (!GH_TOKEN) {
      return NextResponse.json(
        { error: 'GITHUB_TOKEN is not configured. Add it to your environment variables.' },
        { status: 500 },
      )
    }

    const { event_id, template_id } = await req.json()
    if (!event_id || !template_id) {
      return NextResponse.json({ error: 'event_id and template_id are required' }, { status: 400 })
    }

    // ── 1. Generate the event.ts config (directly — no internal HTTP call) ───
    // Look up template
    const { data: templateRow } = await supabaseAdmin
      .from('site_templates').select('*').eq('id', template_id).single()
    if (!templateRow) {
      return NextResponse.json({ error: `Unknown template: ${template_id}` }, { status: 400 })
    }
    const templateColorScheme = { bg: templateRow.color_bg, accent: templateRow.color_accent, highlight: templateRow.color_highlight }

    // Fetch event data
    const { data: event, error: eventErr } = await supabaseAdmin
      .from('events')
      .select('id, name, tagline, description, start_date, end_date, city, country, venue_name, venue_address, website, contact_email, konfhub_event_id')
      .eq('id', event_id).single()
    if (eventErr || !event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    }

    const { data: brand }   = await supabaseAdmin.from('event_brand').select('primary_color, accent_color, logo_url, logo_white_url, logo_horizontal_url, hero_image_url').eq('event_id', event_id).maybeSingle()
    const { data: webRow }  = await supabaseAdmin.from('event_websites').select('subdomain, custom_domain, hero_video_url').eq('event_id', event_id).maybeSingle()
    const { data: speakers } = await supabaseAdmin.from('event_speakers').select('name, title, company, photo_url, tier').eq('event_id', event_id).order('tier', { ascending: true }).limit(10)
    const { data: sponsors } = await supabaseAdmin.from('event_sponsors').select('name, logo_url, website, tier').eq('event_id', event_id).order('tier', { ascending: true }).limit(8)

    const fmtDate = (iso: string | null) => iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }).toUpperCase() : ''
    const dateStart   = event.start_date ? new Date(event.start_date) : null
    const dateEnd     = event.end_date   ? new Date(event.end_date)   : null
    const dateDisplay = dateStart && dateEnd ? `${dateStart.getDate()}–${fmtDate(event.end_date)}` : dateStart ? fmtDate(event.start_date) : 'DATE TBA'
    const eventSiteUrl = webRow?.custom_domain ? `https://${webRow.custom_domain}` : webRow?.subdomain ? `https://${webRow.subdomain}.tresconglobal.com` : event.website || 'https://example.com'
    const bgColor     = brand?.primary_color || templateColorScheme.bg
    const accentColor = brand?.accent_color  || templateColorScheme.accent
    const hlColor     = templateColorScheme.highlight

    const speakersBlock = speakers?.length
      ? speakers.map((s: { name: string; title?: string; company?: string; photo_url?: string; tier?: string }) => `    { name: ${JSON.stringify(s.name)}, title: ${JSON.stringify(s.title||'')}, company: ${JSON.stringify(s.company||'')}, photo_url: ${JSON.stringify(s.photo_url||'')}, tier: ${JSON.stringify(s.tier||'standard')} }`).join(',\n')
      : '    // No speakers yet'
    const sponsorsBlock = sponsors?.length
      ? sponsors.map((s: { name: string; logo_url?: string; website?: string; tier?: string }) => `    { name: ${JSON.stringify(s.name)}, logo_url: ${JSON.stringify(s.logo_url||'')}, website: ${JSON.stringify(s.website||'')}, tier: ${JSON.stringify(s.tier||'standard')} }`).join(',\n')
      : '    // No sponsors yet'

    const config_ts = `// Generated by TAOS on ${new Date().toISOString().split('T')[0]}
// Template: ${templateRow.label} | Event: ${event.name}

export const EVENT = {
  name:        ${JSON.stringify(event.name)},
  tagline:     ${JSON.stringify(event.tagline || '')},
  description: ${JSON.stringify(event.description || '')},
  organiser:   "Trescon Global",
  date_display:   ${JSON.stringify(dateDisplay)},
  date_iso_start: ${JSON.stringify(event.start_date || '')},
  date_iso_end:   ${JSON.stringify(event.end_date || '')},
  venue_name:    ${JSON.stringify(event.venue_name || 'TBA')},
  venue_city:    ${JSON.stringify(event.city || '')},
  venue_country: ${JSON.stringify(event.country || '')},
  venue_display: ${JSON.stringify([event.venue_name, event.city, event.country].filter(Boolean).join(' · ').toUpperCase())},
  venue_address: ${JSON.stringify(event.venue_address || '')},
  site_url:          ${JSON.stringify(eventSiteUrl)},
  register_url:      ${event.konfhub_event_id ? JSON.stringify(`https://konfhub.com/checkout/${event.konfhub_event_id}`) : '""'},
  colors: { bg_primary: ${JSON.stringify(bgColor)}, accent: ${JSON.stringify(accentColor)}, highlight: ${JSON.stringify(hlColor)} },
  assets: {
    logo:        ${JSON.stringify(brand?.logo_url || '/logo.svg')},
    logo_white:  ${JSON.stringify(brand?.logo_white_url || '/logo-white.svg')},
    hero_video:  ${JSON.stringify(webRow?.hero_video_url || '/hero-bg.webm')},
    hero_poster: ${JSON.stringify(brand?.hero_image_url || '/hero-poster.jpg')},
    og_image:    "/og-image.jpg",
  },
  speakers_seed: [
${speakersBlock}
  ],
  sponsors_seed: [
${sponsorsBlock}
  ],
  footer: {
    email: ${JSON.stringify(event.contact_email || '')},
    copyright: \`© \${new Date().getFullYear()} Trescon Global. All rights reserved.\`,
  },
  seo: {
    title_default:  ${JSON.stringify(`${event.name} | ${event.tagline || ''}`)},
    description:    ${JSON.stringify(event.description || '')},
  },
  _taos: { event_id: ${JSON.stringify(event.id)}, template_id: ${JSON.stringify(template_id)}, generated: ${JSON.stringify(new Date().toISOString())} },
}
export type EventConfig = typeof EVENT
`

    const eventSlug  = event.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    const repoName   = `event-${eventSlug}`
    const workerName = `taos-${eventSlug}`
    const siteUrl    = `https://${workerName}.workers.dev`

    // ── 2. Read template file tree from monorepo ──────────────────────────────
    type GHTreeItem = { type: string; path: string; sha: string; mode: string }
    const treeData = await ghJson<{ tree?: GHTreeItem[] }>(
      `/repos/${GH_ORG}/${TEMPLATES_REPO}/git/trees/main?recursive=1`,
    )
    const prefix      = `${template_id}/`
    const sourceFiles = (treeData.tree ?? []).filter(
      f => f.type === 'blob' && f.path.startsWith(prefix),
    )

    if (sourceFiles.length === 0) {
      return NextResponse.json(
        { error: `Template "${template_id}" not found in taos-templates repo. Check the folder name.` },
        { status: 404 },
      )
    }

    // ── 3. Create the GitHub repo ─────────────────────────────────────────────
    const createRes = await gh(`/orgs/${GH_ORG}/repos`, {
      method: 'POST',
      body:   JSON.stringify({
        name:        repoName,
        private:     true,
        description: `${event.name} — generated by TAOS`,
        auto_init:   false,
        has_issues:  false,
        has_wiki:    false,
      }),
    })

    if (!createRes.ok) {
      const err = await createRes.json() as { message?: string; errors?: { message?: string }[] }
      const alreadyExists = err.errors?.some(e => e.message?.includes('already exists'))
      if (!alreadyExists) {
        return NextResponse.json(
          { error: `Could not create GitHub repo: ${err.message ?? JSON.stringify(err.errors)}` },
          { status: 500 },
        )
      }
      // Repo exists — we'll overwrite the files below (force push)
    }

    // ── 4. Download source files & create blobs in new repo ──────────────────
    //   Files we handle manually:
    const MANUAL_PATHS = new Set(['src/config/event.ts'])

    async function downloadBlob(sha: string): Promise<string> {
      const data = await ghJson<{ content?: string }>(
        `/repos/${GH_ORG}/${TEMPLATES_REPO}/git/blobs/${sha}`,
      )
      // GitHub wraps base64 content with newlines — strip them
      return (data.content ?? '').replace(/\n/g, '')
    }

    async function uploadBlob(b64: string): Promise<string> {
      const data = await ghJson<{ sha: string }>(
        `/repos/${GH_ORG}/${repoName}/git/blobs`,
        { method: 'POST', body: JSON.stringify({ content: b64, encoding: 'base64' }) },
      )
      return data.sha
    }

    const treeEntries: { path: string; mode: string; type: string; sha: string }[] = []

    // Process files in parallel batches of 8
    const toProcess = sourceFiles.filter(f => !MANUAL_PATHS.has(f.path.replace(prefix, '')))
    const BATCH = 8

    for (let i = 0; i < toProcess.length; i += BATCH) {
      await Promise.all(
        toProcess.slice(i, i + BATCH).map(async file => {
          const relPath = file.path.replace(prefix, '')
          let b64 = await downloadBlob(file.sha)

          // Rewrite wrangler.jsonc worker name to match the event slug
          if (relPath === 'wrangler.jsonc' || relPath === 'wrangler.toml') {
            const text    = Buffer.from(b64, 'base64').toString('utf8')
            const updated = text.replace(/"name"\s*:\s*"[^"]+"/, `"name": "${workerName}"`)
            b64 = Buffer.from(updated).toString('base64')
          }

          const sha = await uploadBlob(b64)
          treeEntries.push({ path: relPath, mode: file.mode || '100644', type: 'blob', sha })
        }),
      )
    }

    // Add the generated event.ts
    const eventTsSha = await uploadBlob(Buffer.from(config_ts).toString('base64'))
    treeEntries.push({ path: 'src/config/event.ts', mode: '100644', type: 'blob', sha: eventTsSha })

    // Add the GitHub Actions deploy workflow
    const wfSha = await uploadBlob(Buffer.from(DEPLOY_WORKFLOW).toString('base64'))
    treeEntries.push({ path: '.github/workflows/deploy.yml', mode: '100644', type: 'blob', sha: wfSha })

    // ── 5. Create Git tree ────────────────────────────────────────────────────
    const gitTree = await ghJson<{ sha: string }>(
      `/repos/${GH_ORG}/${repoName}/git/trees`,
      { method: 'POST', body: JSON.stringify({ tree: treeEntries }) },
    )

    // ── 6. Create commit ──────────────────────────────────────────────────────
    const commit = await ghJson<{ sha: string }>(
      `/repos/${GH_ORG}/${repoName}/git/commits`,
      {
        method: 'POST',
        body:   JSON.stringify({
          message: `Initial commit — ${event.name} site generated by TAOS`,
          tree:    gitTree.sha,
          parents: [],
        }),
      },
    )

    // ── 7. Set main branch ────────────────────────────────────────────────────
    const refRes = await gh(`/repos/${GH_ORG}/${repoName}/git/refs`, {
      method: 'POST',
      body:   JSON.stringify({ ref: 'refs/heads/main', sha: commit.sha }),
    })
    if (!refRes.ok) {
      // Branch already exists — force update
      await gh(`/repos/${GH_ORG}/${repoName}/git/refs/heads/main`, {
        method: 'PATCH',
        body:   JSON.stringify({ sha: commit.sha, force: true }),
      })
    }

    // ── 8. Save deployment record to DB ──────────────────────────────────────
    const repoUrl = `https://github.com/${GH_ORG}/${repoName}`
    await supabaseAdmin.from('event_sites').upsert(
      {
        event_id,
        template_id,
        repo_name:   repoName,
        repo_url:    repoUrl,
        worker_name: workerName,
        site_url:    siteUrl,
        status:      'deploying',
        updated_at:  new Date().toISOString(),
      },
      { onConflict: 'event_id' },
    )

    return NextResponse.json({
      ok:              true,
      repo_name:       repoName,
      repo_url:        repoUrl,
      gh_actions_url:  `${repoUrl}/actions`,
      worker_name:     workerName,
      site_url:        siteUrl,
    })

  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
