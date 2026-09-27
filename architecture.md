# Architecture

## High-level shape

The intended client application uses React, Vite, TypeScript, and Tailwind CSS. Supabase is the planned platform for PostgreSQL data, authentication, and file storage. Gemini is a later AI provider for grounded assessment assistance. Vercel is the intended deployment target. Git and GitHub provide version control and collaboration.

Supabase Auth is connected through the official JavaScript client. The identity, Course Foundation, Course Enrollment Workflow, and Course Materials Foundation migrations are applied and manually verified in the configured production Supabase project. The Course Brain source-processing foundation is defined in `supabase/migrations/20260926160000_course_brain_source_processing.sql`; it remains to be applied and verified. No PDF parsing, indexing, retrieval, or AI processing is implemented.

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

The identity, course, enrollment, course-material, and initial course-material source-state schemas are defined in their respective migrations. Assessment and document-processing schemas remain open until their own vertical slices are designed.

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

`/app` is a post-authentication resolver, not a shared product area. Browser route guards improve navigation and fail closed when profile resolution fails. Dependency-free tests cover their role/status destination rules, but do not verify hosted database behavior. They are not data security boundaries. After the existing identity gate confirms the persisted destination, `/student`, `/lecturer`, and `/admin` render inside a shared authenticated shell with role-specific navigation. `/app` continues to resolve to the matching protected area. The Student dashboard reads the profile display name and presents honest empty states; course, assessment, result, and practice data are not implemented.

The migration enables and forces RLS on identity tables. Users can read their own profile and application; active admins can read records needed for administration. Direct client writes to identity, role, account status, and application decision fields are revoked. Restricted security-definer functions perform onboarding and admin review, with explicit checks and a locked search path. The Admin route lists pending applications with applicant profile names and account IDs, then invokes the existing `review_lecturer_application` function for approve/reject decisions. `has_active_role(role)` is the database helper for future course policies; Lecturer checks require an active profile and approved application.

Migration files are not applied automatically to new Supabase environments. Apply them through the reviewed migration workflow before testing onboarding.

For development Admin provisioning, create the intended Auth user through a trusted Dashboard action, then have a project owner run this in the SQL Editor with that user's Auth UUID. Do not add public Admin signup or frontend promotion controls.

```sql
update public.profiles
set role = 'admin', account_status = 'active'
where user_id = '<AUTH_USER_UUID>'::uuid;
```

## Course foundation and access

The Course Foundation migration adds `public.courses` and `public.course_memberships`. Each course has one `lecturer_id` referencing `profiles.user_id`, a name, a code unique per lecturer without regard to letter case, an optional description, and timestamps. A membership links one course to one Student profile; its course/student pair is unique.

RLS is enabled and forced on both tables. Active, approved Lecturers can create courses as themselves, read their own courses, and update course name, code, and description. Active Students can read only courses with a membership row. Students cannot change course data. Students can read only their own membership rows, and a course owner can read memberships for courses they own. The `owns_course(uuid)` security-definer helper checks the active Lecturer role and prevents recursive policy evaluation. Authenticated clients have no membership insert, update, or delete grants; course deletion is also not exposed.

The course enrollment workflow adds public.course_join_requests with pending, approved, and rejected states. Active Students can search course names/codes and submit a request; submitting a request does not create membership. The owning active, approved Lecturer can search active Student accounts, directly add/remove a student, and review pending requests. Approving a request inserts the membership and records approval in one transaction; rejecting only records the decision. A direct Lecturer add also resolves a matching pending request. Student identity search is limited to the owning Lecturer and returns only active Student accounts. Course discovery returns course details and the Student account enrollment/request state through role-checked RPCs. Authenticated clients have no direct membership or request write grants.

For manual test setup, a trusted project operator can still provision a Student through the Supabase SQL Editor after confirming the intended active profile:

~~~sql
insert into public.course_memberships (course_id, student_id)
values ('<COURSE_UUID>'::uuid, '<STUDENT_PROFILE_UUID>'::uuid)
on conflict (course_id, student_id) do nothing;
~~~

The browser routes reuse the existing identity gates. Existing course list/detail reads use course RLS, while enrollment discovery and mutations use restricted RPCs. Course Foundation and Course Enrollment Workflow are applied and manually verified in the configured project.

## Course materials and Storage

The Course Materials Foundation migration adds public.course_materials with a course foreign key, title, optional description, file name, MIME type, size, timestamps, and a deterministic storage_path in the form course_id/material_id/file_name. V1 uploads are PDF only, limited to 20 MB. The migration creates a private course-materials bucket restricted to application/pdf and 20 MB. This migration is applied and manually verified in the configured production project.

Forced table RLS lets the owning active, approved Lecturer read/create/update/delete their course material metadata. An active Student can read metadata only when a course_memberships row enrolls them in that course. Students and unauthenticated users cannot write material records.

Storage object policies use the same course ownership and enrollment checks. Upload and delete paths must begin with the owned course UUID and contain a material UUID and PDF filename. Reads additionally require a matching visible course_materials row, so guessing another course path does not grant access. Files are uploaded, downloaded, and removed through the authenticated Supabase Storage API; the client does not write Storage tables. The material record is created after upload, and failed record creation triggers a best-effort object cleanup. Deletion removes the object before its metadata row. The Storage policies have been applied and manually verified in the configured production project.

## Course Brain source-processing foundation

The initial source-state migration defines one `course_material_sources` row per `course_materials` record. Each source has a stable ID, a `pending` / `processing` / `ready` / `failed` state, optional bounded error text, and created/updated timestamps. Existing materials are backfilled as pending; new material inserts seed a pending row. Deleting a material cascades to its source record, so a later re-upload receives a new source identity for traceability.

Forced RLS lets an active, approved Lecturer read source state only for materials in courses they own. The material trigger can insert only the initial pending state. Authenticated clients have no source-state update or delete grants. The trusted `service_role` can update only status and error fields for future processing transitions and reprocessing. Students receive no source-state access through this table, so their existing course/material permissions are unchanged. The lecturer materials view reports a missing record as Not initialized and a failed status lookup as unavailable.

This migration is local and has not been applied or verified in the hosted project. It represents processing state only: PDF extraction, chunking, indexing, retrieval, Course Brain content, and AI generation are not implemented.

## AI and data boundaries

RAG/source grounding is a V1 product capability, not a later optional phase. The V1 path is lecturer-provided course material → authorized source processing/indexing → course-scoped retrieval of relevant passages → grounded assessment draft with source traceability → lecturer review/editing → publication. Retrieval must be constrained to material the acting lecturer or student is authorized to access. Generated questions remain drafts until a lecturer publishes them.

PDF parsing, chunking, embeddings, index design, source passage traceability, and provider choices remain future implementation decisions after the source-state foundation. Gemini is a planned provider, not a currently connected service. Keep provider secrets on a trusted server-side boundary. Minimise student/course data sent to providers, and define retention, deletion/re-indexing, and privacy behavior. AI output must never make authorization decisions.

No separate backend framework is planned by default. When AI calls are introduced, choose and document the smallest trusted server-side option that fits the deployment and security needs, such as a managed function.

## Deployment

Vercel is the intended deployment platform for the frontend. Environment variables must be separated by environment and contain only values appropriate for browser exposure; private credentials belong in trusted server-side configuration. Production deployment configuration is future work.





