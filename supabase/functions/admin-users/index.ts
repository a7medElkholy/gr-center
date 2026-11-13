import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  const token = (req.headers.get('Authorization') || '').replace('Bearer ', '')
  const { data: { user } } = await admin.auth.getUser(token)
  if (!user) return json({ error: 'غير مسموح' }, 401)
  const { data: me } = await admin.from('profiles').select('role').eq('id', user.id).single()
  if (me?.role !== 'admin') return json({ error: 'للأدمن فقط' }, 403)

  const b = await req.json()
  try {
    if (b.action === 'create') {
      if (!b.password || b.password.length < 6) return json({ error: 'كلمة السر 6 حروف على الأقل' }, 400)
      const { data, error } = await admin.auth.admin.createUser({
        email: b.email, password: b.password, email_confirm: true, user_metadata: { full_name: b.full_name || b.email },
      })
      if (error) return json({ error: error.message }, 400)
      await admin.from('profiles').upsert({ id: data.user.id, email: b.email, full_name: b.full_name || b.email, role: b.role === 'admin' ? 'admin' : 'staff', permissions: b.permissions || {} })
    } else if (b.action === 'perms') {
      await admin.from('profiles').update({ permissions: b.permissions || {} }).eq('id', b.id)
    } else if (b.action === 'password') {
      if (!b.password || b.password.length < 6) return json({ error: 'كلمة السر 6 حروف على الأقل' }, 400)
      const { error } = await admin.auth.admin.updateUserById(b.id, { password: b.password })
      if (error) return json({ error: error.message }, 400)
    } else if (b.action === 'role') {
      if (b.id === user.id) return json({ error: 'مينفعش تغير صلاحيتك أنت' }, 400)
      await admin.from('profiles').update({ role: b.role === 'admin' ? 'admin' : 'staff' }).eq('id', b.id)
    } else if (b.action === 'delete') {
      if (b.id === user.id) return json({ error: 'مينفعش تحذف حسابك أنت' }, 400)
      const { error } = await admin.auth.admin.deleteUser(b.id)
      if (error) return json({ error: error.message }, 400)
    } else return json({ error: 'أمر غير معروف' }, 400)
    return json({ ok: true })
  } catch (e) { return json({ error: String(e) }, 500) }
})
