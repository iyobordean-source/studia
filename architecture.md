# Architecture

## High-level shape

The intended client application uses React, Vite, TypeScript, and Tailwind CSS. Supabase is the planned platform for PostgreSQL data, authentication, and file storage. Gemini is a later AI provider for grounded assessment assistance. Vercel is the intended deployment target. Git and GitHub provide version control and collaboration.

Supabase Auth is connected through the official JavaScript client. The identity schema and authorization rules are defined in `supabase/migrations/20260925_identity_authorization.sql` and are applied in the configured production Supabase project. Apply the migration to any new environment before onboarding. Course data, Supabase Storage, AI provider integration, and deployment remain future work.

## Major application areas

- Course and course-material management.
- Course Brain creation and review.
- Assessment authoring, review, and publishing.
- Student assessment participation and results.
- Grading and performance analysis.
- Targeted practice and reassessment.

These are product areas, not a prescribed folder structure. Keep implementation structure simple until the product needs more.

## Expected data flow

Lecturers add course materials, which are stored with access controlled by the course. The application will use those materials to build course-specific context for assessment generation. A lecturer reviews and edits proposed questions before publishing an assessment. Students complete published assessments. Results feed course-level performance analysis and targeted practice.

The identity schema is defined in the migration described below. The course, membership, material, assessment, and processing schemas remain open until their first vertical slices are designed.

## Authentication, profiles, roles, and route authorization

Supabase Auth is the identity provider for email/password and Google OAuth. Both methods return through the same profile-resolution flow. An Auth session proves identity only; it does not by itself grant access to a Studia product area.

The identity migration creates a `profiles` row keyed by `auth.users.id` and a `lecturer_applications` row for lecturer applicants. A database trigger creates new profiles in the non-privileged `onboarding` state, and the migration backfills existing Auth users into that state. User metadata is not trusted for role assignment.

Onboarding offers Student account creation or a Lecturer application. A restricted database function can activate a Student profile or set a Lecturer profile/application to pending. Pending applicants have no lecturer access. An administrator-only database function records approval or rejection; approval activates the lecturer profile. Admin has no public signup and must be provisioned by a trusted project operator.

The profile role and account status, together with lecturer application status, are the routing source of truth:

- active Student → `/student`
- pending Lecturer application → `/lecturer/pending`
- approved, active Lecturer → `/lecturer`
- active, provisioned Admin → `/admin`
- rejected or disabled account → `/account-status`
- incomplete profile → `/onboarding`

`/app` is a post-authentication resolver, not a shared product area. Browser route guards improve navigation and fail closed when profile resolution fails. Dependency-free tests cover their role/status destination rules, but do not verify hosted database behavior. They are not data security boundaries.

The migration enables and forces RLS on identity tables. Users can read their own profile and application; active admins can read records needed for administration. Direct client writes to identity, role, account status, and application decision fields are revoked. Restricted security-definer functions perform onboarding and admin review, with explicit checks and a locked search path. The Admin route lists pending applications with applicant profile names and account IDs, then invokes the existing `review_lecturer_application` function for approve/reject decisions. `has_active_role(role)` is the database helper for future course policies; Lecturer checks require an active profile and approved application.

Migration files are not applied automatically to new Supabase environments. Apply them through the reviewed migration workflow before testing onboarding.

For development Admin provisioning, create the intended Auth user through a trusted Dashboard action, then have a project owner run this in the SQL Editor with that user's Auth UUID. Do not add public Admin signup or frontend promotion controls.

```sql
update public.profiles
set role = 'admin', account_status = 'active'
where user_id = '<AUTH_USER_UUID>'::uuid;
```

## Supabase Storage

Supabase Storage is the intended home for course-material files. Access should be limited to authorised course participants and staff according to the final product rules. Validate file type and size, keep storage paths tied to authorised records, and avoid public buckets for private course content unless a deliberate product requirement justifies them.

## AI and data boundaries

RAG/source grounding is a V1 product capability, not a later optional phase. The V1 path is lecturer-provided course material → authorized source processing/indexing → course-scoped retrieval of relevant passages → grounded assessment draft with source traceability → lecturer review/editing → publication. Retrieval must be constrained to material the acting lecturer or student is authorized to access. Generated questions remain drafts until a lecturer publishes them.

The precise parsing, chunking, embedding, index, and provider choices remain implementation decisions to make before the Course Brain slice. Gemini is a planned provider, not a currently connected service. Keep provider secrets on a trusted server-side boundary. Minimise student/course data sent to providers, and define retention, deletion/re-indexing, and privacy behavior. AI output must never make authorization decisions.

No separate backend framework is planned by default. When AI calls are introduced, choose and document the smallest trusted server-side option that fits the deployment and security needs, such as a managed function.

## Deployment

Vercel is the intended deployment platform for the frontend. Environment variables must be separated by environment and contain only values appropriate for browser exposure; private credentials belong in trusted server-side configuration. Production deployment configuration is future work.





