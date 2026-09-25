# Studia

Studia is an AI-powered university assessment and course intelligence platform. It helps lecturers create grounded assessments from their course materials and helps students understand and improve their performance.

## Current status

**Identity foundation verified in the configured production project.** The authenticated product shell uses the persisted role for navigation, and the Student dashboard greets the user from their profile. Courses, assessments, results, and practice use honest empty states because those data workflows are not built yet. Lecturer and Admin routes remain protected by the existing profile/status checks. The Admin lecturer-application interface uses the existing review RPC; a live check of this new shell/dashboard after deployment remains outstanding. Course data and course schema are not connected. A local Git repository is initialized on `main`; a GitHub remote has not been set up.
## Core product loop

Course materials -> Course Brain and course-scoped RAG -> grounded assessment generation -> lecturer review and editing -> published assessment -> student assessment -> grading -> topic performance -> weak-area identification -> targeted practice -> reassessment.

## Technology

- React, Vite, and TypeScript
- React Router
- Tailwind CSS
- Supabase JavaScript client and Auth
- Supabase Postgres identity tables and RLS are active in the configured project; course tables and Storage remain future work
- Gemini API, planned provider for V1 grounded AI; RAG/source grounding is a V1 capability, not yet implemented
- Vercel, intended deployment target
- Git and GitHub
- Lucide React for interface icons

Only the libraries needed for the current scope are installed. Supabase Auth and identity data are connected in the client; course data, storage, and Gemini are not connected.

## Documentation

- [product.md](./product.md) â€” product purpose, scope, and principles
- [design.md](./design.md) â€” initial visual direction
- [architecture.md](./architecture.md) â€” intended high-level architecture and boundaries
- [agents.md](./agents.md) â€” instructions for future AI coding agents
- [TODO.md](./TODO.md) â€” phased roadmap

## Setup

Requirements: Node.js 20.19+ or 22.12+ and npm.

Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the ignored `.env.local` file using your Supabase project URL and public anon/publishable key. These Vite variables are exposed to the browser; never use a service-role key here. The local environment file is configured in this workspace; `.env.example` contains placeholders only.

```sh
npm install
npm run dev
```

Vite prints a local URL after the development server starts.

The dependency-free `npm run test:identity` suite covers client route selection only; it does not verify hosted profile RPCs or RLS. The configured production project already has `supabase/migrations/20260925_identity_authorization.sql` applied. Apply it to any new Supabase project before onboarding. The migration creates non-privileged onboarding profiles, lecturer applications, and restrictive identity RLS/function policies. Email confirmation and Google OAuth return to `/app`, which resolves the persisted profile and routes to onboarding or the role area. Add the local and production `/app` destinations to Supabase Auth URL Configuration.

For development Admin provisioning, create the intended Auth user through a trusted Supabase Dashboard action, then have a project owner run this in the SQL Editor with that user Auth UUID. Do not add public Admin signup or frontend promotion controls. The migration `review_lecturer_application` function checks active Admin status.

```sql
update public.profiles
set role = 'admin', account_status = 'active'
where user_id = '<AUTH_USER_UUID>'::uuid;
```

On Windows PowerShell systems that block the `npm.ps1` script, use `npm.cmd` in place of `npm` in these commands.

## Development commands

```sh
npm run dev        # start the Vite development server
npm run typecheck  # check application and Vite configuration TypeScript
npm run test:identity  # verify profile/status destination rules
npm run build      # typecheck and create a production build in dist/
npm run preview    # serve the production build locally
```

The app entry point is `src/main.tsx`. `src/App.tsx` assembles the landing page sections in `src/components/`; illustrative UI previews are static. Tailwind CSS is enabled through the Vite plugin and imported in `src/style.css`.



