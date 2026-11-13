-- صلاحيات كل مستخدم
alter table profiles add column if not exists permissions jsonb not null default '{}'::jsonb;

-- الموظفين الحاليين: نحافظ على الوضع الحالي (تحكم كامل) لحد ما الأدمن يعدّل
update profiles set permissions = '{"dash":"full","sale":"full","purchase":"full","device":"full","material":"full","customer":"full","supplier":"full","expenses":"full","employees":"full"}'::jsonb
where role = 'staff' and permissions = '{}'::jsonb;
