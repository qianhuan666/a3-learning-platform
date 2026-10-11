create table if not exists student_activity_events (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references app_users(id) on delete cascade,
  course_id uuid references courses(id) on delete set null,
  account_id uuid references user_accounts(id) on delete set null,
  portal portal_type not null default 'student',
  page_key text not null,
  action_type text not null,
  action_label text not null,
  entity_type text,
  entity_id uuid,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_activity_events_student_time
  on student_activity_events(student_id, created_at desc);

create index if not exists idx_activity_events_page_action
  on student_activity_events(page_key, action_type, created_at desc);

insert into student_activity_events
  (student_id, course_id, account_id, portal, page_key, action_type, action_label, entity_type, entity_id, payload, created_at)
select *
from (
  values
    ('00000000-0000-0000-0000-000000000101'::uuid, '00000000-0000-0000-0000-000000000301'::uuid, '00000000-0000-0000-0000-000000000111'::uuid, 'student'::portal_type, 'home', 'open_task', '继续学习', 'study_plan', '00000000-0000-0000-0000-000000001002'::uuid, '{"source":"migration_seed"}'::jsonb, now() - interval '45 minutes'),
    ('00000000-0000-0000-0000-000000000101'::uuid, '00000000-0000-0000-0000-000000000301'::uuid, '00000000-0000-0000-0000-000000000111'::uuid, 'student'::portal_type, 'profile', 'toggle_insight', '画像解读', null, null, '{"source":"migration_seed"}'::jsonb, now() - interval '40 minutes'),
    ('00000000-0000-0000-0000-000000000101'::uuid, '00000000-0000-0000-0000-000000000301'::uuid, '00000000-0000-0000-0000-000000000111'::uuid, 'student'::portal_type, 'plan', 'toggle_adjust_panel', '调整计划', null, null, '{"source":"migration_seed"}'::jsonb, now() - interval '38 minutes'),
    ('00000000-0000-0000-0000-000000000101'::uuid, '00000000-0000-0000-0000-000000000301'::uuid, '00000000-0000-0000-0000-000000000111'::uuid, 'student'::portal_type, 'resources', 'open_resource', '观看', 'learning_resource', '00000000-0000-0000-0000-000000000401'::uuid, '{"kind":"视频"}'::jsonb, now() - interval '35 minutes'),
    ('00000000-0000-0000-0000-000000000101'::uuid, '00000000-0000-0000-0000-000000000301'::uuid, '00000000-0000-0000-0000-000000000111'::uuid, 'student'::portal_type, 'tutor', 'send_message', '发送问题', 'chat_session', '00000000-0000-0000-0000-000000002001'::uuid, '{"topic":"移项"}'::jsonb, now() - interval '18 minutes'),
    ('00000000-0000-0000-0000-000000000101'::uuid, '00000000-0000-0000-0000-000000000301'::uuid, '00000000-0000-0000-0000-000000000111'::uuid, 'student'::portal_type, 'report', 'switch_report_tab', '本周报告', null, null, '{"source":"migration_seed"}'::jsonb, now() - interval '10 minutes')
) as rows(student_id, course_id, account_id, portal, page_key, action_type, action_label, entity_type, entity_id, payload, created_at)
where not exists (
  select 1
  from student_activity_events
  where student_id = '00000000-0000-0000-0000-000000000101'
    and payload->>'source' = 'migration_seed'
);
