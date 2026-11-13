-- ============ GR AC Center - Supabase Schema ============
-- شغّل الملف ده في Supabase > SQL Editor

-- 1) الخزن والحسابات (كاش / بنك / فودافون كاش)
create table cash_accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  opening_balance numeric(14,2) not null default 0,
  created_at timestamptz default now()
);

-- 2) الأصناف: أجهزة أو خامات
create table products (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('device','material')),
  name text not null,
  sku text unique,
  unit text default 'قطعة',
  buy_price numeric(14,2) default 0,
  sell_price numeric(14,2) default 0,
  min_stock numeric(14,2) default 0,
  created_at timestamptz default now()
);

-- 3) العملاء والموردين
create table partners (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('customer','supplier')),
  name text not null,
  phone text,
  address text,
  opening_balance numeric(14,2) default 0, -- موجب = عليه لينا (عميل) / لينا عليه (مورد)
  created_at timestamptz default now()
);

-- 4) الفواتير (مبيعات / مشتريات) للأجهزة والخامات
create table invoices (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('sale','purchase')),
  partner_id uuid references partners(id),
  invoice_date date not null default current_date,
  total numeric(14,2) not null default 0,
  paid numeric(14,2) not null default 0,
  notes text,
  created_at timestamptz default now()
);

create table invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices(id) on delete cascade,
  product_id uuid not null references products(id),
  qty numeric(14,2) not null check (qty > 0),
  price numeric(14,2) not null,
  line_total numeric(14,2) generated always as (qty * price) stored
);

-- 5) حركة المخزون (بتتسجل أوتوماتيك من الفواتير)
create table stock_movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id),
  qty numeric(14,2) not null, -- موجب دخول / سالب خروج
  reason text not null,       -- sale, purchase, adjustment
  invoice_id uuid references invoices(id) on delete cascade,
  created_at timestamptz default now()
);

-- 6) الموظفين والمرتبات
create table employees (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  job_title text,
  base_salary numeric(14,2) not null default 0,
  active boolean default true
);

create table salaries (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id),
  month date not null,               -- أول يوم في الشهر
  base numeric(14,2) not null,
  bonus numeric(14,2) default 0,
  deduction numeric(14,2) default 0,
  advance numeric(14,2) default 0,   -- سلف
  net numeric(14,2) generated always as (base + bonus - deduction - advance) stored,
  paid boolean default false,
  unique (employee_id, month)
);

-- 7) المصاريف (إيجار - كهرباء - مياه - نت - غيره)
create table expenses (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in
    ('rent','electricity','water','internet','salary','other')),
  description text,
  amount numeric(14,2) not null,
  expense_date date not null default current_date,
  created_at timestamptz default now()
);

-- 8) دفتر النقدية: كل حاجة داخلة/خارجة من الخزنة
create table cash_transactions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references cash_accounts(id),
  direction text not null check (direction in ('in','out')),
  amount numeric(14,2) not null check (amount > 0),
  source text not null, -- sale, purchase, expense, salary, partner_payment, other
  partner_id uuid references partners(id),
  invoice_id uuid references invoices(id),
  expense_id uuid references expenses(id),
  salary_id uuid references salaries(id),
  note text,
  tx_date date not null default current_date,
  created_at timestamptz default now()
);

-- ============ Triggers: المخزون أوتوماتيك ============
create or replace function fn_invoice_item_stock() returns trigger as $$
declare inv_type text;
begin
  select type into inv_type from invoices where id = new.invoice_id;
  insert into stock_movements(product_id, qty, reason, invoice_id)
  values (new.product_id,
          case when inv_type = 'purchase' then new.qty else -new.qty end,
          inv_type, new.invoice_id);
  return new;
end $$ language plpgsql;

create trigger trg_invoice_item_stock
after insert on invoice_items
for each row execute function fn_invoice_item_stock();

-- ============ Views: الأرصدة والمديونيات ============
create view v_stock as
select p.id, p.kind, p.name, p.min_stock,
       coalesce(sum(m.qty),0) as qty_on_hand
from products p left join stock_movements m on m.product_id = p.id
group by p.id;

create view v_cash_balance as
select a.id, a.name,
       a.opening_balance
       + coalesce(sum(case when t.direction='in' then t.amount else -t.amount end),0) as balance
from cash_accounts a left join cash_transactions t on t.account_id = a.id
group by a.id;

-- رصيد كل عميل/مورد: المتبقي من الفواتير
-- العميل: موجب = مدين لينا | المورد: موجب = احنا مدينين له (دائنين)
create or replace view v_partner_balance as
select p.id, p.kind, p.name, p.phone, p.opening_balance
       + coalesce((select sum(i.total - i.paid) from invoices i where i.partner_id = p.id),0)
       - coalesce((select sum(t.amount) from cash_transactions t
                   where t.partner_id = p.id and t.source = 'partner_payment'),0) as balance
from partners p;

-- ============ الأمان (RLS) ============
do $$
declare t text;
begin
  for t in select unnest(array['cash_accounts','products','partners','invoices',
    'invoice_items','stock_movements','employees','salaries','expenses','cash_transactions'])
  loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy "auth_all" on %I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;

-- بيانات أولية
insert into cash_accounts(name) values ('الخزنة الرئيسية'), ('فودافون كاش'), ('البنك');
