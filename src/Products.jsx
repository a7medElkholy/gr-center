import { useEffect, useState } from 'react'
import { supabase, money } from './supabase'

export default function Products({ kind, level = 3 }) {
  const isDev = kind === 'device'
  const label = isDev ? 'الأجهزة' : 'الخامات'
  const blank = { name: '', sku: '', description: '', indoor_unit: '', outdoor_unit: '', sold_by: 'meter', diameter: '', buy_price: '', min_stock: '' }
  const [rows, setRows] = useState([]), [f, setF] = useState(blank), [open, setOpen] = useState(false), [err, setErr] = useState(''), [eid, setEid] = useState(null)
  async function load() {
    const { data } = await supabase.from('v_stock').select('*').eq('kind', kind).order('name')
    const { data: pr } = await supabase.from('products').select('id,unit,buy_price,sku,description,indoor_unit,outdoor_unit,sold_by,diameter').eq('kind', kind)
    const m = Object.fromEntries((pr || []).map(p => [p.id, p]))
    setRows((data || []).map(r => ({ ...r, ...m[r.id] })))
  }
  useEffect(() => { load() }, [kind])
  async function save(e) {
    e.preventDefault(); setErr('')
    const coil = f.sold_by === 'coil'
    const body = {
      kind, name: f.name, sku: f.sku || null, description: f.description,
      indoor_unit: isDev ? f.indoor_unit : null, outdoor_unit: isDev ? f.outdoor_unit : null,
      sold_by: isDev ? null : f.sold_by, diameter: !isDev && coil ? f.diameter : null,
      unit: isDev ? 'جهاز' : coil ? 'لفة' : 'متر',
      buy_price: +f.buy_price || 0, min_stock: +f.min_stock || 0,
    }
    const { error } = eid ? await supabase.from('products').update(body).eq('id', eid) : await supabase.from('products').insert(body)
    if (error) return setErr(error.message.includes('sku') ? 'الكود مستخدم قبل كده' : error.message)
    setF(blank); setOpen(false); setEid(null); load()
  }
  function edit(r) {
    setF({ name: r.name, sku: r.sku || '', description: r.description || '', indoor_unit: r.indoor_unit || '', outdoor_unit: r.outdoor_unit || '', sold_by: r.sold_by || 'meter', diameter: r.diameter || '', buy_price: r.buy_price, min_stock: r.min_stock })
    setEid(r.id); setOpen(true); setErr('')
  }
  async function del(r) {
    if (!confirm('حذف ' + r.name + '؟')) return
    const { error } = await supabase.from('products').delete().eq('id', r.id)
    if (error) setErr('الصنف مستخدم في فواتير ومينفعش يتحذف'); else load()
  }
  const set = k => e => setF({ ...f, [k]: e.target.value })
  return (
    <>
      <h2>{label}</h2>
      {level >= 2 && <p><button className="btn" onClick={() => { setOpen(!open); setEid(null); setF(blank) }}>{open ? 'إغلاق' : isDev ? 'إضافة جهاز' : 'إضافة خامة'}</button></p>}
      {err && <div className="msg err">{err}</div>}
      {open && (
        <form className="card" onSubmit={save} style={{ marginBottom: 20 }}>
          <div className="row">
            <input placeholder="الاسم" value={f.name} onChange={set('name')} required />
            <input placeholder="الكود (اختياري)" value={f.sku} onChange={set('sku')} />
            <input placeholder="الوصف" value={f.description} onChange={set('description')} />
          </div>
          {isDev ? (
            <div className="row">
              <input placeholder="بيانات الوحدة الداخلية" value={f.indoor_unit} onChange={set('indoor_unit')} />
              <input placeholder="بيانات الوحدة الخارجية" value={f.outdoor_unit} onChange={set('outdoor_unit')} />
            </div>
          ) : (
            <div className="row">
              <select value={f.sold_by} onChange={set('sold_by')} aria-label="طريقة الشراء">
                <option value="meter">بالمتر</option><option value="coil">باللفة</option>
              </select>
              {f.sold_by === 'coil' && <input placeholder="القطر (مثال: 3/8 بوصة)" value={f.diameter} onChange={set('diameter')} required />}
            </div>
          )}
          <div className="row">
            <input type="number" step="any" min="0" placeholder="سعر الشراء" value={f.buy_price} onChange={set('buy_price')} />
            <input type="number" step="any" min="0" placeholder="الحد الأدنى للتنبيه" value={f.min_stock} onChange={set('min_stock')} />
          </div>
          <button className="btn">{eid ? 'حفظ التعديل' : 'حفظ'}</button>
        </form>
      )}
      <table>
        <thead><tr>
          <th>الاسم</th><th>الوصف</th>
          {isDev ? <><th>الوحدة الداخلية</th><th>الوحدة الخارجية</th></> : <th>طريقة الشراء</th>}
          <th>المتاح</th><th>سعر الشراء</th><th>الحد الأدنى</th><th></th>
        </tr></thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan="8">لا توجد بيانات. اضغط زر الإضافة.</td></tr>}
          {rows.map(r => (
            <tr key={r.id}><td>{r.name}{r.sku && <div className="detail">{r.sku}</div>}</td><td>{r.description || '-'}</td>
              {isDev ? <><td>{r.indoor_unit || '-'}</td><td>{r.outdoor_unit || '-'}</td></>
                : <td>{r.sold_by === 'coil' ? 'باللفة - قطر ' + (r.diameter || '-') : 'بالمتر'}</td>}
              <td style={{ color: Number(r.qty_on_hand) <= Number(r.min_stock) ? 'var(--red)' : 'inherit', fontWeight: 600 }}>{r.qty_on_hand} {r.unit}</td>
              <td>{money(r.buy_price)}</td><td>{r.min_stock}</td>
              <td>{level >= 3 && <><button className="btn sec sm" onClick={() => edit(r)}>تعديل</button>{' '}<button className="btn del sm" onClick={() => del(r)}>حذف</button></>}</td></tr>
          ))}
        </tbody>
      </table>
    </>
  )
}
