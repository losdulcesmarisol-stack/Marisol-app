// src/pages/appcc/RecepcionModal.jsx
// Entrada de mercancía con albarán, o inventario de arranque (lo que ya hay en el almacén).
import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { todayStr } from '../../lib/utils'
import { fd } from '../../lib/appcc'
import { Modal, ModalFooter, Btn, FormGroup } from '../../components/ui'
import toast from 'react-hot-toast'
import s from './appcc.module.css'

const lineaVacia = () => ({ materia_id: '', cantidad: '', lote: '', caducidad: '', temperatura: '', estado: 'aceptado', motivo: '' })

export default function RecepcionModal({ open, onClose, onSaved, modo = 'albaran' }) {
  const inventario = modo === 'inventario'
  const { user } = useAuth()
  const [materias, setMaterias] = useState([])
  const [proveedores, setProveedores] = useState([])
  const [cab, setCab] = useState({ fecha: todayStr(), proveedor_id: '', proveedor_nombre: '', albaran: '' })
  const [lineas, setLineas] = useState([lineaVacia()])
  const [foto, setFoto] = useState(null)
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    if (!open) return
    setCab({ fecha: todayStr(), proveedor_id: '', proveedor_nombre: '', albaran: '' }); setLineas([lineaVacia()]); setFoto(null)
    Promise.all([
      supabase.from('materias_primas').select('id,nombre,unidad').eq('activo', true).order('nombre'),
      supabase.from('proveedores').select('id,nombre').eq('activo', true).order('nombre'),
    ]).then(([m, p]) => { setMaterias(m.data || []); setProveedores(p.data || []) })
  }, [open])

  const setL = (i, k, v) => setLineas(ls => ls.map((l, j) => (j === i ? { ...l, [k]: v } : l)))
  const unidad = id => materias.find(m => m.id === id)?.unidad || ''

  async function guardar() {
    const ls = lineas.filter(l => l.materia_id || l.cantidad || l.lote)
    if (!ls.length) return toast.error('Añade al menos un producto')
    for (const [i, l] of ls.entries()) {
      const n = i + 1
      if (!l.materia_id) return toast.error(`Línea ${n}: elige la materia prima`)
      if (!(parseFloat(String(l.cantidad).replace(',', '.')) > 0)) return toast.error(`Línea ${n}: pon la cantidad`)
      if (!inventario && l.estado === 'aceptado' && (!l.lote.trim() || !l.caducidad)) return toast.error(`Línea ${n}: falta el lote o la caducidad (míralo en el saco o la caja)`)
      if (l.estado === 'rechazado' && !l.motivo.trim()) return toast.error(`Línea ${n}: di por qué se rechaza`)
    }
    if (!inventario && !cab.proveedor_id && !cab.proveedor_nombre.trim()) return toast.error('Elige el proveedor')
    setGuardando(true)
    try {
      let recepcion_id = null
      if (!inventario) {
        let foto_url = null
        if (foto) {
          const ext = (foto.name.split('.').pop() || 'jpg').toLowerCase()
          const path = `albaranes/${cab.fecha}/${Date.now()}.${ext}`
          const { error: ue } = await supabase.storage.from('facturas').upload(path, foto)
          if (ue) throw new Error('No se pudo subir la foto del albarán: ' + ue.message)
          foto_url = supabase.storage.from('facturas').getPublicUrl(path).data.publicUrl
        }
        const prov = proveedores.find(p => p.id === cab.proveedor_id)
        const { data, error } = await supabase.from('recepciones').insert({
          fecha: cab.fecha, proveedor_id: cab.proveedor_id || null, proveedor_nombre: prov?.nombre || cab.proveedor_nombre.trim(),
          albaran: cab.albaran.trim(), foto_url, usuario_id: user?.id, usuario_nombre: user?.nombre,
        }).select('id').single()
        if (error) throw error
        recepcion_id = data.id
      }
      const filas = ls.map(l => ({
        recepcion_id, origen: inventario ? 'inventario' : 'albaran',
        materia_id: l.materia_id,
        cantidad: parseFloat(String(l.cantidad).replace(',', '.')),
        lote: l.lote.trim() || `EXISTENCIAS INICIALES ${fd(cab.fecha)}`,
        caducidad: l.caducidad || null,
        temperatura: l.temperatura === '' ? null : parseFloat(String(l.temperatura).replace(',', '.')),
        estado: l.estado, motivo: l.estado === 'rechazado' ? l.motivo.trim() : null,
      }))
      const { error: e2 } = await supabase.from('lotes_mp').insert(filas)
      if (e2) {
        if (recepcion_id) await supabase.from('recepciones').delete().eq('id', recepcion_id)
        throw e2
      }
      toast.success(inventario ? 'Existencias guardadas' : 'Albarán guardado y sumado al stock')
      onSaved?.(); onClose()
    } catch (e) { toast.error('Error: ' + e.message) }
    setGuardando(false)
  }

  return (
    <Modal open={open} onClose={onClose} title={inventario ? 'Inventario de arranque' : 'Mercancía recibida'} wide>
      {inventario
        ? <p className={s.muted} style={{ marginTop: -6 }}>Apunta lo que ya hay en el almacén. Si no se sabe el lote, déjalo vacío: quedará como «Existencias iniciales» con la fecha de hoy. Lo que no tenga caducidad conocida se gastará primero.</p>
        : <>
          <div className={s.row} style={{ alignItems: 'flex-start' }}>
            <div className={s.grow}><FormGroup label="Proveedor">
              <select value={cab.proveedor_id} onChange={e => setCab({ ...cab, proveedor_id: e.target.value })}>
                <option value="">— Elige o escribe abajo —</option>
                {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select>
              {!cab.proveedor_id && <input style={{ marginTop: 6 }} placeholder="Otro proveedor" value={cab.proveedor_nombre} onChange={e => setCab({ ...cab, proveedor_nombre: e.target.value })} />}
            </FormGroup></div>
            <div style={{ width: 140 }}><FormGroup label="Nº albarán"><input value={cab.albaran} onChange={e => setCab({ ...cab, albaran: e.target.value })} /></FormGroup></div>
            <div style={{ width: 160 }}><FormGroup label="Fecha"><input type="date" value={cab.fecha} max={todayStr()} onChange={e => setCab({ ...cab, fecha: e.target.value })} /></FormGroup></div>
          </div>
          <FormGroup label="Foto del albarán (opcional)"><input type="file" accept="image/*,application/pdf" capture="environment" onChange={e => setFoto(e.target.files?.[0] || null)} /></FormGroup>
        </>}
      <div className={s.tw}>
        <table className={s.ftable}>
          <thead><tr><th>Materia prima</th><th>Cantidad</th><th>Lote</th><th>Caducidad</th>{!inventario && <><th>°C</th><th>Estado</th></>}<th /></tr></thead>
          <tbody>{lineas.map((l, i) => (
            <tr key={i}>
              <td style={{ minWidth: 170 }}><select value={l.materia_id} onChange={e => setL(i, 'materia_id', e.target.value)} aria-label="Materia prima">
                <option value="">Elige…</option>{materias.map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}</select></td>
              <td style={{ minWidth: 100 }}><div className={s.row} style={{ flexWrap: 'nowrap' }}><input inputMode="decimal" value={l.cantidad} onChange={e => setL(i, 'cantidad', e.target.value)} aria-label="Cantidad" /><span className={s.muted}>{unidad(l.materia_id)}</span></div></td>
              <td style={{ minWidth: 120 }}><input value={l.lote} placeholder={inventario ? 'Si se sabe' : 'Del saco/caja'} onChange={e => setL(i, 'lote', e.target.value)} aria-label="Lote" /></td>
              <td style={{ minWidth: 140 }}><input type="date" value={l.caducidad} onChange={e => setL(i, 'caducidad', e.target.value)} aria-label="Caducidad" /></td>
              {!inventario && <>
                <td style={{ minWidth: 70 }}><input inputMode="decimal" value={l.temperatura} placeholder="—" onChange={e => setL(i, 'temperatura', e.target.value)} aria-label="Temperatura de llegada" /></td>
                <td style={{ minWidth: 130 }}><select value={l.estado} onChange={e => setL(i, 'estado', e.target.value)} aria-label="Estado"><option value="aceptado">Aceptado</option><option value="rechazado">Rechazado</option></select>
                  {l.estado === 'rechazado' && <input style={{ marginTop: 4 }} placeholder="¿Por qué?" value={l.motivo} onChange={e => setL(i, 'motivo', e.target.value)} />}</td>
              </>}
              <td><button type="button" onClick={() => setLineas(ls => ls.length > 1 ? ls.filter((_, j) => j !== i) : [lineaVacia()])} aria-label="Quitar línea" style={{ border: 'none', background: 'none', color: 'var(--err)', fontSize: 16 }}>✕</button></td>
            </tr>))}
          </tbody>
        </table>
      </div>
      <Btn variant="ghost" size="sm" onClick={() => setLineas(ls => [...ls, lineaVacia()])}>+ Añadir línea</Btn>
      <ModalFooter>
        <Btn variant="ghost" onClick={onClose}>Cancelar</Btn>
        <Btn variant="gold" onClick={guardar} disabled={guardando}>{guardando ? 'Guardando…' : inventario ? 'Guardar existencias' : 'Guardar y sumar al stock'}</Btn>
      </ModalFooter>
    </Modal>
  )
}
