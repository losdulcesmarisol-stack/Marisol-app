import { useState, useEffect } from 'react'
import { useProductos } from '../hooks/useProductos'
import { supabase } from '../lib/supabase'
import { fmt, todayStr } from '../lib/utils'
import { Card, CardTitle, SectionHeader, Btn, Loading, Empty, Banner } from '../components/ui'
import toast from 'react-hot-toast'

const CONDICIONES_RAPIDAS = [
  { label: '☀️ Normal', value: 'Día normal' },
  { label: '🌧️ Lluvia', value: 'Lluvia' },
  { label: '🎉 Festivo', value: 'Festivo' },
  { label: '💒 Comuniones', value: 'Comuniones' },
  { label: '🔥 Mucho calor', value: 'Mucho calor' },
  { label: '❄️ Mucho frío', value: 'Mucho frío' },
  { label: '🎪 Evento local', value: 'Evento local' },
  { label: '🏖️ Verano', value: 'Temporada verano' },
]

export default function ProduccionPage() {
  const { productos } = useProductos()
  const [registroHoy, setRegistroHoy] = useState(null)
  const [loading, setLoading] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [condicion, setCondicion] = useState('')
  const [condicionExtra, setCondicionExtra] = useState('')
  const [notas, setNotas] = useState('')
  const [prodSeleccionados, setProdSeleccionados] = useState([])
  const [historial, setHistorial] = useState([])
  const [recomendacion, setRecomendacion] = useState(null)
  const [cargandoIA, setCargandoIA] = useState(false)
  const [tabActiva, setTabActiva] = useState('hoy')
  const [condMañana, setCondMañana] = useState('')

  useEffect(() => { cargarDatos() }, [])

  async function cargarDatos() {
    setLoading(true)
    const [regHoy, hist] = await Promise.all([
      supabase.from('produccion_diaria').select('*').eq('fecha', todayStr()).single(),
      supabase.from('produccion_diaria').select('*').order('fecha', { ascending: false }).limit(60)
    ])
    if (regHoy.data) {
      setRegistroHoy(regHoy.data)
      setCondicion(regHoy.data.condicion || '')
      setNotas(regHoy.data.notas || '')
      setProdSeleccionados(regHoy.data.productos || [])
    }
    setHistorial(hist.data || [])
    setLoading(false)
  }

  // Inicializar productos seleccionados con los del catálogo
  useEffect(() => {
    if (productos.length && !prodSeleccionados.length && !registroHoy) {
      setProdSeleccionados(productos.slice(0, 8).map(p => ({
        prodId: p.id,
        nombre: p.nombre,
        icono: p.icono || '🍞',
        total: '',
        cocidas: '',
        mermas: ''
      })))
    }
  }, [productos, registroHoy])

  function updateProd(prodId, field, val) {
    setProdSeleccionados(prev => prev.map(p =>
      p.prodId === prodId ? { ...p, [field]: val } : p
    ))
  }

  function addProducto(prod) {
    if (prodSeleccionados.find(p => p.prodId === prod.id)) return
    setProdSeleccionados(prev => [...prev, {
      prodId: prod.id, nombre: prod.nombre, icono: prod.icono || '🍞',
      total: '', cocidas: '', mermas: ''
    }])
  }

  function removeProd(prodId) {
    setProdSeleccionados(prev => prev.filter(p => p.prodId !== prodId))
  }

  async function guardarRegistro() {
    setGuardando(true)
    try {
      const datos = {
        fecha: todayStr(),
        condicion: condicion + (condicionExtra ? ' — ' + condicionExtra : ''),
        productos: prodSeleccionados,
        notas
      }
      if (registroHoy) {
        await supabase.from('produccion_diaria').update(datos).eq('id', registroHoy.id)
      } else {
        await supabase.from('produccion_diaria').insert(datos)
      }
      toast.success('Registro guardado')
      await cargarDatos()
    } catch (e) {
      toast.error('Error: ' + e.message)
    } finally {
      setGuardando(false)
    }
  }

  async function pedirRecomendacion() {
    if (!condMañana) { toast.error('Indica la condición de mañana'); return }
    setCargandoIA(true)
    try {
      // Buscar días con condición similar en el historial
      const diasSimilares = historial.filter(d =>
        d.condicion?.toLowerCase().includes(condMañana.toLowerCase().slice(0, 4)) ||
        condMañana.toLowerCase().includes((d.condicion || '').toLowerCase().slice(0, 4))
      ).slice(0, 10)

      const diasRecientes = historial.slice(0, 14)

      // Calcular promedios por producto
      const promedios = {}
      const todosDias = [...new Set([...diasSimilares, ...diasRecientes])]

      todosDias.forEach(dia => {
        (dia.productos || []).forEach(p => {
          if (!p.total) return
          if (!promedios[p.nombre]) promedios[p.nombre] = { similar: [], reciente: [], icono: p.icono }
          const esSimilar = diasSimilares.includes(dia)
          const n = parseFloat(p.total) || 0
          if (n > 0) {
            if (esSimilar) promedios[p.nombre].similar.push(n)
            else promedios[p.nombre].reciente.push(n)
          }
        })
      })

      const recs = Object.entries(promedios).map(([nombre, data]) => {
        const arr = data.similar.length >= 2 ? data.similar : [...data.similar, ...data.reciente]
        if (!arr.length) return null
        const media = arr.reduce((s, n) => s + n, 0) / arr.length
        const max = Math.max(...arr)
        const min = Math.min(...arr)
        const recomendado = Math.round(media * 1.05) // +5% de margen
        return {
          nombre, icono: data.icono, recomendado, media: Math.round(media),
          max, min, basadoEn: data.similar.length >= 2 ? 'días similares' : 'días recientes',
          nDias: arr.length
        }
      }).filter(Boolean)

      setRecomendacion({ condicion: condMañana, recs, diasSimilares: diasSimilares.length })
      toast.success('Recomendación lista')
    } catch (e) {
      toast.error('Error: ' + e.message)
    } finally {
      setCargandoIA(false)
    }
  }

  const tabBtn = (id, label) => (
    <button onClick={() => setTabActiva(id)} style={{
      padding: '7px 16px', borderRadius: 20, border: '1.5px solid ' + (tabActiva === id ? 'var(--bor2)' : 'var(--bor)'),
      background: tabActiva === id ? 'var(--purbg)' : 'transparent',
      color: tabActiva === id ? 'var(--pur)' : 'var(--txt2)',
      fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter,sans-serif'
    }}>{label}</button>
  )

  // Calcular estadísticas del día
  const totalTotal = prodSeleccionados.reduce((s, p) => s + (parseFloat(p.total) || 0), 0)
  const totalCocidas = prodSeleccionados.reduce((s, p) => s + (parseFloat(p.cocidas) || 0), 0)
  const totalMermas = prodSeleccionados.reduce((s, p) => s + (parseFloat(p.mermas) || 0), 0)
  const pctCocidas = totalTotal > 0 ? ((totalCocidas / totalTotal) * 100).toFixed(0) : 0
  const pctMermas = totalTotal > 0 ? ((totalMermas / totalTotal) * 100).toFixed(0) : 0

  return (
    <div className="fade-in">
      <SectionHeader title="🏭 Producción" subtitle="Registro diario y recomendaciones de la IA" />

      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {tabBtn('hoy', '📋 Registro de hoy')}
        {tabBtn('manana', '🤖 Recomendación IA')}
        {tabBtn('historial', '📊 Historial')}
      </div>

      {loading ? <Card><Loading /></Card> : (
        <>
          {/* ── REGISTRO DE HOY ── */}
          {tabActiva === 'hoy' && (
            <>
              <Card>
                <CardTitle>📅 {new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}</CardTitle>

                {/* Condición del día */}
                <div style={{ marginBottom: 14 }}>
                  <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--txt2)', textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 6 }}>
                    Condición del día
                  </label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                    {CONDICIONES_RAPIDAS.map(c => (
                      <button key={c.value} onClick={() => setCondicion(c.value)} style={{
                        padding: '6px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                        border: '1.5px solid ' + (condicion === c.value ? 'var(--pur)' : 'var(--bor)'),
                        background: condicion === c.value ? 'var(--purbg)' : 'var(--sur)',
                        color: condicion === c.value ? 'var(--pur)' : 'var(--txt2)',
                        fontFamily: 'Inter,sans-serif'
                      }}>{c.label}</button>
                    ))}
                  </div>
                  <input
                    type="text" value={condicionExtra}
                    onChange={e => setCondicionExtra(e.target.value)}
                    placeholder="Añade más detalles... ej: Boda en el pueblo, feria medieval..."
                    style={{ width: '100%' }}
                  />
                </div>

                {/* Notas del día */}
                <div style={{ marginBottom: 14 }}>
                  <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--txt2)', textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 5 }}>
                    Notas del día
                  </label>
                  <textarea value={notas} onChange={e => setNotas(e.target.value)}
                    placeholder="Cualquier observación del día..." rows={2} />
                </div>
              </Card>

              {/* Tabla de producción */}
              <Card>
                <CardTitle>
                  📦 Producción por producto
                  <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                    {productos.filter(p => !prodSeleccionados.find(s => s.prodId === p.id)).slice(0, 5).map(p => (
                      <button key={p.id} onClick={() => addProducto(p)} style={{
                        padding: '3px 8px', borderRadius: 20, fontSize: 10, fontWeight: 600, cursor: 'pointer',
                        border: '1px solid var(--bor2)', background: 'var(--purbg)', color: 'var(--pur)', fontFamily: 'Inter,sans-serif'
                      }}>+ {p.nombre}</button>
                    ))}
                  </div>
                </CardTitle>

                {/* Cabecera tabla */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px 80px 30px', gap: 6, padding: '6px 0', borderBottom: '2px solid var(--bor)', marginBottom: 6 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--txt2)', textTransform: 'uppercase', letterSpacing: 1 }}>Producto</span>
                  <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--inf)', textTransform: 'uppercase', letterSpacing: 1, textAlign: 'center' }}>Total</span>
                  <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--ok)', textTransform: 'uppercase', letterSpacing: 1, textAlign: 'center' }}>Cocidas</span>
                  <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--err)', textTransform: 'uppercase', letterSpacing: 1, textAlign: 'center' }}>Mermas</span>
                  <span></span>
                </div>

                {prodSeleccionados.map(p => (
                  <div key={p.prodId} style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px 80px 30px', gap: 6, alignItems: 'center', padding: '5px 0', borderBottom: '1px solid var(--bor)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                      <span style={{ fontSize: 18 }}>{p.icono}</span>
                      <span style={{ fontWeight: 500 }}>{p.nombre}</span>
                    </div>
                    <input type="number" min="0" value={p.total} onChange={e => updateProd(p.prodId, 'total', e.target.value)}
                      placeholder="0" style={{ textAlign: 'center', padding: '5px', fontSize: 13, borderColor: 'var(--inf)' }} />
                    <input type="number" min="0" value={p.cocidas} onChange={e => updateProd(p.prodId, 'cocidas', e.target.value)}
                      placeholder="0" style={{ textAlign: 'center', padding: '5px', fontSize: 13, borderColor: 'var(--ok)' }} />
                    <input type="number" min="0" value={p.mermas} onChange={e => updateProd(p.prodId, 'mermas', e.target.value)}
                      placeholder="0" style={{ textAlign: 'center', padding: '5px', fontSize: 13, borderColor: 'var(--err)' }} />
                    <button onClick={() => removeProd(p.prodId)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--txt3)', fontSize: 16 }}>×</button>
                  </div>
                ))}

                {/* Totales */}
                {totalTotal > 0 && (
                  <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
                    <div style={{ background: 'rgba(30,92,160,.08)', border: '1px solid rgba(30,92,160,.2)', borderRadius: 'var(--r)', padding: '9px', textAlign: 'center' }}>
                      <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--inf)' }}>{totalTotal}</div>
                      <div style={{ fontSize: 10, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: 1 }}>Total total</div>
                    </div>
                    <div style={{ background: 'rgba(42,122,72,.08)', border: '1px solid rgba(42,122,72,.2)', borderRadius: 'var(--r)', padding: '9px', textAlign: 'center' }}>
                      <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--ok)' }}>{totalCocidas} <span style={{ fontSize: 12 }}>({pctCocidas}%)</span></div>
                      <div style={{ fontSize: 10, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: 1 }}>Cocidas</div>
                    </div>
                    <div style={{ background: 'rgba(181,46,30,.06)', border: '1px solid rgba(181,46,30,.15)', borderRadius: 'var(--r)', padding: '9px', textAlign: 'center' }}>
                      <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--err)' }}>{totalMermas} <span style={{ fontSize: 12 }}>({pctMermas}%)</span></div>
                      <div style={{ fontSize: 10, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: 1 }}>Mermas</div>
                    </div>
                  </div>
                )}

                <div style={{ marginTop: 12 }}>
                  <Btn fullWidth onClick={guardarRegistro} disabled={guardando}>
                    {guardando ? 'Guardando...' : '💾 Guardar registro del día'}
                  </Btn>
                </div>
              </Card>
            </>
          )}

          {/* ── RECOMENDACIÓN IA ── */}
          {tabActiva === 'manana' && (
            <Card>
              <CardTitle>🤖 Recomendación para mañana</CardTitle>
              <div style={{ fontSize: 13, color: 'var(--txt2)', marginBottom: 14, background: 'var(--purbg)', border: '1px solid var(--bor2)', borderRadius: 'var(--r)', padding: '10px 12px' }}>
                💡 Indica qué condición tendrá mañana y la IA analizará los días similares para recomendarte cuánto cocer de cada producto.
              </div>

              <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--txt2)', textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 6 }}>
                Condición de mañana
              </label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                {CONDICIONES_RAPIDAS.map(c => (
                  <button key={c.value} onClick={() => setCondMañana(c.value)} style={{
                    padding: '6px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    border: '1.5px solid ' + (condMañana === c.value ? 'var(--pur)' : 'var(--bor)'),
                    background: condMañana === c.value ? 'var(--purbg)' : 'var(--sur)',
                    color: condMañana === c.value ? 'var(--pur)' : 'var(--txt2)',
                    fontFamily: 'Inter,sans-serif'
                  }}>{c.label}</button>
                ))}
              </div>
              <input type="text" value={condMañana} onChange={e => setCondMañana(e.target.value)}
                placeholder="O escribe la condición de mañana..." style={{ marginBottom: 12 }} />

              <Btn fullWidth onClick={pedirRecomendacion} disabled={cargandoIA || !historial.length}>
                {cargandoIA ? '🔍 Analizando datos...' : historial.length < 3 ? '⚠️ Necesitas al menos 3 días registrados' : '🤖 Calcular recomendación'}
              </Btn>

              {recomendacion && (
                <div style={{ marginTop: 16 }}>
                  <div style={{ fontWeight: 600, color: 'var(--pur)', fontSize: 14, marginBottom: 4 }}>
                    Recomendación para: {recomendacion.condicion}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--txt3)', marginBottom: 12 }}>
                    Basado en {recomendacion.diasSimilares} días similares + días recientes
                  </div>

                  {recomendacion.recs.map((r, i) => (
                    <div key={i} style={{ background: 'var(--sur2)', border: '1px solid var(--bor)', borderRadius: 'var(--r)', padding: '12px 14px', marginBottom: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                        <span style={{ fontSize: 22 }}>{r.icono}</span>
                        <strong style={{ fontSize: 14 }}>{r.nombre}</strong>
                        <span style={{ marginLeft: 'auto', background: 'var(--pur)', color: '#fff', borderRadius: 8, padding: '4px 12px', fontSize: 18, fontWeight: 700, fontFamily: "'Playfair Display',serif" }}>
                          {r.recomendado}
                        </span>
                        <span style={{ fontSize: 11, color: 'var(--txt3)' }}>uds</span>
                      </div>
                      <div style={{ display: 'flex', gap: 12, fontSize: 11, color: 'var(--txt3)' }}>
                        <span>Media: <strong>{r.media}</strong></span>
                        <span>Mín: <strong>{r.min}</strong></span>
                        <span>Máx: <strong>{r.max}</strong></span>
                        <span>Basado en <strong>{r.nDias}</strong> días ({r.basadoEn})</span>
                      </div>
                    </div>
                  ))}

                  <div style={{ fontSize: 11, color: 'var(--txt3)', marginTop: 8, fontStyle: 'italic' }}>
                    * La recomendación incluye un 5% de margen sobre la media para evitar quedarse corto.
                  </div>
                </div>
              )}
            </Card>
          )}

          {/* ── HISTORIAL ── */}
          {tabActiva === 'historial' && (
            <Card>
              <CardTitle>📊 Historial de producción</CardTitle>
              {historial.length === 0 ? (
                <Empty icon="📋" text="No hay registros todavía. Empieza registrando el día de hoy." />
              ) : historial.map(dia => {
                const totC = (dia.productos || []).reduce((s, p) => s + (parseFloat(p.total) || 0), 0)
                const totV = (dia.productos || []).reduce((s, p) => s + (parseFloat(p.cocidas) || 0), 0)
                const totT = (dia.productos || []).reduce((s, p) => s + (parseFloat(p.mermas) || 0), 0)
                return (
                  <div key={dia.id} style={{ border: '1px solid var(--bor)', borderRadius: 'var(--r)', padding: '11px 13px', marginBottom: 7 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5, flexWrap: 'wrap' }}>
                      <strong style={{ fontSize: 13 }}>{new Date(dia.fecha + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}</strong>
                      {dia.condicion && <span style={{ background: 'var(--purbg)', color: 'var(--pur)', border: '1px solid var(--bor2)', borderRadius: 20, padding: '2px 9px', fontSize: 11, fontWeight: 600 }}>{dia.condicion}</span>}
                    </div>
                    <div style={{ display: 'flex', gap: 12, fontSize: 12, marginBottom: 5 }}>
                      <span style={{ color: 'var(--inf)' }}>Total: <strong>{totC}</strong></span>
                      <span style={{ color: 'var(--ok)' }}>Cocidas: <strong>{totV}</strong></span>
                      <span style={{ color: 'var(--err)' }}>Mermas: <strong>{totT}</strong></span>
                      {totC > 0 && <span style={{ color: 'var(--txt3)' }}>Eficiencia: <strong>{Math.round(totV/totC*100)}%</strong></span>}
                    </div>
                    {dia.notas && <div style={{ fontSize: 11, color: 'var(--txt3)', fontStyle: 'italic' }}>📝 {dia.notas}</div>}
                  </div>
                )
              })}
            </Card>
          )}
        </>
      )}
    </div>
  )
}
