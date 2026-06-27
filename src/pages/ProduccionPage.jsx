import { useState, useEffect } from 'react'
import { useProductos } from '../hooks/useProductos'
import { supabase } from '../lib/supabase'
import { todayStr } from '../lib/utils'
import { Card, CardTitle, SectionHeader, Btn, Loading, Empty, Banner } from '../components/ui'
import toast from 'react-hot-toast'

const CONDICIONES_RAPIDAS = [
  { label: '☀️ Normal',       value: 'Día normal'       },
  { label: '🌧️ Lluvia',      value: 'Lluvia'            },
  { label: '🎉 Festivo',      value: 'Festivo'          },
  { label: '💒 Comuniones',   value: 'Comuniones'       },
  { label: '🔥 Mucho calor',  value: 'Mucho calor'      },
  { label: '❄️ Mucho frío',  value: 'Mucho frío'        },
  { label: '🎪 Evento local',  value: 'Evento local'    },
  { label: '🏖️ Verano',      value: 'Temporada verano' },
]

const CATS_PAN    = ['Pan', 'Tostadas']
const CATS_BOL    = ['Bollería', 'Croissants', 'Magdalenas']
const CATS_DULCES = ['Pastelería', 'Rosquillas', 'Especial']

// Lee los campos reales de Supabase (masa / cocidas / mermas)
const gMasa    = p => p.masa    ?? ''
const gCocidas = p => parseFloat(p.cocidas ?? 0) || 0
const gMermas  = p => parseFloat(p.mermas  ?? 0) || 0

