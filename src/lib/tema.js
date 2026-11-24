// src/lib/tema.js — modo claro / oscuro. Se recuerda en este aparato.
const CLAVE = 'marisol_tema'
function guardado() { try { return localStorage.getItem(CLAVE) } catch { return null } }
export function temaActual() {
  const g = guardado()
  if (g === 'oscuro' || g === 'claro') return g
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'oscuro' : 'claro'
}
export function aplicarTema(t = temaActual()) {
  document.documentElement.dataset.tema = t
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t === 'oscuro' ? '#17141f' : '#2e2a5c')
}
export function cambiarTema() {
  const t = temaActual() === 'oscuro' ? 'claro' : 'oscuro'
  try { localStorage.setItem(CLAVE, t) } catch { /* sin almacenamiento */ }
  aplicarTema(t)
  return t
}
