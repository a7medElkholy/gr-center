import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { PAGES, RANK } from './perms'
import Dashboard from './Dashboard'
import Invoices from './Invoices'
import Products from './Products'
import Partners from './Partners'
import Expenses from './Expenses'
import Employees from './Employees'
import Users from './Users'
import Cash from './Cash'
import Inventory from './Inventory'

function Login() {
  const [email, setEmail] = useState(''), [pw, setPw] = useState(''), [err, setErr] = useState('')
  async function go(e) {
    e.preventDefault()
    const { error } = await supabase.auth.signInWithPassword({ email, password: pw })
    if (error) setErr('البريد أو كلمة السر غير صحيحة')
  }
  return (
    <form className="login" onSubmit={go}>
      <img src="/logo.jpg" alt="Star Air Life" style={{ width: '100%', maxWidth: 240, margin: '0 auto' }} />
      <h2 style={{ textAlign: 'center', margin: 0 }}>تسجيل الدخول</h2>
      <input type="email" placeholder="البريد الإلكتروني" value={email} onChange={e => setEmail(e.target.value)} required />
      <input type="password" placeholder="كلمة السر" value={pw} onChange={e => setPw(e.target.value)} required />
      {err && <div className="msg err">{err}</div>}
      <button className="btn">دخول</button>
    </form>
  )
}

export default function App() {
  const [session, setSession] = useState(null), [ready, setReady] = useState(false), [page, setPage] = useState(null), [prof, setProf] = useState(null)
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true) })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])
  useEffect(() => {
    if (!session) return setProf(null)
    supabase.from('profiles').select('role,permissions').eq('id', session.user.id).single()
      .then(({ data }) => setProf(data || { role: 'staff', permissions: {} }))
  }, [session])
  if (!ready) return null
  if (!session) return <Login />
  if (!prof) return null

  const admin = prof.role === 'admin'
  const lv = k => (admin ? 3 : RANK[prof.permissions?.[k]] || 0)
  const items = [...PAGES.filter(([k]) => lv(k) >= 1), ...(admin ? [['users', 'المستخدمين']] : [])]
  const cur = page && items.some(([k]) => k === page) ? page : items[0]?.[0]

  let view = <p>مفيش صفحات متاحة لحسابك. كلّم الأدمن.</p>
  if (cur === 'dash') view = <Dashboard />
  else if (cur === 'sale' || cur === 'purchase') view = <Invoices key={cur} type={cur} level={lv(cur)} lv={lv} />
  else if (cur === 'device' || cur === 'material') view = <Products key={cur} kind={cur} level={lv(cur)} />
  else if (cur === 'customer' || cur === 'supplier') view = <Partners key={cur} kind={cur} level={lv(cur)} />
  else if (cur === 'expenses') view = <Expenses level={lv(cur)} />
  else if (cur === 'employees') view = <Employees level={lv(cur)} />
  else if (cur === 'cash') view = <Cash level={lv(cur)} />
  else if (cur === 'inventory') view = <Inventory />
  else if (cur === 'users') view = <Users me={session.user.id} />

  return (
    <div className="layout">
      <aside className="side">
        <div className="logo"><img src="/logo.jpg" alt="Star Air Life" /></div>
        {items.map(([k, t]) => <button key={k} className={cur === k ? 'on' : ''} onClick={() => setPage(k)}>{t}</button>)}
        <button onClick={() => supabase.auth.signOut()}>تسجيل خروج</button>
      </aside>
      <main className="main">{view}</main>
    </div>
  )
}
