create table if not exists resource_sources (
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

create table if not exists resource_ingestion_batches (
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

create table if not exists course_knowledge_points (
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

alter table learning_resources add column if not exists source_id uuid references resource_sources(id) on delete set null;
alter table learning_resources add column if not exists resource_code text;
alter table learning_resources add column if not exists status text not null default 'active';
alter table learning_resources add column if not exists published_at timestamptz;
alter table learning_resources add column if not exists updated_at timestamptz not null default now();
alter table learning_resources add column if not exists search_vector tsvector generated always as (
  to_tsvector(
    'simple',
    coalesce(title, '') || ' ' ||
    coalesce(kind, '') || ' ' ||
    coalesce(subject, '') || ' ' ||
    coalesce(difficulty, '') || ' ' ||
    coalesce(metadata->>'summary', '')
  )
) stored;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'learning_resources_status_check'
      and conrelid = 'learning_resources'::regclass
  ) then
    alter table learning_resources
      add constraint learning_resources_status_check
      check (status in ('draft', 'active', 'archived'));
  end if;
end $$;

create unique index if not exists idx_learning_resources_source_code
  on learning_resources(source_id, resource_code);

create table if not exists resource_knowledge_links (
  resource_id uuid not null references learning_resources(id) on delete cascade,
  knowledge_point_id uuid not null references course_knowledge_points(id) on delete cascade,
  link_type text not null default 'primary' check (link_type in ('primary', 'supporting', 'prerequisite', 'extension')),
  relevance numeric(4,3) not null default 0.800 check (relevance >= 0 and relevance <= 1),
  evidence text not null default '',
  created_at timestamptz not null default now(),
  primary key (resource_id, knowledge_point_id, link_type)
);

create table if not exists learning_resource_versions (
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

create table if not exists resource_chunks (
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

create table if not exists resource_distillations (
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

create table if not exists question_items (
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

create table if not exists student_question_attempts (
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

create index if not exists idx_resource_sources_type on resource_sources(source_type, trust_level desc);
create index if not exists idx_ingestion_batches_source_status on resource_ingestion_batches(source_id, status, created_at desc);
create index if not exists idx_ingestion_batches_course_status on resource_ingestion_batches(course_id, status, created_at desc);
create index if not exists idx_knowledge_points_course_order on course_knowledge_points(course_id, module, sort_order, code);
create index if not exists idx_knowledge_points_parent on course_knowledge_points(parent_id);
create index if not exists idx_resources_source_status on learning_resources(source_id, status, created_at desc);
create index if not exists idx_resources_search on learning_resources using gin(search_vector);
create index if not exists idx_resources_metadata on learning_resources using gin(metadata jsonb_path_ops);
create index if not exists idx_resource_links_knowledge on resource_knowledge_links(knowledge_point_id, link_type, relevance desc);
create index if not exists idx_resource_versions_resource on learning_resource_versions(resource_id, version_no desc);
create index if not exists idx_resource_versions_batch on learning_resource_versions(ingestion_batch_id, parse_status);
create index if not exists idx_resource_chunks_resource on resource_chunks(resource_id, chunk_no);
create index if not exists idx_resource_chunks_search on resource_chunks using gin(search_vector);
create index if not exists idx_resource_distillations_resource_course on resource_distillations(resource_id, course_id, distillation_type, status);
create index if not exists idx_question_items_course_knowledge on question_items(course_id, knowledge_point_id, difficulty_level);
create index if not exists idx_question_items_search on question_items using gin(search_vector);
create index if not exists idx_question_attempts_student_time on student_question_attempts(student_id, course_id, attempted_at desc);
create index if not exists idx_question_attempts_question on student_question_attempts(question_id, attempted_at desc);

insert into resource_sources (id, source_key, source_name, source_type, owner_label, license, trust_level, metadata)
values
  ('00000000-0000-0000-0000-000000004001', 'a3_demo_curated', 'A3 内置高数资源样例', 'internal', 'A3 demo', 'demo-only', 4, '{"scope":"seed","stage":"resource-integration"}'),
  ('00000000-0000-0000-0000-000000004002', 'future_uploads', '待接入用户上传资料', 'manual', 'student workspace', 'user-provided', 3, '{"scope":"future","accept":["pdf","pptx","docx","markdown","url"]}')
on conflict (source_key) do update set
  source_name = excluded.source_name,
  source_type = excluded.source_type,
  owner_label = excluded.owner_label,
  license = excluded.license,
  trust_level = excluded.trust_level,
  metadata = excluded.metadata,
  updated_at = now();

insert into resource_ingestion_batches (id, source_id, course_id, batch_name, status, imported_count, failed_count, started_at, finished_at, metadata)
values
  ('00000000-0000-0000-0000-000000004101', '00000000-0000-0000-0000-000000004001', '00000000-0000-0000-0000-000000000301', '高等数学 A 演示资源整理', 'completed', 6, 0, now() - interval '2 days', now() - interval '2 days' + interval '18 minutes', '{"operator":"seed","note":"prepare resource integration tables"}')
on conflict (id) do update set
  status = excluded.status,
  imported_count = excluded.imported_count,
  failed_count = excluded.failed_count,
  metadata = excluded.metadata,
  updated_at = now();

insert into course_knowledge_points (id, course_id, code, title, description, module, difficulty_level, importance, tags, sort_order)
values
  ('00000000-0000-0000-0000-000000004201', '00000000-0000-0000-0000-000000000301', 'MATH-A-INT-001', '二重积分换元', '理解直角坐标与极坐标换元、积分区域改写和雅可比因子。', '多元函数积分', 4, 5, '["二重积分","换元","极坐标"]', 10),
  ('00000000-0000-0000-0000-000000004202', '00000000-0000-0000-0000-000000000301', 'MATH-A-LA-001', '特征值与特征向量', '理解矩阵作用下方向不变、特征方程和基础求解步骤。', '线性代数迁移', 3, 4, '["线性代数","特征值"]', 20),
  ('00000000-0000-0000-0000-000000004203', '00000000-0000-0000-0000-000000000301', 'MATH-A-PROB-001', '概率密度函数', '掌握连续型随机变量密度、积分概率和归一化条件。', '概率统计衔接', 3, 4, '["概率统计","密度函数"]', 30)
on conflict (course_id, code) do update set
  title = excluded.title,
  description = excluded.description,
  module = excluded.module,
  difficulty_level = excluded.difficulty_level,
  importance = excluded.importance,
  tags = excluded.tags,
  sort_order = excluded.sort_order,
  updated_at = now();

update learning_resources
set source_id = '00000000-0000-0000-0000-000000004001',
    status = 'active',
    updated_at = now(),
    published_at = coalesce(published_at, created_at)
where source_id is null;

update learning_resources
set resource_code = case id
  when '00000000-0000-0000-0000-000000000401' then 'A3-DEMO-RES-001'
  when '00000000-0000-0000-0000-000000000402' then 'A3-DEMO-RES-002'
  when '00000000-0000-0000-0000-000000000403' then 'A3-DEMO-RES-003'
  when '00000000-0000-0000-0000-000000000404' then 'A3-DEMO-RES-004'
  when '00000000-0000-0000-0000-000000000405' then 'A3-DEMO-RES-005'
  when '00000000-0000-0000-0000-000000000406' then 'A3-DEMO-RES-006'
  else resource_code
end,
metadata = metadata || jsonb_build_object('integrationReady', true)
where id in (
  '00000000-0000-0000-0000-000000000401',
  '00000000-0000-0000-0000-000000000402',
  '00000000-0000-0000-0000-000000000403',
  '00000000-0000-0000-0000-000000000404',
  '00000000-0000-0000-0000-000000000405',
  '00000000-0000-0000-0000-000000000406'
);

insert into resource_knowledge_links (resource_id, knowledge_point_id, link_type, relevance, evidence)
values
  ('00000000-0000-0000-0000-000000000401', '00000000-0000-0000-0000-000000004201', 'primary', 0.960, '资源标题和讲解内容直接覆盖二重积分换元。'),
  ('00000000-0000-0000-0000-000000000402', '00000000-0000-0000-0000-000000004201', 'primary', 0.930, '专项练习用于巩固积分区域刻画。'),
  ('00000000-0000-0000-0000-000000000403', '00000000-0000-0000-0000-000000004202', 'primary', 0.880, '速记资源覆盖特征值和特征向量。'),
  ('00000000-0000-0000-0000-000000000404', '00000000-0000-0000-0000-000000004203', 'supporting', 0.820, '错题练习关联概率密度函数和积分概率。')
on conflict (resource_id, knowledge_point_id, link_type) do update set
  relevance = excluded.relevance,
  evidence = excluded.evidence;

insert into learning_resource_versions (id, resource_id, source_id, ingestion_batch_id, version_no, content_uri, content_type, content_length, language, parse_status, raw_metadata)
values
  ('00000000-0000-0000-0000-000000004301', '00000000-0000-0000-0000-000000000401', '00000000-0000-0000-0000-000000004001', '00000000-0000-0000-0000-000000004101', 1, 'demo://resources/double-integral-change-of-variables', 'text/markdown', 760, 'zh-CN', 'parsed', '{"source":"seed"}'),
  ('00000000-0000-0000-0000-000000004302', '00000000-0000-0000-0000-000000000402', '00000000-0000-0000-0000-000000004001', '00000000-0000-0000-0000-000000004101', 1, 'demo://resources/double-integral-practice', 'application/json', 540, 'zh-CN', 'parsed', '{"source":"seed"}')
on conflict (resource_id, version_no) do update set
  source_id = excluded.source_id,
  ingestion_batch_id = excluded.ingestion_batch_id,
  content_uri = excluded.content_uri,
  content_type = excluded.content_type,
  content_length = excluded.content_length,
  parse_status = excluded.parse_status,
  raw_metadata = excluded.raw_metadata;

insert into resource_chunks (resource_id, version_id, chunk_no, heading, body, token_count, page_ref, metadata)
values
  ('00000000-0000-0000-0000-000000000401', '00000000-0000-0000-0000-000000004301', 1, '为什么要换元', '二重积分换元的核心不是把字母替换掉，而是用更合适的坐标描述同一个积分区域。圆形、扇形、半径约束明显时，极坐标常常能简化积分限。', 58, 'section-1', '{"difficulty":"basic"}'),
  ('00000000-0000-0000-0000-000000000401', '00000000-0000-0000-0000-000000004301', 2, '雅可比因子', '从直角坐标换到极坐标时，面积微元由 dxdy 变为 r dr dθ。漏掉 r 是本知识点最常见错误。', 46, 'section-2', '{"mistake":"missing-jacobian"}'),
  ('00000000-0000-0000-0000-000000000402', '00000000-0000-0000-0000-000000004302', 1, '练习目标', '本组练习重点检查积分区域边界、半径范围、角度范围和面积微元四个环节。', 32, 'item-group', '{"questionCount":8}')
on conflict (version_id, chunk_no) do update set
  heading = excluded.heading,
  body = excluded.body,
  token_count = excluded.token_count,
  page_ref = excluded.page_ref,
  metadata = excluded.metadata;

insert into resource_distillations (resource_id, course_id, version_id, distillation_type, status, content, confidence, model_name, prompt_version)
values
  ('00000000-0000-0000-0000-000000000401', '00000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-000000004301', 'summary', 'ready', '{"summary":"讲解二重积分换元的区域重写、坐标选择和雅可比因子。","useFor":["tutor_context","recommendation"],"risk":["漏掉 r","积分限照搬"]}', 0.900, 'seed-rule', 'v1'),
  ('00000000-0000-0000-0000-000000000401', '00000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-000000004301', 'misconceptions', 'ready', '{"items":["把换元理解成符号替换","漏掉雅可比因子","未重新判断角度范围"]}', 0.860, 'seed-rule', 'v1'),
  ('00000000-0000-0000-0000-000000000402', '00000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-000000004302', 'practice_plan', 'ready', '{"steps":["先画区域","再定坐标","最后检查面积微元"],"targetAccuracy":82}', 0.830, 'seed-rule', 'v1')
on conflict (resource_id, course_id, distillation_type) do update set
  version_id = excluded.version_id,
  status = excluded.status,
  content = excluded.content,
  confidence = excluded.confidence,
  model_name = excluded.model_name,
  prompt_version = excluded.prompt_version,
  updated_at = now();

insert into question_items (id, resource_id, course_id, knowledge_point_id, question_type, stem, answer, solution, difficulty_level, estimated_minutes, metadata)
values
  ('00000000-0000-0000-0000-000000004401', '00000000-0000-0000-0000-000000000402', '00000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-000000004201', 'calculation', '把区域 x^2 + y^2 <= 4, x >= 0 改写为极坐标积分区域。', '-pi/2 <= theta <= pi/2, 0 <= r <= 2', '右半圆对应角度从 -pi/2 到 pi/2，半径从 0 到 2，面积微元为 r dr dtheta。', 3, 6, '{"source":"seed","checks":["angle","radius","jacobian"]}'),
  ('00000000-0000-0000-0000-000000004402', '00000000-0000-0000-0000-000000000403', '00000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-000000004202', 'calculation', '若 A v = 3v，说明 v 相对矩阵 A 的作用有什么性质？', '方向不变，只按 3 倍缩放。', '特征向量在矩阵作用后仍落在同一方向上，特征值 3 表示缩放倍数。', 2, 4, '{"source":"seed","checks":["concept"]}')
on conflict (id) do update set
  resource_id = excluded.resource_id,
  knowledge_point_id = excluded.knowledge_point_id,
  stem = excluded.stem,
  answer = excluded.answer,
  solution = excluded.solution,
  difficulty_level = excluded.difficulty_level,
  estimated_minutes = excluded.estimated_minutes,
  metadata = excluded.metadata,
  updated_at = now();

insert into student_question_attempts (student_id, course_id, question_id, answer_text, is_correct, score, duration_seconds, mistake_type, metadata, attempted_at)
values
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-000000004401', '0 <= theta <= pi, 0 <= r <= 2', false, 45, 210, 'angle_range', '{"source":"seed","feedsReport":true}', now() - interval '1 day')
on conflict do nothing;
