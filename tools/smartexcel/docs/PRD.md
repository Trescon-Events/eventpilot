# Trescon Spreadsheet Operations App — Checklist, Critique, Phased Plan, and PRD

## Product definition

A multi-user internal web application for Trescon that allows non-technical users to run conversational, AI-assisted spreadsheet and document-to-spreadsheet jobs with strong user control, guided clarification, plan approval, sample-run validation, full execution, job history, reusable approved recipes, and workspace-level collaboration.[cite:35]

The long-term product goal is a general-purpose spreadsheet operations platform, while the first practical release should focus on CRM-admin and operations-heavy spreadsheet work such as cleaning, restructuring, mapping, deduplication, conversion, reporting outputs, and import-ready formatting.[cite:35][cite:36]

## Master checklist

### Original master requirements being carried forward

- Build a web application using Claude Code as the build companion, with planning, prompts, and phased execution support.[cite:35]
- Support broad Excel-related and spreadsheet-related operational work, not just one migration use case.[cite:35]
- Include a conversational AI chat interface with file drop/upload support.[cite:35]
- Convert each user request into a job-oriented workspace with chat on the left and result area on the right.[cite:35]
- Ask clarifying questions before execution, one by one where needed, similar to guided AI product flows.[cite:35]
- Show a proposed execution plan and require explicit user approval before running the job.[cite:35]
- Run a sample on a small chunk first, then ask the user to approve or request rework before full execution.[cite:35]
- After completion, allow continued conversation, refinement, and reruns within the same job page.[cite:35]
- Maintain job history with downloadable outputs and dedicated job detail pages.[cite:35]
- Provide preview of resulting data and work performed.[cite:35]
- Support user account management, invitations, forgot password, and OTP email recovery.[cite:35]
- Use Resend for email capability in the build.[cite:35]
- Include progress indication, long-running job handling, and protection against crashes or stuck jobs.[cite:35]
- Target deployment through GitHub, Vercel preview workflows, and final hosting through official domain / Cloudflare-controlled infrastructure.[cite:35]
- Keep track of phased build progress so completed versus pending scope is never lost.[cite:35]

### Confirmed V1 scope

- Primary user profile: CRM admin / operations-heavy user handling large spreadsheet files with company, contact, deal, and similar business data.[cite:36]
- Product identity: general-purpose spreadsheet operations app, with CRM workflows as the first strong use case rather than the permanent scope boundary.[cite:35][cite:36]
- Job intake: one primary file per job in V1.[cite:35]
- Conversational clarification: for non-simple jobs, ask one question at a time with predefined answer options plus an “Other” option with text entry.[cite:35]
- Execution cycle: clarify → summarize understanding → execution plan → approve/reject → sample run → approve/rework → full run → optional post-run refinement loop.[cite:35]
- Rework path: user can go back to chat after plan rejection, sample rejection, or final dissatisfaction and continue the same job thread.[cite:35]
- Team memory: successful patterns can become workspace-reusable recipes after admin approval.[file:1]
- Recipe UX: each recipe must have a layman-friendly title and description explaining what it does.[file:1]
- File types for V1 intake should include spreadsheet and supporting document formats such as xlsx, xlsm, xlsb, xls, csv, tsv, pdf, doc, docx, txt, md, xml, screenshots/images, and best-effort support for access files if required.[web:66][web:57][web:53]
- ZIP support is not required in V1.[file:1]
- Full in-app spreadsheet editing is not required in V1.[file:1]
- V1 should support file transformation and output generation, while preserving multiple sheets, formulas, and formatting where feasible.[file:1]
- V1 may write formulas when required by the user’s job or by the transformation plan.[file:1]
- The preview/result grid must be very user-friendly and optimized for smooth horizontal and vertical scrolling on large tabular data, which implies use of a virtualized grid approach.[web:69][web:81][web:73]
- Authentication in V1: email/password only, with OTP-based recovery via email.[file:1]
- AI provider in V1: Google AI Studio / Gemini, with dynamic model routing based on task complexity and stage.[web:94][web:88][cite:41]
- Role model in V1: Super Admin, Admin, Standard.[file:1]
- Super Admin: md@tresconglobal.com with permanent non-revokable access.[file:1]
- Role permissions for Admin and Standard should be definable through admin settings/panel.[file:1]
- Workspace visibility model: jobs and produced files are visible to the whole workspace by default unless restricted.[file:1]
- Admins can delete jobs and produced documents.[file:1]
- Recommended deletion implementation: soft delete plus audit log and retention/recovery rather than immediate hard delete by default.[web:102][web:105][web:108]

