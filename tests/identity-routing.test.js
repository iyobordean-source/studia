import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { getIdentityDestination } from "../src/identity.ts";
import { courseAreaRoutes, roleNavigation } from "../src/appNavigation.ts";
import { getCourseJoinAction } from "../src/courseEnrollmentState.ts";

const profile = (role, account_status) => ({ role, account_status });
const enrollmentMigration = readFileSync(new URL("../supabase/migrations/20260926120000_course_enrollment_workflow.sql", import.meta.url), "utf8");
const application = (status) => ({ status });

test("routes incomplete profiles to onboarding", () => {
  assert.equal(getIdentityDestination(profile("student", "onboarding"), null), "/onboarding");
});

test("routes an active student to the student area", () => {
  assert.equal(getIdentityDestination(profile("student", "active"), null), "/student");
});

test("routes only a pending lecturer application to the pending state", () => {
  assert.equal(getIdentityDestination(profile("lecturer", "pending"), application("pending")), "/lecturer/pending");
  assert.equal(getIdentityDestination(profile("lecturer", "pending"), null), "/account-status");
  assert.equal(getIdentityDestination(profile("lecturer", "pending"), application("approved")), "/account-status");
});

test("routes only an active lecturer with an approved application to the lecturer area", () => {
  assert.equal(getIdentityDestination(profile("lecturer", "active"), application("approved")), "/lecturer");
  assert.equal(getIdentityDestination(profile("lecturer", "active"), application("pending")), "/account-status");
  assert.equal(getIdentityDestination(profile("lecturer", "active"), null), "/account-status");
});

test("routes an active admin to the admin area", () => {
  assert.equal(getIdentityDestination(profile("admin", "active"), null), "/admin");
});

test("routes rejected and disabled profiles to restricted status", () => {
  assert.equal(getIdentityDestination(profile("lecturer", "rejected"), application("rejected")), "/account-status");
  assert.equal(getIdentityDestination(profile("admin", "disabled"), null), "/account-status");
});

test("fails closed for inconsistent role and status combinations", () => {
  assert.equal(getIdentityDestination(profile("student", "pending"), application("pending")), "/account-status");
});

test("student course routes use the existing student identity gate destination", () => {
  assert.equal(courseAreaRoutes.student.list, "/student/courses");
  assert.equal(courseAreaRoutes.student.detail, "/student/courses/:courseId");
  assert.equal(courseAreaRoutes.student.identityDestination, "/student");
});

test("lecturer course routes use the existing approved lecturer identity gate destination", () => {
  assert.equal(courseAreaRoutes.lecturer.list, "/lecturer/courses");
  assert.equal(courseAreaRoutes.lecturer.detail, "/lecturer/courses/:courseId");
  assert.equal(courseAreaRoutes.lecturer.identityDestination, "/lecturer");
});

test("course navigation is role-specific and admin navigation remains unchanged", () => {
  assert.ok(roleNavigation.student.some((item) => item.to === courseAreaRoutes.student.list));
  assert.ok(roleNavigation.lecturer.some((item) => item.to === courseAreaRoutes.lecturer.list));
  assert.ok(roleNavigation.student.every((item) => !item.to.startsWith("/lecturer")));
  assert.ok(roleNavigation.lecturer.every((item) => !item.to.startsWith("/student")));
  assert.deepEqual(roleNavigation.admin.map((item) => item.to), ["/admin"]);
});

test("course join actions prevent duplicate requests and enrollment", () => {
  assert.equal(getCourseJoinAction(true, null), "enrolled");
  assert.equal(getCourseJoinAction(false, "approved"), "request");
  assert.equal(getCourseJoinAction(false, "rejected"), "request");
  assert.equal(getCourseJoinAction(false, "pending"), "pending");
});
test("course enrollment requests are RLS-protected and block duplicate pending rows", () => {
  assert.match(enrollmentMigration, /alter table public\.course_join_requests enable row level security;\s*alter table public\.course_join_requests force row level security;/);
  assert.match(enrollmentMigration, /create unique index course_join_requests_one_pending[\s\S]*?where status = 'pending'/);
  assert.match(enrollmentMigration, /revoke all on public\.course_join_requests from public, anon, authenticated;/);
  assert.doesNotMatch(enrollmentMigration, /grant\s+(insert|update|delete|all)\s+on public\.course_join_requests/i);
});

