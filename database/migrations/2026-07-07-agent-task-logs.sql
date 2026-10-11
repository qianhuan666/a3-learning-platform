create table if not exists agent_task_logs (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null,
  student_id uuid not null references app_users(id) on delete cascade,
  course_id uuid references courses(id) on delete set null,
  account_id uuid references user_accounts(id) on delete set null,
  agent_key text not null,
  agent_name text not null,
  step_no integer not null check (step_no > 0),
  status text not null default 'completed' check (status in ('pending', 'running', 'completed', 'failed', 'skipped')),
  input_summary text not null default '',
  output_summary text not null default '',
  suggestion text not null default '',
  confidence numeric(4,3) not null default 0.700 check (confidence >= 0 and confidence <= 1),
  duration_ms integer not null default 0 check (duration_ms >= 0),
  metadata jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (task_id, step_no)
);

create index if not exists idx_agent_task_logs_task_step on agent_task_logs(task_id, step_no);
create index if not exists idx_agent_task_logs_student_time on agent_task_logs(student_id, course_id, created_at desc);
create index if not exists idx_agent_task_logs_agent_status on agent_task_logs(agent_key, status, created_at desc);
