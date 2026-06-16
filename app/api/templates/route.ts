import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

// ── Template Registry ─────────────────────────────────────────────────────────
// Templates are stored in the site_templates Supabase table.
// Super admins add new templates via Event Pilot without code changes.
// Hardcoded FALLBACK_TEMPLATES used if DB is unavailable.
// ─────────────────────────────────────────────────────────────────────────────

export type TemplateInfo = {
  id:               string
  label:            string
  event_name:       string
  description:      string
  preview_url:      string
  live_preview_url: string
  repo_url:         string
  folder_name:      string
  tech:             string[]
  pages:            string[]
  color_scheme:     { bg: string; accent: string; highlight: string }
  style_tags:       string[]
  sort_order:       number
}

// Fallback if DB is down — keeps the UI working
const FALLBACK_TEMPLATES: TemplateInfo[] = [
  { id: 'template-1-finance2045',      label: 'Template 1 — Finance 2045',       event_name: 'Finance 2045',            description: 'Glassmorphism hero, teal + gold palette, multi-page with subnav. Finance, BFSI, investment.',              preview_url: '/template-previews/template-1.jpg', live_preview_url: '', repo_url: 'https://github.com/Trescon-Events/ep-templates/tree/main/template-1-finance2045',      folder_name: 'template-1-finance2045',      tech: ['Next.js','Cloudflare Workers','Konfhub API'],                     pages: ['home','agenda','speakers','partners','attend','networking','blog'],          color_scheme: { bg: '#1F2733', accent: '#00A5A3', highlight: '#E9C268' }, style_tags: ['dark','glassmorphism','multi-page'], sort_order: 1 },
  { id: 'template-2-vault2047',        label: 'Template 2 — Vault 2047',         event_name: 'Vault 2047',              description: 'Cyber dark theme, copper shimmer headline, admin panel + DB-backed content. Tech, cybersecurity.',          preview_url: '/template-previews/template-2.jpg', live_preview_url: '', repo_url: 'https://github.com/Trescon-Events/ep-templates/tree/main/template-2-vault2047',        folder_name: 'template-2-vault2047',        tech: ['Next.js','Neon Postgres','Framer Motion','Admin panel'],          pages: ['home','speakers','agenda','partners','exhibitors','media','blog'], color_scheme: { bg: '#020F0F', accent: '#0D6665', highlight: '#B86A2E' }, style_tags: ['dark','cyber','admin-panel'],        sort_order: 2 },
  { id: 'template-3-world-cx-summit',  label: 'Template 3 — World CX Summit',    event_name: 'World CX Summit & Awards',description: 'Navy + teal + gold, rolling stats, cursor glow, awards section. CX, enterprise, awards.',                  preview_url: '/template-previews/template-3.jpg', live_preview_url: '', repo_url: 'https://github.com/Trescon-Events/ep-templates/tree/main/template-3-world-cx-summit',  folder_name: 'template-3-world-cx-summit',  tech: ['Next.js','Vercel Blob','Plus Jakarta Sans'],                     pages: ['home','agenda','speakers','awards','partners','attend','blog'],    color_scheme: { bg: '#0A1628', accent: '#36BCB0', highlight: '#C9A84C' }, style_tags: ['dark','enterprise','awards'],        sort_order: 3 },
  { id: 'template-4-world-ai-show',    label: 'Template 4 — World AI Show',      event_name: 'World AI Show Indonesia', description: 'Warm off-white hero, SVG data streams, parallax scroll. AI, innovation, unique light aesthetic.',          preview_url: '/template-previews/template-4.jpg', live_preview_url: '', repo_url: 'https://github.com/Trescon-Events/ep-templates/tree/main/template-4-world-ai-show',    folder_name: 'template-4-world-ai-show',    tech: ['Next.js','Space Grotesk','SVG animation','Parallax'],            pages: ['home','speakers','agenda','partners','register','knowledge-hub'], color_scheme: { bg: '#F5F0EB', accent: '#1b9ad6', highlight: '#c0f43c' }, style_tags: ['light','ai-theme','parallax'],       sort_order: 4 },
  { id: 'template-5-big-cio-show',     label: 'Template 5 — Big CIO Show',       event_name: 'Big CIO Show & Awards',   description: 'Enterprise CIO/awards format, themes grid, Konfhub ticketing. CIO/CISO events, IT leadership.',             preview_url: '/template-previews/template-5.jpg', live_preview_url: '', repo_url: 'https://github.com/Trescon-Events/ep-templates/tree/main/template-5-big-cio-show',     folder_name: 'template-5-big-cio-show',     tech: ['Next.js','Plus Jakarta Sans','Konfhub','Awards module'],         pages: ['home','agenda','speakers','awards','partners','attend'],          color_scheme: { bg: '#0D0F14', accent: '#3B6FE8', highlight: '#F0B732' }, style_tags: ['dark','corporate','awards','cio'],   sort_order: 5 },
]

function dbRowToTemplate(row: Record<string, unknown>): TemplateInfo {
  return {
    id:               row.id as string,
    label:            row.label as string,
    event_name:       row.event_name as string,
    description:      row.description as string,
    preview_url:      (row.preview_url as string) || '/template-previews/placeholder.jpg',
    live_preview_url: (row.live_preview_url as string) || '',
    repo_url:         row.repo_url as string,
    folder_name:      row.folder_name as string,
    tech:             (row.tech as string[]) || [],
    pages:            (row.pages as string[]) || [],
    color_scheme:     { bg: row.color_bg as string, accent: row.color_accent as string, highlight: row.color_highlight as string },
    style_tags:       (row.style_tags as string[]) || [],
    sort_order:       (row.sort_order as number) || 0,
  }
}

// GET /api/templates — returns all active templates ordered by sort_order
export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from('site_templates')
      .select('*')
      .eq('active', true)
      .order('sort_order', { ascending: true })

    if (error || !data?.length) {
      return NextResponse.json({ templates: FALLBACK_TEMPLATES, source: 'fallback' })
    }

    return NextResponse.json({ templates: data.map(dbRowToTemplate), source: 'db' })
  } catch {
    return NextResponse.json({ templates: FALLBACK_TEMPLATES, source: 'fallback' })
  }
}

// POST /api/templates — super admin adds a new template
export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { id, label, event_name, description, repo_url, folder_name, tech, pages, style_tags, color_bg, color_accent, color_highlight, preview_url, live_preview_url, sort_order } = body

    if (!id || !label || !event_name || !folder_name || !repo_url) {
      return NextResponse.json({ error: 'id, label, event_name, folder_name, repo_url are required' }, { status: 400 })
    }

    const { data, error } = await supabaseAdmin
      .from('site_templates')
      .upsert({
        id, label, event_name, description: description || '', repo_url, folder_name,
        tech: tech || [], pages: pages || [], style_tags: style_tags || [],
        color_bg: color_bg || '#0D0F14', color_accent: color_accent || '#00A5A3',
        color_highlight: color_highlight || '#F0B732',
        preview_url: preview_url || null,
        live_preview_url: live_preview_url || null,
        sort_order: sort_order || 99,
        active: true,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ template: dbRowToTemplate(data) })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}

// PATCH /api/templates — update (e.g. toggle active, update preview_url)
export async function PATCH(req: Request) {
  try {
    const { id, ...updates } = await req.json()
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
    const { error } = await supabaseAdmin
      .from('site_templates')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
