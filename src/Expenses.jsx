import { useEffect, useState } from 'react'
import { supabase, money } from './supabase'

const cats = { rent: 'إيجار المكان', electricity: 'فاتورة الكهرباء', water: 'فاتورة المياه', internet: 'فاتورة الإنترنت', other: 'مصاريف أخرى' }
const today = () => new Date().toISOString().slice(0, 10)

export default function Expenses({ level = 3 }) {
  const [month, setMonth] = useState(today().slice(0, 7)), [rows, setRows] = useState([]), [accounts, setAccounts] = useState([]), [msg, setMsg] = useState(null), [eid, setEid] = useState(null)
  const [f, setF] = useState({ category: 'rent', description: '', amount: '', expense_date: today(), account_id: '' })
  async function load() {
    const from = month + '-01', d = new Date(from); d.setMonth(d.getMonth() + 1)
    const [e, a] = await Promise.all([
      supabase.from('expenses').select('*').gte('expense_date', from).lt('expense_date', d.toISOString().slice(0, 10)).order('expense_date', { ascending: false }),
      supabase.from('cash_accounts').select('id,name'),
    ])
    setRows(e.data || []); setAccounts(a.data || [])
  }
  useEffect(() => { load() }, [month])
  async function save(e) {
    e.preventDefault(); setMsg(null)
    if (!f.account_id) return setMsg({ t: 'err', m: 'اختار الخزنة اللي اتدفع منها' })
    if (eid) {
      const a = await supabase.from('expenses').update({ category: f.category, description: f.description, amount: f.amount, expense_date: f.expense_date }).eq('id', eid)
      const b = await supabase.from('cash_transactions').update({ account_id: f.account_id, amount: f.amount, tx_date: f.expense_date, note: cats[f.category] }).eq('expense_id', eid)
      if (a.error || b.error) return setMsg({ t: 'err', m: (a.error || b.error).message })
      setMsg({ t: 'ok', m: 'تم حفظ التعديل' }); setEid(null); setF({ ...f, description: '', amount: '' }); return load()
    }
    const { data: ex, error } = await supabase.from('expenses').insert({ category: f.category, description: f.description, amount: f.amount, expense_date: f.expense_date }).select().single()
    if (error) return setMsg({ t: 'err', m: error.message })
    const tx = await supabase.from('cash_transactions').insert({ account_id: f.account_id, direction: 'out', amount: f.amount, source: 'expense', expense_id: ex.id, note: cats[f.category], tx_date: f.expense_date })
    if (tx.error) { await supabase.from('expenses').delete().eq('id', ex.id); return setMsg({ t: 'err', m: tx.error.message }) }
    setMsg({ t: 'ok', m: 'تم تسجيل المصروف وخصمه من الخزنة' }); setF({ ...f, description: '', amount: '' }); load()
  }
  async function edit(r) {
    const { data } = await supabase.from('cash_transactions').select('account_id').eq('expense_id', r.id).limit(1)
    setF({ category: r.category, description: r.description || '', amount: r.amount, expense_date: r.expense_date, account_id: data?.[0]?.account_id || '' })
    setEid(r.id); window.scrollTo(0, 0)
  }
  async function del(r) {
    if (!confirm('حذف المصروف؟ هيرجع المبلغ للخزنة')) return
    await supabase.from('cash_transactions').delete().eq('expense_id', r.id)
    await supabase.from('expenses').delete().eq('id', r.id); load()
  }
  const totals = Object.keys(cats).map(k => [k, rows.filter(r => r.category === k).reduce((s, r) => s + Number(r.amount), 0)])
  return (
    <>
      <h2>المصاريف والفواتير</h2>
      {level >= 2 && <form className="card" onSubmit={save} style={{ marginBottom: 20 }}>
        <div className="row">
          <select value={f.category} onChange={e => setF({ ...f, category: e.target.value })}>
            {Object.entries(cats).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <input type="number" min="0.01" step="any" placeholder="المبلغ" value={f.amount} onChange={e => setF({ ...f, amount: e.target.value })} required />
          <input type="date" value={f.expense_date} onChange={e => setF({ ...f, expense_date: e.target.value })} />
          <select value={f.account_id} onChange={e => setF({ ...f, account_id: e.target.value })}>
            <option value="">دفعت من خزنة</option>{accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <input placeholder="ملاحظة (مثال: فاتورة شهر 11)" value={f.description} onChange={e => setF({ ...f, description: e.target.value })} />
        </div>
        <button className="btn">{eid ? 'حفظ التعديل' : 'تسجيل المصروف'}</button>{eid && <button type="button" className="btn sec" onClick={() => setEid(null)} style={{ marginInlineStart: 8 }}>إلغاء التعديل</button>}
        {msg && <div className={'msg ' + msg.t}>{msg.m}</div>}
      </form>}
      <p>الشهر: <input type="month" value={month} onChange={e => setMonth(e.target.value)} style={{ width: 'auto' }} /></p>
      <div className="grid">{totals.map(([k, v]) => <div className="card" key={k}><div className="lbl">{cats[k]}</div><div className="val">{money(v)}</div></div>)}</div>
      <table>
        <thead><tr><th>التاريخ</th><th>النوع</th><th>ملاحظة</th><th>المبلغ</th><th></th></tr></thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan="5">لا توجد مصاريف في الشهر ده.</td></tr>}
          {rows.map(r => <tr key={r.id}><td>{r.expense_date}</td><td>{cats[r.category] || r.category}</td><td>{r.description || '-'}</td><td>{money(r.amount)}</td><td>{level >= 3 && <><button className="btn sec sm" onClick={() => edit(r)}>تعديل</button>{' '}<button className="btn del sm" onClick={() => del(r)}>حذف</button></>}</td></tr>)}
        </tbody>
      </table>
    </>
  )
}
