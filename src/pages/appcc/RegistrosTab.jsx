// src/pages/appcc/RegistrosTab.jsx
// Lo que se enseña en una inspección: temperaturas, limpieza, revisiones y albaranes.
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { todayStr, sumarDias, fechaES, horaStr } from '../../lib/utils'
import { tareasDelDia, fdCorta, fd, num } from '../../lib/appcc'
import { Card, CardTitle, Loading, Tag } from '../../components/ui'
import toast from 'react-hot-toast'
import s from './appcc.module.css'

export default function RegistrosTab() {
  const [dias, setDias] = useState(14)
  const [d, setD] = useState(null)
  const hoy = todayStr(); const desde = sumarDias(hoy, -(dias - 1))

  const cargar = useCallback(async () => {
    const [eq, tp, ta, inc, ver, rec] = await Promise.all([
      supabase.from('appcc_equipos').select('*').order('orden'),
      supabase.from('appcc_temperaturas').select('*').gte('fecha_hora', desde + 'T00:00:00+02:00').order('fecha_hora'),
      supabase.from('limpieza_tareas').select('*').order('orden'),
      supabase.from('limpieza_incidencias').select('*').gte('fecha', desde),
      supabase.from('limpieza_verificaciones').select('*').order('mes', { ascending: false }).limit(12),
      supabase.from('recepciones').select('*, lotes_mp(*, materias_primas(nombre,unidad))').gte('fecha', desde).order('fecha', { ascending: false }),
    ])
    const err = [eq, tp, ta, inc, ver, rec].find(r => r.error)
    if (err) return toast.error('Error cargando los registros: ' + err.error.message)
    setD({ equipos: eq.data, temps: tp.data, tareas: ta.data, incid: inc.data, verif: ver.data, recep: rec.data })
  }, [desde])
  useEffect(() => { cargar() }, [cargar])
  if (!d) return <Loading />

  const listaDias = []; for (let f = hoy; f >= desde; f = sumarDias(f, -1)) listaDias.push(f)
  const tempsDia = (eId, f) => d.temps.filter(t => t.equipo_id === eId && fechaES(new Date(t.fecha_hora)) === f)
  const incid = (tId, f) => d.incid.find(i => i.tarea_id === tId && i.fecha === f)
  const fuera = d.temps.filter(t => t.fuera_rango && fechaES(new Date(t.fecha_hora)) >= desde)

  return (
    <div className={s.stack}>
      <div className={s.row}>
        <span className={s.muted}>Mostrar:</span>
        {[7, 14, 30].map(n => <button key={n} className={`${s.tab} ${dias === n ? s.tabOn : ''}`} onClick={() => setDias(n)}>Últimos {n} días</button>)}
        <span className={s.muted}>Para periodos más largos, usa «Informes PDF».</span>
      </div>

      <Card>
        <CardTitle>Temperaturas</CardTitle>
        <p className={s.muted} style={{ margin: '-4px 0 10px' }}>Ley: cámara y frigoríficos entre 0 y 4 °C · congeladores a −18 °C o menos.</p>
        <div className={s.tw}><table className={s.ftable}><thead><tr><th>Día</th>{d.equipos.map(e => <th key={e.id}>{e.nombre}</th>)}</tr></thead>
          <tbody>{listaDias.map(f => (
            <tr key={f} style={{ borderTop: '1px solid var(--bor)' }}><td style={{ whiteSpace: 'nowrap' }}>{fdCorta(f)}</td>{d.equipos.map(e => { const ts = tempsDia(e.id, f); return (
              <td key={e.id} className={s.num} style={{ whiteSpace: 'nowrap', color: ts.some(t => t.fuera_rango) ? 'var(--err)' : undefined, fontWeight: ts.some(t => t.fuera_rango) ? 700 : 400 }}>{ts.length ? ts.map(t => num(t.valor, 1)).join(' / ') : <span style={{ color: 'var(--txt3)' }}>—</span>}</td>) })}</tr>))}
          </tbody></table></div>
        <h3 style={{ margin: '14px 0 8px', fontSize: 14 }}>Fuera de rango y medidas correctoras</h3>
        {fuera.length === 0 ? <p className={s.muted}>Ninguna en este periodo.</p> : <div className={s.list}>{fuera.map(t => (
          <div key={t.id} className={s.item}><span className={s.grow}><b>{d.equipos.find(e => e.id === t.equipo_id)?.nombre}</b> · {num(t.valor, 1)} °C · {fd(fechaES(new Date(t.fecha_hora)))} {horaStr(new Date(t.fecha_hora))}<div className={s.muted}>{t.correctora} ({t.usuario_nombre})</div></span></div>))}</div>}
      </Card>

      <Card>
        <CardTitle>Limpieza según el plan</CardTitle>
        <div className={s.tw}><table className={s.ftable}><tbody>{listaDias.map(f => { const ts = tareasDelDia(d.tareas, f); return (
          <tr key={f} style={{ borderTop: '1px solid var(--bor)' }}><td style={{ whiteSpace: 'nowrap', width: 110 }}>{fdCorta(f)}</td><td>
            {ts.length === 0 ? <span className={s.muted}>—</span> : ts.map(t => { const i = incid(t.id, f); return <span key={t.id} style={{ marginRight: 4 }}><Tag color={i ? 'red' : 'green'}>{t.nombre}{i ? ': no hecha' : ''}</Tag></span> })}
            {ts.filter(t => incid(t.id, f)).map(t => <div key={t.id} className={s.muted}>{t.nombre}: {incid(t.id, f).motivo} ({incid(t.id, f).usuario_nombre})</div>)}
          </td></tr>) })}</tbody></table></div>
        <h3 style={{ margin: '14px 0 8px', fontSize: 14 }}>Revisiones mensuales firmadas</h3>
        {d.verif.length === 0 ? <p className={s.muted}>Todavía no hay ninguna.</p> : <div className={s.list}>{d.verif.map(v => (
          <div key={v.id} className={s.item}><span className={s.grow}><b>{new Date(v.mes + '-15T12:00:00').toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })}</b> · firmada por {v.usuario_nombre} el {fd(v.fecha)}<div className={s.muted}>{v.observaciones}</div></span><Tag color="green">Firmada</Tag></div>))}</div>}
      </Card>

      <Card>
        <CardTitle>Albaranes recibidos</CardTitle>
        {d.recep.length === 0 ? <p className={s.muted}>Ninguno en este periodo.</p> : <div className={s.list}>{d.recep.map(r => (
          <details key={r.id} className={s.item} style={{ display: 'block' }}>
            <summary style={{ cursor: 'pointer' }}><b>{r.proveedor_nombre}</b> <span className={s.muted}>· {r.albaran || 's/n'} · {fd(r.fecha)} · {r.usuario_nombre}</span> {r.lotes_mp.some(l => l.estado === 'rechazado') && <Tag color="red">Con rechazos</Tag>} {r.foto_url && <a href={r.foto_url} target="_blank" rel="noreferrer">Ver foto</a>}</summary>
            <div className={s.tw} style={{ marginTop: 8 }}><table className={s.ftable}><tbody>{r.lotes_mp.map(l => (
              <tr key={l.id}><td>{l.materias_primas?.nombre}</td><td className={s.num}>{num(l.cantidad)} {l.materias_primas?.unidad}</td><td>Lote {l.lote}</td><td>{l.caducidad ? 'Cad. ' + fd(l.caducidad) : ''}</td><td>{l.temperatura != null ? num(l.temperatura, 1) + ' °C' : ''}</td><td><Tag color={l.estado === 'aceptado' ? 'green' : 'red'}>{l.estado === 'aceptado' ? 'Aceptado' : 'Rechazado: ' + (l.motivo || '')}</Tag></td></tr>))}</tbody></table></div>
          </details>))}</div>}
      </Card>
    </div>
  )
}
