import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  InvalidQuestionOutputError,
  validateGeneratedQuestions,
  type GeneratedQuestion,
  type RetrievedCoursePage,
} from "../src/lib/course-question-validation.js";
import type { QuestionCount } from "../src/lib/course-question-types.js";

const courseIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const maxRequestBytes = 256 * 1024;
const referenceKeys = ["extraction_version", "page_number", "source_id"];

type QuestionRow = {
  course_id: string;
  question: string;
  options: string[];
  correct_answer: string;
  explanation: string;
  source_references: GeneratedQuestion["sources"];
};
type Dependencies = {
  isConfigured(): boolean;
  authenticate(accessToken: string): Promise<unknown | null>;
  ownsCourse(caller: unknown, courseId: string): Promise<boolean>;
  saveQuestions(caller: unknown, rows: QuestionRow[]): Promise<Array<{ id: string }>>;
};

export class SaveQuestionsAccessError extends Error {}

function redactDiagnosticText(value: string, sensitiveValues: string[] = [], limit = 1000) {
  let safe = value;
  for (const sensitiveValue of sensitiveValues) {
    if (sensitiveValue) safe = safe.split(sensitiveValue).join("[question content redacted]");
  }
  return safe
    .replace(/\b(authorization|proxy-authorization|cookie|set-cookie|x-goog-api-key)\s*[:=]\s*[^\r\n]+/gi, "$1: [redacted]")
    .replace(/\bbearer\s+[^\s,;]+/gi, "Bearer [redacted]")
    .replace(/\b(?:sb_(?:publishable|secret)|gsk)_[A-Za-z0-9_-]+\b/gi, "[redacted]")
    .replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, "[redacted]")
    .slice(0, limit);
}

function safeDiagnosticError(error: unknown, sensitiveValues: string[] = []) {
  if (typeof error !== "object" || error === null) {
    return { name: typeof error, message: "A non-Error value was thrown." };
  }

  const fields = error as Record<string, unknown>;
  const details: Record<string, string> = {};
  for (const field of ["name", "code", "details", "hint", "message"] as const) {
    const value = fields[field];
    if (typeof value === "string") {
      details[field] = redactDiagnosticText(value, sensitiveValues, field === "message" ? 1000 : 1500);
    }
  }
  if (!details.name) details.name = error instanceof Error ? error.name : "UnknownError";
  if (!details.message) details.message = "An error occurred without a message.";
  return details;
}

function logFailure(stage: string, error: unknown, sensitiveValues: string[] = []) {
  console.error("[save-approved-questions] Request failed", {
    stage,
    ...safeDiagnosticError(error, sensitiveValues),
  });
}