### Deferred to later phases unless proven essential earlier

- Full browser-based spreadsheet editor with direct manual cell editing.[file:1]
- Rich macro preservation / advanced VBA compatibility beyond best-effort workbook handling.[file:1]
- Multi-file jobs in a single execution thread.[cite:35]
- Deeper third-party CRM push integrations as a core requirement.[cite:36]
- Social login such as Google or Microsoft SSO.[file:1]
- ZIP ingestion.[file:1]
- Very broad “any file / any spreadsheet / any workflow” marketing claims that exceed tested capability.[cite:35]

### Open implementation choices, but no longer blocking PRD

- Final choice of web framework and worker stack.
- Final grid library selection.
- Final storage vendor choice under Cloudflare/Vercel-compatible architecture.
- Whether Access support ships in V1 GA or as beta/best-effort.

## Requirement critique

### What is strong

The strongest part of the requirement is the human-control loop. Clarification, plan approval, sample run, and post-run rework create the right level of trust for non-technical users working on potentially large and sensitive datasets.[cite:35]

The second strongest part is the focus on operational continuity rather than one-off outputs. Job pages, reusable recipes, workspace visibility, and downloadable artifacts turn the product into a real internal operating tool instead of a disposable chat toy.[cite:35][file:1]

### What needs tightening

The phrase “absolutely any kind of excel related work” is not a safe product requirement. It is too broad for engineering, QA, and user trust, and it will encourage overpromising in both implementation and messaging.[cite:35]

A better framing is: “AI-assisted spreadsheet and document-to-spreadsheet operations platform for non-technical business users, with governed execution, reusable recipes, and phased expansion of supported job types.” That is still broad, but it is specific enough to build and test.[cite:35]

The second area that needs tightening is the difference between conversational flexibility and execution freedom. The app should feel flexible in conversation, but execution should remain structured, validated, and reversible where possible.[cite:35]

### Main risks

- Scope creep: the combination of AI chat, spreadsheet automation, document extraction, user management, approvals, history, recipes, admin panel, and resilience can easily become too large for one initial build.[cite:35]
- Reliability risk: broad file support and broad task support increase failure modes quickly, especially for formats such as Access files, PDFs, legacy Excel files, and oddly structured workbooks.[web:53][web:66]
- UX risk: too many clarifying questions can make the product feel slow or bureaucratic; too few can make outputs inaccurate.[web:22][cite:35]
- Trust risk: if the app modifies files without clear preview/approval boundaries, users will hesitate to rely on it.[cite:35]
- Performance risk: large spreadsheet previews and transformations require strong virtualization, asynchronous jobs, and proper worker architecture.[web:69][web:81]

## Alternative approaches considered

### Alternative 1: fixed workflow tool

A rigid wizard with fixed steps would be simpler to build, but it would fail many of your real-world use cases because spreadsheet jobs vary widely in structure, ambiguity, and source quality.[cite:35]

### Alternative 2: fully open-ended AI agent with minimal structure

A completely free-form agent may look impressive early, but it is the riskiest path operationally. It would be harder to guarantee validation, reproducibility, safe rework, and consistent outputs for non-technical users.[cite:35]

### Recommended middle path

The best product shape is a conversational front-end with a governed execution engine underneath. The AI should clarify, interpret intent, plan, summarize, and narrate results, while deterministic code modules handle transformation, validation, workbook manipulation, preview generation, and output packaging.[cite:35]

## Recommended product architecture

### Core principle

Keep the AI in the orchestration and reasoning layer, and keep spreadsheet execution in deterministic services. This makes the system more reliable, easier to test, and easier to improve over time.[cite:35]

### Suggested technical shape

- Front-end: Next.js / React web app with a polished two-pane job workspace and admin surfaces.
- Data and auth: relational database plus app-managed auth flows with email/password and OTP recovery via Resend.[file:1]
- Files: object storage for uploads, previews, outputs, and versioned artifacts.[file:1]
- Job execution: queued worker architecture for long-running and retryable jobs.[cite:35]
- Spreadsheet/document processing: Python services/libraries for tabular handling, workbook operations, document extraction, and conversion.[web:53][web:66]
- AI orchestration: Gemini model-routing layer using task roles such as fast, balanced, advanced rather than hardcoding one model everywhere.[web:88][web:94][cite:41]
- Auditability: store job steps, clarifications, approved plan snapshots, sample-run outputs, final outputs, and admin actions.[cite:35][web:108]

### Recommended execution modules

The backend should not be one giant “agent.” It should be a catalog of reusable execution modules such as:

