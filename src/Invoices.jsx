import { useEffect, useState } from 'react'
import { supabase, money } from './supabase'

const empty = () => ({ product_id: '', qty: '', price: '' })
const JOBS = { install: 'تركيبات', prepare: 'تجهيزات', maintenance: 'صيانة', supply: 'توريدات' }
const today = () => new Date().toISOString().slice(0, 10)
const blankF = () => ({ partner_id: '', date: today(), paid: '', account_id: '', notes: '', discount: '', lump: false, lump_total: '', job_type: 'install', technician: '', indoor_info: '', outdoor_info: '' })
const blankNq = () => ({ name: '', phone: '', kind: 'device', buy_price: '', sold_by: 'meter', diameter: '' })

export default function Invoices({ type, level = 3, lv = () => 3 }) {
  const isSale = type === 'sale'
  const [list, setList] = useState([]), [partners, setPartners] = useState([]), [products, setProducts] = useState([]), [accounts, setAccounts] = useState([]), [techs, setTechs] = useState([])
  const [open, setOpen] = useState(false), [msg, setMsg] = useState(null), [eid, setEid] = useState(null), [qa, setQa] = useState(null)
  const [nq, setNq] = useState(blankNq()), [f, setF] = useState(blankF()), [items, setItems] = useState([empty()])
  const subtotal = f.lump ? +f.lump_total || 0 : items.reduce((s, i) => s + (+i.qty || 0) * (+i.price || 0), 0)
  const discount = isSale ? +f.discount || 0 : 0
  const total = subtotal - discount
  const setf = k => e => setF({ ...f, [k]: e.target.value })

  async function load() {
    const [inv, p, pr, ac, em] = await Promise.all([
      supabase.from('invoices').select('*, partners(name)').eq('type', type).order('invoice_date', { ascending: false }).limit(100),
      supabase.from('partners').select('id,name').eq('kind', isSale ? 'customer' : 'supplier').order('name'),
      supabase.from('products').select('id,name,kind,buy_price,unit,diameter').order('name'),
      supabase.from('cash_accounts').select('id,name'),
      supabase.from('employees').select('name').eq('active', true),
    ])
    setList(inv.data || []); setPartners(p.data || []); setProducts(pr.data || []); setAccounts(ac.data || []); setTechs((em.data || []).map(x => x.name))
  }
  useEffect(() => { load() }, [type])

  function setItem(i, patch) {
    setItems(items.map((x, k) => {
      if (k !== i) return x
      const n = { ...x, ...patch }
      if (patch.product_id && !isSale) {
        const p = products.find(p => p.id === patch.product_id)
        if (p) n.price = p.buy_price
      }
      return n
    }))
  }

  async function save(e) {
    e.preventDefault(); setMsg(null)
    const rows = f.lump ? [] : items.filter(i => i.product_id && +i.qty > 0)
    if (!f.partner_id) return setMsg({ t: 'err', m: isSale ? 'اختار العميل' : 'اختار المورد' })
    if (!f.lump && rows.length === 0) return setMsg({ t: 'err', m: 'أضف صنف واحد على الأقل أو اختار فاتورة مجمعة' })
    if (f.lump && !(subtotal > 0)) return setMsg({ t: 'err', m: 'اكتب إجمالي الفاتورة' })
    if (total < 0) return setMsg({ t: 'err', m: 'الخصم أكبر من إجمالي الفاتورة' })
    if (+f.paid > 0 && !f.account_id) return setMsg({ t: 'err', m: 'اختار الخزنة للمبلغ المدفوع' })
    if (+f.paid > total) return setMsg({ t: 'err', m: 'المدفوع أكبر من صافي الفاتورة' })
    const { data: inv, error } = await supabase.from('invoices').insert({
      type, partner_id: f.partner_id, invoice_date: f.date, total, paid: +f.paid || 0, discount, is_lump: f.lump, notes: f.notes,
      job_type: isSale ? f.job_type : null, technician: isSale ? f.technician : null, indoor_info: f.indoor_info, outdoor_info: f.outdoor_info,
    }).select().single()
    if (error) return setMsg({ t: 'err', m: error.message })
    if (rows.length) {
      const it = await supabase.from('invoice_items').insert(rows.map(r => ({ invoice_id: inv.id, product_id: r.product_id, qty: +r.qty, price: +r.price || 0 })))
      if (it.error) { await supabase.from('invoices').delete().eq('id', inv.id); return setMsg({ t: 'err', m: it.error.message }) }
      if (!isSale) await Promise.all(rows.map(r => supabase.from('products').update({ buy_price: +r.price || 0 }).eq('id', r.product_id)))
    }
    if (+f.paid > 0) await supabase.from('cash_transactions').insert({
      account_id: f.account_id, direction: isSale ? 'in' : 'out', amount: +f.paid, source: type,
      partner_id: f.partner_id, invoice_id: inv.id, tx_date: f.date })
    if (eid) {
      await supabase.from('cash_transactions').delete().eq('invoice_id', eid)
      await supabase.from('invoices').delete().eq('id', eid); setEid(null)
    }
    setMsg({ t: 'ok', m: 'تم حفظ الفاتورة' })
    setItems([empty()]); setF({ ...blankF(), date: f.date }); setOpen(false); load()
  }

  async function quickPartner() {
    if (!nq.name.trim()) return setMsg({ t: 'err', m: 'اكتب الاسم' })
    const { data, error } = await supabase.from('partners').insert({ kind: isSale ? 'customer' : 'supplier', name: nq.name, phone: nq.phone }).select().single()
    if (error) return setMsg({ t: 'err', m: error.message })
    await load(); setF(x => ({ ...x, partner_id: data.id })); setQa(null); setNq(blankNq()); setMsg({ t: 'ok', m: 'تمت إضافة ' + (isSale ? 'العميل' : 'المورد') + ' واختياره' })
  }
  async function quickProduct() {
    if (!nq.name.trim()) return setMsg({ t: 'err', m: 'اكتب اسم الصنف' })
    const dev = nq.kind === 'device', coil = nq.sold_by === 'coil'
    const { data, error } = await supabase.from('products').insert({
      kind: nq.kind, name: nq.name, buy_price: +nq.buy_price || 0, unit: dev ? 'جهاز' : coil ? 'لفة' : 'متر',
      sold_by: dev ? null : nq.sold_by, diameter: !dev && coil ? nq.diameter : null }).select().single()
    if (error) return setMsg({ t: 'err', m: error.message })
    await load()
    const price = isSale ? '' : data.buy_price
    setItems(its => {
      const k = its.findIndex(x => !x.product_id), n = [...its]
      if (k >= 0) n[k] = { ...n[k], product_id: data.id, price }; else n.push({ product_id: data.id, qty: '', price })
      return n
    })
    setQa(null); setNq(blankNq()); setMsg({ t: 'ok', m: 'تمت إضافة الصنف واختياره في الفاتورة' })
  }
  async function edit(i) {
    const [it, tx] = await Promise.all([
      supabase.from('invoice_items').select('product_id,qty,price').eq('invoice_id', i.id),
      supabase.from('cash_transactions').select('account_id').eq('invoice_id', i.id).limit(1),
    ])
    setItems(it.data?.length ? it.data : [empty()])
    setF({ ...blankF(), partner_id: i.partner_id, date: i.invoice_date, paid: i.paid || '', account_id: tx.data?.[0]?.account_id || '', notes: i.notes || '',
      discount: i.discount > 0 ? i.discount : '', lump: i.is_lump, lump_total: i.is_lump ? Number(i.total) + Number(i.discount || 0) : '',
      job_type: i.job_type || 'install', technician: i.technician || '', indoor_info: i.indoor_info || '', outdoor_info: i.outdoor_info || '' })
    setEid(i.id); setOpen(true); setMsg(null); window.scrollTo(0, 0)
  }
  async function del(i) {
    if (!confirm('حذف الفاتورة؟ المخزون والخزنة وحساب الطرف هيترجعوا.')) return
    await supabase.from('cash_transactions').delete().eq('invoice_id', i.id)
    const { error } = await supabase.from('invoices').delete().eq('id', i.id)
    if (error) setMsg({ t: 'err', m: error.message }); else load()
  }

  const canNewDev = lv('device') >= 2, canNewMat = lv('material') >= 2
  return (
    <>
      <h2>{isSale ? 'فواتير المبيعات' : 'فواتير المشتريات'}</h2>
      {level >= 2 && <p><button className="btn" onClick={() => { setOpen(!open); if (open) { setEid(null); setF(blankF()); setItems([empty()]) } }}>{open ? 'إغلاق' : 'فاتورة جديدة'}</button></p>}
      {msg && <div className={'msg ' + msg.t}>{msg.m}</div>}
      {open && (
        <form className="card" onSubmit={save} style={{ marginBottom: 20 }}>
          <div className="row">
            <select value={f.partner_id} onChange={setf('partner_id')} required>
              <option value="">{isSale ? 'اختار العميل' : 'اختار المورد'}</option>
              {partners.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <input type="date" value={f.date} onChange={setf('date')} />
            {isSale && <select value={f.job_type} onChange={setf('job_type')} aria-label="نوع الشغل">{Object.entries(JOBS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>}
            {isSale && <><input list="techs" placeholder="الفني القائم بالتركيب" value={f.technician} onChange={setf('technician')} /><datalist id="techs">{techs.map(t => <option key={t} value={t} />)}</datalist></>}
          </div>
          <div className="row">
            <input placeholder="بيانات الوحدة الداخلية" value={f.indoor_info} onChange={setf('indoor_info')} />
            <input placeholder="بيانات الوحدة الخارجية" value={f.outdoor_info} onChange={setf('outdoor_info')} />
          </div>
          <p>
            {lv(isSale ? 'customer' : 'supplier') >= 2 && <button type="button" className="btn sec sm" onClick={() => setQa(qa === 'partner' ? null : 'partner')}>{isSale ? '+ عميل جديد' : '+ مورد جديد'}</button>}{' '}
            {!f.lump && (canNewDev || canNewMat) && <button type="button" className="btn sec sm" onClick={() => { setNq({ ...blankNq(), kind: canNewDev ? 'device' : 'material' }); setQa(qa === 'product' ? null : 'product') }}>+ صنف جديد (جهاز / خامة)</button>}
          </p>
          {qa === 'partner' && (
            <div className="card" style={{ marginBottom: 12 }} onKeyDown={e => e.key === 'Enter' && e.preventDefault()}>
              <div className="row">
                <input placeholder={isSale ? 'اسم العميل' : 'اسم المورد'} value={nq.name} onChange={e => setNq({ ...nq, name: e.target.value })} />
                <input placeholder="التليفون" value={nq.phone} onChange={e => setNq({ ...nq, phone: e.target.value })} />
              </div>
              <button type="button" className="btn" onClick={quickPartner}>حفظ واختيار</button>
            </div>
          )}
          {qa === 'product' && (
            <div className="card" style={{ marginBottom: 12 }} onKeyDown={e => e.key === 'Enter' && e.preventDefault()}>
              <div className="row">
                <input placeholder="اسم الصنف" value={nq.name} onChange={e => setNq({ ...nq, name: e.target.value })} />
                <select value={nq.kind} onChange={e => setNq({ ...nq, kind: e.target.value })}>
                  {canNewDev && <option value="device">جهاز</option>}{canNewMat && <option value="material">خامة</option>}
                </select>
                {nq.kind === 'material' && <select value={nq.sold_by} onChange={e => setNq({ ...nq, sold_by: e.target.value })}><option value="meter">بالمتر</option><option value="coil">باللفة</option></select>}
                {nq.kind === 'material' && nq.sold_by === 'coil' && <input placeholder="القطر" value={nq.diameter} onChange={e => setNq({ ...nq, diameter: e.target.value })} />}
                <input type="number" min="0" step="any" placeholder="سعر الشراء" value={nq.buy_price} onChange={e => setNq({ ...nq, buy_price: e.target.value })} />
              </div>
              <button type="button" className="btn" onClick={quickProduct}>حفظ وإضافة للفاتورة</button>
            </div>
          )}
          <label style={{ display: 'block', margin: '8px 0' }}>
            <input type="checkbox" checked={f.lump} onChange={e => setF({ ...f, lump: e.target.checked })} style={{ width: 'auto' }} /> فاتورة مجمعة (إجمالي فقط من غير تفاصيل الأصناف)
          </label>
          {f.lump ? (
            <div className="row"><input type="number" min="0" step="any" placeholder="إجمالي الفاتورة" value={f.lump_total} onChange={setf('lump_total')} /></div>
          ) : (
            <>
              {items.map((it, i) => (
                <div className="items" key={i}>
                  <select value={it.product_id} onChange={e => setItem(i, { product_id: e.target.value })}>
                    <option value="">اختار الصنف</option>
                    {products.map(p => <option key={p.id} value={p.id}>{p.name} ({p.kind === 'device' ? 'جهاز' : 'خامة' + (p.diameter ? ' - قطر ' + p.diameter : '')})</option>)}
                  </select>
                  <input type="number" min="0.01" step="any" value={it.qty} onChange={e => setItem(i, { qty: e.target.value })} placeholder="الكمية" aria-label="الكمية" />
                  <input type="number" min="0" step="any" value={it.price} onChange={e => setItem(i, { price: e.target.value })} placeholder={isSale ? 'سعر البيع' : 'سعر الشراء'} aria-label={isSale ? 'سعر البيع' : 'سعر الشراء'} />
                  <strong>{money((+it.qty || 0) * (+it.price || 0))}</strong>
                  <button type="button" className="btn del" onClick={() => setItems(items.filter((_, k) => k !== i))} disabled={items.length === 1}>حذف</button>
                </div>
              ))}
              <button type="button" className="btn sec" onClick={() => setItems([...items, empty()])}>إضافة صنف</button>
            </>
          )}
          <div className="row" style={{ marginTop: 14 }}>
            {isSale && <input type="number" min="0" step="any" placeholder="الخصم" value={f.discount} onChange={setf('discount')} />}
            <input type="number" min="0" step="any" placeholder="المدفوع" value={f.paid} onChange={setf('paid')} />
            <select value={f.account_id} onChange={setf('account_id')}>
              <option value="">الخزنة</option>{accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <input placeholder="ملاحظات" value={f.notes} onChange={setf('notes')} />
          </div>
          <p>
            الإجمالي: <strong>{money(subtotal)}</strong>
            {isSale && discount > 0 && <> — الخصم: <strong>{money(discount)}</strong> — الصافي: <strong>{money(total)}</strong></>}
            {' '}— المتبقي: <strong>{money(total - (+f.paid || 0))}</strong>
          </p>
          {eid && <p className="msg ok">أنت بتعدّل فاتورة موجودة - الحفظ هيستبدلها</p>}
          <button className="btn">{eid ? 'حفظ التعديل' : 'حفظ الفاتورة'}</button>
        </form>
      )}
      <table>
        <thead><tr><th>التاريخ</th><th>{isSale ? 'العميل' : 'المورد'}</th><th>البيان</th><th>الصافي</th><th>المدفوع</th><th>المتبقي</th><th></th></tr></thead>
        <tbody>
          {list.length === 0 && <tr><td colSpan="7">لا توجد فواتير بعد. اضغط "فاتورة جديدة" للبدء.</td></tr>}
          {list.map(i => (
            <tr key={i.id}><td>{i.invoice_date}</td><td>{i.partners?.name}</td>
              <td>{isSale ? JOBS[i.job_type] || 'بيع' : 'شراء'}{i.is_lump && ' (مجمعة)'}
                {(i.technician || i.indoor_info || i.outdoor_info || i.notes) && <div className="detail">{[i.technician && 'الفني: ' + i.technician, i.indoor_info && 'داخلية: ' + i.indoor_info, i.outdoor_info && 'خارجية: ' + i.outdoor_info, i.notes].filter(Boolean).join(' | ')}</div>}</td>
              <td>{money(i.total)}{Number(i.discount) > 0 && <div className="detail">بعد خصم {money(i.discount)}</div>}</td>
              <td>{money(i.paid)}</td><td>{money(i.total - i.paid)}</td>
              <td>{level >= 3 && <><button className="btn sec sm" onClick={() => edit(i)}>تعديل</button>{' '}<button className="btn del sm" onClick={() => del(i)}>حذف</button></>}</td></tr>
          ))}
        </tbody>
      </table>
    </>
  )
}
