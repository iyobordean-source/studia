import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../supabase/migrations/20260928100000_course_brain_source_traceability.sql", import.meta.url),
  "utf8",
);
const processor = readFileSync(new URL("../api/process-course-source.ts", import.meta.url), "utf8");
const extractionMigration = readFileSync(
  new URL("../supabase/migrations/20260927100000_course_material_extractions.sql", import.meta.url),
  "utf8",
);
const sourceMigration = readFileSync(
  new URL("../supabase/migrations/20260926160000_course_brain_source_processing.sql", import.meta.url),
  "utf8",
);
const materialMigration = readFileSync(
  new URL("../supabase/migrations/20260926140000_course_materials_foundation.sql", import.meta.url),
  "utf8",
);

test("extraction records are versioned and page text references the exact source version", () => {
  assert.match(migration, /add column extraction_version integer not null default 1/);
  assert.match(migration, /primary key \(source_id, extraction_version\)/);
  assert.match(migration, /create table public\.course_material_extraction_pages/);
  assert.match(
    migration,
    /foreign key \(source_id, extraction_version\)[\s\S]*?references public\.course_material_extractions \(source_id, extraction_version\)[\s\S]*?on delete cascade/,
  );
  assert.match(migration, /page_number integer not null/);
  assert.match(migration, /check \(page_number > 0\)/);
  assert.match(migration, /on delete cascade/);
  assert.match(processor, /page_number: pageNumber, extracted_text: pageText/);
  assert.match(processor, /p_pages: pages/);
});

test("page source records use existing participant access and no client write grants", () => {
  assert.match(
    migration,
    /alter table public\.course_material_extraction_pages enable row level security;\s*alter table public\.course_material_extraction_pages force row level security;/,
  );
  assert.match(
    migration,
    /using \(public\.can_read_course_material_extraction\(source_id\)\)/,
  );
  assert.match(
    migration,
    /revoke all on public\.course_material_extraction_pages from public, anon, authenticated, service_role;\s*grant select on public\.course_material_extraction_pages to authenticated;/,
  );
  assert.doesNotMatch(migration, /grant (?:insert|update|delete|all)[^;]* to authenticated/i);
});

test("only the service-role completion RPC writes versioned pages and marks the source ready atomically", () => {
  assert.doesNotMatch(migration, /drop function public\.complete_course_material_extraction\(uuid, text\);/);
  assert.match(migration, /create or replace function public\.complete_course_material_extraction\([\s\S]*?p_extracted_text text[\s\S]*?auth\.role\(\) is distinct from 'service_role'/);
  assert.match(migration, /Keep the two-argument overload[\s\S]*?deployed and verified in production/);
  const legacyRpc = migration.slice(
    migration.indexOf("create or replace function public.complete_course_material_extraction("),
    migration.indexOf("-- The new processor uses this overload"),
  );
  assert.match(legacyRpc, /max\(extraction\.extraction_version\), 0\)/);
  assert.doesNotMatch(legacyRpc, /insert into public\.course_material_extraction_pages/);
  assert.match(legacyRpc, /max\(extraction\.extraction_version\), 0\)[\s\S]*?if v_extraction_version = 0 then[\s\S]*?values \(p_source_id, 1, p_extracted_text\)/);
  assert.doesNotMatch(legacyRpc, /max\(extraction\.extraction_version\), 0\) \+ 1/);
  assert.match(
    legacyRpc,
    /select extraction\.extracted_text[\s\S]*?extraction_version = v_extraction_version[\s\S]*?if v_existing_text is distinct from p_extracted_text then[\s\S]*?raise exception[\s\S]*?end if;/,
  );
  assert.ok(
    legacyRpc.indexOf('if v_existing_text is distinct from p_extracted_text then')
      < legacyRpc.indexOf("status = 'ready'::public.studia_course_source_status"),
    'legacy completion must reject mismatched evidence before marking the source ready',
  );
  assert.match(
    migration,
    /create function public\.complete_course_material_extraction\([\s\S]*?p_pages jsonb[\s\S]*?security definer[\s\S]*?auth\.role\(\) is distinct from 'service_role'/,
  );
  assert.match(migration, /max\(extraction\.extraction_version\)[\s\S]*?\+ 1/);
  assert.match(migration, /insert into public\.course_material_extraction_pages/);
  assert.match(migration, /status = 'ready'::public\.studia_course_source_status/);
  assert.match(migration, /grant execute on function public\.complete_course_material_extraction\(uuid, text, jsonb\) to service_role;/);
  assert.match(migration, /v_joined_page_text is distinct from p_extracted_text/);
});
test("material replacement and deletion cannot orphan extraction evidence", () => {
  assert.match(materialMigration, /course_id uuid not null references public\.courses \(id\) on delete cascade/);
  assert.match(sourceMigration, /course_material_id uuid not null unique[\s\S]*?references public\.course_materials \(id\) on delete cascade/);
  assert.match(extractionMigration, /source_id uuid primary key[\s\S]*?references public\.course_material_sources \(id\) on delete cascade/);
  assert.match(migration, /foreign key \(source_id, extraction_version\)[\s\S]*?on delete cascade/);
});
