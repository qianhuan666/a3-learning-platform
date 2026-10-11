create table if not exists student_ui_state (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references app_users(id) on delete cascade,
  course_id uuid references courses(id) on delete cascade,
  account_id uuid references user_accounts(id) on delete set null,
  portal portal_type not null default 'student',
  page_key text not null,
  state_key text not null,
  state_value jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (student_id, course_id, portal, page_key, state_key)
);

create table if not exists student_learning_sessions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references app_users(id) on delete cascade,
  course_id uuid references courses(id) on delete set null,
  account_id uuid references user_accounts(id) on delete set null,
  study_plan_id uuid references study_plans(id) on delete set null,
  source text not null default 'home' check (source in ('home', 'plan', 'recommendation')),
  mode text not null default 'learn' check (mode in ('learn', 'review')),
  status text not null default 'started' check (status in ('started', 'completed', 'abandoned')),
  metadata jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  ended_at timestamptz
);

create table if not exists student_resource_usage (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references app_users(id) on delete cascade,
  course_id uuid references courses(id) on delete set null,
  account_id uuid references user_accounts(id) on delete set null,
  resource_id uuid not null references learning_resources(id) on delete cascade,
  action_label text not null,
  status text not null default 'opened' check (status in ('opened', 'started', 'completed', 'dismissed')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists report_exports (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references app_users(id) on delete cascade,
  course_id uuid references courses(id) on delete set null,
  account_id uuid references user_accounts(id) on delete set null,
  portal portal_type not null default 'student',
  report_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_ui_state_student_page on student_ui_state(student_id, course_id, page_key, updated_at desc);
create index if not exists idx_learning_sessions_student_time on student_learning_sessions(student_id, course_id, started_at desc);
create index if not exists idx_resource_usage_student_time on student_resource_usage(student_id, course_id, created_at desc);
create index if not exists idx_resource_usage_resource_time on student_resource_usage(resource_id, created_at desc);
create index if not exists idx_report_exports_student_time on report_exports(student_id, course_id, created_at desc);
