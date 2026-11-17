import { useEffect, useState } from 'react'
import { supabase, money } from './supabase'

const SRC = { sale: 'مبيعات', purchase: 'مشتريات', expense: 'مصروف', salary: 'مرتب', partner_payment: 'دفعة', adjustment: 'تعديل رصيد', casual: 'عمالة غير منتظمة', other: 'أخرى' }
const today = () => new Date().toISOString().slice(0, 10)

export default function Cash({ level = 3 }) {
  const [accs, setAccs] = useState([]), [txs, setTxs] = useState([]), [msg, setMsg] = useState(null), [ea, setEa] = useState(null)
  const [f, setF] = useState({ account_id: '', direction: 'in', amount: '', note: '', date: today() })
  async function load() {
    const [a, b, t] = await Promise.all([
      supabase.from('cash_accounts').select('*').order('created_at'),
      supabase.from('v_cash_balance').select('*'),
      supabase.from('cash_transactions').select('*, cash_accounts(name), partners(name)').order('tx_date', { ascending: false }).order('created_at', { ascending: false }).limit(60),
    ])
    const bal = Object.fromEntries((b.data || []).map(x => [x.id, x.balance]))
    setAccs((a.data || []).map(x => ({ ...x, balance: bal[x.id] ?? x.opening_balance })))
    setTxs(t.data || [])
  }
  useEffect(() => { load() }, [])
  const total = accs.reduce((s, a) => s + Number(a.balance), 0)

  async function adjust(e) {
    e.preventDefault(); setMsg(null)
    if (!f.account_id) return setMsg({ t: 'err', m: 'اختار الخزنة' })
    const { error } = await supabase.from('cash_transactions').insert({ account_id: f.account_id, direction: f.direction, amount: +f.amount, source: 'adjustment', note: f.note, tx_date: f.date })
    if (error) return setMsg({ t: 'err', m: error.message })
    setMsg({ t: 'ok', m: f.direction === 'in' ? 'تم إضافة المبلغ للخزنة' : 'تم سحب المبلغ من الخزنة' }); setF({ ...f, amount: '', note: '' }); load()
  }
  async function delTx(t) {
    if (!confirm('حذف الحركة دي؟')) return
    await supabase.from('cash_transactions').delete().eq('id', t.id); load()
  }
  async function saveAcc(e) {
    e.preventDefault()
    const body = { name: ea.name, opening_balance: +ea.opening_balance || 0 }
    const { error } = ea.id ? await supabase.from('cash_accounts').update(body).eq('id', ea.id) : await supabase.from('cash_accounts').insert(body)
    if (error) return setMsg({ t: 'err', m: error.message })
    setEa(null); load()
  }
  async function delAcc(a) {
    if (!confirm('حذف الخزنة ' + a.name + '؟')) return
    const { error } = await supabase.from('cash_accounts').delete().eq('id', a.id)
    if (error) setMsg({ t: 'err', m: 'الخزنة عليها حركات ومينفعش تتحذف' }); else load()
  }
  return (
    <>
      <h2>الخزنة</h2>
      <div className="grid">
        <div className="card big"><div className="lbl">إجمالي النقدية</div><div className="val">{money(total)}</div></div>
        {accs.map(a => <div className="card" key={a.id}><div className="lbl">{a.name}</div><div className="val">{money(a.balance)}</div>
          {level >= 3 && <p style={{ margin: '8px 0 0' }}><button className="btn sec sm" onClick={() => setEa({ id: a.id, name: a.name, opening_balance: a.opening_balance })}>تعديل</button>{' '}<button className="btn del sm" onClick={() => delAcc(a)}>حذف</button></p>}</div>)}
      </div>
      {msg && <div className={'msg ' + msg.t}>{msg.m}</div>}
      {level >= 2 && (
        <form className="card" onSubmit={adjust} style={{ marginBottom: 20 }}>
          <strong>إضافة أو سحب مبلغ من الخزنة</strong>
          <div className="row" style={{ marginTop: 10 }}>
            <select value={f.account_id} onChange={e => setF({ ...f, account_id: e.target.value })}>
              <option value="">الخزنة</option>{accs.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <select value={f.direction} onChange={e => setF({ ...f, direction: e.target.value })}>
              <option value="in">إيداع (زيادة)</option><option value="out">سحب (نقص)</option>
            </select>
            <input type="number" min="0.01" step="any" placeholder="المبلغ" value={f.amount} onChange={e => setF({ ...f, amount: e.target.value })} required />
            <input type="date" value={f.date} onChange={e => setF({ ...f, date: e.target.value })} />
            <input placeholder="ملاحظة (السبب)" value={f.note} onChange={e => setF({ ...f, note: e.target.value })} />
          </div>
          <button className="btn">تسجيل</button>
        </form>
      )}
      {level >= 2 && !ea && <p><button className="btn sec" onClick={() => setEa({ name: '', opening_balance: '' })}>إضافة خزنة جديدة</button></p>}
      {ea && (
        <form className="card" onSubmit={saveAcc} style={{ marginBottom: 20 }}>
          <div className="row">
            <input placeholder="اسم الخزنة" value={ea.name} onChange={e => setEa({ ...ea, name: e.target.value })} required />
            <input type="number" step="any" placeholder="الرصيد الافتتاحي" value={ea.opening_balance} onChange={e => setEa({ ...ea, opening_balance: e.target.value })} />
          </div>
          <button className="btn">حفظ</button>{' '}<button type="button" className="btn sec" onClick={() => setEa(null)}>إلغاء</button>
        </form>
      )}
      <h3>آخر الحركات</h3>
      <table>
        <thead><tr><th>التاريخ</th><th>الخزنة</th><th>البيان</th><th>داخل</th><th>خارج</th><th></th></tr></thead>
        <tbody>
          {txs.length === 0 && <tr><td colSpan="6">لا توجد حركات.</td></tr>}
          {txs.map(t => (
            <tr key={t.id}><td>{t.tx_date}</td><td>{t.cash_accounts?.name}</td>
              <td>{SRC[t.source] || t.source}{t.partners?.name && ' - ' + t.partners.name}{t.note && <div className="detail">{t.note}</div>}</td>
              <td style={{ color: 'var(--green)' }}>{t.direction === 'in' ? money(t.amount) : ''}</td>
              <td style={{ color: 'var(--red)' }}>{t.direction === 'out' ? money(t.amount) : ''}</td>
              <td>{level >= 3 && t.source === 'adjustment' && <button className="btn del sm" onClick={() => delTx(t)}>حذف</button>}</td></tr>
          ))}
        </tbody>
      </table>
    </>
  )
}
