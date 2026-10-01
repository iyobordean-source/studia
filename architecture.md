# Architecture

## High-level shape

The client application uses React, Vite, TypeScript, and Tailwind CSS. Supabase provides PostgreSQL data, authentication, and private file storage. A server-side Gemini integration is implemented locally for grounded practice-question generation. Vercel hosts the frontend and trusted server functions. Git and GitHub provide version control and collaboration.

Supabase Auth is connected through the official JavaScript client. The identity, course, enrollment, course-material, source-status, and text-extraction migrations are deployed to the configured Supabase project, and the hosted processing setup is configured. The PDF.js worker-bundle and DOMMatrix runtime fixes are deployed, along with the diagnostics. Production PDF extraction is working; a controlled CS101_Introduction.pdf extraction reached the `ready` state. The source-version/page-traceability and page-retrieval migrations plus the page-aware processor are local and not yet applied or deployed; production currently retains aggregate extraction text without page records. An authenticated Vercel endpoint for course-scoped page retrieval and stateless Gemini multiple-choice practice-question generation is implemented locally, but is not production-ready until those migrations and processor changes are deployed and GEMINI_API_KEY is configured server-side. Generated questions remain temporary until the lecturer explicitly uses the local Save Approved Questions action; the save API and course question-bank migration are local and unapplied. The migration grants no student access and does not publish questions. Student workflows, embeddings, and chunking are not implemented.

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

The identity, course, enrollment, course-material, source-state, and extracted-text schemas are defined in their migrations. The local retrieval migration adds bounded PostgreSQL full-text search segments derived from canonical page evidence. A minimal lecturer-owned question bank is defined in a local, unapplied migration; it stores approved question content and exact source citation tuples, without student access or publication. Assessment schemas, semantic chunking, embeddings, and vector search remain open until their own vertical slices are designed.

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

Storage object policies use the same course ownership and enrollment checks. Upload and delete paths must begin with the owned course UUID and contain a material UUID and PDF filename. Reads additionally require a matching visible course_materials row, so guessing another course path does not grant access. Files are uploaded, downloaded, and removed through the authenticated Supabase Storage API; the client does not write Storage tables. The material record is created after upload, and failed record creation triggers a best-effort object cleanup. Deletion removes the object before its metadata row. The Storage policies have been applied and manually verified in the configured production project. A course-material row identifies one uploaded file; authenticated clients can update only its title and description. Replacing a PDF therefore means deleting the old material and uploading a new row with a new material/source identity. The existing deletion flow removes the private Storage object before deleting metadata; cascading foreign keys then remove the source, all extraction versions, and their page rows.

## Course Brain source-processing foundation

The source-state migration defines one `course_material_sources` row per `course_materials` record, with a stable ID, `pending` / `processing` / `ready` / `failed` status, bounded error text, and timestamps. Existing materials are backfilled as pending and new uploads receive a pending source row. This migration is applied and manually verified in the configured Supabase project. Forced RLS lets an active approved Lecturer read source state only for a course they own; authenticated clients cannot change processing status. Students receive no source-state access. The lecturer materials view reports missing or unavailable state honestly.

`course_material_extractions` stores one aggregate text row per successful extraction version, with the existing 5 MiB limit and timestamps. Its per-source `extraction_version` and composite key preserve earlier successful results. `course_material_extraction_pages` stores non-empty text by one-based PDF page and references the exact aggregate row through `(source_id, extraction_version)`. These foreign keys resolve through `course_material_sources` to the original `course_materials` row and course. The page table enables and forces RLS with the existing participant-read helper, and authenticated users have no write grants. The service-role-only `complete_course_material_extraction` RPC validates that page text joins to the aggregate, writes the next version and page rows, then changes `processing` to `ready` atomically.

`api/process-course-source.ts` is a synchronous Vercel Node function. It validates the caller's Supabase session, then relies on existing source/material RLS to establish lecturer ownership and downloads the PDF through the authenticated private Storage API. The server-only `SUPABASE_SERVICE_ROLE_KEY` is used only for the guarded processing-state update and completion RPC; it must never be exposed through a `VITE_` variable. The lecturer starts work explicitly from a pending source row and can retry a failed row; page load does not process files. Processing handles all pages with PDF.js, preserves the aggregate text and each non-empty page with its one-based page number, fails clearly when the PDF is invalid or has no selectable text, and does not perform OCR. Before importing the installed PDF.js build, the Node processor provides a DOMMatrix shim when the runtime lacks one; this resolves the module-initialization requirement without invoking browser rendering APIs. Inputs retain the existing 20 MiB PDF limit; extracted text is bounded to 5 MiB. A ready source with an extraction remains idempotent. A failed retry that succeeds creates a new extraction version; failed attempts create no version and leave earlier evidence intact, but mark the source failed. Future retrieval must require a ready source and use its latest extraction version. Existing ready version-1 records remain valid aggregate-only evidence and have no recoverable page locations. After the page-aware processor is deployed, an owner-authenticated request to `/api/process-course-source` with `{ sourceId, reprocess: true }` downloads the current private PDF and creates a new extraction version with pages while preserving the old version. The traceability migration retains the two-argument RPC for compatibility with the currently deployed processor; that overload seeds an aggregate only when none exists, so its old `maybeSingle()` lookup remains valid and prior evidence is not overwritten; apply the migration first, deploy and verify the three-argument processor, then remove the old overload only in a later migration.

