# Emails module — people, lists, compose, templates, sent (spec for review)

Status: design agreed with Madhu on 11 Nov 2026. **Nothing built yet.** Build order is at the end; each phase ships on its own.

## What it is

One place in the Stakeholder Hub (under Speakers → **Emails**) for every email that goes to many people. Today the pieces are scattered: the freestyle Speaker Emails page, the global Email Templates table (invites, outstanding items, announcements), guest-invite sends, and per-record requests. Emails to **one person inside a workflow** (asking for a missing bio or passport) stay on the speaker record. Everything to **many people** is sent from here.

Left panel: **Compose** (freestyle, with Polish), **Templates**, **Lists**, **Sent**.

## Decisions already made

| Question | Decision |
|---|---|
| A separate "speaker database"? | No. The pool is a **view** over each event's own records plus the existing CRM people layer. Nothing is copied, so nothing goes stale by itself. |
| Templates | Extend the existing `email_templates` table (audience type, required fields, per-event copies). Admins edit shared templates; producers customise a copy for their own event. |
| People with no own email | Send to the speaker's own address with their additional contacts in CC (what the speaker record does today). Assistant-only sending only when a template is written for it. |
| Do not email | Flag on the **person**. Blocks bulk sends only. A one-to-one email from a speaker record shows a warning, never a block. |
| Sender for an invite to people from another event | The producer who is sending it. |
| Replies and bounces | Read through Microsoft Graph with the permission the app already has (Mail.ReadWrite, Application). Only the **type** of each reply is stored, never its text. |
| Unsubscribe link | None. Do-not-email flag instead. |
| Opens and clicks | Not measured (mail apps block tracking; our style guide bans tracked links). |

## Principles

1. **Lists resolve at send time and are frozen at the moment you press Send.** What the preview showed is exactly what goes out.
2. **No silent skipping.** Everyone excluded is listed with the reason.
3. **HubSpot stays the master for contact details, and plays no part in who may be emailed.** EventPilot never writes to HubSpot from this module, and ignores HubSpot's unsubscribes and bounces: those come from marketing sends, which are a different kind of email for a different purpose. These are one-to-one emails sent from Outlook.
4. **Reusable for other stakeholders.** An audience type (speakers first; sponsors, partners later) supplies its recipients, its filters and its greeting. Everything else is shared.

## Data model

New or changed (all via `supabase/emails_module_migration.sql`, run by hand):

- **`crm_contacts`** (+): `do_not_email bool`, `dne_reason` (asked_to_stop | bounced | left_company | client_request | other), `dne_set_by`, `dne_set_at`, `email_status` (ok | bounced | invalid | review), `email_status_at`.
- **`email_lists`**: `id, name, audience_type ('speaker'), filters jsonb, pinned_contact_ids uuid[], excluded_contact_ids uuid[], event_id (null = usable from any event), created_by, timestamps`. A list is saved filters plus hand-picked and hand-removed people.
- **`email_campaigns`** (one named email): `id, name, event_id (the event it is sent from), audience_type, template_id, subject, body_html (snapshot at send), field_values jsonb (e.g. the gallery link), list_id, sender_mode (me | speaker_producer | named), sender_staff_id, owner_staff_id, status (draft | scheduled | sending | sent | cancelled), scheduled_for, thread_mode (new | speaker_thread), counts, sent_at, created_by`.
- **`email_campaign_recipients`**: `campaign_id, contact_id, speaker_id, to_email, cc_emails[], status (queued | sent | failed | skipped), skip_reason, error, graph_message_id, conversation_id, sent_at, reply_type (none | reply | bounce | auto_reply), reply_at`. One row per person; this feeds the statistics.
- **`email_templates`** (+): `audience_type, required_fields jsonb ([{key,label,kind}]), event_id (per-event copy), parent_template_id, is_shared bool, allow_assistant bool`. The hard-coded sender columns stop being used: the sender comes from the campaign's `sender_mode`.
- **`speaker_email_sends`** stays as history. The Sent screen shows it read-only under "Earlier sends", so nothing is lost.

## People and lists (phase 1)

A **person** is a `crm_contacts` row (already deduplicated by email: 494 live speaker records are 417 people today). Everything about their events comes from the event records, so a person's status at each event is always current.

**Filters** (all combinable): events (one or several); status at those events (Confirmed, Spoke, Withdrew, No-show, On Hold, no status); planned role; country; producer; "spoke at any / at all of the chosen events"; "not on event X" (to invite past speakers to a new event); last confirmed more than N months ago; has a verified email.

**Recipient rules**, applied in this order for each person:
1. Excluded if **do not email**, or `email_status` bounced/invalid.
2. To: the speaker's own email. If none and the template allows assistants: the first additional contact. Otherwise excluded as "no email".
3. CC: the speaker's additional contacts (own address present).
4. One email per person even if they match several events. If the person has several records, the most recent confirmed one supplies name, honorific and company.

**Preview** (before anything can be sent): "62 will receive it. 5 excluded: 2 do not email, 1 bounced before, 2 no email at all", each name listed with its reason. Data-age hints: "11 last confirmed over 18 months ago" with a one-click exclude, and "company changed since the last event" flagged per person.