- File type detection and parser selection.
- Schema inference and header normalization.
- Missing-field and anomaly detection.
- Deduplication and record-matching logic.
- Column mapping and transformation rules.
- Formula insertion where required.
- Workbook-preserving export path where feasible.
- Safe output mode when perfect preservation is not possible.
- Preview sampler and sample-run generation.
- Validation and quality report generation.
- Recipe extraction from successful approved jobs.[file:1]

## Phase plan

### Phase 0 — foundation and architecture

Goal: establish the app shell, auth, roles, admin scaffolding, file storage, job state model, queue architecture, and Gemini routing abstraction.[file:1][cite:41]

Deliverables:
- Project scaffolding and repository standards.
- Auth flows with Resend-based OTP recovery.
- Super Admin protection for md@tresconglobal.com.[file:1]
- Roles and permissions framework.
- Core data model and job lifecycle states.
- Base UI shell with two-pane job workspace.
- Background job queue and status updates.
- Audit log base tables.

### Phase 1 — conversational spreadsheet operations MVP

Goal: ship the first usable product slice for one-file jobs with conversational clarification, plan approval, sample preview, full execution, history, and outputs.[cite:35]

Deliverables:
- New job creation and upload flow.
- Clarification engine with one-by-one structured questions.
- Plan summary + approve/reject.
- Sample-run preview + approve/rework.
- Full run execution.
- Result pane with high-performance preview grid.
- Job detail page with outputs and logs.
- Workspace-wide visibility with restriction option.
- Admin delete with soft delete + audit log.
- Initial supported transformations: cleanup, mapping, dedupe, split/merge-within-single-file, restructuring, formula insertion, export-ready formatting, document-to-sheet extraction.

### Phase 2 — reusable recipes and operational maturity

Goal: reduce repeat work and improve reliability for recurring patterns.[file:1]

Deliverables:
- Promote successful jobs to recipe candidates.
- Admin review and publish recipes.
- Layman descriptions and version history.
- Apply approved recipe to a new file.
- Improved validation reports and anomaly detection.
- Better performance for large-file processing.
- More robust workbook preservation paths.

### Phase 3 — breadth, scale, and advanced operations

Goal: expand supported formats, policies, and collaboration sophistication.

Possible deliverables:
- Multi-file jobs.
- Deeper Access support.
- Advanced document extraction.
- Optional direct external-system connectors.
- More admin controls over AI/model routing and file retention.
- More advanced analytics, monitoring, and usage reporting.

## Product requirements document

## 1. Product overview

Trescon needs an internal web application that enables non-technical users to complete spreadsheet-centric operational work through a conversational AI interface, without depending on the tech team for most recurring data tasks.[cite:35][cite:36]

The application must combine guided clarification, governed execution, preview-before-commit behavior, reusable team knowledge, and reliable file handling so that users can safely transform business data and generate usable spreadsheet outputs.[cite:35]

## 2. Product goals

- Reduce dependence on technical staff for routine spreadsheet and document-to-sheet tasks.[cite:35]
- Make complex data operations accessible to users with only basic Excel knowledge.[cite:35]
- Preserve user control through approvals, previews, and rework cycles.[cite:35]
- Build reusable operational knowledge through approved recipes.[file:1]
- Support both present CRM-heavy workflows and future broader spreadsheet operations.[cite:35][cite:36]

## 3. Non-goals for V1

- Full browser-based spreadsheet editor.[file:1]
- Unrestricted multi-file orchestration in one job.[cite:35]
- Guarantee of perfect preservation for every workbook edge case.[file:1]
- Claiming universal support for all spreadsheet-like workflows from day one.[cite:35]

## 4. Users and roles

### Primary users

- CRM admin / operations-heavy users working with company, contact, deal, and related business datasets.[cite:36]
- Other non-technical internal team members handling spreadsheet-based operational jobs.[cite:35]

### Roles

| Role | Purpose | Key permissions |
|------|---------|-----------------|
| Super Admin | Permanent platform owner | Full non-revokable access; protected account: md@tresconglobal.com [cite:35] |
| Admin | Operational management | Invite users, manage permissions, review recipes, manage settings, delete jobs/files, view workspace history [file:1] |
| Standard | Regular user | Create jobs, upload files, run jobs, view allowed workspace history, download outputs [file:1] |

Permissions for Admin and Standard must be adjustable in the admin panel, but Super Admin protections must not be editable through normal UI controls.[file:1]

## 5. Key user journeys

### Journey A — run a new job

