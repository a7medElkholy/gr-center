import { useEffect, useState } from 'react'
import { supabase, money } from './supabase'

const today = () => new Date().toISOString().slice(0, 10)
const blank = () => ({ worker_name: '', work_date: today(), amount: '', project: '', details: '', account_id: '' })

export default function Casual({ level = 3 }) {
  const [month, setMonth] = useState(today().slice(0, 7)), [rows, setRows] = useState([]), [accounts, setAccounts] = useState([])
  const [names, setNames] = useState({ w: [], p: [] }), [f, setF] = useState(blank()), [eid, setEid] = useState(null), [open, setOpen] = useState(false), [msg, setMsg] = useState(null)
  async function load() {
    const from = month + '-01', d = new Date(from + 'T12:00:00'); d.setMonth(d.getMonth() + 1)
    const [r, a, all] = await Promise.all([
      supabase.from('casual_labor').select('*').gte('work_date', from).lt('work_date', d.toISOString().slice(0, 10)).order('work_date', { ascending: false }),
      supabase.from('cash_accounts').select('id,name'),
      supabase.from('casual_labor').select('worker_name,project').limit(500),
    ])
    setRows(r.data || []); setAccounts(a.data || [])
    const u = k => [...new Set((all.data || []).map(x => x[k]).filter(Boolean))]
    setNames({ w: u('worker_name'), p: u('project') })
  }
  useEffect(() => { load() }, [month])

  async function save(e) {
    e.preventDefault(); setMsg(null)
    if (!f.account_id) return setMsg({ t: 'err', m: 'اختار الخزنة اللي اتدفع منها' })
    const body = { worker_name: f.worker_name, work_date: f.work_date, amount: +f.amount, project: f.project, details: f.details }
    if (eid) {
      const a = await supabase.from('casual_labor').update(body).eq('id', eid)
      const b = await supabase.from('cash_transactions').update({ account_id: f.account_id, amount: +f.amount, tx_date: f.work_date, note: 'عمالة: ' + f.worker_name }).eq('casual_id', eid)
      if (a.error || b.error) return setMsg({ t: 'err', m: (a.error || b.error).message })
      setMsg({ t: 'ok', m: 'تم حفظ التعديل' })
    } else {
      const { data, error } = await supabase.from('casual_labor').insert(body).select().single()
      if (error) return setMsg({ t: 'err', m: error.message })
      const tx = await supabase.from('cash_transactions').insert({ account_id: f.account_id, direction: 'out', amount: +f.amount, source: 'casual', casual_id: data.id, note: 'عمالة: ' + f.worker_name, tx_date: f.work_date })
      if (tx.error) { await supabase.from('casual_labor').delete().eq('id', data.id); return setMsg({ t: 'err', m: tx.error.message }) }
      setMsg({ t: 'ok', m: 'تم تسجيل الأجر وخصمه من الخزنة' })
    }
    setEid(null); setF({ ...blank(), account_id: f.account_id }); load()
  }
  async function edit(r) {
    const { data } = await supabase.from('cash_transactions').select('account_id').eq('casual_id', r.id).limit(1)
    setF({ worker_name: r.worker_name, work_date: r.work_date, amount: r.amount, project: r.project || '', details: r.details || '', account_id: data?.[0]?.account_id || '' })
    setEid(r.id); setOpen(true); setMsg(null); window.scrollTo(0, 0)
  }
  async function del(r) {
    if (!confirm('حذف الأجر ده؟ هيرجع المبلغ للخزنة')) return
    await supabase.from('casual_labor').delete().eq('id', r.id); load()
  }
  const total = rows.reduce((s, r) => s + Number(r.amount), 0)
  const byProject = Object.entries(rows.reduce((o, r) => { const k = r.project || 'بدون مشروع'; o[k] = (o[k] || 0) + Number(r.amount); return o }, {}))
  const set = k => e => setF({ ...f, [k]: e.target.value })
  return (
    <>
      {level >= 2 && <p><button className="btn" onClick={() => { setOpen(!open); setEid(null); setF(blank()) }}>{open ? 'إغلاق' : 'تسجيل أجر عامل'}</button></p>}
      {msg && <div className={'msg ' + msg.t}>{msg.m}</div>}
      {open && (
        <form className="card" onSubmit={save} style={{ marginBottom: 20 }} >
          <div className="row">
            <input list="cw" placeholder="اسم العامل" value={f.worker_name} onChange={set('worker_name')} required />
            <datalist id="cw">{names.w.map(n => <option key={n} value={n} />)}</datalist>
            <input type="date" value={f.work_date} onChange={set('work_date')} />
            <input type="number" min="0.01" step="any" placeholder="الأجر (المرتب)" value={f.amount} onChange={set('amount')} required />
            <input list="cp" placeholder="اسم المشروع" value={f.project} onChange={set('project')} />
            <datalist id="cp">{names.p.map(n => <option key={n} value={n} />)}</datalist>
          </div>
          <div className="row">
            <input placeholder="بيانات العامل (تليفون، رقم قومي، نوع الشغل...)" value={f.details} onChange={set('details')} />
            <select value={f.account_id} onChange={set('account_id')}>
              <option value="">دفعت من خزنة</option>{accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <button className="btn">{eid ? 'حفظ التعديل' : 'تسجيل'}</button>
        </form>
      )}
      <p>الشهر: <input type="month" value={month} onChange={e => setMonth(e.target.value)} style={{ width: 'auto' }} /></p>
      <div className="grid">
        <div className="card big"><div className="lbl">إجمالي أجور الشهر</div><div className="val">{money(total)}</div></div>
        {byProject.map(([k, v]) => <div className="card" key={k}><div className="lbl">مشروع: {k}</div><div className="val">{money(v)}</div></div>)}
      </div>
      <table>
        <thead><tr><th>التاريخ</th><th>العامل</th><th>المشروع</th><th>الأجر</th><th></th></tr></thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan="5">لا توجد أجور في الشهر ده.</td></tr>}
          {rows.map(r => (
            <tr key={r.id}><td>{r.work_date}</td><td>{r.worker_name}{r.details && <div className="detail">{r.details}</div>}</td><td>{r.project || '-'}</td><td>{money(r.amount)}</td>
              <td>{level >= 3 && <><button className="btn sec sm" onClick={() => edit(r)}>تعديل</button>{' '}<button className="btn del sm" onClick={() => del(r)}>حذف</button></>}</td></tr>
          ))}
        </tbody>
      </table>
    </>
  )
}
