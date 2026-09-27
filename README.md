# Studia

Studia is an AI-powered university assessment and course intelligence platform. It helps lecturers create grounded assessments from their course materials and helps students understand and improve their performance.

## Current status

**Identity, course, enrollment, course-material, and Course Brain source-status foundations are applied and manually verified in the configured Supabase project.** Student and approved lecturer access use persisted profile status. The authenticated shell, course management, enrollment requests, and lecturer review are working in production. Lecturer PDFs remain private to their course. PDF text extraction is implemented locally behind a Vercel Node function; the new extraction migration and function configuration still need deployment and hosted verification. Chunking, indexing/RAG, AI generation, assessments, results, and practice remain future work. A local Git repository is initialized on main; a GitHub remote has not been set up.
## Core product loop

Course materials -> Course Brain and course-scoped RAG -> grounded assessment generation -> lecturer review and editing -> published assessment -> student assessment -> grading -> topic performance -> weak-area identification -> targeted practice -> reassessment.

## Technology

- React, Vite, and TypeScript
- React Router
- Tailwind CSS
- Supabase JavaScript client and Auth
- Supabase identity, course, enrollment, materials, and Course Brain source-status migrations are applied and manually verified; the new text-extraction migration is local and pending application
- Gemini API, planned provider for V1 grounded AI; RAG/source grounding is a V1 capability, not yet implemented
- PDF.js for server-side selectable PDF text extraction
- Vercel Node functions for the trusted processor and frontend deployment
- Git and GitHub
- Lucide React for interface icons

Only the libraries needed for the current scope are installed. Supabase Auth, identity, courses, enrollment, course materials, and source status are working in production. PDF text extraction is implemented locally; its database migration and Vercel server configuration remain pending. Chunking, retrieval, and AI are not connected.

## Documentation

- [product.md](./product.md) â€” product purpose, scope, and principles
- [design.md](./design.md) â€” initial visual direction
- [architecture.md](./architecture.md) â€” intended high-level architecture and boundaries
- [agents.md](./agents.md) â€” instructions for future AI coding agents
- [TODO.md](./TODO.md) â€” phased roadmap

## Setup

Requirements: Node.js 20.19+ or 22.12+ and npm.

Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the ignored `.env.local` file using your Supabase project URL and public anon/publishable key. These Vite variables are public. The Vercel function also needs `SUPABASE_SERVICE_ROLE_KEY` in server-only environment settings after the extraction migration is applied; never prefix it with `VITE_` or expose it to the browser. `.env.example` contains placeholders only. Vite `npm run dev` serves the frontend but not Vercel `/api` functions; use the Vercel development runtime to exercise the processor locally.

```sh
npm install
npm run dev
```

Vite prints a local URL after the development server starts.

`npm run test` runs the existing identity/course contract checks and focused PDF-processing tests. They verify local state transitions and migration contracts, not hosted RPCs or live RLS. The configured project has identity, course, enrollment, materials, and Course Brain source-status migrations applied and manually verified. Apply `supabase/migrations/20260927100000_course_material_extractions.sql`, deploy the Vercel function, and configure its server-only key before using text extraction. A lecturer can then manually process or retry a pending source such as CS101; page loading never starts processing. The identity migration creates non-privileged onboarding profiles and restrictive identity RLS/function policies. Email confirmation and Google OAuth return to `/app`, which resolves the persisted profile and routes to onboarding or the role area. Add the local and production `/app` destinations to Supabase Auth URL Configuration.

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



