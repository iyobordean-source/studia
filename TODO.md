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

The identity, course, enrollment, course-material, and Course Brain source-status foundations are applied and manually verified in the configured Supabase project. PDF text extraction is implemented locally behind a Vercel Node function; its new extraction migration and server configuration remain to be deployed and verified. Email confirmation settings remain to be checked.
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
- [x] Add bounded per-source PDF text extraction, a private extraction row, atomic ready transition, and lecturer-triggered retry; local code/tests complete.
- [ ] Apply and verify `20260927100000_course_material_extractions.sql`, deploy the Vercel function, and set its server-only Supabase key.
- [ ] Process and verify an existing pending source such as CS101 through the lecturer action after deployment.
- [ ] Define the V1 RAG/Course Brain pipeline: course-scoped retrieval, source traceability, and update/deletion behavior.
- [ ] Design chunks and traceability for generated context.
- [ ] Build lecturer review and update workflows for course knowledge.

## Phase 4 â€” Assessment Studio

- [ ] Define assessment types and question formats for V1.
- [ ] Add grounded assessment generation using approved course context.
- [ ] Build lecturer question review, editing, and publishing workflows.
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



