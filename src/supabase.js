import { createClient } from '@supabase/supabase-js'
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
)
export const money = n => Number(n || 0).toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// تحميل كل الصفوف (Supabase بيرجع 1000 صف كحد أقصى في الطلب الواحد)
export async function fetchAll(make) {
  let out = [], from = 0
  for (;;) {
    const { data, error } = await make().range(from, from + 999)
    if (error) throw error
    out = out.concat(data)
    if (data.length < 1000) return out
    from += 1000
  }
}
