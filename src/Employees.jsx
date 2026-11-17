import { useEffect, useState } from 'react'
import { supabase, money } from './supabase'
import Casual from './Casual'

function Row({ emp, sal, month, accounts, onDone, onEdit, onDel, level }) {
  const [v, setV] = useState({ bonus: '', deduction: '', advance: '', account_id: '' }), [err, setErr] = useState('')
  const base = Number(emp.base_salary), net = base + +v.bonus - +v.deduction - +v.advance
  async function pay() {
    setErr('')
    if (!v.account_id) return setErr('اختار الخزنة')
    const { data: s, error } = await supabase.from('salaries').insert({ employee_id: emp.id, month: month + '-01', base, bonus: +v.bonus || 0, deduction: +v.deduction || 0, advance: +v.advance || 0, paid: true }).select().single()
    if (error) return setErr(error.message)
    const tx = await supabase.from('cash_transactions').insert({ account_id: v.account_id, direction: 'out', amount: s.net, source: 'salary', salary_id: s.id, note: 'مرتب ' + emp.name, tx_date: new Date().toISOString().slice(0, 10) })
    if (tx.error) { await supabase.from('salaries').delete().eq('id', s.id); return setErr(tx.error.message) }
    onDone()
  }
  const nameCell = <td>{emp.name}{level >= 3 && <><br /><button className="btn sec sm" onClick={() => onEdit(emp)}>تعديل</button>{' '}<button className="btn del sm" onClick={() => onDel(emp)}>حذف</button></>}</td>
  async function undo() {
    if (!confirm('إلغاء صرف المرتب؟ هيرجع المبلغ للخزنة')) return
    await supabase.from('cash_transactions').delete().eq('salary_id', sal.id)
    await supabase.from('salaries').delete().eq('id', sal.id); onDone()
  }
  if (sal) return <tr>{nameCell}<td>{money(sal.base)}</td><td>{money(sal.bonus)}</td><td>{money(sal.deduction)}</td><td>{money(sal.advance)}</td><td>{money(sal.net)}</td><td>تم الصرف {level >= 3 && <button className="btn sec sm" onClick={undo}>إلغاء الصرف</button>}</td></tr>
  const inp = k => <input type="number" min="0" step="any" value={v[k]} onChange={e => setV({ ...v, [k]: e.target.value })} aria-label={k} placeholder={{ bonus: 'حوافز', deduction: 'خصومات', advance: 'سلف' }[k]} />
  return (
    <tr>{nameCell}<td>{money(base)}</td><td>{inp('bonus')}</td><td>{inp('deduction')}</td><td>{inp('advance')}</td><td>{money(net)}</td>
      <td><select value={v.account_id} onChange={e => setV({ ...v, account_id: e.target.value })}><option value="">الخزنة</option>{accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
        {level >= 2 && <button className="btn" onClick={pay} style={{ marginTop: 6 }}>صرف المرتب</button>}{err && <div className="msg err">{err}</div>}</td></tr>
  )
}

function Staff({ level = 3 }) {
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7)), [emps, setEmps] = useState([]), [sals, setSals] = useState([]), [accounts, setAccounts] = useState([])
  const [f, setF] = useState({ name: '', job_title: '', base_salary: '' }), [open, setOpen] = useState(false), [eid, setEid] = useState(null)
  async function load() {
    const [e, s, a] = await Promise.all([
      supabase.from('employees').select('*').eq('active', true).order('name'),
      supabase.from('salaries').select('*').eq('month', month + '-01'),
      supabase.from('cash_accounts').select('id,name'),
    ])
    setEmps(e.data || []); setSals(s.data || []); setAccounts(a.data || [])
  }
  useEffect(() => { load() }, [month])
  async function add(e) {
    e.preventDefault()
    if (eid) await supabase.from('employees').update(f).eq('id', eid)
    else await supabase.from('employees').insert(f)
    setF({ name: '', job_title: '', base_salary: '' }); setOpen(false); setEid(null); load()
  }
  function edit(e) { setF({ name: e.name, job_title: e.job_title || '', base_salary: e.base_salary }); setEid(e.id); setOpen(true) }
  async function del(e) {
    if (!confirm('حذف ' + e.name + ' من قائمة الموظفين؟ (سجل مرتباته القديمة هيفضل محفوظ)')) return
    await supabase.from('employees').update({ active: false }).eq('id', e.id); load()
  }
  const paidTotal = sals.reduce((s, x) => s + Number(x.net), 0)
  return (
    <>
            {level >= 2 && <p><button className="btn" onClick={() => { setOpen(!open); setEid(null); setF({ name: '', job_title: '', base_salary: '' }) }}>{open ? 'إغلاق' : 'إضافة موظف'}</button></p>}
      {open && (
        <form className="card" onSubmit={add} style={{ marginBottom: 20 }}>
          <div className="row">
            <input placeholder="الاسم" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} required />
            <input placeholder="الوظيفة" value={f.job_title} onChange={e => setF({ ...f, job_title: e.target.value })} />
            <input type="number" min="0" step="any" placeholder="المرتب الأساسي" value={f.base_salary} onChange={e => setF({ ...f, base_salary: e.target.value })} required />
          </div>
          <button className="btn">حفظ</button>
        </form>
      )}
      <p>شهر المرتبات: <input type="month" value={month} onChange={e => setMonth(e.target.value)} style={{ width: 'auto' }} /> — إجمالي المصروف: <strong>{money(paidTotal)}</strong></p>
      <table>
        <thead><tr><th>الموظف</th><th>الأساسي</th><th>حوافز</th><th>خصومات</th><th>سلف</th><th>الصافي</th><th>الحالة</th></tr></thead>
        <tbody>
          {emps.length === 0 && <tr><td colSpan="7">لا يوجد موظفين. اضغط "إضافة موظف".</td></tr>}
          {emps.map(e => <Row key={e.id + month} emp={e} sal={sals.find(s => s.employee_id === e.id)} month={month} accounts={accounts} onDone={load} onEdit={edit} onDel={del} level={level} />)}
        </tbody>
      </table>
    </>
  )
}

export default function Employees({ level = 3 }) {
  const [tab, setTab] = useState('staff')
  return (
    <>
      <h2>الموظفين والمرتبات</h2>
      <p>
        <button className={'btn ' + (tab === 'staff' ? '' : 'sec')} onClick={() => setTab('staff')}>الموظفين المنتظمين</button>{' '}
        <button className={'btn ' + (tab === 'casual' ? '' : 'sec')} onClick={() => setTab('casual')}>العمالة غير المنتظمة</button>
      </p>
      {tab === 'staff' ? <Staff level={level} /> : <Casual level={level} />}
    </>
  )
}
