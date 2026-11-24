// src/lib/appcc.js
// Utilidades del módulo APPCC (temperaturas, limpieza, lotes, stock, trazabilidad).
import { todayStr, sumarDias } from './utils'

export const ALERGENOS = ['Gluten', 'Crustáceos', 'Huevos', 'Pescado', 'Cacahuetes', 'Soja', 'Leche',
  'Frutos de cáscara', 'Apio', 'Mostaza', 'Sésamo', 'Sulfitos', 'Altramuces', 'Moluscos']

export const CORRECTORAS_TEMP = [
  'Puerta mal cerrada: se cierra y se vuelve a mirar en 30 min',
  'Se ajusta el termostato y se vuelve a mirar en 30 min',
  'Se pasa el género a otro equipo',
  'Se avisa al técnico de frío',
  'Se tira el producto afectado',
]

/** Lote de fabricación = fecha en 8 cifras ddmmaaaa (normativa de panadería y pastelería) */
export const loteDe = (fecha) => (fecha ? fecha.slice(8, 10) + fecha.slice(5, 7) + fecha.slice(0, 4) : '')

/** Fecha corta en español: 23/11/2026 */
export const fd = (f) => (f ? new Date(f + 'T12:00:00').toLocaleDateString('es-ES') : '—')
export const fdCorta = (f) => (f ? new Date(f + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' }) : '—')

export const num = (n, dec = 2) => Number(n || 0).toLocaleString('es-ES', { maximumFractionDigits: dec })

// ── Temperaturas ──────────────────────────────────────────────────────────
export const fueraRango = (eq, v) => (eq.t_min != null && v < Number(eq.t_min)) || v > Number(eq.t_max)
export const rangoTxt = (eq) => (eq.t_min == null ? `${num(eq.t_max, 1)} °C o menos` : `entre ${num(eq.t_min, 1)} y ${num(eq.t_max, 1)} °C`)

// ── Limpieza según el plan ───────────────────────────────────────────────
const diaN = (f) => Math.round(new Date(f + 'T12:00:00Z').getTime() / 86400000)
/** ¿Toca limpiar esta tarea en la fecha f? (ciclo cada `cada_dias` contado desde `proxima`) */
export const tocaLimpiar = (t, f) => (((diaN(f) - diaN(t.proxima)) % t.cada_dias) + t.cada_dias) % t.cada_dias === 0
/** Fecha desde la que el plan cuenta (alta de la tarea en la app) */
export const inicioTarea = (t) => (t.created_at || '').slice(0, 10)
export const tareasDelDia = (tareas, f) => tareas.filter((t) => t.activo && f >= inicioTarea(t) && tocaLimpiar(t, f))
export function proximaLimpieza(t, desde = todayStr()) {
  for (let k = 0; k < 400; k++) { const f = sumarDias(desde, k); if (tocaLimpiar(t, f)) return f }
  return null
}
export const frecuenciaTxt = (n) => (n === 1 ? 'Todos los días' : n === 7 ? 'Cada semana' : n === 14 ? 'Cada 2 semanas'
  : n === 30 ? 'Una vez al mes' : n === 60 ? 'Cada 2 meses' : `Cada ${n} días`)

// ── Stock ─────────────────────────────────────────────────────────────────
/** Orden de uso: primero lo que antes caduca; lo que no tiene caducidad (existencias antiguas), lo primero */
export const ordenUso = (a, b) => (a.caducidad || '0000') .localeCompare(b.caducidad || '0000') || (a.created_at || '').localeCompare(b.created_at || '')
export const diasHasta = (f) => (f ? Math.round((new Date(f + 'T12:00:00') - new Date(todayStr() + 'T12:00:00')) / 86400000) : null)
export function avisoCaducidad(f) {
  const d = diasHasta(f)
  if (d == null) return { txt: 'Sin caducidad', color: 'gray' }
  if (d < 0) return { txt: 'Caducado', color: 'red' }
  if (d === 0) return { txt: 'Caduca hoy', color: 'red' }
  if (d <= 7) return { txt: `Caduca en ${d} d`, color: 'warn' }
  return { txt: 'Cad. ' + fd(f), color: 'gray' }
}

/** Unidades fabricadas de un producto en una hoja de producción (cocidas, o masa si no hay cocidas) */
export function udsProduccion(p) {
  const t = String(p.cocidas ?? '').replace(/[^0-9.,]/g, '') || String(p.masa ?? '').replace(/[^0-9.,]/g, '')
  return parseFloat(t.replace(',', '.')) || 0
}
