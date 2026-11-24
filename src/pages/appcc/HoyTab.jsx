// src/pages/appcc/HoyTab.jsx
// Control del día: temperaturas, limpieza (según el plan), lote del día, mercancía,
// revisión mensual y avisos de caducidad / stock bajo.
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { todayStr, fechaES, horaStr } from '../../lib/utils'
import { CORRECTORAS_TEMP, fueraRango, rangoTxt, tareasDelDia, loteDe, num, avisoCaducidad, diasHasta } from '../../lib/appcc'
import { Card, CardTitle, Btn, Loading, Tag } from '../../components/ui'
import RecepcionModal from './RecepcionModal'
import toast from 'react-hot-toast'
import s from './appcc.module.css'

export default function HoyTab({ irA }) {
  const { user, isAdmin } = useAuth()
  const hoy = todayStr(); const mes = hoy.slice(0, 7)
  const [d, setD] = useState(null)
  const [draft, setDraft] = useState(null)
  const [motivoPara, setMotivoPara] = useState(null)
  const [motivo, setMotivo] = useState('')
  const [obsVerif, setObsVerif] = useState('')
  const [recep, setRecep] = useState(null)   // 'albaran' | 'inventario' | null
  const [verLote, setVerLote] = useState(false)
  const [guardando, setGuardando] = useState(false)

  const cargar = useCallback(async () => {
    const desde = new Date(Date.now() - 3 * 86400000).toISOString()
    const [eq, tp, ta, inc, ver, prod, rec, lot, mat, term] = await Promise.all([
      supabase.from('appcc_equipos').select('*').eq('activo', true).order('orden'),
      supabase.from('appcc_temperaturas').select('*').gte('fecha_hora', desde).order('fecha_hora', { ascending: false }),
      supabase.from('limpieza_tareas').select('*').eq('activo', true).order('orden'),
      supabase.from('limpieza_incidencias').select('*').eq('fecha', hoy),
      supabase.from('limpieza_verificaciones').select('*').eq('mes', mes),
      supabase.from('produccion_diaria').select('id,fecha,created_at,productos').eq('fecha', hoy).maybeSingle(),
      supabase.from('recepciones').select('id,proveedor_nombre,albaran').eq('fecha', hoy),
      supabase.from('lotes_mp_stock').select('id,materia_id,lote,caducidad,restante,estado,created_at').eq('estado', 'aceptado').gt('restante', 0),
      supabase.from('materias_primas').select('id,nombre,unidad,stock_minimo').eq('activo', true),
      supabase.from('stock_terminados').select('*').eq('estado', 'en_stock'),
    ])
    const err = [eq, tp, ta, inc, ver, prod, rec, lot, mat, term].find(r => r.error)
    if (err) { toast.error('Error cargando el APPCC: ' + err.error.message); return }
    let consumos = []
    if (prod.data) {
      const { data } = await supabase.from('produccion_consumos').select('materia_id,cantidad,lote_id').eq('produccion_id', prod.data.id)
      consumos = data || []
    }
    setD({ equipos: eq.data, temps: tp.data, tareas: ta.data, incid: inc.data, verif: ver.data, prod: prod.data, consumos, recepciones: rec.data, lotes: lot.data, materias: mat.data, terminados: term.data })
  }, [hoy, mes])
  useEffect(() => { cargar() }, [cargar])

  if (!d) return <Loading />

  const tempHoy = id => d.temps.find(t => t.equipo_id === id && fechaES(new Date(t.fecha_hora)) === hoy)
  const ultima = id => d.temps.find(t => t.equipo_id === id)
  const tempsHechas = d.equipos.length > 0 && d.equipos.every(e => tempHoy(e.id))
  const draftActual = draft || Object.fromEntries(d.equipos.map(e => [e.id, { v: ultima(e.id)?.valor ?? (e.tipo === 'congelacion' ? -20 : 3), c: '' }]))
  const setV = (id, v) => setDraft({ ...draftActual, [id]: { ...draftActual[id], v } })
  const setC = (id, c) => setDraft({ ...draftActual, [id]: { ...draftActual[id], c } })

  async function guardarTemps() {
    const filas = d.equipos.map(e => {
      const v = parseFloat(String(draftActual[e.id].v).replace(',', '.'))
      return { e, v, c: draftActual[e.id].c }
    })
    const mal = filas.find(f => isNaN(f.v)); if (mal) return toast.error('Falta la temperatura de ' + mal.e.nombre)
    const sinC = filas.filter(f => fueraRango(f.e, f.v) && !f.c)
    if (sinC.length) return toast.error('Di qué se ha hecho con: ' + sinC.map(f => f.e.nombre).join(', '))
    if (guardando) return
    setGuardando(true)
    const { data, error } = await supabase.from('appcc_temperaturas').insert(filas.map(f => ({
      equipo_id: f.e.id, valor: f.v, fuera_rango: fueraRango(f.e, f.v), correctora: fueraRango(f.e, f.v) ? f.c : null,
      usuario_id: user?.id, usuario_nombre: user?.nombre,
    }))).select()
    setGuardando(false)
    if (error) return toast.error('Error: ' + error.message)
    // se muestra al momento como apuntado, para que no se pueda guardar dos veces
    setD(prev => ({ ...prev, temps: [...data, ...prev.temps] }))
    toast.success('Temperaturas guardadas'); setDraft(null)
  }

  const tareasHoy = tareasDelDia(d.tareas, hoy)
  const incid = id => d.incid.find(i => i.tarea_id === id)
  async function guardarNoHecha(t) {
    if (!motivo.trim()) return toast.error('Escribe por qué no se ha hecho')
    const { data, error } = await supabase.from('limpieza_incidencias').insert({ tarea_id: t.id, fecha: hoy, motivo: motivo.trim(), usuario_id: user?.id, usuario_nombre: user?.nombre }).select().single()
    if (error) return toast.error('Error: ' + error.message)
    setD(prev => ({ ...prev, incid: [...prev.incid, data] }))
    setMotivoPara(null); setMotivo(''); toast.success('Apuntado')
  }
  async function deshacer(i) {
    const { error } = await supabase.from('limpieza_incidencias').delete().eq('id', i.id)
    if (error) return toast.error('Error: ' + error.message)
    setD(prev => ({ ...prev, incid: prev.incid.filter(x => x.id !== i.id) }))
  }
  async function firmarRevision() {
    const { data, error } = await supabase.from('limpieza_verificaciones').insert({ mes, fecha: hoy, observaciones: obsVerif.trim() || 'Todo correcto', usuario_id: user?.id, usuario_nombre: user?.nombre }).select().single()
    if (error) return toast.error(error.code === '23505' ? 'La revisión de este mes ya está firmada' : 'Error: ' + error.message)
    setD(prev => ({ ...prev, verif: [...prev.verif, data] }))
    toast.success('Revisión del mes firmada')
  }

  const nombreMat = id => d.materias.find(m => m.id === id)
  const caducan = [
    ...d.lotes.filter(l => l.caducidad && diasHasta(l.caducidad) <= 7).map(l => ({ k: l.id, nombre: nombreMat(l.materia_id)?.nombre, extra: `lote ${l.lote} · quedan ${num(l.restante)} ${nombreMat(l.materia_id)?.unidad || ''}`, f: l.caducidad })),
    ...d.terminados.filter(t => t.consumo_preferente && diasHasta(t.consumo_preferente) <= 7).map(t => ({ k: t.id, nombre: t.producto_nombre, extra: `lote ${loteDe(t.fecha_fabricacion)} · ${num(t.cantidad)} ${t.unidad}`, f: t.consumo_preferente })),
  ].sort((a, b) => a.f.localeCompare(b.f))
  const stockDe = id => d.lotes.filter(l => l.materia_id === id).reduce((a, l) => a + Number(l.restante), 0)
  const bajos = d.materias.filter(m => Number(m.stock_minimo) > 0 && stockDe(m.id) < Number(m.stock_minimo))
  const sinStock = d.lotes.length === 0

  return (
    <div className={s.stack}>
      {isAdmin && sinStock && (
        <div className={s.note} style={{ fontSize: 14 }}>
          <b>Primer día:</b> haz el <b>inventario de arranque</b> (lo que ya hay en el almacén) para que el stock empiece bien.
          <div className={s.row} style={{ marginTop: 8 }}><Btn variant="gold" onClick={() => setRecep('inventario')}>Hacer inventario de arranque</Btn><Btn variant="ghost" onClick={() => irA('rec')}>Poner las recetas</Btn></div>
        </div>
      )}

      {isAdmin && d.verif.length === 0 && (
        <Card>
          <CardTitle action={<Tag color="warn">Solo administradores · 1 minuto</Tag>}>Revisión del mes</CardTitle>
          <p style={{ margin: '0 0 10px' }}>Una vez al mes, el responsable comprueba que el plan de limpieza y los registros se cumplen, y lo firma. Aprovecha para hacer el <b>recuento del almacén</b> (pestaña Stock).</p>
          <div className={s.row}><input placeholder="Observaciones (opcional)" value={obsVerif} onChange={e => setObsVerif(e.target.value)} style={{ flex: 1, minWidth: 200 }} /><Btn variant="gold" onClick={firmarRevision}>Firmar la revisión de {new Date(hoy + 'T12:00:00').toLocaleDateString('es-ES', { month: 'long' })}</Btn></div>
        </Card>
      )}

      <Card>
        <CardTitle action={tempsHechas ? <Tag color="green">Apuntadas hoy</Tag> : <Tag color="warn">Por apuntar · 20 segundos</Tag>}>Temperaturas</CardTitle>
        {tempsHechas ? (
          <div className={s.sens}>{d.equipos.map(e => { const t = tempHoy(e.id); return (
            <div key={e.id} className={`${s.sen} ${t.fuera_rango ? s.senMal : ''}`}><b>{e.nombre}</b><span className={s.senV}>{num(t.valor, 1)} °C</span><span className={s.muted}>{horaStr(new Date(t.fecha_hora))} · {t.usuario_nombre}</span>{t.correctora && <span style={{ fontSize: 12, color: 'var(--err)' }}>{t.correctora}</span>}</div>) })}</div>
        ) : d.equipos.length === 0 ? <p className={s.muted}>No hay equipos de frío dados de alta.</p> : (<>
          <p className={s.muted} style={{ margin: '0 0 10px' }}>Viene puesta la última anotada. Mirad el termómetro de cada equipo y cambiad solo lo que sea distinto.</p>
          <div className={s.trows}>{d.equipos.map(e => { const dr = draftActual[e.id]; const v = parseFloat(String(dr.v).replace(',', '.')); const mal = !isNaN(v) && fueraRango(e, v); return (
            <div key={e.id} className={`${s.trow} ${mal ? s.trowMal : ''}`}>
              <div><b>{e.nombre}</b><div className={s.muted}>Ley: {rangoTxt(e)}</div></div>
              <div className={s.stepper}>
                <button type="button" aria-label={'Bajar ' + e.nombre} onClick={() => setV(e.id, Math.round(((isNaN(v) ? 0 : v) - 0.5) * 10) / 10)}>−</button>
                <input inputMode="decimal" value={dr.v} onChange={ev => setV(e.id, ev.target.value)} aria-label={'Temperatura ' + e.nombre} />
                <button type="button" aria-label={'Subir ' + e.nombre} onClick={() => setV(e.id, Math.round(((isNaN(v) ? 0 : v) + 0.5) * 10) / 10)}>+</button>
              </div>
              {mal && <label className={s.corr}><span style={{ color: 'var(--err)', fontSize: 12, fontWeight: 700 }}>Fuera de rango: ¿qué se ha hecho?</span>
                <select value={dr.c} onChange={ev => setC(e.id, ev.target.value)}><option value="">Elige…</option>{CORRECTORAS_TEMP.map(o => <option key={o}>{o}</option>)}</select></label>}
            </div>) })}</div>
          <Btn variant="gold" fullWidth onClick={guardarTemps} disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar temperaturas'}</Btn>
        </>)}
      </Card>

      <Card>
        <CardTitle action={<Tag color="green">Según el plan</Tag>}>Limpieza de hoy</CardTitle>
        <p className={s.muted} style={{ margin: '0 0 10px' }}>Lo que toca hoy según vuestro plan. No hay que confirmar nada: solo avisad si algo <b>no</b> se ha hecho.</p>
        {tareasHoy.length === 0 ? <p className={s.muted}>Hoy no toca ninguna limpieza del plan.</p> : (
          <div className={s.list}>{tareasHoy.map(t => { const i = incid(t.id); return (
            <div key={t.id}>
              <div className={`${s.item} ${i ? '' : s.itemOk}`}>
                <span className={`${s.check} ${i ? s.checkNo : ''}`}>{i ? '' : '✓'}</span>
                <span className={s.grow}><b>{t.nombre}</b>{i && <div style={{ color: 'var(--err)', fontSize: 13 }}>No se ha hecho: {i.motivo} ({i.usuario_nombre})</div>}</span>
                {i ? <Btn size="sm" variant="ghost" onClick={() => deshacer(i)}>Deshacer</Btn> : <Btn size="sm" variant="ghost" onClick={() => { setMotivoPara(t.id); setMotivo('') }}>No se ha hecho</Btn>}
              </div>
              {motivoPara === t.id && <div className={s.row} style={{ marginTop: 6 }}><input autoFocus placeholder="¿Por qué? Ej.: se hace mañana a primera hora" value={motivo} onChange={e => setMotivo(e.target.value)} style={{ flex: 1, minWidth: 200 }} /><Btn size="sm" variant="danger" onClick={() => guardarNoHecha(t)}>Guardar</Btn><Btn size="sm" variant="ghost" onClick={() => setMotivoPara(null)}>Cancelar</Btn></div>}
            </div>) })}</div>
        )}
      </Card>

      <Card>
        <CardTitle action={<Tag color="green">Automático</Tag>}>Lote de hoy</CardTitle>
        {d.prod ? (<>
          <div className={s.row} style={{ justifyContent: 'space-between' }}>
            <div><div className={s.lote}>{loteDe(d.prod.fecha)}</div><span className={s.muted}>Se creó al guardar la hoja de producción ({horaStr(new Date(d.prod.created_at))}). El stock se descuenta según las recetas.</span></div>
            <Btn size="sm" variant="ghost" onClick={() => setVerLote(v => !v)}>{verLote ? 'Ocultar' : 'Ver qué se ha descontado'}</Btn>
          </div>
          {verLote && (d.consumos.length === 0 ? <p className={s.note} style={{ marginTop: 10 }}>No se ha descontado nada: faltan recetas para los productos de hoy.</p> : (
            <div className={s.list} style={{ marginTop: 10 }}>{Object.values(d.consumos.reduce((acc, c) => { (acc[c.materia_id] ||= { m: c.materia_id, q: 0, falta: 0 }); c.lote_id ? acc[c.materia_id].q += Number(c.cantidad) : acc[c.materia_id].falta += Number(c.cantidad); return acc }, {})).map(x => (
              <div key={x.m} className={s.item}><span className={s.grow}><b>{nombreMat(x.m)?.nombre}</b></span><span className={s.num}>{num(x.q)} {nombreMat(x.m)?.unidad}</span>{x.falta > 0 && <Tag color="red">Faltó stock: {num(x.falta)}</Tag>}</div>))}</div>
          ))}
        </>) : <p className={s.muted} style={{ margin: 0 }}>Se creará solo cuando se guarde la hoja de producción del día (lote {loteDe(hoy)}).</p>}
      </Card>

      <Card>
        <CardTitle action={<Tag color="gray">Solo cuando llega algo</Tag>}>Mercancía recibida</CardTitle>
        {d.recepciones.map(r => <div key={r.id} className={s.okbox} style={{ marginBottom: 8 }}>✓ {r.proveedor_nombre}{r.albaran ? ' · albarán ' + r.albaran : ''}</div>)}
        <Btn variant="gold" onClick={() => setRecep('albaran')}>📷 Meter un albarán</Btn>
      </Card>

      {(caducan.length > 0 || bajos.length > 0) && (
        <Card>
          <CardTitle>Avisos de almacén</CardTitle>
          <div className={s.list}>
            {caducan.map(c => { const a = avisoCaducidad(c.f); return <div key={c.k} className={s.item}><span className={s.grow}><b>{c.nombre}</b> <span className={s.muted}>· {c.extra}</span></span><Tag color={a.color}>{a.txt}</Tag></div> })}
            {bajos.map(m => <div key={m.id} className={s.item}><span className={s.grow}><b>{m.nombre}</b> <span className={s.muted}>· hay {num(stockDe(m.id))} {m.unidad}, mínimo {num(m.stock_minimo)}</span></span><Tag color="warn">Pedir</Tag></div>)}
          </div>
        </Card>
      )}

      <RecepcionModal open={!!recep} modo={recep || 'albaran'} onClose={() => setRecep(null)} onSaved={cargar} />
    </div>
  )
}
