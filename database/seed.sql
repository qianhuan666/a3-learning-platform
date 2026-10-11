insert into app_users (id, display_name, role, grade, avatar_label)
values
  ('00000000-0000-0000-0000-000000000101', '李同学', 'student', '大二 · 计算机科学与技术', '李');

insert into user_accounts (id, username, password_hash, default_portal)
values
  ('00000000-0000-0000-0000-000000000111', 'student_demo', crypt('student123', gen_salt('bf')), 'student');

insert into account_user_links (account_id, user_id, relationship)
values
  ('00000000-0000-0000-0000-000000000111', '00000000-0000-0000-0000-000000000101', 'self');

insert into account_portal_permissions (account_id, portal, can_read, can_write, can_manage)
values
  ('00000000-0000-0000-0000-000000000111', 'student', true, true, false);

insert into classes (id, name, grade, school_year)
values ('00000000-0000-0000-0000-000000000501', '计算机 2401 班', '大二', '2025-2026');

insert into courses (id, name, subject, grade)
values ('00000000-0000-0000-0000-000000000301', '高等数学 A', '高等数学', '大学本科');

insert into resource_sources (id, source_key, source_name, source_type, owner_label, license, trust_level, metadata)
values
  ('00000000-0000-0000-0000-000000004001', 'a3_demo_curated', 'A3 内置高数资源样例', 'internal', 'A3 demo', 'demo-only', 4, '{"scope":"seed","stage":"resource-integration"}'),
  ('00000000-0000-0000-0000-000000004002', 'future_uploads', '待接入用户上传资料', 'manual', 'student workspace', 'user-provided', 3, '{"scope":"future","accept":["pdf","pptx","docx","markdown","url"]}');

insert into resource_ingestion_batches (id, source_id, course_id, batch_name, status, imported_count, failed_count, started_at, finished_at, metadata)
values
  ('00000000-0000-0000-0000-000000004101', '00000000-0000-0000-0000-000000004001', '00000000-0000-0000-0000-000000000301', '高等数学 A 演示资源整理', 'completed', 6, 0, now() - interval '2 days', now() - interval '2 days' + interval '18 minutes', '{"operator":"seed","note":"prepare resource integration tables"}');

insert into course_knowledge_points (id, course_id, code, title, description, module, difficulty_level, importance, tags, sort_order)
values
  ('00000000-0000-0000-0000-000000004201', '00000000-0000-0000-0000-000000000301', 'MATH-A-INT-001', '二重积分换元', '理解直角坐标与极坐标换元、积分区域改写和雅可比因子。', '多元函数积分', 4, 5, '["二重积分","换元","极坐标"]', 10),
  ('00000000-0000-0000-0000-000000004202', '00000000-0000-0000-0000-000000000301', 'MATH-A-LA-001', '特征值与特征向量', '理解矩阵作用下方向不变、特征方程和基础求解步骤。', '线性代数迁移', 3, 4, '["线性代数","特征值"]', 20),
  ('00000000-0000-0000-0000-000000004203', '00000000-0000-0000-0000-000000000301', 'MATH-A-PROB-001', '概率密度函数', '掌握连续型随机变量密度、积分概率和归一化条件。', '概率统计衔接', 3, 4, '["概率统计","密度函数"]', 30);

insert into class_memberships (class_id, student_id)
values ('00000000-0000-0000-0000-000000000501', '00000000-0000-0000-0000-000000000101');

insert into student_course_enrollments (student_id, course_id, is_default)
values ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000301', true);

insert into study_plans (id, student_id, course_id, plan_date, start_time, end_time, title, detail, tag, estimated_minutes, status, source, sort_order)
values
  ('00000000-0000-0000-0000-000000001001', '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000301', current_date, '19:00', '19:15', '复习多元函数偏导与梯度', '梳理偏导数、梯度方向和几何意义', '概念复盘', 12, 'done', 'advisor', 1),
  ('00000000-0000-0000-0000-000000001002', '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000301', current_date, '19:15', '19:35', '完成 8 道二重积分换元练习', '巩固极坐标换元与积分区域刻画', '练习任务', 18, 'active', 'ai', 2),
  ('00000000-0000-0000-0000-000000001003', '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000301', current_date, '19:35', '19:50', '线性代数特征值 3 题小测', '判断矩阵特征值与特征向量关系', '测评反馈', 15, 'pending', 'advisor', 3),
  ('00000000-0000-0000-0000-000000001004', '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000301', current_date, '19:50', '20:00', '今日总结与错题回看', '复盘积分区域和符号错误', '错题复盘', 10, 'pending', 'manual', 4);

