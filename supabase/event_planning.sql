-- ═══════════════════════════════════════════════════════════════════════════
-- EVENT PLANNING — Template system + checklist enhancements
-- Run this ONCE in your Supabase SQL editor.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Add new columns to event_checklist ────────────────────────────────────
ALTER TABLE event_checklist
  ADD COLUMN IF NOT EXISTS workstream  TEXT,
  ADD COLUMN IF NOT EXISTS depends_on  TEXT,       -- title of blocking task (same event)
  ADD COLUMN IF NOT EXISTS priority    TEXT NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('low', 'normal', 'high', 'critical'));

-- ── 2. Master template table ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS event_task_templates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  department  TEXT NOT NULL,
  workstream  TEXT NOT NULL,
  title       TEXT NOT NULL,
  owner_role  TEXT NOT NULL,   -- role label, e.g. 'Producer', 'Director', 'Sales'
  depends_on  TEXT,            -- title of the task this depends on (NULL = no dep)
  priority    TEXT NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('low', 'normal', 'high', 'critical')),
  sort_order  INT  NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 3. Seed the 61-task master template ──────────────────────────────────────
TRUNCATE event_task_templates;

INSERT INTO event_task_templates (department, workstream, title, owner_role, depends_on, priority, sort_order) VALUES

-- ── Production ───────────────────────────────────────────────────────────────
('Production', 'Market Research', 'Conduct expert interviews (15–25)',   'Producer',  NULL,                            'high',     10),
('Production', 'Market Research', 'Map competitor events',               'Producer',  NULL,                            'normal',   20),
('Production', 'Positioning',     'Define event thesis',                 'Director',  'Conduct expert interviews (15–25)', 'critical', 30),
('Production', 'Agenda',          'Define content pillars',              'Producer',  'Define event thesis',            'high',     40),
('Production', 'Agenda',          'Draft Agenda v1',                     'Producer',  'Define content pillars',         'high',     50),
('Production', 'Speakers',        'Build speaker longlist (100+)',        'Producer',  NULL,                            'high',     60),
('Production', 'Speakers',        'Outreach wave 1',                     'Producer',  'Build speaker longlist (100+)',  'high',     70),
('Production', 'Speakers',        'Confirm first 5 speakers',            'Producer',  'Outreach wave 1',               'critical', 80),
('Production', 'Speakers',        'Confirm 70% speakers',                'Producer',  'Confirm first 5 speakers',      'critical', 90),
('Production', 'Agenda',          'Final agenda lock',                   'Producer',  'Confirm 70% speakers',          'critical', 100),

-- ── Marketing ────────────────────────────────────────────────────────────────
('Marketing',  'Strategy',        'Define brand positioning',            'Brand Lead','Final agenda lock',             'high',     10),
('Marketing',  'Naming',          'Finalize event name + tagline',       'Director',  'Define brand positioning',       'critical', 20),
('Marketing',  'Website',         'Write website copy',                  'Marketing', 'Draft Agenda v1',               'high',     30),
('Marketing',  'Website',         'Website build',                       'Tech',      'Deliver website assets',         'high',     40),
('Marketing',  'Website',         'QA & launch',                         'Marketing', 'Website build',                 'critical', 50),
('Marketing',  'Email',           'Build email calendar',                'Marketing', 'Define brand positioning',       'normal',   60),
('Marketing',  'Email',           'Weekly nurture campaigns',            'Marketing', 'Website build',                 'normal',   70),
('Marketing',  'Email',           'Campaign optimization',               'Marketing', 'Define brand positioning',       'normal',   80),
('Marketing',  'Campaigns',       'Launch paid ads',                     'Marketing', 'QA & launch',                   'high',     90),
('Marketing',  'Content',         'Speaker announcements',               'Marketing', 'Confirm first 5 speakers',      'high',     100),
('Marketing',  'Content',         'Industry report',                     'Marketing', 'Map competitor events',          'normal',   110),
('Marketing',  'Campaigns',       'Final push campaigns',                'Marketing', 'Launch paid ads',               'high',     120),

-- ── Branding ─────────────────────────────────────────────────────────────────
('Branding',   'Identity',        'Develop logo concepts',               'Designer',  'Finalize event name + tagline', 'high',     10),
('Branding',   'Identity',        'Finalize logo + KV',                  'Director',  'Develop logo concepts',         'critical', 20),
('Branding',   'Assets',          'Create brand guidelines',             'Designer',  'Finalize logo + KV',            'high',     30),
('Branding',   'Assets',          'Design sales deck',                   'Designer',  'Create brand guidelines',       'high',     40),
('Branding',   'Website',         'Deliver website assets',              'Designer',  'Create brand guidelines',       'high',     50),
('Branding',   'Onsite',          'Stage & signage design',              'Designer',  'Finalize logo + KV',            'normal',   60),

