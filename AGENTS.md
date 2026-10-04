<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

---

# Session Start Protocol — MANDATORY

**At the start of EVERY session**, before doing any work:

1. Read `HANDOFF.md` (project root)
2. Report to the user:
   - Who last worked on this, and when
   - What was built in that session (summary)
   - What's next / current sprint items
3. Then ask the user how they'd like to proceed

This prevents duplicate work and ensures continuity between Madhu and Durga's sessions.

---

# Session End Protocol — MANDATORY

**Before signing off**, always:

1. Update `HANDOFF.md`:
   - Set "Last Session" → Who, Date, Handed off to
   - Update "What Was Built This Session" with files changed and what each change does
   - Update "Pre-Phase 3 Checklist" status
   - Update "What's Next"
2. Build Log is automatic — no action needed. The What's Next panel's Build Log (`app/admin/page.tsx`) fetches live from `GET /api/build-log`, which derives its entries from GitHub commits. It is not a hand-maintained array; a clear commit message in step 3 is what surfaces there.
3. Commit everything including HANDOFF.md and push to main
4. Verify the Vercel deployment succeeded
5. Tell the user: "Handoff complete. Here is your sign-off summary: [brief summary]"

The person picking up next will read HANDOFF.md before touching anything.

---

# Before every push — CI gates

CI (`.github/workflows/ci.yml`) runs lint (changed files), typecheck, **`npm run check:nav`** and the build. `check:nav` fails the whole run (and emails the team) when a NEW `page.tsx` has no entry in `app/lib/registry/modules.tsx`, doesn't literally contain `<PageHeader`, or claims an event permission without a gate call. Run `npm run check:nav` locally before pushing. For a thin wrapper page whose shared view renders the header, add a reasoned entry to `app/lib/registry/nav-exclusions.ts`; never edit `.github/scripts/nav-branding-baseline.json` to hide new pages. After pushing, confirm `gh run list --workflow CI --limit 1` ends `success`.

