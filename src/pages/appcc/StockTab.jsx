// src/pages/appcc/StockTab.jsx
// Stock de materias primas (con qué lote usar primero), productos hechos/congelados,
// inventario de arranque y recuento mensual.
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { useProductos } from '../../hooks/useProductos'
import { todayStr } from '../../lib/utils'
import { num, fd, loteDe, avisoCaducidad, ordenUso } from '../../lib/appcc'
import { Card, CardTitle, Btn, Loading, Tag, Modal, ModalFooter, FormGroup } from '../../components/ui'
import RecepcionModal from './RecepcionModal'
import toast from 'react-hot-toast'
import s from './appcc.module.css'

export default function StockTab() {
  const { user, isAdmin } = useAuth()
  const { productos } = useProductos()
  const [d, setD] = useState(null)
  const [modal, setModal] = useState(null) // 'inventario' | 'albaran' | 'terminado' | 'recuento'
  const [abierto, setAbierto] = useState({})

  const cargar = useCallback(async () => {
    const [mat, lot, term] = await Promise.all([
      supabase.from('materias_primas').select('*').eq('activo', true).order('nombre'),
      supabase.from('lotes_mp_stock').select('*').eq('estado', 'aceptado').gt('restante', 0.0005),
      supabase.from('stock_terminados').select('*').eq('estado', 'en_stock').order('fecha_fabricacion'),
    ])
    const err = [mat, lot, term].find(r => r.error)
    if (err) return toast.error('Error cargando el stock: ' + err.error.message)
    setD({ materias: mat.data, lotes: lot.data, terminados: term.data })
  }, [])
  useEffect(() => { cargar() }, [cargar])
  if (!d) return <Loading />

  const lotesDe = id => d.lotes.filter(l => l.materia_id === id).sort(ordenUso)
  const total = id => lotesDe(id).reduce((a, l) => a + Number(l.restante), 0)

  async function cambiarTerminado(t, estado) {
    const motivo = estado === 'retirado' ? window.prompt('¿Por qué se retira? (caducado, roto, en mal estado…)') : null
    if (estado === 'retirado' && !motivo) return
    const { error } = await supabase.from('stock_terminados').update({ estado, motivo }).eq('id', t.id)
    if (error) return toast.error('Error: ' + error.message)
    toast.success(estado === 'gastado' ? 'Marcado como gastado' : 'Retirado'); cargar()
  }

  return (
    <div className={s.stack}>
      <div className={s.row}>
        <Btn variant="gold" onClick={() => setModal('albaran')}>📷 Meter un albarán</Btn>
        {isAdmin && <Btn variant="ghost" onClick={() => setModal('inventario')}>Inventario de arranque / añadir existencias</Btn>}
        {isAdmin && <Btn variant="ghost" onClick={() => setModal('recuento')}>Recuento mensual</Btn>}
      </div>

      <Card>
        <CardTitle>Materias primas</CardTitle>
        <p className={s.muted} style={{ margin: '-4px 0 10px' }}>Suben con cada albarán y bajan solas al guardar la hoja de producción, empezando por lo que antes caduca.</p>
        <div className={s.list}>{d.materias.map(m => {
          const ls = lotesDe(m.id); const t = total(m.id); const bajo = Number(m.stock_minimo) > 0 && t < Number(m.stock_minimo)
          const primero = ls[0]; const av = primero && avisoCaducidad(primero.caducidad)
          return (
            <div key={m.id} className={s.item} style={{ display: 'block' }}>
              <div className={s.row} style={{ justifyContent: 'space-between' }}>
                <span><b>{m.nombre}</b>{m.alergenos?.length > 0 && <span className={s.muted}> · {m.alergenos.join(', ')}</span>}</span>
                <span className={s.row}><b className={s.num}>{num(t)} {m.unidad}</b>{t <= 0 ? <Tag color="red">Sin stock</Tag> : bajo ? <Tag color="warn">Bajo mínimo</Tag> : <Tag color="green">OK</Tag>}</span>
              </div>
              {primero && <div className={s.usar} style={{ marginTop: 8 }}>👉 <b>Usar primero:</b> lote {primero.lote} ({num(primero.restante)} {m.unidad}) · <Tag color={av.color}>{av.txt}</Tag></div>}
              {ls.length > 1 && <button type="button" className={s.muted} style={{ border: 'none', background: 'none', padding: '6px 0 0', textDecoration: 'underline' }} onClick={() => setAbierto(a => ({ ...a, [m.id]: !a[m.id] }))}>{abierto[m.id] ? 'Ocultar' : `Ver los ${ls.length} lotes en orden de uso`}</button>}
              {abierto[m.id] && <ol style={{ margin: '6px 0 0', paddingLeft: 20 }}>{ls.map(l => { const a = avisoCaducidad(l.caducidad); return <li key={l.id} style={{ margin: '3px 0' }}>Lote <b>{l.lote}</b> · {num(l.restante)} {m.unidad} · <Tag color={a.color}>{a.txt}</Tag></li> })}</ol>}
            </div>)
        })}</div>
      </Card>

      <Card>
        <CardTitle action={<Btn size="sm" variant="ghost" onClick={() => setModal('terminado')}>+ Añadir</Btn>}>Productos hechos guardados (congelados, cajas preparadas…)</CardTitle>
        {d.terminados.length === 0 ? <p className={s.muted} style={{ margin: 0 }}>No hay productos hechos apuntados. Añade aquí lo que tengáis congelado o preparado para vender más adelante.</p> : (
          <div className={s.list}>{d.terminados.map(t => { const a = avisoCaducidad(t.consumo_preferente); return (
            <div key={t.id} className={s.item}>
              <span className={s.grow}><b>{t.producto_nombre}</b> · {num(t.cantidad)} {t.unidad}<div className={s.muted}>Lote {loteDe(t.fecha_fabricacion)} (hecho el {fd(t.fecha_fabricacion)}){t.ubicacion ? ' · ' + t.ubicacion : ''}</div></span>
              <Tag color={a.color}>{t.consumo_preferente ? a.txt : 'Sin fecha'}</Tag>
              <Btn size="sm" variant="ghost" onClick={() => cambiarTerminado(t, 'gastado')}>Gastado</Btn>
              <Btn size="sm" variant="danger" onClick={() => cambiarTerminado(t, 'retirado')}>Retirar</Btn>
            </div>) })}</div>
        )}
      </Card>

      <RecepcionModal open={modal === 'albaran' || modal === 'inventario'} modo={modal === 'inventario' ? 'inventario' : 'albaran'} onClose={() => setModal(null)} onSaved={cargar} />
      <TerminadoModal open={modal === 'terminado'} productos={productos} user={user} onClose={() => setModal(null)} onSaved={cargar} />
      {isAdmin && <RecuentoModal open={modal === 'recuento'} materias={d.materias} lotesDe={lotesDe} total={total} user={user} onClose={() => setModal(null)} onSaved={cargar} />}
    </div>
  )
}

