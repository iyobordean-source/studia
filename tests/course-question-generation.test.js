import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  CourseQuestionAccessError,
  GeminiHttpError,
  GeminiRequestTimeoutError,
  createCourseQuestionHandler,
  requestGemini,
  requestGroq,
  validateGeneratedQuestions,
} from "../api/generate-course-questions.ts";

const courseId = "c1000000-0000-4000-8000-000000000001";
const sourceId = "d1000000-0000-4000-8000-000000000001";
const retrievedPage = {
  course_name: "Computer science",
  source_id: sourceId,
  extraction_version: 2,
  page_number: 4,
  page_text: "A binary search repeatedly divides an ordered search interval in half. This is the canonical complete text for page 4.",
  relevant_text: "A binary search repeatedly divides an ordered search interval in half.",
};
const retrievalMigration = readFileSync(
  new URL("../supabase/migrations/20260929100000_course_brain_page_retrieval.sql", import.meta.url),
  "utf8",
);
const traceabilityMigration = readFileSync(
  new URL("../supabase/migrations/20260928100000_course_brain_source_traceability.sql", import.meta.url),
  "utf8",
);
const apiSource = readFileSync(new URL("../api/generate-course-questions.ts", import.meta.url), "utf8");

function makeQuestions(count = 5, sources = [{ source_id: sourceId, extraction_version: 2, page_number: 4 }]) {
  return {
    questions: Array.from({ length: count }, (_, index) => ({
      question: `Question ${index + 1}?`,
      options: ["A", "B", "C", "D"],
      correctAnswer: "A",
      explanation: "The retrieved page supports this answer.",
      sources,
    })),
  };
}

function request(body, withAuth = true) {
  return new Request("https://studia.test/api/generate-course-questions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(withAuth ? { Authorization: "Bearer test-access-token" } : {}),
    },
    body: JSON.stringify(body),
  });
}

function dependencies(overrides = {}) {
  const state = { retrieved: [], generated: [], fallbackGenerated: [], authenticated: [], reserved: [], events: [] };
  return {
    state,
    isConfigured: () => true,
    async authenticate(token) {
      state.events.push("authenticate");
      state.authenticated.push(token);
      return { caller: "authenticated user" };
    },
    async retrievePages(caller, input) {
      state.events.push("retrieve");
      state.retrieved.push({ caller, input });
      return [retrievedPage];
    },
    async reserveGenerationSlot(caller, requestedCourseId) {
      state.events.push("reserve");
      state.reserved.push({ caller, courseId: requestedCourseId });
      return true;
    },
    async generate(input) {
      state.events.push("generate");
      state.generated.push(input);
      return makeQuestions(input.questionCount);
    },
    async generateFallback(input) {
      state.events.push("groq");
      state.fallbackGenerated.push(input);
      return makeQuestions(input.questionCount);
    },
    ...overrides,
  };
}

const validRequest = {
  courseId,
  topic: "binary search",
  questionCount: 5,
  difficulty: "medium",
};

test("question generation requires a signed-in user and valid bounded input", async () => {
  const deps = dependencies();
  const handler = createCourseQuestionHandler(deps);
  const unauthenticated = await handler.fetch(request(validRequest, false));
  assert.equal(unauthenticated.status, 401);
  assert.deepEqual(deps.state.authenticated, []);
  assert.deepEqual(deps.state.reserved, []);
  assert.deepEqual(deps.state.retrieved, []);
  assert.deepEqual(deps.state.fallbackGenerated, []);

  const invalid = await handler.fetch(request({ ...validRequest, questionCount: 6 }));
  assert.equal(invalid.status, 400);
  assert.deepEqual(deps.state.generated, []);
});

