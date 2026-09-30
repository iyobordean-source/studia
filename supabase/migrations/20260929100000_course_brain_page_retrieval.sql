-- Bounded PostgreSQL full-text search segments for canonical course page evidence.
-- Search segments are derived and never replace course_material_extraction_pages.extracted_text.

create table public.course_material_extraction_search_segments (
  source_id uuid not null,
  extraction_version integer not null,
  page_number integer not null,
  segment_number integer not null,
  search_text text not null,
  constraint course_material_extraction_search_segments_pkey
    primary key (source_id, extraction_version, page_number, segment_number),
  constraint course_material_extraction_search_segments_page_fkey
    foreign key (source_id, extraction_version, page_number)
    references public.course_material_extraction_pages
      (source_id, extraction_version, page_number)
    on delete cascade,
  constraint course_material_extraction_search_segments_number_positive
    check (segment_number > 0),
  constraint course_material_extraction_search_segments_text_length
    check (
      pg_catalog.char_length(search_text) between 1 and 16384
      and pg_catalog.octet_length(search_text) between 1 and 65536
    )
);

comment on table public.course_material_extraction_search_segments is
  'Bounded overlapping search text derived from canonical page evidence; retains the exact source, version, and page key.';
comment on column public.course_material_extraction_search_segments.search_text is
  'A bounded search segment only. The parent page row remains the canonical complete extracted text.';

alter table public.course_material_extraction_search_segments enable row level security;
alter table public.course_material_extraction_search_segments force row level security;

create policy course_material_extraction_search_segments_read_participants
on public.course_material_extraction_search_segments
for select
to authenticated
using (public.can_read_course_material_extraction(source_id));

revoke all on public.course_material_extraction_search_segments from public, anon, authenticated, service_role;
grant select on public.course_material_extraction_search_segments to authenticated;

-- Overlap segments by 2,048 characters so a search term at a boundary remains searchable.
-- A 16,384-character segment is at most 64 KiB in UTF-8, well below PostgreSQL's
-- 1 MiB tsvector limit, while the page text itself remains complete and unchanged.
create function public.split_course_material_page_search_text(p_text text)
returns table (segment_number integer, search_text text)
language plpgsql
immutable
strict
set search_path = ''
as $$
declare
  v_start integer := 1;
  v_text_length integer := pg_catalog.char_length(p_text);
  v_segment_number integer := 1;
  v_segment_chars constant integer := 16384;
  v_overlap_chars constant integer := 2048;
begin
  while v_start <= v_text_length loop
    return query
    select v_segment_number, pg_catalog.substr(p_text, v_start, v_segment_chars);

    exit when v_start + v_segment_chars > v_text_length;
    v_start := v_start + v_segment_chars - v_overlap_chars;
    v_segment_number := v_segment_number + 1;
  end loop;
end;
$$;

revoke all on function public.split_course_material_page_search_text(text) from public, anon, authenticated, service_role;

-- Keep the derived search representation synchronized for new or changed canonical pages.
create function public.sync_course_material_extraction_search_segments()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    delete from public.course_material_extraction_search_segments
    where source_id = old.source_id
      and extraction_version = old.extraction_version
      and page_number = old.page_number;
  end if;

  delete from public.course_material_extraction_search_segments
  where source_id = new.source_id
    and extraction_version = new.extraction_version
    and page_number = new.page_number;

  insert into public.course_material_extraction_search_segments (
    source_id,
    extraction_version,
    page_number,
    segment_number,
    search_text
  )
  select
    new.source_id,
    new.extraction_version,
    new.page_number,
    segment.segment_number,
    segment.search_text
  from public.split_course_material_page_search_text(new.extracted_text) segment;

  return new;
end;
$$;

revoke all on function public.sync_course_material_extraction_search_segments() from public, anon, authenticated, service_role;

-- Backfill pages that may already exist when this migration is applied.
insert into public.course_material_extraction_search_segments (
  source_id,
  extraction_version,
  page_number,
  segment_number,
  search_text
)
select
  page.source_id,
  page.extraction_version,
  page.page_number,
  segment.segment_number,
  segment.search_text
from public.course_material_extraction_pages page
cross join lateral public.split_course_material_page_search_text(page.extracted_text) segment
on conflict (source_id, extraction_version, page_number, segment_number)
do update set search_text = excluded.search_text;

create index course_material_extraction_search_segments_search_idx
  on public.course_material_extraction_search_segments using gin (
    pg_catalog.to_tsvector(
      'pg_catalog.english'::pg_catalog.regconfig,
      search_text
    )
  );

create trigger course_material_pages_sync_search_segments
after insert or update on public.course_material_extraction_pages
for each row execute function public.sync_course_material_extraction_search_segments();

-- One row per lecturer bounds endpoint calls without a separate rate-limit service.
create table public.course_question_generation_limits (
  user_id uuid primary key
    references public.profiles (user_id) on delete cascade,
  window_started_at timestamptz not null,
  request_count integer not null,
  constraint course_question_generation_limits_count_valid
    check (request_count between 1 and 5)
);

alter table public.course_question_generation_limits enable row level security;
revoke all on public.course_question_generation_limits from public, anon, authenticated, service_role;

