import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createSaveApprovedQuestionsHandler } from "../api/save-approved-questions.ts";

const courseId = "c1000000-0000-4000-8000-000000000001";
const sourceId = "d1000000-0000-4000-8000-000000000001";
const reference = { source_id: sourceId, extraction_version: 3, page_number: 12 };

function payload(count = 5, source = reference) {
  return {
    courseId,
    questions: Array.from({ length: count }, (_, index) => ({
      question: "Question " + (index + 1) + "?",
      options: ["Option A", "Option B", "Option C", "Option D"],
      correctAnswer: "Option A",
      explanation: "The source page supports this answer.",
      sources: [source],
    })),
  };
}

function request(body, withAuth = true) {
  return new Request("https://studia.test/api/save-approved-questions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(withAuth ? { Authorization: "Bearer test-access-token" } : {}),
    },
    body: JSON.stringify(body),
  });
}

function dependencies(overrides = {}) {
  const state = { authenticated: [], ownershipChecks: [], savedRows: [] };
  return {
    state,
    isConfigured: () => true,
    async authenticate(token) {
      state.authenticated.push(token);
      return { user: "lecturer" };
    },
    async ownsCourse(caller, requestedCourseId) {
      state.ownershipChecks.push({ caller, courseId: requestedCourseId });
      return true;
    },
    async saveQuestions(caller, rows) {
      state.savedRows.push({ caller, rows });
      return rows.map((_, index) => ({ id: "e1000000-0000-4000-8000-" + String(index + 1).padStart(12, "0") }));
    },
    ...overrides,
  };
}

test("authorized lecturer explicitly saves validated questions and receives saved IDs", async () => {
  const deps = dependencies();
  const response = await createSaveApprovedQuestionsHandler(deps).fetch(request(payload()));
  assert.equal(response.status, 201);
  const result = await response.json();
  assert.equal(result.savedQuestions.length, 5);
  assert.match(result.savedQuestions[0].id, /^[0-9a-f-]{36}$/i);
  assert.equal(deps.state.authenticated[0], "test-access-token");
  assert.equal(deps.state.ownershipChecks[0].courseId, courseId);
  assert.equal(deps.state.savedRows[0].rows.length, 5);
  assert.deepEqual(deps.state.savedRows[0].rows[0].source_references, [reference]);
  assert.equal(deps.state.savedRows[0].rows[0].correct_answer, "Option A");
  assert.equal(deps.state.savedRows[0].rows[0].course_id, courseId);
});

test("a user without course ownership cannot save questions", async () => {
  const deps = dependencies({ async ownsCourse() { return false; } });
  const response = await createSaveApprovedQuestionsHandler(deps).fetch(request(payload()));
  assert.equal(response.status, 403);
  assert.deepEqual(deps.state.savedRows, []);
});

test("invalid question content is rejected before saving", async () => {
  const invalid = payload();
  invalid.questions[0].options = ["Only", "three", "options"];
  const deps = dependencies();
  const response = await createSaveApprovedQuestionsHandler(deps).fetch(request(invalid));
  assert.equal(response.status, 400);
  assert.deepEqual(deps.state.savedRows, []);
});

test("malformed source references are rejected before saving", async () => {
  const deps = dependencies();
  const response = await createSaveApprovedQuestionsHandler(deps).fetch(request(payload(5, {
    source_id: sourceId,
    extraction_version: "3",
    page_number: 12,
  })));
  assert.equal(response.status, 400);
  assert.deepEqual(deps.state.savedRows, []);
});

test("the question bank migration restricts every operation to the owning lecturer", () => {
  const migration = readFileSync(
    new URL("../supabase/migrations/20261001100000_course_question_bank.sql", import.meta.url),
    "utf8",
  );
  assert.match(migration, /alter table public\.course_questions enable row level security/);
  assert.match(migration, /alter table public\.course_questions force row level security/);
  for (const operation of ["select", "insert", "update", "delete"]) {
    const policy = new RegExp("create policy course_questions_\\w+_by_course_owner[\\s\\S]*?for " + operation + "[\\s\\S]*?public\\.owns_course\\(course_id\\)", "i");
    assert.match(migration, policy);
  }
  assert.doesNotMatch(migration, /to authenticated[\s\S]*?using \([^)]*has_active_role\('student'/i);
  assert.match(migration, /material\.course_id = new\.course_id/);
  assert.match(migration, /from public\.course_material_extraction_pages page/);
});

test("questions stay temporary until the lecturer selects the explicit save action", () => {
  const component = readFileSync(new URL("../src/CourseQuestionGeneration.tsx", import.meta.url), "utf8");
  const generateAction = component.slice(
    component.indexOf("async function generateQuestions"),
    component.indexOf("async function saveApprovedQuestions"),
  );
  assert.doesNotMatch(generateAction, /save-approved-questions|course_questions/);
  assert.match(component, /Save Approved Questions/);
  assert.match(component, /Questions saved successfully\./);
  assert.match(component, /fetch\("\/api\/save-approved-questions"/);
});
