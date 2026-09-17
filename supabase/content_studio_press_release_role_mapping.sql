-- ─── PRESS RELEASE STUDIO — AUTO-GRANT VIA STAFF PORTAL ROLE (2026-09-17) ──
-- Per Madhu: whoever is allocated to an event in Staff Portal with role_type
-- 'media' or 'media_lead' should get Press Release Studio access on that
-- event by default, without a manual per-event grant. Wires into the
-- existing (previously unpopulated) hrms_role_access_map mechanism that
-- runStaffPortalSync() -> applyRoleAccessMapping() already applies on every
-- sync (app/lib/hrms/apply-role-access-map.ts) — auto_granted rows only,
-- never touches a manually-assigned role.
--
-- 'media' gets research+generate; 'media_lead' additionally gets approve —
-- mirrors the existing convention of Lead roles holding approval authority
-- (e.g. sae.announcements.approve).

INSERT INTO access_roles_catalog (name, slug, description, event_id, is_system)
VALUES
  ('Media', 'media', 'Auto-granted to Staff Portal role_type ''media'' — research and generate press release drafts.', NULL, FALSE),
  ('Media Lead', 'media_lead', 'Auto-granted to Staff Portal role_type ''media_lead'' — research, generate, and approve press release drafts.', NULL, FALSE)
ON CONFLICT DO NOTHING;

INSERT INTO access_role_permissions (role_id, permission_key)
SELECT id, perm FROM access_roles_catalog, UNNEST(ARRAY[
  'sae.content_studio.press_release.view',
  'sae.content_studio.press_release.generate'
]) AS perm
WHERE slug = 'media' AND event_id IS NULL
ON CONFLICT DO NOTHING;

INSERT INTO access_role_permissions (role_id, permission_key)
SELECT id, perm FROM access_roles_catalog, UNNEST(ARRAY[
  'sae.content_studio.press_release.view',
  'sae.content_studio.press_release.generate',
  'sae.content_studio.press_release.approve'
]) AS perm
WHERE slug = 'media_lead' AND event_id IS NULL
ON CONFLICT DO NOTHING;

INSERT INTO hrms_role_access_map (role_type, access_role_id)
SELECT 'media', id FROM access_roles_catalog WHERE slug = 'media' AND event_id IS NULL
ON CONFLICT (role_type) DO UPDATE SET access_role_id = EXCLUDED.access_role_id, updated_at = NOW();

INSERT INTO hrms_role_access_map (role_type, access_role_id)
SELECT 'media_lead', id FROM access_roles_catalog WHERE slug = 'media_lead' AND event_id IS NULL
ON CONFLICT (role_type) DO UPDATE SET access_role_id = EXCLUDED.access_role_id, updated_at = NOW();

-- One-time backfill over ALREADY-synced event_staff rows (equivalent to
-- what applyRoleAccessMapping() would do — the next Staff Portal sync will
-- also keep this current going forward, this just applies it retroactively
-- rather than waiting for the next cron run).
INSERT INTO event_access_assignments (event_id, staff_id, role_id, auto_granted)
SELECT es.event_id, es.staff_id, m.access_role_id, TRUE
FROM event_staff es
JOIN hrms_role_access_map m ON m.role_type = es.project_role_type
WHERE m.access_role_id IS NOT NULL
ON CONFLICT (event_id, staff_id, role_id) DO NOTHING;