test("authenticated lecturer generation retrieves only through the course-authorized dependency", async () => {
  const deps = dependencies();
  const handler = createCourseQuestionHandler(deps);
  const response = await handler.fetch(request({ ...validRequest, resultLimit: 3 }));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.courseId, courseId);
  assert.equal(body.courseName, "Computer science");
  assert.equal(body.questionCount, 5);
  assert.equal(body.difficulty, "medium");
  assert.equal(body.questions.length, 5);
  assert.deepEqual(deps.state.authenticated, ["test-access-token"]);
  assert.equal(deps.state.retrieved[0].input.courseId, courseId);
  assert.equal(deps.state.retrieved[0].input.topic, "binary search");
  assert.equal(deps.state.retrieved[0].input.resultLimit, 3);
  assert.deepEqual(deps.state.reserved[0], {
    caller: { caller: "authenticated user" },
    courseId,
  });
  assert.deepEqual(deps.state.events, ["authenticate", "reserve", "retrieve", "generate"]);
  assert.equal(deps.state.generated[0].difficulty, "medium");
  assert.deepEqual(body.questions[0].sources, [
    { source_id: sourceId, extraction_version: 2, page_number: 4 },
  ]);
  assert.deepEqual(deps.state.fallbackGenerated, []);
});

test("supports ten easy questions", async () => {
  const deps = dependencies({ async generate(input) { return makeQuestions(input.questionCount); } });
  const response = await createCourseQuestionHandler(deps).fetch(request({
    ...validRequest,
    questionCount: 10,
    difficulty: "easy",
  }));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.questionCount, 10);
  assert.equal(body.difficulty, "easy");
  assert.equal(body.questions.length, 10);
});

test("a lecturer without course ownership is rejected before a slot is reserved", async () => {
  const deps = dependencies();
  deps.reserveGenerationSlot = async () => {
    deps.state.events.push("reserve");
    throw new CourseQuestionAccessError("not the owner");
  };
  const response = await createCourseQuestionHandler(deps).fetch(request(validRequest));
  assert.equal(response.status, 403);
  assert.deepEqual(deps.state.events, ["authenticate", "reserve"]);
  assert.deepEqual(deps.state.reserved, []);
  assert.deepEqual(deps.state.retrieved, []);
  assert.equal(deps.state.generated.length, 0);
});

test("empty retrieval still consumes a reserved slot", async () => {
  const deps = dependencies({
    async retrievePages() {
      deps.state.events.push("retrieve");
      return [];
    },
  });
  const response = await createCourseQuestionHandler(deps).fetch(request(validRequest));
  assert.equal(response.status, 422);
  assert.deepEqual(deps.state.events, ["authenticate", "reserve", "retrieve"]);
  assert.equal(deps.state.reserved.length, 1);
  assert.equal(deps.state.generated.length, 0);
});

test("single-question regeneration uses the authenticated generation flow and existing provider fallback", async () => {
  const deps = dependencies();
  deps.generate = async (input) => {
    deps.state.events.push("generate");
    assert.equal(input.questionCount, 1);
    assert.equal(input.avoidQuestion, "Question to replace?");
    throw new GeminiHttpError(503);
  };
  deps.generateFallback = async (input) => {
    deps.state.events.push("groq");
    assert.equal(input.questionCount, 1);
    assert.equal(input.avoidQuestion, "Question to replace?");
    return makeQuestions(1);
  };
  const response = await createCourseQuestionHandler(deps).fetch(request({
    ...validRequest,
    questionCount: 1,
    avoidQuestion: "Question to replace?",
  }));
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.questions.length, 1);
  assert.deepEqual(result.questions[0].sources, [{ source_id: sourceId, extraction_version: 2, page_number: 4 }]);
  assert.deepEqual(deps.state.events, ["authenticate", "reserve", "retrieve", "generate", "groq"]);
  assert.equal(deps.state.reserved.length, 1);
  assert.equal(deps.state.retrieved[0].input.topic, validRequest.topic);
});

test("single-question regeneration rejects citations outside retrieved course pages", async () => {
  const deps = dependencies({
    async generate() {
      return makeQuestions(1, [{ source_id: "e1000000-0000-4000-8000-000000000001", extraction_version: 2, page_number: 4 }]);
    },
  });
  const response = await createCourseQuestionHandler(deps).fetch(request({
    ...validRequest,
    questionCount: 1,
    avoidQuestion: "Question to replace?",
  }));
  assert.equal(response.status, 502);
  assert.match((await response.json()).error, /No questions were saved/);
  assert.equal(deps.state.reserved.length, 1);
});

