-- Tracks the HubSpot Workflow (Form submission trigger -> Send a webhook
-- action) that createFormSubmissionWebhookWorkflow() (app/lib/hubspot/
-- crm-client.ts) creates per event_hubspot_forms connection (2026-09-20,
-- Madhu — automates what was previously a manual, per-form, click-through
-- HubSpot setup step). NULL means no workflow has been created through
-- EventPilot yet for this connection — either it still needs the manual
-- "Set Up Automatic Sync" click, or (for a connection made before this
-- existed, e.g. WAIS Malaysia's) it was built by hand directly in HubSpot
-- and EventPilot simply doesn't know its id.

alter table event_hubspot_forms
  add column if not exists hubspot_workflow_id text,
  add column if not exists hubspot_workflow_created_at timestamptz;
