import { useEffect, useState } from 'react'
import { supabase, money } from './supabase'

export default function Products({ kind, level = 3 }) {
  const label = kind === 'device' ? 'الأجهزة' : 'الخامات'
  const blank = { name: '', sku: '', unit: kind === 'device' ? 'جهاز' : 'قطعة', buy_price: '', sell_price: '', min_stock: '' }
  const [rows, setRows] = useState([]), [f, setF] = useState(blank), [open, setOpen] = useState(false), [err, setErr] = useState(''), [eid, setEid] = useState(null)
  async function load() {
    const { data } = await supabase.from('v_stock').select('*').eq('kind', kind).order('name')
    const { data: pr } = await supabase.from('products').select('id,unit,buy_price,sell_price,sku').eq('kind', kind)
    const m = Object.fromEntries((pr || []).map(p => [p.id, p]))
    setRows((data || []).map(r => ({ ...r, ...m[r.id] })))
  }
  useEffect(() => { load() }, [kind])
  async function save(e) {
    e.preventDefault(); setErr('')
    const body = { ...f, kind, sku: f.sku || null, buy_price: +f.buy_price || 0, sell_price: +f.sell_price || 0, min_stock: +f.min_stock || 0 }
    const { error } = eid ? await supabase.from('products').update(body).eq('id', eid) : await supabase.from('products').insert(body)
    if (error) return setErr(error.message.includes('sku') ? 'الكود مستخدم قبل كده' : error.message)
    setF(blank); setOpen(false); setEid(null); load()
  }
  function edit(r) {
    setF({ name: r.name, sku: r.sku || '', unit: r.unit, buy_price: r.buy_price, sell_price: r.sell_price, min_stock: r.min_stock })
    setEid(r.id); setOpen(true); setErr('')
  }
  async function del(r) {
    if (!confirm('حذف ' + r.name + '؟')) return
    const { error } = await supabase.from('products').delete().eq('id', r.id)
    if (error) setErr('الصنف مستخدم في فواتير ومينفعش يتحذف'); else load()
  }
  return (
    <>
      <h2>{label}</h2>
      {level >= 2 && <p><button className="btn" onClick={() => { setOpen(!open); setEid(null); setF(blank) }}>{open ? 'إغلاق' : 'إضافة صنف'}</button></p>}
      {err && <div className="msg err">{err}</div>}
      {open && (
        <form className="card" onSubmit={save} style={{ marginBottom: 20 }}>
          <div className="row">
            <input placeholder="الاسم" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} required />
            <input placeholder="الكود (اختياري)" value={f.sku} onChange={e => setF({ ...f, sku: e.target.value })} />
            <input placeholder="الوحدة" value={f.unit} onChange={e => setF({ ...f, unit: e.target.value })} />
          </div>
          <div className="row">
            <input type="number" step="any" min="0" placeholder="سعر الشراء" value={f.buy_price} onChange={e => setF({ ...f, buy_price: e.target.value })} />
            <input type="number" step="any" min="0" placeholder="سعر البيع" value={f.sell_price} onChange={e => setF({ ...f, sell_price: e.target.value })} />
            <input type="number" step="any" min="0" placeholder="الحد الأدنى" value={f.min_stock} onChange={e => setF({ ...f, min_stock: e.target.value })} />
          </div>
          <button className="btn">حفظ</button>
        </form>
      )}
      <table>
        <thead><tr><th>الاسم</th><th>الكود</th><th>المتاح</th><th>سعر الشراء</th><th>سعر البيع</th><th>الحد الأدنى</th><th></th></tr></thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan="7">لا توجد أصناف. اضغط "إضافة صنف".</td></tr>}
          {rows.map(r => (
            <tr key={r.id}><td>{r.name}</td><td>{r.sku || '-'}</td>
              <td style={{ color: Number(r.qty_on_hand) <= Number(r.min_stock) ? 'var(--red)' : 'inherit', fontWeight: 600 }}>{r.qty_on_hand} {r.unit}</td>
              <td>{money(r.buy_price)}</td><td>{money(r.sell_price)}</td><td>{r.min_stock}</td><td>{level >= 3 && <><button className="btn sec sm" onClick={() => edit(r)}>تعديل</button>{' '}<button className="btn del sm" onClick={() => del(r)}>حذف</button></>}</td></tr>
          ))}
        </tbody>
      </table>
    </>
  )
}
