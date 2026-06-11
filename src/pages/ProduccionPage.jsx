// ============================================================
//  ProduccionPage.jsx  —  VERSIÓN ACTUALIZADA
//  Cambios:
//   1. Historial muestra detalle por pieza + edición inline
//   2. Por defecto solo muestra categoría "Pan" en producción
// ============================================================
import { useState, useEffect } from 'react'
import { useProductos } from '../hooks/useProductos'
import { supabase } from '../lib/supabase'
import { fmt, todayStr } from '../lib/utils'
import { Card, CardTitle, SectionHeader, Btn, Loading, Empty, Banner } from '../components/ui'
import toast from 'react-hot-toast'

const CONDICIONES_RAPIDAS = [
  { label: '☀️ Normal',      value: 'Día normal'        },
  { label: '🌧️ Lluvia',     value: 'Lluvia'             },
  { label: '🎉 Festivo',     value: 'Festivo'           },
  { label: '💒 Comuniones',  value: 'Comuniones'        },
  { label: '🔥 Mucho calor', value: 'Mucho calor'       },
  { label: '❄️ Mucho frío', value: 'Mucho frío'         },
  { label: '🎪 Evento local', value: 'Evento local'     },
  { label: '🏖️ Verano',     value: 'Temporada verano'  },
]

// Categorías que se consideran "Pan"
const CATS_PAN     = ['Pan', 'Tostadas']
// Categorías que se consideran "Bollería"
const CATS_BOL     = ['Bollería', 'Croissants', 'Magdalenas']
// Categorías que se consideran "Dulces"
const CATS_DULCES  = ['Pastelería', 'Rosquillas', 'Especial']

const FILTROS_CAT = [
  { key: 'pan',     label: '🥖 Pan',      cats: CATS_PAN    },
  { key: 'bol',     label: '🥐 Bollería', cats: CATS_BOL    },
  { key: 'dulces',  label: '🍩 Dulces',   cats: CATS_DULCES },
  { key: 'todos',   label: '🔍 Todos',    cats: null        },
]

