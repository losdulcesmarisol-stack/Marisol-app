// src/lib/utils.js

/** Formatea número como moneda EUR */
export const fmt = (n) =>
  parseFloat(n || 0).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })

/** Devuelve fecha de hoy en formato YYYY-MM-DD */
export const todayStr = () => new Date().toISOString().slice(0, 10)

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
  const now = new Date()
  const mins = now.getHours() * 60 + now.getMinutes()
  if (mins >= 13 * 60) {
    const man = new Date(now)
    man.setDate(man.getDate() + 1)
    return {
      fechaEntrega: man.toISOString().slice(0, 10),
      turno: mins >= 21 * 60 ? 'noche' : 'tarde',
      label: 'mañana ' + man.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }),
    }
  }
  return {
    fechaEntrega: now.toISOString().slice(0, 10),
    turno: 'mañana',
    label: 'hoy ' + now.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }),
  }
}

/** Etiqueta visual para fecha de entrega */
export function labelFecha(f) {
  const hoy = todayStr()
  const man = (() => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10) })()
  const ay = (() => { const d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString().slice(0, 10) })()
  if (f === hoy) return '📦 Hoy'
  if (f === man) return '🌙 Mañana'
  if (f === ay) return '⬅️ Ayer'
  return '📅 ' + new Date(f + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })
}

/** Valida que un PIN sea 4 dígitos numéricos */
export const validarPin = (pin) => /^\d{4}$/.test(pin)

/** Valida que un campo no esté vacío */
export const noVacio = (v) => typeof v === 'string' && v.trim().length > 0
