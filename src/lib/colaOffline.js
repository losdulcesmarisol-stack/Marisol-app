// src/lib/colaOffline.js
// Si se va internet, las ventas y comandas se guardan en el aparato y se suben solas
// en cuanto vuelve la conexión. Cada fila lleva su id para que nunca se suba dos veces.
import { supabase } from './supabase'

const CLAVE = 'marisol_cola_offline'
const TABLAS = ['ventas', 'comandas']

function leer() { try { return JSON.parse(localStorage.getItem(CLAVE) || '[]') } catch { return [] } }
function escribir(c) {
  try { localStorage.setItem(CLAVE, JSON.stringify(c)) } catch { /* sin almacenamiento */ }
  window.dispatchEvent(new CustomEvent('cola-offline', { detail: c.length }))
}
export const pendientesOffline = () => leer().length

function esFalloDeRed(error) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true
  const m = String(error?.message || error || '')
  return /Failed to fetch|NetworkError|Load failed|network|fetch/i.test(m) && !error?.code
}

// Inserta una fila; si no hay conexión la deja en cola. Devuelve { enCola } o lanza el error.
export async function insertarSeguro(tabla, fila) {
  if (!TABLAS.includes(tabla)) throw new Error('Tabla no permitida en la cola')
  const conId = { id: fila.id || crypto.randomUUID(), ...fila }
  if (navigator.onLine === false) { escribir([...leer(), { tabla, fila: conId }]); return { enCola: true } }
  let error
  try { ({ error } = await supabase.from(tabla).insert(conId)) } catch (e) { error = e }
  if (!error) return { enCola: false }
  if (esFalloDeRed(error)) { escribir([...leer(), { tabla, fila: conId }]); return { enCola: true } }
  throw error
}

let subiendo = false
export async function subirCola() {
  if (subiendo || navigator.onLine === false) return 0
  const cola = leer()
  if (!cola.length) return 0
  subiendo = true
  let subidas = 0
  const quedan = []
  for (const item of cola) {
    let error
    try { ({ error } = await supabase.from(item.tabla).insert(item.fila)) } catch (e) { error = e }
    if (!error || error.code === '23505') subidas++ // 23505 = ya estaba subida
    else quedan.push(item)
  }
  escribir([...quedan, ...leer().slice(cola.length)])
  subiendo = false
  return subidas
}
