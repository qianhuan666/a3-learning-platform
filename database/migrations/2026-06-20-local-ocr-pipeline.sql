create table if not exists resource_ocr_jobs (
  id uuid primary key default gen_random_uuid(),
  resource_id uuid not null references learning_resources(id) on delete cascade,
  version_id uuid references learning_resource_versions(id) on delete cascade,
  engine text not null,
  status text not null default 'queued' check (status in ('queued', 'running', 'completed', 'failed', 'cancelled')),
  page_start integer check (page_start is null or page_start > 0),
  page_end integer check (page_end is null or page_end > 0),
  processed_pages integer not null default 0 check (processed_pages >= 0),
  total_pages integer not null default 0 check (total_pages >= 0),
  output_chunk_count integer not null default 0 check (output_chunk_count >= 0),
  average_confidence numeric(5,2),
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_resource_ocr_jobs_resource_status
  on resource_ocr_jobs(resource_id, status, created_at desc);

create index if not exists idx_resource_ocr_jobs_version
  on resource_ocr_jobs(version_id, created_at desc);
