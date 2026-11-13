import { useEffect, useState } from 'react'
import { supabase, money } from './supabase'

const empty = () => ({ product_id: '', qty: '', price: '' })

export default function Invoices({ type, level = 3, lv = () => 3 }) {
  const isSale = type === 'sale'
  const [list, setList] = useState([]), [partners, setPartners] = useState([]), [products, setProducts] = useState([]), [accounts, setAccounts] = useState([])
  const [open, setOpen] = useState(false), [msg, setMsg] = useState(null), [eid, setEid] = useState(null), [qa, setQa] = useState(null), [nq, setNq] = useState({ name: '', phone: '', kind: 'device', buy_price: '', sell_price: '' })
  const [f, setF] = useState({ partner_id: '', date: new Date().toISOString().slice(0, 10), paid: '', account_id: '', notes: '' })
  const [items, setItems] = useState([empty()])
  const total = items.reduce((s, i) => s + (+i.qty || 0) * (+i.price || 0), 0)

  async function load() {
    const [inv, p, pr, ac] = await Promise.all([
      supabase.from('invoices').select('*, partners(name)').eq('type', type).order('invoice_date', { ascending: false }).limit(100),
      supabase.from('partners').select('id,name').eq('kind', isSale ? 'customer' : 'supplier').order('name'),
      supabase.from('products').select('id,name,kind,buy_price,sell_price').order('name'),
      supabase.from('cash_accounts').select('id,name'),
    ])
    setList(inv.data || []); setPartners(p.data || []); setProducts(pr.data || []); setAccounts(ac.data || [])
  }
  useEffect(() => { load() }, [type])

  function setItem(i, patch) {
    setItems(items.map((x, k) => {
      if (k !== i) return x
      const n = { ...x, ...patch }
      if (patch.product_id) {
        const p = products.find(p => p.id === patch.product_id)
        if (p) n.price = isSale ? p.sell_price : p.buy_price
      }
      return n
    }))
  }

  async function save(e) {
    e.preventDefault(); setMsg(null)
    const rows = items.filter(i => i.product_id && i.qty > 0)
    if (!f.partner_id || rows.length === 0) return setMsg({ t: 'err', m: 'اختار الطرف وأضف صنف واحد على الأقل' })
    if (Number(f.paid) > 0 && !f.account_id) return setMsg({ t: 'err', m: 'اختار الخزنة للمبلغ المدفوع' })
    if (Number(f.paid) > total) return setMsg({ t: 'err', m: 'المدفوع أكبر من إجمالي الفاتورة' })
    const { data: inv, error } = await supabase.from('invoices')
      .insert({ type, partner_id: f.partner_id, invoice_date: f.date, total, paid: f.paid || 0, notes: f.notes }).select().single()
    if (error) return setMsg({ t: 'err', m: error.message })
    const it = await supabase.from('invoice_items').insert(rows.map(r => ({ invoice_id: inv.id, product_id: r.product_id, qty: +r.qty, price: +r.price || 0 })))
    if (it.error) { await supabase.from('invoices').delete().eq('id', inv.id); return setMsg({ t: 'err', m: it.error.message }) }
    if (Number(f.paid) > 0) await supabase.from('cash_transactions').insert({
      account_id: f.account_id, direction: isSale ? 'in' : 'out', amount: f.paid, source: type,
      partner_id: f.partner_id, invoice_id: inv.id, tx_date: f.date })
    if (eid) {
      await supabase.from('cash_transactions').delete().eq('invoice_id', eid)
      await supabase.from('invoices').delete().eq('id', eid); setEid(null)
    }
    setMsg({ t: 'ok', m: 'تم حفظ الفاتورة وتحديث المخزون' })
    setItems([empty()]); setF({ ...f, partner_id: '', paid: '', notes: '' }); setOpen(false); load()
  }

  async function quickPartner() {
    if (!nq.name.trim()) return setMsg({ t: 'err', m: 'اكتب الاسم' })
    const { data, error } = await supabase.from('partners').insert({ kind: isSale ? 'customer' : 'supplier', name: nq.name, phone: nq.phone }).select().single()
    if (error) return setMsg({ t: 'err', m: error.message })
    await load(); setF(x => ({ ...x, partner_id: data.id })); setQa(null); setNq(n => ({ ...n, name: '', phone: '' })); setMsg({ t: 'ok', m: 'تمت إضافة ' + (isSale ? 'العميل' : 'المورد') + ' واختياره' })
  }
  async function quickProduct() {
    if (!nq.name.trim()) return setMsg({ t: 'err', m: 'اكتب اسم الصنف' })
    const { data, error } = await supabase.from('products').insert({ kind: nq.kind, name: nq.name, buy_price: +nq.buy_price || 0, sell_price: +nq.sell_price || 0 }).select().single()
    if (error) return setMsg({ t: 'err', m: error.message })
    await load()
    const price = isSale ? data.sell_price : data.buy_price
    setItems(its => {
      const k = its.findIndex(x => !x.product_id), n = [...its]
      if (k >= 0) n[k] = { ...n[k], product_id: data.id, price }; else n.push({ product_id: data.id, qty: '', price })
      return n
    })
    setQa(null); setNq(n => ({ ...n, name: '', buy_price: '', sell_price: '' })); setMsg({ t: 'ok', m: 'تمت إضافة الصنف واختياره في الفاتورة' })
  }
  async function edit(i) {
    const [it, tx] = await Promise.all([
      supabase.from('invoice_items').select('product_id,qty,price').eq('invoice_id', i.id),
      supabase.from('cash_transactions').select('account_id').eq('invoice_id', i.id).limit(1),
    ])
    setItems(it.data?.length ? it.data : [empty()])
    setF({ partner_id: i.partner_id, date: i.invoice_date, paid: i.paid, account_id: tx.data?.[0]?.account_id || '', notes: i.notes || '' })
    setEid(i.id); setOpen(true); setMsg(null); window.scrollTo(0, 0)
  }
  async function del(i) {
    if (!confirm('حذف الفاتورة؟ المخزون والخزنة وحساب الطرف هيترجعوا.')) return
    await supabase.from('cash_transactions').delete().eq('invoice_id', i.id)
    const { error } = await supabase.from('invoices').delete().eq('id', i.id)
    if (error) setMsg({ t: 'err', m: error.message }); else load()
  }
  return (
    <>
      <h2>{isSale ? 'فواتير المبيعات' : 'فواتير المشتريات'}</h2>
      {level >= 2 && <p><button className="btn" onClick={() => { setOpen(!open); if (open) setEid(null) }}>{open ? 'إغلاق' : 'فاتورة جديدة'}</button></p>}
      {msg && <div className={'msg ' + msg.t}>{msg.m}</div>}
      {open && (
        <form className="card" onSubmit={save} style={{ marginBottom: 20 }}>
          <div className="row">
            <select value={f.partner_id} onChange={e => setF({ ...f, partner_id: e.target.value })} required>
              <option value="">{isSale ? 'اختار العميل' : 'اختار المورد'}</option>
              {partners.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <input type="date" value={f.date} onChange={e => setF({ ...f, date: e.target.value })} />
          </div>
          <p>
            {lv(isSale ? 'customer' : 'supplier') >= 2 && <button type="button" className="btn sec sm" onClick={() => setQa(qa === 'partner' ? null : 'partner')}>{isSale ? '+ عميل جديد' : '+ مورد جديد'}</button>}{' '}
            {(lv('device') >= 2 || lv('material') >= 2) && <button type="button" className="btn sec sm" onClick={() => { setNq(n => ({ ...n, kind: lv('device') >= 2 ? 'device' : 'material' })); setQa(qa === 'product' ? null : 'product') }}>+ صنف جديد (جهاز / خامة)</button>}
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
                  {lv('device') >= 2 && <option value="device">جهاز</option>}{lv('material') >= 2 && <option value="material">خامة</option>}
                </select>
                <input type="number" min="0" step="any" placeholder="سعر الشراء" value={nq.buy_price} onChange={e => setNq({ ...nq, buy_price: e.target.value })} />
                <input type="number" min="0" step="any" placeholder="سعر البيع" value={nq.sell_price} onChange={e => setNq({ ...nq, sell_price: e.target.value })} />
              </div>
              <button type="button" className="btn" onClick={quickProduct}>حفظ وإضافة للفاتورة</button>
            </div>
          )}
          {items.map((it, i) => (
            <div className="items" key={i}>
              <select value={it.product_id} onChange={e => setItem(i, { product_id: e.target.value })}>
                <option value="">اختار الصنف</option>
                {products.map(p => <option key={p.id} value={p.id}>{p.name} ({p.kind === 'device' ? 'جهاز' : 'خامة'})</option>)}
              </select>
              <input type="number" min="0.01" step="any" value={it.qty} onChange={e => setItem(i, { qty: e.target.value })} placeholder="الكمية" aria-label="الكمية" />
              <input type="number" min="0" step="any" value={it.price} onChange={e => setItem(i, { price: e.target.value })} placeholder={isSale ? 'سعر البيع' : 'سعر الشراء'} aria-label={isSale ? 'سعر البيع' : 'سعر الشراء'} />
              <strong>{money((+it.qty || 0) * (+it.price || 0))}</strong>
              <button type="button" className="btn del" onClick={() => setItems(items.filter((_, k) => k !== i))} disabled={items.length === 1}>حذف</button>
            </div>
          ))}
          <button type="button" className="btn sec" onClick={() => setItems([...items, empty()])}>إضافة صنف</button>
          <div className="row" style={{ marginTop: 14 }}>
            <input type="number" min="0" step="any" placeholder="المدفوع" value={f.paid} onChange={e => setF({ ...f, paid: e.target.value })} />
            <select value={f.account_id} onChange={e => setF({ ...f, account_id: e.target.value })}>
              <option value="">الخزنة</option>{accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <input placeholder="ملاحظات" value={f.notes} onChange={e => setF({ ...f, notes: e.target.value })} />
          </div>
          <p>الإجمالي: <strong>{money(total)}</strong> — المتبقي: <strong>{money(total - (f.paid || 0))}</strong></p>
          {eid && <p className="msg ok">أنت بتعدّل فاتورة موجودة - الحفظ هيستبدلها</p>}
          <button className="btn">{eid ? 'حفظ التعديل' : 'حفظ الفاتورة'}</button>
        </form>
      )}
      <table>
        <thead><tr><th>التاريخ</th><th>{isSale ? 'العميل' : 'المورد'}</th><th>الإجمالي</th><th>المدفوع</th><th>المتبقي</th><th></th></tr></thead>
        <tbody>
          {list.length === 0 && <tr><td colSpan="6">لا توجد فواتير بعد. اضغط "فاتورة جديدة" للبدء.</td></tr>}
          {list.map(i => <tr key={i.id}><td>{i.invoice_date}</td><td>{i.partners?.name}</td><td>{money(i.total)}</td><td>{money(i.paid)}</td><td>{money(i.total - i.paid)}</td><td>{level >= 3 && <><button className="btn sec sm" onClick={() => edit(i)}>تعديل</button>{' '}<button className="btn del sm" onClick={() => del(i)}>حذف</button></>}</td></tr>)}
        </tbody>
      </table>
    </>
  )
}
