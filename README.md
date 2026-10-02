# Studia

Studia is an AI-powered university assessment and course intelligence platform. It helps lecturers create grounded assessments from their course materials and helps students understand and improve their performance.

## Current status

**Identity, course, enrollment, course-material, and Course Brain source-status foundations are applied and manually verified in the configured Supabase project.** Student and approved lecturer access use persisted profile status. The authenticated shell, course management, enrollment requests, and lecturer review are working in production. Lecturer PDFs remain private to their course. The text-extraction migration and hosted processing setup are deployed. Production PDF extraction is working: the PDF.js/DOMMatrix initialization failure was fixed, deployed diagnostics identified the failure layer, and CS101 extraction was verified in production with the source reaching `ready`. The local versioned page-traceability and page-retrieval migrations and matching page-aware processor are not yet deployed or applied; current production extraction records remain aggregate-only. An authenticated backend page-retrieval and stateless, validated Gemini practice-question endpoint are implemented locally; production use awaits the migrations, deployment, and server-only `GEMINI_API_KEY` configuration. Generated questions remain temporary until the lecturer explicitly chooses Save Approved Questions; the save API/UI and course question-bank migration are local, and the migration is unapplied. Saved questions have no student access and are not published as assessments. Student assessment flows, chunking/embeddings, results, and practice remain future work. A local Git repository is initialized on main; a GitHub remote has not been set up.
## Core product loop

Course materials -> Course Brain and course-scoped RAG -> grounded assessment generation -> lecturer review and editing -> published assessment -> student assessment -> grading -> topic performance -> weak-area identification -> targeted practice -> reassessment.

## Technology

- React, Vite, and TypeScript
- React Router
- Tailwind CSS
- Supabase JavaScript client and Auth
- Supabase identity, course, enrollment, course-material, Course Brain source-status, and text-extraction migrations are deployed to the configured project; the hosted processing setup is configured
- Gemini Interactions API for the local stateless question-generation endpoint; the server-side key and production configuration are not yet enabled
- PDF.js for server-side selectable PDF text extraction
- Vercel Node functions for the trusted processor and frontend deployment
- Git and GitHub
- Lucide React for interface icons

Only the libraries needed for the current scope are installed. Supabase Auth, identity, courses, enrollment, course materials, and source status are working in production. The PDF.js worker-bundle and DOMMatrix runtime fixes and diagnostic deployment are complete. Production extraction was verified with CS101 reaching `ready`. The page-traceability, retrieval, and course-question-bank migrations are local and unapplied; page-aware extraction, retrieval, Gemini question generation, and explicit question saving are not active in production. The local lecturer review UI now supports per-question selection, editing, temporary removal, and single-question regeneration through the existing grounded generation endpoint; selected questions remain unsaved until the explicit save action and this updated UI is not deployed.

## Documentation

- [product.md](./product.md) â€” product purpose, scope, and principles
- [design.md](./design.md) â€” initial visual direction
- [architecture.md](./architecture.md) â€” intended high-level architecture and boundaries
- [agents.md](./agents.md) â€” instructions for future AI coding agents
- [TODO.md](./TODO.md) â€” phased roadmap

## Setup

Requirements: Node.js 20.19+ or 22.12+ and npm.

Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the ignored `.env.local` file using your Supabase project URL and public anon/publishable key. These Vite variables are public. The Vercel function also needs `SUPABASE_SERVICE_ROLE_KEY` in server-only environment settings; this hosted processing setup is configured. Never prefix the key with `VITE_` or expose it to the browser. `.env.example` contains placeholders only. Vite `npm run dev` serves the frontend but not Vercel `/api` functions; use the Vercel development runtime to exercise the processor locally.

```sh
npm install
npm run dev
```

Vite prints a local URL after the development server starts.

`npm run test` runs identity/course contracts, focused PDF-processing tests, and mocked course-question generation/retrieval contract tests. They verify local state transitions and migration contracts, not hosted RPCs or live RLS. The configured project has identity, course, enrollment, materials, Course Brain source-status, and text-extraction migrations deployed. The hosted processing setup, PDF.js worker-bundle and DOMMatrix runtime fixes, and diagnostics are deployed. A controlled CS101 attempt confirmed valid Storage PDF bytes and verified that extraction reaches `ready` in production. A lecturer can manually process or retry a pending source; page loading never starts processing. The identity migration creates non-privileged onboarding profiles and restrictive identity RLS/function policies. Email confirmation and Google OAuth return to `/app`, which resolves the persisted profile and routes to onboarding or the role area. Add the local and production `/app` destinations to Supabase Auth URL Configuration.

For development Admin provisioning, create the intended Auth user through a trusted Supabase Dashboard action, then have a project owner run this in the SQL Editor with that user Auth UUID. Do not add public Admin signup or frontend promotion controls. The migration `review_lecturer_application` function checks active Admin status.

For manual test setup, a trusted project operator can still provision an enrollment through the Supabase SQL Editor. Confirm the intended active Student profile and course before running:

~~~sql
insert into public.course_memberships (course_id, student_id)
values ('<COURSE_UUID>'::uuid, '<STUDENT_PROFILE_UUID>'::uuid)
on conflict (course_id, student_id) do nothing;
~~~

Authenticated clients cannot insert or delete course memberships directly. The new lecturer add/remove and student request/review actions use restricted RPCs after the course enrollment workflow migration is applied.

```sql
update public.profiles
set role = 'admin', account_status = 'active'
where user_id = '<AUTH_USER_UUID>'::uuid;
```

On Windows PowerShell systems that block the `npm.ps1` script, use `npm.cmd` in place of `npm` in these commands.

## Development commands

```sh
npm run dev        # start the Vite development server
npm run typecheck  # check application, API, and Vite configuration TypeScript
npm run test:identity  # verify identity route rules
npm run test         # run all existing and focused extraction tests
npm run build      # typecheck and create a production build in dist/
npm run preview    # serve the production build locally
```

The app entry point is `src/main.tsx`. `src/App.tsx` assembles the landing page sections in `src/components/`; illustrative UI previews are static. Tailwind CSS is enabled through the Vite plugin and imported in `src/style.css`.



