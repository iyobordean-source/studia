import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  CourseSourceRequestError,
  extractPdfText,
  processCourseSource,
  default as processCourseSourceEndpoint,
} from "../api/process-course-source.ts";

const sourceId = "a1000000-0000-4000-8000-000000000001";
const materialId = "b1000000-0000-4000-8000-000000000001";
const migration = readFileSync(
  new URL("../supabase/migrations/20260927100000_course_material_extractions.sql", import.meta.url),
  "utf8",
);
const sourceMigration = readFileSync(
  new URL("../supabase/migrations/20260926160000_course_brain_source_processing.sql", import.meta.url),
  "utf8",
);
const clientSource = readFileSync(new URL("../src/CourseMaterials.tsx", import.meta.url), "utf8");
const processorSource = readFileSync(new URL("../api/process-course-source.ts", import.meta.url), "utf8");
const vercelConfig = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));

function makePdf(pages) {
  const fontId = 3 + pages.length * 2;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${pages.map((_, index) => `${3 + index * 2} 0 R`).join(" ")}] /Count ${pages.length} >>`,
  ];
  for (let index = 0; index < pages.length; index += 1) {
    const pageId = 3 + index * 2;
    const contentId = pageId + 1;
    const stream = `BT /F1 12 Tf 72 720 Td (${pages[index]}) Tj ET`;
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>`,
      `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
    );
  }
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (let index = 0; index < objects.length; index += 1) {
    offsets.push(Buffer.byteLength(pdf, "binary"));
    pdf += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(pdf, "binary");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return new Uint8Array(Buffer.from(pdf, "binary"));
}

function processorState({ status = "pending", extractedText = null, authorized = true, pdf = makePdf(["Course source text"]) } = {}) {
  const state = {
    status,
    extractedText,
    authorized,
    claimCount: 0,
    downloadCount: 0,
    completeCount: 0,
    failureMessage: null,
  };
  const dependencies = {
    async getOwnedSource(id) {
      assert.equal(id, sourceId);
      return state.authorized ? { id, course_material_id: materialId, status: state.status } : null;
    },
    async getMaterial(id) {
      assert.equal(id, materialId);
      return { storage_path: `${materialId}/file/source.pdf`, file_name: "source.pdf", mime_type: "application/pdf", file_size: pdf.byteLength };
    },
    async getExtraction() { return Boolean(state.extractedText); },
    async claimSource(id, expected) {
      assert.equal(id, sourceId);
      state.claimCount += 1;
      if (state.status !== expected) return false;
      state.status = "processing";
      return true;
    },
    async downloadPdf() {
      state.downloadCount += 1;
      return pdf;
    },
    async completeSource(id, text) {
      assert.equal(id, sourceId);
      assert.equal(state.status, "processing");
      state.completeCount += 1;
      state.extractedText = text;
      state.status = "ready";
    },
    async failSource(id, message) {
      assert.equal(id, sourceId);
      assert.equal(state.status, "processing");
      state.status = "failed";
      state.failureMessage = message;
    },
  };
  return { state, dependencies };
}

test("PDF parsing is deferred until processing so runtime import failures are contained", async () => {
  assert.doesNotMatch(processorSource, /^import\s+\{\s*getDocument\s*\}\s+from\s+["']pdfjs-dist\/legacy\/build\/pdf\.mjs["']/m);
  assert.ok(processorSource.includes('loadPdfJs = () => import("pdfjs-dist/legacy/build/pdf.mjs")'));
  assert.equal(
    vercelConfig.functions["api/process-course-source.ts"].includeFiles,
    "node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
  );
  const extracted = await extractPdfText(makePdf(["Chapter One", "Chapter Two"]));
  assert.match(extracted, /Chapter One/);
  assert.match(extracted, /Chapter Two/);
  assert.ok(extracted.indexOf("Chapter One") < extracted.indexOf("Chapter Two"));
});

test("PDF.js errors are logged for diagnostics while the extraction error stays generic", async () => {
  const privatePdfText = "PRIVATE COURSE TEXT MUST NOT APPEAR IN LOGS";
  const parserError = Object.assign(
    new Error("Setting up fake worker failed: Cannot find module './pdf.worker.mjs'. Authorization: Bearer test-secret-token"),
    { code: "ERR_MODULE_NOT_FOUND" },
  );
  const logged = [];
  const originalConsoleError = console.error;
  console.error = (...args) => logged.push(args);
  try {
    await assert.rejects(
      extractPdfText(makePdf([privatePdfText]), async () => ({
        getDocument: () => ({ promise: Promise.reject(parserError), destroy: async () => {} }),
      })),
      (error) => {
        assert.equal(error.message, "Unable to initialize or read this PDF. Check that it is valid and is not password protected, then try again.");
        return true;
      },
    );
  } finally {
    console.error = originalConsoleError;
  }

  assert.equal(logged.length, 1);
  assert.equal(logged[0][0], "[process-course-source] PDF.js extraction failed");
  const diagnostic = logged[0][1];
  assert.equal(diagnostic.name, "Error");
  assert.equal(diagnostic.message, "Setting up fake worker failed: Cannot find module './pdf.worker.mjs'. Authorization: [redacted]");
  assert.doesNotMatch(JSON.stringify(diagnostic), /test-secret-token/);
  assert.equal(diagnostic.code, "ERR_MODULE_NOT_FOUND");
  assert.doesNotMatch(JSON.stringify(diagnostic), new RegExp(privatePdfText));
});

test("a pending source moves through processing to ready and persists one extraction", async () => {
  const { state, dependencies } = processorState();
  const result = await processCourseSource(sourceId, dependencies);
  assert.deepEqual(result, { status: "ready", alreadyProcessed: false });
  assert.equal(state.status, "ready");
  assert.equal(state.completeCount, 1);
  assert.match(state.extractedText, /Course source text/);
  assert.equal(state.failureMessage, null);
});

test("a ready source with text is idempotent and is not downloaded again", async () => {
  const { state, dependencies } = processorState({ status: "ready", extractedText: "Existing source text" });
  const result = await processCourseSource(sourceId, dependencies);
  assert.deepEqual(result, { status: "ready", alreadyProcessed: true });
  assert.equal(state.claimCount, 0);
  assert.equal(state.downloadCount, 0);
  assert.equal(state.completeCount, 0);
});

test("a failed source can be retried and becomes ready", async () => {
  const { state, dependencies } = processorState({ status: "failed" });
  const result = await processCourseSource(sourceId, dependencies);
  assert.deepEqual(result, { status: "ready", alreadyProcessed: false });
  assert.equal(state.status, "ready");
  assert.equal(state.completeCount, 1);
});

test("invalid stored PDFs persist a bounded failed state and never become ready", async () => {
  const { state, dependencies } = processorState({ pdf: new Uint8Array([1, 2, 3]) });
  await assert.rejects(
    processCourseSource(sourceId, dependencies),
    (error) => error instanceof CourseSourceRequestError && error.statusCode === 422,
  );
  assert.equal(state.status, "failed");
  assert.equal(state.completeCount, 0);
  assert.match(state.failureMessage, /PDF header/);
  assert.ok(state.failureMessage.length <= 2000);
});

test("a user who cannot read the source receives no processing path", async () => {
  const { state, dependencies } = processorState({ authorized: false });
  await assert.rejects(
    processCourseSource(sourceId, dependencies),
    (error) => error instanceof CourseSourceRequestError && error.statusCode === 404,
  );
  assert.equal(state.claimCount, 0);
  assert.equal(state.downloadCount, 0);
});

test("extraction text is private to existing course participants and client writes are revoked", () => {
  assert.match(migration, /alter table public\.course_material_extractions enable row level security;\s*alter table public\.course_material_extractions force row level security;/);
  assert.match(migration, /function public\.can_read_course_material_extraction[\s\S]*?public\.owns_course\(material\.course_id\)[\s\S]*?has_active_role\('student'::public\.studia_role\)[\s\S]*?course_memberships membership/);
  assert.match(migration, /using \(public\.can_read_course_material_extraction\(source_id\)\)/);
  assert.match(migration, /revoke all on public\.course_material_extractions from public, anon, authenticated, service_role;/);
  assert.match(migration, /grant select on public\.course_material_extractions to authenticated;/);
  assert.match(migration, /on conflict \(source_id\) do update/);
  assert.match(migration, /status = 'processing'::public\.studia_course_source_status/);
  assert.match(migration, /status = 'ready'::public\.studia_course_source_status/);
  assert.match(migration, /grant execute on function public\.complete_course_material_extraction\(uuid, text\) to service_role;/);
  assert.doesNotMatch(migration, /grant\s+(insert|update|delete|all)[^;]*to authenticated/i);
  assert.doesNotMatch(sourceMigration, /create or replace function public\.complete_course_material_extraction/);
});

test("the lecturer UI exposes extraction, processing, polling, and ready states", () => {
  assert.match(clientSource, /status === "pending"[\s\S]*?status === "processing"[\s\S]*?status === "failed"/);
  assert.match(clientSource, /processMaterial\(material, sourcesByMaterial\[material\.id\]\)/);
  assert.match(clientSource, /fetch\("\/api\/process-course-source"/);
  assert.match(clientSource, /refreshCourseBrainStatuses\(materials\.map/);
  assert.match(clientSource, /window\.setTimeout\(\(\) => void poll\(\), 1500\)/);
  assert.match(clientSource, /course-material-extraction-complete/);
});

test("the HTTP endpoint rejects unauthenticated requests and contains client setup failures", async () => {
  const unauthenticated = await processCourseSourceEndpoint.fetch(new Request("https://studia.test/api/process-course-source", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sourceId }),
  }));
  assert.equal(unauthenticated.status, 401);

  const originalEnv = {
    url: process.env.VITE_SUPABASE_URL,
    anonKey: process.env.VITE_SUPABASE_ANON_KEY,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
  const originalLogger = console.error;
  process.env.VITE_SUPABASE_URL = "not a valid URL";
  process.env.VITE_SUPABASE_ANON_KEY = "public-test-key";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-test-key";
  console.error = () => {};
  try {
    const setupFailure = await processCourseSourceEndpoint.fetch(new Request("https://studia.test/api/process-course-source", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer test-token" },
      body: JSON.stringify({ sourceId }),
    }));
    assert.equal(setupFailure.status, 500);
    assert.deepEqual(await setupFailure.json(), {
      error: "Course source processing could not be completed. Try again later.",
    });
  } finally {
    if (originalEnv.url === undefined) delete process.env.VITE_SUPABASE_URL;
    else process.env.VITE_SUPABASE_URL = originalEnv.url;
    if (originalEnv.anonKey === undefined) delete process.env.VITE_SUPABASE_ANON_KEY;
    else process.env.VITE_SUPABASE_ANON_KEY = originalEnv.anonKey;
    if (originalEnv.serviceRoleKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = originalEnv.serviceRoleKey;
    console.error = originalLogger;
  }
});
test("storage, malformed PDFs, empty text, and persistence errors become failed states", async (t) => {
  await t.test("private storage download failure", async () => {
    const { state, dependencies } = processorState();
    dependencies.downloadPdf = async () => { throw new Error("storage details are private"); };
    await assert.rejects(processCourseSource(sourceId, dependencies), /private course PDF could not be downloaded/);
    assert.equal(state.status, "failed");
  });

  await t.test("malformed PDF data logs parser diagnostics and persists failed state", async () => {
    const { state, dependencies } = processorState({ pdf: new TextEncoder().encode("%PDF-1.4\ninvalid document") });
    const logs = [];
    const originalConsoleError = console.error;
    console.error = (...args) => logs.push(args);
    try {
      await assert.rejects(processCourseSource(sourceId, dependencies), /Unable to initialize or read this PDF/);
    } finally {
      console.error = originalConsoleError;
    }
    assert.equal(state.status, "failed");
    const diagnostic = logs.find(([label]) => label === "[process-course-source] PDF.js extraction failed")?.[1];
    assert.ok(diagnostic);
    assert.equal(typeof diagnostic.name, "string");
    assert.equal(typeof diagnostic.message, "string");
    assert.notEqual(diagnostic.message, "Unable to initialize or read this PDF. Check that it is valid and is not password protected, then try again.");
  });

  await t.test("PDF without selectable text", async () => {
    const { state, dependencies } = processorState({ pdf: makePdf([""]) });
    await assert.rejects(processCourseSource(sourceId, dependencies), /No selectable text was found/);
    assert.equal(state.status, "failed");
  });

  await t.test("database persistence failure", async () => {
    const { state, dependencies } = processorState();
    dependencies.completeSource = async () => { throw new Error("database details are private"); };
    await assert.rejects(processCourseSource(sourceId, dependencies), /extracted text could not be saved/);
    assert.equal(state.status, "failed");
    assert.equal(state.extractedText, null);
  });
});