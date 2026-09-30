import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const component = readFileSync(new URL("../src/CourseQuestionGeneration.tsx", import.meta.url), "utf8");
const coursePages = readFileSync(new URL("../src/CoursePages.tsx", import.meta.url), "utf8");

test("question generation is available only from the lecturer course detail", () => {
  assert.match(coursePages, /audience === "lecturer" && <CourseQuestionGeneration courseId=\{course\.id\} \/>/);
});

test("generation uses the current Supabase session and the existing endpoint contract", () => {
  assert.match(component, /supabase\.auth\.getSession\(\)/);
  assert.match(component, /Authorization: "Bearer " \+ accessToken/);
  assert.match(component, /fetch\("\/api\/generate-course-questions"/);
  assert.match(component, /JSON\.stringify\(\{ courseId, topic, questionCount, difficulty \}\)/);
  assert.match(component, /value=\{questionCount\}[\s\S]*?<option value=\{5\}>5 questions<\/option>[\s\S]*?<option value=\{10\}>10 questions<\/option>/);
  assert.match(component, /value=\{difficulty\}[\s\S]*?<option value="easy">Easy<\/option>[\s\S]*?<option value="medium">Medium<\/option>[\s\S]*?<option value="hard">Hard<\/option>/);
});

test("review displays every question with four options, answer, explanation, and page traceability", () => {
  assert.match(component, /questions\.map\(\(question, questionIndex\)/);
  assert.match(component, /question\.options\.map\(\(option, optionIndex\)/);
  assert.match(component, /Correct answer/);
  assert.match(component, /question\.explanation/);
  assert.match(component, /Page \{source\.page_number\} · extraction version \{source\.extraction_version\} · source \{source\.source_id\}/);
  assert.match(component, /These questions have not been saved or published/);
});