1. User starts a new chat/job and uploads a file.[cite:35]
2. System classifies job complexity and asks clarifying questions if needed, one at a time, with options plus “Other.”[cite:35]
3. System summarizes understanding and presents an execution plan.[cite:35]
4. User approves or rejects the plan.[cite:35]
5. If approved, system runs a sample on a small chunk and shows preview.[cite:35]
6. User approves full run or requests rework.[cite:35]
7. System completes full run asynchronously, shows progress, and notifies on completion.[cite:35]
8. User reviews outputs, downloads files, or continues refinement in the same job page.[cite:35]

### Journey B — reuse an approved recipe

1. User opens a new job with a new file.[file:1]
2. System suggests a matching approved recipe where relevant.[file:1]
3. User sees a layman description of the recipe.[file:1]
4. User applies it, reviews any missing clarification questions, and proceeds through the same plan/sample/full-run cycle.[file:1]

### Journey C — admin review and governance

1. Admin invites users and manages permissions.[file:1]
2. Admin reviews successful jobs for recipe promotion.[file:1]
3. Admin publishes/edit recipes for workspace reuse.[file:1]
4. Admin restricts visibility or deletes jobs/files when required.[file:1]
5. System records audit trails for sensitive actions.[web:108]

## 6. Functional requirements

### 6.1 Authentication and user management

- Email/password sign-in.[file:1]
- Forgot-password / recovery via email OTP.[file:1]
- Email delivery via Resend.[file:1]
- User invite flow from admin panel.[cite:35]
- Simple user profile management.[cite:35]
- Role assignment and permission configuration for Admin/Standard.[file:1]
- Protected permanent Super Admin account.[file:1]

### 6.2 Job workspace UX

- Two-pane layout: left-side chat / right-side result and preview area.[cite:35]
- Clean modern UI influenced by conversational AI products, but optimized for operational clarity rather than novelty.[cite:35]
- Smooth state transitions between chat, clarifications, plan approval, sample review, execution, completion, and rework.[cite:35]
- Strong preview UX for tabular data with virtualized scrolling and stable sticky headers/columns where useful.[web:69][web:81][web:73]

### 6.3 Clarification engine

- Detect whether a task is simple or requires structured clarification.[cite:35]
- Ask one question at a time for non-simple tasks.[cite:35]
- Support predefined selectable answers plus “Other” with text entry.[cite:35]
- Avoid excessive questioning when confidence is already high.[web:22][cite:35]
- Produce a structured understanding of the job, not just free-form chat text.[file:1]

### 6.4 Planning and approval

- Present a user-friendly execution plan summarizing what the system understood, what it will do, expected output, and any risks/assumptions.[cite:35]
- Plan must support approve and reject actions.[cite:35]
- Reject returns the user to active clarification/chat mode.[cite:35]

### 6.5 Sample run and full run

- After plan approval, run a sample on a small chunk of data for complex jobs.[cite:35]
- Show preview of sample output and changes.[cite:35]
- User can approve full run or request rework.[cite:35]
- Full run executes asynchronously with progress indication, status updates, and completion notification.[cite:35]

### 6.6 File handling

- V1 primary job intake: one main file per job.[cite:35]
- Accept common spreadsheet and supporting document formats including xlsx, xlsm, xlsb, xls, csv, tsv, pdf, doc, docx, txt, md, xml, screenshots/images, and best-effort Access support.[web:66][web:57][web:53]
- Generate downloadable outputs and previews.[cite:35]
- Preserve multiple sheets, formulas, and common formatting where feasible.[file:1]
- Insert formulas when required by the transformation logic or user intent.[file:1]
- When exact preservation is unsafe or not possible, warn the user and allow a safe output mode prioritizing correctness.[file:1]

### 6.7 Execution capabilities for V1

The system should support at least these job families in V1:
- Spreadsheet cleaning and standardization.[cite:36]
- Header normalization and field mapping.[cite:36]
- Deduplication and anomaly flagging.[cite:36]
- Restructuring and column operations.[cite:35]
- Document/table extraction into spreadsheet form.[file:1]
- Formula-based derived columns or output sheets.[file:1]
- Export-ready output generation.[cite:35]

### 6.8 Job history and visibility

- Every job has its own page with chat history, plan snapshot, sample output, final outputs, logs, and key metadata.[cite:35]
- Job history and produced files are visible to the workspace/team by default unless restricted.[file:1]
- Admins can delete jobs and files.[file:1]
- Deletions should use soft-delete plus audit log and recovery window by default.[web:102][web:108]

### 6.9 Reusable recipes

- Successful jobs can be flagged as candidate reusable patterns.[file:1]
- Admin review is required before workspace-wide publication.[file:1]
- Published recipes need layman-friendly title and description.[file:1]
- Recipes should store structured job understanding, approved logic, key settings, and output expectations.[file:1]

