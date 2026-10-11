delete from account_portal_permissions where portal in ('teacher', 'parent');
delete from account_user_links where account_id in (
  '00000000-0000-0000-0000-000000000211',
  '00000000-0000-0000-0000-000000000221'
);
delete from user_accounts where username in ('teacher_demo', 'parent_demo');
delete from teacher_class_links where teacher_id = '00000000-0000-0000-0000-000000000201';
delete from parent_student_links where parent_id = '00000000-0000-0000-0000-000000000202';
delete from app_users where id in (
  '00000000-0000-0000-0000-000000000201',
  '00000000-0000-0000-0000-000000000202'
);

update study_plans set source = 'manual' where source in ('teacher', 'parent');
delete from intervention_suggestions where audience in ('teacher', 'parent');
update sync_events set actor_role = 'student' where actor_role in ('teacher', 'parent');

create table if not exists student_goal_modes (
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

create table if not exists student_goal_milestones (
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

create unique index if not exists idx_goal_modes_one_active on student_goal_modes(student_id, course_id) where is_active;
create index if not exists idx_goal_modes_student_course on student_goal_modes(student_id, course_id, is_active desc, updated_at desc);
create index if not exists idx_goal_milestones_mode_order on student_goal_milestones(mode_id, sort_order, due_date);

insert into student_goal_modes (id, student_id, course_id, mode_key, title, focus_label, description, success_metric, target_date, weekly_hours, progress, is_active, metrics)
values
  ('00000000-0000-0000-0000-000000003001', '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000301', 'course_mastery', '课程掌握', '稳住 GPA', '围绕高等数学 A 的知识结构、作业表现和阶段测评，持续补齐薄弱模块。', '期末成绩 85+，章节掌握度 80%+', current_date + interval '42 days', 7.0, 62, true, '{"primaryMetric":"章节掌握度","risk":"积分区域刻画","nextReview":"2026-06-24"}'),
  ('00000000-0000-0000-0000-000000003002', '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000301', 'exam_sprint', '考试冲刺', '阶段提分', '压缩复习路径，把高频题型、错题模式和限时训练放到优先级最高。', '两周内模拟卷正确率 82%+', current_date + interval '18 days', 9.5, 48, false, '{"primaryMetric":"限时正确率","risk":"线代概念辨析","nextReview":"2026-06-22"}'),
  ('00000000-0000-0000-0000-000000003003', '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000301', 'research_project', '科研项目', '方法迁移', '把数学工具迁移到建模、论文阅读和小型实验复现，强调可交付成果。', '完成 1 篇论文复现笔记和 1 个建模实验', current_date + interval '60 days', 6.5, 35, false, '{"primaryMetric":"项目交付度","risk":"实验设计不稳定","nextReview":"2026-06-28"}'),
  ('00000000-0000-0000-0000-000000003004', '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000301', 'career_skill', '职业能力', '求职准备', '把课程能力转化为可展示的项目、面试题表达和数据分析基础能力。', '整理 3 个作品集案例和 20 道面试题', current_date + interval '75 days', 5.0, 28, false, '{"primaryMetric":"作品集完成度","risk":"表达结构不足","nextReview":"2026-07-02"}')
on conflict (student_id, course_id, mode_key) do update set
  title = excluded.title,
  focus_label = excluded.focus_label,
  description = excluded.description,
  success_metric = excluded.success_metric,
  target_date = excluded.target_date,
  weekly_hours = excluded.weekly_hours,
  progress = excluded.progress,
  metrics = excluded.metrics,
  updated_at = now();

insert into student_goal_milestones (mode_id, title, detail, due_date, status, weight, sort_order)
values
  ('00000000-0000-0000-0000-000000003001', '完成二重积分换元专题', '覆盖极坐标换元、区域拆分和雅可比因子检查。', current_date + interval '7 days', 'active', 3, 1),
  ('00000000-0000-0000-0000-000000003001', '章节综合测评达到 80%', '使用阶段测评验证积分与级数模块掌握度。', current_date + interval '14 days', 'pending', 2, 2),
  ('00000000-0000-0000-0000-000000003002', '建立高频题型清单', '按题型、错误原因和解题模板整理冲刺清单。', current_date + interval '3 days', 'active', 2, 1),
  ('00000000-0000-0000-0000-000000003002', '完成一次限时模拟', '记录用时、正确率和未掌握题型。', current_date + interval '8 days', 'pending', 3, 2),
  ('00000000-0000-0000-0000-000000003003', '选定建模实验主题', '把多元函数或概率统计知识迁移到一个可复现实验。', current_date + interval '10 days', 'pending', 2, 1),
  ('00000000-0000-0000-0000-000000003003', '输出论文阅读卡片', '记录问题、方法、公式假设和可复现实验入口。', current_date + interval '18 days', 'pending', 2, 2),
  ('00000000-0000-0000-0000-000000003004', '整理数学能力项目描述', '把课程训练转写为作品集中的问题、方法和结果。', current_date + interval '12 days', 'pending', 2, 1),
  ('00000000-0000-0000-0000-000000003004', '完成数据分析面试题组', '围绕概率、线代和模型评估整理 20 道问答。', current_date + interval '21 days', 'pending', 2, 2)
on conflict do nothing;
