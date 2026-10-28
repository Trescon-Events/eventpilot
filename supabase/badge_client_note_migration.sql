-- Optional overall note the client can type when approving a whole badge batch (client approval page).
alter table badge_approval_rounds add column if not exists client_note text;
