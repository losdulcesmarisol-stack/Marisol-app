// src/components/modals/CuentaClienteModal.jsx
// Comandas entregadas y no pagadas de un cliente («a cuenta»). Se cobran desde aquí.
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { fmt, todayStr, horaStr } from '../../lib/utils'
import { Modal, ModalFooter, Btn, Loading } from '../ui'
import toast from 'react-hot-toast'

const fechaLarga = f => new Date(f + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })

export default function CuentaClienteModal({ cliente, onClose, onCambio }) {
  const [comandas, setComandas] = useState(null)
  const [cobrando, setCobrando] = useState(false)

  const cargar = useCallback(async () => {
    const { data, error } = await supabase.from('comandas').select('*').eq('cliente_id', cliente.id).eq('estado', 'a_cuenta').order('fecha_entrega')
    if (error) { toast.error('Error: ' + error.message); setComandas([]); return }
    setComandas(data)
  }, [cliente.id])
  useEffect(() => { cargar() }, [cargar])

  async function cobrar(lista) {
    if (!lista.length) return
    setCobrando(true)
    let ok = 0
    for (const c of lista) {
      const { error: e1 } = await supabase.from('comandas').update({ estado: 'cobrada', fecha_cobro: todayStr() }).eq('id', c.id).eq('estado', 'a_cuenta')
      if (e1) { toast.error('Error cobrando la comanda del ' + fechaLarga(c.fecha_entrega) + ': ' + e1.message); break }
      const { error: e2 } = await supabase.from('ventas').insert({
        fecha_registro: todayStr(), hora_registro: horaStr(), fecha_entrega: c.fecha_entrega,
        cliente_id: c.cliente_id, cliente_nombre: c.cliente_nombre, items: c.items, total: c.total, tipo: 'comanda_cobrada',
      })
      if (e2) {
        await supabase.from('comandas').update({ estado: 'a_cuenta', fecha_cobro: null }).eq('id', c.id)
        toast.error('Error registrando el cobro: ' + e2.message); break
      }
      ok++
    }
    setCobrando(false)
    if (ok) toast.success(ok === 1 ? 'Cobrada' : `${ok} comandas cobradas`)
    await cargar(); onCambio?.()
  }

  const total = (comandas || []).reduce((s, c) => s + Number(c.total || 0), 0)
  return (
    <Modal open onClose={onClose} title={`💶 Pendiente de pago · ${cliente.nombre}`} wide>
      {!comandas ? <Loading /> : comandas.length === 0 ? (
        <p style={{ textAlign: 'center', color: 'var(--ok)', fontWeight: 600, padding: 20 }}>✓ No tiene nada pendiente de pago.</p>
      ) : (<>
        <div style={{ display: 'grid', gap: 8, maxHeight: '55vh', overflowY: 'auto' }}>
          {comandas.map(c => (
            <div key={c.id} style={{ border: '1px solid var(--bor)', borderRadius: 'var(--r)', padding: '10px 12px', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <b>{fechaLarga(c.fecha_entrega)}</b>
                <div style={{ fontSize: 12, color: 'var(--txt2)' }}>{(c.items || []).filter(i => i.qty > 0).map(i => `${i.nombre} × ${i.qty}`).join(', ')}</div>
                {c.fecha_a_cuenta && <div style={{ fontSize: 11, color: 'var(--txt3)' }}>Dejada a cuenta el {fechaLarga(c.fecha_a_cuenta)}</div>}
              </div>
              <b style={{ color: 'var(--pur)', fontSize: 15 }}>{fmt(c.total)}</b>
              <Btn size="sm" variant="success" onClick={() => cobrar([c])} disabled={cobrando}>Cobrar</Btn>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, fontSize: 16 }}>
          <span>{comandas.length} comanda(s) sin pagar</span>
          <b style={{ color: 'var(--err)', fontSize: 20 }}>Total: {fmt(total)}</b>
        </div>
      </>)}
      <ModalFooter>
        <Btn variant="ghost" onClick={onClose}>Cerrar</Btn>
        {comandas?.length > 1 && <Btn variant="success" onClick={() => cobrar(comandas)} disabled={cobrando}>{cobrando ? 'Cobrando…' : `Cobrar todo (${fmt(total)})`}</Btn>}
      </ModalFooter>
    </Modal>
  )
}
