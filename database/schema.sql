create extension if not exists pgcrypto;

drop table if exists sync_events cascade;
drop table if exists student_goal_milestones cascade;
drop table if exists student_goal_modes cascade;
drop table if exists report_exports cascade;
drop table if exists agent_task_logs cascade;
drop table if exists student_resource_usage cascade;
drop table if exists student_learning_sessions cascade;
drop table if exists student_ui_state cascade;
drop table if exists student_activity_events cascade;
drop table if exists intervention_suggestions cascade;
drop table if exists learning_metric_daily cascade;
drop table if exists diagnosis_records cascade;
drop table if exists diagnosis_questions cascade;
drop table if exists student_profile_scores cascade;
drop table if exists student_question_attempts cascade;
drop table if exists chat_action_logs cascade;
drop table if exists chat_guidance_steps cascade;
drop table if exists chat_messages cascade;
drop table if exists chat_sessions cascade;
drop table if exists knowledge_mastery cascade;
drop table if exists student_resource_recommendations cascade;
drop table if exists question_items cascade;
drop table if exists resource_distillations cascade;
drop table if exists resource_ocr_jobs cascade;
drop table if exists resource_chunks cascade;
drop table if exists learning_resource_versions cascade;
drop table if exists resource_knowledge_links cascade;
drop table if exists learning_resources cascade;
drop table if exists resource_ingestion_batches cascade;
drop table if exists course_knowledge_points cascade;
drop table if exists resource_sources cascade;
drop table if exists learning_tasks cascade;
drop table if exists study_plans cascade;
drop table if exists teacher_class_links cascade;
drop table if exists parent_student_links cascade;
drop table if exists class_memberships cascade;
drop table if exists classes cascade;
drop table if exists courses cascade;
drop table if exists student_course_enrollments cascade;
drop table if exists account_sessions cascade;
drop table if exists account_portal_permissions cascade;
drop table if exists account_user_links cascade;
drop table if exists user_accounts cascade;
drop table if exists app_users cascade;

drop type if exists user_role cascade;
drop type if exists portal_type cascade;
drop type if exists plan_status cascade;
drop type if exists plan_source cascade;
drop type if exists message_role cascade;
drop type if exists suggestion_status cascade;

create type user_role as enum ('student', 'teacher', 'parent', 'advisor', 'admin', 'system');
create type portal_type as enum ('student');
create type plan_status as enum ('pending', 'active', 'done', 'skipped');
create type plan_source as enum ('manual', 'ai', 'advisor', 'system');
create type message_role as enum ('student', 'assistant', 'system');
create type suggestion_status as enum ('pending', 'accepted', 'done', 'dismissed');

create table app_users (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  role user_role not null,
  grade text,
  avatar_label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table user_accounts (
  id uuid primary key default gen_random_uuid(),
  username text not null unique,
  password_hash text not null,
  default_portal portal_type not null,
  status text not null default 'active' check (status in ('active', 'disabled')),
  last_login_at timestamptz,
  created_at timestamptz not null default now()
);

create table account_sessions (
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

create table account_user_links (
  account_id uuid not null references user_accounts(id) on delete cascade,
  user_id uuid not null references app_users(id) on delete cascade,
  relationship text not null default 'self',
  primary key (account_id, user_id)
);

create table account_portal_permissions (
  account_id uuid not null references user_accounts(id) on delete cascade,
  portal portal_type not null,
  can_read boolean not null default true,
  can_write boolean not null default false,
  can_manage boolean not null default false,
  primary key (account_id, portal)
);

create table classes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  grade text not null,
  school_year text not null,
  created_at timestamptz not null default now()
);

create table courses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  subject text not null,
  grade text not null,
  created_at timestamptz not null default now()
);

