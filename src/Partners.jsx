import { useEffect, useState } from 'react'
import { supabase, money } from './supabase'
const JOBS = { install: 'تركيبات', prepare: 'تجهيزات', maintenance: 'صيانة', supply: 'توريدات' }

function Statement({ p, kind, onBack, level }) {
  const isC = kind === 'customer'
  const [rows, setRows] = useState([]), [accounts, setAccounts] = useState([]), [msg, setMsg] = useState(null)
  const [pay, setPay] = useState({ amount: '', account_id: '', note: '', date: new Date().toISOString().slice(0, 10) })
  async function load() {
    const [inv, tx, ac] = await Promise.all([
      supabase.from('invoices').select('id,invoice_date,total,paid,notes,created_at,discount,is_lump,job_type,technician,indoor_info,outdoor_info').eq('partner_id', p.id),
      supabase.from('cash_transactions').select('id,tx_date,amount,note,created_at').eq('partner_id', p.id).eq('source', 'partner_payment'),
      supabase.from('cash_accounts').select('id,name'),
    ])
    const all = [
      ...(inv.data || []).map(i => ({ k: 'i' + i.id, date: i.invoice_date, at: i.created_at, text: (isC ? (JOBS[i.job_type] || 'فاتورة بيع') : 'فاتورة شراء') + (i.is_lump ? ' (مجمعة)' : '') + (i.notes ? ' - ' + i.notes : ''),
        detail: [i.technician && 'الفني: ' + i.technician, i.indoor_info && 'داخلية: ' + i.indoor_info, i.outdoor_info && 'خارجية: ' + i.outdoor_info, Number(i.discount) > 0 && 'خصم: ' + money(i.discount), 'المتبقي: ' + money(Number(i.total) - Number(i.paid))].filter(Boolean).join(' | '),
        debit: Number(i.total), credit: Number(i.paid) })),
      ...(tx.data || []).map(t => ({ pid: t.id, k: 't' + t.id, date: t.tx_date, at: t.created_at, text: 'دفعة' + (t.note ? ' - ' + t.note : ''), debit: 0, credit: Number(t.amount) })),
    ].sort((a, b) => (a.date + a.at).localeCompare(b.date + b.at))
    let bal = Number(p.opening_balance)
    setRows(all.map(r => ({ ...r, bal: (bal += r.debit - r.credit) })))
    setAccounts(ac.data || [])
  }
  useEffect(() => { load() }, [p.id])
  async function delPay(id) {
    if (!confirm('حذف الدفعة؟')) return
    await supabase.from('cash_transactions').delete().eq('id', id); load()
  }
  const balance = rows.length ? rows[rows.length - 1].bal : Number(p.opening_balance)
  async function savePay(e) {
    e.preventDefault(); setMsg(null)
    if (!pay.account_id) return setMsg({ t: 'err', m: 'اختار الخزنة' })
    const { error } = await supabase.from('cash_transactions').insert({
      account_id: pay.account_id, direction: isC ? 'in' : 'out', amount: pay.amount, source: 'partner_payment',
      partner_id: p.id, note: pay.note, tx_date: pay.date })
    if (error) return setMsg({ t: 'err', m: error.message })
    setMsg({ t: 'ok', m: 'تم تسجيل الدفعة' }); setPay({ ...pay, amount: '', note: '' }); load()
  }
  const status = balance > 0 ? (isC ? 'عليه لينا' : 'علينا له') : balance < 0 ? (isC ? 'له عندنا' : 'لينا عنده') : 'الحساب متساوي'
  return (
    <>
      <p><button className="btn sec" onClick={onBack}>رجوع</button></p>
      <h2>كشف حساب: {p.name}</h2>
      <div className={'card ' + (balance > 0 ? (isC ? 'warn' : 'bad') : 'big')} style={{ marginBottom: 16 }}>
        <div className="lbl">{status}</div><div className="val">{money(Math.abs(balance))}</div>
      </div>
      {level >= 2 && <form className="card" onSubmit={savePay} style={{ marginBottom: 20 }}>
        <strong>{isC ? 'تسجيل دفعة مستلمة من العميل' : 'تسجيل دفعة مدفوعة للمورد'}</strong>
        <div className="row" style={{ marginTop: 10 }}>
          <input type="number" min="0.01" step="any" placeholder="المبلغ" value={pay.amount} onChange={e => setPay({ ...pay, amount: e.target.value })} required />
          <select value={pay.account_id} onChange={e => setPay({ ...pay, account_id: e.target.value })}>
            <option value="">الخزنة</option>{accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <input type="date" value={pay.date} onChange={e => setPay({ ...pay, date: e.target.value })} />
          <input placeholder="ملاحظة" value={pay.note} onChange={e => setPay({ ...pay, note: e.target.value })} />
        </div>
        <button className="btn">تسجيل الدفعة</button>
        {msg && <div className={'msg ' + msg.t}>{msg.m}</div>}
      </form>}
      <table>
        <thead><tr><th>التاريخ</th><th>البيان</th><th>{isC ? 'مبيعات' : 'مشتريات'}</th><th>مدفوع</th><th>الرصيد</th><th></th></tr></thead>
        <tbody>
          <tr><td>-</td><td>رصيد أول المدة</td><td colSpan="2"></td><td>{money(p.opening_balance)}</td></tr>
          {rows.map(r => <tr key={r.k}><td>{r.date}</td><td>{r.text}{r.detail && <div className="detail">{r.detail}</div>}</td><td>{r.debit ? money(r.debit) : ''}</td><td>{r.credit ? money(r.credit) : ''}</td><td>{money(r.bal)}</td><td>{r.pid && level >= 3 && <button className="btn del sm" onClick={() => delPay(r.pid)}>حذف</button>}</td></tr>)}
        </tbody>
      </table>
    </>
  )
}

export default function Partners({ kind, level = 3 }) {
  const isC = kind === 'customer'
  const [rows, setRows] = useState([]), [sel, setSel] = useState(null), [open, setOpen] = useState(false)
  const [f, setF] = useState({ name: '', phone: '', address: '', opening_balance: 0 }), [err, setErr] = useState(''), [eid, setEid] = useState(null)
  async function load() {
    const { data } = await supabase.from('v_partner_balance').select('*').eq('kind', kind).order('name')
    setRows(data || [])
  }
  useEffect(() => { load() }, [kind])
  async function save(e) {
    e.preventDefault(); setErr('')
    const body = { name: f.name, phone: f.phone, address: f.address, opening_balance: (Math.abs(+f.opening_balance) || 0) * (f.opening_dir === 'credit' ? -1 : 1) }
    const { error } = eid ? await supabase.from('partners').update(body).eq('id', eid) : await supabase.from('partners').insert({ ...body, kind })
    if (error) return setErr(error.message)
    setF({ name: '', phone: '', address: '', opening_balance: 0 }); setOpen(false); setEid(null); load()
  }
  async function edit(r) {
    const { data } = await supabase.from('partners').select('address').eq('id', r.id).single()
    setF({ name: r.name, phone: r.phone || '', address: data?.address || '', opening_balance: Math.abs(r.opening_balance), opening_dir: r.opening_balance < 0 ? 'credit' : 'debit' }); setEid(r.id); setOpen(true); setErr('')
  }
  async function del(r) {
    if (!confirm('حذف ' + r.name + '؟')) return
    const { error } = await supabase.from('partners').delete().eq('id', r.id)
    if (error) setErr('مينفعش يتحذف لوجود فواتير أو دفعات عليه'); else load()
  }
  if (sel) return <Statement p={sel} kind={kind} level={level} onBack={() => { setSel(null); load() }} />
  const pos = rows.filter(r => r.balance > 0).reduce((s, r) => s + Number(r.balance), 0)
  const neg = rows.filter(r => r.balance < 0).reduce((s, r) => s - Number(r.balance), 0)
  return (
    <>
      <h2>{isC ? 'العملاء' : 'الموردين'}</h2>
      <div className="grid">
        <div className={'card ' + (isC ? 'warn' : 'bad')}><div className="lbl">{isC ? 'إجمالي لينا عند العملاء' : 'إجمالي علينا للموردين'}</div><div className="val">{money(pos)}</div></div>
        <div className="card big"><div className="lbl">{isC ? 'إجمالي علينا للعملاء (رصيد لهم)' : 'إجمالي لينا عند الموردين (رصيد لينا)'}</div><div className="val">{money(neg)}</div></div>
      </div>
      {level >= 2 && <p><button className="btn" onClick={() => { setOpen(!open); setEid(null); setF({ name: '', phone: '', address: '', opening_balance: 0 }) }}>{open ? 'إغلاق' : isC ? 'إضافة عميل' : 'إضافة مورد'}</button></p>}
      {err && <div className="msg err">{err}</div>}
      {open && (
        <form className="card" onSubmit={save} style={{ marginBottom: 20 }}>
          <div className="row">
            <input placeholder="الاسم" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} required />
            <input placeholder="التليفون" value={f.phone} onChange={e => setF({ ...f, phone: e.target.value })} />
            <input placeholder="العنوان" value={f.address} onChange={e => setF({ ...f, address: e.target.value })} />
            <input type="number" step="any" placeholder="رصيد سابق (اختياري)" value={f.opening_balance} onChange={e => setF({ ...f, opening_balance: e.target.value })} />
            <select value={f.opening_dir || 'debit'} onChange={e => setF({ ...f, opening_dir: e.target.value })} aria-label="اتجاه الرصيد السابق">
              <option value="debit">{isC ? 'عليه لينا' : 'علينا له'}</option><option value="credit">{isC ? 'له عندنا' : 'لينا عنده'}</option>
            </select>
          </div>
          <button className="btn">حفظ</button>
        </form>
      )}
      <table>
        <thead><tr><th>الاسم</th><th>التليفون</th><th>الحساب</th><th></th></tr></thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan="4">لا توجد بيانات. اضغط زر الإضافة.</td></tr>}
          {rows.map(r => {
            const b = Number(r.balance)
            const t = b > 0 ? (isC ? 'عليه لينا ' : 'علينا له ') : b < 0 ? (isC ? 'له عندنا ' : 'لينا عنده ') : 'متساوي'
            return <tr key={r.id}><td>{r.name}</td><td>{r.phone || '-'}</td>
              <td style={{ fontWeight: 600, color: b === 0 ? 'inherit' : b > 0 ? (isC ? 'var(--amber)' : 'var(--red)') : 'var(--green)' }}>{t}{b !== 0 && money(Math.abs(b))}</td>
              <td><button className="btn sec sm" onClick={() => setSel(r)}>كشف الحساب والدفعات</button>{level >= 3 && <>{' '}<button className="btn sec sm" onClick={() => edit(r)}>تعديل</button>{' '}<button className="btn del sm" onClick={() => del(r)}>حذف</button></>}</td></tr>
          })}
        </tbody>
      </table>
    </>
  )
}
