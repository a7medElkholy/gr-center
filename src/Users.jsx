import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { PAGES, LEVELS } from './perms'

function PermEditor({ value, onChange }) {
  return (
    <div className="row">
      {PAGES.map(([k, t]) => (
        <label key={k} style={{ fontSize: 13 }}>{t}
          <select value={value[k] || 'none'} onChange={e => onChange({ ...value, [k]: e.target.value })}>
            {LEVELS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
      ))}
    </div>
  )
}

const defaults = () => Object.fromEntries(PAGES.map(([k]) => [k, 'view']))

export default function Users({ me }) {
  const [rows, setRows] = useState([]), [msg, setMsg] = useState(null), [open, setOpen] = useState(false), [ed, setEd] = useState(null)
  const [f, setF] = useState({ email: '', password: '', full_name: '', role: 'staff', permissions: defaults() })
  async function load() {
    const { data } = await supabase.from('profiles').select('*').order('created_at')
    setRows(data || [])
  }
  useEffect(() => { load() }, [])
  async function call(body, ok) {
    setMsg(null)
    const { data, error } = await supabase.functions.invoke('admin-users', { body })
    const err = data?.error || (error && 'تعذر الاتصال بالسيرفر - تأكد إن الـ Edge Function منشورة') || (!data?.ok && 'الدالة المنشورة مش النسخة الصحيحة - انشر ملف index.ts من جديد')
    if (err) return setMsg({ t: 'err', m: err })
    setMsg({ t: 'ok', m: ok }); load(); return true
  }
  async function create(e) {
    e.preventDefault()
    if (await call({ action: 'create', ...f }, 'تم إنشاء المستخدم')) { setF({ email: '', password: '', full_name: '', role: 'staff', permissions: defaults() }); setOpen(false) }
  }
  function changePw(u) {
    const p = prompt('كلمة السر الجديدة لـ ' + u.email + ' (6 حروف على الأقل)')
    if (p) call({ action: 'password', id: u.id, password: p }, 'تم تغيير كلمة السر')
  }
  function del(u) { if (confirm('حذف المستخدم ' + u.email + '؟')) call({ action: 'delete', id: u.id }, 'تم حذف المستخدم') }
  async function savePerms() {
    if (await call({ action: 'perms', id: ed.id, permissions: ed.perms }, 'تم حفظ الصلاحيات')) setEd(null)
  }
  return (
    <>
      <h2>المستخدمين</h2>
      <p><button className="btn" onClick={() => setOpen(!open)}>{open ? 'إغلاق' : 'إضافة مستخدم'}</button></p>
      {msg && <div className={'msg ' + msg.t}>{msg.m}</div>}
      {open && (
        <form className="card" onSubmit={create} style={{ marginBottom: 20 }}>
          <div className="row">
            <input placeholder="الاسم" value={f.full_name} onChange={e => setF({ ...f, full_name: e.target.value })} />
            <input type="email" placeholder="البريد الإلكتروني" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} required />
            <input type="text" placeholder="كلمة السر" value={f.password} onChange={e => setF({ ...f, password: e.target.value })} required minLength={6} />
            <select value={f.role} onChange={e => setF({ ...f, role: e.target.value })}>
              <option value="staff">موظف</option><option value="admin">أدمن (كل الصلاحيات)</option>
            </select>
          </div>
          {f.role === 'staff' && <><strong>الصلاحيات</strong><PermEditor value={f.permissions} onChange={p => setF({ ...f, permissions: p })} /></>}
          <button className="btn">إنشاء</button>
        </form>
      )}
      <table>
        <thead><tr><th>الاسم</th><th>البريد</th><th>النوع</th><th></th></tr></thead>
        <tbody>
          {rows.map(u => (
            <>
              <tr key={u.id}><td>{u.full_name}</td><td>{u.email}</td>
                <td>{u.id === me ? 'أدمن (أنت)' : (
                  <select value={u.role} onChange={e => call({ action: 'role', id: u.id, role: e.target.value }, 'تم تغيير النوع')}>
                    <option value="staff">موظف</option><option value="admin">أدمن</option>
                  </select>)}</td>
                <td>
                  {u.role === 'staff' && <button className="btn sec sm" onClick={() => setEd(ed?.id === u.id ? null : { id: u.id, perms: { ...u.permissions } })}>الصلاحيات</button>}{' '}
                  <button className="btn sec sm" onClick={() => changePw(u)}>تغيير الباسورد</button>{' '}
                  {u.id !== me && <button className="btn del sm" onClick={() => del(u)}>حذف</button>}</td></tr>
              {ed?.id === u.id && (
                <tr key={u.id + 'p'}><td colSpan="4">
                  <PermEditor value={ed.perms} onChange={p => setEd({ ...ed, perms: p })} />
                  <button className="btn" onClick={savePerms}>حفظ الصلاحيات</button>
                </td></tr>
              )}
            </>
          ))}
        </tbody>
      </table>
    </>
  )
}
