alter type plan_source add value if not exists 'system';

create table if not exists account_sessions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references user_accounts(id) on delete cascade,
  token_hash text not null unique,
  user_agent text not null default '',
  ip_address inet,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index if not exists idx_account_sessions_active
  on account_sessions(account_id, expires_at)
  where revoked_at is null;

create table if not exists student_course_enrollments (
  student_id uuid not null references app_users(id) on delete cascade,
  course_id uuid not null references courses(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'archived')),
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (student_id, course_id)
);

create unique index if not exists idx_student_course_default
  on student_course_enrollments(student_id)
  where is_default and status = 'active';

insert into student_course_enrollments (student_id, course_id, is_default)
select distinct student_id, course_id, true
from study_plans
where student_id is not null and course_id is not null
on conflict (student_id, course_id) do nothing;

insert into student_course_enrollments (student_id, course_id, is_default)
select distinct student_id, course_id, false
from learning_metric_daily
where student_id is not null and course_id is not null
on conflict (student_id, course_id) do nothing;

alter table study_plans
  add column if not exists resource_id uuid references learning_resources(id) on delete set null;

create index if not exists idx_study_plans_resource
  on study_plans(student_id, course_id, resource_id, plan_date);

alter table student_learning_sessions
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists last_active_at timestamptz;

alter table report_exports
  add column if not exists period_start date,
  add column if not exists period_end date,
  add column if not exists generated_from text not null default 'server';
