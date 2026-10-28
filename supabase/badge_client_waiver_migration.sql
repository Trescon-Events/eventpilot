-- A producer can mark one badge batch "client approval not required" to go straight to the print file / Ops.
-- The waiver only counts if the batch has not been re-approved after it was recorded.
alter table badge_batches add column if not exists client_approval_waived_at timestamptz;
alter table badge_batches add column if not exists client_approval_waived_by text;
