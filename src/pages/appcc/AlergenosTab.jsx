// src/pages/appcc/AlergenosTab.jsx
// Alérgenos de cada producto (14 de declaración obligatoria, Reglamento 1169/2011),
// calculados a partir de las recetas y de los alérgenos de cada materia prima.
import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { ALERGENOS } from '../../lib/appcc'
import { Card, Loading, Tag, Btn } from '../../components/ui'
import toast from 'react-hot-toast'
import s from './appcc.module.css'

export default function AlergenosTab() {
  const [filas, setFilas] = useState(null)
  const [cartel, setCartel] = useState(false)
  useEffect(() => {
    Promise.all([supabase.rpc('alergenos_productos'), supabase.from('productos').select('id,nombre').eq('activo', true).order('nombre')])
      .then(([a, p]) => {
        if (a.error || p.error) { toast.error('Error: ' + (a.error || p.error).message); setFilas([]); return }
        const m = Object.fromEntries(a.data.map(x => [x.producto_id, x]))
        setFilas(p.data.map(pr => ({ nombre: pr.nombre, al: new Set(m[pr.id]?.alergenos || []), receta: !!m[pr.id]?.tiene_receta })))
      })
  }, [])
  if (!filas) return <Loading />
  const sinReceta = filas.filter(f => !f.receta).length
  return (
    <div className={s.stack}>
      <div className={s.row} style={{ justifyContent: 'space-between' }}>
        <p className={s.muted} style={{ margin: 0 }}>Se calculan solos a partir de las recetas. {sinReceta > 0 && <b style={{ color: 'var(--wrn)' }}>{sinReceta} producto(s) sin receta: sus alérgenos no se conocen todavía.</b>}</p>
        <Btn variant={cartel ? 'ghost' : 'gold'} onClick={() => setCartel(c => !c)}>{cartel ? 'Ver la tabla' : 'Ver cartel para el mostrador'}</Btn>
      </div>
      {cartel ? (
        <div className={s.cartel}>
          <h3 style={{ fontFamily: 'var(--serif)', fontWeight: 400, fontSize: 26, color: 'var(--pur)', textAlign: 'center', margin: '0 0 4px' }}>Información sobre alérgenos</h3>
          <p className={s.muted} style={{ textAlign: 'center', margin: '0 0 14px' }}>Productos MariSol · Consulte a nuestro personal ante cualquier duda</p>
          <div className={s.list}>{filas.filter(f => f.receta).map(f => (
            <div key={f.nombre} className={s.item}><span className={s.grow}><b>{f.nombre}</b></span>{f.al.size ? <span>Contiene: <b>{[...f.al].join(', ')}</b></span> : <Tag color="green">Sin alérgenos de declaración obligatoria</Tag>}</div>))}</div>
          <p className={s.muted} style={{ textAlign: 'center', margin: '14px 0 0' }}>En el obrador se manipulan otros alérgenos: puede haber trazas.</p>
        </div>
      ) : (
        <Card>
          <div className={s.tw}><table className={s.ftable}><thead><tr><th>Producto</th>{ALERGENOS.map(a => <th key={a} className={s.vhead}>{a}</th>)}</tr></thead>
            <tbody>{filas.map(f => (
              <tr key={f.nombre} style={{ borderTop: '1px solid var(--bor)' }}><td style={{ whiteSpace: 'nowrap' }}><b>{f.nombre}</b>{!f.receta && <> <Tag color="warn">Sin receta</Tag></>}</td>
                {ALERGENOS.map(a => <td key={a} className={s.al} title={a}><span className={f.al.has(a) ? s.alSi : s.alNo} /></td>)}</tr>))}</tbody></table></div>
          <p className={s.muted} style={{ margin: '10px 0 0' }}>● rojo = lo contiene.</p>
        </Card>
      )}
    </div>
  )
}