insert into learning_tasks (student_id, course_id, study_plan_id, label, done, sort_order)
values
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-000000001001', '完成偏导与梯度概念复盘', true, 1),
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-000000001002', '完成 8 道二重积分换元题', true, 2),
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-000000001003', '订正 2 道积分区域错题', false, 3),
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-000000001004', '整理线性代数特征值笔记', false, 4);

insert into student_goal_modes (id, student_id, course_id, mode_key, title, focus_label, description, success_metric, target_date, weekly_hours, progress, is_active, metrics)
values
  ('00000000-0000-0000-0000-000000003001', '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000301', 'course_mastery', '课程掌握', '稳住 GPA', '围绕高等数学 A 的知识结构、作业表现和阶段测评，持续补齐薄弱模块。', '期末成绩 85+，章节掌握度 80%+', current_date + interval '42 days', 7.0, 62, true, '{"primaryMetric":"章节掌握度","risk":"积分区域刻画","nextReview":"2026-06-24"}'),
  ('00000000-0000-0000-0000-000000003002', '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000301', 'exam_sprint', '考试冲刺', '阶段提分', '压缩复习路径，把高频题型、错题模式和限时训练放到优先级最高。', '两周内模拟卷正确率 82%+', current_date + interval '18 days', 9.5, 48, false, '{"primaryMetric":"限时正确率","risk":"线代概念辨析","nextReview":"2026-06-22"}'),
  ('00000000-0000-0000-0000-000000003003', '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000301', 'research_project', '科研项目', '方法迁移', '把数学工具迁移到建模、论文阅读和小型实验复现，强调可交付成果。', '完成 1 篇论文复现笔记和 1 个建模实验', current_date + interval '60 days', 6.5, 35, false, '{"primaryMetric":"项目交付度","risk":"实验设计不稳定","nextReview":"2026-06-28"}'),
  ('00000000-0000-0000-0000-000000003004', '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000301', 'career_skill', '职业能力', '求职准备', '把课程能力转化为可展示的项目、面试题表达和数据分析基础能力。', '整理 3 个作品集案例和 20 道面试题', current_date + interval '75 days', 5.0, 28, false, '{"primaryMetric":"作品集完成度","risk":"表达结构不足","nextReview":"2026-07-02"}');

insert into student_goal_milestones (mode_id, title, detail, due_date, status, weight, sort_order)
values
  ('00000000-0000-0000-0000-000000003001', '完成二重积分换元专题', '覆盖极坐标换元、区域拆分和雅可比因子检查。', current_date + interval '7 days', 'active', 3, 1),
  ('00000000-0000-0000-0000-000000003001', '章节综合测评达到 80%', '使用阶段测评验证积分与级数模块掌握度。', current_date + interval '14 days', 'pending', 2, 2),
  ('00000000-0000-0000-0000-000000003002', '建立高频题型清单', '按题型、错误原因和解题模板整理冲刺清单。', current_date + interval '3 days', 'active', 2, 1),
  ('00000000-0000-0000-0000-000000003002', '完成一次限时模拟', '记录用时、正确率和未掌握题型。', current_date + interval '8 days', 'pending', 3, 2),
  ('00000000-0000-0000-0000-000000003003', '选定建模实验主题', '把多元函数或概率统计知识迁移到一个可复现实验。', current_date + interval '10 days', 'pending', 2, 1),
  ('00000000-0000-0000-0000-000000003003', '输出论文阅读卡片', '记录问题、方法、公式假设和可复现实验入口。', current_date + interval '18 days', 'pending', 2, 2),
  ('00000000-0000-0000-0000-000000003004', '整理数学能力项目描述', '把课程训练转写为作品集中的问题、方法和结果。', current_date + interval '12 days', 'pending', 2, 1),
  ('00000000-0000-0000-0000-000000003004', '完成数据分析面试题组', '围绕概率、线代和模型评估整理 20 道问答。', current_date + interval '21 days', 'pending', 2, 2);

