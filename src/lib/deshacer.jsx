// src/lib/deshacer.jsx
// Aviso con botón «Deshacer» (en vez de preguntar «¿Seguro?» antes de borrar).
import toast from 'react-hot-toast'

export function avisoDeshacer(mensaje, alDeshacer, segundos = 7) {
  toast(t => (
    <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <span>{mensaje}</span>
      <button
        onClick={async () => { toast.dismiss(t.id); try { await alDeshacer(); toast.success('Deshecho') } catch (e) { toast.error('No se pudo deshacer: ' + e.message) } }}
        style={{ background: 'var(--gold)', color: 'var(--choc)', border: 'none', borderRadius: 8, padding: '6px 12px', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}
      >Deshacer</button>
    </span>
  ), { duration: segundos * 1000 })
}