The deployed diagnostic instrumentation records the Storage HTTP status and response content type/length, then the downloaded Blob/byte lengths, the first eight bytes in hex, and the PDF-signature offset. PDF.js failures log a sanitized error name, message, code/status, cause, and short stack. Logs omit PDF text, request URLs and headers, and credentials. They were used in a controlled CS101 attempt: Storage returned HTTP 200 with application/pdf content, 26,799 bytes, and a PDF signature at offset zero, identifying PDF.js initialization as the failure layer.

The text-extraction migration and hosted server setup have been deployed. The PDF.js worker-bundle and DOMMatrix runtime fixes are deployed, and production extraction is working. The diagnostic instrumentation was deployed and used in a controlled CS101 attempt; the extraction reached the `ready` state. The new page-traceability migration and matching processor changes are local and have not been deployed or applied. Existing production extraction rows have aggregate text but no recoverable page rows; no page location is inferred or fabricated.

## AI and data boundaries

RAG/source grounding is a V1 product capability, not a later optional phase. The V1 path is lecturer-provided course material → authorized source processing/indexing → course-scoped retrieval of relevant passages → grounded assessment draft with source traceability → lecturer review/editing → publication. Retrieval must be constrained to material the acting lecturer or student is authorized to access. Generated questions remain drafts until a lecturer publishes them.

PDF text parsing is implemented for selectable text. Versioned aggregate and page-level source traceability are implemented locally, but their migration and page-aware processor are not yet deployed or applied. The new `20260929100000_course_brain_page_retrieval.sql` migration derives overlapping search segments of at most 16,384 characters (64 KiB in UTF-8) from each canonical page. These bounded segments are indexed for PostgreSQL full-text search and retain the exact `(source_id, extraction_version, page_number)` relationship; the complete canonical page text remains unchanged in `course_material_extraction_pages`. Its `SECURITY INVOKER` RPC requires an active lecturer to own the requested course, filters to ready sources and the latest successful extraction version per source, ranks matching segments, and returns the complete canonical `page_text` plus a bounded `relevant_text` excerpt with source ID, version, and page number. Segment reads follow participant RLS and authenticated users have no segment-write grants. The migration also adds a database-backed limit of five generation requests per lecturer per minute. These schema changes are local and unapplied; existing RLS remains in force.

`POST /api/generate-course-questions` authenticates the caller with Supabase Auth and performs retrieval through that user’s RLS-scoped client; it does not trust client-supplied source IDs. The local endpoint retains complete canonical page evidence for traceability but sends only the matched `relevant_text` excerpts, course/topic/count/difficulty, and source/version/page references to Gemini through the Interactions API, with `store: false` and a server-only `GEMINI_API_KEY`. The Gemini HTTP request uses a 30-second abort timeout and returns a safe 504 on timeout; the configured Vercel function limit remains 60 seconds. After authentication, the database reservation RPC verifies course ownership before reserving a slot; at most five requests per lecturer are reserved per 60-second window, resetting 60 seconds after the first accepted request. Reservation precedes retrieval, so rate-limited requests skip retrieval and no-match requests still consume a slot. The guard fails closed if unavailable. The endpoint requests structured JSON for 5 or 10 easy/medium/hard multiple-choice questions. The 8,192-token output budget remains in place; the prompt asks for concise questions and explanations of at most two sentences, which leaves room for both supported question counts. Before returning a response, the server validates question count, four distinct options, answer membership, explanations, and that every cited `(source_id, extraction_version, page_number)` came from retrieved evidence. This generation endpoint remains stateless. A separate local POST /api/save-approved-questions endpoint saves only after the lecturer explicitly chooses Save Approved Questions in the review UI. It authenticates with the lecturer session, checks course ownership, reuses question validation, and inserts through the caller-scoped Supabase client. The local question-bank migration restricts CRUD to the owning lecturer and validates every citation tuple against page evidence in the same course; it adds no student policy or publishing behavior. The migration is unapplied and the save endpoint/UI are not deployed.

Production use awaits applying the traceability, retrieval, then question-bank migrations in order; deploying the matching page-aware processor, generation endpoint, and explicit save API/UI; and configuring GEMINI_API_KEY as a server-only Vercel variable. Before rollout is considered verified, test both 5- and 10-question generation and the approved-save flow against real course evidence. Student question access, assessment publishing and attempts, semantic chunking, embeddings, vector search, and OCR remain future work. Keep provider secrets on a trusted server-side boundary. Minimise student/course data sent to providers, define retention and privacy behavior, and never use AI output for authorization decisions.

No separate backend framework is planned. AI calls run through a trusted Vercel server function, with provider credentials held only in server-side environment variables.

## Deployment

Vercel hosts the frontend and synchronous source-processing and question-generation functions. The text-extraction migration and hosted processing setup are deployed. The PDF.js worker-bundle and DOMMatrix runtime fixes and diagnostic deployment are complete; CS101 extraction has been verified in production through the `ready` state. The source-version/page-traceability, page-retrieval/search-segment/generation-limit, and course-question-bank migrations are local and remain unapplied. The page-aware processor, question-generation endpoint, explicit save endpoint, and review save action are also local; production retrieval, generation, and question saving still require deployment and a server-only Gemini API key.