insert into learning_resources (id, title, kind, subject, grade, difficulty, duration_minutes, color, action_label, metadata)
values
  ('00000000-0000-0000-0000-000000000401', '二重积分换元规则讲解', '视频', '高等数学', '大学本科', '基础复习', 10, 'blue', '观看', '{"stars":3}'),
  ('00000000-0000-0000-0000-000000000402', '高等数学二重积分专项练习', '练习', '高等数学', '大学本科', '自动批改', 18, 'green', '开始练习', '{"stars":3}'),
  ('00000000-0000-0000-0000-000000000403', '特征值与特征向量速记', '文档', '高等数学', '大学本科', '考前速记', 8, 'orange', '阅读', '{"stars":2}'),
  ('00000000-0000-0000-0000-000000000404', '概率密度函数错题练 10 题', '练习', '高等数学', '大学本科', '薄弱点强化', 20, 'purple', '开始练习', '{"stars":3}'),
  ('00000000-0000-0000-0000-000000000405', '高数阶段测评：积分与级数', '测评', '高等数学', '大学本科', '定位薄弱知识点', 30, 'lime', '开始测评', '{"stars":3}'),
  ('00000000-0000-0000-0000-000000000406', '梯度方向动画演示', '动画', '高等数学', '大学本科', '直观理解', 6, 'sky', '观看', '{"stars":2}');

update learning_resources
set source_id = '00000000-0000-0000-0000-000000004001',
    status = 'active',
    published_at = coalesce(published_at, created_at),
    updated_at = now(),
    metadata = metadata || jsonb_build_object('integrationReady', true),
    resource_code = case id
      when '00000000-0000-0000-0000-000000000401' then 'A3-DEMO-RES-001'
      when '00000000-0000-0000-0000-000000000402' then 'A3-DEMO-RES-002'
      when '00000000-0000-0000-0000-000000000403' then 'A3-DEMO-RES-003'
      when '00000000-0000-0000-0000-000000000404' then 'A3-DEMO-RES-004'
      when '00000000-0000-0000-0000-000000000405' then 'A3-DEMO-RES-005'
      when '00000000-0000-0000-0000-000000000406' then 'A3-DEMO-RES-006'
      else resource_code
    end
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
  ('00000000-0000-0000-0000-000000000404', '00000000-0000-0000-0000-000000004203', 'supporting', 0.820, '错题练习关联概率密度函数和积分概率。');

insert into learning_resource_versions (id, resource_id, source_id, ingestion_batch_id, version_no, content_uri, content_type, content_length, language, parse_status, raw_metadata)
values
  ('00000000-0000-0000-0000-000000004301', '00000000-0000-0000-0000-000000000401', '00000000-0000-0000-0000-000000004001', '00000000-0000-0000-0000-000000004101', 1, 'demo://resources/double-integral-change-of-variables', 'text/markdown', 760, 'zh-CN', 'parsed', '{"source":"seed"}'),
  ('00000000-0000-0000-0000-000000004302', '00000000-0000-0000-0000-000000000402', '00000000-0000-0000-0000-000000004001', '00000000-0000-0000-0000-000000004101', 1, 'demo://resources/double-integral-practice', 'application/json', 540, 'zh-CN', 'parsed', '{"source":"seed"}');

insert into resource_chunks (resource_id, version_id, chunk_no, heading, body, token_count, page_ref, metadata)
values
  ('00000000-0000-0000-0000-000000000401', '00000000-0000-0000-0000-000000004301', 1, '为什么要换元', '二重积分换元的核心不是把字母替换掉，而是用更合适的坐标描述同一个积分区域。圆形、扇形、半径约束明显时，极坐标常常能简化积分限。', 58, 'section-1', '{"difficulty":"basic"}'),
  ('00000000-0000-0000-0000-000000000401', '00000000-0000-0000-0000-000000004301', 2, '雅可比因子', '从直角坐标换到极坐标时，面积微元由 dxdy 变为 r dr dθ。漏掉 r 是本知识点最常见错误。', 46, 'section-2', '{"mistake":"missing-jacobian"}'),
  ('00000000-0000-0000-0000-000000000402', '00000000-0000-0000-0000-000000004302', 1, '练习目标', '本组练习重点检查积分区域边界、半径范围、角度范围和面积微元四个环节。', 32, 'item-group', '{"questionCount":8}');

insert into resource_distillations (resource_id, course_id, version_id, distillation_type, status, content, confidence, model_name, prompt_version)
values
  ('00000000-0000-0000-0000-000000000401', '00000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-000000004301', 'summary', 'ready', '{"summary":"讲解二重积分换元的区域重写、坐标选择和雅可比因子。","useFor":["tutor_context","recommendation"],"risk":["漏掉 r","积分限照搬"]}', 0.900, 'seed-rule', 'v1'),
  ('00000000-0000-0000-0000-000000000401', '00000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-000000004301', 'misconceptions', 'ready', '{"items":["把换元理解成符号替换","漏掉雅可比因子","未重新判断角度范围"]}', 0.860, 'seed-rule', 'v1'),
  ('00000000-0000-0000-0000-000000000402', '00000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-000000004302', 'practice_plan', 'ready', '{"steps":["先画区域","再定坐标","最后检查面积微元"],"targetAccuracy":82}', 0.830, 'seed-rule', 'v1');

