-- Make course switching data-backed for the student demo account.
-- The UI now receives real enrolled courses and reloads plan/resource/report data by courseId.

insert into courses (id, name, subject, grade)
values
  ('00000000-0000-0000-0000-000000000302', '线性代数', '线性代数', '大学本科'),
  ('00000000-0000-0000-0000-000000000303', '概率统计', '概率统计', '大学本科')
on conflict (id) do update
set name = excluded.name,
    subject = excluded.subject,
    grade = excluded.grade;

insert into student_course_enrollments (student_id, course_id, is_default)
values
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000302', false),
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000303', false)
on conflict (student_id, course_id) do update
set status = 'active',
    is_default = excluded.is_default,
    updated_at = now();

update study_plans
set plan_date = current_date,
    updated_at = now()
where student_id = '00000000-0000-0000-0000-000000000101'
  and course_id = '00000000-0000-0000-0000-000000000301'
  and id in (
    '00000000-0000-0000-0000-000000001001',
    '00000000-0000-0000-0000-000000001002',
    '00000000-0000-0000-0000-000000001003',
    '00000000-0000-0000-0000-000000001004'
  );

insert into course_knowledge_points (id, course_id, code, title, description, module, difficulty_level, importance, tags, sort_order)
values
  ('00000000-0000-0000-0000-000000004204', '00000000-0000-0000-0000-000000000302', 'LA-EIG-001', '特征值与特征向量', '理解矩阵作用下方向保持不变的向量、特征方程和基础求解流程。', '矩阵分解', 3, 5, '["线性代数","特征值"]', 10),
  ('00000000-0000-0000-0000-000000004205', '00000000-0000-0000-0000-000000000302', 'LA-RANK-001', '矩阵秩与线性方程组', '用初等变换、秩和解空间维数判断线性方程组解的结构。', '线性方程组', 4, 5, '["线性代数","矩阵秩"]', 20),
  ('00000000-0000-0000-0000-000000004206', '00000000-0000-0000-0000-000000000303', 'PS-DIST-001', '概率密度函数', '掌握连续型随机变量密度、积分概率和归一化条件。', '随机变量', 3, 5, '["概率统计","密度函数"]', 10),
  ('00000000-0000-0000-0000-000000004207', '00000000-0000-0000-0000-000000000303', 'PS-TEST-001', '假设检验', '理解原假设、备择假设、显著性水平和 p 值的决策逻辑。', '统计推断', 4, 4, '["概率统计","假设检验"]', 20)
on conflict (course_id, code) do update
set title = excluded.title,
    description = excluded.description,
    module = excluded.module,
    difficulty_level = excluded.difficulty_level,
    importance = excluded.importance,
    tags = excluded.tags,
    sort_order = excluded.sort_order,
    updated_at = now();

insert into learning_resources (id, source_id, resource_code, title, kind, subject, grade, difficulty, duration_minutes, color, action_label, status, metadata, published_at)
values
  ('00000000-0000-0000-0000-000000000451', '00000000-0000-0000-0000-000000004001', 'A3-LA-RES-001', '线性方程组消元方法精讲', '文档', '线性代数', '大学本科', '基础复习', 14, 'blue', '阅读', 'active', '{"stars":3,"summary":"从行变换、阶梯形矩阵和秩的角度梳理方程组解法。"}', now()),
  ('00000000-0000-0000-0000-000000000452', '00000000-0000-0000-0000-000000004001', 'A3-LA-RES-002', '矩阵特征值专项练习', '练习', '线性代数', '大学本科', '巩固训练', 22, 'green', '开始练习', 'active', '{"stars":3,"summary":"围绕特征方程、特征向量和可对角化条件做短练。"}', now()),
  ('00000000-0000-0000-0000-000000000453', '00000000-0000-0000-0000-000000004001', 'A3-LA-RES-003', '向量空间与基变换动画', '动画', '线性代数', '大学本科', '直观理解', 8, 'sky', '观看', 'active', '{"stars":2,"summary":"用可视化方式理解基、坐标和线性变换。"}', now()),
  ('00000000-0000-0000-0000-000000000461', '00000000-0000-0000-0000-000000004001', 'A3-PS-RES-001', '概率密度函数积分讲解', '视频', '概率统计', '大学本科', '基础复习', 12, 'orange', '观看', 'active', '{"stars":3,"summary":"从面积、积分和概率归一化理解密度函数。"}', now()),
  ('00000000-0000-0000-0000-000000000462', '00000000-0000-0000-0000-000000004001', 'A3-PS-RES-002', '随机变量分布专项练习', '练习', '概率统计', '大学本科', '巩固训练', 20, 'purple', '开始练习', 'active', '{"stars":3,"summary":"练习分布函数、密度函数和期望计算。"}', now()),
  ('00000000-0000-0000-0000-000000000463', '00000000-0000-0000-0000-000000004001', 'A3-PS-RES-003', '假设检验入门测评', '测评', '概率统计', '大学本科', '定位薄弱知识点', 18, 'lime', '开始测评', 'active', '{"stars":2,"summary":"检测原假设、p 值和拒绝域的基本理解。"}', now())
