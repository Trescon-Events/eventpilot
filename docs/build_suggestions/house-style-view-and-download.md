# House style guide: view in EventPilot, download as PDF or Word

Date: 2026-10-16. Owner: Madhu. Files: docs/house-style/Trescon house style guide.pdf and .docx (final, identical content).

## What Madhu wants
Upload the final guide at /admin/content/house-style, so that any team member can read it inside EventPilot and download it as a PDF or a Word file, without leaving the app.

## Step 0: look before building
Read LiveDocView, DraftReview and UploadDocButton in app/admin/events/[id]/details/page.tsx and the messaging upload route (app/api/events/stakeholders/messaging). Report back what a live document shows today:
- Is the original uploaded file kept in storage, and is there a download link for it?
- Is there an in-page view of the document, or only the extracted structure?
Do not build until this is answered. If both already exist, only Part 2 (the Word copy) and Part 3 (who can see it) may be needed.

## Non-negotiables
- The existing upload, extraction, draft review and approve flow is unchanged. The PDF is uploaded through it exactly as today, so the guide is processed for the tools.
- The Word file is a convenience copy. It is stored and offered for download only. It is never extracted, never reaches any tool or prompt, and never becomes a second live version.
- No new tables if an existing column or storage bucket can hold the second file.

## Part 1: in-page view
On the live style guide card, show the document in the page: embedded PDF viewer, or the extracted text laid out with headings, whichever the existing code makes cleaner. It must be readable on a laptop without downloading.

## Part 2: download buttons
Two buttons on the live card: Download PDF and Download Word. The PDF is the uploaded original. The Word file is attached to the same live document version when Madhu approves it (or uploaded alongside it), and is replaced when a new version goes live.

## Part 3: who can see it (decision for Madhu, do not assume)
The page sits under /admin/*, which is platform admin only. Team members such as the content and marketing teams need to read the guide. Propose the smallest option, for example a read-only page or route for staff, with only the view and download buttons, and no rules panel and no upload. Ask Madhu to choose before building it.

## Checks
1. The PDF upload still creates a draft that Madhu reviews and approves, and the extracted structure matches the guide.
2. After approval, the live card shows the guide in the page.
3. Download PDF returns the same file that was uploaded.
4. Download Word returns the .docx and opens in Word with the tables and headings intact.
5. Uploading a new version replaces both downloads, and the old Word file is not left behind as current.
6. The .docx never appears in any prompt, rule check or extraction.
7. A non-admin staff member cannot upload, approve or reach the rules panel.