### 6.10 Admin panel

- User management and invitations.[cite:35]
- Role/permission configuration.[file:1]
- Recipe review and publication.[file:1]
- Workspace/job visibility controls.[file:1]
- Delete/recover management for jobs/files.[file:1]
- Model policy controls and provider configuration should exist in architecture, even if some settings remain hidden in early UI.[cite:41]

## 7. Non-functional requirements

### 7.1 Reliability

- Jobs must execute asynchronously to avoid request timeouts on large files.[cite:35]
- Retry and failure-handling mechanisms are required for long-running work.[cite:35]
- Progress indicator must exist for sample and full runs where relevant.[cite:35]
- The app should not appear frozen during long operations.[cite:35]

### 7.2 Performance

- Large table previews should use virtualization for rows and columns where possible.[web:69][web:81]
- Preview interaction must remain smooth during horizontal and vertical navigation.[web:69][web:73]
- Heavy transformations should run in worker/background infrastructure, not the request thread.[cite:35]

### 7.3 Security and governance

- Workspace access should be permission-based.[file:1]
- Sensitive actions should be auditable.[web:108]
- Deleted content should remain recoverable for a retention period by admins unless explicitly purged.[web:102][web:105]
- Super Admin account must be protected from accidental lockout or downgrade.[file:1]

### 7.4 Maintainability

- AI model routing must use abstract policy tiers (for example: fast, balanced, advanced) instead of hardcoded single-model assumptions.[cite:41][web:88][web:94]
- Execution logic should be modular and testable rather than buried inside prompts.[cite:35]
- Recipe logic should be versioned.[file:1]

## 8. Suggested data model

Minimum core entities:
- User
- Role
- Permission
- Workspace
- Job
- JobMessage
- ClarificationQuestion
- ClarificationAnswer
- ExecutionPlan
- SampleRun
- FullRun
- FileArtifact
- Recipe
- RecipeVersion
- AuditLog
- Notification

## 9. Recommended UX states

Recommended job lifecycle states:
- Draft request.[cite:35]
- Clarification in progress.[cite:35]
- Plan awaiting approval.[cite:35]
- Sample run in progress.[cite:35]
- Sample run awaiting confirmation.[cite:35]
- Full run in progress.[cite:35]
- Completed.[cite:35]
- Rework requested.[cite:35]
- Failed / needs attention.[cite:35]
- Deleted / archived.[file:1]

## 10. Delivery recommendation for Claude Code

Claude Code should not be asked to build the entire product in one shot. It should be guided through a phased implementation plan with a running master checklist so that completed scope, deferred scope, and open issues remain visible at all times.[cite:35]

The build should start with architecture, data model, state model, auth, file storage, and job lifecycle scaffolding first. Only after that should the conversational clarification loop, preview grid, transformation engine, recipes, and advanced admin controls be layered in.[cite:35]

## 11. Critique of this plan

This plan is strong because it balances ambition with a realistic first slice. It keeps the long-term vision intact while imposing enough structure to make the first build reliable and governable.[cite:35]

Its main weakness is that it still covers a lot of product surface area for a V1. If time or build quality becomes a concern, the first feature to trim should be breadth of file-format support, followed by breadth of transformation families, not the user-control loop; the clarification-plan-sample-approve cycle is the heart of the product and should not be compromised.[cite:35][web:53]

## 12. Simple initial Claude Code prompt

Use this as the initial kickoff prompt for Claude Code:

> Build a production-oriented internal web application for Trescon called a spreadsheet operations workspace. The app is for non-technical users who need to run conversational, AI-assisted spreadsheet and document-to-spreadsheet jobs safely. Start by thoroughly reviewing the attached PRD and checklist, critique the scope, identify technical risks, propose better alternatives where appropriate, and then recommend a phased implementation plan before writing code. The product must use a two-pane job workspace (chat left, results right), structured clarification questions for non-simple tasks, plan approval, sample run before full run, async job execution, workspace-visible history, admin-approved reusable recipes, email/password auth with OTP recovery via Resend, Gemini model routing via Google AI Studio, and roles for Super Admin, Admin, and Standard. The account md@tresconglobal.com must be a permanent non-revokable Super Admin. Do not try to build everything in one pass. First produce: 1) system architecture, 2) data model, 3) permission model, 4) job state model, 5) phased build plan, 6) recommended tech stack, and 7) risks, tradeoffs, and what should be deferred from V1. Keep a running checklist of what is completed, in progress, deferred, and pending so the original requirement is never lost.
