import { createClient } from '@supabase/supabase-js'

const url = 'https://lkcoxxcwtsvdyjeyyqll.supabase.co'
const key = 'sb_publishable_Il4ay0whxQIXDTdZ-0tvCQ_uR7-FUKj'

export const supabase = createClient(url, key)

export async function getAll(table, extra = {}) {
  let q = supabase.from(table).select('*').eq('activo', true).order('nombre')
  if (extra.filter) q = q.eq(extra.filter.col, extra.filter.val)
  const { data, error } = await q
  if (error) throw error
  return data || []
}

export async function insert(table, datos) {
  const { data, error } = await supabase.from(table).insert(datos).select().single()
  if (error) throw error
  return data
}

export async function update(table, id, datos) {
  const { data, error } = await supabase.from(table).update(datos).eq('id', id).select().single()
  if (error) throw error
  return data
}

export async function softDelete(table, id) {
  const { error } = await supabase.from(table).update({ activo: false }).eq('id', id)
  if (error) throw error
}

export async function uploadFile(bucket, path, file) {
  const { error } = await supabase.storage.from(bucket).upload(path, file, { upsert: true })
  if (error) throw error
  const { data } = supabase.storage.from(bucket).getPublicUrl(path)
  return data.publicUrl
}
