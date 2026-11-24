// src/components/modals/PedidoFijoModal.jsx
// «Lo de siempre»: lo que un cliente pide fijo ciertos días. La comanda se crea sola.
import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { Modal, ModalFooter, Btn, FormGroup, Loading } from '../ui'
import toast from 'react-hot-toast'

const DIAS = [[1, 'L', 'Lunes'], [2, 'M', 'Martes'], [3, 'X', 'Miércoles'], [4, 'J', 'Jueves'], [5, 'V', 'Viernes'], [6, 'S', 'Sábado'], [7, 'D', 'Domingo']]

export default function PedidoFijoModal({ cliente, productos, onClose, onCambio }) {
  const [pf, setPf] = useState(null)
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    supabase.from('pedidos_fijos').select('*').eq('cliente_id', cliente.id).maybeSingle().then(async ({ data, error }) => {
      if (error) { toast.error('Error: ' + error.message); onClose(); return }
      if (data) { setPf(data); return }
      // Sin pedido fijo todavía: se propone a partir de su último pedido
      const { data: ult } = await supabase.from('comandas').select('items').eq('cliente_id', cliente.id).order('created_at', { ascending: false }).limit(1).maybeSingle()
      setPf({ cliente_id: cliente.id, dias: [], activo: true, notas: '', items: (ult?.items || []).filter(i => i.qty > 0).map(i => ({ prodId: i.prodId, nombre: i.nombre, icono: i.icono || '', qty: i.qty })) })
    })
  }, [cliente.id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!pf) return <Modal open onClose={onClose} title="Pedido fijo"><Loading /></Modal>

  const toggleDia = d => setPf({ ...pf, dias: pf.dias.includes(d) ? pf.dias.filter(x => x !== d) : [...pf.dias, d].sort() })
  const setQty = (i, v) => setPf({ ...pf, items: pf.items.map((it, j) => (j === i ? { ...it, qty: parseFloat(String(v).replace(',', '.')) || 0 } : it)) })
  const quitar = i => setPf({ ...pf, items: pf.items.filter((_, j) => j !== i) })
  const anadir = id => { const p = productos.find(x => x.id === id); if (p) setPf({ ...pf, items: [...pf.items, { prodId: p.id, nombre: p.nombre, icono: p.icono || '', qty: 1 }] }) }

  async function guardar() {
    const items = pf.items.filter(i => i.qty > 0)
    if (pf.activo && !pf.dias.length) return toast.error('Marca qué días pide')
    if (pf.activo && !items.length) return toast.error('Añade al menos un producto')
    setGuardando(true)
    const datos = { cliente_id: cliente.id, dias: pf.dias, items, activo: pf.activo, notas: pf.notas.trim() }
    const { error } = pf.id ? await supabase.from('pedidos_fijos').update(datos).eq('id', pf.id) : await supabase.from('pedidos_fijos').insert(datos)
    if (error) { setGuardando(false); return toast.error('Error: ' + error.message) }
    const { data: n } = await supabase.rpc('generar_pedidos_fijos')
    setGuardando(false)
    toast.success(n > 0 ? `Pedido fijo guardado · ${n} comanda(s) creada(s)` : 'Pedido fijo guardado')
    onCambio?.(); onClose()
  }

  return (
    <Modal open onClose={onClose} title={`🔁 Pedido fijo · ${cliente.nombre}`} wide>
      <p style={{ fontSize: 13, color: 'var(--txt2)', marginTop: -6 }}>Los días marcados se crea sola la comanda con estos productos (hasta las 10:00 la de hoy; después, la de mañana). Si un día pide distinto, se edita esa comanda; si no pide, se cancela.</p>
      <FormGroup label="Días que pide">
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {DIAS.map(([d, l, nombre]) => (
            <button key={d} type="button" title={nombre} aria-pressed={pf.dias.includes(d)} onClick={() => toggleDia(d)}
              style={{ width: 44, height: 44, borderRadius: 10, fontWeight: 700, fontSize: 15, border: '1.5px solid ' + (pf.dias.includes(d) ? 'var(--pur)' : 'var(--bor2)'), background: pf.dias.includes(d) ? 'var(--pur)' : 'var(--sur)', color: pf.dias.includes(d) ? '#fff' : 'var(--txt2)' }}>{l}</button>
          ))}
        </div>
      </FormGroup>
      <FormGroup label="Productos">
        <div style={{ border: '1px solid var(--bor)', borderRadius: 'var(--r)' }}>
          {pf.items.length === 0 && <p style={{ padding: 10, color: 'var(--txt3)', margin: 0 }}>Sin productos todavía.</p>}
          {pf.items.map((it, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderTop: i ? '1px solid var(--bor)' : 'none' }}>
              <button type="button" onClick={() => quitar(i)} aria-label={'Quitar ' + it.nombre} style={{ border: 'none', background: 'none', color: 'var(--err)', fontSize: 16 }}>✕</button>
              <span style={{ flex: 1 }}>{it.icono} {it.nombre}</span>
              <input type="number" min="0" step="0.5" value={it.qty} onChange={e => setQty(i, e.target.value)} style={{ width: 80, textAlign: 'center', fontWeight: 700 }} aria-label={'Cantidad de ' + it.nombre} />
            </div>
          ))}
          <div style={{ padding: '7px 10px', borderTop: '1px solid var(--bor)' }}>
            <select value="" onChange={e => anadir(e.target.value)} aria-label="Añadir producto al pedido fijo">
              <option value="">+ Añadir producto…</option>
              {productos.filter(p => !pf.items.some(i => i.prodId === p.id)).map(p => <option key={p.id} value={p.id}>{p.icono || ''} {p.nombre}</option>)}
            </select>
          </div>
        </div>
      </FormGroup>
      <FormGroup label="Nota para el panadero (opcional)"><input value={pf.notas} onChange={e => setPf({ ...pf, notas: e.target.value })} placeholder="Ej.: bien cocido" /></FormGroup>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14 }}><input type="checkbox" checked={pf.activo} onChange={e => setPf({ ...pf, activo: e.target.checked })} style={{ width: 20, height: 20 }} /> Activo (desmárcalo en vacaciones o si deja de pedir)</label>
      <ModalFooter>
        <Btn variant="ghost" onClick={onClose}>Cancelar</Btn>
        <Btn variant="gold" onClick={guardar} disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar pedido fijo'}</Btn>
      </ModalFooter>
    </Modal>
  )
}
