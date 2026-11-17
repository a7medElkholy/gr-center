import { useEffect, useMemo, useState } from 'react'
import { supabase, money, fetchAll } from './supabase'

const mName = m => new Date(m + '-01T12:00:00').toLocaleDateString('ar-EG', { month: 'long', year: 'numeric' })
const sum = (a, f) => a.reduce((s, x) => s + Number(f(x) || 0), 0)

export default function Inventory() {
  const [d, setD] = useState(null), [err, setErr] = useState(''), [month, setMonth] = useState('all'), [kind, setKind] = useState('all')
  useEffect(() => {
    (async () => {
      try {
        const [items, invs, exps, sals, txs, cas] = await Promise.all([
          fetchAll(() => supabase.from('invoice_items').select('product_id,qty,invoices!inner(type,invoice_date)')),
          fetchAll(() => supabase.from('invoices').select('type,invoice_date,total,discount')),
          fetchAll(() => supabase.from('expenses').select('expense_date,amount')),
          fetchAll(() => supabase.from('salaries').select('month,net').eq('paid', true)),
          fetchAll(() => supabase.from('cash_transactions').select('tx_date,direction,amount')),
          fetchAll(() => supabase.from('casual_labor').select('work_date,amount')),
        ])
        const pr = await supabase.from('products').select('id,name,kind,unit,buy_price').order('name')
        const ac = await supabase.from('cash_accounts').select('opening_balance')
        setD({ items, invs, exps, sals, txs, cas, products: pr.data || [], opening: sum(ac.data || [], a => a.opening_balance) })
      } catch (e) { setErr(e.message) }
    })()
  }, [])

  const months = useMemo(() => {
    if (!d) return []
    const cur = new Date().toISOString().slice(0, 7)
    const ds = [...d.invs.map(x => x.invoice_date), ...d.exps.map(x => x.expense_date), ...d.sals.map(x => x.month), ...d.txs.map(x => x.tx_date), ...d.cas.map(x => x.work_date)]
      .filter(Boolean).map(x => x.slice(0, 7)).filter(x => x <= cur)
    let m = ds.length ? ds.reduce((a, b) => (a < b ? a : b)) : cur
    const out = []
    while (m <= cur) { out.push(m); const [y, mo] = m.split('-').map(Number); m = mo === 12 ? (y + 1) + '-01' : y + '-' + String(mo + 1).padStart(2, '0') }
    return out.reverse()
  }, [d])

  function summary(m) {
    const inM = s => (s || '').slice(0, 7) === m
    const sales = d.invs.filter(i => i.type === 'sale' && inM(i.invoice_date))
    return {
      sales: sum(sales, i => i.total), disc: sum(sales, i => i.discount),
      purchases: sum(d.invs.filter(i => i.type === 'purchase' && inM(i.invoice_date)), i => i.total),
      exp: sum(d.exps.filter(x => inM(x.expense_date)), x => x.amount),
      sal: sum(d.sals.filter(x => inM(x.month)), x => x.net) + sum(d.cas.filter(x => inM(x.work_date)), x => x.amount),
      cashEnd: d.opening + sum(d.txs.filter(t => (t.tx_date || '').slice(0, 7) <= m), t => (t.direction === 'in' ? t.amount : -t.amount)),
    }
  }
  function stock(m) {
    const acc = {}
    d.items.forEach(it => {
      const t = it.invoices.type, dt = it.invoices.invoice_date.slice(0, 7), q = Number(it.qty) * (t === 'purchase' ? 1 : -1)
      const a = (acc[it.product_id] = acc[it.product_id] || { open: 0, inn: 0, out: 0 })
      if (dt < m) a.open += q; else if (dt === m) { if (q > 0) a.inn += q; else a.out -= q }
    })
    return d.products.map(p => { const a = acc[p.id] || { open: 0, inn: 0, out: 0 }; const close = a.open + a.inn - a.out; return { ...p, ...a, close, value: close * Number(p.buy_price) } })
      .filter(r => r.open || r.inn || r.out || r.close)
  }

  if (err) return <div className="msg err">{err}</div>
  if (!d) return <p>جاري التحميل...</p>
  const s = month !== 'all' ? summary(month) : null
  const rows = month !== 'all' ? stock(month).filter(r => kind === 'all' || r.kind === kind) : []
  return (
    <>
      <h2>الجرد الشهري</h2>
      <p>
        <select value={month} onChange={e => setMonth(e.target.value)} style={{ width: 'auto' }}>
          <option value="all">كل الشهور</option>
          {months.map(m => <option key={m} value={m}>{mName(m)}</option>)}
        </select>{' '}
        {month !== 'all' && <button className="btn sec" onClick={() => window.print()}>طباعة</button>}
      </p>
      {month === 'all' ? (
        <table>
          <thead><tr><th>الشهر</th><th>المبيعات</th><th>الخصومات</th><th>المشتريات</th><th>المصاريف</th><th>المرتبات والعمالة</th><th>رصيد الخزن آخر الشهر</th><th></th></tr></thead>
          <tbody>
            {months.map(m => { const x = summary(m); return (
              <tr key={m}><td>{mName(m)}</td><td>{money(x.sales)}</td><td>{money(x.disc)}</td><td>{money(x.purchases)}</td><td>{money(x.exp)}</td><td>{money(x.sal)}</td><td>{money(x.cashEnd)}</td>
                <td><button className="btn sec sm" onClick={() => setMonth(m)}>جرد الشهر</button></td></tr>) })}
          </tbody>
        </table>
      ) : (
        <>
          <h3>{mName(month)}</h3>
          <div className="grid">
            <div className="card"><div className="lbl">المبيعات (بعد الخصم)</div><div className="val">{money(s.sales)}</div></div>
            <div className="card"><div className="lbl">الخصومات</div><div className="val">{money(s.disc)}</div></div>
            <div className="card"><div className="lbl">المشتريات</div><div className="val">{money(s.purchases)}</div></div>
            <div className="card"><div className="lbl">المصاريف</div><div className="val">{money(s.exp)}</div></div>
            <div className="card"><div className="lbl">المرتبات والعمالة</div><div className="val">{money(s.sal)}</div></div>
            <div className="card big"><div className="lbl">رصيد الخزن آخر الشهر (بيترحّل للشهر اللي بعده)</div><div className="val">{money(s.cashEnd)}</div></div>
          </div>
          <p>
            {[['all', 'الكل'], ['device', 'الأجهزة'], ['material', 'الخامات']].map(([k, t]) =>
              <button key={k} className={'btn sm ' + (kind === k ? '' : 'sec')} onClick={() => setKind(k)} style={{ marginInlineEnd: 6 }}>{t}</button>)}
          </p>
          <table>
            <thead><tr><th>الصنف</th><th>رصيد أول الشهر</th><th>وارد (مشتريات)</th><th>منصرف (مبيعات)</th><th>رصيد آخر الشهر</th><th>القيمة</th></tr></thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan="6">لا توجد حركة مخزون في الشهر ده.</td></tr>}
              {rows.map(r => <tr key={r.id}><td>{r.name} ({r.kind === 'device' ? 'جهاز' : 'خامة'})</td><td>{r.open} {r.unit}</td><td>{r.inn}</td><td>{r.out}</td><td style={{ fontWeight: 600 }}>{r.close} {r.unit}</td><td>{money(r.value)}</td></tr>)}
              {rows.length > 0 && <tr><td colSpan="5"><strong>إجمالي قيمة المخزون آخر الشهر</strong></td><td><strong>{money(sum(rows, r => r.value))}</strong></td></tr>}
            </tbody>
          </table>
        </>
      )}
    </>
  )
}