test("student join requests use an active-student RPC and a pending-only conflict target", () => {
  const start = enrollmentMigration.indexOf("create or replace function public.request_course_join");
  const end = enrollmentMigration.indexOf("create or replace function public.list_my_course_join_requests");
  const requestFunction = enrollmentMigration.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.match(requestFunction, /has_active_role\('student'::public\.studia_role\)/);
  assert.match(requestFunction, /on conflict \(course_id, student_id\)\s*where status = 'pending'/);
  assert.match(requestFunction, /return v_inserted > 0;/);
});

test("lecturer approval inserts membership before recording approval in the same RPC", () => {
  const start = enrollmentMigration.indexOf("create or replace function public.review_course_join_request");
  const end = enrollmentMigration.indexOf("create or replace function public.search_courses_for_join");
  const reviewFunction = enrollmentMigration.slice(start, end);
  const approvalBranch = reviewFunction.slice(
    reviewFunction.indexOf("if v_decision = 'approved'"),
    reviewFunction.indexOf("update public.course_join_requests"),
  );
  assert.ok(start >= 0 && end > start);
  assert.ok(approvalBranch.indexOf("insert into public.course_memberships") >= 0);
  assert.ok(reviewFunction.indexOf("update public.course_join_requests") > reviewFunction.indexOf("insert into public.course_memberships"));
  assert.doesNotMatch(reviewFunction.slice(reviewFunction.indexOf("update public.course_join_requests")), /insert into public\.course_memberships/);
});

const materialMigration = readFileSync(new URL("../supabase/migrations/20260926140000_course_materials_foundation.sql", import.meta.url), "utf8");
const materialClient = readFileSync(new URL("../src/CourseMaterials.tsx", import.meta.url), "utf8");

test("course materials use forced RLS and a private PDF-only bucket", () => {
  assert.match(materialMigration, /alter table public\.course_materials enable row level security;\s*alter table public\.course_materials force row level security;/);
  assert.match(materialMigration, /insert into storage\.buckets[\s\S]*?'course-materials',\s*'course-materials',\s*false,\s*20971520,\s*array\['application\/pdf'\]/);
  assert.match(materialMigration, /revoke all on public\.course_materials from public, anon, authenticated;/);
  assert.match(materialMigration, /grant select, delete on public\.course_materials to authenticated;/);
  assert.match(materialMigration, /grant insert \(id, course_id, title, description, file_name, storage_path, mime_type, file_size\)/);
  assert.doesNotMatch(materialMigration, /grant\s+all\s+on public\.course_materials/i);
});

test("material metadata and Storage reads require course ownership or active enrollment", () => {
  const metadataRead = materialMigration.slice(
    materialMigration.indexOf("create policy course_materials_read_course_participants"),
    materialMigration.indexOf("create policy course_materials_insert_by_owner"),
  );
  const storageRead = materialMigration.slice(
    materialMigration.indexOf("create policy course_material_objects_read_participant"),
    materialMigration.indexOf("create policy course_material_objects_insert_by_owner"),
  );
  assert.match(metadataRead, /public\.owns_course\(course_id\)/);
  assert.match(metadataRead, /has_active_role\('student'::public\.studia_role\)/);
  assert.match(metadataRead, /course_memberships cm[\s\S]*?cm\.student_id = \(select auth\.uid\(\)\)/);
  assert.match(storageRead, /cm\.storage_path = storage\.objects\.name/);
  assert.match(storageRead, /public\.owns_course\(cm\.course_id\)/);
  assert.match(storageRead, /has_active_role\('student'::public\.studia_role\)/);
  assert.match(storageRead, /course_memberships membership[\s\S]*?membership\.student_id = \(select auth\.uid\(\)\)/);
});

test("Storage uploads and deletes are limited to owned course paths", () => {
  const storageInsert = materialMigration.slice(
    materialMigration.indexOf("create policy course_material_objects_insert_by_owner"),
    materialMigration.indexOf("create policy course_material_objects_delete_by_owner"),
  );
  const storageDelete = materialMigration.slice(
    materialMigration.indexOf("create policy course_material_objects_delete_by_owner"),
  );
  assert.match(storageInsert, /to authenticated/);
  assert.match(storageInsert, /public\.owns_course\(c\.id\)/);
  assert.match(storageInsert, /lower\(storage\.extension\(name\)\) = 'pdf'/);
  assert.match(storageDelete, /to authenticated/);
  assert.match(storageDelete, /public\.owns_course\(c\.id\)/);
  assert.doesNotMatch(materialMigration, /insert\s+into\s+storage\.objects/i);
});

test("course material downloads use the authenticated Storage API", () => {
  assert.match(materialClient, /\.from\(bucketName\)\s*\.download\(material\.storage_path\)/);
  assert.doesNotMatch(materialClient, /getPublicUrl|createSignedUrl/);
});