export default function ProduccionPage() {
  const { productos } = useProductos()

  // ── Estado principal ────────────────────────────────────────
  const [registroHoy, setRegistroHoy]     = useState(null)
  const [loading, setLoading]             = useState(true)
  const [guardando, setGuardando]         = useState(false)
  const [condicion, setCondicion]         = useState('')
  const [notas, setNotas]                 = useState('')
  const [prodSeleccionados, setProdSel]   = useState([])
  const [historial, setHistorial]         = useState([])
  const [recomendacion, setRecomendacion] = useState(null)
  const [cargandoIA, setCargandoIA]       = useState(false)
  const [tabActiva, setTabActiva]         = useState('hoy')
  const [condMañana, setCondMañana]       = useState('')

  // ── NUEVO: filtro de categoría — por defecto "Pan" ──────────
  const [filtroCat, setFiltroCat]         = useState('pan')

  // ── NUEVO: historial expandido y edición ────────────────────
  const [diaExpandido, setDiaExpandido]   = useState(null)   // id del día abierto
  const [editando, setEditando]           = useState(null)   // { diaId, prodId }
  const [editVal, setEditVal]             = useState({ cocido: '', vendido: '', tirado: '' })
  const [guardandoEdit, setGuardandoEdit] = useState(false)

  // ── Carga inicial ───────────────────────────────────────────
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

  // Inicializar con productos del catálogo (solo pan por defecto)
  useEffect(() => {
    if (productos.length && !prodSeleccionados.length && !registroHoy) {
      setProdSel(
        productos.map(p => ({
          prodId:  p.id,
          nombre:  p.nombre,
          icono:   p.icono || '🍞',
          categoria: p.categoria || 'Pan',
          cocido:  '',
          vendido: '',
          tirado:  ''
        }))
      )
    }
  }, [productos, registroHoy])

  // ── Helpers de filtro ───────────────────────────────────────
  function prodsFiltrados() {
    const f = FILTROS_CAT.find(f => f.key === filtroCat)
    if (!f || !f.cats) return prodSeleccionados
    return prodSeleccionados.filter(p => f.cats.includes(p.categoria))
  }

  // ── Actualizar campo de producto ────────────────────────────
  function updateProd(prodId, field, val) {
    setProdSel(prev => prev.map(p =>
      p.prodId === prodId ? { ...p, [field]: val } : p
    ))
  }

  // ── Guardar día de hoy ──────────────────────────────────────
  async function guardarHoy() {
    if (!condicion.trim()) return toast.error('Indica las condiciones del día')
    setGuardando(true)
    const payload = {
      fecha:     todayStr(),
      condicion: condicion.trim(),
      notas:     notas.trim(),
      productos: prodSeleccionados.filter(p => p.cocido || p.vendido || p.tirado)
    }
    const { error } = registroHoy
      ? await supabase.from('produccion_diaria').update(payload).eq('id', registroHoy.id)
      : await supabase.from('produccion_diaria').insert(payload)
    if (error) { toast.error('Error: ' + error.message) }
    else        { toast.success('Producción guardada ✓'); cargarDatos() }
    setGuardando(false)
  }

  // ── Pedir recomendación de IA ───────────────────────────────
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
          cocido:  p.cocido,
          vendido: p.vendido,
          tirado:  p.tirado
        }))
      }))
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type':      'application/json',
          'x-api-key':         import.meta.env.VITE_ANTHROPIC_KEY || '',
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify({
          model:      'claude-opus-4-5',
          max_tokens: 700,
          messages: [{
            role:    'user',
            content: `Eres el asesor de producción de Dulces Marisol, una panadería artesana.
Analiza el historial de los últimos 30 días y recomienda cuánto cocer mañana.
Condición de mañana: "${condMañana}"
Historial: ${JSON.stringify(contexto)}
Responde en español con recomendaciones concretas por producto (solo los más importantes), explicando brevemente por qué. Sé directo y práctico.`
          }]
        })
      })
      const data = await res.json()
      setRecomendacion(data.content?.[0]?.text || 'Sin respuesta de la IA')
    } catch (e) {
      toast.error('Error conectando con la IA')
    }
    setCargandoIA(false)
  }

  // ══════════════════════════════════════════════════════════════
  //  NUEVO — Editar una fila de producto en el historial
  // ══════════════════════════════════════════════════════════════
  function abrirEdicion(diaId, prod) {
    setEditando({ diaId, prodId: prod.prodId })
    setEditVal({
      cocido:  prod.cocido  || '',
      vendido: prod.vendido || '',
      tirado:  prod.tirado  || ''
    })
  }

  function cancelarEdicion() {
    setEditando(null)
    setEditVal({ cocido: '', vendido: '', tirado: '' })
  }

  async function guardarEdicion(dia) {
    setGuardandoEdit(true)
    const nuevosProd = (dia.productos || []).map(p =>
      p.prodId === editando.prodId
        ? { ...p, cocido: editVal.cocido, vendido: editVal.vendido, tirado: editVal.tirado }
        : p
    )
    const { error } = await supabase
      .from('produccion_diaria')
      .update({ productos: nuevosProd })
      .eq('id', dia.id)
    if (error) { toast.error('Error: ' + error.message) }
    else {
      toast.success('Actualizado ✓')
      setHistorial(prev => prev.map(d => d.id === dia.id ? { ...d, productos: nuevosProd } : d))
      cancelarEdicion()
    }
    setGuardandoEdit(false)
  }

  // ─── RENDER ─────────────────────────────────────────────────
  if (loading) return <div style={{ padding: 32 }}><Loading /></div>

  return (
    <div style={{ padding: '16px', maxWidth: 860, margin: '0 auto' }}>
      <SectionHeader
        title="🏭 Producción"
        subtitle="Registro diario y recomendaciones de la IA"
      />

      {/* ── Pestañas ── */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {[
          { key: 'hoy',      label: '📋 Hoy'              },
          { key: 'historial', label: '📊 Historial'       },
          { key: 'ia',       label: '🤖 Recomendación IA' },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setTabActiva(t.key)}
            style={{
              padding: '7px 16px', borderRadius: 20, fontSize: 13, cursor: 'pointer',
              border: '1px solid var(--bor)',
              background: tabActiva === t.key ? 'var(--pur)' : 'var(--bg2)',
              color:      tabActiva === t.key ? '#fff'       : 'var(--txt2)',
              fontWeight: tabActiva === t.key ? 600          : 400,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ══════════════════════════════════════════════════════
          PESTAÑA: HOY
      ══════════════════════════════════════════════════════ */}
      {tabActiva === 'hoy' && (
        <>
          {registroHoy && (
            <Banner type="info" style={{ marginBottom: 12 }}>
              Ya hay un registro guardado hoy. Puedes modificarlo y volver a guardar.
            </Banner>
          )}

          <Card>
            <CardTitle>Condiciones del día</CardTitle>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginBottom: 12 }}>
              {CONDICIONES_RAPIDAS.map(c => (
                <button
                  key={c.value}
                  onClick={() => setCondicion(condicion === c.value ? '' : c.value)}
                  style={{
                    padding: '5px 12px', borderRadius: 20, fontSize: 12, cursor: 'pointer',
                    border:      condicion === c.value ? '2px solid var(--pur)' : '1px solid var(--bor)',
                    background:  condicion === c.value ? 'var(--purbg)'         : 'var(--bg2)',
                    color:       condicion === c.value ? 'var(--pur)'           : 'var(--txt2)',
                    fontWeight:  condicion === c.value ? 600                    : 400,
                  }}
                >
                  {c.label}
                </button>
              ))}
            </div>
            <input
              value={condicion}
              onChange={e => setCondicion(e.target.value)}
              placeholder="O escribe la condición libremente..."
              style={{
                width: '100%', padding: '8px 12px', borderRadius: 8,
                border: '1px solid var(--bor)', background: 'var(--bg1)',
                color: 'var(--txt1)', fontSize: 13
              }}
            />
          </Card>

          {/* ── Filtro de categoría ── */}
          <Card style={{ marginTop: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
              <CardTitle style={{ margin: 0 }}>Cantidades producidas</CardTitle>
              <div style={{ display: 'flex', gap: 6 }}>
                {FILTROS_CAT.map(f => (
                  <button
                    key={f.key}
                    onClick={() => setFiltroCat(f.key)}
                    style={{
                      padding: '4px 12px', borderRadius: 16, fontSize: 12, cursor: 'pointer',
                      border:      filtroCat === f.key ? '2px solid var(--pur)' : '1px solid var(--bor)',
                      background:  filtroCat === f.key ? 'var(--purbg)'         : 'var(--bg2)',
                      color:       filtroCat === f.key ? 'var(--pur)'           : 'var(--txt2)',
                      fontWeight:  filtroCat === f.key ? 600                    : 400,
                    }}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Cabecera tabla */}
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 90px 90px 90px',
              gap: 8, padding: '6px 10px',
              background: 'var(--purbg)', borderRadius: 8,
              fontSize: 11, fontWeight: 700, color: 'var(--pur)',
              textTransform: 'uppercase', letterSpacing: '0.04em',
              marginBottom: 6
            }}>
              <span>Producto</span>
              <span style={{ textAlign: 'center' }}>🔥 Cocido</span>
              <span style={{ textAlign: 'center' }}>✅ Vendido</span>
              <span style={{ textAlign: 'center' }}>🗑️ Tirado</span>
            </div>

            {prodsFiltrados().length === 0 ? (
              <div style={{ textAlign: 'center', padding: 24, color: 'var(--txt3)', fontSize: 13 }}>
                No hay productos en esta categoría
              </div>
            ) : (
              prodsFiltrados().map(p => (
                <div
                  key={p.prodId}
                  style={{
                    display: 'grid', gridTemplateColumns: '1fr 90px 90px 90px',
                    gap: 8, padding: '7px 10px',
                    borderBottom: '1px solid var(--bor)', alignItems: 'center'
                  }}
                >
                  <span style={{ fontSize: 13, color: 'var(--txt1)' }}>
                    {p.icono} {p.nombre}
                  </span>
                  {['cocido', 'vendido', 'tirado'].map(field => (
                    <input
                      key={field}
                      type="number"
                      min="0"
                      value={p[field]}
                      onChange={e => updateProd(p.prodId, field, e.target.value)}
                      style={{
                        width: '100%', padding: '6px 8px', borderRadius: 7, textAlign: 'center',
                        border: '1px solid var(--bor)', background: 'var(--bg2)',
                        color: 'var(--txt1)', fontSize: 14, fontWeight: 500
                      }}
                    />
                  ))}
                </div>
              ))
            )}
          </Card>

          <Card style={{ marginTop: 12 }}>
            <CardTitle>Notas del día</CardTitle>
            <textarea
              value={notas}
              onChange={e => setNotas(e.target.value)}
              placeholder="Incidencias, observaciones, clientes especiales..."
              rows={3}
              style={{
                width: '100%', padding: '8px 12px', borderRadius: 8,
                border: '1px solid var(--bor)', background: 'var(--bg2)',
                color: 'var(--txt1)', fontSize: 13, resize: 'vertical'
              }}
            />
            <Btn
              onClick={guardarHoy}
              disabled={guardando}
              style={{ marginTop: 10, width: '100%' }}
            >
              {guardando ? 'Guardando...' : registroHoy ? '💾 Actualizar registro' : '💾 Guardar producción de hoy'}
            </Btn>
          </Card>
        </>
      )}

      {/* ══════════════════════════════════════════════════════
          PESTAÑA: HISTORIAL  —  NUEVO: detalle por pieza + edición
      ══════════════════════════════════════════════════════ */}
      {tabActiva === 'historial' && (
        <Card>
          <CardTitle>📊 Historial de producción</CardTitle>
          {historial.length === 0 ? (
            <Empty icon="📋" text="No hay registros todavía." />
          ) : historial.map(dia => {
            const prods   = dia.productos || []
            const totC    = prods.reduce((s, p) => s + (parseFloat(p.cocido)  || 0), 0)
            const totV    = prods.reduce((s, p) => s + (parseFloat(p.vendido) || 0), 0)
            const totT    = prods.reduce((s, p) => s + (parseFloat(p.tirado)  || 0), 0)
            const abierto = diaExpandido === dia.id

            return (
              <div
                key={dia.id}
                style={{
                  border: `1px solid ${abierto ? 'var(--pur)' : 'var(--bor)'}`,
                  borderRadius: 10, marginBottom: 8, overflow: 'hidden'
                }}
              >
                {/* ── Cabecera del día (clickable) ── */}
                <div
                  onClick={() => setDiaExpandido(abierto ? null : dia.id)}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '11px 14px', cursor: 'pointer',
                    background: abierto ? 'var(--purbg)' : 'var(--bg2)',
                    flexWrap: 'wrap', gap: 8
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <strong style={{ fontSize: 13, color: 'var(--txt1)' }}>
                      {new Date(dia.fecha + 'T12:00:00').toLocaleDateString('es-ES', {
                        weekday: 'long', day: 'numeric', month: 'long'
                      })}
                    </strong>
                    {dia.condicion && (
                      <span style={{
                        background: 'var(--purbg)', color: 'var(--pur)',
                        border: '1px solid var(--bor2)', borderRadius: 20,
                        padding: '2px 9px', fontSize: 11, fontWeight: 600
                      }}>
                        {dia.condicion}
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 14, fontSize: 12, alignItems: 'center' }}>
                    <span style={{ color: 'var(--inf)' }}>🔥 <strong>{totC}</strong></span>
                    <span style={{ color: 'var(--ok)'  }}>✅ <strong>{totV}</strong></span>
                    <span style={{ color: 'var(--err)' }}>🗑️ <strong>{totT}</strong></span>
                    {totC > 0 && (
                      <span style={{ color: 'var(--txt3)', fontSize: 11 }}>
                        Efic. <strong>{Math.round(totV / totC * 100)}%</strong>
                      </span>
                    )}
                    <span style={{ color: 'var(--pur)', fontSize: 16 }}>
                      {abierto ? '▲' : '▼'}
                    </span>
                  </div>
                </div>

                {/* ── Detalle expandido ── */}
                {abierto && (
                  <div style={{ padding: '0 14px 14px' }}>

                    {/* Sub-cabecera columnas */}
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 80px 80px 80px 72px',
                      gap: 6, padding: '8px 6px 4px',
                      fontSize: 10, fontWeight: 700, color: 'var(--txt3)',
                      textTransform: 'uppercase', letterSpacing: '0.05em',
                      borderBottom: '1px solid var(--bor)', marginBottom: 4
                    }}>
                      <span>Producto</span>
                      <span style={{ textAlign: 'center' }}>🔥 Cocido</span>
                      <span style={{ textAlign: 'center' }}>✅ Vendido</span>
                      <span style={{ textAlign: 'center' }}>🗑️ Tirado</span>
                      <span style={{ textAlign: 'center' }}>Editar</span>
                    </div>

                    {prods.length === 0 ? (
                      <div style={{ fontSize: 12, color: 'var(--txt3)', padding: '10px 0' }}>
                        Sin detalle de productos registrado
                      </div>
                    ) : prods.map(prod => {
                      const esEditandoEsta =
                        editando?.diaId === dia.id && editando?.prodId === prod.prodId

                      return (
                        <div
                          key={prod.prodId}
                          style={{
                            display: 'grid',
                            gridTemplateColumns: '1fr 80px 80px 80px 72px',
                            gap: 6, padding: '7px 6px',
                            borderBottom: '1px solid var(--bor)',
                            alignItems: 'center',
                            background: esEditandoEsta ? 'var(--purbg)' : 'transparent',
                            borderRadius: esEditandoEsta ? 8 : 0
                          }}
                        >
                          {/* Nombre */}
                          <span style={{ fontSize: 13, color: 'var(--txt1)' }}>
                            {prod.icono || '🍞'} {prod.nombre}
                          </span>

                          {/* Valores — edición o lectura */}
                          {esEditandoEsta ? (
                            <>
                              {['cocido', 'vendido', 'tirado'].map(field => (
                                <input
                                  key={field}
                                  type="number"
                                  min="0"
                                  value={editVal[field]}
                                  onChange={e => setEditVal(v => ({ ...v, [field]: e.target.value }))}
                                  style={{
                                    width: '100%', padding: '5px 6px', borderRadius: 6,
                                    border: '1.5px solid var(--pur)', textAlign: 'center',
                                    background: '#fff', color: 'var(--txt1)',
                                    fontSize: 14, fontWeight: 600
                                  }}
                                  autoFocus={field === 'cocido'}
                                />
                              ))}
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                <button
                                  onClick={() => guardarEdicion(dia)}
                                  disabled={guardandoEdit}
                                  style={{
                                    padding: '4px 8px', borderRadius: 6, border: 'none',
                                    background: 'var(--pur)', color: '#fff',
                                    fontSize: 11, fontWeight: 600, cursor: 'pointer'
                                  }}
                                >
                                  {guardandoEdit ? '...' : '✓ OK'}
                                </button>
                                <button
                                  onClick={cancelarEdicion}
                                  style={{
                                    padding: '4px 8px', borderRadius: 6,
                                    border: '1px solid var(--bor)', background: 'var(--bg2)',
                                    color: 'var(--txt2)', fontSize: 11, cursor: 'pointer'
                                  }}
                                >
                                  ✕
                                </button>
                              </div>
                            </>
                          ) : (
                            <>
                              <span style={{ textAlign: 'center', fontSize: 14, fontWeight: 600, color: 'var(--inf)' }}>
                                {prod.cocido  || '—'}
                              </span>
                              <span style={{ textAlign: 'center', fontSize: 14, fontWeight: 600, color: 'var(--ok)' }}>
                                {prod.vendido || '—'}
                              </span>
                              <span style={{ textAlign: 'center', fontSize: 14, fontWeight: 600, color: prod.tirado > 0 ? 'var(--err)' : 'var(--txt3)' }}>
                                {prod.tirado  || '—'}
                              </span>
                              <div style={{ textAlign: 'center' }}>
                                <button
                                  onClick={() => abrirEdicion(dia.id, prod)}
                                  style={{
                                    padding: '4px 10px', borderRadius: 6,
                                    border: '1px solid var(--bor)', background: 'var(--bg2)',
                                    color: 'var(--txt2)', fontSize: 11, cursor: 'pointer'
                                  }}
                                >
                                  ✏️ Editar
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      )
                    })}

                    {/* Totales del día */}
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 80px 80px 80px 72px',
                      gap: 6, padding: '8px 6px 2px',
                      fontSize: 12, fontWeight: 700, color: 'var(--txt1)',
                      borderTop: '2px solid var(--bor)', marginTop: 4
                    }}>
                      <span style={{ color: 'var(--txt3)' }}>TOTAL</span>
                      <span style={{ textAlign: 'center', color: 'var(--inf)' }}>{totC}</span>
                      <span style={{ textAlign: 'center', color: 'var(--ok)'  }}>{totV}</span>
                      <span style={{ textAlign: 'center', color: 'var(--err)' }}>{totT}</span>
                      <span />
                    </div>

                    {/* Notas */}
                    {dia.notas && (
                      <div style={{
                        marginTop: 10, fontSize: 12, color: 'var(--txt2)',
                        fontStyle: 'italic', padding: '6px 10px',
                        background: 'var(--bg2)', borderRadius: 8,
                        borderLeft: '3px solid var(--pur)'
                      }}>
                        📝 {dia.notas}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </Card>
      )}

      {/* ══════════════════════════════════════════════════════
          PESTAÑA: IA
      ══════════════════════════════════════════════════════ */}
      {tabActiva === 'ia' && (
        <Card>
          <CardTitle>🤖 Recomendación de producción</CardTitle>
          <p style={{ fontSize: 13, color: 'var(--txt2)', marginBottom: 12 }}>
            La IA analiza el historial de los últimos 30 días y te dice cuánto cocer mañana.
          </p>
          <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
            {CONDICIONES_RAPIDAS.map(c => (
              <button
                key={c.value}
                onClick={() => setCondMañana(condMañana === c.value ? '' : c.value)}
                style={{
                  padding: '5px 12px', borderRadius: 20, fontSize: 12, cursor: 'pointer',
                  border:     condMañana === c.value ? '2px solid var(--pur)' : '1px solid var(--bor)',
                  background: condMañana === c.value ? 'var(--purbg)'         : 'var(--bg2)',
                  color:      condMañana === c.value ? 'var(--pur)'           : 'var(--txt2)',
                  fontWeight: condMañana === c.value ? 600                    : 400,
                }}
              >
                {c.label}
              </button>
            ))}
          </div>
          <input
            value={condMañana}
            onChange={e => setCondMañana(e.target.value)}
            placeholder="O describe las condiciones de mañana..."
            style={{
              width: '100%', padding: '8px 12px', borderRadius: 8,
              border: '1px solid var(--bor)', background: 'var(--bg2)',
              color: 'var(--txt1)', fontSize: 13, marginBottom: 12
            }}
          />
          <Btn onClick={pedirRecomendacion} disabled={cargandoIA} style={{ width: '100%' }}>
            {cargandoIA ? '⏳ Consultando a la IA...' : '🤖 Obtener recomendación'}
          </Btn>
          {recomendacion && (
            <div style={{
              marginTop: 16, padding: '14px 16px', borderRadius: 10,
              background: 'var(--purbg)', border: '1px solid var(--bor2)',
              fontSize: 13, color: 'var(--txt1)', lineHeight: 1.7,
              whiteSpace: 'pre-wrap'
            }}>
              {recomendacion}
            </div>
          )}
        </Card>
      )}
    </div>
  )
}
