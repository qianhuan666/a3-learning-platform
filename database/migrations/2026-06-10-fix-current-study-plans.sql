insert into study_plans (id, student_id, course_id, plan_date, start_time, end_time, title, detail, tag, estimated_minutes, status, source, sort_order)
values
  ('00000000-0000-0000-0000-000000001001', '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000301', current_date, '19:00', '19:15', '复习多元函数偏导与梯度', '梳理偏导数、梯度方向和几何意义', '概念复盘', 12, 'done', 'teacher', 1),
  ('00000000-0000-0000-0000-000000001002', '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000301', current_date, '19:15', '19:35', '完成 8 道二重积分换元练习', '巩固极坐标换元与积分区域刻画', '练习任务', 18, 'active', 'ai', 2),
  ('00000000-0000-0000-0000-000000001003', '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000301', current_date, '19:35', '19:50', '线性代数特征值 3 题小测', '判断矩阵特征值与特征向量关系', '测评反馈', 15, 'pending', 'teacher', 3),
  ('00000000-0000-0000-0000-000000001004', '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000301', current_date, '19:50', '20:00', '今日总结与错题回看', '复盘积分区域和符号错误', '错题复盘', 10, 'pending', 'manual', 4)
on conflict (id) do update
set student_id = excluded.student_id,
    course_id = excluded.course_id,
    plan_date = current_date,
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
