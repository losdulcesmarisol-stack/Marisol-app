import { useState, useEffect, useCallback } from 'react'
import { useOutletContext } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useProductos } from '../hooks/useProductos'
import { fmt, todayStr, labelFecha } from '../lib/utils'
import { SectionHeader, FilterTabs, Loading, Empty, Btn, Modal, ModalFooter, Tag } from '../components/ui'
import toast from 'react-hot-toast'

const FILTROS = [
  { value: 'pend', label: 'Pendientes' },
  { value: 'todas', label: 'Todas' },
  { value: 'cobradas', label: 'Cobradas' },
]

export default function ComandasPage() {
  const { refreshPendientes } = useOutletContext()
  const { productos } = useProductos()
  const [filtro, setFiltro] = useState('pend')
  const [comandas, setComandas] = useState([])
  const [loading, setLoading] = useState(true)
  const [cobrarId, setCobrarId] = useState(null)
  const [cobrarData, setCobrarData] = useState(null)
  const [saving, setSaving] = useState(false)
  const [editandoNota, setEditandoNota] = useState(null)
  const [notaTexto, setNotaTexto] = useState('')
  const [guardandoNota, setGuardandoNota] = useState(false)
  const [editandoComanda, setEditandoComanda] = useState(null)
  const [editItems, setEditItems] = useState([])
  const [guardandoEdit, setGuardandoEdit] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    let q = supabase.from('comandas').select('*').order('fecha_entrega').order('hora_registro')
    if (filtro === 'pend') q = q.eq('estado', 'pendiente')
    else if (filtro === 'cobradas') q = q.eq('estado', 'cobrada')
    const { data, error } = await q
    if (error) toast.error('Error cargando comandas')
    setComandas(data || [])
    setLoading(false)
  }, [filtro])

  useEffect(() => { load() }, [load])

  function abrirEdicion(cmd){
    setEditandoComanda(cmd)
    const saved = cmd.items || []
    const todos = productos.map(pr => {
      const existe = saved.find(i => i.prodId === pr.id || i.nombre === pr.nombre)
      return existe ? existe : { prodId: pr.id, nombre: pr.nombre, icono: pr.icono || '', qty: 0, precio: pr.precio || 0 }
    })
    const extras = saved.filter(s => !productos.find(pr => pr.id === s.prodId || pr.nombre === s.nombre))
    setEditItems([...todos, ...extras])
  }
  function updateQty(idx,val){setEditItems(p=>p.map((it,i)=>i===idx?{...it,qty:parseFloat(val)||0}:it))}
  async function guardarEdicion(){setGuardandoEdit(true);try{const tot=editItems.reduce((s,i)=>s+(i.qty*i.precio),0);const{error}=await supabase.from("comandas").update({items:editItems,total:Math.round(tot*100)/100}).eq("id",editandoComanda.id);if(error)throw error;setComandas(p=>p.map(c=>c.id===editandoComanda.id?{...c,items:editItems,total:Math.round(tot*100)/100}:c));setEditandoComanda(null);toast.success("Comanda actualizada")}catch(e){toast.error("Error: "+e.message)}setGuardandoEdit(false)}
  function abrirNota(comanda) {
    setEditandoNota(comanda.id)
    setNotaTexto(comanda.notas_panadero || '')
  }

  async function guardarNota(id) {
    setGuardandoNota(true)
    try {
      const { error } = await supabase.from('comandas').update({ notas_panadero: notaTexto }).eq('id', id)
      if (error) throw error
      setComandas(prev => prev.map(c => c.id === id ? { ...c, notas_panadero: notaTexto } : c))
      setEditandoNota(null)
      toast.success('Nota guardada')
    } catch (e) {
      toast.error('Error: ' + e.message)
    } finally {
      setGuardandoNota(false)
    }
  }

  function openCobrar(c) {
    setCobrarId(c.id)
    setCobrarData(c)
  }

  async function confirmarCobro() {
    if (!cobrarId || !cobrarData) return
    setSaving(true)
    try {
      const { error: e1 } = await supabase.from('comandas').update({ estado: 'cobrada', fecha_cobro: todayStr() }).eq('id', cobrarId)
      if (e1) throw e1
      const { error: e2 } = await supabase.from('ventas').insert({
        fecha_registro: todayStr(),
        hora_registro: new Date().toTimeString().slice(0, 5),
        fecha_entrega: cobrarData.fecha_entrega,
        cliente_id: cobrarData.cliente_id,
        cliente_nombre: cobrarData.cliente_nombre,
        items: cobrarData.items,
        total: cobrarData.total,
        tipo: 'comanda_cobrada'
      })
      if (e2) throw e2
      toast.success('Cobrada: ' + fmt(cobrarData.total))
      setCobrarId(null)
      setCobrarData(null)
      await load()
      refreshPendientes()
    } catch (e) {
      toast.error('Error: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  async function cancelar(id) {
    if (!window.confirm('Cancelar esta comanda?')) return
    const { error } = await supabase.from('comandas').delete().eq('id', id)
    if (error) { toast.error('Error al cancelar'); return }
    toast.success('Comanda cancelada')
    await load()
    refreshPendientes()
  }

  const grupos = {}
  comandas.forEach(c => {
    if (!grupos[c.fecha_entrega]) grupos[c.fecha_entrega] = []
    grupos[c.fecha_entrega].push(c)
  })
  const fechasOrdenadas = Object.keys(grupos).sort()

  return (
    <div className="fade-in">
      <SectionHeader title="Comandas" subtitle="Pedidos pendientes de cobro agrupados por dia de entrega" />
      <FilterTabs tabs={FILTROS} active={filtro} onChange={v => setFiltro(v)} />

      {loading ? <Loading /> : comandas.length === 0 ? (
        <Empty icon="📋" text="No hay comandas en esta categoria" />
      ) : (
        fechasOrdenadas.map(fecha => {
          const tot = grupos[fecha].reduce((s, c) => s + parseFloat(c.total || 0), 0)
          const fechaLarga = new Date(fecha + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })

          // Resumen total de productos para el panadero
          const resumenProds = {}
          grupos[fecha].filter(c => c.estado === 'pendiente').forEach(c => {
            (c.items || []).forEach(i => {
              const k = i.nombre
              if (!resumenProds[k]) resumenProds[k] = { nombre: k, icono: i.icono || '', qty: 0 }
              resumenProds[k].qty += i.qty
            })
          })
          const resumenArr = Object.values(resumenProds)

          return (
            <div key={fecha}>
              {/* Cabecera del día */}
              <div style={{ display:'flex',alignItems:'center',gap:9,flexWrap:'wrap',margin:'16px 0 8px' }}>
                <Tag color="blue">{labelFecha(fecha)}</Tag>
                <strong style={{ fontSize:13 }}>{fechaLarga}</strong>
                <span style={{ marginLeft:'auto',fontSize:12,color:'var(--txt2)' }}>
                  Total: <strong style={{ color:'var(--pur)' }}>{fmt(tot)}</strong>
                </span>
              </div>

              {/* RESUMEN PARA EL PANADERO */}
              {resumenArr.length > 0 && (
                <div style={{ background:'linear-gradient(135deg,var(--purbg),#e8e3f8)', border:'1.5px solid var(--bor2)', borderRadius:'var(--rl)', padding:'12px 14px', marginBottom:10 }}>
                  <div style={{ fontSize:11,fontWeight:700,color:'var(--pur)',textTransform:'uppercase',letterSpacing:1,marginBottom:8 }}>
                    Resumen para el panadero
                  </div>
                  <div style={{ display:'flex',flexWrap:'wrap',gap:7 }}>
                    {resumenArr.map((r, i) => (
                      <div key={i} style={{ background:'#fff',border:'1px solid var(--bor2)',borderRadius:9,padding:'7px 12px',display:'flex',alignItems:'center',gap:7,fontSize:13 }}>
                        <span style={{ fontSize:18 }}>{r.icono}</span>
                        <span style={{ fontWeight:600 }}>{r.nombre}</span>
                        <span style={{ background:'var(--pur)',color:'#fff',borderRadius:6,padding:'2px 8px',fontWeight:700,fontSize:14 }}>{r.qty}</span>
                        <span style={{ fontSize:11,color:'var(--txt3)' }}>{""}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* COMANDAS DEL DÍA */}
              {grupos[fecha].map(c => (
                <div key={c.id} style={{
                  background:'var(--sur)',
                  border:`1px solid ${c.estado === 'pendiente' ? 'var(--bor2)' : 'var(--bor)'}`,
                  borderLeft:`3px solid ${c.estado === 'pendiente' ? 'var(--pur)' : 'var(--ok)'}`,
                  borderRadius:'var(--r)',padding:13,marginBottom:7,
                  opacity: c.estado === 'cobrada' ? 0.7 : 1
                }}>
                  <div style={{ display:'flex',alignItems:'center',gap:8,marginBottom:5,flexWrap:'wrap' }}>
                    <strong style={{ fontSize:14 }}>{c.cliente_nombre}</strong>
                    <Tag color={c.estado === 'pendiente' ? 'warn' : 'green'}>
                      {c.estado === 'pendiente' ? 'Pendiente' : 'Cobrada'}
                    </Tag>
                    <span style={{ fontSize:11,color:'var(--txt3)' }}>{(c.hora_registro || '').slice(0, 5)}h</span>
                    <strong style={{ marginLeft:'auto',color:'var(--pur)' }}>{fmt(c.total)}</strong>
                  </div>

                  {/* Productos */}
                  <div style={{ fontSize:11,color:'var(--txt2)',lineHeight:1.6,marginBottom:8 }}>
                    {(c.items || []).map(i => `${i.icono || ''} ${i.nombre} × ${i.qty}`).join(' · ')}
                  </div>

                  {/* NOTAS DEL PANADERO */}
                  {editandoNota === c.id ? (
                    <div style={{ marginBottom:8 }}>
                      <div style={{ fontSize:10,fontWeight:700,color:'var(--pur)',textTransform:'uppercase',letterSpacing:1,marginBottom:4 }}>
                        Nota para el panadero
                      </div>
                      <textarea
                        value={notaTexto}
                        onChange={e => setNotaTexto(e.target.value)}
                        placeholder="Ej: Hacer 2 batidos de magdalenas, usar harina especial..."
                        rows={3}
                        autoFocus
                        style={{ width:'100%',borderRadius:'var(--r)',border:'1.5px solid var(--pur)',padding:'8px 10px',fontSize:13,fontFamily:'Inter,sans-serif',resize:'vertical' }}
                      />
                      <div style={{ display:'flex',gap:6,marginTop:6 }}>
                        <Btn variant="ghost" size="sm" onClick={() => setEditandoNota(null)}>Cancelar</Btn>
                        <Btn size="sm" onClick={() => guardarNota(c.id)} disabled={guardandoNota}>
                          {guardandoNota ? 'Guardando...' : 'Guardar nota'}
                        </Btn>
                      </div>
                    </div>
                  ) : (
                    <div style={{ marginBottom:8 }}>
                      {c.notas_panadero ? (
                        <div style={{ background:'rgba(255,220,50,.12)',border:'1px solid rgba(255,200,0,.3)',borderRadius:'var(--r)',padding:'7px 10px',fontSize:12,color:'var(--txt)',display:'flex',alignItems:'flex-start',gap:7 }}>
                          <span style={{ fontSize:16,flexShrink:0 }}>📝</span>
                          <div style={{ flex:1 }}>
                            <div style={{ fontSize:10,fontWeight:700,color:'var(--wrn)',textTransform:'uppercase',letterSpacing:1,marginBottom:2 }}>Nota del panadero</div>
                            <div style={{ lineHeight:1.5 }}>{c.notas_panadero}</div>
                          </div>
                          <button onClick={() => abrirNota(c)} style={{ background:'transparent',border:'none',cursor:'pointer',fontSize:14,color:'var(--txt3)',flexShrink:0 }}>✏️</button>
                        </div>
                      ) : (
                        c.estado === 'pendiente' && (
                          <button onClick={() => abrirNota(c)} style={{ background:'transparent',border:'1px dashed var(--bor2)',borderRadius:'var(--r)',padding:'6px 10px',fontSize:11,color:'var(--txt3)',cursor:'pointer',width:'100%',textAlign:'left' }}>
                            📝 Añadir nota para el panadero...
                          </button>
                        )
                      )}
                    </div>
                  )}

                  {/* Acciones */}
                  {c.estado === 'pendiente' && (
                    <div style={{ display:'flex',gap:6,flexWrap:'wrap' }}>
                      <Btn variant="success" size="sm" onClick={() => openCobrar(c)}>Cobrar</Btn>
                      <Btn variant="ghost" size="sm" onClick={() => abrirEdicion(c)}>✏️ Editar</Btn>
                      <Btn variant="danger" size="sm" onClick={() => cancelar(c.id)}>Cancelar</Btn>
                    </div>
                  )}
                  {c.estado === 'cobrada' && (
                    <div style={{ fontSize:11,color:'var(--ok)',marginTop:5 }}>Cobrada el {c.fecha_cobro || '—'}</div>
                  )}
                </div>
              ))}
            </div>
          )
        })
      )}

      <Modal open={!!editandoComanda} onClose={()=>setEditandoComanda(null)} title="✏️ Editar comanda" wide>
        {editandoComanda&&(<><div style={{marginBottom:12}}><strong>{editandoComanda.cliente_nombre}</strong><span style={{fontSize:12,color:"var(--txt3)",marginLeft:8}}>{labelFecha(editandoComanda.fecha_entrega)}</span></div><div style={{border:"1px solid var(--bor)",borderRadius:8,overflow:"hidden",marginBottom:12}}><div style={{display:"grid",gridTemplateColumns:"1fr 90px 90px",gap:8,padding:"7px 12px",background:"var(--purbg)",fontSize:11,fontWeight:700,color:"var(--pur)"}}><span>Producto</span><span style={{textAlign:"center"}}>Cantidad</span><span style={{textAlign:"right"}}>Subtotal</span></div>{editItems.map((it,idx)=>(<div key={idx} style={{display:"grid",gridTemplateColumns:"1fr 90px 90px",gap:8,padding:"8px 12px",borderTop:"1px solid var(--bor)",alignItems:"center"}}><span>{it.icono||""} {it.nombre}</span><input type="number" min="0" step="0.5" value={it.qty} onChange={e=>updateQty(idx,e.target.value)} style={{width:"100%",padding:"5px 6px",borderRadius:6,border:"1.5px solid var(--pur)",textAlign:"center",fontSize:14,fontWeight:600}}/><span style={{textAlign:"right",color:"var(--txt2)"}}>€{(it.qty*it.precio).toFixed(2)}</span></div>))}<div style={{display:"grid",gridTemplateColumns:"1fr 90px 90px",gap:8,padding:"8px 12px",borderTop:"2px solid var(--bor)",fontWeight:700}}><span>TOTAL</span><span/><span style={{textAlign:"right",color:"var(--pur)"}}>€{editItems.reduce((s,i)=>s+i.qty*i.precio,0).toFixed(2)}</span></div></div><ModalFooter><Btn variant="ghost" onClick={()=>setEditandoComanda(null)}>Cancelar</Btn><Btn onClick={guardarEdicion} disabled={guardandoEdit}>{guardandoEdit?"Guardando...":"Guardar cambios"}</Btn></ModalFooter></> )}
      </Modal>

      <Modal open={!!cobrarId} onClose={() => setCobrarId(null)} title="Cobrar comanda">
        {cobrarData && (
          <>
            <div style={{ marginBottom:8 }}>
              <strong style={{ fontSize:15 }}>{cobrarData.cliente_nombre}</strong>
              {' · '}
              <Tag color="blue">{labelFecha(cobrarData.fecha_entrega)}</Tag>
            </div>
            <div style={{ fontSize:12,color:'var(--txt2)',marginBottom:10 }}>
              {(cobrarData.items || []).map(i => `${i.icono || ''} ${i.nombre} × ${i.qty}`).join(', ')}
            </div>
            {cobrarData.notas_panadero && (
              <div style={{ background:'rgba(255,220,50,.12)',border:'1px solid rgba(255,200,0,.3)',borderRadius:'var(--r)',padding:'7px 10px',fontSize:12,marginBottom:10 }}>
                📝 {cobrarData.notas_panadero}
              </div>
            )}
            <div style={{ fontSize:18,fontFamily:"'Playfair Display',serif",color:'var(--pur)' }}>
              Total: {fmt(cobrarData.total)}
            </div>
          </>
        )}
        <ModalFooter>
          <Btn variant="ghost" onClick={() => setCobrarId(null)}>Cancelar</Btn>
          <Btn variant="success" onClick={confirmarCobro} disabled={saving}>
            {saving ? 'Procesando...' : 'Confirmar cobro'}
          </Btn>
        </ModalFooter>
      </Modal>
    </div>
  )
}
//cache bust jueves, 28 de mayo de 2026, 18:38:31 CEST