test("single-question mode requires a bounded avoid-question reference", async () => {
  const deps = dependencies();
  const handler = createCourseQuestionHandler(deps);
  assert.equal((await handler.fetch(request({ ...validRequest, questionCount: 1 }))).status, 400);
  assert.equal((await handler.fetch(request({ ...validRequest, avoidQuestion: "not a regeneration" }))).status, 400);
  assert.equal((await handler.fetch(request({ ...validRequest, questionCount: 1, avoidQuestion: "x".repeat(2001) }))).status, 400);
  assert.deepEqual(deps.state.authenticated, []);
  assert.deepEqual(deps.state.reserved, []);
  assert.deepEqual(deps.state.retrieved, []);
});

test("generated questions must match count, four distinct options, answer, and retrieved citations", () => {
  const pages = [retrievedPage];
  assert.equal(validateGeneratedQuestions(makeQuestions(), 5, pages).length, 5);
  assert.throws(() => validateGeneratedQuestions(makeQuestions(4), 5, pages), /count is invalid/);

  const invalidOptions = makeQuestions();
  invalidOptions.questions[0].options = ["A", "A", "C", "D"];
  assert.throws(() => validateGeneratedQuestions(invalidOptions, 5, pages), /four distinct options/);

  const invalidAnswer = makeQuestions();
  invalidAnswer.questions[0].correctAnswer = "not an option";
  assert.throws(() => validateGeneratedQuestions(invalidAnswer, 5, pages), /exactly match/);

  const invalidCitation = makeQuestions(5, [{ source_id: "e1000000-0000-4000-8000-000000000001", extraction_version: 2, page_number: 4 }]);
  assert.throws(() => validateGeneratedQuestions(invalidCitation, 5, pages), /not part of retrieved context/);
});

