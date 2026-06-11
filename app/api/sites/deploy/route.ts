import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import _sodium from 'libsodium-wrappers'
import { unzipSync, strFromU8 } from 'fflate'

/* ─────────────────────────────────────────────────────────────────────────────
   POST /api/sites/deploy
   Body: { event_id, template_id }

   1. Generates the event.ts config from Event Pilot data
   2. Reads template source files from GitHub (Trescon-Events/ep-templates)
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

const GH_TOKEN           = process.env.GITHUB_TOKEN
const GH_ORG             = 'Trescon-Events'
const TEMPLATES_REPO     = 'ep-templates'
const GH_SITES_OWNER     = 'Trescon-Events'   // repos created under org
const CF_API_TOKEN       = process.env.CF_API_TOKEN ?? ''
const CF_ACCOUNT_ID      = process.env.CF_ACCOUNT_ID ?? ''

// ── GitHub API helper ────────────────────────────────────────────────────────
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

async function ghJson<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const res = await gh(path, init)
  const data = await res.json()
  if (!res.ok) {
    throw new Error(`GitHub API ${init?.method ?? 'GET'} ${path} → ${res.status}: ${JSON.stringify(data)}`)
  }
  return data as T
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
      .select('id, name, description, event_date, end_date, city, venue')
      .eq('id', event_id).single()
    if (eventErr || !event) {
      return NextResponse.json({ error: `Event not found: ${eventErr?.message ?? 'no data'}` }, { status: 404 })
    }

    const { data: brand }   = await supabaseAdmin.from('event_brand').select('primary_color, accent_color, logo_url, logo_white_url, logo_horizontal_url, hero_image_url').eq('event_id', event_id).maybeSingle()
    const { data: webRow }  = await supabaseAdmin.from('event_websites').select('subdomain, custom_domain, hero_video_url').eq('event_id', event_id).maybeSingle()
    const { data: speakers } = await supabaseAdmin.from('event_speakers').select('name, title, company, photo_url, tier').eq('event_id', event_id).order('tier', { ascending: true }).limit(10)
    const { data: sponsors } = await supabaseAdmin.from('event_sponsors').select('name, logo_url, website, tier').eq('event_id', event_id).order('tier', { ascending: true }).limit(8)

    const fmtDate = (iso: string | null) => iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }).toUpperCase() : ''
    const dateStart   = event.event_date ? new Date(event.event_date) : null
    const dateEnd     = event.end_date   ? new Date(event.end_date)   : null
    const dateDisplay = dateStart && dateEnd ? `${dateStart.getDate()}–${fmtDate(event.end_date)}` : dateStart ? fmtDate(event.event_date) : 'DATE TBA'
    const eventSiteUrl = webRow?.custom_domain ? `https://${webRow.custom_domain}` : webRow?.subdomain ? `https://${webRow.subdomain}.tresconglobal.com` : 'https://tresconglobal.com'
    const bgColor     = brand?.primary_color || templateColorScheme.bg
    const accentColor = brand?.accent_color  || templateColorScheme.accent
    const hlColor     = templateColorScheme.highlight

    const speakersBlock = speakers?.length
      ? speakers.map((s: { name: string; title?: string; company?: string; photo_url?: string; tier?: string }) => `    { name: ${JSON.stringify(s.name)}, title: ${JSON.stringify(s.title||'')}, company: ${JSON.stringify(s.company||'')}, photo_url: ${JSON.stringify(s.photo_url||'')}, tier: ${JSON.stringify(s.tier||'standard')} }`).join(',\n')
      : '    // No speakers yet'
    const sponsorsBlock = sponsors?.length
      ? sponsors.map((s: { name: string; logo_url?: string; website?: string; tier?: string }) => `    { name: ${JSON.stringify(s.name)}, logo_url: ${JSON.stringify(s.logo_url||'')}, website: ${JSON.stringify(s.website||'')}, tier: ${JSON.stringify(s.tier||'standard')} }`).join(',\n')
      : '    // No sponsors yet'

    const config_ts = `// Generated by Event Pilot on ${new Date().toISOString().split('T')[0]}
// Template: ${templateRow.label} | Event: ${event.name}

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
    email: "",
    copyright: \`© \${new Date().getFullYear()} Trescon Global. All rights reserved.\`,
  },
  seo: {
    title_default:  ${JSON.stringify(event.name)},
    description:    ${JSON.stringify(event.description || '')},
  },
  _ep: { event_id: ${JSON.stringify(event.id)}, template_id: ${JSON.stringify(template_id)}, generated: ${JSON.stringify(new Date().toISOString())} },
}
export type EventConfig = typeof EVENT
`

    const eventSlug  = event.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    const repoName   = `event-${eventSlug}`
    const workerName = `taos-${eventSlug}`
    const siteUrl    = `https://${workerName}.workers.dev`

    // ── 2. Download entire template repo as zipball (1 API call) ─────────────
    const zipRes = await gh(`/repos/${GH_ORG}/${TEMPLATES_REPO}/zipball/main`)
    if (!zipRes.ok) {
      const errText = await zipRes.text()
      return NextResponse.json(
        { error: `Failed to download template zipball: ${zipRes.status} ${errText.slice(0, 200)}` },
        { status: 500 },
      )
    }
    const zipBuffer = Buffer.from(await zipRes.arrayBuffer())
    const unzipped  = unzipSync(new Uint8Array(zipBuffer))

    // Zipball root is "Owner-Repo-SHA/" — find the template subfolder
    const templatePrefix = `/${template_id}/`
    // GitHub inline-content trees only support text. Binary files need separate blob upload.
    const TEXT_EXTS = new Set(['.ts','.tsx','.js','.jsx','.mjs','.cjs','.json','.jsonc','.toml','.yaml','.yml','.md','.html','.htm','.css','.scss','.svg','.txt','.env','.gitignore','.gitattributes','.prettierrc','.eslintrc','.nvmrc','.npmrc','.editorconfig'])
    const treeEntries: { path: string; mode: string; type: string; content: string }[] = []
    const workflowFiles: { path: string; content: string }[] = []
    let filesFound = 0

    for (const [zipPath, fileData] of Object.entries(unzipped)) {
      const idx = zipPath.indexOf(templatePrefix)
      if (idx === -1) continue
      const relPath = zipPath.slice(idx + templatePrefix.length)
      if (!relPath || relPath.endsWith('/')) continue  // skip directories
      filesFound++

      // event.ts is injected separately below
      if (relPath === 'src/config/event.ts') continue

      // Skip binary files that can't be represented as UTF-8 strings in JSON
      const ext = relPath.includes('.') ? '.' + relPath.split('.').pop()! : ''
      if (!TEXT_EXTS.has(ext)) continue

      let content = strFromU8(fileData)

      // Patch wrangler worker name to match this event's slug
      if (relPath === 'wrangler.jsonc' || relPath === 'wrangler.toml') {
        content = content.replace(/"name"\s*:\s*"[^"]+"/, `"name": "${workerName}"`)
      }

      // .github/workflows/ files can't go in the git tree (requires `workflow` token scope).
      // Collect them separately and push via the Contents API after the main commit.
      if (relPath.startsWith('.github/workflows/')) {
        workflowFiles.push({ path: relPath, content })
        continue
      }

      treeEntries.push({ path: relPath, mode: '100644', type: 'blob', content })
    }

    if (filesFound === 0) {
      return NextResponse.json(
        { error: `Template "${template_id}" not found in zipball. Check the folder name in ep-templates.` },
        { status: 404 },
      )
    }

    // Add generated event config (inline content — GitHub auto-creates the blob)
    treeEntries.push({ path: 'src/config/event.ts', mode: '100644', type: 'blob', content: config_ts })

    // ── 3. Create the GitHub repo under Trescon-Events org ───────────────────
    const createRes = await gh(`/orgs/${GH_ORG}/repos`, {
      method: 'POST',
      body:   JSON.stringify({
        name:        repoName,
        private:     true,
        description: `${event.name} — generated by Event Pilot`,
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
    }

    // ── 4. Create Git tree — GitHub auto-creates blobs from inline content ───
    if (treeEntries.length === 0) {
      return NextResponse.json({ error: 'No files to commit — treeEntries is empty' }, { status: 500 })
    }

    const gitTree = await ghJson<{ sha: string }>(
      `/repos/${GH_SITES_OWNER}/${repoName}/git/trees`,
      { method: 'POST', body: JSON.stringify({ tree: treeEntries }) },
    )

    // ── 5. Create commit ──────────────────────────────────────────────────────
    const commit = await ghJson<{ sha: string }>(
      `/repos/${GH_SITES_OWNER}/${repoName}/git/commits`,
      {
        method: 'POST',
        body:   JSON.stringify({
          message: `Initial commit — ${event.name} site generated by Event Pilot`,
          tree:    gitTree.sha,
          parents: [],
        }),
      },
    )

    // ── 6. Set main branch ────────────────────────────────────────────────────
    const refRes = await gh(`/repos/${GH_SITES_OWNER}/${repoName}/git/refs`, {
      method: 'POST',
      body:   JSON.stringify({ ref: 'refs/heads/main', sha: commit.sha }),
    })
    if (!refRes.ok) {
      // Branch already exists (repo was re-deployed) — force update
      await gh(`/repos/${GH_SITES_OWNER}/${repoName}/git/refs/heads/main`, {
        method: 'PATCH',
        body:   JSON.stringify({ sha: commit.sha, force: true }),
      })
    }

    // ── 7. Push workflow files via Contents API (git tree rejects .github/workflows/) ──
    for (const wf of workflowFiles) {
      // Get existing SHA if file already exists (required for update)
      const existingRes = await gh(`/repos/${GH_SITES_OWNER}/${repoName}/contents/${wf.path}?ref=main`)
      const existing = existingRes.ok ? await existingRes.json() as { sha?: string } : null
      await ghJson(`/repos/${GH_SITES_OWNER}/${repoName}/contents/${wf.path}`, {
        method: 'PUT',
        body: JSON.stringify({
          message: `Add ${wf.path}`,
          content: Buffer.from(wf.content).toString('base64'),
          branch: 'main',
          ...(existing?.sha ? { sha: existing.sha } : {}),
        }),
      })
    }

    // ── 9. Inject Cloudflare secrets into the new repo ───────────────────────
    try {
      await _sodium.ready
      const pkData = await ghJson<{ key_id: string; key: string }>(
        `/repos/${GH_SITES_OWNER}/${repoName}/actions/secrets/public-key`,
      )
      const keyBytes = _sodium.from_base64(pkData.key, _sodium.base64_variants.ORIGINAL)
      const encryptSecret = (value: string) => {
        const msgBytes = _sodium.from_string(value)
        const encrypted = _sodium.crypto_box_seal(msgBytes, keyBytes)
        return _sodium.to_base64(encrypted, _sodium.base64_variants.ORIGINAL)
      }
      const putSecret = (name: string, value: string) =>
        gh(`/repos/${GH_SITES_OWNER}/${repoName}/actions/secrets/${name}`, {
          method: 'PUT',
          body: JSON.stringify({ encrypted_value: encryptSecret(value), key_id: pkData.key_id }),
        })
      await Promise.all([
        putSecret('CLOUDFLARE_API_TOKEN', CF_API_TOKEN),
        putSecret('CLOUDFLARE_ACCOUNT_ID', CF_ACCOUNT_ID),
      ])
    } catch {
      // Non-fatal — build will fail but repo is created
    }

    // ── 10. Save deployment record to DB ─────────────────────────────────────
    const repoUrl = `https://github.com/${GH_SITES_OWNER}/${repoName}`
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
