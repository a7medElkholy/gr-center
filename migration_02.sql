-- ===== إدارة المستخدمين والصلاحيات =====
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text, full_name text,
  role text not null default 'staff' check (role in ('admin','staff')),
  created_at timestamptz default now()
);

create or replace function public.is_admin() returns boolean
language sql security definer set search_path = public as
$$ select exists (select 1 from profiles where id = auth.uid() and role = 'admin') $$;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles(id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', new.email))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

-- المستخدمين الموجودين حالياً
insert into profiles(id, email, full_name)
select id, email, email from auth.users on conflict (id) do nothing;

alter table profiles enable row level security;
drop policy if exists "profiles_read" on profiles;
create policy "profiles_read" on profiles for select to authenticated
  using (id = auth.uid() or public.is_admin());
-- مفيش كتابة مباشرة: التعديل بيتم من Edge Function بصلاحيات الخدمة فقط

-- ⚠️ خلي حسابك أنت الأدمن (غيّر الإيميل):
-- update profiles set role = 'admin' where email = 'your@email.com';
