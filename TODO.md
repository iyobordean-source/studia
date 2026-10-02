# Roadmap

This roadmap is phased. Future work remains open until it is implemented and checked.

## Phase 0 â€” Project foundation

- [x] Create the React, Vite, and TypeScript project foundation.
- [x] Configure Tailwind CSS for Vite.
- [x] Add initial product, design, architecture, agent, and roadmap documentation.
- [x] Verify the project typechecks and builds.
- [x] Initialize the local Git repository.
- [ ] Create the GitHub repository and agree the collaboration workflow.

## Phase 1 — Application foundation and authentication

- [x] Build the responsive public landing page with static product previews.
- [x] Agree the initial application shell and navigation structure.
- [x] Implement Supabase email/password and Google Auth, session handling, protected routing, and sign-out.
- [x] Configure the local public Supabase URL and publishable key in ignored `.env.local`.
- [x] Apply the identity migration and verify profile creation, role/status routing, lecturer approval, admin provisioning, and RLS in the configured Supabase project.
- [ ] Configure and verify Supabase email confirmation and OAuth redirect URLs.
- [x] Keep administrator provisioning out of public signup and document trusted provisioning.
- [x] Add dependency-free tests for identity route selection, role navigation, and fail-closed status combinations.
- [x] Add the Admin lecturer-application queue with approve/reject actions through the existing review RPC.
- [x] Build the authenticated role-aware application shell and Student dashboard with honest empty states.

The identity, course, enrollment, course-material, Course Brain source-status, and text-extraction migrations are deployed to the configured Supabase project, and the hosted processing setup is configured. The PDF.js worker-bundle fix is deployed. Production PDF extraction is working: the PDF.js/DOMMatrix initialization issue has been fixed, deployed diagnostics identified the failure layer, and CS101 extraction was verified in production with the source reaching `ready`. Email confirmation settings remain to be checked. The source-version/page-traceability and page-retrieval/search-segment/generation-limit migrations are local and have not been applied to the configured Supabase project.
## Phase 2 â€” Course management and course materials

- [x] Define the initial course and membership workflow; student join requests require lecturer approval.
- [x] Create the minimal course and membership schema with restrictive RLS policies; the Course Foundation migration is applied and verified.
- [x] Apply and verify the course foundation migration in the configured Supabase project.
- [x] Build lecturer course create/list/detail and student enrolled-course list/detail flows.
- [x] Build lecturer roster management and student course discovery/join requests with atomic lecturer approval/rejection RPCs; migration applied and manually verified.
- [x] Apply and verify the course enrollment workflow migration in the configured Supabase project.
- [x] Implement course PDF metadata, private bucket policies, and participant access; migration applied and manually verified in production.
- [x] Add lecturer PDF upload/list/delete and student material listing/download UI; workflow manually verified in production.
- [x] Apply and manually verify the Course Materials Foundation migration and Storage policies in the configured Supabase project.

## Phase 3 â€” Course Brain

- [x] Add the minimal per-material source record and lecturer processing-state indication; migration applied and manually verified.
- [x] Add bounded per-source PDF text extraction, a private extraction row, atomic ready transition, and lecturer-triggered retry; local tests pass and production extraction is verified in production.
- [x] Apply `20260927100000_course_material_extractions.sql`, configure the hosted processor, and deploy the PDF.js worker-bundle fix; production extraction is verified working after the DOMMatrix runtime fix.
- [x] Deploy the diagnostics and perform one controlled CS101 extraction attempt; Storage returned valid PDF bytes and diagnostics identified PDF.js initialization as the failure layer.
- [x] Fix PDF.js Node initialization with a DOMMatrix shim and verify CS101 extraction reaches `ready` in production.
- [x] Add versioned extraction records and page-level source traceability; local processor and contract tests are in place.

- [x] Implement deterministic course-scoped PostgreSQL full-text retrieval over bounded, overlapping search segments for each ready source's latest successful extraction version; the RPC returns complete canonical page text and a relevant excerpt, and the migration is local and unapplied.
- [x] Add an authenticated save API and course-scoped question bank that preserves source/version/page tuples, with per-question lecturer selection, editing, temporary removal, and in-place regeneration in the local review UI; selected questions save only after explicit approval. Focused tests pass locally. The migration is unapplied and the endpoint/UI are not deployed; there is no student access or publishing.
- [x] Add the authenticated, stateless Gemini question-generation endpoint with structured output and source-reference validation, a 30-second Gemini request timeout, and a database-backed five-reservations-per-lecturer-per-60-second-window guard that verifies course ownership before reserving and runs before retrieval, so no-match requests consume a slot. Keep the 8,192-token output budget with concise two-sentence explanations for 5 or 10 questions; endpoint and guard migration remain local.
- [ ] Apply the traceability, page-retrieval, then course-question-bank migrations in order; the retrieval migration backfills bounded searchable segments and creates the generation-limit table. Deploy the page-aware processor, generation endpoint, and explicit approved-question save API/UI; explicitly reprocess existing ready sources with { sourceId, reprocess: true }; configure server-only GEMINI_API_KEY; and verify hosted extraction, retrieval, 5- and 10-question generation, and lecturer-approved question saving. Keep the legacy two-argument completion RPC until the page-aware processor is deployed and verified, then remove it only in a later migration. Existing aggregate-only versions remain valid and are preserved without fabricated page records.
- [ ] Define the remaining V1 RAG lifecycle, including source updates/deletion and references retained by generated drafts.
- [ ] Design chunks and traceability for generated context.
- [ ] Build lecturer review and update workflows for course knowledge.

## Phase 4 â€” Assessment Studio

- [ ] Define assessment types and question formats for V1.
- [ ] Add assessment-draft persistence and integrate grounded question output into lecturer review/editing and publishing workflows.
- [ ] Keep unpublished drafts separate from published assessments.

## Phase 5 â€” Student assessment experience

- [ ] Add student course and assessment access.
- [ ] Build the assessment-taking flow, progress, and submission behavior.
- [ ] Handle availability and submission states clearly.

## Phase 6 â€” Grading and Course Intelligence

- [ ] Define grading behavior and lecturer oversight requirements.
- [ ] Provide assessment results and feedback to students.
- [ ] Provide course-level performance and weak-area analysis to lecturers.

## Phase 7 â€” Targeted practice and reassessment

- [ ] Create practice activities tied to identified weak areas and course sources.
- [ ] Support reassessment and progress over time.
- [ ] Make the relationship between practice and assessed learning clear.

## Phase 8 â€” Testing, security, polish, and deployment

- [ ] Add checks appropriate to critical user flows and access rules.
- [ ] Review RLS, storage permissions, secrets, and AI data boundaries.
- [ ] Improve accessibility, responsive behavior, performance, and error handling.
- [ ] Configure preview and production deployment on Vercel.



