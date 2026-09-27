import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const maxPdfBytes = 20 * 1024 * 1024;
const maxExtractedBytes = 5 * 1024 * 1024;
const sourceIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ProcessableSource = { id: string; course_material_id: string; status: string };
type SourceMaterial = { storage_path: string; file_name: string; mime_type: string; file_size: number };

export type CourseSourceProcessorDependencies = {
  getOwnedSource(sourceId: string): Promise<ProcessableSource | null>;
  getMaterial(materialId: string): Promise<SourceMaterial | null>;
  getExtraction(sourceId: string): Promise<boolean>;
  claimSource(sourceId: string, expectedStatus: string): Promise<boolean>;
  downloadPdf(storagePath: string): Promise<Uint8Array>;
  completeSource(sourceId: string, extractedText: string): Promise<void>;
  failSource(sourceId: string, message: string): Promise<void>;
};

export class CourseSourceRequestError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
    this.name = "CourseSourceRequestError";
  }
}

class ProcessingFailure extends Error {}

function isPdfHeader(bytes: Uint8Array) {
  return new TextDecoder().decode(bytes.slice(0, 1024)).includes("%PDF-");
}

export async function extractPdfText(pdfBytes: Uint8Array): Promise<string> {
  let destroyLoadingTask: (() => Promise<void>) | undefined;
  try {
    const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const loadingTask = getDocument({
      data: new Uint8Array(pdfBytes),
      isEvalSupported: false,
      useSystemFonts: true,
    });
    destroyLoadingTask = () => loadingTask.destroy();

    const pdf = await loadingTask.promise;
    const pages: string[] = [];
    const textEncoder = new TextEncoder();
    let extractedByteCount = 0;
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const pieces: string[] = [];
      for (const item of content.items) {
        if (!("str" in item)) continue;
        const separator = item.hasEOL ? "\n" : " ";
        extractedByteCount += textEncoder.encode(item.str).byteLength + separator.length;
        if (extractedByteCount > maxExtractedBytes) {
          throw new ProcessingFailure("This PDF contains more text than the current 5 MB source limit. Split it into smaller course materials and try again.");
        }
        pieces.push(item.str, separator);
      }
      pages.push(pieces.join("").replace(/[ \t]+\n/g, "\n").trim());
      await page.cleanup();
    }
    return pages.filter(Boolean).join("\n\n").trim();
  } catch (error) {
    if (error instanceof ProcessingFailure) throw error;
    throw new ProcessingFailure("Unable to initialize or read this PDF. Check that it is valid and is not password protected, then try again.");
  } finally {
    await destroyLoadingTask?.();
  }
}

export async function processCourseSource(
  sourceId: string,
  dependencies: CourseSourceProcessorDependencies,
) {
  const source = await dependencies.getOwnedSource(sourceId);
  if (!source) {
    throw new CourseSourceRequestError("This course source was not found or you do not have access to it.", 404);
  }

  const alreadyExtracted = await dependencies.getExtraction(source.id);
  if (source.status === "ready" && alreadyExtracted) {
    return { status: "ready" as const, alreadyProcessed: true };
  }
  if (source.status === "processing") {
    throw new CourseSourceRequestError("This source is already being processed. Refresh the course materials shortly.", 409);
  }
  if (!["pending", "failed", "ready"].includes(source.status)) {
    throw new CourseSourceRequestError("This source cannot be processed in its current state.", 409);
  }

  if (!(await dependencies.claimSource(source.id, source.status))) {
    throw new CourseSourceRequestError("This source changed state before processing began. Refresh the course materials and try again.", 409);
  }

  try {
    const material = await dependencies.getMaterial(source.course_material_id);
    if (!material) throw new ProcessingFailure("The course PDF is no longer available. Upload it again before retrying.");
    if (
      material.mime_type !== "application/pdf" ||
      !material.file_name.toLowerCase().endsWith(".pdf") ||
      material.file_size < 1 ||
      material.file_size > maxPdfBytes
    ) {
      throw new ProcessingFailure("This course material is not a valid PDF within the 20 MB upload limit.");
    }

    let pdfBytes: Uint8Array;
    try {
      pdfBytes = await dependencies.downloadPdf(material.storage_path);
    } catch {
      throw new ProcessingFailure("The private course PDF could not be downloaded. Check that it still exists, then try again.");
    }
    if (pdfBytes.byteLength < 1 || pdfBytes.byteLength > maxPdfBytes) {
      throw new ProcessingFailure("The stored PDF is empty or exceeds the 20 MB processing limit.");
    }
    if (!isPdfHeader(pdfBytes)) {
      throw new ProcessingFailure("The stored file does not contain a valid PDF header. Upload a valid PDF and try again.");
    }

    const extractedText = await extractPdfText(pdfBytes);
    if (!extractedText) {
      throw new ProcessingFailure("No selectable text was found. Scanned PDFs need OCR, which is not available in this processing step.");
    }
    if (new TextEncoder().encode(extractedText).byteLength > maxExtractedBytes) {
      throw new ProcessingFailure("This PDF contains more text than the current 5 MB source limit. Split it into smaller course materials and try again.");
    }

    try {
      await dependencies.completeSource(source.id, extractedText);
    } catch {
      throw new ProcessingFailure("The extracted text could not be saved. Try again, and contact support if the problem continues.");
    }
    return { status: "ready" as const, alreadyProcessed: false };
  } catch (error) {
    const message = error instanceof ProcessingFailure
      ? error.message
      : "The PDF could not be processed. Try again, and contact support if the problem continues.";
    try {
      await dependencies.failSource(source.id, message.slice(0, 2000));
    } catch {
      throw new CourseSourceRequestError("Processing failed and the failure state could not be saved. Refresh the course materials and try again.", 500);
    }
    throw new CourseSourceRequestError(message, 422);
  }
}

