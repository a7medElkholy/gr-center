-- عمالة غير منتظمة
create table if not exists casual_labor (
  id uuid primary key default gen_random_uuid(),
  worker_name text not null,
  work_date date not null default current_date,
  amount numeric(14,2) not null check (amount > 0),
  details text,
  project text,
  created_at timestamptz default now()
);
alter table cash_transactions
  add column if not exists casual_id uuid references casual_labor(id) on delete cascade;

alter table casual_labor enable row level security;
drop policy if exists "auth_all" on casual_labor;
create policy "auth_all" on casual_labor for all to authenticated using (true) with check (true);
