alter table study_plans
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create index if not exists idx_study_plans_metadata
  on study_plans using gin(metadata jsonb_path_ops);
