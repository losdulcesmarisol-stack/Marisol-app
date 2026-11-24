// src/pages/appcc/PlanTab.jsx
// Plan de limpieza y desinfección (los administradores pueden cambiarlo).
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { todayStr } from '../../lib/utils'
import { frecuenciaTxt, proximaLimpieza, fdCorta } from '../../lib/appcc'
import { Card, CardTitle, Loading, Tag, Btn, Modal, ModalFooter, FormGroup } from '../../components/ui'
import toast from 'react-hot-toast'
import s from './appcc.module.css'

const FRECS = [[1, 'Todos los días'], [7, 'Cada semana'], [14, 'Cada 2 semanas'], [30, 'Una vez al mes'], [60, 'Cada 2 meses'], [90, 'Cada 3 meses']]

export default function PlanTab() {
  const { isAdmin } = useAuth()
  const [tareas, setTareas] = useState(null)
  const [edit, setEdit] = useState(null)
  const cargar = useCallback(async () => {
    const { data, error } = await supabase.from('limpieza_tareas').select('*').eq('activo', true).order('orden')
    if (error) return toast.error('Error: ' + error.message)
    setTareas(data)
  }, [])
  useEffect(() => { cargar() }, [cargar])
  if (!tareas) return <Loading />

  async function guardar() {
    const t = edit
    if (!t.nombre.trim()) return toast.error('Pon qué se limpia')
    const datos = { nombre: t.nombre.trim(), cada_dias: Number(t.cada_dias), proxima: t.proxima || todayStr(), producto: t.producto.trim(), procedimiento: t.procedimiento.trim(), por_confirmar: false }
    const { error } = t.id ? await supabase.from('limpieza_tareas').update(datos).eq('id', t.id)
      : await supabase.from('limpieza_tareas').insert({ ...datos, orden: tareas.length + 1 })
    if (error) return toast.error('Error: ' + error.message)
    toast.success('Plan actualizado'); setEdit(null); cargar()
  }
  async function quitar(t) {
    if (!window.confirm(`¿Quitar «${t.nombre}» del plan? Lo ya registrado se conserva.`)) return
    const { error } = await supabase.from('limpieza_tareas').update({ activo: false }).eq('id', t.id)
    if (error) return toast.error('Error: ' + error.message)
    cargar()
  }

  return (
    <div className={s.stack}>
      {isAdmin && tareas.some(t => t.por_confirmar) && <div className={s.note}>Hay tareas marcadas «Confirmar»: revisa su frecuencia y la próxima fecha, y guárdalas.</div>}
      <Card>
        <CardTitle action={isAdmin && <Btn size="sm" variant="ghost" onClick={() => setEdit({ nombre: '', cada_dias: 1, proxima: todayStr(), producto: '', procedimiento: '' })}>+ Añadir</Btn>}>Plan de limpieza y desinfección</CardTitle>
        <div className={s.tw}><table className={s.ftable}><thead><tr><th>Qué</th><th>Cada cuánto</th><th>Próxima</th><th>Producto</th><th>Cómo</th>{isAdmin && <th />}</tr></thead>
          <tbody>{tareas.map(t => (
            <tr key={t.id} style={{ borderTop: '1px solid var(--bor)', verticalAlign: 'top' }}>
              <td><b>{t.nombre}</b>{t.por_confirmar && <div><Tag color="warn">Confirmar</Tag></div>}</td>
              <td style={{ whiteSpace: 'nowrap' }}>{frecuenciaTxt(t.cada_dias)}</td>
              <td style={{ whiteSpace: 'nowrap' }}>{fdCorta(proximaLimpieza(t))}</td>
              <td style={{ minWidth: 160 }}>{t.producto}</td>
              <td style={{ minWidth: 240 }}>{t.procedimiento}</td>
              {isAdmin && <td style={{ whiteSpace: 'nowrap' }}><Btn size="sm" variant="ghost" onClick={() => setEdit({ ...t })}>Editar</Btn> <Btn size="sm" variant="danger" onClick={() => quitar(t)}>Quitar</Btn></td>}
            </tr>))}</tbody></table></div>
      </Card>
      <Card>
        <CardTitle>Normas que pide Sanidad</CardTitle>
        <ul style={{ margin: 0, paddingLeft: 20, display: 'grid', gap: 6 }}>
          <li><b>Primero limpiar, después desinfectar.</b> El desinfectante no funciona sobre suciedad.</li>
          <li>Los <b>desinfectantes</b> deben llevar en la etiqueta las siglas <b>«HA»</b> (uso en la industria alimentaria). La lejía vale si la etiqueta dice que es apta para uso alimentario o para desinfectar agua de bebida.</li>
          <li>Usar siempre <b>la dosis y el tiempo de la etiqueta o ficha técnica</b>. Guardad las fichas técnicas: el inspector puede pedirlas.</li>
          <li>Después de desinfectar, <b>aclarar con agua potable</b> todo lo que toca la masa o el producto.</li>
          <li>Limpiar <b>sin alimentos al descubierto</b>, de lo más limpio a lo más sucio. El suelo, lo último.</li>
          <li>Productos de limpieza en un <b>armario cerrado y separado</b>; bayetas y fregonas de los aseos, aparte.</li>
        </ul>
      </Card>

      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'Editar limpieza' : 'Nueva limpieza'} wide>
        {edit && <>
          <FormGroup label="Qué se limpia"><input value={edit.nombre} onChange={e => setEdit({ ...edit, nombre: e.target.value })} /></FormGroup>
          <div className={s.row}>
            <div className={s.grow}><FormGroup label="Cada cuánto"><select value={edit.cada_dias} onChange={e => setEdit({ ...edit, cada_dias: Number(e.target.value) })}>{FRECS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></FormGroup></div>
            <div className={s.grow}><FormGroup label="Próxima vez que toca"><input type="date" value={edit.proxima} onChange={e => setEdit({ ...edit, proxima: e.target.value })} /></FormGroup></div>
          </div>
          <FormGroup label="Producto"><input value={edit.producto} onChange={e => setEdit({ ...edit, producto: e.target.value })} /></FormGroup>
          <FormGroup label="Cómo se hace"><textarea value={edit.procedimiento} onChange={e => setEdit({ ...edit, procedimiento: e.target.value })} /></FormGroup>
          <ModalFooter><Btn variant="ghost" onClick={() => setEdit(null)}>Cancelar</Btn><Btn variant="gold" onClick={guardar}>Guardar</Btn></ModalFooter>
        </>}
      </Modal>
    </div>
  )
}
