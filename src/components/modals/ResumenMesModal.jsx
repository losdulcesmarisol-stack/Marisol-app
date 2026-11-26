// src/components/modals/ResumenMesModal.jsx
// Resumen del mes de un cliente: todo lo que se le ha servido, lo pagado y lo pendiente.
// Se imprime o se guarda en PDF para dárselo al cliente. No es una factura.
import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { fmt, todayStr, sumarDias } from '../../lib/utils'
import { Modal, ModalFooter, Btn, Loading } from '../ui'
import toast from 'react-hot-toast'

const p2 = n => String(n).padStart(2, '0')
const esc = t => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
const fechaLarga = f => new Date(f + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })
const ESTADO = { pagado: 'Pagado', a_cuenta: 'Pendiente de pago', pendiente: 'Sin cobrar todavía' }

function mesesRecientes() {
  const [y, m] = todayStr().split('-').map(Number)
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(y, m - 1 - i, 1)
    return { valor: `${d.getFullYear()}-${p2(d.getMonth() + 1)}`, nombre: d.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' }).replace(/^./, c => c.toUpperCase()) }
  })
}

export default function ResumenMesModal({ cliente, onClose }) {
  const meses = mesesRecientes()
  const [mes, setMes] = useState(meses[0].valor)
  const [lineas, setLineas] = useState(null)

  useEffect(() => {
    setLineas(null)
    const desde = mes + '-01'
    const [y, m] = mes.split('-').map(Number)
    const hasta = sumarDias(m === 12 ? `${y + 1}-01-01` : `${y}-${p2(m + 1)}-01`, -1)
    Promise.all([
      supabase.from('ventas').select('fecha_entrega, fecha_registro, items, total').eq('cliente_id', cliente.id).gte('fecha_entrega', desde).lte('fecha_entrega', hasta),
      supabase.from('comandas').select('fecha_entrega, items, total, estado').eq('cliente_id', cliente.id).in('estado', ['a_cuenta', 'pendiente']).gte('fecha_entrega', desde).lte('fecha_entrega', hasta),
    ]).then(([v, c]) => {
      if (v.error || c.error) { toast.error('Error: ' + (v.error || c.error).message); setLineas([]); return }
      setLineas([
        ...v.data.map(x => ({ ...x, estado: 'pagado' })),
        ...c.data,
      ].sort((a, b) => a.fecha_entrega.localeCompare(b.fecha_entrega)))
    })
  }, [mes, cliente.id])

  const suma = est => (lineas || []).filter(l => !est || l.estado === est).reduce((s, l) => s + Number(l.total || 0), 0)
  const total = suma(), pagado = suma('pagado'), debe = total - pagado
  const nombreMes = meses.find(x => x.valor === mes)?.nombre || mes

  function imprimir() {
    const w = window.open('', '_blank')
    if (!w) return toast.error('El navegador ha bloqueado la ventana. Permite ventanas emergentes.')
    const filas = lineas.map(l => `<tr><td>${esc(fechaLarga(l.fecha_entrega))}</td><td>${(l.items || []).filter(i => Number(i.qty) > 0).map(i => esc(`${i.nombre} × ${i.qty}`)).join('<br>')}</td><td class="n">${esc(fmt(l.total))}</td><td class="${l.estado === 'pagado' ? 'ok' : 'ko'}">${ESTADO[l.estado]}</td></tr>`).join('')
    w.document.write(`<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Resumen ${esc(nombreMes)} · ${esc(cliente.nombre)}</title>
      <style>
        body{font-family:Arial,sans-serif;max-width:760px;margin:0 auto;padding:36px;color:#1a1628;}
        .head{display:flex;justify-content:space-between;border-bottom:3px solid #2e2a5c;padding-bottom:14px;margin-bottom:20px;gap:20px}
        .marca{font-size:20px;font-weight:700;color:#2e2a5c}.peq{font-size:11px;color:#555}
        h1{font-size:18px;color:#2e2a5c;margin:0 0 4px;text-align:right}
        .cli{background:#efedf6;border-left:3px solid #2e2a5c;padding:10px 12px;border-radius:8px;margin-bottom:18px}
        table{width:100%;border-collapse:collapse}th{background:#2e2a5c;color:#fff;padding:8px 10px;text-align:left;font-size:10px;letter-spacing:1px;text-transform:uppercase}
        td{padding:8px 10px;border-bottom:1px solid #e0dbd8;font-size:12px;vertical-align:top}.n{text-align:right;white-space:nowrap;font-weight:600}
        .ok{color:#2a7a48;font-weight:600}.ko{color:#b52e1e;font-weight:600}
        .tot{margin-top:16px;text-align:right;font-size:14px;line-height:1.7}.tot b{font-size:18px;color:#2e2a5c}
        .aviso{margin-top:24px;font-size:10px;color:#888}
      </style></head><body>
      <div class="head"><div><div class="marca">Productos MariSol</div>
        <div class="peq">NIF: 07542369W · Calle María Cristina, 12 · 16610 Casas de Fernando Alonso · Cuenca</div>
        <div class="peq">Tel: 665 284 126</div></div>
        <div><h1>RESUMEN DEL MES</h1><div class="peq" style="text-align:right">${esc(nombreMes)}</div></div></div>
      <div class="cli"><b>${esc(cliente.nombre)}</b>${cliente.nif ? `<div class="peq">NIF: ${esc(cliente.nif)}</div>` : ''}${cliente.direccion ? `<div class="peq">${esc(cliente.direccion)}</div>` : ''}</div>
      <table><thead><tr><th>Entrega</th><th>Productos</th><th>Importe</th><th>Estado</th></tr></thead><tbody>${filas}</tbody></table>
      <div class="tot">Total servido: ${esc(fmt(total))}<br>Pagado: ${esc(fmt(pagado))}<br><b>Pendiente de pago: ${esc(fmt(debe))}</b></div>
      <div class="aviso">Documento informativo de los pedidos del mes. No es una factura. Generado el ${esc(new Date().toLocaleDateString('es-ES'))}.</div>
      <script>window.onload=()=>window.print()<\/script></body></html>`)
    w.document.close()
  }

  return (
    <Modal open onClose={onClose} title={`📄 Resumen del mes · ${cliente.nombre}`} wide>
      <select value={mes} onChange={e => setMes(e.target.value)} aria-label="Mes" style={{ maxWidth: 260, marginBottom: 12 }}>
        {meses.map(x => <option key={x.valor} value={x.valor}>{x.nombre}</option>)}
      </select>
      {!lineas ? <Loading /> : !lineas.length ? <p style={{ color: 'var(--txt3)', textAlign: 'center', padding: 20 }}>No tiene pedidos este mes.</p> : (<>
        <div style={{ maxHeight: '45vh', overflowY: 'auto', border: '1px solid var(--bor)', borderRadius: 'var(--r)' }}>
          {lineas.map((l, i) => (
            <div key={i} style={{ display: 'flex', gap: 10, padding: '8px 12px', borderTop: i ? '1px solid var(--bor)' : 'none', alignItems: 'center' }}>
              <div style={{ flex: 1 }}>
                <b>{fechaLarga(l.fecha_entrega)}</b>
                <div style={{ fontSize: 12, color: 'var(--txt2)' }}>{(l.items || []).filter(i => Number(i.qty) > 0).map(i => `${i.nombre} × ${i.qty}`).join(', ')}</div>
              </div>
              <b>{fmt(l.total)}</b>
              <span style={{ fontSize: 11, fontWeight: 700, color: l.estado === 'pagado' ? 'var(--ok)' : 'var(--err)', minWidth: 90, textAlign: 'right' }}>{ESTADO[l.estado]}</span>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 18, marginTop: 12, flexWrap: 'wrap', fontSize: 14 }}>
          <span>Servido: <b>{fmt(total)}</b></span>
          <span style={{ color: 'var(--ok)' }}>Pagado: <b>{fmt(pagado)}</b></span>
          <span style={{ color: debe > 0 ? 'var(--err)' : 'var(--ok)' }}>Pendiente: <b>{fmt(debe)}</b></span>
        </div>
      </>)}
      <ModalFooter>
        <Btn variant="ghost" onClick={onClose}>Cerrar</Btn>
        <Btn variant="gold" onClick={imprimir} disabled={!lineas?.length}>🖨️ Imprimir / PDF</Btn>
      </ModalFooter>
    </Modal>
  )
}
