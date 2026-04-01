// src/components/modals/AlbaranModal.jsx
import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { fmt, todayStr } from '../../lib/utils'
import { Modal, ModalFooter, Btn, FormGroup, Grid2 } from '../ui'
import toast from 'react-hot-toast'

export default function AlbaranModal({ cliente, productos, onClose }) {
  const [lineas, setLineas] = useState([{ descripcion: '', cantidad: 1, precio: 0 }])
  const [fecha, setFecha] = useState(todayStr())
  const [iva, setIva] = useState(21)
  const [notas, setNotas] = useState('')
  const [saving, setSaving] = useState(false)

  const subtotal = lineas.reduce((s, l) => s + (l.cantidad * l.precio), 0)
  const ivaAmt = subtotal * (iva / 100)
  const total = subtotal + ivaAmt

  function updateLinea(i, field, val) {
    setLineas(ls => ls.map((l, idx) => idx === i ? { ...l, [field]: field === 'descripcion' ? val : parseFloat(val) || 0 } : l))
  }

  function addLinea() { setLineas(ls => [...ls, { descripcion: '', cantidad: 1, precio: 0 }]) }
  function removeLinea(i) { setLineas(ls => ls.filter((_, idx) => idx !== i)) }

  // Añadir producto al albarán desde la lista
  function addProducto(p) {
    const pe = cliente.precios_especiales?.[p.id]
    const precio = pe && pe > 0 ? pe : p.precio
    setLineas(ls => [...ls, { descripcion: p.nombre, cantidad: 1, precio }])
  }

  async function handleSave() {
    if (lineas.length === 0 || lineas.every(l => !l.descripcion)) {
      toast.error('Añade al menos una línea al albarán')
      return
    }
    setSaving(true)
    try {
      const { count } = await supabase.from('albaranes').select('*', { count: 'exact', head: true })
      const numero = 'ALB-' + String((count || 0) + 1).padStart(4, '0')
      const { error } = await supabase.from('albaranes').insert({
        numero, cliente_id: cliente.id, cliente_nombre: cliente.nombre,
        fecha, items: lineas, subtotal, iva, total, notas, estado: 'pendiente'
      })
      if (error) throw error
      toast.success(`Albarán ${numero} creado`)
      printAlbaran({ numero, cliente, fecha, lineas, subtotal, iva, ivaAmt, total, notas })
      onClose()
    } catch (e) {
      toast.error('Error: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  function printAlbaran(alb) {
    const w = window.open('', '_blank')
    w.document.write(`<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
      <title>Albarán ${alb.numero}</title>
      <style>
        body{font-family:Arial,sans-serif;max-width:700px;margin:0 auto;padding:40px;color:#1a1628;}
        .header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #4a3d8f;padding-bottom:16px;margin-bottom:24px;}
        .brand{display:flex;align-items:center;gap:14px;}
        .brand-name{font-size:20px;font-weight:700;color:#4a3d8f;}
        .brand-sub{font-size:10px;color:#888;letter-spacing:2px;text-transform:uppercase;}
        .alb-title{font-size:18px;font-weight:700;color:#4a3d8f;text-align:right;}
        .alb-num{font-size:15px;font-weight:600;}
        .alb-date{font-size:12px;color:#666;}
        .cli-box{background:#eeeaf8;border-left:3px solid #4a3d8f;padding:12px;border-radius:8px;margin-bottom:20px;}
        .cli-box .label{font-size:10px;color:#888;text-transform:uppercase;letter-spacing:1px;margin-bottom:5px;}
        .cli-box .name{font-size:15px;font-weight:700;}
        .cli-box .detail{font-size:12px;color:#666;}
        table{width:100%;border-collapse:collapse;margin-bottom:16px;}
        th{background:#4a3d8f;color:#fff;padding:9px 11px;text-align:left;font-size:10px;letter-spacing:1px;}
        td{padding:9px 11px;border-bottom:1px solid #e0dbd8;font-size:13px;}
        tr:nth-child(even) td{background:#f7f4ff;}
        .totals{text-align:right;border-top:1px solid #c5beed;padding-top:12px;}
        .totals .line{font-size:13px;color:#666;margin-bottom:3px;}
        .totals .grand{font-size:20px;font-weight:700;color:#4a3d8f;}
        .notas{background:#eeeaf8;padding:10px;border-radius:7px;font-size:12px;color:#666;margin-top:16px;}
        .footer{display:flex;justify-content:space-between;margin-top:32px;font-size:11px;color:#888;}
        @media print{body{padding:20px;}}
      </style></head><body>
      <div class="header">
        <div class="brand">
          <div>
            <div class="brand-name">Productos MariSol</div>
            <div class="brand-sub">Artesanal · Con amor · Desde siempre</div>
          </div>
        </div>
        <div>
          <div class="alb-title">ALBARÁN</div>
          <div class="alb-num">${alb.numero}</div>
          <div class="alb-date">${new Date(alb.fecha + 'T12:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
        </div>
      </div>
      <div class="cli-box">
        <div class="label">CLIENTE</div>
        <div class="name">${alb.cliente.nombre}</div>
        ${alb.cliente.nif ? `<div class="detail">NIF: ${alb.cliente.nif}</div>` : ''}
        ${alb.cliente.direccion ? `<div class="detail">${alb.cliente.direccion}</div>` : ''}
        ${alb.cliente.telefono ? `<div class="detail">Tel: ${alb.cliente.telefono}</div>` : ''}
      </div>
      <table>
        <thead><tr><th>DESCRIPCIÓN</th><th>CANT.</th><th>PRECIO/UD</th><th>TOTAL</th></tr></thead>
        <tbody>
          ${alb.lineas.map(l => `<tr>
            <td>${l.descripcion}</td>
            <td>${l.cantidad}</td>
            <td>${fmt(l.precio)}</td>
            <td><strong>${fmt(l.cantidad * l.precio)}</strong></td>
          </tr>`).join('')}
        </tbody>
      </table>
      <div class="totals">
        <div class="line">Subtotal: <strong>${fmt(alb.subtotal)}</strong></div>
        <div class="line">IVA (${alb.iva}%): <strong>${fmt(alb.ivaAmt)}</strong></div>
        <div class="grand">TOTAL: ${fmt(alb.total)}</div>
      </div>
      ${alb.notas ? `<div class="notas"><strong>Notas:</strong> ${alb.notas}</div>` : ''}
      <div class="footer">
        <span>Productos MariSol</span>
        <span>Firma del cliente: ____________________</span>
      </div>
      </body></html>`)
    w.document.close()
    setTimeout(() => { w.print() }, 400)
  }

  return (
    <Modal open title={`📄 Albarán — ${cliente.nombre}`} onClose={onClose} wide>
      <Grid2>
        <FormGroup label="Fecha">
          <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} />
        </FormGroup>
        <FormGroup label="IVA %">
          <input type="number" value={iva} min="0" max="21" onChange={e => setIva(parseFloat(e.target.value) || 0)} />
        </FormGroup>
      </Grid2>

      {/* Acceso rápido a productos del cliente */}
      {productos.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 11, color: 'var(--txt2)', marginBottom: 6, fontWeight: 600 }}>
            Añadir producto rápido:
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {productos.slice(0, 12).map(p => (
              <button
                key={p.id}
                onClick={() => addProducto(p)}
                style={{ padding: '4px 8px', fontSize: 11, background: 'var(--purbg)', border: '1px solid var(--bor2)', borderRadius: 6, cursor: 'pointer', color: 'var(--pur)' }}
              >
                {p.icono} {p.nombre}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Líneas del albarán */}
      <div style={{ fontWeight: 600, color: 'var(--pur)', fontSize: 12, margin: '10px 0 7px' }}>Líneas del albarán</div>
      {lineas.map((l, i) => (
        <div key={i} style={{ display: 'flex', gap: 5, marginBottom: 5, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            type="text"
            value={l.descripcion}
            placeholder="Descripción"
            style={{ flex: 2, minWidth: 120 }}
            onChange={e => updateLinea(i, 'descripcion', e.target.value)}
          />
          <input
            type="number"
            value={l.cantidad}
            min="0.1"
            step="0.1"
            style={{ width: 60 }}
            onChange={e => updateLinea(i, 'cantidad', e.target.value)}
          />
          <input
            type="number"
            value={l.precio}
            step="0.01"
            placeholder="€/ud"
            style={{ width: 80 }}
            onChange={e => updateLinea(i, 'precio', e.target.value)}
          />
          <span style={{ minWidth: 60, textAlign: 'right', color: 'var(--pur)', fontWeight: 600, fontSize: 12 }}>
            {fmt(l.cantidad * l.precio)}
          </span>
          <Btn variant="danger" size="sm" onClick={() => removeLinea(i)}>×</Btn>
        </div>
      ))}
      <Btn variant="ghost" size="sm" onClick={addLinea} style={{ marginTop: 5 }}>+ Añadir línea</Btn>

      <div style={{ marginTop: 12, fontSize: 13, color: 'var(--txt2)', textAlign: 'right' }}>
        Subtotal: <strong>{fmt(subtotal)}</strong> &nbsp;·&nbsp;
        IVA ({iva}%): <strong>{fmt(ivaAmt)}</strong> &nbsp;·&nbsp;
        <span style={{ fontSize: 16, color: 'var(--pur)', fontWeight: 700 }}>Total: {fmt(total)}</span>
      </div>

      <FormGroup label="Notas" style={{ marginTop: 10 }}>
        <input type="text" value={notas} onChange={e => setNotas(e.target.value)} placeholder="Observaciones..." />
      </FormGroup>

      <ModalFooter>
        <Btn variant="ghost" onClick={onClose}>Cancelar</Btn>
        <Btn variant="info" onClick={() => printAlbaran({ numero: 'BORRADOR', cliente, fecha, lineas, subtotal, iva, ivaAmt, total, notas })}>
          👁 Vista previa
        </Btn>
        <Btn onClick={handleSave} disabled={saving}>{saving ? 'Guardando...' : '💾 Guardar e imprimir'}</Btn>
      </ModalFooter>
    </Modal>
  )
}