export default function ProduccionPage() {
  const { productos } = useProductos()

  const [registroHoy, setRegistroHoy]       = useState(null)
  const [loading, setLoading]               = useState(true)
  const [guardando, setGuardando]           = useState(false)
  const [condicion, setCondicion]           = useState('')
  const [condicionExtra, setCondicionExtra] = useState('')
  const [notas, setNotas]                   = useState('')
  const [prodSeleccionados, setProdSel]     = useState([])
  const [historial, setHistorial]           = useState([])
  const [recomendacion, setRecomendacion]   = useState(null)
  const [cargandoIA, setCargandoIA]         = useState(false)
  const [tabActiva, setTabActiva]           = useState('hoy')
  const [condMañana, setCondMañana]         = useState('')

  // Filtro categoría — Pan por defecto
  const [filtroCat, setFiltroCat] = useState('pan')

  // Historial expandible
  const [diaExpandido, setDiaExpandido]   = useState(null)
  const [editando, setEditando]           = useState(null)
  const [editVal, setEditVal]             = useState({ masa: '', cocidas: '', mermas: '' })
  const [guardandoEdit, setGuardandoEdit] = useState(false)
  const [showAnadir, setShowAnadir] = useState(false)

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
      setProdSel(regHoy.data.productos || [])
    }
    setHistorial(hist.data || [])
    setLoading(false)
  }

  useEffect(() => {
    if (productos.length && !prodSeleccionados.length && !registroHoy) {
      setProdSel(productos.map(p => ({
        prodId:  p.id,
        nombre:  p.nombre,
        icono:   p.icono || '',
        masa:    '',
        cocidas: '',
        mermas:  ''
      })))
    }
  }, [productos, registroHoy])

  const updateProd = (prodId, field, val) =>
    setProdSel(prev => prev.map(p => p.prodId === prodId ? { ...p, [field]: val } : p))

  const getCat = prodId => productos.find(x => x.id === prodId)?.categoria || ""

  function prodsFiltrados() {
  if (filtroCat === "todos") return prodSeleccionados
  if (filtroCat === "pan") return prodSeleccionados.filter(p => p.categoria === "Pan")
  if (filtroCat === "bol") return prodSeleccionados.filter(p => ["Bollería","Magdalenas"].includes(p.categoria))
  return prodSeleccionados.filter(p => !["Pan","Bollería","Magdalenas"].includes(p.categoria))
}

  async function guardarHoy() {
    if (!condicion.trim()) return toast.error('Indica las condiciones del día')
    setGuardando(true)
    const payload = {
      fecha:     todayStr(),
      condicion: condicion.trim(),
      notas:     notas.trim(),
      productos: prodSeleccionados.filter(p => p.masa || p.cocidas || p.mermas)
    }
    const { error } = registroHoy
      ? await supabase.from('produccion_diaria').update(payload).eq('id', registroHoy.id)
      : await supabase.from('produccion_diaria').insert(payload)
    if (error) toast.error('Error: ' + error.message)
    else { toast.success('Producción guardada ✓'); cargarDatos() }
    setGuardando(false)
  }

  async function pedirRecomendacion() {
    if (!condMañana.trim()) return toast.error('Indica las condiciones de mañana')
    setCargandoIA(true)
    setRecomendacion(null)
    try {
      const contexto = historial.slice(0, 30).map(d => ({
        fecha:     d.fecha,
        condicion: d.condicion,
        productos: (d.productos || []).map(p => ({
          nombre:  p.nombre,
          masa:    gMasa(p),
          cocidas: gCocidas(p),
          mermas:  gMermas(p)
        }))
      }))
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': import.meta.env.VITE_ANTHROPIC_KEY || '',
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify({
          model: 'claude-opus-4-5', max_tokens: 700,
          messages: [{ role: 'user', content:
            `Eres el asesor de producción de Dulces Marisol, una panadería artesana.
Analiza el historial y recomienda cuánto producir mañana (masa y cocidas por producto).
Condición de mañana: "${condMañana}"
Historial: ${JSON.stringify(contexto)}
Responde en español, sé directo y práctico.` }]
        })
      })
      const data = await res.json()
      setRecomendacion(data.content?.[0]?.text || 'Sin respuesta')
    } catch { toast.error('Error conectando con la IA') }
    setCargandoIA(false)
  }

  const abrirEdicion = (diaId, prod) => {
    setEditando({ diaId, prodId: prod.prodId })
    setEditVal({ masa: gMasa(prod), cocidas: gCocidas(prod) || '', mermas: gMermas(prod) || '' })
  }
  const cancelarEdicion = () => setEditando(null)

  async function guardarEdicion(dia) {
    setGuardandoEdit(true)
    const nuevosProd = (dia.productos || []).map(p =>
      p.prodId === editando.prodId ? { ...p, ...editVal } : p
    )
    const { error } = await supabase.from('produccion_diaria').update({ productos: nuevosProd }).eq('id', dia.id)
    if (error) toast.error('Error: ' + error.message)
    else {
      toast.success('Actualizado ✓')
      setHistorial(prev => prev.map(d => d.id === dia.id ? { ...d, productos: nuevosProd } : d))
      cancelarEdicion()
    }
    setGuardandoEdit(false)
  }

  if (loading) return <div style={{ padding: 32 }}><Loading /></div>

  // Estilos reutilizables
  const btnTab = active => ({
    padding: '7px 16px', borderRadius: 20, fontSize: 13, cursor: 'pointer',
    border: '1px solid var(--bor)',
    background: active ? 'var(--pur)' : 'var(--bg2)',
    color:      active ? '#fff'       : 'var(--txt2)',
    fontWeight: active ? 600          : 400,
  })
  const btnCat = active => ({
    padding: '4px 12px', borderRadius: 16, fontSize: 12, cursor: 'pointer',
    border:     active ? '2px solid var(--pur)' : '1px solid var(--bor)',
    background: active ? 'var(--purbg)'         : 'var(--bg2)',
    color:      active ? 'var(--pur)'           : 'var(--txt2)',
    fontWeight: active ? 600                    : 400,
  })
  const btnCond = active => ({
    padding: '5px 12px', borderRadius: 20, fontSize: 12, cursor: 'pointer',
    border:     active ? '2px solid var(--pur)' : '1px solid var(--bor)',
    background: active ? 'var(--purbg)'         : 'var(--bg2)',
    color:      active ? 'var(--pur)'           : 'var(--txt2)',
    fontWeight: active ? 600                    : 400,
  })
  const input = (extra={}) => ({
    width: '100%', padding: '6px 4px', borderRadius: 7, textAlign: 'center',
    border: '1px solid var(--bor)', background: 'var(--bg2)',
    color: 'var(--txt1)', fontSize: 14, fontWeight: 500, ...extra
  })

  // Grid de 3 columnas de datos: masa | cocidas | mermas
  const COLS = '1fr 95px 95px 95px'
  const COLS_DETAIL = '1fr 80px 80px 80px 55px'

  return (
    <div style={{ padding: '16px', maxWidth: 860, margin: '0 auto' }}>
      <SectionHeader title="🏭 Producción" subtitle="Registro diario y recomendaciones de la IA" />

      {/* Pestañas */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {[{ key:'hoy', label:'📋 Hoy' }, { key:'historial', label:'📊 Historial' }, { key:'ia', label:'🤖 IA' }].map(t => (
          <button key={t.key} onClick={() => setTabActiva(t.key)} style={btnTab(tabActiva === t.key)}>{t.label}</button>
        ))}
      </div>

      {/* ══════════ HOY ══════════ */}
      {tabActiva === 'hoy' && <>
        {registroHoy && <Banner type="info" style={{ marginBottom: 12 }}>Ya hay registro hoy. Puedes modificarlo y volver a guardar.</Banner>}

        <Card>
          <CardTitle>Condiciones del día</CardTitle>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginBottom: 12 }}>
            {CONDICIONES_RAPIDAS.map(c => (
              <button key={c.value} onClick={() => setCondicion(condicion === c.value ? '' : c.value)} style={btnCond(condicion === c.value)}>{c.label}</button>
            ))}
          </div>
          <input value={condicion} onChange={e => setCondicion(e.target.value)}
            placeholder="O escribe la condición libremente..."
            style={{ width:'100%', padding:'8px 12px', borderRadius:8, border:'1px solid var(--bor)', background:'var(--bg1)', color:'var(--txt1)', fontSize:13 }}
          />
        </Card>

        <Card style={{ marginTop: 12 }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12, flexWrap:'wrap', gap:8 }}>
            <CardTitle style={{ margin:0 }}>Cantidades producidas</CardTitle>

          </div>

          {/* Cabecera */}
          <div style={{ display:'grid', gridTemplateColumns:COLS, gap:8, padding:'6px 10px', background:'var(--purbg)', borderRadius:8, fontSize:11, fontWeight:700, color:'var(--pur)', textTransform:'uppercase', letterSpacing:'0.04em', marginBottom:4 }}>
            <span>Producto</span>
            <span style={{ textAlign:'center' }}>⚖️ Masa</span>
            <span style={{ textAlign:'center' }}>🔥 Cocidas</span>
            <span style={{ textAlign:'center' }}>🗑️ Mermas</span>
          </div>

          {prodsFiltrados().length === 0
            ? <div style={{ textAlign:'center', padding:24, color:'var(--txt3)', fontSize:13 }}>No hay productos de esta categoría</div>
            : prodsFiltrados().map(p => (
              <div key={p.prodId} style={{ display:'grid', gridTemplateColumns:COLS, gap:8, padding:'7px 10px', borderBottom:'1px solid var(--bor)', alignItems:'center' }}>
                <span style={{ fontSize:13, color:'var(--txt1)' }}>{p.icono} {p.nombre}</span>
                {['masa','cocidas','mermas'].map(field => (
                  <input key={field} type="number" min="0"
                    value={p[field] ?? ''}
                    onChange={e => updateProd(p.prodId, field, e.target.value)}
                    style={input()}
                  />
                ))}
              </div>
            ))
          }
                  <div style={{marginTop:10}}>
            <button onClick={() => setShowAnadir(!showAnadir)} style={{padding:"6px 14px",borderRadius:8,border:"1px solid var(--bor)",background:"var(--bg2)",color:"var(--txt2)",fontSize:12,cursor:"pointer"}}>
              ➕ Añadir producto
            </button>
            {showAnadir && (
              <div style={{marginTop:8,display:'flex',flexWrap:'wrap',gap:6}}>
                {productos
                  .map(pr => (
                    <button key={pr.id} onClick={() => {
                      setProdSel(prev => [...prev, {prodId:pr.id,nombre:pr.nombre,icono:pr.icono||'🍞',masa:'',cocidas:'',mermas:''}])
                      setShowAnadir(false)
                    }} style={{padding:'5px 12px',borderRadius:20,fontSize:12,cursor:'pointer',border:'1px solid var(--bor)',background:'var(--bg2)',color:'var(--txt1)'}}>
                      {pr.icono} {pr.nombre}
                    </button>
                  ))
                }
              </div>
            )}
          </div>
        </Card>

        <Card style={{ marginTop:12 }}>
          <CardTitle>Notas del día</CardTitle>
          <textarea value={notas} onChange={e => setNotas(e.target.value)}
            placeholder="Incidencias, observaciones..." rows={3}
            style={{ width:'100%', padding:'8px 12px', borderRadius:8, border:'1px solid var(--bor)', background:'var(--bg2)', color:'var(--txt1)', fontSize:13, resize:'vertical' }}
          />
          <Btn onClick={guardarHoy} disabled={guardando} style={{ marginTop:10, width:'100%' }}>
            {guardando ? 'Guardando...' : registroHoy ? '💾 Actualizar registro' : '💾 Guardar producción de hoy'}
          </Btn>
        </Card>
      </>}

      {/* ══════════ HISTORIAL ══════════ */}
      {tabActiva === 'historial' && (
        <Card>
          <CardTitle>📊 Historial de producción</CardTitle>
          {historial.length === 0
            ? <Empty icon="📋" text="No hay registros todavía." />
            : historial.map(dia => {
              const prods  = dia.productos || []
              const totC   = prods.reduce((s, p) => s + gCocidas(p), 0)
              const totM   = prods.reduce((s, p) => s + gMermas(p),  0)
              const abierto = diaExpandido === dia.id

              return (
                <div key={dia.id} style={{ border:`1px solid ${abierto ? 'var(--pur)' : 'var(--bor)'}`, borderRadius:10, marginBottom:8, overflow:'hidden' }}>

                  {/* Fila resumen — igual que siempre */}
                  <div onClick={() => setDiaExpandido(abierto ? null : dia.id)} style={{
                    display:'flex', alignItems:'center', justifyContent:'space-between',
                    padding:'11px 13px', cursor:'pointer',
                    background: abierto ? 'var(--purbg)' : 'var(--bg2)',
                    flexWrap:'wrap', gap:8
                  }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                      <strong style={{ fontSize:13 }}>
                        {new Date(dia.fecha + 'T12:00:00').toLocaleDateString('es-ES', { weekday:'long', day:'numeric', month:'long' })}
                      </strong>
                      {dia.condicion && (
                        <span style={{ background:'var(--purbg)', color:'var(--pur)', border:'1px solid var(--bor2)', borderRadius:20, padding:'2px 9px', fontSize:11, fontWeight:600 }}>
                          {dia.condicion}
                        </span>
                      )}
                    </div>
                    <div style={{ display:'flex', gap:12, fontSize:12, alignItems:'center' }}>
                      <span style={{ color:'var(--inf)' }}>Cocidas: <strong>{totC}</strong></span>
                      <span style={{ color:'var(--err)' }}>Mermas: <strong>{totM}</strong></span>
                      {totC > 0 && <span style={{ color:'var(--txt3)' }}>Merma: <strong>{Math.round(totM / totC * 100)}%</strong></span>}
                      <span style={{ color:'var(--pur)', fontSize:14 }}>{abierto ? '▲' : '▼'}</span>
                    </div>
                  </div>

                  {/* Detalle expandido */}
                  {abierto && (
                    <div style={{ padding:'0 13px 13px' }}>
                      {/* Cabecera columnas */}
                      <div style={{ display:'grid', gridTemplateColumns:COLS_DETAIL, gap:6, padding:'8px 4px 4px', fontSize:10, fontWeight:700, color:'var(--txt3)', textTransform:'uppercase', letterSpacing:'0.05em', borderBottom:'1px solid var(--bor)', marginBottom:2 }}>
                        <span>Producto</span>
                        <span style={{ textAlign:'center' }}>⚖️ Masa</span>
                        <span style={{ textAlign:'center' }}>🔥 Cocidas</span>
                        <span style={{ textAlign:'center' }}>🗑️ Mermas</span>
                        <span />
                      </div>

                      {prods.length === 0
                        ? <div style={{ fontSize:12, color:'var(--txt3)', padding:'8px 0' }}>Sin detalle</div>
                        : prods.map(prod => {
                          const esEsta = editando?.diaId === dia.id && editando?.prodId === prod.prodId
                          return (
                            <div key={prod.prodId} style={{ display:'grid', gridTemplateColumns:COLS_DETAIL, gap:6, padding:'6px 4px', borderBottom:'1px solid var(--bor)', alignItems:'center', background: esEsta ? 'var(--purbg)' : 'transparent', borderRadius: esEsta ? 6 : 0 }}>
                              <span style={{ fontSize:13, color:'var(--txt1)' }}>{prod.icono || '🍞'} {prod.nombre}</span>

                              {esEsta ? (
                                <>
                                  {['masa','cocidas','mermas'].map(field => (
                                    <input key={field} type="number" min="0"
                                      value={editVal[field]}
                                      onChange={e => setEditVal(v => ({ ...v, [field]: e.target.value }))}
                                      style={{ width:'100%', padding:'5px 4px', borderRadius:6, textAlign:'center', border:'1.5px solid var(--pur)', background:'#fff', color:'var(--txt1)', fontSize:13, fontWeight:600 }}
                                    />
                                  ))}
                                  <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
                                    <button onClick={() => guardarEdicion(dia)} disabled={guardandoEdit}
                                      style={{ padding:'4px 6px', borderRadius:5, border:'none', background:'var(--pur)', color:'#fff', fontSize:11, fontWeight:700, cursor:'pointer' }}>
                                      {guardandoEdit ? '...' : '✓ OK'}
                                    </button>
                                    <button onClick={cancelarEdicion}
                                      style={{ padding:'4px 6px', borderRadius:5, border:'1px solid var(--bor)', background:'var(--bg2)', color:'var(--txt2)', fontSize:11, cursor:'pointer' }}>
                                      ✕
                                    </button>
                                  </div>
                                </>
                              ) : (
                                <>
                                  <span style={{ textAlign:'center', fontSize:13, color:'var(--txt2)' }}>{gMasa(prod) || '—'}</span>
                                  <span style={{ textAlign:'center', fontSize:13, fontWeight:600, color:'var(--inf)' }}>{gCocidas(prod) || '—'}</span>
                                  <span style={{ textAlign:'center', fontSize:13, fontWeight:600, color: gMermas(prod) > 0 ? 'var(--err)' : 'var(--txt3)' }}>{gMermas(prod) || '—'}</span>
                                  <button onClick={() => abrirEdicion(dia.id, prod)}
                                    style={{ padding:'3px 8px', borderRadius:5, border:'1px solid var(--bor)', background:'var(--bg2)', color:'var(--txt2)', fontSize:11, cursor:'pointer' }}>
                                    ✏️
                                  </button>
                                </>
                              )}
                            </div>
                          )
                        })
                      }

                      {/* Totales */}
                      <div style={{ display:'grid', gridTemplateColumns:COLS_DETAIL, gap:6, padding:'7px 4px 2px', fontSize:12, fontWeight:700, borderTop:'2px solid var(--bor)', marginTop:2 }}>
                        <span style={{ color:'var(--txt3)' }}>TOTAL</span>
                        <span />
                        <span style={{ textAlign:'center', color:'var(--inf)' }}>{totC}</span>
                        <span style={{ textAlign:'center', color:'var(--err)' }}>{totM}</span>
                        <span />
                      </div>

                      {dia.notas && (
                        <div style={{ marginTop:8, fontSize:12, color:'var(--txt2)', fontStyle:'italic', padding:'6px 10px', background:'var(--bg2)', borderRadius:8, borderLeft:'3px solid var(--pur)' }}>
                          📝 {dia.notas}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })
          }
        </Card>
      )}

      {/* ══════════ IA ══════════ */}
      {tabActiva === 'ia' && (
        <Card>
          <CardTitle>🤖 Recomendación de producción</CardTitle>
          <p style={{ fontSize:13, color:'var(--txt2)', marginBottom:12 }}>La IA analiza el historial y te dice cuánto producir mañana.</p>
          <div style={{ display:'flex', flexWrap:'wrap', gap:7, marginBottom:12 }}>
            {CONDICIONES_RAPIDAS.map(c => (
              <button key={c.value} onClick={() => setCondMañana(condMañana === c.value ? '' : c.value)} style={btnCond(condMañana === c.value)}>{c.label}</button>
            ))}
          </div>
          <input value={condMañana} onChange={e => setCondMañana(e.target.value)}
            placeholder="O describe las condiciones de mañana..."
            style={{ width:'100%', padding:'8px 12px', borderRadius:8, border:'1px solid var(--bor)', background:'var(--bg2)', color:'var(--txt1)', fontSize:13, marginBottom:12 }}
          />
          <Btn onClick={pedirRecomendacion} disabled={cargandoIA} style={{ width:'100%' }}>
            {cargandoIA ? '⏳ Consultando a la IA...' : '🤖 Obtener recomendación'}
          </Btn>
          {recomendacion && (
            <div style={{ marginTop:16, padding:'14px 16px', borderRadius:10, background:'var(--purbg)', border:'1px solid var(--bor2)', fontSize:13, color:'var(--txt1)', lineHeight:1.7, whiteSpace:'pre-wrap' }}>
              {recomendacion}
            </div>
          )}
        </Card>
      )}
    </div>
  )
}