function logRejection(stage: string, reason: string) {
  console.warn("[save-approved-questions] Request rejected", { stage, reason });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function jsonResponse(status: number, body: Record<string, unknown>) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

function createValidationPages(value: unknown): RetrievedCoursePage[] {
  if (!isRecord(value)
    || typeof value.courseId !== "string"
    || !courseIdPattern.test(value.courseId)
    || !Array.isArray(value.questions)
    || value.questions.length < 1
    || value.questions.length > 10) {
    throw new Error("Invalid save request.");
  }

  const references = new Map<string, RetrievedCoursePage>();
  for (const question of value.questions) {
    if (!isRecord(question) || !Array.isArray(question.sources) || question.sources.length === 0) {
      throw new Error("Invalid source references.");
    }
    for (const reference of question.sources) {
      if (!isRecord(reference)
        || Object.keys(reference).sort().join(",") !== referenceKeys.join(",")
        || typeof reference.source_id !== "string"
        || !courseIdPattern.test(reference.source_id)
        || typeof reference.extraction_version !== "number"
        || !Number.isSafeInteger(reference.extraction_version)
        || reference.extraction_version < 1
        || typeof reference.page_number !== "number"
        || !Number.isSafeInteger(reference.page_number)
        || reference.page_number < 1) {
        throw new Error("Invalid source references.");
      }
      const key = reference.source_id.toLowerCase() + ":" + reference.extraction_version + ":" + reference.page_number;
      references.set(key, {
        course_name: "",
        source_id: reference.source_id,
        extraction_version: reference.extraction_version,
        page_number: reference.page_number,
        page_text: "Validated citation reference.",
        relevant_text: "Validated citation reference.",
      });
    }
  }
  return [...references.values()];
}

function validateRows(value: unknown, pages: RetrievedCoursePage[]): QuestionRow[] {
  const questions = (value as { questions: unknown[] }).questions;
  const validated = validateGeneratedQuestions(value, questions.length as QuestionCount, pages);
  return validated.map((question) => ({
    course_id: (value as { courseId: string }).courseId,
    question: question.question,
    options: question.options,
    correct_answer: question.correctAnswer,
    explanation: question.explanation,
    source_references: question.sources,
  }));
}

export function createSaveApprovedQuestionsHandler(dependencies: Dependencies) {
  return {
    async fetch(request: Request): Promise<Response> {
      if (request.method !== "POST") return jsonResponse(405, { error: "Use POST to save approved questions." });
      if (Number(request.headers.get("content-length") ?? "0") > maxRequestBytes) {
        logRejection("request_body_validation", "content_length_limit_exceeded");
        return jsonResponse(413, { error: "The request is too large." });
      }

      let rawBody: unknown;
      try {
        const bodyText = await request.text();
        if (new TextEncoder().encode(bodyText).byteLength > maxRequestBytes) {
          logRejection("request_body_validation", "request_body_limit_exceeded");
          return jsonResponse(413, { error: "The request is too large." });
        }
        rawBody = JSON.parse(bodyText) as unknown;
      } catch (error) {
        logFailure("request_body_validation", error);
        return jsonResponse(400, { error: "The request body must be valid JSON." });
      }
      if (!isRecord(rawBody)
        || typeof rawBody.courseId !== "string"
        || !courseIdPattern.test(rawBody.courseId)) {
        logRejection("request_body_validation", "invalid_course_id");
        return jsonResponse(400, { error: "A valid course ID is required." });
      }

      const accessToken = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
      if (!accessToken) {
        logRejection("authentication", "missing_bearer_token");
        return jsonResponse(401, { error: "Sign in with an approved lecturer account to save questions." });
      }
      if (!dependencies.isConfigured()) {
        logRejection("configuration", "server_supabase_configuration_missing");
        return jsonResponse(503, { error: "Question saving is not configured." });
      }

      let caller: unknown | null;
      try {
        caller = await dependencies.authenticate(accessToken);
      } catch (error) {
        logFailure("authentication", error, [accessToken]);
        return jsonResponse(503, { error: "Your session could not be checked. Try again." });
      }
      if (!caller) {
        logRejection("authentication", "session_invalid_or_user_missing");
        return jsonResponse(401, { error: "Your session is invalid or has expired. Sign in again." });
      }

      try {
        if (!(await dependencies.ownsCourse(caller, rawBody.courseId))) {
          logRejection("course_ownership", "lecturer_course_access_denied");
          return jsonResponse(403, { error: "You do not have lecturer access to this course." });
        }
      } catch (error) {
        logFailure("course_ownership", error, [accessToken]);
        return jsonResponse(503, { error: "Course access could not be checked. Try again." });
      }

      let pages: RetrievedCoursePage[];
      try {
        pages = createValidationPages(rawBody);
      } catch (error) {
        const stage = error instanceof Error && error.message === "Invalid save request."
          ? "request_body_validation"
          : "source_citation_validation";
        logFailure(stage, error);
        return jsonResponse(400, { error: "The questions or their source references are invalid." });
      }

      let rows: QuestionRow[];
      try {
        rows = validateRows(rawBody, pages);
      } catch (error) {
        const stage = error instanceof InvalidQuestionOutputError && /source reference/i.test(error.message)
          ? "source_citation_validation"
          : "shared_question_validation";
        logFailure(stage, error);
        return jsonResponse(400, { error: "The questions or their source references are invalid." });
      }

      try {
        const savedQuestions = await dependencies.saveQuestions(caller, rows);
        if (savedQuestions.length !== rows.length
          || savedQuestions.some((question) => typeof question.id !== "string" || !courseIdPattern.test(question.id))) {
          logRejection("supabase_insert", "unexpected_saved_question_result");
          return jsonResponse(500, { error: "Approved questions could not be saved. Try again." });
        }
        return jsonResponse(201, { savedQuestions });
      } catch (error) {
        const sensitiveValues = rows.flatMap((row) => [row.question, ...row.options, row.correct_answer, row.explanation]);
        logFailure("supabase_insert", error, [accessToken, ...sensitiveValues]);
        return jsonResponse(500, { error: "Approved questions could not be saved. Try again." });
      }
    },
  };
}

function createSupabaseCaller(token: string, url: string, anonKey: string) {
  return createClient(url, anonKey, {
    global: { headers: { Authorization: "Bearer " + token } },
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });
}

export default {
  async fetch(request: Request) {
    const supabaseUrl = process.env.VITE_SUPABASE_URL?.trim();
    const anonKey = process.env.VITE_SUPABASE_ANON_KEY?.trim();
    const configured = Boolean(supabaseUrl && anonKey);

    return createSaveApprovedQuestionsHandler({
      isConfigured: () => configured,
      async authenticate(token) {
        if (!supabaseUrl || !anonKey) return null;
        const client = createSupabaseCaller(token, supabaseUrl, anonKey);
        const { data, error } = await client.auth.getUser(token);
        if (error) logFailure("supabase_session_validation", error, [token]);
        return error || !data.user ? null : client;
      },
      async ownsCourse(caller, courseId) {
        const client = caller as SupabaseClient<any>;
        const { data, error } = await client.rpc("owns_course", { p_course_id: courseId });
        if (error) {
          if (error.code === "42501") {
            logFailure("course_ownership", error);
            return false;
          }
          throw error;
        }
        return data === true;
      },
      async saveQuestions(caller, rows) {
        const client = caller as SupabaseClient<any>;
        const { data, error } = await client.from("course_questions")
          .insert(rows)
          .select("id");
        if (error) throw error;
        return (data ?? []) as Array<{ id: string }>;
      },
    }).fetch(request);
  },
};
