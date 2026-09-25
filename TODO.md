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
- [ ] Agree the initial application shell and navigation structure.
- [x] Implement Supabase email/password and Google Auth, session handling, protected routing, and sign-out.
- [x] Configure the local public Supabase URL and publishable key in ignored `.env.local`.
- [x] Apply the identity migration and verify profile creation, role/status routing, lecturer approval, admin provisioning, and RLS in the configured Supabase project.
- [ ] Configure and verify Supabase email confirmation and OAuth redirect URLs.
- [x] Keep administrator provisioning out of public signup and document trusted provisioning.
- [x] Add dependency-free tests for identity route selection and fail-closed status combinations.
- [x] Add the Admin lecturer-application queue with approve/reject actions through the existing review RPC.

The identity foundation is applied and verified in the configured Supabase project. The Admin application queue is implemented locally; verify it with an authenticated Admin after deployment. Email confirmation settings remain to be checked.
## Phase 2 â€” Course management and course materials

- [ ] Define the first course and membership workflows.
- [ ] Design and review the minimal database model and RLS policies for courses.
- [ ] Add course-material upload and storage access controls.
- [ ] Add lecturer course and material management UI.

## Phase 3 â€” Course Brain

- [ ] Define the V1 RAG/Course Brain pipeline: source processing, course-scoped retrieval, traceability, and update/deletion behavior.
- [ ] Design source processing and traceability for generated context.
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