## Compose and sending (phase 2)

- Freestyle compose with Polish (existing Gemini Polish, event guidelines, `checkEmailCompliance` before send) plus the campaign name, subject and list.
- Test send to yourself; real-email preview; extra confirmation above 20 recipients (a ticked box saying the list, the email and a test copy were checked; the server refuses without it); warning when the same template went to an overlapping list in the last 30 days.
- **Sending** works through one row per person in small batches (8 per call, with a short pause between emails, well inside Graph's per-mailbox limits). The Compose page keeps calling until the queue is empty. If the page is closed part-way, the email stays under Sent with a **Continue sending** button, and a person claimed but never finished is put back in the queue after 5 minutes. A failure on one recipient never stops the rest. (Phase 4's cron will also finish anything left over.) Just before each email goes out the person is re-checked for do-not-email, so a request that arrives after the list was built is honoured and shown as skipped.
- Subject: a bulk or cross-event email starts a **new thread** with the campaign's own subject. `thread_mode = speaker_thread` is available for sends that should land in the per-speaker thread.
- **Sent** screen: each campaign with name, subject, content, list, sender, status and counts: sent, failed, skipped, and (phase 5) bounced, replied, auto-replied. Click through to the per-person rows.

## Templates (phase 3)

- Library with a builder (subject, body, placeholders such as `{{speaker_name}}`, `{{event_name}}`, and **required fields**). A required field blocks sending until it is filled.
- Shared templates are edited by admins. A producer's "customise for this event" makes a copy (`parent_template_id`) that only that event uses.
- The existing users of `email_templates` (guest invites, outstanding-items requests, announcements) keep working unchanged; they simply appear in the same library.
- **Thank-you template**: required field "Gallery link", sent from each speaker's own producer, subject different from the thread, recipients = Confirmed or Spoke, scheduled for a time after the event end day (event days, event timezone). One **owner producer** per event gets the reminders and presses go; no link, no send. If the scheduled time has passed when the link is added, it sends immediately.

## Scheduling and reminders (phase 4, built)

