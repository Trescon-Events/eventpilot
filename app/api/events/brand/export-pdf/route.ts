import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { requireBrandStudioAccess } from '@/app/lib/access/brand-studio-access'

/* GET /api/events/brand/export-pdf?event_id=X
   Returns a self-contained HTML brand book.
   Open in a new tab — print dialog auto-triggers so user can Save as PDF.
*/

type ColorEntry   = { name: string; hex: string; role: string; cmyk?: { c:number; m:number; y:number; k:number } | null; usage_notes?: string | null }
type TypeLevel    = { level: string; size_px: number; weight: number; line_height: string; usage: string }
type Archetype    = { role: string; name: string; description: string }
type PatternAsset = { name: string; url: string | null; usage_context: string }
type BrandAsset   = { id: string; asset_type: string; label: string | null; image_url: string }

function hex2rgb(hex: string): string {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0,2),16)
  const g = parseInt(h.slice(2,4),16)
  const b = parseInt(h.slice(4,6),16)
  return `${r}, ${g}, ${b}`
}

function contrastColor(hex: string): string {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0,2),16)
  const g = parseInt(h.slice(2,4),16)
  const b = parseInt(h.slice(4,6),16)
  const lum = (0.299*r + 0.587*g + 0.114*b) / 255
  return lum > 0.55 ? '#0F1923' : '#FFFFFF'
}