create function public.reserve_course_question_generation(p_course_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_window constant interval := interval '1 minute';
  v_max_requests constant integer := 5;
  v_request_count integer;
begin
  if v_user_id is null or not public.owns_course(p_course_id) then
    raise exception 'Active course-owner lecturer access is required.' using errcode = '42501';
  end if;

  insert into public.course_question_generation_limits as limits (
    user_id,
    window_started_at,
    request_count
  )
  values (v_user_id, v_now, 1)
  on conflict (user_id) do update
    set window_started_at = case
          when limits.window_started_at + v_window <= v_now then v_now
          else limits.window_started_at
        end,
        request_count = case
          when limits.window_started_at + v_window <= v_now then 1
          else limits.request_count + 1
        end
    where limits.window_started_at + v_window <= v_now
       or limits.request_count < v_max_requests
  returning limits.request_count into v_request_count;

  return found;
end;
$$;

revoke all on function public.reserve_course_question_generation(uuid) from public, anon, authenticated, service_role;
grant execute on function public.reserve_course_question_generation(uuid) to authenticated;

create function public.retrieve_course_material_pages(
  p_course_id uuid,
  p_query text,
  p_limit integer default 8
)
returns table (
  course_name text,
  source_id uuid,
  extraction_version integer,
  page_number integer,
  page_text text,
  relevant_text text
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_search text := pg_catalog.btrim(coalesce(p_query, ''));
  v_query pg_catalog.tsquery;
begin
  if auth.uid() is null or not public.owns_course(p_course_id) then
    raise exception 'Active course-owner lecturer access is required.' using errcode = '42501';
  end if;
  if pg_catalog.char_length(v_search) not between 2 and 200 then
    raise exception 'Search text must contain between 2 and 200 characters.' using errcode = '22023';
  end if;
  if p_limit is null or p_limit not between 1 and 12 then
    raise exception 'Result limit must be between 1 and 12.' using errcode = '22023';
  end if;

  v_query := pg_catalog.websearch_to_tsquery(
    'pg_catalog.english'::pg_catalog.regconfig,
    v_search
  );
  if pg_catalog.numnode(v_query) = 0 then
    return;
  end if;

  return query
  with matching_segments as (
    select
      course.name as match_course_name,
      page.source_id as match_source_id,
      page.extraction_version as match_extraction_version,
      page.page_number as match_page_number,
      pg_catalog.ts_rank_cd(
        pg_catalog.to_tsvector(
          'pg_catalog.english'::pg_catalog.regconfig,
          segment.search_text
        ),
        v_query
      ) as match_rank,
      pg_catalog.ts_headline(
        'pg_catalog.english'::pg_catalog.regconfig,
        segment.search_text,
        v_query,
        'StartSel=[[, StopSel=]], MaxFragments=3, MaxWords=80, MinWords=20, FragmentDelimiter= ... '
      ) as match_relevant_text,
      pg_catalog.row_number() over (
        partition by page.source_id, page.extraction_version, page.page_number
        order by
          pg_catalog.ts_rank_cd(
            pg_catalog.to_tsvector(
              'pg_catalog.english'::pg_catalog.regconfig,
              segment.search_text
            ),
            v_query
          ) desc,
          segment.segment_number
      ) as match_segment_rank
    from public.course_material_extraction_search_segments segment
    join public.course_material_extraction_pages page
      on page.source_id = segment.source_id
     and page.extraction_version = segment.extraction_version
     and page.page_number = segment.page_number
    join public.course_material_extractions extraction
      on extraction.source_id = page.source_id
     and extraction.extraction_version = page.extraction_version
    join public.course_material_sources source
      on source.id = page.source_id
    join public.course_materials material
      on material.id = source.course_material_id
    join public.courses course
      on course.id = material.course_id
    where material.course_id = p_course_id
      and source.status = 'ready'::public.studia_course_source_status
      and extraction.extraction_version = (
        select pg_catalog.max(latest.extraction_version)
        from public.course_material_extractions latest
        where latest.source_id = source.id
      )
      and pg_catalog.to_tsvector(
        'pg_catalog.english'::pg_catalog.regconfig,
        segment.search_text
      ) @@ v_query
  ),
  best_page_matches as (
    select
      match.match_course_name,
      match.match_source_id,
      match.match_extraction_version,
      match.match_page_number,
      match.match_rank,
      match.match_relevant_text
    from matching_segments match
    where match.match_segment_rank = 1
  )
  select
    best.match_course_name,
    best.match_source_id,
    best.match_extraction_version,
    best.match_page_number,
    page.extracted_text,
    best.match_relevant_text
  from best_page_matches best
  join public.course_material_extraction_pages page
    on page.source_id = best.match_source_id
   and page.extraction_version = best.match_extraction_version
   and page.page_number = best.match_page_number
  order by
    best.match_rank desc,
    best.match_source_id,
    best.match_page_number
  limit p_limit;
end;
$$;

revoke all on function public.retrieve_course_material_pages(uuid, text, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.retrieve_course_material_pages(uuid, text, integer)
  to authenticated;
