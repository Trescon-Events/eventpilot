import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { getModuleRegistry } from '@/app/lib/registry/modules'

/* GET /api/admin/access-center-summary
   Powers app/admin/access-center/page.tsx's "Tool tier" card — a live
   count of module_access grants (user/admin tier) per tool, so an admin
   can see at a glance who already has delegated sub-admin access to each
   tool without opening every tool's own Settings → Access tab one by one.
   This is a READ-ONLY index — it doesn't grant/revoke anything itself,
   just aggregates data already fetched by AccessTab.tsx's per-tool routes.

   Deliberately excludes 'sae': its AccessTab embed
   (app/admin/events/[id]/creative-templates/admin/page.tsx) is per-event,
   has no single global settings destination, and its module_access gate
   is stale (the real gate is sae.admin.access via the per-event RBAC —
   see that layout's own 2026-08-16 migration comment). Listing it here
   would just be a dead end.

   TOOLS below is a hand-curated list (not derived from the registry) —
   which tools actually have an AccessTab-backed settings page, and
   where, isn't a fact the module registry encodes; it only lists module
   keys and grantKeys, not settings-page routes. Confirmed live against
   every settings page under app/admin and the top-level tool directories
   in the repo, 2026-08-16 (Access & Permissions hub build-out). */

// registryKey = app/lib/registry/modules.tsx's module `key` (for display
// label lookup). accessKey = the value actually stored in
// module_access.module_key — usually identical to registryKey, but NOT
// for docuhub, whose registry key is 'docuhub' while its moduleAccessKey
// (and therefore every module_access row's module_key) is 'dochub' —
// confirmed live; using registryKey there would silently show 0 grants
// for a tool that actually has 8.
const TOOLS: { registryKey: string; accessKey: string; settingsUrl: string; legacy?: string }[] = [
  { registryKey: 'commercial',           accessKey: 'commercial',           settingsUrl: '/admin/commercial/settings' },
  { registryKey: 'bespoke-tracker',      accessKey: 'bespoke-tracker',      settingsUrl: '/admin/bespoke/settings' },
  { registryKey: 'website-builder',      accessKey: 'website-builder',      settingsUrl: '/admin/toolkit/settings/event-tools', legacy: 'This tool now uses the event-workspace RBAC system for actual access — grants here no longer take effect.' },
  { registryKey: 'market-intel',         accessKey: 'market-intel',         settingsUrl: '/admin/toolkit/settings/event-tools', legacy: 'This tool now uses the event-workspace RBAC system for actual access — grants here no longer take effect.' },
  { registryKey: 'brand-studio',         accessKey: 'brand-studio',         settingsUrl: '/admin/toolkit/settings/event-tools', legacy: 'This tool now uses the event-workspace RBAC system for actual access — grants here no longer take effect.' },
  { registryKey: 'docuhub',              accessKey: 'dochub',               settingsUrl: '/admin/toolkit/docuhub/settings' },
  { registryKey: 'knowledge-assistant',  accessKey: 'knowledge-assistant',  settingsUrl: '/admin/toolkit/knowledge-assistant/settings' },
  { registryKey: 'kb',                   accessKey: 'kb',                   settingsUrl: '/admin/toolkit/knowledge-base/settings' },
  { registryKey: 'content',              accessKey: 'content',              settingsUrl: '/content/settings' },
  { registryKey: 'hr',                   accessKey: 'hr',                   settingsUrl: '/hr/settings' },
  { registryKey: 'finance',              accessKey: 'finance',              settingsUrl: '/finance/settings' },
  { registryKey: 'data-extract',         accessKey: 'data-extract',         settingsUrl: '/data/settings' },
]

export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session?.adm) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })

  const { data: grants } = await supabaseAdmin.from('module_access').select('module_key, tier')
  const counts = new Map<string, { user: number; admin: number }>()
  for (const g of grants ?? []) {
    const bucket = counts.get(g.module_key) ?? { user: 0, admin: 0 }
    if (g.tier === 'admin') bucket.admin++
    else if (g.tier === 'user') bucket.user++
    counts.set(g.module_key, bucket)
  }

  const registry = getModuleRegistry()
  const labelFor = (key: string) => registry.find(m => m.key === key)?.label ?? key

  const tools = TOOLS.map(t => ({
    moduleKey:  t.registryKey,
    label:      labelFor(t.registryKey),
    settingsUrl: t.settingsUrl,
    legacy:     t.legacy ?? null,
    userGrants:  counts.get(t.accessKey)?.user ?? 0,
    adminGrants: counts.get(t.accessKey)?.admin ?? 0,
  }))

  return NextResponse.json({ tools })
}