- **Schedule it** in Compose: the default time is the **day after the event's last day at 09:00 in the event's own timezone**; it can be changed (on Compose, or later from Sent). With no event days there is no default and a time must be chosen.
- A scheduled email keeps its audience **definition** (list or filters, hand-removed and hand-picked people) and works out who receives it **when it is released**, not when it was written. So a thank-you scheduled before the post-event prompt marks Spoke / No-show still reaches only those who spoke. The count shown while it waits is an estimate. (Immediate sends still freeze the audience when you press Send.)
- **Required fields can be filled later.** A scheduled thank-you may be created without its gallery link. It is **never sent without it**. When the link is pasted (on the email under Sent) and the send time has already passed, it is released straight away; if the time has not come, it waits for it.
- A **cron** (`/api/cron/emails`, GitHub Actions every 10 minutes) releases due emails, continues any send left half-done, and handles the owner notifications.
- **Owner producer:** each campaign has an owner (default: the event's remembered owner, else the person who scheduled it). The owner gets a bell notification and an email: about once a day when a required field is still empty and the send is within 3 days (or overdue), once as a heads-up in the last 24 hours when everything is ready, and once with the result (sent, failed, skipped). A release that fails (for example the event has no dates) is reported to the owner at most daily and retried at the next check; if nobody matches the list at release time the email is cancelled and the owner is told.
- Cancel works on scheduled emails; a scheduled email's time, owner and required fields can be changed from Sent.

## Replies and bounces (phase 5, built)

- A cron step (inside `/api/cron/emails`, so every 10 minutes, each mailbox read at most every ~25 minutes) reads each sending producer's **inbox** through Microsoft Graph, only for the **30 days** after a send, and only the conversations EventPilot started. A real Exchange bounce shares our conversation, which is how it is matched. A "Check for replies" button on each sent email does it on demand.
- Each message is classified and **only the type is stored** (reply / bounce / auto-reply), never the text. The text (a 255-character preview, and for bounces the failure notice) is looked at in memory only.
- **Hard bounce** (a permanently bad address, status 5.1.x): the person's address is marked bounced, they are left out of lists from then on ("Email bounced before"), and the owner is told. **Soft bounce** (mailbox full, a policy rejection, a temporary failure): recorded on that email only; the person is untouched.
- **Auto-reply that says the person has left:** the address is flagged "check it" in the list preview. It never sets do-not-email.
- **Reply that asks to stop** ("remove me", "unsubscribe", "stop emailing me"…): shown on that email with a **Confirm do not email** button and raised to the owner. Nothing changes until a producer confirms.
- Counts under Sent: bounced, replied, auto-reply, asked to stop. Limits: only the Inbox is read (a reply moved by a mail rule into another folder is not seen), opens and clicks are not measured, and a person who replies from a different address than the one we wrote to is still matched through the conversation.
- **Azure:** no new permission (Mail.ReadWrite, application, was already granted for sending). It is tenant-wide by default: Madhu limits it to the producers' mailboxes with an Exchange Application Access Policy (one-time, recommended). Recorded in the Keys & Credentials registry.

## Do not email

Set from the person's card (and from the list preview) with a reason. Effects:
- Bulk sends: excluded automatically, listed in the preview.
- One-to-one emails from a speaker record: a visible warning ("marked do not email: asked to stop on 3 Nov"), the producer decides.
- **What counts:** only a request to stop that came through emails sent from EventPilot (through Outlook). A producer sets the flag when someone asks (by reply, phone or in person); in phase 5 a reply to an EventPilot email that asks to stop is raised for the producer to confirm with one click, never set automatically. HubSpot unsubscribes and HubSpot bounce data are **not used** (decided 11 Nov).
- Removing the flag is allowed, and is logged with who and when.

## Navigation, access, checks

- New page(s) under Speakers: registered in `app/lib/registry/modules.tsx`, each with `<PageHeader/>`, so `check:nav` passes.
- Lists only show people through events the producer has access to (admins see all). Compose and send: `sae.stakeholders.edit` on the sending event. Shared templates: admin only. Do-not-email: any producer with edit on any event the person is on.
- Event dates for scheduling use `strictEventDays` and the event timezone.

## Build order and acceptance

1. **People and lists.** Migration, person view, filters, recipient rules, preview with exclusions, do-not-email flag, saved lists. *Acceptance:* the preview for "spoke at BSS, DFS, DFWS" shows each person once, with correct exclusions, on real data; no email is sent anywhere.
2. **Compose and Sent.** Compose with Polish, test send, queue send, campaign records with sent/failed/skipped, "Earlier sends" history. *Acceptance:* a throwaway event with test addresses, 5 recipients including one failure and one do-not-email.
3. **Templates.** Extend the table, builder, required fields, per-event copies, thank-you template.
4. **Scheduling and reminders.**
5. **Replies and bounces.**

## Out of scope

Open and click tracking, an unsubscribe link, writing back to HubSpot, importing events from before EventPilot was used, A/B tests, and sending to sponsors and partners (the audience-type seam is built in, the second audience is a later, smaller job).

## Open points — resolved 11 Nov

1. Phase 2 test uses a throwaway event with Madhu's own addresses as recipients. **Yes.**
2. Extra confirmation above **20** recipients (was 50); repeat-send warning on an overlapping list within 30 days.
3. HubSpot opt-outs and bounces: **not used** (Madhu, 11 Nov): they come from marketing sends. Only requests to stop received through EventPilot's own Outlook emails count.


## Restructure (12 Nov 2026): HubSpot-style layout, static and active lists, drafts and more

Decided with Madhu after using phases 1-5. This supersedes the earlier "Lists / Compose / Templates / Sent" tab layout and the assistant mode.

- **Recipients:** an email is always addressed to the speaker. It goes to their own address with every additional contact in Cc; with no own address it goes to the first additional contact (the rest in Cc), still greeting the speaker. The "reach through an assistant" option and the separate assistant greeting are gone. One assistant looking after several speakers gets one email per speaker; two different people sharing one OWN address are still treated as a duplicate.
- **Layout:** a left side panel (Emails, Lists, Templates, plus Create email). **Emails** is the landing page: every email (drafts, scheduled, sending, sent, cancelled) with its event, umbrella, owner and numbers; filter by status, "This event / All my events", event, umbrella; search by name or subject. Open one to see what it said, who got it and what happened.
- **Each email belongs to one event** (chosen when it is written, default the workspace event). Lists can belong to an event or be usable from any event.
- **Lists** (`email_lists.list_type`): **Active** keeps only its criteria and is worked out again every time it is used (grows by itself). **Static** copies the people matching at creation into `members` (person keys c:/e:/s:) and stays; individuals can be added (search, or "everyone matching some criteria") and removed afterwards. The Lists page opens on a table (name, type, size, used in N emails, updated) with Create list, Export CSV and Delete (refused while a scheduled or sending email uses the list). A list shows where each person qualifies, the emails that used it and, for active lists, who joined since the last email. A scheduled email uses its list as it stands at release.
- **Create email:** name, event, list (a dropdown showing each list's type and size, with "+ Create a new list"), template (a searchable picker; clicking one previews it in a pop-up; "Use this template" copies it into the email, so edits never change the template), subject, text, attachments, Polish. **Per-person check:** "preview as" any recipient, placeholders `{{company}}` and `{{role}}`, and a warning for people who lack the data the email uses (leave them out on send). **Drafts** autosave; **Duplicate** and **Follow up with the people who have not replied** (a static list + a draft) open here.
- **Sending safeguards:** a warning when one mailbox would send more than 200 emails in one email; "spread over N hours" (`pace_hours`, the cron drips it out); sending to more than 50 people needs the `sae.emails.send_bulk` permission (granted to every role that can edit speakers, so nothing changes until an admin removes it from a role); the existing confirmation above 20 and 30-day overlap warning stay.
- **Criteria:** a list can leave out anyone emailed in the last N days; each person shows "last emailed".
- **Speaker record:** a new **Emails** tab on each speaker lists every Emails-module email sent to that person across events with its outcome.
- **Export:** CSV of an email's recipients and outcomes, and of a list's people.
