// src/lib/utils.js

/** Formatea número como moneda EUR */
export const fmt = (n) =>
  parseFloat(n || 0).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })

// ── Fechas y horas SIEMPRE en hora de España ──────────────────────────────
// (antes se usaba la hora UTC: entre las 00:00 y la 01:00/02:00 todo se
// guardaba con la fecha del día anterior)
const TZ = 'Europe/Madrid'

/** Fecha en España de un momento dado, formato YYYY-MM-DD */
export const fechaES = (d = new Date()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)

/** Hora (0-23) en España */
export const horaNumES = (d = new Date()) =>
  Number(new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', hourCycle: 'h23' }).format(d))

/** Hora en España en formato HH:MM */
export const horaStr = (d = new Date()) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d)

/** Suma días a una fecha YYYY-MM-DD (sin problemas de zona horaria) */
export function sumarDias(fecha, n) {
  const d = new Date(fecha + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** Devuelve fecha de hoy (en España) en formato YYYY-MM-DD */
export const todayStr = () => fechaES()

/** Emojis por categoría de producto */
export const CAT_EMOJI = {
  Pan: '🥖', Bollería: '🥐', Magdalenas: '🧁', Tostadas: '🍞',
  Pastelería: '🎂', Croissants: '🥐', Rosquillas: '🍩', Especial: '⭐',
}
export const getEmoji = (cat) => CAT_EMOJI[cat] || '🍞'

/** Lógica de día panadero:
 *  - Antes de las 13:00 → entrega hoy
 *  - A partir de las 13:00 → entrega mañana */
export function getDiaPanadero() {
  const h = horaNumES()
  // 00:00-09:59 -> jornada de HOY (madrugada y mañana)
  // 10:00-23:59 -> pedidos para MAÑANA
  const esManana = h >= 10
  const fechaEntrega = esManana ? sumarDias(todayStr(), 1) : todayStr()
  const label = (esManana ? 'mañana ' : 'hoy ') + new Date(fechaEntrega + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })
  const turno = h >= 21 ? 'noche' : h >= 13 ? 'tarde' : h >= 10 ? 'mañana' : 'madrugada'
  return { fechaEntrega, turno, label }
}

/** Etiqueta visual para fecha de entrega */
export function labelFecha(f) {
  const hoy = todayStr()
  const man = sumarDias(hoy, 1)
  const ay = sumarDias(hoy, -1)
  if (f === hoy) return '📦 Hoy'
  if (f === man) return '🌙 Mañana'
  if (f === ay) return '⬅️ Ayer'
  return '📅 ' + new Date(f + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })
}

/** Valida que un PIN sea 4 dígitos numéricos */
export const validarPin = (pin) => /^\d{4}$/.test(pin)

/** Valida que un campo no esté vacío */
export const noVacio = (v) => typeof v === 'string' && v.trim().length > 0