on conflict (id) do update
set source_id = excluded.source_id,
    resource_code = excluded.resource_code,
    title = excluded.title,
    kind = excluded.kind,
    subject = excluded.subject,
    grade = excluded.grade,
    difficulty = excluded.difficulty,
    duration_minutes = excluded.duration_minutes,
    color = excluded.color,
    action_label = excluded.action_label,
    status = excluded.status,
    metadata = excluded.metadata,
    published_at = coalesce(learning_resources.published_at, excluded.published_at),
    updated_at = now();

insert into resource_knowledge_links (resource_id, knowledge_point_id, link_type, relevance, evidence)
values
  ('00000000-0000-0000-0000-000000000451', '00000000-0000-0000-0000-000000004205', 'primary', 0.930, '资源围绕消元法、矩阵秩和方程组解结构展开。'),
  ('00000000-0000-0000-0000-000000000452', '00000000-0000-0000-0000-000000004204', 'primary', 0.950, '专项练习覆盖特征方程与特征向量。'),
  ('00000000-0000-0000-0000-000000000461', '00000000-0000-0000-0000-000000004206', 'primary', 0.940, '视频资源讲解密度函数积分概率。'),
  ('00000000-0000-0000-0000-000000000463', '00000000-0000-0000-0000-000000004207', 'primary', 0.900, '测评题定位假设检验基础薄弱点。')
on conflict (resource_id, knowledge_point_id, link_type) do update
set relevance = excluded.relevance,
    evidence = excluded.evidence;

insert into study_plans (id, student_id, course_id, resource_id, plan_date, start_time, end_time, title, detail, tag, estimated_minutes, status, source, sort_order)
values
  ('00000000-0000-0000-0000-000000001101', '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000302', '00000000-0000-0000-0000-000000000451', current_date, '18:40', '19:00', '复盘矩阵行变换与秩', '用三道例题确认消元步骤和秩的判断。', '概念复盘', 20, 'pending', 'system', 1),
  ('00000000-0000-0000-0000-000000001102', '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000302', '00000000-0000-0000-0000-000000000452', current_date, '19:05', '19:30', '完成 6 道特征值专项题', '巩固特征方程和特征向量计算。', '练习任务', 25, 'active', 'ai', 2),
  ('00000000-0000-0000-0000-000000001201', '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000303', '00000000-0000-0000-0000-000000000461', current_date, '20:00', '20:15', '复习密度函数积分含义', '把密度、概率和积分面积重新串起来。', '概念复盘', 15, 'pending', 'system', 1),
  ('00000000-0000-0000-0000-000000001202', '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000303', '00000000-0000-0000-0000-000000000463', current_date, '20:20', '20:40', '完成假设检验入门测评', '定位原假设、p 值和拒绝域薄弱点。', '测评反馈', 20, 'pending', 'ai', 2)
on conflict (id) do update
set resource_id = excluded.resource_id,
    plan_date = excluded.plan_date,
    start_time = excluded.start_time,
    end_time = excluded.end_time,
    title = excluded.title,
    detail = excluded.detail,
    tag = excluded.tag,
    estimated_minutes = excluded.estimated_minutes,
    status = excluded.status,
    source = excluded.source,
    sort_order = excluded.sort_order,
    updated_at = now();

insert into student_resource_recommendations (student_id, resource_id, reason, bucket, match_score)
values
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000451', '补齐矩阵秩和线性方程组解结构。', 'recommended', 93),
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000452', '巩固特征值计算，适合当前练习节奏。', 'weakness', 89),
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000461', '帮助你把概率密度与积分面积对应起来。', 'recommended', 92),
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000463', '用短测定位假设检验的概念漏洞。', 'popular', 84)
on conflict (student_id, resource_id, bucket) do update
set reason = excluded.reason,
    match_score = excluded.match_score,
    created_at = now();

insert into student_profile_scores (student_id, course_id, dimension_key, label, current_score, class_average, sort_order)
values
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000302', 'knowledge', '课程知识掌握', 74, 70, 1),
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000302', 'application', '解题应用能力', 68, 66, 2),
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000302', 'thinking', '抽象建模能力', 72, 63, 3),
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000302', 'efficiency', '复习效率', 69, 67, 4),
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000302', 'attitude', '学习自律', 76, 69, 5),
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000302', 'input', '学习投入', 72, 67, 6)
on conflict (student_id, course_id, dimension_key) do update
set label = excluded.label,
    current_score = excluded.current_score,
    class_average = excluded.class_average,
    sort_order = excluded.sort_order,
    updated_at = now();

