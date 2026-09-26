import assert from "node:assert/strict";
import test from "node:test";
import { getIdentityDestination } from "../src/identity.ts";
import { courseAreaRoutes, roleNavigation } from "../src/appNavigation.ts";

const profile = (role, account_status) => ({ role, account_status });
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