insert into question_items (id, resource_id, course_id, knowledge_point_id, question_type, stem, answer, solution, difficulty_level, estimated_minutes, metadata)
values
  ('00000000-0000-0000-0000-000000004401', '00000000-0000-0000-0000-000000000402', '00000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-000000004201', 'calculation', '把区域 x^2 + y^2 <= 4, x >= 0 改写为极坐标积分区域。', '-pi/2 <= theta <= pi/2, 0 <= r <= 2', '右半圆对应角度从 -pi/2 到 pi/2，半径从 0 到 2，面积微元为 r dr dtheta。', 3, 6, '{"source":"seed","checks":["angle","radius","jacobian"]}'),
  ('00000000-0000-0000-0000-000000004402', '00000000-0000-0000-0000-000000000403', '00000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-000000004202', 'calculation', '若 A v = 3v，说明 v 相对矩阵 A 的作用有什么性质？', '方向不变，只按 3 倍缩放。', '特征向量在矩阵作用后仍落在同一方向上，特征值 3 表示缩放倍数。', 2, 4, '{"source":"seed","checks":["concept"]}');

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
  '{"source":"seed"}'::jsonb
from question_items q;

insert into student_question_attempts (student_id, course_id, question_id, answer_text, is_correct, score, duration_seconds, mistake_type, metadata, attempted_at)
values
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-000000004401', '0 <= theta <= pi, 0 <= r <= 2', false, 45, 210, 'angle_range', '{"source":"seed","feedsReport":true}', now() - interval '1 day');

insert into student_resource_recommendations (student_id, resource_id, reason, bucket, match_score)
values
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000401', '帮助你理解极坐标换元与积分区域刻画', 'recommended', 96),
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000402', '巩固积分区域拆分与变量替换', 'recommended', 91),
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000403', '复习线性代数考试高频概念', 'new', 87),
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000404', '针对近期概率题错误强化训练', 'weakness', 84),
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000405', '检测本章掌握情况，定位薄弱知识点', 'popular', 82),
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000406', '用动态图理解方向导数与梯度关系', 'habit', 80);

insert into student_profile_scores (student_id, course_id, dimension_key, label, current_score, class_average, sort_order)
values
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000301', 'knowledge', '课程知识掌握', 82, 73, 1),
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000301', 'application', '解题应用能力', 64, 66, 2),
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000301', 'thinking', '数学抽象能力', 70, 62, 3),
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000301', 'efficiency', '复习效率', 76, 68, 4),
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000301', 'attitude', '学习自律', 78, 70, 5),
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000301', 'input', '学习投入', 82, 72, 6);

insert into learning_metric_daily (student_id, course_id, metric_date, study_minutes, accuracy_rate, completion_rate, questions_done, mistakes_fixed)
values
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000301', current_date - interval '6 days', 42, 72, 65, 10, 1),
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000301', current_date - interval '5 days', 54, 78, 72, 12, 1),
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000301', current_date - interval '4 days', 58, 81, 76, 15, 2),
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000301', current_date - interval '3 days', 62, 85, 84, 18, 3),
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000301', current_date - interval '2 days', 50, 79, 78, 13, 2),
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000301', current_date - interval '1 day', 45, 76, 74, 11, 1),
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000301', current_date, 45, 84, 62, 14, 2);