-- ── Sales ─────────────────────────────────────────────────────────────────────
('Sales',      'Pipeline',        'Build target account list (200)',      'Sales',     'Define brand positioning',       'critical', 10),
('Sales',      'Outreach',        'Start sponsor outreach',              'Sales',     'Design sales deck',             'critical', 20),
('Sales',      'Revenue',         'Close first sponsor',                 'Sales',     'Start sponsor outreach',        'critical', 30),
('Sales',      'Revenue',         'Achieve 50% revenue target',          'Sales',     'Close first sponsor',           'critical', 40),
('Sales',      'Revenue',         'Achieve 80% revenue target',          'Sales',     'Achieve 50% revenue target',    'critical', 50),

-- ── Customer Success ──────────────────────────────────────────────────────────
('Customer Success', 'Onboarding', 'Create sponsor onboarding kit',      'CS',        'Close first sponsor',           'high',     10),
('Customer Success', 'Onboarding', 'Sponsor kickoff calls',              'CS',        'Create sponsor onboarding kit', 'high',     20),
('Customer Success', 'Delivery',   'Track sponsor deliverables',         'CS',        'Sponsor kickoff calls',         'high',     30),
('Customer Success', 'Delivery',   'Confirm booth requirements',         'CS',        'Finalize floorplan',            'normal',   40),
('Customer Success', 'Experience', 'VIP journey design',                 'CS',        'Final agenda lock',             'normal',   50),

-- ── Operations ────────────────────────────────────────────────────────────────
('Operations', 'Venue',           'Venue sourcing',                      'Ops',       NULL,                            'critical', 10),
('Operations', 'Venue',           'Finalize venue contract',             'Ops',       'Venue sourcing',                'critical', 20),
('Operations', 'Floorplan',       'Draft layout',                        'Ops',       'Finalize venue contract',       'high',     30),
('Operations', 'Floorplan',       'Finalize floorplan',                  'Ops',       'Draft layout',                  'high',     40),
('Operations', 'AV',              'Appoint AV vendor',                   'Ops',       'Finalize venue contract',       'high',     50),
('Operations', 'AV',              'Stage production design',             'Ops',       'Finalize logo + KV',            'high',     60),
('Operations', 'ROS',             'Build run of show',                   'Ops',       'Final agenda lock',             'critical', 70),
('Operations', 'Setup',           'Onsite setup',                        'Ops',       'Build run of show',             'critical', 80),

-- ── Partnerships ──────────────────────────────────────────────────────────────
('Partnerships', 'Strategic',     'Identify strategic partners',         'Partnerships', 'Define brand positioning',   'normal',   10),
('Partnerships', 'Strategic',     'Confirm strategic partners',          'Partnerships', 'Identify strategic partners', 'normal',   20),
('Partnerships', 'Media',         'Secure media partners',               'Partnerships', 'Identify strategic partners', 'normal',   30),

-- ── Tech / Data ───────────────────────────────────────────────────────────────
('Tech/Data',  'CRM',             'Setup CRM system',                    'Tech',      'Build target account list (200)', 'high',  10),
('Tech/Data',  'Registration',    'Setup ticketing platform',            'Tech',      'QA & launch',                   'critical', 20),
('Tech/Data',  'Data',            'Build event dashboards',              'Tech',      'Setup CRM system',              'normal',   30),

-- ── Finance ───────────────────────────────────────────────────────────────────
('Finance',    'Budget',          'Build event P&L',                     'Finance',   'Venue sourcing',                'critical', 10),
('Finance',    'Control',         'Budget allocation by category',       'Finance',   'Build event P&L',               'high',     20),
('Finance',    'Revenue',         'Weekly revenue tracking',             'Finance',   'Close first sponsor',           'high',     30),

-- ── Legal ─────────────────────────────────────────────────────────────────────
('Legal',      'Contracts',       'Sponsor contracts signed',            'Legal',     'Close first sponsor',           'critical', 10),
('Legal',      'Compliance',      'Secure venue permits',                'Legal',     'Finalize venue contract',       'high',     20),

-- ── HR ────────────────────────────────────────────────────────────────────────
('HR',         'Staffing',        'Event staffing plan',                 'HR',        'Finalize venue contract',       'high',     10),
('HR',         'Staffing',        'Recruit temp staff',                  'HR',        'Event staffing plan',           'normal',   20),
('HR',         'Training',        'Staff event training',                'HR',        'Recruit temp staff',            'normal',   30),

-- ── Program Director ──────────────────────────────────────────────────────────
('Program Director', 'Governance', 'Weekly performance review',         'Director',  NULL,                            'high',     10),
('Program Director', 'Oversight',  'Revenue tracking & reporting',      'Director',  'Close first sponsor',           'high',     20),
('Program Director', 'Risk',       'Risk & escalation review',          'Director',  NULL,                            'high',     30);

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS event_task_templates_dept_idx ON event_task_templates(department);
CREATE INDEX IF NOT EXISTS event_checklist_workstream_idx ON event_checklist(workstream);