function TerminadoModal({ open, productos, user, onClose, onSaved }) {
  const vacio = { producto_id: '', cantidad: '', unidad: 'ud', fecha_fabricacion: todayStr(), consumo_preferente: '', ubicacion: '' }
  const [f, setF] = useState(vacio)
  useEffect(() => { if (open) setF(vacio) }, [open]) // eslint-disable-line react-hooks/exhaustive-deps
  async function guardar() {
    const p = productos.find(x => x.id === f.producto_id)
    if (!p) return toast.error('Elige el producto')
    const c = parseFloat(String(f.cantidad).replace(',', '.'))
    if (!(c > 0)) return toast.error('Pon la cantidad')
    const { error } = await supabase.from('stock_terminados').insert({ producto_id: p.id, producto_nombre: p.nombre, cantidad: c, unidad: f.unidad, fecha_fabricacion: f.fecha_fabricacion, consumo_preferente: f.consumo_preferente || null, ubicacion: f.ubicacion.trim(), usuario_id: user?.id, usuario_nombre: user?.nombre })
    if (error) return toast.error('Error: ' + error.message)
    toast.success('Guardado · lote ' + loteDe(f.fecha_fabricacion)); onSaved(); onClose()
  }
  return (
    <Modal open={open} onClose={onClose} title="Producto hecho guardado">
      <FormGroup label="Producto"><select value={f.producto_id} onChange={e => setF({ ...f, producto_id: e.target.value })}><option value="">Elige…</option>{productos.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select></FormGroup>
      <div className={s.row}><div className={s.grow}><FormGroup label="Cantidad"><input inputMode="decimal" value={f.cantidad} onChange={e => setF({ ...f, cantidad: e.target.value })} /></FormGroup></div>
        <div style={{ width: 130 }}><FormGroup label="Unidad"><select value={f.unidad} onChange={e => setF({ ...f, unidad: e.target.value })}><option value="ud">unidades</option><option value="cajas">cajas</option><option value="kg">kg</option></select></FormGroup></div></div>
      <div className={s.row}><div className={s.grow}><FormGroup label="Fecha en que se hizo (lote)"><input type="date" value={f.fecha_fabricacion} max={todayStr()} onChange={e => setF({ ...f, fecha_fabricacion: e.target.value })} /></FormGroup></div>
        <div className={s.grow}><FormGroup label="Consumo preferente"><input type="date" value={f.consumo_preferente} onChange={e => setF({ ...f, consumo_preferente: e.target.value })} /></FormGroup></div></div>
      <FormGroup label="Dónde está (opcional)"><input placeholder="Ej.: Congelador 2" value={f.ubicacion} onChange={e => setF({ ...f, ubicacion: e.target.value })} /></FormGroup>
      <p className={s.muted}>Lote: <b>{loteDe(f.fecha_fabricacion)}</b></p>
      <ModalFooter><Btn variant="ghost" onClick={onClose}>Cancelar</Btn><Btn variant="gold" onClick={guardar}>Guardar</Btn></ModalFooter>
    </Modal>
  )
}

function RecuentoModal({ open, materias, lotesDe, total, user, onClose, onSaved }) {
  const [real, setReal] = useState({})
  const [obs, setObs] = useState('')
  const [guardando, setGuardando] = useState(false)
  useEffect(() => { if (open) { setReal({}); setObs('') } }, [open])
  const cambios = materias.map(m => {
    const v = real[m.id]; if (v === undefined || v === '') return null
    const r = parseFloat(String(v).replace(',', '.')); if (isNaN(r) || r < 0) return null
    const dif = Math.round((r - total(m.id)) * 1000) / 1000
    return dif === 0 ? null : { m, dif }
  }).filter(Boolean)

  async function guardar() {
    if (!cambios.length) return toast.error('No hay diferencias que ajustar')
    setGuardando(true)
    try {
      const { data: rc, error } = await supabase.from('recuentos').insert({ fecha: todayStr(), observaciones: obs.trim(), usuario_id: user?.id, usuario_nombre: user?.nombre }).select('id').single()
      if (error) throw error
      const ajustes = []
      for (const { m, dif } of cambios) {
        const ls = lotesDe(m.id)
        if (dif < 0) {           // falta: se quita de los lotes en orden de uso
          let resto = -dif
          for (const l of ls) { if (resto <= 0) break; const q = Math.min(Number(l.restante), resto); ajustes.push({ recuento_id: rc.id, lote_id: l.id, cantidad: -q }); resto -= q }
        } else if (ls.length) {   // sobra: se suma al último lote en orden de uso
          ajustes.push({ recuento_id: rc.id, lote_id: ls[ls.length - 1].id, cantidad: dif })
        } else {                  // sobra y no hay lotes: se crea uno de recuento
          const { error: e } = await supabase.from('lotes_mp').insert({ origen: 'recuento', materia_id: m.id, cantidad: dif, lote: `RECUENTO ${fd(todayStr())}`, caducidad: null })
          if (e) throw e
        }
      }
      if (ajustes.length) { const { error: e } = await supabase.from('stock_ajustes').insert(ajustes); if (e) throw e }
      toast.success('Recuento guardado: ' + cambios.length + ' ajuste(s)'); onSaved(); onClose()
    } catch (e) { toast.error('Error: ' + e.message) }
    setGuardando(false)
  }

  return (
    <Modal open={open} onClose={onClose} title="Recuento mensual del almacén" wide>
      <p className={s.muted} style={{ marginTop: -6 }}>Cuenta lo que hay de verdad y escríbelo. Deja en blanco lo que no cuentes. La app ajusta la diferencia (mermas, recetas no exactas) y lo deja anotado.</p>
      <div className={s.tw}><table className={s.ftable}><thead><tr><th>Materia prima</th><th>Según la app</th><th>Hay de verdad</th><th>Diferencia</th></tr></thead>
        <tbody>{materias.map(m => { const c = cambios.find(x => x.m.id === m.id); return (
          <tr key={m.id}><td>{m.nombre}</td><td className={s.num}>{num(total(m.id))} {m.unidad}</td>
            <td style={{ width: 140 }}><input inputMode="decimal" value={real[m.id] ?? ''} onChange={e => setReal({ ...real, [m.id]: e.target.value })} aria-label={'Cantidad real de ' + m.nombre} /></td>
            <td className={s.num} style={{ color: c ? (c.dif < 0 ? 'var(--err)' : 'var(--ok)') : 'var(--txt3)' }}>{c ? (c.dif > 0 ? '+' : '') + num(c.dif) + ' ' + m.unidad : '—'}</td></tr>) })}</tbody></table></div>
      <FormGroup label="Observaciones (opcional)"><input value={obs} onChange={e => setObs(e.target.value)} placeholder="Ej.: saco de harina roto" /></FormGroup>
      <ModalFooter><Btn variant="ghost" onClick={onClose}>Cancelar</Btn><Btn variant="gold" onClick={guardar} disabled={guardando || !cambios.length}>{guardando ? 'Guardando…' : `Guardar recuento (${cambios.length})`}</Btn></ModalFooter>
    </Modal>
  )
}
