create table if not exists chat_sessions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references app_users(id) on delete cascade,
  course_id uuid references courses(id) on delete set null,
  title text not null,
  status text not null default 'active' check (status in ('active', 'archived')),
  summary text not null default '',
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table chat_messages
  add column if not exists session_id uuid references chat_sessions(id) on delete cascade,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create table if not exists chat_guidance_steps (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references chat_sessions(id) on delete cascade,
  step_no integer not null check (step_no > 0),
  title text not null,
  body text not null,
  hint text not null default '',
  created_at timestamptz not null default now(),
  unique (session_id, step_no)
);

create table if not exists chat_action_logs (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references chat_sessions(id) on delete cascade,
  student_id uuid not null references app_users(id) on delete cascade,
  course_id uuid references courses(id) on delete set null,
  action_type text not null check (action_type in ('explain_again', 'similar_question', 'still_confused', 'clear_history', 'load_more')),
  action_label text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_chat_sessions_student_time on chat_sessions(student_id, status, last_message_at desc);
create index if not exists idx_chat_messages_session_time on chat_messages(session_id, created_at);
create index if not exists idx_chat_messages_student_time on chat_messages(student_id, created_at);
create index if not exists idx_chat_guidance_steps_session on chat_guidance_steps(session_id, step_no);
create index if not exists idx_chat_action_logs_session_time on chat_action_logs(session_id, created_at desc);

insert into chat_sessions (id, student_id, course_id, title, summary, last_message_at, created_at)
values
  ('00000000-0000-0000-0000-000000002001', '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000301', '移项为什么变号', '围绕等式性质和相反运算进行引导', now() - interval '17 minutes', now() - interval '18 minutes'),
  ('00000000-0000-0000-0000-000000002002', '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000301', '应用题如何找等量关系', '从关键词和数量关系入手', now() - interval '1 day', now() - interval '1 day'),
  ('00000000-0000-0000-0000-000000002003', '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000301', '去括号法则', '复习括号前符号变化', now() - interval '2 days', now() - interval '2 days')
on conflict (id) do update
set title = excluded.title,
    summary = excluded.summary,
    status = 'active',
    last_message_at = excluded.last_message_at,
    updated_at = now();

update chat_messages
set session_id = '00000000-0000-0000-0000-000000002001'
where session_id is null
  and student_id = '00000000-0000-0000-0000-000000000101'
  and course_id = '00000000-0000-0000-0000-000000000301';

insert into chat_messages (id, session_id, student_id, course_id, role, content, metadata, created_at)
values
  ('00000000-0000-0000-0000-000000002101', '00000000-0000-0000-0000-000000002001', '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000301', 'student', '移项的时候为什么加号会变成减号？', '{"source":"migration"}', now() - interval '18 minutes'),
  ('00000000-0000-0000-0000-000000002102', '00000000-0000-0000-0000-000000002001', '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000301', 'assistant', '这是因为在保持等式成立的前提下，我们对等式两边做了相反的运算。我会先帮你观察等式，再找到相反运算，最后用一个小题验证。', '{"mode":"guided"}', now() - interval '17 minutes')
on conflict (id) do nothing;

insert into chat_guidance_steps (session_id, step_no, title, body, hint)
values
  ('00000000-0000-0000-0000-000000002001', 1, '观察等式', '等式两边必须保持相等。先看 x + 5 = 13，想让左边只剩 x，就要把 +5 的影响抵消掉。', '先想一想：怎样让 +5 变成 0？'),
  ('00000000-0000-0000-0000-000000002001', 2, '找相反运算', '加 5 的相反运算是减 5。左边减 5，右边也要减 5，所以右边会出现 -5。', '移项不是魔法，本质是两边同时做同一件事。'),
  ('00000000-0000-0000-0000-000000002001', 3, '尝试小题', '试一试：x + 3 = 12。你可以先在两边同时减 3，再写出 x 的值。', '答案不是重点，重点是每一步都保持等式成立。')
on conflict (session_id, step_no) do update
set title = excluded.title,
    body = excluded.body,
    hint = excluded.hint;

alter table chat_messages
  alter column session_id set not null;