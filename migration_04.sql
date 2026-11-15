-- ===== Star Air Life: تحديث 04 =====
-- 1) بيانات الأجهزة والخامات
alter table products
  add column if not exists description text,
  add column if not exists indoor_unit text,
  add column if not exists outdoor_unit text,
  add column if not exists sold_by text check (sold_by in ('meter','coil')),
  add column if not exists diameter text;

-- 2) بيانات الفواتير (خصم، مجمعة، نوع الشغل، الفني، الوحدات)
alter table invoices
  add column if not exists discount numeric(14,2) not null default 0,
  add column if not exists is_lump boolean not null default false,
  add column if not exists job_type text check (job_type in ('install','prepare','maintenance','supply')),
  add column if not exists technician text,
  add column if not exists indoor_info text,
  add column if not exists outdoor_info text;

-- 3) إصلاح كشف الحساب: إضافة عمود الرصيد الافتتاحي في الـ view
drop view if exists v_partner_balance;
create view v_partner_balance as
select p.id, p.kind, p.name, p.phone, p.opening_balance,
       p.opening_balance
       + coalesce((select sum(i.total - i.paid) from invoices i where i.partner_id = p.id),0)
       - coalesce((select sum(t.amount) from cash_transactions t
                   where t.partner_id = p.id and t.source = 'partner_payment'),0) as balance
from partners p;
