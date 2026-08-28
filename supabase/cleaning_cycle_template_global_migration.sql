-- Genuinely global (not per-event) Cleaning Cycle template (2026-08-28).
-- Was events.creative_template_config.cleaning_cycle_template, set up
-- separately per event even though the code's own comment already called
-- it "the single standard every speaker's Cleaned Photo is measured
-- against" — same shape as the placeholder-defaults globalization done a
-- day earlier (template_placeholder_defaults). Only one event (World AI
-- Show Malaysia) had ever actually configured this, confirmed live before
-- writing this migration — seeded below so nothing is lost.
create table if not exists cleaning_cycle_template_global (
  id smallint primary key default 1 check (id = 1),
  reference_url text,
  target_head_center_x double precision,
  target_head_center_y double precision,
  target_head_height double precision,
  reference_box_width double precision,
  reference_box_height double precision,
  shot_type text,
  prompt text not null default '',
  updated_by text,
  updated_at timestamptz not null default now()
);

insert into cleaning_cycle_template_global (
  id, reference_url, target_head_center_x, target_head_center_y, target_head_height,
  reference_box_width, reference_box_height, shot_type, prompt
)
select
  1,
  tmpl->>'reference_url',
  (tmpl->>'target_head_center_x')::double precision,
  (tmpl->>'target_head_center_y')::double precision,
  (tmpl->>'target_head_height')::double precision,
  (tmpl->>'reference_box_width')::double precision,
  (tmpl->>'reference_box_height')::double precision,
  tmpl->>'shot_type',
  coalesce(tmpl->>'prompt', '')
from (
  select creative_template_config->'cleaning_cycle_template' as tmpl, updated_at
  from events
  where creative_template_config->'cleaning_cycle_template'->>'reference_url' is not null
  order by updated_at desc nulls last
  limit 1
) seed
on conflict (id) do nothing;

-- Strip the now-stale per-event copy so nothing reads two disagreeing
-- copies of what is meant to be one standard going forward.
update events
set creative_template_config = creative_template_config - 'cleaning_cycle_template'
where creative_template_config ? 'cleaning_cycle_template';
