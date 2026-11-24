// src/pages/appcc/RecetasTab.jsx
// Recetas (solo administradores): lo que lleva UNA unidad de cada producto.
// Sirven para descontar el stock al guardar la producción y para los alérgenos.
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { useProductos } from '../../hooks/useProductos'
import { num } from '../../lib/appcc'
import { Card, CardTitle, Loading, Tag, Btn } from '../../components/ui'
import toast from 'react-hot-toast'
import s from './appcc.module.css'

export default function RecetasTab() {
  const { isAdmin } = useAuth()
  const { productos, loading } = useProductos()
  const [materias, setMaterias] = useState([])
  const [recetas, setRecetas] = useState(null)
  const [sel, setSel] = useState('')
  const [nueva, setNueva] = useState({ materia_id: '', cantidad: '' })

  const cargar = useCallback(async () => {
    const [m, r] = await Promise.all([
      supabase.from('materias_primas').select('*').eq('activo', true).order('nombre'),
      supabase.from('recetas').select('*'),
    ])
    if (m.error || r.error) return toast.error('Error: ' + (m.error || r.error).message)
    setMaterias(m.data); setRecetas(r.data)
  }, [])
  useEffect(() => { cargar() }, [cargar])

  if (!isAdmin) return <Card><p style={{ textAlign: 'center', margin: 20 }}>🔒 Las recetas solo las ven los administradores.</p></Card>
  if (loading || !recetas) return <Loading />

  const prod = productos.find(p => p.id === sel) || productos[0]
  const lineas = recetas.filter(r => r.producto_id === prod?.id)
  const mat = id => materias.find(m => m.id === id)
  const nLineas = id => recetas.filter(r => r.producto_id === id).length

  async function cambiar(r, cantidad) {
    const c = parseFloat(String(cantidad).replace(',', '.'))
    if (!(c > 0)) return toast.error('La cantidad tiene que ser mayor que 0')
    const { error } = await supabase.from('recetas').update({ cantidad: c }).eq('id', r.id)
    if (error) return toast.error('Error: ' + error.message)
    toast.success('Guardado'); cargar()
  }
  async function quitar(r) {
    const { error } = await supabase.from('recetas').delete().eq('id', r.id)
    if (error) return toast.error('Error: ' + error.message)
    cargar()
  }
  async function anadir() {
    const c = parseFloat(String(nueva.cantidad).replace(',', '.'))
    if (!nueva.materia_id) return toast.error('Elige el ingrediente')
    if (!(c > 0)) return toast.error('Pon la cantidad por unidad')
    const { error } = await supabase.from('recetas').insert({ producto_id: prod.id, materia_id: nueva.materia_id, cantidad: c })
    if (error) return toast.error(error.code === '23505' ? 'Ese ingrediente ya está en la receta' : 'Error: ' + error.message)
    setNueva({ materia_id: '', cantidad: '' }); cargar()
  }

  return (
    <div className={s.stack}>
      <p className={s.muted} style={{ margin: 0 }}>Pon lo que lleva <b>una unidad</b> de cada producto (por ejemplo, una barra: 0,165 kg de harina). Con esto la app descuenta el stock al guardar la hoja de producción y calcula los alérgenos.</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(200px, 280px) 1fr', gap: 14, alignItems: 'start' }} className="recetas-grid">
        <Card>
          <CardTitle>Productos</CardTitle>
          <div className={s.list} style={{ maxHeight: 520, overflowY: 'auto' }}>{productos.map(p => (
            <button key={p.id} className={s.item} onClick={() => setSel(p.id)} style={{ textAlign: 'left', width: '100%', borderColor: p.id === prod?.id ? 'var(--pur)' : undefined }}>
              <span className={s.grow}>{p.nombre}</span>{nLineas(p.id) ? <Tag color="green">{nLineas(p.id)}</Tag> : <Tag color="warn">Sin receta</Tag>}
            </button>))}</div>
        </Card>
        {prod && <Card>
          <CardTitle>{prod.nombre} <span className={s.muted}>· por 1 unidad</span></CardTitle>
          {lineas.length === 0 && <p className={s.muted}>Sin ingredientes todavía.</p>}
          <div className={s.list}>{lineas.map(r => (
            <div key={r.id} className={s.item}>
              <span className={s.grow}><b>{mat(r.materia_id)?.nombre}</b>{mat(r.materia_id)?.alergenos?.length > 0 && <span className={s.muted}> · {mat(r.materia_id).alergenos.join(', ')}</span>}</span>
              <input defaultValue={num(r.cantidad, 4)} inputMode="decimal" style={{ width: 100 }} onBlur={e => { if (e.target.value !== num(r.cantidad, 4)) cambiar(r, e.target.value) }} aria-label={'Cantidad de ' + mat(r.materia_id)?.nombre} />
              <span className={s.muted}>{mat(r.materia_id)?.unidad}</span>
              <Btn size="sm" variant="danger" onClick={() => quitar(r)}>✕</Btn>
            </div>))}</div>
          <div className={s.row} style={{ marginTop: 12 }}>
            <select value={nueva.materia_id} onChange={e => setNueva({ ...nueva, materia_id: e.target.value })} style={{ flex: 1, minWidth: 180 }} aria-label="Ingrediente nuevo">
              <option value="">+ Añadir ingrediente…</option>{materias.filter(m => !lineas.some(l => l.materia_id === m.id)).map(m => <option key={m.id} value={m.id}>{m.nombre} ({m.unidad})</option>)}</select>
            <input placeholder="Cantidad" inputMode="decimal" value={nueva.cantidad} onChange={e => setNueva({ ...nueva, cantidad: e.target.value })} style={{ width: 110 }} aria-label="Cantidad por unidad" />
            <Btn variant="gold" onClick={anadir}>Añadir</Btn>
          </div>
        </Card>}
      </div>
      <style>{'@media (max-width: 700px) { .recetas-grid { grid-template-columns: 1fr !important; } }'}</style>
    </div>
  )
}
