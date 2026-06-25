-- Seed the 9 BRD-mandated overhead components for current month
-- Each component gets a $0 monthly cost — Finance team sets actual values
-- Run once. Safe to re-run (ON CONFLICT skips duplicates).

INSERT INTO overhead_config (component, period_month, monthly_cost, currency, notes) VALUES
  ('office_rent',          DATE_TRUNC('month', CURRENT_DATE), 0, 'USD', 'Monthly office rental across all locations'),
  ('utilities',            DATE_TRUNC('month', CURRENT_DATE), 0, 'USD', 'Power, water, internet, phone'),
  ('technology_costs',     DATE_TRUNC('month', CURRENT_DATE), 0, 'USD', 'Software licenses, cloud hosting, IT infrastructure'),
  ('corporate_marketing',  DATE_TRUNC('month', CURRENT_DATE), 0, 'USD', 'Corporate-level marketing and brand spend'),
  ('administrative_costs', DATE_TRUNC('month', CURRENT_DATE), 0, 'USD', 'Office admin, supplies, miscellaneous'),
  ('insurance',            DATE_TRUNC('month', CURRENT_DATE), 0, 'USD', 'Business insurance, liability, professional indemnity'),
  ('finance_costs',        DATE_TRUNC('month', CURRENT_DATE), 0, 'USD', 'Banking fees, payment processing, audit'),
  ('commission_costs',     DATE_TRUNC('month', CURRENT_DATE), 0, 'USD', 'Sales commissions and referral fees'),
  ('incentives',           DATE_TRUNC('month', CURRENT_DATE), 0, 'USD', 'Staff incentives, bonuses, performance rewards')
ON CONFLICT (component, period_month) DO NOTHING;
