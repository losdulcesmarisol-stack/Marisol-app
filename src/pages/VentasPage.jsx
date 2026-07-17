import { useState, useEffect, useCallback } from 'react'
import { useOutletContext } from 'react-router-dom'
import { useProductos } from '../hooks/useProductos'
import { useClientes } from '../hooks/useClientes'
import { supabase } from '../lib/supabase'
import { fmt, todayStr, getDiaPanadero, labelFecha, getEmoji, CAT_EMOJI } from '../lib/utils'
import { Card, CardTitle, SectionHeader, Btn, Tag, Loading, Empty, Banner } from '../components/ui'
import toast from 'react-hot-toast'
import styles from './VentasPage.module.css'

const CATEGORIAS = Object.keys(CAT_EMOJI)

export default function VentasPage() {
  const { refreshPendientes } = useOutletContext()
  const { productos, loading: loadingP } = useProductos()
  const { clientes } = useClientes()
  const [cliId, setCliId] = useState('')
  const [fechaCustom, setFechaCustom] = useState('')
  const [ticket, setTicket] = useState([])
  const [historial, setHistorial] = useState([])
  const [loadingH, setLoadingH] = useState(false)
  const [catActiva, setCatActiva] = useState('todas')
  const [selProd, setSelProd] = useState(null)
  const [cantInput, setCantInput] = useState('')
  const dp = getDiaPanadero()

  useEffect(() => { loadHistorial() }, [])

  async function loadHistorial() {
    setLoadingH(true)
    const { data } = await supabase.from('ventas').select('*').eq('fecha_registro', todayStr()).order('hora_registro', { ascending: false })
    setHistorial(data || [])
    setLoadingH(false)
  }

  const getPrecio = useCallback((prod) => {
    if (!cliId) return prod.precio
    const cli = clientes.find(c => c.id === cliId)
    if (!cli) return prod.precio
    const pe = cli.precios_especiales?.[prod.id]
    return (pe && pe > 0) ? pe : prod.precio
  }, [cliId, clientes])

  function onChangeCli(newCliId) {
    setCliId(newCliId)
    setTicket(prev => prev.map(item => {
      const prod = productos.find(p => p.id === item.prodId)
      if (!prod) return item
      const cli = clientes.find(c => c.id === newCliId)
      const pe = cli?.precios_especiales?.[item.prodId]
      return { ...item, precio: (pe && pe > 0) ? pe : prod.precio }
    }))
  }

  function seleccionar(prod) {
    if (selProd?.id === prod.id) { setSelProd(null); setCantInput(''); return }
    const enTicket = ticket.find(i => i.prodId === prod.id)
    setCantInput(enTicket ? String(enTicket.qty) : '')
    setSelProd(prod)
  }

  function tecla(k) {
    if (k === 'C') { setCantInput(''); return }
    if (k === 'DEL') { setCantInput(p => p.slice(0, -1)); return }
    if (cantInput.length >= 4) return
    setCantInput(p => p + k)
  }

  function confirmar() {
    if (!selProd) return
    const precio = getPrecio(selProd)
    const n = parseInt(cantInput)
    if (!cantInput || isNaN(n) || n <= 0) {
      setTicket(prev => prev.filter(i => i.prodId !== selProd.id))
    } else {
      setTicket(prev => {
        const ex = prev.find(i => i.prodId === selProd.id)
        if (ex) return prev.map(i => i.prodId === selProd.id ? { ...i, qty: n, precio } : i)
        return [...prev, { prodId: selProd.id, nombre: selProd.nombre, icono: selProd.icono || getEmoji(selProd.categoria), qty: n, precio }]
      })
    }
    setSelProd(null)
    setCantInput('')
  }

  function changeQty(prodId, delta) {
    setTicket(prev => prev.map(i => i.prodId === prodId ? { ...i, qty: Math.max(0, i.qty + delta) } : i).filter(i => i.qty > 0))
  }

  const total = ticket.reduce((s, i) => s + i.precio * i.qty, 0)
  const cli = clientes.find(c => c.id === cliId)
  const categoriasDisponibles = CATEGORIAS.filter(c => productos.some(p => p.categoria === c))
  const prodsFiltrados = catActiva === 'todas' ? productos : productos.filter(p => p.categoria === catActiva)
  const numKeys = ['1','2','3','4','5','6','7','8','9','C','0','DEL']

  async function registrar(esComanda) {
    if (!ticket.length) { toast.error('El ticket esta vacio'); return }
    const now = new Date()
    const base = { fecha_registro: todayStr(), hora_registro: now.toTimeString().slice(0, 5), fecha_entrega: fechaCustom || dp.fechaEntrega, cliente_id: cliId || null, cliente_nombre: cli ? cli.nombre : 'Directo', items: ticket, total }
    try {
      if (esComanda) {
        const { error } = await supabase.from('comandas').insert({ ...base, estado: 'pendiente' })
        if (error) throw error
        toast.success('Comanda enviada para ' + dp.label)
        refreshPendientes()
      } else {
        const { error } = await supabase.from('ventas').insert({ ...base, tipo: 'cobrado' })
        if (error) throw error
        toast.success('Cobrado: ' + fmt(total))
        await loadHistorial()
      }
      setTicket([])
    } catch (e) { toast.error('Error: ' + e.message) }
  }

  return (
    <div className="fade-in">
      <SectionHeader title="Punto de Venta" subtitle={'Pedidos para ' + dp.label} />
      <Banner>Pedidos de ahora son para <strong>{dp.label}</strong></Banner>
      <div style={{ marginBottom: 10 }}>
        <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--txt2)', textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 4 }}>Cliente (opcional)</label>
        <select value={cliId} onChange={e => onChangeCli(e.target.value)} style={{ maxWidth: 320 }}>
          <option value="">Venta directa</option>
          {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre} ({c.tipo})</option>)}
        </select>
      </div>
      <div style={{ display: 'flex', gap: 5, overflowX: 'auto', paddingBottom: 4, marginBottom: 10, scrollbarWidth: 'none' }}>
        {['todas', ...categoriasDisponibles].map(c => (
          <button key={c} onClick={() => setCatActiva(c)} style={{ padding: '5px 11px', borderRadius: 20, border: '1.5px solid ' + (catActiva === c ? 'var(--bor2)' : 'var(--bor)'), background: catActiva === c ? 'var(--purbg)' : 'transparent', color: catActiva === c ? 'var(--pur)' : 'var(--txt2)', fontSize: 11, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}>
            {c === 'todas' ? 'Todos' : getEmoji(c) + ' ' + c}
          </button>
        ))}
      </div>
      <div className={styles.posWrap}>
        <div>
          {loadingP ? <Card><Loading /></Card> : (
            <div className={styles.pgrid}>
              {prodsFiltrados.map(p => {
                const precio = getPrecio(p)
                const especial = cliId && precio !== p.precio
                const enTicket = ticket.find(i => i.prodId === p.id)
                const esSel = selProd?.id === p.id
                return (
                  <div key={p.id}>
                    <button className={styles.pb + (enTicket ? ' ' + styles.pbActivo : '') + (esSel ? ' ' + styles.pbSel : '')} onClick={() => seleccionar(p)}>
                      {enTicket && <div className={styles.pbBadge}>{enTicket.qty}</div>}
                      <div className={styles.pbe}>{p.icono || getEmoji(p.categoria)}</div>
                      <div className={styles.pbn}>{p.nombre}</div>
                      <div className={styles.pbp} style={{ color: especial ? 'var(--ok)' : 'var(--pur)' }}>{fmt(precio)}</div>
                    </button>
                    {esSel && (
                      <div className={styles.inline}>
                        <div className={styles.inlineDisplay}>
                          <span style={{ fontSize: 11, color: 'var(--txt3)' }}>Cantidad</span>
                          <span style={{ fontSize: 28, fontWeight: 700, color: cantInput ? 'var(--pur)' : 'var(--txt3)' }}>{cantInput || '0'}</span>
                        </div>
                        {cantInput && parseInt(cantInput) > 0 && (
                          <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--txt2)', marginBottom: 6 }}>
                            Total: <strong style={{ color: 'var(--pur)' }}>{fmt(parseInt(cantInput) * precio)}</strong>
                          </div>
                        )}
                        <div className={styles.inlineKeys}>
                          {numKeys.map(k => (
                            <button key={k} onClick={() => tecla(k)} className={styles.inlineKey + (k === 'C' ? ' ' + styles.inlineKeyC : '')}>
                              {k === 'DEL' ? '\u232B' : k}
                            </button>
                          ))}
                        </div>
                        <button onClick={confirmar} className={styles.inlineConfirm}>
                          {cantInput && parseInt(cantInput) > 0 ? 'Anadir ' + cantInput + ' uds' : 'Quitar del ticket'}
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
        <div className={styles.tck}>
          <div className={styles.tTitle}>Ticket</div>
          <div className={styles.tSub}>{cli ? cli.nombre : 'Venta directa'}</div>
          <div className={styles.tItems}>
            {ticket.length === 0 ? <Empty icon="🛒" text="Pulsa un producto" /> : ticket.map(item => (
              <div key={item.prodId} className={styles.tRow}>
                <span>{item.icono}</span>
                <span className={styles.tName}>{item.nombre}</span>
                <span className={styles.tQty}>
                  <button onClick={() => changeQty(item.prodId, -1)}>-</button>
                  <strong style={{ minWidth: 24, textAlign: 'center' }}>{item.qty}</strong>
                  <button onClick={() => changeQty(item.prodId, 1)}>+</button>
                </span>
                <span className={styles.tPrice}>{fmt(item.precio * item.qty)}</span>
                <span className={styles.tDel} onClick={() => changeQty(item.prodId, -999)}>x</span>
              </div>
            ))}
          </div>
          <div className={styles.tTotal}><span>TOTAL</span><span>{fmt(total)}</span></div>
          <Btn fullWidth onClick={() => registrar(false)} disabled={!ticket.length}>Cobrar ahora</Btn>
          <div style={{marginTop:8,marginBottom:4}}>
            <div style={{fontSize:10,fontWeight:700,color:'var(--txt3)',textTransform:'uppercase',letterSpacing:1,marginBottom:4}}>Fecha de entrega</div>
            <input type="date" value={fechaCustom || dp.fechaEntrega}
              onChange={e => setFechaCustom(e.target.value)}
              min={dp.fechaEntrega}
              style={{width:'100%',padding:'7px 10px',borderRadius:8,border:'1px solid var(--bor)',background:'var(--bg2)',color:'var(--txt1)',fontSize:13}}
            />
            <div style={{fontSize:10,color:'var(--txt3)',marginTop:3}}>Por defecto: {dp.label}</div>
          </div>
          <Btn variant="ghost" fullWidth onClick={() => registrar(true)} disabled={!ticket.length} style={{ marginTop: 5 }}>Comanda</Btn>
          {ticket.length > 0 && <Btn variant="ghost" fullWidth onClick={() => setTicket([])} size="sm" style={{ marginTop: 4, color: 'var(--txt3)' }}>Limpiar</Btn>}
        </div>
      </div>
      <Card style={{ marginTop: 14 }}>
        <CardTitle>Ventas cobradas hoy</CardTitle>
        {loadingH ? <Loading /> : historial.length === 0 ? <Empty icon="📋" text="Sin ventas hoy" /> : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead><tr>{['Hora','Cliente','Entrega','Productos','Total'].map(h => <th key={h} style={{ background: 'var(--pur)', color: '#fff', padding: '9px 11px', textAlign: 'left', fontSize: 10, letterSpacing: 1, textTransform: 'uppercase' }}>{h}</th>)}</tr></thead>
              <tbody>{historial.map(v => (
                <tr key={v.id} style={{ borderBottom: '1px solid var(--bor)' }}>
                  <td style={{ padding: '9px 11px', color: 'var(--txt2)' }}>{(v.hora_registro || '').slice(0, 5)}</td>
                  <td style={{ padding: '9px 11px' }}>{v.cliente_nombre}</td>
                  <td style={{ padding: '9px 11px' }}><Tag color="blue">{labelFecha(v.fecha_entrega)}</Tag></td>
                  <td style={{ padding: '9px 11px', fontSize: 11, color: 'var(--txt2)' }}>{(v.items || []).map(i => i.icono + i.nombre + 'x' + i.qty).join(', ')}</td>
                  <td style={{ padding: '9px 11px' }}><strong style={{ color: 'var(--pur)' }}>{fmt(v.total)}</strong></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}