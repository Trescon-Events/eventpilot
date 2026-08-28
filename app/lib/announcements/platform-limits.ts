// Real per-platform caption limits (2026-08-16) — not exhaustive, just the
// two platforms actually in scope for now (per Madhu). A post that's too
// long for a selected platform still gets truncated/rejected by the real
// platform regardless of what EventPilot does, so surfacing this before
// Schedule/Post Now is the whole value — same "look like it'll actually
// post" principle as the caption editor rebuild.
//
// Moved here 2026-08-28, out of the event-scoped creative-templates/page.tsx
// it used to live in — the same value applies identically to every event,
// nothing about it is per-event config, so it didn't belong physically
// nested under app/admin/events/[id]/. Same identifier set as
// channel-handles.ts's PLATFORM_LABEL — keep the two in sync by hand if a
// new platform is ever added to either.
export const PLATFORM_CHAR_LIMITS: Record<string, number> = { x: 280, linkedin: 3000, 'linkedin-page': 3000 }