insert into student_profile_scores (student_id, course_id, dimension_key, label, current_score, class_average, sort_order)
values
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000303', 'knowledge', '课程知识掌握', 70, 68, 1),
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000303', 'application', '解题应用能力', 66, 64, 2),
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000303', 'thinking', '统计解释能力', 73, 65, 3),
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000303', 'efficiency', '复习效率', 71, 66, 4),
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000303', 'attitude', '学习自律', 74, 67, 5),
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000303', 'input', '学习投入', 69, 65, 6)
on conflict (student_id, course_id, dimension_key) do update
set label = excluded.label,
    current_score = excluded.current_score,
    class_average = excluded.class_average,
    sort_order = excluded.sort_order,
    updated_at = now();

insert into learning_metric_daily (student_id, course_id, metric_date, study_minutes, accuracy_rate, completion_rate, questions_done, mistakes_fixed)
select '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000301', current_date - offs,
       36 + offs * 3, 72 + offs, 58 + offs * 4, 9 + offs, greatest(0, 4 - offs / 2)
from generate_series(0, 6) as offs
on conflict (student_id, course_id, metric_date) do update
set study_minutes = excluded.study_minutes,
    accuracy_rate = excluded.accuracy_rate,
    completion_rate = excluded.completion_rate,
    questions_done = excluded.questions_done,
    mistakes_fixed = excluded.mistakes_fixed;

insert into learning_metric_daily (student_id, course_id, metric_date, study_minutes, accuracy_rate, completion_rate, questions_done, mistakes_fixed)
select '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000302', current_date - offs,
       28 + offs * 4, 70 + offs, 54 + offs * 3, 7 + offs, greatest(0, 3 - offs / 2)
from generate_series(0, 6) as offs
on conflict (student_id, course_id, metric_date) do update
set study_minutes = excluded.study_minutes,
    accuracy_rate = excluded.accuracy_rate,
    completion_rate = excluded.completion_rate,
    questions_done = excluded.questions_done,
    mistakes_fixed = excluded.mistakes_fixed;

insert into learning_metric_daily (student_id, course_id, metric_date, study_minutes, accuracy_rate, completion_rate, questions_done, mistakes_fixed)
select '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000303', current_date - offs,
       24 + offs * 3, 65 + offs, 48 + offs * 4, 6 + offs, greatest(0, 4 - offs / 2)
from generate_series(0, 6) as offs
on conflict (student_id, course_id, metric_date) do update
set study_minutes = excluded.study_minutes,
    accuracy_rate = excluded.accuracy_rate,
    completion_rate = excluded.completion_rate,
    questions_done = excluded.questions_done,
    mistakes_fixed = excluded.mistakes_fixed;

insert into knowledge_mastery (student_id, course_id, chapter, point_no, mastery_level)
select '00000000-0000-0000-0000-000000000101', course_id, chapter, point_no, mastery_level
from (
  values
    ('00000000-0000-0000-0000-000000000302'::uuid, '行列式', 1, 3),
    ('00000000-0000-0000-0000-000000000302'::uuid, '矩阵秩', 2, 2),
    ('00000000-0000-0000-0000-000000000302'::uuid, '线性方程组', 3, 2),
    ('00000000-0000-0000-0000-000000000302'::uuid, '特征值', 4, 1),
    ('00000000-0000-0000-0000-000000000303'::uuid, '随机变量', 1, 3),
    ('00000000-0000-0000-0000-000000000303'::uuid, '密度函数', 2, 2),
    ('00000000-0000-0000-0000-000000000303'::uuid, '参数估计', 3, 2),
    ('00000000-0000-0000-0000-000000000303'::uuid, '假设检验', 4, 1)
) as rows(course_id, chapter, point_no, mastery_level)
on conflict (student_id, course_id, chapter, point_no) do update
set mastery_level = excluded.mastery_level,
    updated_at = now();

insert into student_goal_modes (id, student_id, course_id, mode_key, title, focus_label, description, success_metric, target_date, weekly_hours, progress, is_active, metrics)
values
  ('00000000-0000-0000-0000-000000003101', '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000302', 'course_mastery', '课程掌握', '线代补弱', '围绕矩阵秩、特征值和线性方程组建立稳定解题链路。', '线代章节掌握度 80%+', current_date + interval '35 days', 5.5, 46, true, '{"primaryMetric":"特征值正确率","risk":"矩阵秩判断","nextReview":"2026-06-24"}'),
  ('00000000-0000-0000-0000-000000003102', '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000303', 'course_mastery', '课程掌握', '概率补弱', '围绕密度函数、分布和假设检验完成概念到题目的迁移。', '概率统计测评正确率 78%+', current_date + interval '35 days', 5.0, 42, true, '{"primaryMetric":"假设检验正确率","risk":"p 值解释","nextReview":"2026-06-25"}')
on conflict (student_id, course_id, mode_key) do update
set title = excluded.title,
    focus_label = excluded.focus_label,
    description = excluded.description,
    success_metric = excluded.success_metric,
    target_date = excluded.target_date,
    weekly_hours = excluded.weekly_hours,
    progress = excluded.progress,
    is_active = excluded.is_active,
    metrics = excluded.metrics,
    updated_at = now();
