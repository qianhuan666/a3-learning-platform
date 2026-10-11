alter table student_learning_sessions
  add column if not exists resource_id uuid references learning_resources(id) on delete set null,
  add column if not exists goal_mode_id uuid references student_goal_modes(id) on delete set null,
  add column if not exists target_minutes integer not null default 0 check (target_minutes >= 0),
  add column if not exists completed_minutes integer not null default 0 check (completed_minutes >= 0),
  add column if not exists completion_score integer check (completion_score is null or completion_score between 0 and 100),
  add column if not exists completion_definition text not null default '达到目标时长、完成有效提问或提交练习后可标记完成',
  add column if not exists completion_reason text not null default '',
  add column if not exists outcome jsonb not null default '{}'::jsonb,
  add column if not exists completed_at timestamptz;

alter table student_learning_sessions
  drop constraint if exists student_learning_sessions_status_check;

alter table student_learning_sessions
  add constraint student_learning_sessions_status_check
  check (status in ('started', 'paused', 'completed', 'abandoned'));

create index if not exists idx_learning_sessions_status
  on student_learning_sessions(student_id, course_id, status, started_at desc);

create index if not exists idx_learning_sessions_goal
  on student_learning_sessions(goal_mode_id, status, started_at desc);

create index if not exists idx_learning_sessions_resource
  on student_learning_sessions(resource_id, status, started_at desc);

update student_learning_sessions s
set target_minutes = greatest(coalesce((s.metadata->>'minutes')::int, p.estimated_minutes, 0), 0),
    completion_definition = coalesce(nullif(s.completion_definition, ''), '达到目标时长、完成有效提问或提交练习后可标记完成')
from study_plans p
where s.study_plan_id = p.id
  and s.target_minutes = 0;

update student_learning_sessions s
set goal_mode_id = g.id
from student_goal_modes g
where s.goal_mode_id is null
  and g.student_id = s.student_id
  and g.course_id = s.course_id
  and g.is_active = true;
