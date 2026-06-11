-- ── Site Templates Registry ──────────────────────────────────────────────────
-- Stores all available event site templates.
-- Super admins manage this table. New templates = new rows, no code changes.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists site_templates (
  id              text primary key,            -- e.g. 'template-2-vault2047'
  label           text not null,               -- 'Template 2 — Vault 2047'
  event_name      text not null,               -- 'Vault 2047'
  description     text not null,
  preview_url     text,                        -- Screenshot URL
  repo_url        text not null,               -- GitHub URL for this template folder
  folder_name     text not null,               -- folder inside ep-templates repo
  tech            text[] default '{}',
  pages           text[] default '{}',
  style_tags      text[] default '{}',
  color_bg        text not null default '#0D0F14',
  color_accent    text not null default '#00A5A3',
  color_highlight text not null default '#F0B732',
  active          boolean not null default true,
  sort_order      integer not null default 0,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

-- RLS: anyone authenticated can read; only super_admin can write
alter table site_templates enable row level security;

create policy "templates_read" on site_templates
  for select using (true);

create policy "templates_write" on site_templates
  for all using (
    exists (
      select 1 from staff_members
      where email = (select email from auth.users where id = auth.uid())
      and role = 'super_admin'
    )
  );

-- ── Seed the 5 existing templates ────────────────────────────────────────────
insert into site_templates (id, label, event_name, description, repo_url, folder_name, tech, pages, style_tags, color_bg, color_accent, color_highlight, sort_order) values

('template-1-finance2045',
 'Template 1 — Finance 2045',
 'Finance 2045',
 'Glassmorphism hero with animated corner brackets, teal + gold palette, multi-page with subnav. Best for: finance, BFSI, investment, capital markets.',
 'https://github.com/Trescon-Events/ep-templates/tree/main/template-1-finance2045',
 'template-1-finance2045',
 ARRAY['Next.js', 'Cloudflare Workers', 'Konfhub API', 'Lufga font'],
 ARRAY['home', 'agenda', 'speakers', 'partners', 'attend', 'networking', 'startups', 'knowledge-hub', 'blog'],
 ARRAY['dark', 'glassmorphism', 'multi-page', 'subnav'],
 '#1F2733', '#00A5A3', '#E9C268', 1),

('template-2-vault2047',
 'Template 2 — Vault 2047',
 'Vault 2047',
 'Cyber/tech dark theme, Orbitron + IBM Plex Sans, copper shimmer headline, full admin panel with DB-backed content. Best for: cybersecurity, tech, enterprise.',
 'https://github.com/Trescon-Events/ep-templates/tree/main/template-2-vault2047',
 'template-2-vault2047',
 ARRAY['Next.js', 'Neon Postgres', 'Framer Motion', 'Lenis scroll', 'Admin panel'],
 ARRAY['home', 'speakers', 'agenda', 'partners', 'exhibitors', 'media', 'blog', 'register', 'admin'],
 ARRAY['dark', 'cyber', 'admin-panel', 'db-backed'],
 '#020F0F', '#0D6665', '#B86A2E', 2),

('template-3-world-cx-summit',
 'Template 3 — World CX Summit',
 'World CX Summit & Awards',
 'Clean enterprise navy + teal + gold, rolling digit stats, cursor glow, awards section. Best for: CX, enterprise tech, leadership, awards ceremonies.',
 'https://github.com/Trescon-Events/ep-templates/tree/main/template-3-world-cx-summit',
 'template-3-world-cx-summit',
 ARRAY['Next.js', 'Vercel Blob', 'Plus Jakarta Sans', 'CursorGlow'],
 ARRAY['home', 'agenda', 'speakers', 'awards', 'partners', 'attend', 'blog', 'networking'],
 ARRAY['dark', 'enterprise', 'awards', 'clean'],
 '#0A1628', '#36BCB0', '#C9A84C', 3),

('template-4-world-ai-show',
 'Template 4 — World AI Show',
 'World AI Show Indonesia',
 'Warm off-white hero with animated SVG data streams, parallax scroll. Unique light theme. Best for: AI, innovation, tech events wanting a different look.',
 'https://github.com/Trescon-Events/ep-templates/tree/main/template-4-world-ai-show',
 'template-4-world-ai-show',
 ARRAY['Next.js', 'Space Grotesk', 'Inter', 'SVG animation', 'Parallax'],
 ARRAY['home', 'speakers', 'agenda', 'partners', 'register', 'enquire', 'knowledge-hub'],
 ARRAY['light', 'ai-theme', 'parallax', 'data-streams'],
 '#F5F0EB', '#1b9ad6', '#c0f43c', 4),

('template-5-big-cio-show',
 'Template 5 — Big CIO Show',
 'Big CIO Show & Awards',
 'Enterprise CIO/awards format, discussion themes grid, Konfhub ticketing, exhibitor portal. Best for: CIO/CISO events, IT leadership, awards, enterprise.',
 'https://github.com/Trescon-Events/ep-templates/tree/main/template-5-big-cio-show',
 'template-5-big-cio-show',
 ARRAY['Next.js', 'Plus Jakarta Sans', 'Konfhub', 'Awards module'],
 ARRAY['home', 'agenda', 'speakers', 'awards', 'partners', 'attend', 'networking', 'startups'],
 ARRAY['dark', 'corporate', 'awards', 'cio'],
 '#0D0F14', '#3B6FE8', '#F0B732', 5)

on conflict (id) do update set
  label           = excluded.label,
  description     = excluded.description,
  updated_at      = now();
