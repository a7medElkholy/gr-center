import { useEffect, useState } from 'react'
import { supabase, money } from './supabase'

export default function Dashboard() {
  const [d, setD] = useState(null), [err, setErr] = useState('')
  const monthName = new Date().toLocaleDateString('ar-EG', { month: 'long', year: 'numeric' })
  useEffect(() => {
    const m = new Date(); m.setDate(1); const from = m.toISOString().slice(0, 10)
    Promise.all([
      supabase.from('v_cash_balance').select('*'),
      supabase.from('v_stock').select('*'),
      supabase.from('v_partner_balance').select('*').neq('balance', 0),
      supabase.from('expenses').select('category,amount').gte('expense_date', from),
      supabase.from('invoices').select('type,total').gte('invoice_date', from),
      supabase.from('salaries').select('net').eq('paid', true).gte('month', from),
      supabase.from('products').select('id,buy_price'),
      supabase.from('casual_labor').select('amount').gte('work_date', from),
    ]).then(([cash, stock, partners, exp, inv, sal, prod, cas]) => {
      const e = [cash, stock, partners, exp, inv, sal, prod, cas].find(r => r.error)
      if (e) return setErr(e.error.message)
      const sum = (a, f) => a.reduce((s, x) => s + Number(f(x)), 0)
      const price = Object.fromEntries(prod.data.map(p => [p.id, Number(p.buy_price)]))
      const val = k => stock.data.filter(s => s.kind === k && Number(s.qty_on_hand) > 0).reduce((a, s) => a + Number(s.qty_on_hand) * (price[s.id] || 0), 0)
      setD({
        matVal: val('material'), devVal: val('device'),
        cash: cash.data, totalCash: sum(cash.data, x => x.balance),
        low: stock.data.filter(s => Number(s.qty_on_hand) <= Number(s.min_stock)),
        customers: partners.data.filter(p => p.kind === 'customer' && p.balance > 0),
        suppliers: partners.data.filter(p => p.kind === 'supplier' && p.balance > 0),
        expTotal: sum(exp.data, x => x.amount) + sum(sal.data, x => x.net) + sum(cas.data, x => x.amount),
        sales: sum(inv.data.filter(i => i.type === 'sale'), x => x.total),
        purchases: sum(inv.data.filter(i => i.type === 'purchase'), x => x.total),
      })
    })
  }, [])
  if (err) return <div className="msg err">{err}</div>
  if (!d) return <p>جاري التحميل...</p>
  const owedToUs = d.customers.reduce((s, x) => s + Number(x.balance), 0)
  const weOwe = d.suppliers.reduce((s, x) => s + Number(x.balance), 0)
  return (
    <>
      <h2>لوحة التحكم - {monthName}</h2>
      <div className="grid">
        <div className="card big"><div className="lbl">رأس المال (نقدية + خامات + أجهزة)</div><div className="val">{money(d.totalCash + d.matVal + d.devVal)}</div></div>
        <div className="card"><div className="lbl">إجمالي النقدية</div><div className="val">{money(d.totalCash)}</div></div>
        <div className="card"><div className="lbl">قيمة الخامات بالمخزن</div><div className="val">{money(d.matVal)}</div></div>
        <div className="card"><div className="lbl">قيمة الأجهزة بالمخزن</div><div className="val">{money(d.devVal)}</div></div>
        <div className="card"><div className="lbl">مبيعات الشهر</div><div className="val">{money(d.sales)}</div></div>
        <div className="card"><div className="lbl">مشتريات الشهر</div><div className="val">{money(d.purchases)}</div></div>
        <div className="card"><div className="lbl">مصاريف الشهر</div><div className="val">{money(d.expTotal)}</div></div>
        <div className="card warn"><div className="lbl">لينا عند العملاء</div><div className="val">{money(owedToUs)}</div></div>
        <div className="card bad"><div className="lbl">علينا للموردين</div><div className="val">{money(weOwe)}</div></div>
      </div>
      <h3>الخزن</h3>
      <table><thead><tr><th>الخزنة</th><th>الرصيد</th></tr></thead>
        <tbody>{d.cash.map(c => <tr key={c.id}><td>{c.name}</td><td>{money(c.balance)}</td></tr>)}</tbody></table>
      <h3>أصناف وصلت للحد الأدنى</h3>
      <table><thead><tr><th>الصنف</th><th>النوع</th><th>المتاح</th><th>الحد الأدنى</th></tr></thead>
        <tbody>{d.low.length === 0 && <tr><td colSpan="4">كل الأصناف فوق الحد الأدنى</td></tr>}
          {d.low.map(s => <tr key={s.id}><td>{s.name}</td><td>{s.kind === 'device' ? 'جهاز' : 'خامة'}</td><td>{s.qty_on_hand}</td><td>{s.min_stock}</td></tr>)}</tbody></table>
      <h3>أعلى المديونيات</h3>
      <table><thead><tr><th>الاسم</th><th>النوع</th><th>المبلغ</th></tr></thead>
        <tbody>{[...d.customers, ...d.suppliers].sort((a, b) => b.balance - a.balance).slice(0, 8).map(p =>
          <tr key={p.id}><td>{p.name}</td><td>{p.kind === 'customer' ? 'عميل (لينا)' : 'مورد (علينا)'}</td><td>{money(p.balance)}</td></tr>)}</tbody></table>
    </>
  )
}