insert into knowledge_mastery (student_id, course_id, chapter, point_no, mastery_level)
select '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000301', chapter, point_no, mastery_level
from (
  values
    ('极限与连续', 1, 3), ('极限与连续', 2, 2), ('极限与连续', 3, 3), ('极限与连续', 4, 3), ('极限与连续', 5, 2), ('极限与连续', 6, 3), ('极限与连续', 7, 2), ('极限与连续', 8, 3),
    ('导数与微分', 1, 2), ('导数与微分', 2, 3), ('导数与微分', 3, 3), ('导数与微分', 4, 2), ('导数与微分', 5, 3), ('导数与微分', 6, 2), ('导数与微分', 7, 3), ('导数与微分', 8, 2),
    ('多元函数积分', 1, 1), ('多元函数积分', 2, 0), ('多元函数积分', 3, 2), ('多元函数积分', 4, 2), ('多元函数积分', 5, 2), ('多元函数积分', 6, 3), ('多元函数积分', 7, 1), ('多元函数积分', 8, 1),
    ('线性代数', 1, 2), ('线性代数', 2, 1), ('线性代数', 3, 2), ('线性代数', 4, 3), ('线性代数', 5, 2), ('线性代数', 6, 3), ('线性代数', 7, 2), ('线性代数', 8, 2),
    ('概率统计', 1, 1), ('概率统计', 2, 4), ('概率统计', 3, 1), ('概率统计', 4, 2), ('概率统计', 5, 1), ('概率统计', 6, 2), ('概率统计', 7, 1), ('概率统计', 8, 0),
    ('数学建模', 1, 2), ('数学建模', 2, 2), ('数学建模', 3, 2), ('数学建模', 4, 3), ('数学建模', 5, 2), ('数学建模', 6, 2), ('数学建模', 7, 3), ('数学建模', 8, 2)
) as rows(chapter, point_no, mastery_level);

insert into chat_sessions (id, student_id, course_id, title, summary, last_message_at, created_at)
values
  ('00000000-0000-0000-0000-000000002001', '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000301', '二重积分为什么要换元', '围绕积分区域和变量替换进行引导', now() - interval '17 minutes', now() - interval '18 minutes'),
  ('00000000-0000-0000-0000-000000002002', '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000301', '特征值怎么理解', '从 Ax = λx 理解方向不变', now() - interval '1 day', now() - interval '1 day'),
  ('00000000-0000-0000-0000-000000002003', '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000301', '概率密度函数怎么用', '复习连续型随机变量积分含义', now() - interval '2 days', now() - interval '2 days');

insert into chat_messages (id, session_id, student_id, course_id, role, content, metadata, created_at)
values
  ('00000000-0000-0000-0000-000000002101', '00000000-0000-0000-0000-000000002001', '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000301', 'student', '二重积分换成极坐标时，积分限为什么会变？', '{"source":"seed"}', now() - interval '18 minutes'),
  ('00000000-0000-0000-0000-000000002102', '00000000-0000-0000-0000-000000002001', '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000301', 'assistant', '这是因为换元后描述同一个区域的坐标轴变了。我们先观察积分区域，再选择更适合的坐标系，最后别忘了补上雅可比因子。', '{"mode":"guided"}', now() - interval '17 minutes'),
  ('00000000-0000-0000-0000-000000002103', '00000000-0000-0000-0000-000000002002', '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000301', 'student', '特征值到底表示什么？', '{"source":"seed"}', now() - interval '1 day'),
  ('00000000-0000-0000-0000-000000002104', '00000000-0000-0000-0000-000000002003', '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000301', 'student', '概率密度为什么还要积分？', '{"source":"seed"}', now() - interval '2 days');

insert into chat_guidance_steps (session_id, step_no, title, body, hint)
values
  ('00000000-0000-0000-0000-000000002001', 1, '观察积分区域', '先看区域边界是否包含圆、扇形或半径关系。若边界由 x² + y² 这类式子构成，极坐标通常更简洁。', '把区域先画成草图，再决定坐标系。'),
  ('00000000-0000-0000-0000-000000002001', 2, '选择坐标系', '换成极坐标后，点的位置由 r 和 θ 描述，所以积分限要改写成 r 的范围和 θ 的范围。', '不是区域变了，而是描述区域的语言变了。'),
  ('00000000-0000-0000-0000-000000002001', 3, '补上雅可比因子', '面积微元 dxdy 在极坐标下会变成 r dr dθ，这个 r 不能漏掉。', '漏掉 r 是二重积分换元最常见错误。');

insert into intervention_suggestions (student_id, course_id, audience, title, summary, action_label, priority, status)
values
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000301', 'student', '先补二重积分换元', '今晚围绕极坐标换元做短练习，先看区域再写积分限。', '开始练习', 95, 'pending'),
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000301', 'student', '建立冲刺题型清单', '把近两周错题按知识点、题型和错误原因整理，作为考试冲刺模式的输入。', '整理清单', 90, 'pending'),
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000301', 'student', '准备科研迁移任务', '选择一个建模实验主题，把高数方法迁移到可复现的小项目中。', '查看目标', 80, 'pending');

