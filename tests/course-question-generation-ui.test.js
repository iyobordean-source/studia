import assert from "node:assert/strict";

import { readFileSync } from "node:fs";

import test from "node:test";



const component = readFileSync(new URL("../src/CourseQuestionGeneration.tsx", import.meta.url), "utf8");

const coursePages = readFileSync(new URL("../src/CoursePages.tsx", import.meta.url), "utf8");

const saveApi = readFileSync(new URL("../api/save-approved-questions.ts", import.meta.url), "utf8");

const generationApi = readFileSync(new URL("../api/generate-course-questions.ts", import.meta.url), "utf8");



test("question generation is available only from the lecturer course detail", () => {

  assert.match(coursePages, /audience === "lecturer" && <CourseQuestionGeneration courseId=\{course\.id\} \/>/);

});



test("generation uses the current Supabase session and preserves the 5/10 form", () => {

  assert.ok(component.includes("supabase.auth.getSession()"));

  assert.ok(component.includes('Authorization: "Bearer " + accessToken'));

  assert.ok(component.includes('fetch("/api/generate-course-questions"'));

  assert.ok(component.includes("requestGeneratedQuestions({ courseId, topic, questionCount, difficulty }, questionCount)"));

  assert.match(component, /value=\{questionCount\}[\s\S]*?<option value=\{5\}>5 questions<\/option>[\s\S]*?<option value=\{10\}>10 questions<\/option>/);

  assert.match(component, /value=\{difficulty\}[\s\S]*?<option value="easy">Easy<\/option>[\s\S]*?<option value="medium">Medium<\/option>[\s\S]*?<option value="hard">Hard<\/option>/);

});



test("review shows each question, four options, answer, explanation, and human-readable page citation", () => {

  assert.ok(component.includes("drafts.map((draft, questionIndex)"));

  assert.ok(component.includes("question.options.map((option, optionIndex)"));

  assert.ok(component.includes("Correct answer"));

  assert.ok(component.includes("question.explanation"));

  const citationMarkup = component.match(/<li className="course-question-citation"[\s\S]*?>([\s\S]*?)<\/li>/)?.[1];

  assert.ok(citationMarkup, "citation markup should be present");

  assert.ok(citationMarkup.includes('materialTitles[source.source_id.toLowerCase()] || "Course material"'));

  assert.ok(citationMarkup.includes("Page {source.page_number}"));

  assert.doesNotMatch(citationMarkup, /extraction version|source \{source\.source_id\}/i);

  assert.ok(component.includes("New questions are selected by default"));

});



test("selection defaults on and only selected, validated drafts are posted for saving", () => {

  assert.ok(component.includes("selected: true"));
  assert.ok(component.includes("selected: event.target.checked"));

  assert.ok(component.includes("drafts?.filter((draft) => draft.selected)"));

  assert.ok(component.includes("selectedDrafts.map((draft) => validateDraftQuestion(draft.question))"));

  assert.ok(component.includes("JSON.stringify({ courseId, questions: approvedQuestions })"));

  assert.ok(component.includes("selectedCount === 0 || selectedBusy"));

  assert.ok(component.includes("Select at least one question to enable saving"));

  assert.ok(component.includes("Save ${selectedCount} selected question"));

});



test("removing a question changes only local temporary review state", () => {

  const removeDraft = component.slice(component.indexOf("function removeDraft"), component.indexOf("async function saveApprovedQuestions"));

  assert.ok(removeDraft.includes("setDrafts((current) => current?.filter((draft) => draft.id !== draftId)"));

  assert.doesNotMatch(removeDraft, /fetch\(|\.from\(|save-approved-questions/);

});



test("regeneration requests one question with the same course, topic, difficulty, and current question hint", () => {

  const regenerate = component.slice(component.indexOf("async function regenerateQuestion"), component.indexOf("function beginEdit"));

  assert.ok(regenerate.includes("courseId,"));

  assert.ok(regenerate.includes("topic,"));

  assert.ok(regenerate.includes("questionCount: 1"));

  assert.ok(regenerate.includes("difficulty,"));

  assert.ok(regenerate.includes("avoidQuestion: draft.question.question"));

  assert.ok(regenerate.includes("requestGeneratedQuestions"));

  assert.ok(regenerate.includes("question: replacement"));

  assert.doesNotMatch(regenerate, /questions\.push|setDrafts\(\(current\) => \[\.\.\.current/);

  assert.ok(regenerate.includes("regeneratingIds.current.has(draftId)"));

});



test("failed regeneration leaves the original question and citations in place", () => {

  const regenerate = component.slice(component.indexOf("async function regenerateQuestion"), component.indexOf("function beginEdit"));

  const catchBlock = regenerate.slice(regenerate.indexOf("} catch (requestError)"));

  assert.ok(catchBlock.includes("regenerationError: errorMessage(requestError)"));

  assert.ok(catchBlock.includes("regenerating: false"));

  assert.doesNotMatch(catchBlock, /question:/);

  assert.ok(component.includes("The existing question is unchanged."));

});



test("editing validates content before applying and retains the source tuple unchanged", () => {

  assert.ok(component.includes("function validateDraftQuestion(question: GeneratedQuestion)"));

  assert.ok(component.includes("validateGeneratedQuestions({ questions: [question] }, 1, pages)"));

  assert.ok(component.includes("validateDraftQuestion({ ...draft.editDraft, sources: draft.question.sources })"));

  assert.ok(component.includes("Apply changes"));

  assert.ok(component.includes("Check the question, four distinct options, correct answer, and explanation"));
  assert.ok(component.includes("draft.editDraft !== null || draft.regenerating"));
  assert.ok(component.includes("selectedCount === 0 || selectedBusy"));

});



test("save endpoint keeps authentication and course ownership and accepts only one through ten validated rows", () => {

  assert.ok(saveApi.includes("dependencies.authenticate(accessToken)"));

  assert.ok(saveApi.includes("dependencies.ownsCourse(caller, rawBody.courseId)"));

  assert.ok(saveApi.includes("value.questions.length < 1"));

  assert.ok(saveApi.includes("value.questions.length > 10"));

  assert.ok(saveApi.includes("validateGeneratedQuestions(value, questions.length as QuestionCount, pages)"));

});



test("regeneration remains on the existing endpoint and source tuples are server-validated", () => {

  assert.ok(generationApi.includes("value.questionCount !== 1"));

  assert.ok(generationApi.includes("avoidQuestion"));

  assert.ok(generationApi.includes("dependencies.reserveGenerationSlot(caller, input.courseId)"));

  assert.ok(generationApi.includes("validateGeneratedQuestions(generated, input.questionCount, pages)"));

  assert.doesNotMatch(generationApi, /from ["']\.\/save-approved-questions/);

});
