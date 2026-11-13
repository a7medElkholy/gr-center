# GR - نظام إدارة مركز التكييفات
1. شغّل gr_schema.sql في Supabase > SQL Editor
2. Supabase > Authentication > Users: أضف مستخدم (بريد + كلمة سر)
3. انسخ .env.example إلى .env وحط الـ URL والـ anon key
4. npm install && npm run dev
ملاحظة: أضف أصناف وعملاء وموردين من Table Editor مؤقتا لحد ما نعمل شاشاتهم.

لو كنت شغلت gr_schema.sql القديم: شغّل migration_01.sql بس (بيصلّح حساب العملاء والموردين عشان الدفعات).

## المستخدمين (للأدمن)
1. شغّل migration_02.sql في SQL Editor، وبعدين شغّل السطر الأخير (غيّر الإيميل) عشان تبقى أدمن.
2. انشر الـ Edge Function: npx supabase login ثم npx supabase link --project-ref <ref> ثم npx supabase functions deploy admin-users
   (الملف في supabase/functions/admin-users/index.ts) - مفتاح الخدمة بيتحط تلقائي في السيرفر ومش بيتكتب في الواجهة.
3. هتلاقي صفحة "المستخدمين" في القائمة: إنشاء، حذف، تغيير الباسورد، تغيير الصلاحية.

## الصلاحيات (migration_03)
شغّل migration_03.sql، وأعد نشر الـ Edge Function admin-users (فيها أمر جديد لحفظ الصلاحيات).
