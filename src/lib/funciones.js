// src/lib/funciones.js — llama a una función del servidor y devuelve un error legible
import { supabase } from './supabase'

export async function llamarFuncion(nombre, body) {
  const { data, error } = await supabase.functions.invoke(nombre, { body })
  if (!error) return data
  let msg = error.message
  try { const j = await error.context?.json(); if (j?.error) msg = j.error } catch { /* sin detalle */ }
  throw new Error(msg)
}
