// src/pages/appcc/AjustesTab.jsx
// Equipos de frío y materias primas (solo administradores).
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { ALERGENOS, rangoTxt, num } from '../../lib/appcc'
import { Card, CardTitle, Loading, Btn, Modal, ModalFooter, FormGroup, Tag } from '../../components/ui'
import toast from 'react-hot-toast'
import s from './appcc.module.css'

export default function AjustesTab() {
  const [d, setD] = useState(null)
  const [eq, setEq] = useState(null)
  const [mp, setMp] = useState(null)
  const cargar = useCallback(async () => {
    const [e, m] = await Promise.all([
      supabase.from('appcc_equipos').select('*').eq('activo', true).order('orden'),
      supabase.from('materias_primas').select('*').eq('activo', true).order('nombre'),
    ])
    if (e.error || m.error) return toast.error('Error: ' + (e.error || m.error).message)
    setD({ equipos: e.data, materias: m.data })
  }, [])
  useEffect(() => { cargar() }, [cargar])
  if (!d) return <Loading />

  async function guardarEq() {
    if (!eq.nombre.trim()) return toast.error('Pon el nombre del equipo')
    const frio = eq.tipo === 'frio'
    const datos = { nombre: eq.nombre.trim(), tipo: eq.tipo, t_min: frio ? 0 : null, t_max: frio ? 4 : -18 }
    const { error } = eq.id ? await supabase.from('appcc_equipos').update(datos).eq('id', eq.id) : await supabase.from('appcc_equipos').insert({ ...datos, orden: d.equipos.length + 1 })
    if (error) return toast.error('Error: ' + error.message)
    setEq(null); cargar()
  }
  async function quitarEq(e) {
    if (!window.confirm(`¿Quitar «${e.nombre}»? Sus temperaturas ya registradas se conservan.`)) return
    const { error } = await supabase.from('appcc_equipos').update({ activo: false }).eq('id', e.id)
    if (error) return toast.error('Error: ' + error.message)
    cargar()
  }
  async function guardarMp() {
    if (!mp.nombre.trim()) return toast.error('Pon el nombre')
    const datos = { nombre: mp.nombre.trim(), unidad: mp.unidad, stock_minimo: parseFloat(String(mp.stock_minimo).replace(',', '.')) || 0, alergenos: mp.alergenos }
    const { error } = mp.id ? await supabase.from('materias_primas').update(datos).eq('id', mp.id) : await supabase.from('materias_primas').insert(datos)
    if (error) return toast.error('Error: ' + error.message)
    setMp(null); cargar()
  }
  async function quitarMp(m) {
    if (!window.confirm(`¿Quitar «${m.nombre}» de la lista? Su historial se conserva.`)) return
    const { error } = await supabase.from('materias_primas').update({ activo: false }).eq('id', m.id)
    if (error) return toast.error('Error: ' + error.message)
    cargar()
  }

  return (
    <div className={s.stack}>
      <Card>
        <CardTitle action={<Btn size="sm" variant="ghost" onClick={() => setEq({ nombre: '', tipo: 'frio' })}>+ Añadir</Btn>}>Equipos de frío</CardTitle>
        <div className={s.list}>{d.equipos.map(e => (
          <div key={e.id} className={s.item}><span className={s.grow}><b>{e.nombre}</b> <span className={s.muted}>· {rangoTxt(e)}</span></span>
            <Btn size="sm" variant="ghost" onClick={() => setEq({ ...e })}>Editar</Btn><Btn size="sm" variant="danger" onClick={() => quitarEq(e)}>Quitar</Btn></div>))}</div>
        <p className={s.muted} style={{ margin: '10px 0 0' }}>Rangos según la normativa: refrigeración entre 0 y 4 °C, congelación a −18 °C o menos.</p>
      </Card>
      <Card>
        <CardTitle action={<Btn size="sm" variant="ghost" onClick={() => setMp({ nombre: '', unidad: 'kg', stock_minimo: '', alergenos: [] })}>+ Añadir</Btn>}>Materias primas</CardTitle>
        <div className={s.list}>{d.materias.map(m => (
          <div key={m.id} className={s.item}><span className={s.grow}><b>{m.nombre}</b> <span className={s.muted}>· {m.unidad}{Number(m.stock_minimo) > 0 ? ` · mínimo ${num(m.stock_minimo)}` : ''}</span>{m.alergenos.length > 0 && <div>{m.alergenos.map(a => <Tag key={a} color="red">{a}</Tag>)}</div>}</span>
            <Btn size="sm" variant="ghost" onClick={() => setMp({ ...m, stock_minimo: m.stock_minimo || '' })}>Editar</Btn><Btn size="sm" variant="danger" onClick={() => quitarMp(m)}>Quitar</Btn></div>))}</div>
      </Card>

      <Modal open={!!eq} onClose={() => setEq(null)} title={eq?.id ? 'Editar equipo' : 'Nuevo equipo de frío'}>
        {eq && <>
          <FormGroup label="Nombre"><input value={eq.nombre} onChange={e => setEq({ ...eq, nombre: e.target.value })} placeholder="Ej.: Arcón del obrador" /></FormGroup>
          <FormGroup label="Tipo"><select value={eq.tipo} onChange={e => setEq({ ...eq, tipo: e.target.value })}><option value="frio">Refrigeración (0 a 4 °C)</option><option value="congelacion">Congelación (−18 °C o menos)</option></select></FormGroup>
          <ModalFooter><Btn variant="ghost" onClick={() => setEq(null)}>Cancelar</Btn><Btn variant="gold" onClick={guardarEq}>Guardar</Btn></ModalFooter>
        </>}
      </Modal>
      <Modal open={!!mp} onClose={() => setMp(null)} title={mp?.id ? 'Editar materia prima' : 'Nueva materia prima'} wide>
        {mp && <>
          <div className={s.row}>
            <div className={s.grow}><FormGroup label="Nombre"><input value={mp.nombre} onChange={e => setMp({ ...mp, nombre: e.target.value })} /></FormGroup></div>
            <div style={{ width: 120 }}><FormGroup label="Unidad"><select value={mp.unidad} onChange={e => setMp({ ...mp, unidad: e.target.value })}><option value="kg">kg</option><option value="L">litros</option><option value="ud">unidades</option></select></FormGroup></div>
            <div style={{ width: 140 }}><FormGroup label="Stock mínimo"><input inputMode="decimal" value={mp.stock_minimo} onChange={e => setMp({ ...mp, stock_minimo: e.target.value })} placeholder="Para avisar" /></FormGroup></div>
          </div>
          <FormGroup label="Alérgenos que contiene">
            <div className={s.row}>{ALERGENOS.map(a => (
              <label key={a} className={s.item} style={{ padding: '6px 10px', cursor: 'pointer' }}><input type="checkbox" checked={mp.alergenos.includes(a)} onChange={e => setMp({ ...mp, alergenos: e.target.checked ? [...mp.alergenos, a] : mp.alergenos.filter(x => x !== a) })} style={{ width: 'auto' }} /> {a}</label>))}</div>
          </FormGroup>
          <ModalFooter><Btn variant="ghost" onClick={() => setMp(null)}>Cancelar</Btn><Btn variant="gold" onClick={guardarMp}>Guardar</Btn></ModalFooter>
        </>}
      </Modal>
    </div>
  )
}
