create table if not exists diagnosis_questions (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses(id) on delete cascade,
  question_id uuid not null references question_items(id) on delete cascade,
  dimension_key text not null default 'knowledge',
  diagnostic_type text not null default 'initial' check (diagnostic_type in ('initial', 'checkpoint', 'review')),
  weight numeric(5,2) not null default 1.00 check (weight > 0),
  sort_order integer not null default 0,
  status text not null default 'active' check (status in ('active', 'archived')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (course_id, question_id, diagnostic_type)
);

create table if not exists diagnosis_records (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references app_users(id) on delete cascade,
  course_id uuid not null references courses(id) on delete cascade,
  account_id uuid references user_accounts(id) on delete set null,
  diagnostic_type text not null default 'initial' check (diagnostic_type in ('initial', 'checkpoint', 'review')),
  answers jsonb not null default '[]'::jsonb,
  total_questions integer not null default 0 check (total_questions >= 0),
  correct_count integer not null default 0 check (correct_count >= 0),
  total_score integer not null default 0 check (total_score between 0 and 100),
  duration_seconds integer check (duration_seconds is null or duration_seconds >= 0),
  dimension_scores jsonb not null default '{}'::jsonb,
  weak_points jsonb not null default '[]'::jsonb,
  generated_profile jsonb not null default '{}'::jsonb,
  status text not null default 'completed' check (status in ('completed', 'superseded')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_diagnosis_questions_course_status
  on diagnosis_questions(course_id, diagnostic_type, status, sort_order);

create index if not exists idx_diagnosis_questions_question
  on diagnosis_questions(question_id);

create index if not exists idx_diagnosis_records_student_time
  on diagnosis_records(student_id, course_id, diagnostic_type, created_at desc);

insert into diagnosis_questions (course_id, question_id, dimension_key, diagnostic_type, weight, sort_order, metadata)
select
  q.course_id,
  q.id,
  case
    when q.difficulty_level <= 2 then 'knowledge'
    when q.difficulty_level = 3 then 'application'
    else 'thinking'
  end,
  'initial',
  case
    when q.difficulty_level <= 2 then 1.00
    when q.difficulty_level = 3 then 1.20
    else 1.50
  end,
  row_number() over (partition by q.course_id order by q.difficulty_level, q.created_at),
  jsonb_build_object('source', 'question_items', 'seededBy', '2026-07-04-diagnosis-profile-loop')
from question_items q
where not exists (
  select 1
  from diagnosis_questions dq
  where dq.course_id = q.course_id
    and dq.question_id = q.id
    and dq.diagnostic_type = 'initial'
);
