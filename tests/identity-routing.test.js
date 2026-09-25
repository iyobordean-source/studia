import assert from "node:assert/strict";
import test from "node:test";
import { getIdentityDestination } from "../src/identity.ts";

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