test("malformed Gemini output fails safely and is never persisted", async () => {
  const deps = dependencies({
    async generate(input) {
      return makeQuestions(input.questionCount, [{
        source_id: "e1000000-0000-4000-8000-000000000001",
        extraction_version: 2,
        page_number: 4,
      }]);
    },
  });
  const response = await createCourseQuestionHandler(deps).fetch(request(validRequest));
  assert.equal(response.status, 502);
  assert.match((await response.json()).error, /No questions were saved/);
  assert.doesNotMatch(apiSource, /\.from\(["'](?:assessments|questions|question_drafts)["']\)/);
  assert.doesNotMatch(apiSource, /\.insert\(/);
});

test("Gemini uses stateless structured output and keeps its API key server-side", async () => {
  const expected = makeQuestions(5);
  const input = {
    ...validRequest,
    resultLimit: 8,
    courseName: retrievedPage.course_name,
    pages: [retrievedPage],
  };
  const originalFetch = globalThis.fetch;
  let capturedRequest;
  globalThis.fetch = async (url, init) => {
    capturedRequest = { url: String(url), init };
    return Response.json({
      status: "completed",
      steps: [{ type: "model_output", content: [{ type: "text", text: JSON.stringify(expected) }] }],
    });
  };
  try {
    assert.deepEqual(await requestGemini("test-only-gemini-key", input), expected);
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(capturedRequest.url, "https://generativelanguage.googleapis.com/v1beta/interactions");
  assert.equal(capturedRequest.init.headers["x-goog-api-key"], "test-only-gemini-key");
  const body = JSON.parse(capturedRequest.init.body);
  const modelInput = JSON.parse(body.input);
  assert.deepEqual(modelInput.retrievedPages[0], {
    source_id: sourceId,
    extraction_version: 2,
    page_number: 4,
    relevant_text: retrievedPage.relevant_text,
  });
  assert.equal(Object.hasOwn(modelInput.retrievedPages[0], "page_text"), false);
  assert.equal(body.store, false);
  assert.equal(body.response_format.type, "text");
  assert.equal(body.response_format.mime_type, "application/json");
  assert.equal(body.generation_config.max_output_tokens, 8192);
  assert.match(body.system_instruction, /difficulty level/);
  assert.match(body.system_instruction, /two sentences/);
});

test("single-question Gemini input includes only the question-to-avoid hint and matched grounding", async () => {
  const originalFetch = globalThis.fetch;
  let capturedRequest;
  globalThis.fetch = async (url, init) => {
    capturedRequest = { url: String(url), init };
    return Response.json({
      status: "completed",
      steps: [{ type: "model_output", content: [{ type: "text", text: JSON.stringify(makeQuestions(1)) }] }],
    });
  };
  try {
    const input = {
      ...validRequest,
      questionCount: 1,
      avoidQuestion: "Question to replace?",
      resultLimit: 8,
      courseName: retrievedPage.course_name,
      pages: [retrievedPage],
    };
    await requestGemini("test-only-gemini-key", input);
  } finally {
    globalThis.fetch = originalFetch;
  }
  const body = JSON.parse(capturedRequest.init.body);
  const modelInput = JSON.parse(body.input);
  assert.equal(modelInput.avoidQuestion, "Question to replace?");
  assert.deepEqual(modelInput.retrievedPages, [{
    source_id: sourceId,
    extraction_version: 2,
    page_number: 4,
    relevant_text: retrievedPage.relevant_text,
  }]);
  assert.match(body.system_instruction, /use the supplied question only to avoid repeating its wording or idea/);
});

test("Gemini failure diagnostics log redacted provider details without exposing them to callers", async () => {
  const originalFetch = globalThis.fetch;
  const originalConsoleError = console.error;
  const apiKey = "test-only-gemini-key";
  const logs = [];
  console.error = (...args) => logs.push(args);
  const input = {
    ...validRequest,
    resultLimit: 8,
    courseName: retrievedPage.course_name,
    pages: [retrievedPage],
  };

  try {
    globalThis.fetch = async () => Response.json({
      error: { message: "Rejected API key " + apiKey + "; Authorization: Bearer test-private-token" },
    }, { status: 403 });

    const handler = createCourseQuestionHandler(dependencies({
      async generate(geminiInput) {
        return requestGemini(apiKey, geminiInput);
      },
    }));
    const response = await handler.fetch(request(validRequest));
    const responseBody = await response.text();
    assert.equal(response.status, 502);
    assert.match(responseBody, /Question generation could not be completed/);
    assert.doesNotMatch(responseBody, /Rejected API key|test-private-token|test-only-gemini-key/);

    const httpDiagnostic = JSON.stringify(logs);
    assert.match(httpDiagnostic, /403/);
    assert.match(httpDiagnostic, /Rejected API key/);
    assert.match(httpDiagnostic, /responseBody/);
    assert.doesNotMatch(httpDiagnostic, /test-only-gemini-key|test-private-token/);

    globalThis.fetch = async () => {
      throw new TypeError("Socket unavailable for " + apiKey);
    };
    const thrownError = await requestGemini(apiKey, input).catch((error) => error);
    assert.match(thrownError.message, /Gemini request failed/);
    assert.doesNotMatch(thrownError.message, /test-only-gemini-key/);
    const thrownDiagnostic = JSON.stringify(logs);
    assert.match(thrownDiagnostic, /TypeError/);
    assert.match(thrownDiagnostic, /Socket unavailable for \[redacted\]/);
    assert.doesNotMatch(thrownDiagnostic, /test-only-gemini-key/);
  } finally {
    globalThis.fetch = originalFetch;
    console.error = originalConsoleError;
  }
});
test("incomplete Gemini interactions are rejected", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({
    status: "requires_action",
    steps: [{ type: "model_output", content: [{ type: "text", text: JSON.stringify(makeQuestions()) }] }],
  });
  try {
    await assert.rejects(requestGemini("test-only-gemini-key", {
      ...validRequest,
      resultLimit: 8,
      courseName: retrievedPage.course_name,
      pages: [retrievedPage],
    }), /incomplete or invalid response/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("retrieval is course-scoped, owner-authorized, latest-ready, and page-traceable", () => {
  assert.match(retrievalMigration, /security invoker[\s\S]*?set search_path = ''/);
  assert.match(retrievalMigration, /public\.owns_course\(p_course_id\)/);
  assert.match(retrievalMigration, /where material\.course_id = p_course_id/);
  assert.match(retrievalMigration, /source\.status = 'ready'::public\.studia_course_source_status/);
  assert.match(retrievalMigration, /max\(latest\.extraction_version\)[\s\S]*?latest\.source_id = source\.id/);
  assert.match(retrievalMigration, /page\.page_number/);
  assert.match(retrievalMigration, /page\.extracted_text/);
  assert.match(retrievalMigration, /from public\.course_material_extraction_search_segments segment/);
  assert.match(retrievalMigration, /alter table public\.course_material_extraction_search_segments force row level security/);
  assert.match(retrievalMigration, /foreign key \(source_id, extraction_version, page_number\)[\s\S]*?references public\.course_material_extraction_pages/);
  assert.match(retrievalMigration, /to_tsvector\([\s\S]*?segment\.search_text/);
  assert.match(retrievalMigration, /revoke all on function public\.retrieve_course_material_pages[\s\S]*?to authenticated/);
  assert.match(traceabilityMigration, /extracted_text text not null/);
});

test("search segments cover a 5 MiB page with bounded overlapping text", () => {
  const segmentLength = 16_384;
  const overlap = 2_048;
  const canonicalText = "x".repeat(5 * 1024 * 1024);
  const segments = [];
  for (let start = 0; start < canonicalText.length; start += segmentLength - overlap) {
    segments.push(canonicalText.slice(start, start + segmentLength));
  }
  let reconstructed = segments[0];
  for (const segment of segments.slice(1)) reconstructed += segment.slice(overlap);

  assert.ok(segments.length > 1);
  assert.ok(segments.every((segment) => segment.length <= segmentLength));
  assert.ok(segments.every((segment) => Buffer.byteLength(segment) <= 65_536));
  assert.equal(reconstructed, canonicalText);
  assert.match(retrievalMigration, /v_segment_chars constant integer := 16384/);
  assert.match(retrievalMigration, /v_overlap_chars constant integer := 2048/);
  assert.match(retrievalMigration, /page\.extracted_text,[\s\S]*?best\.match_relevant_text/);
  assert.match(retrievalMigration, /create function public\.reserve_course_question_generation/);
  assert.match(retrievalMigration, /v_max_requests constant integer := 5/);
  assert.match(retrievalMigration, /window_started_at \+ v_window <= v_now/);
  const reservationRpc = retrievalMigration.slice(
    retrievalMigration.indexOf("create function public.reserve_course_question_generation"),
    retrievalMigration.indexOf("revoke all on function public.reserve_course_question_generation"),
  );
  const ownerCheckIndex = reservationRpc.indexOf("not public.owns_course(p_course_id)");
  const insertIndex = reservationRpc.indexOf("insert into public.course_question_generation_limits");
  assert.ok(ownerCheckIndex >= 0 && insertIndex > ownerCheckIndex);
});

test("large canonical page text is preserved through retrieval validation", async () => {
  const canonicalText = "x".repeat(5 * 1024 * 1024);
  const deps = dependencies({
    async retrievePages() {
      return [{ ...retrievedPage, page_text: canonicalText }];
    },
  });
  const response = await createCourseQuestionHandler(deps).fetch(request(validRequest));
  assert.equal(response.status, 200);
  assert.equal(deps.state.generated[0].pages[0].page_text.length, canonicalText.length);
  assert.equal(deps.state.generated[0].pages[0].page_text, canonicalText);
});

test("generation limit rejects requests before Gemini and fails closed if unavailable", async () => {
  const limited = dependencies({
    async reserveGenerationSlot() {
      this.state.events.push("reserve");
      return false;
    },
  });
  const limitedResponse = await createCourseQuestionHandler(limited).fetch(request(validRequest));
  assert.equal(limitedResponse.status, 429);
  assert.deepEqual(limited.state.events, ["authenticate", "reserve"]);
  assert.deepEqual(limited.state.retrieved, []);
  assert.equal(limited.state.generated.length, 0);

  const unavailable = dependencies({
    async reserveGenerationSlot() {
      this.state.events.push("reserve");
      throw new Error("RPC unavailable");
    },
  });
  const unavailableResponse = await createCourseQuestionHandler(unavailable).fetch(request(validRequest));
  assert.equal(unavailableResponse.status, 503);
  assert.deepEqual(unavailable.state.events, ["authenticate", "reserve"]);
  assert.deepEqual(unavailable.state.retrieved, []);
  assert.equal(unavailable.state.generated.length, 0);
});

test("Gemini abort timeout still raises GeminiRequestTimeoutError from the 30-second timeout", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, init) => new Promise((_resolve, reject) => {
    init.signal.addEventListener("abort", () => reject(init.signal.reason), { once: true });
  });
  try {
    await assert.rejects(requestGemini("test-only-gemini-key", {
      ...validRequest,
      resultLimit: 8,
      courseName: retrievedPage.course_name,
      pages: [retrievedPage],
    }, 5), GeminiRequestTimeoutError);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Gemini fallback classification: timeout and transient HTTP call Groq; success and non-transient errors do not", async () => {
  // 1. A Gemini client-side timeout is transient and falls back to Groq.
  const timedOut = dependencies({
    async generate(input) {
      this.state.events.push("generate");
      this.state.generated.push(input);
      throw new GeminiRequestTimeoutError();
    },
  });
  const timeoutResponse = await createCourseQuestionHandler(timedOut).fetch(request(validRequest));
  assert.equal(timeoutResponse.status, 200);
  assert.equal((await timeoutResponse.json()).questions.length, 5);
  assert.deepEqual(timedOut.state.events, ["authenticate", "reserve", "retrieve", "generate", "groq"]);
  assert.equal(timedOut.state.fallbackGenerated.length, 1);
  assert.deepEqual(timedOut.state.fallbackGenerated[0], timedOut.state.generated[0]);

  // 2. A transient Gemini HTTP error still falls back to Groq.
  const unavailable = dependencies({
    async generate(input) {
      this.state.events.push("generate");
      this.state.generated.push(input);
      throw new GeminiHttpError(503);
    },
  });
  const unavailableResponse = await createCourseQuestionHandler(unavailable).fetch(request(validRequest));
  assert.equal(unavailableResponse.status, 200);
  assert.deepEqual(unavailable.state.events, ["authenticate", "reserve", "retrieve", "generate", "groq"]);
  assert.equal(unavailable.state.fallbackGenerated.length, 1);

  // 3. A successful Gemini response never calls Groq.
  const succeeded = dependencies();
  const successResponse = await createCourseQuestionHandler(succeeded).fetch(request(validRequest));
  assert.equal(successResponse.status, 200);
  assert.deepEqual(succeeded.state.events, ["authenticate", "reserve", "retrieve", "generate"]);
  assert.deepEqual(succeeded.state.fallbackGenerated, []);

  // 4. A non-transient Gemini error never calls Groq.
  const rejected = dependencies({
    async generate(input) {
      this.state.events.push("generate");
      this.state.generated.push(input);
      throw new GeminiHttpError(401);
    },
  });
  const rejectedResponse = await createCourseQuestionHandler(rejected).fetch(request(validRequest));
  assert.equal(rejectedResponse.status, 502);
  assert.match((await rejectedResponse.json()).error, /could not be completed/);
  assert.ok(!rejected.state.events.includes("groq"));
  assert.deepEqual(rejected.state.fallbackGenerated, []);
});

test("a Gemini timeout without a fallback dependency keeps the safe 504 response", async () => {
  const handlerDependencies = dependencies({
    async generate() { throw new GeminiRequestTimeoutError(); },
    generateFallback: undefined,
  });
  const response = await createCourseQuestionHandler(handlerDependencies).fetch(request(validRequest));
  assert.equal(response.status, 504);
  assert.match((await response.json()).error, /took too long/);
  assert.deepEqual(handlerDependencies.state.fallbackGenerated, []);
});

test("the server endpoint authenticates with the caller token and reads Gemini credentials only from server env", () => {
  assert.match(apiSource, /const geminiRequestTimeoutMs = 30_000/);
  assert.match(apiSource, /process\.env\.GEMINI_API_KEY/);
  assert.match(apiSource, /process\.env\.GROQ_API_KEY/);
  assert.doesNotMatch(apiSource, /VITE_GROQ_API_KEY/);
  assert.match(apiSource, /client\.auth\.getUser\(token\)/);
  assert.match(apiSource, /client\.rpc\("retrieve_course_material_pages"/);
  assert.match(apiSource, /client\.rpc\("reserve_course_question_generation"/);
  assert.match(apiSource, /"x-goog-api-key": apiKey/);
  assert.doesNotMatch(apiSource, /VITE_GEMINI_API_KEY/);
  assert.doesNotMatch(apiSource, /SUPABASE_SERVICE_ROLE_KEY/);
});
for (const status of [429, 500, 502, 503, 504]) {
  test("Gemini HTTP " + status + " uses Groq with the same retrieved context", async () => {
    const deps = dependencies({
      async generate(input) {
        this.state.events.push("generate");
        this.state.generated.push(input);
        throw new GeminiHttpError(status);
      },
    });
    const response = await createCourseQuestionHandler(deps).fetch(request(validRequest));
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.questions.length, 5);
    assert.deepEqual(deps.state.events, ["authenticate", "reserve", "retrieve", "generate", "groq"]);
    assert.deepEqual(deps.state.fallbackGenerated[0], deps.state.generated[0]);
    assert.deepEqual(body.questions[0].sources, [
      { source_id: sourceId, extraction_version: 2, page_number: 4 },
    ]);
  });
}

test("non-transient Gemini HTTP and request failures do not call Groq", async () => {
  for (const failure of [
    new GeminiHttpError(401),
    new GeminiHttpError(403),
    new TypeError("Gemini request could not be started."),
  ]) {
    const deps = dependencies({
      async generate() { throw failure; },
    });
    const response = await createCourseQuestionHandler(deps).fetch(request(validRequest));
    assert.equal(response.status, 502);
    assert.match((await response.json()).error, /could not be completed/);
    assert.deepEqual(deps.state.fallbackGenerated, []);
  }

  const unconfigured = dependencies({ isConfigured: () => false });
  const unavailable = await createCourseQuestionHandler(unconfigured).fetch(request(validRequest));
  assert.equal(unavailable.status, 503);
  assert.deepEqual(unconfigured.state.fallbackGenerated, []);
});

test("Groq uses the same grounded input and strict question schema as Gemini", async () => {
  const input = {
    ...validRequest,
    resultLimit: 8,
    courseName: retrievedPage.course_name,
    pages: [retrievedPage],
  };
  const expected = makeQuestions();
  const originalFetch = globalThis.fetch;
  const captured = [];
  globalThis.fetch = async (url, init) => {
    captured.push({ url: String(url), init });
    if (String(url).includes("generativelanguage.googleapis.com")) {
      return Response.json({
        status: "completed",
        steps: [{ type: "model_output", content: [{ type: "text", text: JSON.stringify(expected) }] }],
      });
    }
    return Response.json({
      choices: [{ message: { content: JSON.stringify(expected) } }],
    });
  };
  try {
    await requestGemini("test-gemini-key", input);
    assert.deepEqual(await requestGroq("test-groq-key", input), expected);
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(captured.length, 2);
  const geminiBody = JSON.parse(captured[0].init.body);
  const groqBody = JSON.parse(captured[1].init.body);
  assert.equal(captured[1].url, "https://api.groq.com/openai/v1/chat/completions");
  assert.equal(captured[1].init.headers.Authorization, "Bearer test-groq-key");
  assert.equal(groqBody.model, "openai/gpt-oss-120b");
  assert.deepEqual(groqBody.messages, [
    { role: "system", content: geminiBody.system_instruction },
    { role: "user", content: geminiBody.input },
  ]);
  assert.equal(groqBody.response_format.type, "json_schema");
  assert.equal(groqBody.response_format.json_schema.strict, true);
  assert.deepEqual(JSON.parse(groqBody.messages[1].content).retrievedPages[0], {
    source_id: sourceId,
    extraction_version: 2,
    page_number: 4,
    relevant_text: retrievedPage.relevant_text,
  });
  assert.equal(Object.hasOwn(JSON.parse(groqBody.messages[1].content).retrievedPages[0], "page_text"), false);

  const visit = (schema) => {
    if (Array.isArray(schema)) {
      for (const item of schema) visit(item);
      return;
    }
    if (!schema || typeof schema !== "object") return;
    if (schema.type === "object") {
      assert.equal(schema.additionalProperties, false);
      assert.deepEqual([...schema.required].sort(), Object.keys(schema.properties).sort());
    }
    for (const child of Object.values(schema)) visit(child);
  };
  visit(groqBody.response_format.json_schema.schema);
});

test("Groq output uses the existing validator and invalid fallback output stays generic", async () => {
  const invalidGroqOutput = makeQuestions(5, [{
    source_id: "e1000000-0000-4000-8000-000000000001",
    extraction_version: 2,
    page_number: 4,
  }]);
  const deps = dependencies({
    async generate() { throw new GeminiHttpError(503); },
    async generateFallback(input) {
      this.state.events.push("groq");
      this.state.fallbackGenerated.push(input);
      return invalidGroqOutput;
    },
  });
  const response = await createCourseQuestionHandler(deps).fetch(request(validRequest));
  assert.equal(response.status, 502);
  const body = await response.json();
  assert.equal(body.error, "Question generation could not be completed. Try again later.");
  assert.doesNotMatch(body.error, /source_id|Gemini returned/);
  assert.throws(
    () => validateGeneratedQuestions(invalidGroqOutput, 5, [retrievedPage]),
    /not part of retrieved context/,
  );
});

test("failed Gemini and Groq responses remain generic and never log provider keys", async () => {
  const originalFetch = globalThis.fetch;
  const originalConsoleError = console.error;
  const geminiKey = "test-only-gemini-key";
  const groqKey = "gsk_" + "x".repeat(48);
  const logs = [];
  console.error = (...args) => logs.push(args);
  globalThis.fetch = async (url) => {
    if (String(url).includes("generativelanguage.googleapis.com")) {
      return new Response(
        "Rejected " + geminiKey + " and " + groqKey + "; Authorization: Bearer test-access-secret",
        { status: 503 },
      );
    }
    return new Response(
      "Rejected " + groqKey + "; Authorization: Bearer test-access-secret",
      { status: 503 },
    );
  };
  try {
    const deps = dependencies({
      async generate(input) { return requestGemini(geminiKey, input); },
      async generateFallback(input) { return requestGroq(groqKey, input); },
    });
    const response = await createCourseQuestionHandler(deps).fetch(request(validRequest));
    assert.equal(response.status, 502);
    assert.equal((await response.json()).error, "Question generation could not be completed. Try again later.");
    const diagnosticText = JSON.stringify(logs);
    assert.doesNotMatch(diagnosticText, /test-only-gemini-key|gsk_x{48}|test-access-secret/);
  } finally {
    globalThis.fetch = originalFetch;
    console.error = originalConsoleError;
  }
});

test("Groq request timeout aborts the request and cannot leak its API key", async () => {
  const originalFetch = globalThis.fetch;
  const originalConsoleError = console.error;
  const groqKey = "gsk_" + "y".repeat(48);
  const logs = [];
  console.error = (...args) => logs.push(args);
  globalThis.fetch = async (_url, init) => new Promise((_resolve, reject) => {
    init.signal.addEventListener("abort", () => reject(init.signal.reason), { once: true });
  });
  try {
    const error = await requestGroq(groqKey, {
      ...validRequest,
      courseName: retrievedPage.course_name,
      pages: [retrievedPage],
    }, 5).catch((value) => value);
    assert.match(error.message, /fallback provider could not complete/);
    assert.doesNotMatch(error.message, /gsk_y{48}/);
    assert.doesNotMatch(JSON.stringify(logs), /gsk_y{48}/);
  } finally {
    globalThis.fetch = originalFetch;
    console.error = originalConsoleError;
  }
});
