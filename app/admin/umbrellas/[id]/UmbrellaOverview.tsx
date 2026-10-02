import Link from 'next/link'
import { supabaseAdmin } from '@/app/lib/supabase'

/* Umbrella workspace hub (2026-10-02) — mirrors the event workspace's hub: a header and a grid of module tiles. Each person
   sees only the tiles they can use (decided by the layout and passed in): an Operations user sees the Operations tile and
   nothing else; a platform admin sees Event Details, Reference Documents, Access and the child event workspaces too. */

const fmt = (iso: string | null) => (iso ? new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : null)
const fmtRange = (a: string | null, b: string | null) => (a && b && a !== b ? `${fmt(a)} – ${fmt(b)}` : fmt(a) ?? 'Dates not set')

function Tile({ href, icon, title, description, tint }: { href: string; icon: string; title: string; description: string; tint: string }) {
  return (
    <Link href={href} style={{ textDecoration: 'none' }}>
      <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', padding: '14px 16px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--card)', height: '100%' }}>
        <div style={{ width: '34px', height: '34px', borderRadius: '9px', background: tint, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', flexShrink: 0 }}>{icon}</div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--ink)' }}>{title}</div>
          <div style={{ fontSize: '12.5px', color: 'var(--ink3)', marginTop: '3px', lineHeight: 1.5 }}>{description}</div>
        </div>
      </div>
    </Link>
  )
}

export default async function UmbrellaOverview({ umbrellaId, isAdmin, canOps }: { umbrellaId: string; isAdmin: boolean; canOps: boolean }) {
  const [{ data: u }, { data: kids }] = await Promise.all([
    supabaseAdmin.from('event_umbrellas').select('id, name, client_name, status, event_date, end_date, description').eq('id', umbrellaId).maybeSingle(),
    supabaseAdmin.from('events').select('id, name, status, event_date, end_date, city').eq('umbrella_id', umbrellaId).order('event_date', { ascending: true }),
  ])
  if (!u) return <div style={{ padding: '40px', textAlign: 'center', color: 'var(--red)' }}>Umbrella event not found.</div>
  const base = `/admin/umbrellas/${umbrellaId}`
  const children = kids ?? []

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '8px 32px 48px' }}>
      <div style={{ padding: '22px 0 20px' }}>
        <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '0.8px', textTransform: 'uppercase', color: 'var(--teal-mid)' }}>Umbrella Event</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', margin: '6px 0 6px' }}>
          <h1 style={{ fontSize: '26px', fontWeight: 800, color: 'var(--ink)', margin: 0 }}>{u.name}</h1>
          <span style={{ fontSize: '11px', fontWeight: 800, textTransform: 'capitalize', padding: '4px 10px', borderRadius: '999px', background: 'var(--teal-light)', color: 'var(--teal-mid)' }}>{u.status}</span>
        </div>
        <div style={{ fontSize: '13.5px', color: 'var(--ink3)' }}>
          {[u.client_name, fmtRange(u.event_date, u.end_date), `${children.length} event${children.length === 1 ? '' : 's'}`].filter(Boolean).join('  ·  ')}
        </div>
        {u.description && <div style={{ fontSize: '13.5px', color: 'var(--ink2)', marginTop: '8px', maxWidth: '720px', lineHeight: 1.6 }}>{u.description}</div>}
      </div>

      <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '0.6px', textTransform: 'uppercase', color: 'var(--ink4)', margin: '4px 0 10px' }}>Modules</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px' }}>
        {canOps && <Tile href={`${base}/operations`} icon="⚙" tint="color-mix(in srgb, var(--amber) 16%, transparent)" title="Operations" description="Speaker licences, vendors and badge printing for every event in this umbrella, and who handles each section." />}
        {isAdmin && <Tile href={`${base}/details`} icon="◈" tint="color-mix(in srgb, var(--teal-mid) 16%, transparent)" title="Event Details" description="Name, client, status and dates; content approval; event days; the dates of each event under it." />}
        {isAdmin && <Tile href={`${base}/reference-docs`} icon="❏" tint="color-mix(in srgb, var(--purple) 16%, transparent)" title="Reference Documents" description="Style guide, messaging document and production pack shared by every event, plus a copy checker." />}
        {isAdmin && <Tile href={`${base}/access`} icon="⚿" tint="color-mix(in srgb, var(--red) 14%, transparent)" title="Access" description="Give someone a role across every event in this umbrella." />}
      </div>

      {isAdmin && children.length > 0 && (
        <>
          <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '0.6px', textTransform: 'uppercase', color: 'var(--ink4)', margin: '30px 0 10px' }}>Events in this umbrella</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px' }}>
            {children.map(c => (
              <Link key={c.id} href={`/admin/events/${c.id}`} style={{ textDecoration: 'none' }}>
                <div style={{ padding: '14px 16px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--card)', height: '100%' }}>
                  <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--ink)' }}>{c.name}</div>
                  <div style={{ fontSize: '12.5px', color: 'var(--ink3)', marginTop: '4px' }}>{fmtRange(c.event_date, c.end_date)}{c.city ? ` · ${c.city}` : ''}</div>
                  <div style={{ fontSize: '12px', color: 'var(--teal-mid)', marginTop: '8px', fontWeight: 700 }}>Open event workspace →</div>
                </div>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