create table resource_sources (
  id uuid primary key default gen_random_uuid(),
  source_key text not null unique,
  source_name text not null,
  source_type text not null check (source_type in ('manual', 'courseware', 'open_course', 'textbook', 'paper', 'question_bank', 'web', 'internal')),
  owner_label text not null default '',
  base_uri text,
  license text,
  trust_level integer not null default 3 check (trust_level between 1 and 5),
  status text not null default 'active' check (status in ('draft', 'active', 'archived')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table resource_ingestion_batches (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references resource_sources(id) on delete set null,
  course_id uuid references courses(id) on delete set null,
  batch_name text not null,
  status text not null default 'draft' check (status in ('draft', 'running', 'completed', 'failed')),
  imported_count integer not null default 0 check (imported_count >= 0),
  failed_count integer not null default 0 check (failed_count >= 0),
  started_at timestamptz,
  finished_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table course_knowledge_points (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses(id) on delete cascade,
  parent_id uuid references course_knowledge_points(id) on delete set null,
  code text not null,
  title text not null,
  description text not null default '',
  module text not null default '',
  difficulty_level integer not null default 3 check (difficulty_level between 1 and 5),
  importance integer not null default 3 check (importance between 1 and 5),
  tags jsonb not null default '[]'::jsonb,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (course_id, code)
);

create table class_memberships (
  class_id uuid not null references classes(id) on delete cascade,
  student_id uuid not null references app_users(id) on delete cascade,
  joined_at date not null default current_date,
  primary key (class_id, student_id)
);

create table student_course_enrollments (
  student_id uuid not null references app_users(id) on delete cascade,
  course_id uuid not null references courses(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'archived')),
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (student_id, course_id)
);

create table study_plans (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references app_users(id) on delete cascade,
  course_id uuid references courses(id) on delete set null,
  plan_date date not null default current_date,
  start_time time not null,
  end_time time,
  title text not null,
  detail text not null default '',
  tag text not null default '学习任务',
  estimated_minutes integer not null check (estimated_minutes > 0),
  status plan_status not null default 'pending',
  source plan_source not null default 'manual',
  sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table learning_tasks (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references app_users(id) on delete cascade,
  course_id uuid references courses(id) on delete set null,
  study_plan_id uuid references study_plans(id) on delete set null,
  label text not null,
  done boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table learning_resources (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references resource_sources(id) on delete set null,
  resource_code text,
  title text not null,
  kind text not null,
  subject text not null,
  grade text not null,
  difficulty text,
  duration_minutes integer,
  color text not null default 'blue',
  action_label text not null default '查看',
  status text not null default 'active' check (status in ('draft', 'active', 'archived')),
  metadata jsonb not null default '{}'::jsonb,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  search_vector tsvector generated always as (
    to_tsvector(
      'simple',
      coalesce(title, '') || ' ' ||
      coalesce(kind, '') || ' ' ||
      coalesce(subject, '') || ' ' ||
      coalesce(difficulty, '') || ' ' ||
      coalesce(metadata->>'summary', '')
    )
  ) stored,
  unique (source_id, resource_code)
);

alter table study_plans
  add column resource_id uuid references learning_resources(id) on delete set null;

create table resource_knowledge_links (
  resource_id uuid not null references learning_resources(id) on delete cascade,
  knowledge_point_id uuid not null references course_knowledge_points(id) on delete cascade,
  link_type text not null default 'primary' check (link_type in ('primary', 'supporting', 'prerequisite', 'extension')),
  relevance numeric(4,3) not null default 0.800 check (relevance >= 0 and relevance <= 1),
  evidence text not null default '',
  created_at timestamptz not null default now(),
  primary key (resource_id, knowledge_point_id, link_type)
);

create table learning_resource_versions (
  id uuid primary key default gen_random_uuid(),
  resource_id uuid not null references learning_resources(id) on delete cascade,
  source_id uuid references resource_sources(id) on delete set null,
  ingestion_batch_id uuid references resource_ingestion_batches(id) on delete set null,
  version_no integer not null default 1 check (version_no > 0),
  content_uri text,
  content_type text not null default 'text/plain',
  content_checksum text,
  content_length integer check (content_length is null or content_length >= 0),
  language text not null default 'zh-CN',
  parse_status text not null default 'pending' check (parse_status in ('pending', 'parsed', 'failed')),
  raw_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (resource_id, version_no)
);

create table resource_chunks (
  id uuid primary key default gen_random_uuid(),
  resource_id uuid not null references learning_resources(id) on delete cascade,
  version_id uuid not null references learning_resource_versions(id) on delete cascade,
  chunk_no integer not null check (chunk_no > 0),
  heading text not null default '',
  body text not null,
  token_count integer check (token_count is null or token_count >= 0),
  page_ref text,
  metadata jsonb not null default '{}'::jsonb,
  search_vector tsvector generated always as (
    to_tsvector('simple', coalesce(heading, '') || ' ' || coalesce(body, ''))
  ) stored,
  created_at timestamptz not null default now(),
  unique (version_id, chunk_no)
);

create table resource_ocr_jobs (
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

create table resource_distillations (
  id uuid primary key default gen_random_uuid(),
  resource_id uuid not null references learning_resources(id) on delete cascade,
  course_id uuid not null references courses(id) on delete cascade,
  version_id uuid references learning_resource_versions(id) on delete set null,
  distillation_type text not null check (distillation_type in ('summary', 'outline', 'key_points', 'misconceptions', 'practice_plan', 'recommendation_profile', 'tutor_context')),
  status text not null default 'ready' check (status in ('draft', 'ready', 'stale', 'failed')),
  content jsonb not null default '{}'::jsonb,
  confidence numeric(4,3) not null default 0.700 check (confidence >= 0 and confidence <= 1),
  model_name text,
  prompt_version text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (resource_id, course_id, distillation_type)
);

create table student_resource_recommendations (
  student_id uuid not null references app_users(id) on delete cascade,
  resource_id uuid not null references learning_resources(id) on delete cascade,
  reason text not null,
  bucket text not null default 'recommended' check (bucket in ('recommended', 'new', 'popular', 'weakness', 'habit')),
  match_score integer not null default 80 check (match_score between 0 and 100),
  created_at timestamptz not null default now(),
  primary key (student_id, resource_id, bucket)
);

create table knowledge_mastery (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references app_users(id) on delete cascade,
  course_id uuid references courses(id) on delete cascade,
  chapter text not null,
  point_no integer not null,
  mastery_level integer not null check (mastery_level between 0 and 4),
  updated_at timestamptz not null default now(),
  unique (student_id, course_id, chapter, point_no)
);

create table chat_sessions (
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

create table chat_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references chat_sessions(id) on delete cascade,
  student_id uuid not null references app_users(id) on delete cascade,
  course_id uuid references courses(id) on delete set null,
  role message_role not null,
  content text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table chat_guidance_steps (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references chat_sessions(id) on delete cascade,
  step_no integer not null check (step_no > 0),
  title text not null,
  body text not null,
  hint text not null default '',
  created_at timestamptz not null default now(),
  unique (session_id, step_no)
);

create table chat_action_logs (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references chat_sessions(id) on delete cascade,
  student_id uuid not null references app_users(id) on delete cascade,
  course_id uuid references courses(id) on delete set null,
  action_type text not null check (action_type in ('explain_again', 'similar_question', 'still_confused', 'clear_history', 'load_more')),
  action_label text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table student_profile_scores (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references app_users(id) on delete cascade,
  course_id uuid references courses(id) on delete cascade,
  dimension_key text not null,
  label text not null,
  current_score integer not null check (current_score between 0 and 100),
  class_average integer not null check (class_average between 0 and 100),
  sort_order integer not null default 0,
  updated_at timestamptz not null default now(),
  unique (student_id, course_id, dimension_key)
);

create table question_items (
  id uuid primary key default gen_random_uuid(),
  resource_id uuid references learning_resources(id) on delete set null,
  course_id uuid not null references courses(id) on delete cascade,
  knowledge_point_id uuid references course_knowledge_points(id) on delete set null,
  question_type text not null check (question_type in ('single_choice', 'multiple_choice', 'fill_blank', 'calculation', 'proof', 'essay', 'coding')),
  stem text not null,
  answer text not null default '',
  solution text not null default '',
  difficulty_level integer not null default 3 check (difficulty_level between 1 and 5),
  estimated_minutes integer check (estimated_minutes is null or estimated_minutes > 0),
  metadata jsonb not null default '{}'::jsonb,
  search_vector tsvector generated always as (
    to_tsvector('simple', coalesce(stem, '') || ' ' || coalesce(solution, ''))
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table diagnosis_questions (
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

create table diagnosis_records (
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

create table learning_metric_daily (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references app_users(id) on delete cascade,
  course_id uuid references courses(id) on delete cascade,
  metric_date date not null,
  study_minutes integer not null default 0,
  accuracy_rate integer not null check (accuracy_rate between 0 and 100),
  completion_rate integer not null check (completion_rate between 0 and 100),
  questions_done integer not null default 0,
  mistakes_fixed integer not null default 0,
  created_at timestamptz not null default now(),
  unique (student_id, course_id, metric_date)
);

create table intervention_suggestions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid references app_users(id) on delete cascade,
  course_id uuid references courses(id) on delete cascade,
  audience portal_type not null,
  title text not null,
  summary text not null,
  action_label text not null,
  priority integer not null default 50,
  status suggestion_status not null default 'pending',
  created_at timestamptz not null default now()
);

create table sync_events (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references app_users(id) on delete cascade,
  actor_role user_role not null,
  event_type text not null,
  title text not null,
  status text not null default 'done',
  event_time timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create table student_activity_events (
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

create table student_ui_state (
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

create table student_goal_modes (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references app_users(id) on delete cascade,
  course_id uuid not null references courses(id) on delete cascade,
  mode_key text not null check (mode_key in ('course_mastery', 'exam_sprint', 'research_project', 'career_skill')),
  title text not null,
  focus_label text not null,
  description text not null,
  success_metric text not null,
  target_date date,
  weekly_hours numeric(4,1) not null default 6.0 check (weekly_hours >= 0),
  progress integer not null default 0 check (progress between 0 and 100),
  is_active boolean not null default false,
  metrics jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (student_id, course_id, mode_key)
);

create table student_goal_milestones (
  id uuid primary key default gen_random_uuid(),
  mode_id uuid not null references student_goal_modes(id) on delete cascade,
  title text not null,
  detail text not null default '',
  due_date date,
  status text not null default 'pending' check (status in ('pending', 'active', 'done', 'blocked')),
  weight integer not null default 1 check (weight > 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table student_learning_sessions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references app_users(id) on delete cascade,
  course_id uuid references courses(id) on delete set null,
  account_id uuid references user_accounts(id) on delete set null,
  study_plan_id uuid references study_plans(id) on delete set null,
  resource_id uuid references learning_resources(id) on delete set null,
  goal_mode_id uuid references student_goal_modes(id) on delete set null,
  source text not null default 'home' check (source in ('home', 'plan', 'recommendation')),
  mode text not null default 'learn' check (mode in ('learn', 'review')),
  status text not null default 'started' check (status in ('started', 'paused', 'completed', 'abandoned')),
  target_minutes integer not null default 0 check (target_minutes >= 0),
  completed_minutes integer not null default 0 check (completed_minutes >= 0),
  completion_score integer check (completion_score is null or completion_score between 0 and 100),
  completion_definition text not null default '达到目标时长、完成有效提问或提交练习后可标记完成',
  completion_reason text not null default '',
  outcome jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  ended_at timestamptz,
  updated_at timestamptz not null default now(),
  last_active_at timestamptz
);

create table student_question_attempts (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references app_users(id) on delete cascade,
  course_id uuid references courses(id) on delete set null,
  question_id uuid not null references question_items(id) on delete cascade,
  study_plan_id uuid references study_plans(id) on delete set null,
  session_id uuid references student_learning_sessions(id) on delete set null,
  answer_text text not null default '',
  is_correct boolean,
  score numeric(5,2) check (score is null or (score >= 0 and score <= 100)),
  duration_seconds integer check (duration_seconds is null or duration_seconds >= 0),
  mistake_type text,
  metadata jsonb not null default '{}'::jsonb,
  attempted_at timestamptz not null default now()
);

create table student_resource_usage (
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

create table report_exports (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references app_users(id) on delete cascade,
  course_id uuid references courses(id) on delete set null,
  account_id uuid references user_accounts(id) on delete set null,
  portal portal_type not null default 'student',
  report_type text not null,
  payload jsonb not null default '{}'::jsonb,
  period_start date,
  period_end date,
  generated_from text not null default 'server',
  created_at timestamptz not null default now()
);

create table agent_task_logs (
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

create index idx_account_sessions_active
  on account_sessions(account_id, expires_at)
  where revoked_at is null;
create index idx_account_portal_permissions_portal on account_portal_permissions(portal, can_read);
create index idx_account_user_links_user on account_user_links(user_id);
create index idx_class_memberships_student on class_memberships(student_id);
create unique index idx_student_course_default
  on student_course_enrollments(student_id)
  where is_default and status = 'active';
create index idx_resource_sources_type on resource_sources(source_type, trust_level desc);
create index idx_ingestion_batches_source_status on resource_ingestion_batches(source_id, status, created_at desc);
create index idx_ingestion_batches_course_status on resource_ingestion_batches(course_id, status, created_at desc);
create index idx_knowledge_points_course_order on course_knowledge_points(course_id, module, sort_order, code);
create index idx_knowledge_points_parent on course_knowledge_points(parent_id);
create index idx_study_plans_student_date on study_plans(student_id, plan_date, start_time);
create index idx_study_plans_resource on study_plans(student_id, course_id, resource_id, plan_date);
create index idx_study_plans_metadata on study_plans using gin(metadata jsonb_path_ops);
create index idx_learning_tasks_student_done on learning_tasks(student_id, done, sort_order);
create index idx_resources_subject_grade on learning_resources(subject, grade, kind);
create index idx_resources_source_status on learning_resources(source_id, status, created_at desc);
create index idx_resources_search on learning_resources using gin(search_vector);
create index idx_resources_metadata on learning_resources using gin(metadata jsonb_path_ops);
create index idx_resource_links_knowledge on resource_knowledge_links(knowledge_point_id, link_type, relevance desc);
create index idx_resource_versions_resource on learning_resource_versions(resource_id, version_no desc);
create index idx_resource_versions_batch on learning_resource_versions(ingestion_batch_id, parse_status);
create index idx_resource_chunks_resource on resource_chunks(resource_id, chunk_no);
create index idx_resource_chunks_search on resource_chunks using gin(search_vector);
create index idx_resource_ocr_jobs_resource_status on resource_ocr_jobs(resource_id, status, created_at desc);
create index idx_resource_ocr_jobs_version on resource_ocr_jobs(version_id, created_at desc);
create index idx_resource_distillations_resource_course on resource_distillations(resource_id, course_id, distillation_type, status);
create index idx_resource_reco_student_bucket on student_resource_recommendations(student_id, bucket, match_score desc);
create index idx_knowledge_mastery_student_course on knowledge_mastery(student_id, course_id, chapter, point_no);
create index idx_chat_sessions_student_time on chat_sessions(student_id, status, last_message_at desc);
create index idx_chat_messages_session_time on chat_messages(session_id, created_at);
create index idx_chat_messages_student_time on chat_messages(student_id, created_at);
create index idx_chat_guidance_steps_session on chat_guidance_steps(session_id, step_no);
create index idx_chat_action_logs_session_time on chat_action_logs(session_id, created_at desc);
create index idx_profile_scores_student_course on student_profile_scores(student_id, course_id, sort_order);
create index idx_question_items_course_knowledge on question_items(course_id, knowledge_point_id, difficulty_level);
create index idx_question_items_search on question_items using gin(search_vector);
create index idx_diagnosis_questions_course_status on diagnosis_questions(course_id, diagnostic_type, status, sort_order);
create index idx_diagnosis_questions_question on diagnosis_questions(question_id);
create index idx_diagnosis_records_student_time on diagnosis_records(student_id, course_id, diagnostic_type, created_at desc);
create index idx_question_attempts_student_time on student_question_attempts(student_id, course_id, attempted_at desc);
create index idx_question_attempts_question on student_question_attempts(question_id, attempted_at desc);
create index idx_metric_daily_student_course_date on learning_metric_daily(student_id, course_id, metric_date);
create index idx_intervention_student_audience on intervention_suggestions(student_id, audience, priority desc);
create index idx_sync_events_student_time on sync_events(student_id, event_time desc);
create index idx_activity_events_student_time on student_activity_events(student_id, created_at desc);
create index idx_activity_events_page_action on student_activity_events(page_key, action_type, created_at desc);
create index idx_ui_state_student_page on student_ui_state(student_id, course_id, page_key, updated_at desc);
create unique index idx_goal_modes_one_active on student_goal_modes(student_id, course_id) where is_active;
create index idx_goal_modes_student_course on student_goal_modes(student_id, course_id, is_active desc, updated_at desc);
create index idx_goal_milestones_mode_order on student_goal_milestones(mode_id, sort_order, due_date);
create index idx_learning_sessions_student_time on student_learning_sessions(student_id, course_id, started_at desc);
create index idx_learning_sessions_status on student_learning_sessions(student_id, course_id, status, started_at desc);
create index idx_learning_sessions_goal on student_learning_sessions(goal_mode_id, status, started_at desc);
create index idx_learning_sessions_resource on student_learning_sessions(resource_id, status, started_at desc);
create index idx_resource_usage_student_time on student_resource_usage(student_id, course_id, created_at desc);
create index idx_resource_usage_resource_time on student_resource_usage(resource_id, created_at desc);
create index idx_report_exports_student_time on report_exports(student_id, course_id, created_at desc);
create index idx_agent_task_logs_task_step on agent_task_logs(task_id, step_no);
create index idx_agent_task_logs_student_time on agent_task_logs(student_id, course_id, created_at desc);
create index idx_agent_task_logs_agent_status on agent_task_logs(agent_key, status, created_at desc);

create or replace view v_account_portals as
select
  a.id as account_id,
  a.username,
  a.default_portal,
  p.portal,
  p.can_read,
  p.can_write,
  p.can_manage,
  u.id as user_id,
  u.display_name,
  u.role
from user_accounts a
join account_portal_permissions p on p.account_id = a.id
join account_user_links l on l.account_id = a.id
join app_users u on u.id = l.user_id
where a.status = 'active';
