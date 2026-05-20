-- ═══════════════════════════════════════════════════════════════════════════
-- EVENT EXECUTION FLOW, RACI & APPROVAL SYSTEM
-- Implements: event-execution-raci-flow.md
-- Run ONCE in Supabase SQL editor.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. RACI Master Template ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS event_raci_master (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phase                  INTEGER NOT NULL CHECK (phase BETWEEN 1 AND 5),
  phase_name             TEXT NOT NULL,
  name                   TEXT NOT NULL,
  timeline_type          TEXT NOT NULL
    CHECK (timeline_type IN ('fixed_duration','fixed_pre_event','cycle_dependent')),
  default_duration_days  INTEGER,      -- for fixed_duration
  default_pre_event_days INTEGER,      -- for fixed_pre_event (days before event_date)
  cycle_track            TEXT          -- for cycle_dependent
    CHECK (cycle_track IN ('speaker_acquisition','sponsorship_sales','delegate_sales',
                           'marketing','operations','partnerships','media_partners')),
  cycle_milestone_pct    INTEGER,      -- 10/30/60/80/100 for %-milestone tracks
  cycle_phase_label      TEXT,         -- human label for phase-based tracks
  responsible_roles      TEXT[] NOT NULL DEFAULT '{}',
  accountable_roles      TEXT[] NOT NULL DEFAULT '{}',
  consulted_roles        TEXT[] NOT NULL DEFAULT '{}',
  informed_roles         TEXT[] NOT NULL DEFAULT '{}',
  approval_required      BOOLEAN NOT NULL DEFAULT FALSE,
  approver_roles         TEXT[] NOT NULL DEFAULT '{}',
  depends_on_names       TEXT[] NOT NULL DEFAULT '{}',
  sort_order             INTEGER NOT NULL DEFAULT 0,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 2. Per-Event COO Execution Config ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS event_raci_config (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id             UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE UNIQUE,
  total_cycle_days     INTEGER NOT NULL CHECK (total_cycle_days > 0),
  cycle_start_date     DATE NOT NULL,
  configured_by        UUID REFERENCES staff_members(id),
  configured_at        TIMESTAMPTZ DEFAULT NOW(),
  override_log         JSONB NOT NULL DEFAULT '[]'  -- array of {field, default, value, reason, by, at}
);

-- ── 3. Per-Event RACI Checkpoints (seeded from master) ───────────────────────
CREATE TABLE IF NOT EXISTS event_raci_checkpoints (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id             UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  master_id            UUID REFERENCES event_raci_master(id),
  phase                INTEGER NOT NULL,
  phase_name           TEXT NOT NULL,
  name                 TEXT NOT NULL,
  timeline_type        TEXT NOT NULL,
  cycle_track          TEXT,
  cycle_milestone_pct  INTEGER,
  cycle_phase_label    TEXT,
  responsible_roles    TEXT[] NOT NULL DEFAULT '{}',
  accountable_roles    TEXT[] NOT NULL DEFAULT '{}',
  consulted_roles      TEXT[] NOT NULL DEFAULT '{}',
  informed_roles       TEXT[] NOT NULL DEFAULT '{}',
  approval_required    BOOLEAN NOT NULL DEFAULT FALSE,
  approver_roles       TEXT[] NOT NULL DEFAULT '{}',
  depends_on_names     TEXT[] NOT NULL DEFAULT '{}',
  due_date             DATE,
  status               TEXT NOT NULL DEFAULT 'not_started'
    CHECK (status IN ('not_started','in_progress','complete','pending_approval','approved','rejected','overdue')),
  completion_notes     TEXT,
  completed_at         TIMESTAMPTZ,
  completed_by         UUID REFERENCES staff_members(id),
  sort_order           INTEGER NOT NULL DEFAULT 0,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 4. COO Overrides — every override needs a mandatory reason ────────────────
CREATE TABLE IF NOT EXISTS event_raci_overrides (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  checkpoint_id     UUID NOT NULL REFERENCES event_raci_checkpoints(id) ON DELETE CASCADE,
  event_id          UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  field_overridden  TEXT NOT NULL,
  default_value     TEXT,
  overridden_value  TEXT NOT NULL,
  override_reason   TEXT NOT NULL,
  overridden_by     UUID REFERENCES staff_members(id),
  overridden_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ── 5. Approval Workflow ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS event_raci_approvals (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  checkpoint_id   UUID NOT NULL REFERENCES event_raci_checkpoints(id) ON DELETE CASCADE,
  event_id        UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  version         INTEGER NOT NULL DEFAULT 1,
  status          TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected')),
  requested_at    TIMESTAMPTZ DEFAULT NOW(),
  requested_by    UUID REFERENCES staff_members(id),
  reviewed_at     TIMESTAMPTZ,
  reviewed_by     UUID REFERENCES staff_members(id),
  reviewer_role   TEXT,
  review_note     TEXT
);

-- ── 6. Change History (triggers re-approval when material change detected) ────
CREATE TABLE IF NOT EXISTS event_raci_history (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  checkpoint_id         UUID NOT NULL REFERENCES event_raci_checkpoints(id) ON DELETE CASCADE,
  event_id              UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  changed_by            UUID REFERENCES staff_members(id),
  changed_at            TIMESTAMPTZ DEFAULT NOW(),
  field_changed         TEXT NOT NULL,
  old_value             TEXT,
  new_value             TEXT,
  triggered_reapproval  BOOLEAN DEFAULT FALSE
);

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_raci_cp_event   ON event_raci_checkpoints(event_id);
CREATE INDEX IF NOT EXISTS idx_raci_cp_phase   ON event_raci_checkpoints(event_id, phase);
CREATE INDEX IF NOT EXISTS idx_raci_cp_track   ON event_raci_checkpoints(event_id, cycle_track);
CREATE INDEX IF NOT EXISTS idx_raci_app_cp     ON event_raci_approvals(checkpoint_id);
CREATE INDEX IF NOT EXISTS idx_raci_ovr_cp     ON event_raci_overrides(checkpoint_id);
CREATE INDEX IF NOT EXISTS idx_raci_hist_cp    ON event_raci_history(checkpoint_id);


-- ═══════════════════════════════════════════════════════════════════════════
-- SEED MASTER RACI TEMPLATE
-- All 80+ checkpoints from the RACI document
-- ═══════════════════════════════════════════════════════════════════════════
TRUNCATE event_raci_master;

INSERT INTO event_raci_master
  (phase, phase_name, name, timeline_type, default_duration_days, default_pre_event_days,
   cycle_track, cycle_milestone_pct, cycle_phase_label,
   responsible_roles, accountable_roles, consulted_roles, informed_roles,
   approval_required, approver_roles, depends_on_names, sort_order)
VALUES

-- ────────────────────────────────────────────────────────────────────────────
-- PHASE 1 — Concept and Strategic Foundation
-- ────────────────────────────────────────────────────────────────────────────
(1,'Concept & Strategic Foundation','Concept Note',
 'fixed_duration',1,NULL,NULL,NULL,NULL,
 ARRAY['Producer'],
 ARRAY['Commercial Director'],
 ARRAY['Operations Lead','Marketing Manager'],
 ARRAY['Sponsorship Sales Lead','Delegate Sales Lead','Partnerships Lead','Media Lead'],
 TRUE, ARRAY['Board'], ARRAY[]::TEXT[], 10),

(1,'Concept & Strategic Foundation','COO Timeline / Deadline Setup',
 'fixed_duration',2,NULL,NULL,NULL,NULL,
 ARRAY['COO'],
 ARRAY['COO'],
 ARRAY['Producer','Commercial Director'],
 ARRAY['Marketing Manager','Operations Lead','Sponsorship Sales Lead','Delegate Sales Lead','Partnerships Lead','Media Lead'],
 TRUE, ARRAY['Board'], ARRAY['Concept Note'], 20),

(1,'Concept & Strategic Foundation','Speaker / Sponsor Validation Call Report',
 'fixed_duration',5,NULL,NULL,NULL,NULL,
 ARRAY['Producer'],
 ARRAY['Commercial Director'],
 ARRAY['Marketing Manager','Commercial Director'],
 ARRAY['COO','Operations Lead'],
 TRUE, ARRAY['Commercial Director'], ARRAY['Concept Note'], 30),

(1,'Concept & Strategic Foundation','Project Brief',
 'fixed_duration',2,NULL,NULL,NULL,NULL,
 ARRAY['Producer'],
 ARRAY['Commercial Director'],
 ARRAY['Marketing Manager','Operations Lead'],
 ARRAY['Sponsorship Sales Lead','Delegate Sales Lead','Partnerships Lead','Media Lead'],
 TRUE, ARRAY['Commercial Director','COO'], ARRAY['Concept Note'], 40),

-- ────────────────────────────────────────────────────────────────────────────
-- PHASE 2 — Planning, Commercial, and Brand Asset Creation
-- ────────────────────────────────────────────────────────────────────────────
(2,'Planning, Commercial & Brand Assets','Marketing Brief & Plan',
 'fixed_duration',1,NULL,NULL,NULL,NULL,
 ARRAY['Marketing Manager'],
 ARRAY['Producer'],
 ARRAY['Commercial Director','Branding Lead'],
 ARRAY['Delegate Sales Lead','Partnerships Lead','Media Lead','Operations Lead'],
 TRUE, ARRAY['Commercial Director','COO','Marketing Director'], ARRAY['Project Brief'], 10),

(2,'Planning, Commercial & Brand Assets','Commercial Angle',
 'fixed_duration',1,NULL,NULL,NULL,NULL,
 ARRAY['Commercial Director'],
 ARRAY['Commercial Director'],
 ARRAY['Producer','Delegate Sales Lead','Marketing Manager'],
 ARRAY['Operations Lead','Partnerships Lead','Media Lead'],
 TRUE, ARRAY['Board','COO'], ARRAY['Project Brief'], 20),

(2,'Planning, Commercial & Brand Assets','Sponsorship Top Target List',
 'fixed_duration',1,NULL,NULL,NULL,NULL,
 ARRAY['Commercial Director'],
 ARRAY['Commercial Director'],
 ARRAY['Producer','Marketing Manager'],
 ARRAY['Operations Lead'],
 TRUE, ARRAY['COO'], ARRAY['Commercial Angle'], 30),

(2,'Planning, Commercial & Brand Assets','Delegate / Buyer Top Target List',
 'fixed_duration',1,NULL,NULL,NULL,NULL,
 ARRAY['Delegate Sales Lead'],
 ARRAY['Commercial Director'],
 ARRAY['Producer','Marketing Manager'],
 ARRAY['Operations Lead'],
 TRUE, ARRAY['Commercial Director'], ARRAY['Commercial Angle'], 40),

(2,'Planning, Commercial & Brand Assets','Government / Institutional Target List',
 'fixed_duration',1,NULL,NULL,NULL,NULL,
 ARRAY['Producer'],
 ARRAY['Commercial Director'],
 ARRAY['Partnerships Lead'],
 ARRAY['Operations Lead','Sponsorship Sales Lead','Delegate Sales Lead'],
 TRUE, ARRAY['Commercial Director','COO'], ARRAY['Commercial Angle'], 50),

(2,'Planning, Commercial & Brand Assets','Logo & Brand Guidelines',
 'fixed_duration',1,NULL,NULL,NULL,NULL,
 ARRAY['Branding Lead'],
 ARRAY['Marketing Manager'],
 ARRAY['Producer'],
 ARRAY['Commercial Director','Delegate Sales Lead','Sponsorship Sales Lead','Partnerships Lead','Media Lead','Operations Lead'],
 TRUE, ARRAY['Board','Marketing Director'], ARRAY['Project Brief','Marketing Brief & Plan'], 60),

-- ────────────────────────────────────────────────────────────────────────────
-- PHASE 3 — Public-Facing and Sales-Ready Asset Creation
-- ────────────────────────────────────────────────────────────────────────────
(3,'Public-Facing & Sales-Ready Assets','Website Copy',
 'fixed_duration',1,NULL,NULL,NULL,NULL,
 ARRAY['Marketing Manager'],
 ARRAY['Commercial Director'],
 ARRAY['Producer'],
 ARRAY['Delegate Sales Lead','Partnerships Lead','Media Lead','Operations Lead'],
 TRUE, ARRAY['Marketing Head'], ARRAY['Project Brief','Marketing Brief & Plan','Commercial Angle'], 10),

(3,'Public-Facing & Sales-Ready Assets','Brochure / Sales Deck Copy',
 'fixed_duration',1,NULL,NULL,NULL,NULL,
 ARRAY['Marketing Manager'],
 ARRAY['Commercial Director'],
 ARRAY['Producer'],
 ARRAY['Delegate Sales Lead','Partnerships Lead','Media Lead','Operations Lead'],
 TRUE, ARRAY['Marketing Director'], ARRAY['Project Brief','Marketing Brief & Plan','Commercial Angle'], 20),

(3,'Public-Facing & Sales-Ready Assets','Website Design & Build',
 'fixed_duration',2,NULL,NULL,NULL,NULL,
 ARRAY['Branding Lead','Marketing Manager'],
 ARRAY['Marketing Manager'],
 ARRAY['Producer','Commercial Director'],
 ARRAY['Delegate Sales Lead','Partnerships Lead','Media Lead','Operations Lead'],
 TRUE, ARRAY['Board','COO','Commercial Director'], ARRAY['Logo & Brand Guidelines','Website Copy'], 30),

(3,'Public-Facing & Sales-Ready Assets','Brochure / Sales Deck Design',
 'fixed_duration',2,NULL,NULL,NULL,NULL,
 ARRAY['Branding Lead'],
 ARRAY['Commercial Director'],
 ARRAY['Marketing Manager','Producer','Commercial Director'],
 ARRAY['Delegate Sales Lead','Partnerships Lead','Media Lead','Operations Lead'],
 TRUE, ARRAY['Board','COO','Commercial Director'], ARRAY['Logo & Brand Guidelines','Brochure / Sales Deck Copy'], 40),

-- ────────────────────────────────────────────────────────────────────────────
-- PHASE 4 — Event-Cycle-Dependent Execution Tracks
-- ────────────────────────────────────────────────────────────────────────────

-- Speaker Acquisition
(4,'Cycle Execution Tracks','Speaker Acquisition — 10%',
 'cycle_dependent',NULL,NULL,'speaker_acquisition',10,'10% acquired',
 ARRAY['Producer'],ARRAY['Producer'],
 ARRAY['Commercial Director','Marketing Manager'],
 ARRAY['Sponsorship Sales Lead','Delegate Sales Lead','Partnerships Lead','Media Lead','Operations Lead'],
 FALSE,ARRAY[]::TEXT[],ARRAY['Website Design & Build','Brochure / Sales Deck Design'],10),

(4,'Cycle Execution Tracks','Speaker Acquisition — 30%',
 'cycle_dependent',NULL,NULL,'speaker_acquisition',30,'30% acquired',
 ARRAY['Producer'],ARRAY['Producer'],
 ARRAY['Commercial Director','Marketing Manager'],
 ARRAY['Sponsorship Sales Lead','Delegate Sales Lead','Partnerships Lead','Media Lead','Operations Lead'],
 FALSE,ARRAY[]::TEXT[],ARRAY['Speaker Acquisition — 10%'],20),

(4,'Cycle Execution Tracks','Speaker Acquisition — 60%',
 'cycle_dependent',NULL,NULL,'speaker_acquisition',60,'60% acquired',
 ARRAY['Producer'],ARRAY['Producer'],
 ARRAY['Commercial Director','Marketing Manager'],
 ARRAY['Sponsorship Sales Lead','Delegate Sales Lead','Partnerships Lead','Media Lead','Operations Lead'],
 FALSE,ARRAY[]::TEXT[],ARRAY['Speaker Acquisition — 30%'],30),

(4,'Cycle Execution Tracks','Speaker Acquisition — 80%',
 'cycle_dependent',NULL,NULL,'speaker_acquisition',80,'80% acquired',
 ARRAY['Producer'],ARRAY['Producer'],
 ARRAY['Commercial Director','Marketing Manager'],
 ARRAY['Sponsorship Sales Lead','Delegate Sales Lead','Partnerships Lead','Media Lead','Operations Lead'],
 FALSE,ARRAY[]::TEXT[],ARRAY['Speaker Acquisition — 60%'],40),

(4,'Cycle Execution Tracks','Speaker Acquisition — 100%',
 'cycle_dependent',NULL,NULL,'speaker_acquisition',100,'100% acquired',
 ARRAY['Producer'],ARRAY['Producer'],
 ARRAY['Commercial Director','Marketing Manager'],
 ARRAY['Sponsorship Sales Lead','Delegate Sales Lead','Partnerships Lead','Media Lead','Operations Lead'],
 FALSE,ARRAY[]::TEXT[],ARRAY['Speaker Acquisition — 80%'],50),

-- Sponsorship / Exhibitor Sales
(4,'Cycle Execution Tracks','Sponsorship Sales — 10%',
 'cycle_dependent',NULL,NULL,'sponsorship_sales',10,'10% target',
 ARRAY['Sponsorship Sales Lead'],ARRAY['Commercial Director'],
 ARRAY['Producer','Marketing Manager','Operations Lead'],
 ARRAY['Partnerships Lead','Media Lead','Delegate Sales Lead'],
 FALSE,ARRAY[]::TEXT[],ARRAY['Website Design & Build','Brochure / Sales Deck Design'],60),

(4,'Cycle Execution Tracks','Sponsorship Sales — 30%',
 'cycle_dependent',NULL,NULL,'sponsorship_sales',30,'30% target',
 ARRAY['Sponsorship Sales Lead'],ARRAY['Commercial Director'],
 ARRAY['Producer','Marketing Manager','Operations Lead'],
 ARRAY['Partnerships Lead','Media Lead','Delegate Sales Lead'],
 FALSE,ARRAY[]::TEXT[],ARRAY['Sponsorship Sales — 10%'],70),

(4,'Cycle Execution Tracks','Sponsorship Sales — 60%',
 'cycle_dependent',NULL,NULL,'sponsorship_sales',60,'60% target',
 ARRAY['Sponsorship Sales Lead'],ARRAY['Commercial Director'],
 ARRAY['Producer','Marketing Manager','Operations Lead'],
 ARRAY['Partnerships Lead','Media Lead','Delegate Sales Lead'],
 FALSE,ARRAY[]::TEXT[],ARRAY['Sponsorship Sales — 30%'],80),

(4,'Cycle Execution Tracks','Sponsorship Sales — 80%',
 'cycle_dependent',NULL,NULL,'sponsorship_sales',80,'80% target',
 ARRAY['Sponsorship Sales Lead'],ARRAY['Commercial Director'],
 ARRAY['Producer','Marketing Manager','Operations Lead'],
 ARRAY['Partnerships Lead','Media Lead','Delegate Sales Lead'],
 FALSE,ARRAY[]::TEXT[],ARRAY['Sponsorship Sales — 60%'],90),

(4,'Cycle Execution Tracks','Sponsorship Sales — 100%',
 'cycle_dependent',NULL,NULL,'sponsorship_sales',100,'100% target',
 ARRAY['Sponsorship Sales Lead'],ARRAY['Commercial Director'],
 ARRAY['Producer','Marketing Manager','Operations Lead'],
 ARRAY['Partnerships Lead','Media Lead','Delegate Sales Lead'],
 FALSE,ARRAY[]::TEXT[],ARRAY['Sponsorship Sales — 80%'],100),

-- Delegate Sales
(4,'Cycle Execution Tracks','Delegate Acquisition — 10%',
 'cycle_dependent',NULL,NULL,'delegate_sales',10,'10% target',
 ARRAY['Delegate Sales Lead'],ARRAY['Commercial Director'],
 ARRAY['Producer','Marketing Manager'],
 ARRAY['Operations Lead'],
 FALSE,ARRAY[]::TEXT[],ARRAY['Website Design & Build','Brochure / Sales Deck Design'],110),

(4,'Cycle Execution Tracks','Delegate Acquisition — 30%',
 'cycle_dependent',NULL,NULL,'delegate_sales',30,'30% target',
 ARRAY['Delegate Sales Lead'],ARRAY['Commercial Director'],
 ARRAY['Producer','Marketing Manager'],
 ARRAY['Operations Lead'],
 FALSE,ARRAY[]::TEXT[],ARRAY['Delegate Acquisition — 10%'],120),

(4,'Cycle Execution Tracks','Delegate Acquisition — 60%',
 'cycle_dependent',NULL,NULL,'delegate_sales',60,'60% target',
 ARRAY['Delegate Sales Lead'],ARRAY['Commercial Director'],
 ARRAY['Producer','Marketing Manager'],
 ARRAY['Operations Lead'],
 FALSE,ARRAY[]::TEXT[],ARRAY['Delegate Acquisition — 30%'],130),

(4,'Cycle Execution Tracks','Delegate Acquisition — 80%',
 'cycle_dependent',NULL,NULL,'delegate_sales',80,'80% target',
 ARRAY['Delegate Sales Lead'],ARRAY['Commercial Director'],
 ARRAY['Producer','Marketing Manager'],
 ARRAY['Operations Lead'],
 FALSE,ARRAY[]::TEXT[],ARRAY['Delegate Acquisition — 60%'],140),

(4,'Cycle Execution Tracks','Delegate Acquisition — 100%',
 'cycle_dependent',NULL,NULL,'delegate_sales',100,'100% target',
 ARRAY['Delegate Sales Lead'],ARRAY['Commercial Director'],
 ARRAY['Producer','Marketing Manager'],
 ARRAY['Operations Lead'],
 FALSE,ARRAY[]::TEXT[],ARRAY['Delegate Acquisition — 80%'],150),

-- Marketing Campaign Execution
(4,'Cycle Execution Tracks','Marketing — Launch / Awareness Phase',
 'cycle_dependent',NULL,NULL,'marketing',NULL,'Launch / Awareness',
 ARRAY['Marketing Manager'],ARRAY['Marketing Manager'],
 ARRAY['Producer','Commercial Director','Partnerships Lead','Media Lead'],
 ARRAY['Sponsorship Sales Lead','Delegate Sales Lead','Operations Lead'],
 FALSE,ARRAY[]::TEXT[],ARRAY['Website Design & Build'],160),

(4,'Cycle Execution Tracks','Marketing — Consideration / Engagement Phase',
 'cycle_dependent',NULL,NULL,'marketing',NULL,'Consideration / Engagement',
 ARRAY['Marketing Manager'],ARRAY['Marketing Manager'],
 ARRAY['Producer','Commercial Director','Partnerships Lead','Media Lead'],
 ARRAY['Sponsorship Sales Lead','Delegate Sales Lead','Operations Lead'],
 FALSE,ARRAY[]::TEXT[],ARRAY['Marketing — Launch / Awareness Phase'],170),

(4,'Cycle Execution Tracks','Marketing — Conversion / Last-Mile Phase',
 'cycle_dependent',NULL,NULL,'marketing',NULL,'Conversion / Last-Mile',
 ARRAY['Marketing Manager'],ARRAY['Marketing Manager'],
 ARRAY['Producer','Commercial Director','Partnerships Lead','Media Lead'],
 ARRAY['Sponsorship Sales Lead','Delegate Sales Lead','Operations Lead'],
 FALSE,ARRAY[]::TEXT[],ARRAY['Marketing — Consideration / Engagement Phase'],180),

(4,'Cycle Execution Tracks','Marketing — Final Attendee Communications Phase',
 'cycle_dependent',NULL,NULL,'marketing',NULL,'Final Attendee Communications',
 ARRAY['Marketing Manager'],ARRAY['Marketing Manager'],
 ARRAY['Producer','Commercial Director','Partnerships Lead','Media Lead'],
 ARRAY['Sponsorship Sales Lead','Delegate Sales Lead','Operations Lead'],
 FALSE,ARRAY[]::TEXT[],ARRAY['Marketing — Conversion / Last-Mile Phase'],190),

-- Operations / Logistics
(4,'Cycle Execution Tracks','Operations — Venue & Date Confirmed',
 'cycle_dependent',NULL,NULL,'operations',NULL,'Venue Confirmed',
 ARRAY['Operations Lead'],ARRAY['Operations Lead'],
 ARRAY['Producer','Commercial Director','Sponsorship Sales Lead'],
 ARRAY['Marketing Manager','Delegate Sales Lead','Partnerships Lead','Media Lead'],
 FALSE,ARRAY[]::TEXT[],ARRAY[]::TEXT[],200),

(4,'Cycle Execution Tracks','Operations — Initial AV / Production Scope',
 'cycle_dependent',NULL,NULL,'operations',NULL,'Initial AV Scope',
 ARRAY['Operations Lead'],ARRAY['Operations Lead'],
 ARRAY['Producer','Commercial Director'],
 ARRAY['Marketing Manager','Sponsorship Sales Lead','Delegate Sales Lead','Partnerships Lead','Media Lead'],
 FALSE,ARRAY[]::TEXT[],ARRAY['Operations — Venue & Date Confirmed'],210),

(4,'Cycle Execution Tracks','Operations — Initial Floorplan',
 'cycle_dependent',NULL,NULL,'operations',NULL,'Initial Floorplan',
 ARRAY['Operations Lead'],ARRAY['Operations Lead'],
 ARRAY['Producer','Commercial Director','Sponsorship Sales Lead'],
 ARRAY['Marketing Manager','Delegate Sales Lead','Partnerships Lead','Media Lead'],
 FALSE,ARRAY[]::TEXT[],ARRAY['Operations — Venue & Date Confirmed'],220),

(4,'Cycle Execution Tracks','Operations — Revised Floorplan After Sales Progress',
 'cycle_dependent',NULL,NULL,'operations',NULL,'Revised Floorplan',
 ARRAY['Operations Lead'],ARRAY['Operations Lead'],
 ARRAY['Producer','Commercial Director','Sponsorship Sales Lead'],
 ARRAY['Marketing Manager','Delegate Sales Lead','Partnerships Lead','Media Lead'],
 FALSE,ARRAY[]::TEXT[],ARRAY['Operations — Initial Floorplan'],230),

(4,'Cycle Execution Tracks','Operations — Vendor Confirmation Progress',
 'cycle_dependent',NULL,NULL,'operations',NULL,'Vendor Progress',
 ARRAY['Operations Lead'],ARRAY['Operations Lead'],
 ARRAY['Producer','Commercial Director'],
 ARRAY['Marketing Manager','Sponsorship Sales Lead','Delegate Sales Lead','Partnerships Lead','Media Lead'],
 FALSE,ARRAY[]::TEXT[],ARRAY['Operations — Venue & Date Confirmed'],240),

(4,'Cycle Execution Tracks','Operations — Staffing Plan Progress',
 'cycle_dependent',NULL,NULL,'operations',NULL,'Staffing Progress',
 ARRAY['Operations Lead'],ARRAY['Operations Lead'],
 ARRAY['Producer','Commercial Director','Marketing Manager'],
 ARRAY['Sponsorship Sales Lead','Delegate Sales Lead','Partnerships Lead','Media Lead'],
 FALSE,ARRAY[]::TEXT[],ARRAY['Operations — Venue & Date Confirmed'],250),

-- Partnerships Cycle
(4,'Cycle Execution Tracks','Partnerships — Target List Ready',
 'cycle_dependent',NULL,NULL,'partnerships',NULL,'Target List',
 ARRAY['Partnerships Manager'],ARRAY['Partnerships Lead'],
 ARRAY['Producer','Marketing Manager','Commercial Director'],
 ARRAY['Media Lead','Sponsorship Sales Lead','Delegate Sales Lead'],
 FALSE,ARRAY[]::TEXT[],ARRAY['Website Design & Build','Brochure / Sales Deck Design'],260),

(4,'Cycle Execution Tracks','Partnerships — First Wave Outreach Launched',
 'cycle_dependent',NULL,NULL,'partnerships',NULL,'First Wave Outreach',
 ARRAY['Partnerships Manager'],ARRAY['Partnerships Lead'],
 ARRAY['Producer','Marketing Manager','Commercial Director'],
 ARRAY['Media Lead','Sponsorship Sales Lead','Delegate Sales Lead'],
 FALSE,ARRAY[]::TEXT[],ARRAY['Partnerships — Target List Ready'],270),

(4,'Cycle Execution Tracks','Partnerships — First Wave Confirmed',
 'cycle_dependent',NULL,NULL,'partnerships',NULL,'First Wave Done',
 ARRAY['Partnerships Manager'],ARRAY['Partnerships Lead'],
 ARRAY['Producer','Marketing Manager','Commercial Director'],
 ARRAY['Media Lead','Sponsorship Sales Lead','Delegate Sales Lead'],
 FALSE,ARRAY[]::TEXT[],ARRAY['Partnerships — First Wave Outreach Launched'],280),

(4,'Cycle Execution Tracks','Partnerships — Second Wave Confirmed',
 'cycle_dependent',NULL,NULL,'partnerships',NULL,'Second Wave Done',
 ARRAY['Partnerships Manager'],ARRAY['Partnerships Lead'],
 ARRAY['Producer','Marketing Manager','Commercial Director'],
 ARRAY['Media Lead','Sponsorship Sales Lead','Delegate Sales Lead'],
 FALSE,ARRAY[]::TEXT[],ARRAY['Partnerships — First Wave Confirmed'],290),

(4,'Cycle Execution Tracks','Partnerships — Final Activation Brief Closed',
 'cycle_dependent',NULL,NULL,'partnerships',NULL,'Activation Brief Closed',
 ARRAY['Partnerships Manager'],ARRAY['Partnerships Lead'],
 ARRAY['Producer','Marketing Manager','Commercial Director'],
 ARRAY['Media Lead','Sponsorship Sales Lead','Delegate Sales Lead'],
 FALSE,ARRAY[]::TEXT[],ARRAY['Partnerships — Second Wave Confirmed'],300),

-- Media Partners Cycle
(4,'Cycle Execution Tracks','Media Partners — Target List Ready',
 'cycle_dependent',NULL,NULL,'media_partners',NULL,'Target List',
 ARRAY['Media Lead'],ARRAY['Marketing Manager'],
 ARRAY['Partnerships Lead','Producer','Commercial Director'],
 ARRAY['Sponsorship Sales Lead','Delegate Sales Lead','Operations Lead'],
 FALSE,ARRAY[]::TEXT[],ARRAY['Website Design & Build','Brochure / Sales Deck Design'],310),

(4,'Cycle Execution Tracks','Media Partners — Outreach Launched',
 'cycle_dependent',NULL,NULL,'media_partners',NULL,'Outreach Launched',
 ARRAY['Media Lead'],ARRAY['Marketing Manager'],
 ARRAY['Partnerships Lead','Producer','Commercial Director'],
 ARRAY['Sponsorship Sales Lead','Delegate Sales Lead','Operations Lead'],
 FALSE,ARRAY[]::TEXT[],ARRAY['Media Partners — Target List Ready'],320),

(4,'Cycle Execution Tracks','Media Partners — First Wave Confirmed',
 'cycle_dependent',NULL,NULL,'media_partners',NULL,'First Wave Done',
 ARRAY['Media Lead'],ARRAY['Marketing Manager'],
 ARRAY['Partnerships Lead','Producer','Commercial Director'],
 ARRAY['Sponsorship Sales Lead','Delegate Sales Lead','Operations Lead'],
 FALSE,ARRAY[]::TEXT[],ARRAY['Media Partners — Outreach Launched'],330),

(4,'Cycle Execution Tracks','Media Partners — Promo Calendar Locked',
 'cycle_dependent',NULL,NULL,'media_partners',NULL,'Promo Calendar',
 ARRAY['Media Lead'],ARRAY['Marketing Manager'],
 ARRAY['Partnerships Lead','Producer','Commercial Director'],
 ARRAY['Sponsorship Sales Lead','Delegate Sales Lead','Operations Lead'],
 FALSE,ARRAY[]::TEXT[],ARRAY['Media Partners — First Wave Confirmed'],340),

(4,'Cycle Execution Tracks','Media Partners — Final Pre-Event Coverage Locked',
 'cycle_dependent',NULL,NULL,'media_partners',NULL,'Final Coverage',
 ARRAY['Media Lead'],ARRAY['Marketing Manager'],
 ARRAY['Partnerships Lead','Producer','Commercial Director'],
 ARRAY['Sponsorship Sales Lead','Delegate Sales Lead','Operations Lead'],
 FALSE,ARRAY[]::TEXT[],ARRAY['Media Partners — Promo Calendar Locked'],350),

-- ────────────────────────────────────────────────────────────────────────────
-- PHASE 5 — Pre-Event Lock and Readiness
-- ────────────────────────────────────────────────────────────────────────────
(5,'Pre-Event Lock & Readiness','Agenda Finalisation',
 'fixed_pre_event',NULL,14,NULL,NULL,NULL,
 ARRAY['Producer'],ARRAY['Producer'],
 ARRAY['Commercial Director','Marketing Manager'],
 ARRAY['Sponsorship Sales Lead','Delegate Sales Lead','Partnerships Lead','Media Lead','Operations Lead'],
 TRUE,ARRAY['COO','Commercial Director'],ARRAY[]::TEXT[],10),

(5,'Pre-Event Lock & Readiness','Speaker Final Confirmations Complete',
 'fixed_pre_event',NULL,14,NULL,NULL,NULL,
 ARRAY['Producer'],ARRAY['Producer'],
 ARRAY['Commercial Director','Marketing Manager'],
 ARRAY['Operations Lead','Media Lead'],
 FALSE,ARRAY[]::TEXT[],ARRAY['Agenda Finalisation'],20),

(5,'Pre-Event Lock & Readiness','Moderator / Speaker Briefing Notes Finalised',
 'fixed_pre_event',NULL,7,NULL,NULL,NULL,
 ARRAY['Producer'],ARRAY['Producer'],
 ARRAY['Marketing Manager'],
 ARRAY['Operations Lead'],
 FALSE,ARRAY[]::TEXT[],ARRAY['Speaker Final Confirmations Complete'],30),

(5,'Pre-Event Lock & Readiness','Session Flow / Run Sheet Finalised',
 'fixed_pre_event',NULL,5,NULL,NULL,NULL,
 ARRAY['Producer'],ARRAY['Producer'],
 ARRAY['Marketing Manager','Operations Lead'],
 ARRAY['Commercial Director'],
 FALSE,ARRAY[]::TEXT[],ARRAY['Moderator / Speaker Briefing Notes Finalised'],40),

(5,'Pre-Event Lock & Readiness','On-Site Marketing Materials — Design Freeze',
 'fixed_pre_event',NULL,21,NULL,NULL,NULL,
 ARRAY['Branding Lead'],ARRAY['Marketing Manager'],
 ARRAY['Producer','Operations Lead','Commercial Director'],
 ARRAY['Sponsorship Sales Lead','Delegate Sales Lead','Partnerships Lead','Media Lead'],
 TRUE,ARRAY['Marketing Director','Commercial Director','Producer'],ARRAY[]::TEXT[],50),

(5,'Pre-Event Lock & Readiness','On-Site Marketing Materials — Files to Print / Production',
 'fixed_pre_event',NULL,7,NULL,NULL,NULL,
 ARRAY['Branding Lead'],ARRAY['Marketing Manager'],
 ARRAY['Producer','Operations Lead','Commercial Director'],
 ARRAY['Sponsorship Sales Lead','Delegate Sales Lead','Partnerships Lead','Media Lead'],
 TRUE,ARRAY['Marketing Director','Commercial Director','Producer'],
 ARRAY['On-Site Marketing Materials — Design Freeze'],60),

(5,'Pre-Event Lock & Readiness','Final Website / Agenda Update Complete',
 'fixed_pre_event',NULL,7,NULL,NULL,NULL,
 ARRAY['Marketing Manager'],ARRAY['Marketing Manager'],
 ARRAY['Producer','Commercial Director'],
 ARRAY['Delegate Sales Lead','Media Lead','Partnerships Lead'],
 FALSE,ARRAY[]::TEXT[],ARRAY[]::TEXT[],70),

(5,'Pre-Event Lock & Readiness','Final Attendee Communication Issued',
 'fixed_pre_event',NULL,5,NULL,NULL,NULL,
 ARRAY['Marketing Manager'],ARRAY['Marketing Manager'],
 ARRAY['Producer','Commercial Director'],
 ARRAY['Delegate Sales Lead','Operations Lead'],
 FALSE,ARRAY[]::TEXT[],ARRAY[]::TEXT[],80),

(5,'Pre-Event Lock & Readiness','Sponsor Deliverables Freeze',
 'fixed_pre_event',NULL,7,NULL,NULL,NULL,
 ARRAY['Sponsorship Sales Lead'],ARRAY['Commercial Director'],
 ARRAY['Producer','Marketing Manager','Operations Lead'],
 ARRAY['Partnerships Lead','Media Lead'],
 FALSE,ARRAY[]::TEXT[],ARRAY[]::TEXT[],90),

(5,'Pre-Event Lock & Readiness','Asset Collection Complete',
 'fixed_pre_event',NULL,14,NULL,NULL,NULL,
 ARRAY['Sponsorship Sales Lead'],ARRAY['Commercial Director'],
 ARRAY['Producer','Marketing Manager'],
 ARRAY['Operations Lead'],
 FALSE,ARRAY[]::TEXT[],ARRAY['Sponsor Deliverables Freeze'],100),

(5,'Pre-Event Lock & Readiness','Delegate Registration Close / Handover Freeze',
 'fixed_pre_event',NULL,1,NULL,NULL,NULL,
 ARRAY['Delegate Sales Lead'],ARRAY['Commercial Director'],
 ARRAY['Producer','Marketing Manager','Operations Lead'],
 ARRAY['Media Lead'],
 FALSE,ARRAY[]::TEXT[],ARRAY[]::TEXT[],110),

(5,'Pre-Event Lock & Readiness','VIP Confirmations Complete',
 'fixed_pre_event',NULL,7,NULL,NULL,NULL,
 ARRAY['Delegate Sales Lead'],ARRAY['Commercial Director'],
 ARRAY['Producer','Marketing Manager'],
 ARRAY['Operations Lead'],
 FALSE,ARRAY[]::TEXT[],ARRAY[]::TEXT[],120),

(5,'Pre-Event Lock & Readiness','AV / Production Scope Freeze',
 'fixed_pre_event',NULL,21,NULL,NULL,NULL,
 ARRAY['Operations Lead'],ARRAY['Operations Lead'],
 ARRAY['Producer','Commercial Director'],
 ARRAY['Marketing Manager','Sponsorship Sales Lead'],
 FALSE,ARRAY[]::TEXT[],ARRAY[]::TEXT[],130),

(5,'Pre-Event Lock & Readiness','Floorplan Freeze',
 'fixed_pre_event',NULL,7,NULL,NULL,NULL,
 ARRAY['Operations Lead'],ARRAY['Operations Lead'],
 ARRAY['Producer','Commercial Director','Sponsorship Sales Lead'],
 ARRAY['Marketing Manager','Delegate Sales Lead'],
 FALSE,ARRAY[]::TEXT[],ARRAY['AV / Production Scope Freeze'],140),

(5,'Pre-Event Lock & Readiness','Vendor Confirmation Complete',
 'fixed_pre_event',NULL,14,NULL,NULL,NULL,
 ARRAY['Operations Lead'],ARRAY['Operations Lead'],
 ARRAY['Producer','Commercial Director'],
 ARRAY['Marketing Manager'],
 FALSE,ARRAY[]::TEXT[],ARRAY[]::TEXT[],150),

(5,'Pre-Event Lock & Readiness','Staffing Plan Finalised',
 'fixed_pre_event',NULL,7,NULL,NULL,NULL,
 ARRAY['Operations Lead'],ARRAY['Operations Lead'],
 ARRAY['Producer','Commercial Director','Marketing Manager'],
 ARRAY['Sponsorship Sales Lead','Delegate Sales Lead','Partnerships Lead','Media Lead'],
 FALSE,ARRAY[]::TEXT[],ARRAY[]::TEXT[],160),

(5,'Pre-Event Lock & Readiness','Final Operational Readiness',
 'fixed_pre_event',NULL,7,NULL,NULL,NULL,
 ARRAY['Operations Lead'],ARRAY['Operations Lead'],
 ARRAY['Producer','Commercial Director','Marketing Manager'],
 ARRAY['Sponsorship Sales Lead','Delegate Sales Lead','Partnerships Lead','Media Lead'],
 TRUE,ARRAY['Board','COO'],ARRAY[]::TEXT[],170),

(5,'Pre-Event Lock & Readiness','Print Materials Delivered',
 'fixed_pre_event',NULL,2,NULL,NULL,NULL,
 ARRAY['Operations Lead'],ARRAY['Operations Lead'],
 ARRAY['Branding Lead','Marketing Manager'],
 ARRAY['Producer','Commercial Director'],
 FALSE,ARRAY[]::TEXT[],ARRAY['On-Site Marketing Materials — Files to Print / Production'],180),

(5,'Pre-Event Lock & Readiness','Registration Desk Materials Ready',
 'fixed_pre_event',NULL,2,NULL,NULL,NULL,
 ARRAY['Operations Lead'],ARRAY['Operations Lead'],
 ARRAY['Marketing Manager','Delegate Sales Lead'],
 ARRAY['Producer','Commercial Director'],
 FALSE,ARRAY[]::TEXT[],ARRAY[]::TEXT[],190),

(5,'Pre-Event Lock & Readiness','Media Promo Calendar Locked',
 'fixed_pre_event',NULL,7,NULL,NULL,NULL,
 ARRAY['Media Lead'],ARRAY['Marketing Manager'],
 ARRAY['Partnerships Lead','Producer','Commercial Director'],
 ARRAY['Sponsorship Sales Lead','Delegate Sales Lead','Operations Lead'],
 FALSE,ARRAY[]::TEXT[],ARRAY[]::TEXT[],200),

(5,'Pre-Event Lock & Readiness','Partner Final Deliverables Locked',
 'fixed_pre_event',NULL,14,NULL,NULL,NULL,
 ARRAY['Partnerships Manager'],ARRAY['Partnerships Lead'],
 ARRAY['Producer','Marketing Manager','Commercial Director'],
 ARRAY['Media Lead','Sponsorship Sales Lead','Delegate Sales Lead','Operations Lead'],
 FALSE,ARRAY[]::TEXT[],ARRAY[]::TEXT[],210);