function createProcessorDependencies(
  userClient: SupabaseClient<any>,
  serviceClient: SupabaseClient<any>,
): CourseSourceProcessorDependencies {
  return {
    async getOwnedSource(sourceId) {
      const { data, error } = await userClient.from("course_material_sources")
        .select("id, course_material_id, status").eq("id", sourceId).maybeSingle();
      if (error) throw error;
      return data as ProcessableSource | null;
    },
    async getMaterial(materialId) {
      const { data, error } = await userClient.from("course_materials")
        .select("storage_path, file_name, mime_type, file_size").eq("id", materialId).maybeSingle();
      if (error) throw error;
      return data as SourceMaterial | null;
    },
    async getExtraction(sourceId) {
      const { data, error } = await userClient.from("course_material_extractions")
        .select("source_id").eq("source_id", sourceId).maybeSingle();
      if (error) throw error;
      return Boolean(data);
    },
    async claimSource(sourceId, expectedStatus) {
      const { data, error } = await serviceClient.from("course_material_sources")
        .update({ status: "processing", error_message: null }).eq("id", sourceId)
        .eq("status", expectedStatus).select("id").maybeSingle();
      if (error) throw error;
      return Boolean(data);
    },
    async downloadPdf(storagePath) {
      const { data, error } = await userClient.storage.from("course-materials").download(storagePath);
      if (error) throw error;
      return new Uint8Array(await data.arrayBuffer());
    },
    async completeSource(sourceId, extractedText) {
      const { error } = await serviceClient.rpc("complete_course_material_extraction", {
        p_source_id: sourceId,
        p_extracted_text: extractedText,
      });
      if (error) throw error;
    },
    async failSource(sourceId, message) {
      const { data, error } = await serviceClient.from("course_material_sources")
        .update({ status: "failed", error_message: message }).eq("id", sourceId)
        .eq("status", "processing").select("id").maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Source status changed before failure could be recorded.");
    },
  };
}

function jsonResponse(status: number, body: Record<string, unknown>) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export default {
  async fetch(request: Request) {
    if (request.method !== "POST") return jsonResponse(405, { error: "Use POST to process a course source." });
    if (Number(request.headers.get("content-length") ?? "0") > 4096) {
      return jsonResponse(413, { error: "The request is too large." });
    }

    let body: { sourceId?: unknown };
    try {
      body = await request.json() as { sourceId?: unknown };
    } catch {
      return jsonResponse(400, { error: "The request body must be valid JSON." });
    }
    if (typeof body.sourceId !== "string" || !sourceIdPattern.test(body.sourceId)) {
      return jsonResponse(400, { error: "A valid course source ID is required." });
    }

    const bearer = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!bearer) return jsonResponse(401, { error: "Sign in with an approved lecturer account to process course materials." });

    const supabaseUrl = process.env.VITE_SUPABASE_URL?.trim();
    const anonKey = process.env.VITE_SUPABASE_ANON_KEY?.trim();
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return jsonResponse(503, { error: "Server-side course processing is not configured." });
    }

    let stage = "authenticated Supabase client setup";
    try {
      const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: `Bearer ${bearer}` } },
        auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
      });

      stage = "caller session validation";
      const { data: authData, error: authError } = await userClient.auth.getUser(bearer);
      if (authError || !authData.user) {
        return jsonResponse(401, { error: "Your session is invalid or has expired. Sign in again and retry." });
      }

      stage = "server Supabase client setup";
      const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
      });

      stage = "course source processing";
      const result = await processCourseSource(body.sourceId, createProcessorDependencies(userClient, serviceClient));
      return jsonResponse(200, result);
    } catch (error) {
      if (error instanceof CourseSourceRequestError) {
        return jsonResponse(error.statusCode, { error: error.message });
      }

      const rawMessage = error instanceof Error
        ? error.name + ": " + error.message
        : "Unknown error";
      const safeMessage = [bearer, supabaseUrl, anonKey, serviceRoleKey]
        .filter((secret): secret is string => Boolean(secret))
        .reduce((message, secret) => message.replaceAll(secret, "[redacted]"), rawMessage)
        .slice(0, 500);
      console.error("[process-course-source] Request failed", { stage, error: safeMessage });
      return jsonResponse(500, { error: "Course source processing could not be completed. Try again later." });
    }
  },
};