export async function GET(req: NextRequest) {
  const event_id = req.nextUrl.searchParams.get('event_id')
  if (!event_id) return NextResponse.json({ error: 'event_id required' }, { status: 400 })

  const denied = await requireBrandStudioAccess(event_id)
  if (denied) return denied

  const [guidelinesRes, assetsRes, eventRes] = await Promise.all([
    supabaseAdmin.from('event_brand_guidelines').select('*').eq('event_id', event_id).single(),
    supabaseAdmin.from('event_brand_assets').select('*').eq('event_id', event_id).order('created_at', { ascending: false }),
    supabaseAdmin.from('events').select('name').eq('id', event_id).single(),
  ])

  const g    = guidelinesRes.data
  const assets: BrandAsset[] = assetsRes.data ?? []
  const event = eventRes.data

  if (!g) {
    return new NextResponse('No brand guidelines found for this event.', { status: 404, headers: { 'Content-Type': 'text/plain' } })
  }

  const brandName   = g.brand_name   ?? event?.name ?? 'Event Brand'
  const primary     = g.primary_color   ?? '#00A5A3'
  const secondary   = g.secondary_color ?? '#0F1923'
  const accent      = g.accent_color    ?? '#C0F43C'
  const palette: ColorEntry[] = Array.isArray(g.color_palette) ? g.color_palette : []
  const typeScale: TypeLevel[] = Array.isArray(g.type_scale) ? g.type_scale : []
  const archetypes: Archetype[] = Array.isArray(g.brand_archetypes) ? g.brand_archetypes : []
  const patterns: PatternAsset[] = Array.isArray(g.pattern_assets) ? g.pattern_assets : []
  const keyMessages: string[] = Array.isArray(g.key_messages) ? g.key_messages : []
  const tones: string[] = Array.isArray(g.tone) ? g.tone : []
  const keywords: string[] = Array.isArray(g.style_keywords) ? g.style_keywords : []
  const typeRulesDos: string[]   = Array.isArray(g.type_rules_dos)   ? g.type_rules_dos   : []
  const typeRulesDonts: string[] = Array.isArray(g.type_rules_donts) ? g.type_rules_donts : []
  const logoDonts: string[]      = Array.isArray(g.logo_donts)       ? g.logo_donts       : []
  const headingFont = g.heading_font ?? 'Inter'
  const bodyFont    = g.body_font    ?? 'Inter'
  const exportDate  = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })

  // Google Fonts import string
  const fonts = [...new Set([headingFont, bodyFont])].map(f => f.replace(/ /g, '+')).join('&family=')

  function colorSwatch(c: ColorEntry) {
    const fg = contrastColor(c.hex)
    return `
      <div class="color-swatch">
        <div class="swatch-block" style="background:${c.hex};color:${fg};">
          <span class="swatch-hex">${c.hex.toUpperCase()}</span>
          ${c.cmyk ? `<span class="swatch-cmyk">C${c.cmyk.c} M${c.cmyk.m} Y${c.cmyk.y} K${c.cmyk.k}</span>` : ''}
        </div>
        <div class="swatch-meta">
          <div class="swatch-name">${c.name}</div>
          <div class="swatch-role">${c.role}</div>
          ${c.usage_notes ? `<div class="swatch-usage">${c.usage_notes}</div>` : ''}
        </div>
      </div>`
  }

  function typeRow(t: TypeLevel) {
    return `
      <tr>
        <td class="type-level">${t.level}</td>
        <td class="type-size">${t.size_px}px</td>
        <td class="type-weight">${t.weight}</td>
        <td class="type-lh">${t.line_height}</td>
        <td class="type-usage">${t.usage}</td>
      </tr>`
  }

  function section(id: string, title: string, content: string) {
    return `
      <section class="section" id="${id}">
        <div class="section-label">${title}</div>
        ${content}
      </section>`
  }

  function chip(text: string) {
    return `<span class="chip">${text}</span>`
  }

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${brandName} — Brand Guidelines</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=${fonts}&display=swap" rel="stylesheet">
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --primary:   ${primary};
    --secondary: ${secondary};
    --accent:    ${accent};
    --primary-rgb: ${hex2rgb(primary)};
    --text:      #0F1923;
    --muted:     #5B7080;
    --border:    #DDE8EE;
    --bg:        #F4F7FA;
    --heading-font: '${headingFont}', sans-serif;
    --body-font:    '${bodyFont}', sans-serif;
  }

  html { font-size: 14px; }
  body { font-family: var(--body-font); color: var(--text); background: #FFFFFF; -webkit-print-color-adjust: exact; print-color-adjust: exact; }

  /* ── Cover ── */
  .cover {
    background: linear-gradient(150deg, ${secondary} 0%, ${primary} 100%);
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    padding: 64px;
    page-break-after: always;
  }
  .cover-logo {
    display: inline-block;
    background: rgba(255,255,255,0.12);
    border: 1px solid rgba(255,255,255,0.2);
    border-radius: 12px;
    padding: 10px 20px;
    font-family: var(--heading-font);
    font-size: 15px;
    font-weight: 800;
    color: #ffffff;
    letter-spacing: 1px;
  }
  .cover-main { flex: 1; display: flex; flex-direction: column; justify-content: center; }
  .cover-eyebrow { font-size: 11px; font-weight: 800; letter-spacing: 3px; text-transform: uppercase; color: rgba(255,255,255,0.55); margin-bottom: 16px; }
  .cover-title { font-family: var(--heading-font); font-size: 64px; font-weight: 900; color: #ffffff; line-height: 1.05; letter-spacing: -1px; margin-bottom: 20px; }
  .cover-subtitle { font-size: 18px; color: rgba(255,255,255,0.75); line-height: 1.5; max-width: 560px; }
  .cover-accent-bar { width: 64px; height: 5px; background: ${accent}; border-radius: 3px; margin: 28px 0; }
  .cover-footer { display: flex; justify-content: space-between; align-items: flex-end; }
  .cover-date { font-size: 12px; color: rgba(255,255,255,0.45); }
  .cover-version { font-size: 12px; font-weight: 700; color: rgba(255,255,255,0.55); }

  /* ── Layout ── */
  .page { padding: 64px; max-width: 1000px; margin: 0 auto; }
  .section { margin-bottom: 64px; page-break-inside: avoid; }
  .section-label {
    font-family: var(--heading-font);
    font-size: 11px; font-weight: 800; letter-spacing: 3px; text-transform: uppercase;
    color: var(--primary); margin-bottom: 28px;
    padding-bottom: 12px; border-bottom: 2px solid var(--primary);
  }

  /* ── Identity ── */
  .identity-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
  .identity-card { background: var(--bg); border-radius: 12px; padding: 20px; }
  .identity-card-label { font-size: 10px; font-weight: 800; letter-spacing: 2px; text-transform: uppercase; color: var(--muted); margin-bottom: 8px; }
  .identity-card-value { font-size: 15px; font-weight: 700; color: var(--text); line-height: 1.5; }
  .positioning { background: linear-gradient(135deg, rgba(var(--primary-rgb),0.08), rgba(var(--primary-rgb),0.03)); border: 1px solid rgba(var(--primary-rgb),0.18); border-radius: 14px; padding: 28px; margin-bottom: 28px; }
  .positioning-quote { font-family: var(--heading-font); font-size: 22px; font-weight: 800; color: var(--text); line-height: 1.4; }

  /* ── Archetypes ── */
  .archetypes { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
  .archetype-card { background: var(--bg); border-radius: 12px; padding: 18px; border-left: 3px solid var(--primary); }
  .archetype-role { font-size: 10px; font-weight: 800; letter-spacing: 2px; text-transform: uppercase; color: var(--primary); margin-bottom: 4px; }
  .archetype-name { font-size: 15px; font-weight: 800; color: var(--text); margin-bottom: 6px; }
  .archetype-desc { font-size: 13px; color: var(--muted); line-height: 1.5; }

  /* ── Logo ── */
  .logo-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 24px; }
  .logo-cell { border: 1px solid var(--border); border-radius: 12px; overflow: hidden; }
  .logo-cell-bg { padding: 28px 20px; display: flex; align-items: center; justify-content: center; min-height: 120px; }
  .logo-cell-bg.light { background: #FFFFFF; }
  .logo-cell-bg.dark  { background: #0F1923; }
  .logo-cell-bg.brand { background: var(--primary); }
  .logo-cell img { max-width: 100%; max-height: 80px; object-fit: contain; }
  .logo-cell-label { padding: 8px 14px; font-size: 11px; font-weight: 700; color: var(--muted); background: var(--bg); }
  .logo-meta { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  .logo-meta-item { background: var(--bg); border-radius: 10px; padding: 14px; }
  .logo-meta-label { font-size: 10px; font-weight: 800; letter-spacing: 1.5px; text-transform: uppercase; color: var(--muted); margin-bottom: 4px; }
  .logo-meta-val { font-size: 13px; color: var(--text); font-weight: 600; line-height: 1.4; }

  /* ── Colors ── */
  .color-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; }
  .color-swatch { border-radius: 12px; overflow: hidden; border: 1px solid var(--border); }
  .swatch-block { padding: 28px 16px 16px; min-height: 100px; display: flex; flex-direction: column; justify-content: flex-end; }
  .swatch-hex  { font-family: monospace; font-size: 13px; font-weight: 700; display: block; }
  .swatch-cmyk { font-family: monospace; font-size: 10px; opacity: 0.75; display: block; margin-top: 3px; }
  .swatch-meta { padding: 12px 14px; background: #FFFFFF; }
  .swatch-name  { font-size: 13px; font-weight: 800; color: var(--text); }
  .swatch-role  { font-size: 11px; color: var(--muted); text-transform: capitalize; margin-top: 2px; }
  .swatch-usage { font-size: 11px; color: var(--muted); margin-top: 4px; line-height: 1.4; }

  /* ── Typography ── */
  .font-specimen { background: var(--bg); border-radius: 14px; padding: 28px; margin-bottom: 20px; }
  .font-specimen-label { font-size: 10px; font-weight: 800; letter-spacing: 2px; text-transform: uppercase; color: var(--muted); margin-bottom: 12px; }
  .specimen-heading { font-weight: 900; color: var(--text); line-height: 1.1; margin-bottom: 6px; }
  .specimen-sub { font-size: 14px; color: var(--muted); }
  .type-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 13px; }
  .type-table th { text-align: left; font-size: 10px; font-weight: 800; letter-spacing: 1.5px; text-transform: uppercase; color: var(--muted); padding: 0 12px 10px 0; border-bottom: 1px solid var(--border); }
  .type-table td { padding: 10px 12px 10px 0; border-bottom: 1px solid var(--border); color: var(--text); vertical-align: top; }
  .type-level  { font-weight: 700; }
  .type-size   { font-family: monospace; color: var(--primary); }
  .type-weight { font-family: monospace; }
  .type-lh     { font-family: monospace; }
  .type-usage  { color: var(--muted); }

  /* ── Voice ── */
  .tone-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 20px; }
  .tone-card { background: rgba(var(--primary-rgb),0.07); border: 1px solid rgba(var(--primary-rgb),0.18); border-radius: 10px; padding: 14px; text-align: center; font-size: 14px; font-weight: 800; color: var(--text); }
  .key-messages { display: flex; flex-direction: column; gap: 10px; }
  .key-message { display: flex; gap: 12px; align-items: flex-start; padding: 14px 16px; background: var(--bg); border-radius: 10px; }
  .key-message-num { width: 24px; height: 24px; border-radius: 50%; background: var(--primary); color: #fff; font-size: 11px; font-weight: 800; display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-top: 1px; }
  .key-message-text { font-size: 14px; color: var(--text); line-height: 1.5; }

  /* ── Chips ── */
  .chips { display: flex; flex-wrap: wrap; gap: 8px; }
  .chip { display: inline-flex; align-items: center; padding: 5px 12px; border-radius: 20px; background: rgba(var(--primary-rgb),0.1); border: 1px solid rgba(var(--primary-rgb),0.25); font-size: 13px; font-weight: 700; color: #00695C; }

  /* ── Assets ── */
  .assets-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
  .asset-card { border-radius: 12px; overflow: hidden; border: 1px solid var(--border); }
  .asset-img { width: 100%; aspect-ratio: 16/9; object-fit: cover; background: var(--bg); display: block; }
  .asset-label { padding: 10px 14px; font-size: 12px; font-weight: 700; color: var(--muted); }

  /* ── Rules list ── */
  .rules-list { display: flex; flex-direction: column; gap: 8px; }
  .rule-item { display: flex; gap: 10px; align-items: flex-start; font-size: 13px; color: var(--muted); line-height: 1.5; }
  .rule-dot-ok   { width: 6px; height: 6px; border-radius: 50%; background: #3D6B00; flex-shrink: 0; margin-top: 5px; }
  .rule-dot-no   { width: 6px; height: 6px; border-radius: 50%; background: #B91C1C; flex-shrink: 0; margin-top: 5px; }

  /* ── Print ── */
  @media print {
    body { background: #FFFFFF; }
    .cover { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .section { page-break-inside: avoid; }
  }
  @page { margin: 0; size: A4; }
</style>
</head>
<body>

<!-- ── Cover ── -->
<div class="cover">
  <div class="cover-logo">Event Pilot</div>
  <div class="cover-main">
    <div class="cover-eyebrow">Brand Guidelines</div>
    <h1 class="cover-title">${brandName}</h1>
    ${g.positioning_statement ? `<p class="cover-subtitle">${g.positioning_statement}</p>` : ''}
    <div class="cover-accent-bar"></div>
  </div>
  <div class="cover-footer">
    <span class="cover-date">Exported ${exportDate}</span>
    <span class="cover-version">Confidential · Internal Use</span>
  </div>
</div>

<!-- ── Content Pages ── -->
<div class="page">

  ${/* IDENTITY */
  section('identity', '01 — Brand Identity', `
    ${g.positioning_statement ? `
    <div class="positioning">
      <div class="identity-card-label" style="margin-bottom:10px;">Positioning Statement</div>
      <div class="positioning-quote">&ldquo;${g.positioning_statement}&rdquo;</div>
    </div>` : ''}

    <div class="identity-grid">
      ${g.brand_category ? `<div class="identity-card"><div class="identity-card-label">Category</div><div class="identity-card-value">${g.brand_category}</div></div>` : ''}
      ${g.brand_vision   ? `<div class="identity-card"><div class="identity-card-label">Vision</div><div class="identity-card-value">${g.brand_vision}</div></div>` : ''}
      ${g.brand_mission  ? `<div class="identity-card"><div class="identity-card-label">Mission</div><div class="identity-card-value">${g.brand_mission}</div></div>` : ''}
    </div>

    ${archetypes.length > 0 ? `
    <div style="margin-top:24px;">
      <div class="identity-card-label" style="margin-bottom:14px;">Brand Archetypes</div>
      <div class="archetypes">
        ${archetypes.map(a => `
          <div class="archetype-card">
            <div class="archetype-role">${a.role}</div>
            <div class="archetype-name">${a.name}</div>
            <div class="archetype-desc">${a.description}</div>
          </div>`).join('')}
      </div>
    </div>` : ''}
  `)}

  ${/* LOGO */
  (g.logo_primary_url || g.logo_white_url || g.logo_dark_url || g.logo_concept) ? section('logo', '02 — Logo', `
    ${(g.logo_primary_url || g.logo_white_url || g.logo_dark_url) ? `
    <div class="logo-grid" style="margin-bottom:24px;">
      ${g.logo_primary_url ? `<div class="logo-cell"><div class="logo-cell-bg light"><img src="${g.logo_primary_url}" alt="Primary logo"></div><div class="logo-cell-label">Primary</div></div>` : ''}
      ${g.logo_white_url   ? `<div class="logo-cell"><div class="logo-cell-bg dark"><img src="${g.logo_white_url}" alt="White logo"></div><div class="logo-cell-label">White / Reversed</div></div>` : ''}
      ${g.logo_dark_url    ? `<div class="logo-cell"><div class="logo-cell-bg brand"><img src="${g.logo_dark_url}" alt="Dark logo"></div><div class="logo-cell-label">On Brand Color</div></div>` : ''}
    </div>` : ''}

    <div class="logo-meta">
      ${g.logo_min_size_digital ? `<div class="logo-meta-item"><div class="logo-meta-label">Min size digital</div><div class="logo-meta-val">${g.logo_min_size_digital}</div></div>` : ''}
      ${g.logo_min_size_print   ? `<div class="logo-meta-item"><div class="logo-meta-label">Min size print</div><div class="logo-meta-val">${g.logo_min_size_print}</div></div>` : ''}
      ${g.logo_clear_space      ? `<div class="logo-meta-item"><div class="logo-meta-label">Clear space</div><div class="logo-meta-val">${g.logo_clear_space}</div></div>` : ''}
      ${g.logo_cobranding_rules ? `<div class="logo-meta-item"><div class="logo-meta-label">Co-branding rules</div><div class="logo-meta-val">${g.logo_cobranding_rules}</div></div>` : ''}
    </div>

    ${g.logo_concept ? `<div style="margin-top:20px;padding:18px;background:var(--bg);border-radius:12px;font-size:13px;color:var(--muted);line-height:1.6;"><strong style="color:var(--text);">Concept: </strong>${g.logo_concept}</div>` : ''}

    ${logoDonts.length > 0 ? `
    <div style="margin-top:20px;">
      <div class="identity-card-label" style="margin-bottom:12px;">Logo Don'ts</div>
      <div class="rules-list">
        ${logoDonts.map(d => `<div class="rule-item"><span class="rule-dot-no"></span><span>${d}</span></div>`).join('')}
      </div>
    </div>` : ''}
  `) : ''}

  ${/* COLORS */
  palette.length > 0 ? section('colors', '03 — Color Palette', `
    <div class="color-grid">
      ${palette.map(colorSwatch).join('')}
    </div>
    ${g.color_usage_rules ? `<div style="margin-top:20px;padding:18px;background:var(--bg);border-radius:12px;font-size:13px;color:var(--muted);line-height:1.6;"><strong style="color:var(--text);">Usage rules: </strong>${g.color_usage_rules}</div>` : ''}
  `) : (g.primary_color ? section('colors', '03 — Color Palette', `
    <div class="color-grid">
      ${[
        g.primary_color   ? { name: 'Primary',    hex: g.primary_color,   role: 'primary'   } : null,
        g.secondary_color ? { name: 'Secondary',  hex: g.secondary_color, role: 'secondary' } : null,
        g.accent_color    ? { name: 'Accent',     hex: g.accent_color,    role: 'accent'    } : null,
        g.background_color? { name: 'Background', hex: g.background_color,role: 'bg'        } : null,
        g.text_color      ? { name: 'Text',       hex: g.text_color,      role: 'text'      } : null,
      ].filter(Boolean).map(c => colorSwatch(c as ColorEntry)).join('')}
    </div>
  `) : '')}

  ${/* TYPOGRAPHY */
  (g.heading_font || g.body_font) ? section('typography', '04 — Typography', `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:24px;">
      ${g.heading_font ? `
      <div class="font-specimen">
        <div class="font-specimen-label">Heading Font</div>
        <div class="specimen-heading" style="font-family:'${g.heading_font}',sans-serif;font-size:32px;">${g.heading_font}</div>
        <div class="specimen-sub" style="font-family:'${g.heading_font}',sans-serif;">Aa Bb Cc 0123456789</div>
      </div>` : ''}
      ${g.body_font ? `
      <div class="font-specimen">
        <div class="font-specimen-label">Body Font</div>
        <div class="specimen-heading" style="font-family:'${g.body_font}',sans-serif;font-size:24px;font-weight:400;">${g.body_font}</div>
        <div class="specimen-sub" style="font-family:'${g.body_font}',sans-serif;">The quick brown fox jumps over the lazy dog.</div>
      </div>` : ''}
    </div>

    ${typeScale.length > 0 ? `
    <table class="type-table">
      <thead><tr>
        <th>Level</th><th>Size</th><th>Weight</th><th>Line Height</th><th>Usage</th>
      </tr></thead>
      <tbody>${typeScale.map(typeRow).join('')}</tbody>
    </table>` : ''}

    ${typeRulesDos.length > 0 ? `
    <div style="margin-bottom:16px;">
      <div class="identity-card-label" style="margin-bottom:10px;">Typography Do's</div>
      <div class="rules-list">${typeRulesDos.map(r => `<div class="rule-item"><span class="rule-dot-ok"></span><span>${r}</span></div>`).join('')}</div>
    </div>` : ''}
    ${typeRulesDonts.length > 0 ? `
    <div>
      <div class="identity-card-label" style="margin-bottom:10px;">Typography Don'ts</div>
      <div class="rules-list">${typeRulesDonts.map(r => `<div class="rule-item"><span class="rule-dot-no"></span><span>${r}</span></div>`).join('')}</div>
    </div>` : ''}
  `) : ''}

  ${/* PATTERNS */
  patterns.length > 0 ? section('patterns', '05 — Patterns & Textures', `
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:14px;">
      ${patterns.map(p => `
        <div style="border:1px solid var(--border);border-radius:12px;overflow:hidden;">
          ${p.url ? `<img src="${p.url}" alt="${p.name}" style="width:100%;height:120px;object-fit:cover;display:block;">` : `<div style="height:120px;background:var(--bg);"></div>`}
          <div style="padding:12px 14px;background:#fff;">
            <div style="font-size:13px;font-weight:800;color:var(--text);margin-bottom:3px;">${p.name}</div>
            <div style="font-size:12px;color:var(--muted);">${p.usage_context}</div>
          </div>
        </div>`).join('')}
    </div>
  `) : ''}

  ${/* VOICE */
  (tones.length > 0 || keyMessages.length > 0 || keywords.length > 0) ? section('voice', '06 — Voice &amp; Tone', `
    ${tones.length > 0 ? `
    <div style="margin-bottom:24px;">
      <div class="identity-card-label" style="margin-bottom:12px;">Tone of Voice</div>
      <div class="tone-grid">${tones.map(t => `<div class="tone-card">${t}</div>`).join('')}</div>
    </div>` : ''}

    ${keywords.length > 0 ? `
    <div style="margin-bottom:24px;">
      <div class="identity-card-label" style="margin-bottom:10px;">Style Keywords</div>
      <div class="chips">${keywords.map(chip).join('')}</div>
    </div>` : ''}

    ${keyMessages.length > 0 ? `
    <div>
      <div class="identity-card-label" style="margin-bottom:12px;">Key Messages</div>
      <div class="key-messages">
        ${keyMessages.map((m, i) => `
          <div class="key-message">
            <div class="key-message-num">${i + 1}</div>
            <div class="key-message-text">${m}</div>
          </div>`).join('')}
      </div>
    </div>` : ''}
  `) : ''}

  ${/* GENERATED ASSETS */
  assets.length > 0 ? section('assets', '07 — Generated Assets', `
    <div class="assets-grid">
      ${assets.slice(0, 9).map(a => `
        <div class="asset-card">
          <img src="${a.image_url}" alt="${a.label ?? a.asset_type}" class="asset-img" loading="lazy">
          <div class="asset-label">${a.label ?? a.asset_type.replace(/_/g,' ')}</div>
        </div>`).join('')}
    </div>
  `) : ''}

</div>

<script>
  window.addEventListener('load', function() {
    setTimeout(function() { window.print(); }, 800);
  });
</script>
</body>
</html>`

  return new NextResponse(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })
}
