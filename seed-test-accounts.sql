-- ============================================================
-- TAOS Discovery — Test Accounts Seed
-- One account per department + office mix
-- Use these emails to test the full Join → Profile flow
-- All accounts start with profile_complete = false
-- Run this in Supabase SQL editor
-- ============================================================

INSERT INTO staff_members (name, email, office_id, department, role, profile_complete)
VALUES
  -- Events
  ('Alex Test (Events)',            'test.events@tresconglobal.com',       'dubai',     'Events',               'Events Coordinator',         false),

  -- Sales & Sponsorship
  ('Sam Test (Sales)',              'test.sales@tresconglobal.com',        'bangalore', 'Sales & Sponsorship',  'Business Development Exec',  false),

  -- Marketing
  ('Maya Test (Marketing)',         'test.marketing@tresconglobal.com',    'bangalore', 'Marketing',            'Digital Marketing Manager',  false),

  -- Finance
  ('Ravi Test (Finance)',           'test.finance@tresconglobal.com',      'mangalore', 'Finance',              'Finance Executive',          false),

  -- Operations
  ('Priya Test (Operations)',       'test.operations@tresconglobal.com',   'manipal',   'Operations',           'Operations Manager',         false),

  -- IT
  ('Dev Test (IT)',                 'test.it@tresconglobal.com',           'bangalore', 'IT',                   'IT Support Engineer',        false),

  -- HR & Recruitment
  ('Nadia Test (HR)',               'test.hr@tresconglobal.com',           'dubai',     'HR & Recruitment',     'HR Executive',               false),

  -- Content & Design
  ('Lena Test (Content)',           'test.content@tresconglobal.com',      'bangalore', 'Content & Design',     'Content Designer',           false),

  -- Government Relations
  ('Khalid Test (GovRel)',          'test.govrel@tresconglobal.com',       'dubai',     'Government Relations', 'Government Relations Exec',  false),

  -- DemandifyMedia
  ('Ananya Test (Demandify)',       'test.demandify@tresconglobal.com',    'bangalore', 'DemandifyMedia',       'Media Campaign Manager',     false),

  -- Leadership
  ('Vikram Test (Leadership)',      'test.leadership@tresconglobal.com',   'dubai',     'Leadership',           'Director',                   false)

ON CONFLICT (email) DO NOTHING;

-- ============================================================
-- Verification — run after insert to confirm all 11 are in
-- ============================================================
-- SELECT name, email, office_id, department, profile_complete
-- FROM staff_members
-- WHERE email LIKE 'test.%@tresconglobal.com'
-- ORDER BY department;