insert into sync_events (student_id, actor_role, event_type, title, status, event_time, metadata)
values
  ('00000000-0000-0000-0000-000000000101', 'student', 'practice_submitted', '学生提交高数专项练习', 'done', now() - interval '2 hours', '{"count":36}'),
  ('00000000-0000-0000-0000-000000000101', 'system', 'diagnosis_created', '系统生成课程诊断', 'done', now() - interval '1 hour', '{"riskCount":8}'),
  ('00000000-0000-0000-0000-000000000101', 'system', 'goal_mode_updated', '目标模式数据已刷新', 'done', now() - interval '30 minutes', '{"activeMode":"course_mastery"}');

insert into student_ui_state (student_id, course_id, account_id, portal, page_key, state_key, state_value, updated_at)
values
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-000000000111', 'student', 'global', 'activePage', '{"page":"home","source":"seed"}', now() - interval '9 minutes'),
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-000000000111', 'student', 'resources', 'filters', '{"primary":"all","option":"knowledge","batchOffset":0}', now() - interval '8 minutes'),
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-000000000111', 'student', 'plan', 'adjustments', '{"values":[false,true,false]}', now() - interval '7 minutes'),
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-000000000111', 'student', 'report', 'tab', '{"value":"weekly"}', now() - interval '6 minutes');

insert into student_learning_sessions (
  student_id, course_id, account_id, study_plan_id, resource_id, goal_mode_id,
  source, mode, status, target_minutes, completed_minutes, completion_score,
  completion_definition, completion_reason, outcome, metadata, started_at, completed_at, ended_at
)
values
  (
    '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000301',
    '00000000-0000-0000-0000-000000000111',
    '00000000-0000-0000-0000-000000001001',
    null,
    '00000000-0000-0000-0000-000000003002',
    'plan',
    'learn',
    'completed',
    15,
    15,
    96,
    '完成约 15 分钟有效学习，并完成一次有效提问、练习提交或资源阅读记录；计划任务需回写任务状态',
    '完成计划任务并回写学习报告',
    '{"source":"seed","questionsDone":1,"reportLinked":true}',
    '{"source":"seed","completionDefinition":"plan-completion"}',
    now() - interval '35 minutes',
    now() - interval '20 minutes',
    now() - interval '20 minutes'
  ),
  (
    '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000301',
    '00000000-0000-0000-0000-000000000111',
    '00000000-0000-0000-0000-000000001002',
    null,
    '00000000-0000-0000-0000-000000003002',
    'home',
    'learn',
    'started',
    18,
    0,
    null,
    '完成约 18 分钟有效学习，并完成一次有效提问、练习提交或资源阅读记录；计划任务需回写任务状态',
    '',
    '{}',
    '{"source":"seed","completionDefinition":"home-started"}',
    now() - interval '5 minutes',
    null,
    null
  );

insert into student_resource_usage (student_id, course_id, account_id, resource_id, action_label, status, metadata, created_at)
values
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-000000000111', '00000000-0000-0000-0000-000000000401', 'view', 'opened', '{"source":"seed"}', now() - interval '4 minutes');

insert into report_exports (student_id, course_id, account_id, portal, report_type, payload, created_at)
values
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-000000000111', 'student', 'weekly', '{"source":"seed","format":"txt"}', now() - interval '3 minutes');

insert into student_activity_events (student_id, course_id, account_id, portal, page_key, action_type, action_label, entity_type, entity_id, payload, created_at)
values
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-000000000111', 'student', 'home', 'open_task', '继续学习', 'study_plan', '00000000-0000-0000-0000-000000001002', '{"source":"seed"}', now() - interval '45 minutes'),
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-000000000111', 'student', 'profile', 'toggle_insight', '画像解读', null, null, '{"source":"seed"}', now() - interval '40 minutes'),
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-000000000111', 'student', 'plan', 'toggle_adjust_panel', '调整计划', null, null, '{"source":"seed"}', now() - interval '38 minutes'),
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-000000000111', 'student', 'resources', 'open_resource', '观看', 'learning_resource', '00000000-0000-0000-0000-000000000401', '{"kind":"视频"}', now() - interval '35 minutes'),
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-000000000111', 'student', 'tutor', 'send_message', '发送问题', 'chat_session', '00000000-0000-0000-0000-000000002001', '{"topic":"二重积分"}', now() - interval '18 minutes'),
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-000000000111', 'student', 'report', 'switch_report_tab', '本周报告', null, null, '{"source":"seed"}', now() - interval '10 minutes');
