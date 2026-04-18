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
  const [ticket, setTicket] = useState([])
  const [historial, setHistorial] = useState([])
  const [loadingH, setLoadingH] = useState(false)
  const [catActiva, setCatActiva] = useState('todas')
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

  function addToTicket(prod) {
    const precio = getPrecio(prod)
    setTicket(prev => {
      const ex = prev.find(i => i.prodId === prod.id)
      if (ex) return prev.map(i => i.prodId === prod.id ? { ...i, qty: i.qty + 1 } : i)
      return [...prev, { prodId: prod.id, nombre: prod.nombre, icono: prod.icono || getEmoji(prod.categoria), qty: 1, precio }]
    })
  }

  function changeQty(prodId, delta) {
    setTicket(prev => prev.map(i => i.prodId === prodId ? { ...i, qty: Math.max(0, i.qty + delta) } : i).filter(i => i.qty > 0))
  }

  function setQtyDirecto(prodId, val) {
    const n = parseInt(val)
    if (isNaN(n) || n < 0) return
    if (n === 0) setTicket(prev => prev.filter(i => i.prodId !== prodId))
    else setTicket(prev => prev.map(i => i.prodId === prodId ? { ...i, qty: n } : i))
  }

  const total = ticket.reduce((s, i) => s + i.precio * i.qty, 0)
  const cli = clientes.find(c => c.id === cliId)
  const categoriasDisponibles = CATEGORIAS.filter(c => productos.some(p => p.categoria === c))
  const prodsFiltrados = catActiva === 'todas' ? productos : productos.filter(p => p.categoria === catActiva)

  async function registrar(esComanda) {
    if (!ticket.length) { toast.error('El ticket esta vacio'); return }
    const now = new Date()
    const base = { fecha_registro: todayStr(), hora_registro: now.toTimeString().slice(0, 5), fecha_entrega: dp.fechaEntrega, cliente_id: cliId || null, cliente_nombre: cli ? cli.nombre : 'Directo', items: ticket, total }
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

  const btnCat = (val, label) => (
    <button key={val} onClick={() => setCatActiva(val)} style={{ padding: '4px 10px', borderRadius: 20, border: '1.5px solid ' + (catActiva === val ? 'var(--bor2)' : 'var(--bor)'), background: catActiva === val ? 'var(--purbg)' : 'transparent', color: catActiva === val ? 'var(--pur)' : 'var(--txt2)', fontSize: 11, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
      {label}
    </button>
  )

  return (
    <div className="fade-in">
      <SectionHeader title="Punto de Venta" subtitle={'Pedidos para ' + dp.label} />
      <Banner>Los pedidos registrados ahora son para <strong>{dp.label}</strong></Banner>
      <div className={styles.posWrap}>
        <Card>
          <div style={{ marginBottom: 10 }}>
            <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--txt2)', textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 4 }}>Cliente (opcional)</label>
            <select value={cliId} onChange={e => onChangeCli(e.target.value)}>
              <option value="">Venta directa</option>
              {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre} ({c.tipo})</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 10 }}>
            {btnCat('todas', 'Todos')}
            {categoriasDisponibles.map(c => btnCat(c, getEmoji(c) + ' ' + c))}
          </div>
          <CardTitle>Selecciona productos</CardTitle>
          {loadingP ? <Loading /> : prodsFiltrados.length === 0 ? <Empty icon="🍞" text="No hay productos" /> : (
            <div className={styles.pgrid}>
              {prodsFiltrados.map(p => {
                const precio = getPrecio(p)
                const especial = cliId && precio !== p.precio
                return (
                  <button key={p.id} className={styles.pb} onClick={() => addToTicket(p)}>
                    <div className={styles.pbe}>{p.icono || getEmoji(p.categoria)}</div>
                    <div className={styles.pbn}>{p.nombre}</div>
                    <div className={styles.pbp} style={{ color: especial ? 'var(--ok)' : 'var(--pur)' }}>{fmt(precio)}</div>
                    {especial && <div className={styles.pbs}>precio especial</div>}
                  </button>
                )
              })}
            </div>
          )}
        </Card>
        <div className={styles.tck}>
          <div className={styles.tTitle}>Ticket</div>
          <div className={styles.tSub}>{cli ? cli.nombre + ' (' + cli.tipo + ')' : 'Venta directa'}</div>
          <div className={styles.tItems}>
            {ticket.length === 0 ? <Empty icon="🛒" text="Selecciona productos" /> : ticket.map(item => (
              <div key={item.prodId} className={styles.tRow}>
                <span>{item.icono}</span>
                <span className={styles.tName}>{item.nombre}</span>
                <span className={styles.tQty}>
                  <button onClick={() => changeQty(item.prodId, -1)}>-</button>
                  <input
                    type="number" min="1" value={item.qty}
                    onChange={e => setQtyDirecto(item.prodId, e.target.value)}
                    style={{ width: 50, textAlign: 'center', padding: '2px 4px', fontSize: 13, fontWeight: 600, border: '1.5px solid var(--bor2)', borderRadius: 6, background: 'var(--sur2)' }}
                  />
                  <button onClick={() => changeQty(item.prodId, 1)}>+</button>
                </span>
                <span className={styles.tPrice}>{fmt(item.precio * item.qty)}</span>
                <span className={styles.tDel} onClick={() => changeQty(item.prodId, -999)}>x</span>
              </div>
            ))}
          </div>
          <div className={styles.tTotal}><span>TOTAL</span><span>{fmt(total)}</span></div>
          <Btn fullWidth onClick={() => registrar(false)} disabled={!ticket.length}>Cobrar ahora</Btn>
          <Btn variant="ghost" fullWidth onClick={() => registrar(true)} disabled={!ticket.length} style={{ marginTop: 5 }}>Enviar como comanda</Btn>
          {ticket.length > 0 && <Btn variant="ghost" fullWidth onClick={() => setTicket([])} size="sm" style={{ marginTop: 4, color: 'var(--txt3)' }}>Limpiar ticket</Btn>}
        </div>
      </div>
      <Card>
        <CardTitle>Ventas cobradas hoy</CardTitle>
        {loadingH ? <Loading /> : historial.length === 0 ? <Empty icon="📋" text="Sin ventas cobradas hoy" /> : (
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
