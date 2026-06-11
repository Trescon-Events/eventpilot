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
2. Update the Build Log inside `app/admin/page.tsx` → What's Next panel → Build Log array (prepend a new date entry at the top)
3. Commit everything including HANDOFF.md and push to main
4. Verify the Vercel deployment succeeded
5. Tell the user: "Handoff complete. Here is your sign-off summary: [brief summary]"

The person picking up next will read HANDOFF.md before touching anything.
