-- شغّل ده بس لو كنت شغّلت gr_schema.sql القديم قبل كده
create or replace view v_partner_balance as
select p.id, p.kind, p.name, p.phone, p.opening_balance
       + coalesce((select sum(i.total - i.paid) from invoices i where i.partner_id = p.id),0)
       - coalesce((select sum(t.amount) from cash_transactions t
                   where t.partner_id = p.id and t.source = 'partner_payment'),0) as balance
from partners p;

