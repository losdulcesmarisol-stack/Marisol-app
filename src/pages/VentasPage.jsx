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
  const [modalCantidad, setModalCantidad] = useState(null)
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

  function pulsarProducto(prod) {
    const precio = getPrecio(prod)
    const enTicket = ticket.find(i => i.prodId === prod.id)
    setCantInput(enTicket ? String(enTicket.qty) : '')
    setModalCantidad({ prod, precio })
  }

  function tecla(k) {
    if (k === 'C') { setCantInput(''); return }
    if (k === 'DEL') { setCantInput(p => p.slice(0, -1)); return }
    if (cantInput.length >= 4) return
    setCantInput(p => p + k)
  }

  function confirmarCantidad() {
    const n = parseInt(cantInput)
    if (!modalCantidad) return
    const { prod, precio } = modalCantidad
    if (!cantInput || isNaN(n) || n <= 0) {
      setTicket(prev => prev.filter(i => i.prodId !== prod.id))
    } else {
      setTicket(prev => {
        const ex = prev.find(i => i.prodId === prod.id)
        if (ex) return prev.map(i => i.prodId === prod.id ? { ...i, qty: n, precio } : i)
        return [...prev, { prodId: prod.id, nombre: prod.nombre, icono: prod.icono || getEmoji(prod.categoria), qty: n, precio }]
      })
    }
    setModalCantidad(null)
    setCantInput('')
  }

  function changeQty(prodId, delta) {
    setTicket(prev => prev.map(i => i.prodId === prodId ? { ...i, qty: Math.max(0, i.qty + delta) } : i).filter(i => i.qty > 0))
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

  const numKeys = ['1','2','3','4','5','6','7','8','9','C','0','DEL']

  return (
    <div className="fade-in">
      <SectionHeader title="Punto de Venta" subtitle={'Pedidos para ' + dp.label} />
      <Banner>Pedidos de ahora son para <strong>{dp.label}</strong></Banner>

      {ticket.length > 0 && (
        <div className={styles.ticketTop}>
          <div className={styles.ticketTopHeader}>
            <span style={{ fontWeight: 600, fontSize: 13 }}>Ticket — {cli ? cli.nombre : 'Venta directa'}</span>
            <span style={{ fontFamily: "'Playfair Display',serif", fontSize: 16, color: 'var(--pur)', fontWeight: 700 }}>{fmt(total)}</span>
          </div>
          <div className={styles.ticketTopItems}>
            {ticket.map(item => (
              <div key={item.prodId} className={styles.ticketTopRow}>
                <span className={styles.ticketTopIco}>{item.icono}</span>
                <span className={styles.ticketTopNom}>{item.nombre}</span>
                <span className={styles.ticketTopQty}>
                  <button onClick={() => changeQty(item.prodId, -1)}>-</button>
                  <strong>{item.qty}</strong>
                  <button onClick={() => changeQty(item.prodId, 1)}>+</button>
                </span>
                <span className={styles.ticketTopPre}>{fmt(item.precio * item.qty)}</span>
                <span className={styles.ticketTopDel} onClick={() => changeQty(item.prodId, -999)}>x</span>
              </div>
            ))}
          </div>
          <div className={styles.ticketTopBtns}>
            <Btn fullWidth onClick={() => registrar(false)}>Cobrar {fmt(total)}</Btn>
            <Btn variant="ghost" fullWidth onClick={() => registrar(true)} style={{ marginTop: 5 }}>Comanda</Btn>
            <Btn variant="ghost" fullWidth onClick={() => setTicket([])} size="sm" style={{ marginTop: 4, color: 'var(--txt3)' }}>Limpiar</Btn>
          </div>
        </div>
      )}

      <div className={styles.posWrap}>
        <Card>
          <div style={{ marginBottom: 10 }}>
            <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--txt2)', textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 4 }}>Cliente (opcional)</label>
            <select value={cliId} onChange={e => onChangeCli(e.target.value)}>
              <option value="">Venta directa</option>
              {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre} ({c.tipo})</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', gap: 5, overflowX: 'auto', paddingBottom: 4, marginBottom: 10, scrollbarWidth: 'none' }}>
            <button onClick={() => setCatActiva('todas')} style={{ padding: '5px 11px', borderRadius: 20, border: '1.5px solid ' + (catActiva === 'todas' ? 'var(--bor2)' : 'var(--bor)'), background: catActiva === 'todas' ? 'var(--purbg)' : 'transparent', color: catActiva === 'todas' ? 'var(--pur)' : 'var(--txt2)', fontSize: 11, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}>Todos</button>
            {categoriasDisponibles.map(c => (
              <button key={c} onClick={() => setCatActiva(c)} style={{ padding: '5px 11px', borderRadius: 20, border: '1.5px solid ' + (catActiva === c ? 'var(--bor2)' : 'var(--bor)'), background: catActiva === c ? 'var(--purbg)' : 'transparent', color: catActiva === c ? 'var(--pur)' : 'var(--txt2)', fontSize: 11, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}>{getEmoji(c)} {c}</button>
            ))}
          </div>
          {loadingP ? <Loading /> : prodsFiltrados.length === 0 ? <Empty icon="🍞" text="No hay productos" /> : (
            <div className={styles.pgrid}>
              {prodsFiltrados.map(p => {
                const pre

cat > src/pages/VentasPage.jsx << 'ENDOFFILE'
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
  const [modalCantidad, setModalCantidad] = useState(null)
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

  function pulsarProducto(prod) {
    const precio = getPrecio(prod)
    const enTicket = ticket.find(i => i.prodId === prod.id)
    setCantInput(enTicket ? String(enTicket.qty) : '')
    setModalCantidad({ prod, precio })
  }

  function tecla(k) {
    if (k === 'C') { setCantInput(''); return }
    if (k === 'DEL') { setCantInput(p => p.slice(0, -1)); return }
    if (cantInput.length >= 4) return
    setCantInput(p => p + k)
  }

  function confirmarCantidad() {
    const n = parseInt(cantInput)
    if (!modalCantidad) return
    const { prod, precio } = modalCantidad
    if (!cantInput || isNaN(n) || n <= 0) {
      setTicket(prev => prev.filter(i => i.prodId !== prod.id))
    } else {
      setTicket(prev => {
        const ex = prev.find(i => i.prodId === prod.id)
        if (ex) return prev.map(i => i.prodId === prod.id ? { ...i, qty: n, precio } : i)
        return [...prev, { prodId: prod.id, nombre: prod.nombre, icono: prod.icono || getEmoji(prod.categoria), qty: n, precio }]
      })
    }
    setModalCantidad(null)
    setCantInput('')
  }

  function changeQty(prodId, delta) {
    setTicket(prev => prev.map(i => i.prodId === prodId ? { ...i, qty: Math.max(0, i.qty + delta) } : i).filter(i => i.qty > 0))
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

  const numKeys = ['1','2','3','4','5','6','7','8','9','C','0','DEL']

  return (
    <div className="fade-in">
      <SectionHeader title="Punto de Venta" subtitle={'Pedidos para ' + dp.label} />
      <Banner>Pedidos de ahora son para <strong>{dp.label}</strong></Banner>

      {ticket.length > 0 && (
        <div className={styles.ticketTop}>
          <div className={styles.ticketTopHeader}>
            <span style={{ fontWeight: 600, fontSize: 13 }}>Ticket — {cli ? cli.nombre : 'Venta directa'}</span>
            <span style={{ fontFamily: "'Playfair Display',serif", fontSize: 16, color: 'var(--pur)', fontWeight: 700 }}>{fmt(total)}</span>
          </div>
          <div className={styles.ticketTopItems}>
            {ticket.map(item => (
              <div key={item.prodId} className={styles.ticketTopRow}>
                <span className={styles.ticketTopIco}>{item.icono}</span>
                <span className={styles.ticketTopNom}>{item.nombre}</span>
                <span className={styles.ticketTopQty}>
                  <button onClick={() => changeQty(item.prodId, -1)}>-</button>
                  <strong>{item.qty}</strong>
                  <button onClick={() => changeQty(item.prodId, 1)}>+</button>
                </span>
                <span className={styles.ticketTopPre}>{fmt(item.precio * item.qty)}</span>
                <span className={styles.ticketTopDel} onClick={() => changeQty(item.prodId, -999)}>x</span>
              </div>
            ))}
          </div>
          <div className={styles.ticketTopBtns}>
            <Btn fullWidth onClick={() => registrar(false)}>Cobrar {fmt(total)}</Btn>
            <Btn variant="ghost" fullWidth onClick={() => registrar(true)} style={{ marginTop: 5 }}>Comanda</Btn>
            <Btn variant="ghost" fullWidth onClick={() => setTicket([])} size="sm" style={{ marginTop: 4, color: 'var(--txt3)' }}>Limpiar</Btn>
          </div>
        </div>
      )}

      <div className={styles.posWrap}>
        <Card>
          <div style={{ marginBottom: 10 }}>
            <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--txt2)', textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 4 }}>Cliente (opcional)</label>
            <select value={cliId} onChange={e => onChangeCli(e.target.value)}>
              <option value="">Venta directa</option>
              {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre} ({c.tipo})</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', gap: 5, overflowX: 'auto', paddingBottom: 4, marginBottom: 10, scrollbarWidth: 'none' }}>
            <button onClick={() => setCatActiva('todas')} style={{ padding: '5px 11px', borderRadius: 20, border: '1.5px solid ' + (catActiva === 'todas' ? 'var(--bor2)' : 'var(--bor)'), background: catActiva === 'todas' ? 'var(--purbg)' : 'transparent', color: catActiva === 'todas' ? 'var(--pur)' : 'var(--txt2)', fontSize: 11, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}>Todos</button>
            {categoriasDisponibles.map(c => (
              <button key={c} onClick={() => setCatActiva(c)} style={{ padding: '5px 11px', borderRadius: 20, border: '1.5px solid ' + (catActiva === c ? 'var(--bor2)' : 'var(--bor)'), background: catActiva === c ? 'var(--purbg)' : 'transparent', color: catActiva === c ? 'var(--pur)' : 'var(--txt2)', fontSize: 11, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}>{getEmoji(c)} {c}</button>
            ))}
          </div>
          {loadingP ? <Loading /> : prodsFiltrados.length === 0 ? <Empty icon="🍞" text="No hay productos" /> : (
            <div className={styles.pgrid}>
              {prodsFiltrados.map(p => {
                const pre
cat > src/pages/VentasPage.jsx << 'ENDOFFILE'
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
  const [modalCantidad, setModalCantidad] = useState(null)
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

  function pulsarProducto(prod) {
    const precio = getPrecio(prod)
    const enTicket = ticket.find(i => i.prodId === prod.id)
    setCantInput(enTicket ? String(enTicket.qty) : '')
    setModalCantidad({ prod, precio })
  }

  function tecla(k) {
    if (k === 'C') { setCantInput(''); return }
    if (k === 'DEL') { setCantInput(p => p.slice(0, -1)); return }
    if (cantInput.length >= 4) return
    setCantInput(p => p + k)
  }

  function confirmarCantidad() {
    const n = parseInt(cantInput)
    if (!modalCantidad) return
    const { prod, precio } = modalCantidad
    if (!cantInput || isNaN(n) || n <= 0) {
      setTicket(prev => prev.filter(i => i.prodId !== prod.id))
    } else {
      setTicket(prev => {
        const ex = prev.find(i => i.prodId === prod.id)
        if (ex) return prev.map(i => i.prodId === prod.id ? { ...i, qty: n, precio } : i)
        return [...prev, { prodId: prod.id, nombre: prod.nombre, icono: prod.icono || getEmoji(prod.categoria), qty: n, precio }]
      })
    }
    setModalCantidad(null)
    setCantInput('')
  }

  function changeQty(prodId, delta) {
    setTicket(prev => prev.map(i => i.prodId === prodId ? { ...i, qty: Math.max(0, i.qty + delta) } : i).filter(i => i.qty > 0))
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

  const numKeys = ['1','2','3','4','5','6','7','8','9','C','0','DEL']

  return (
    <div className="fade-in">
      <SectionHeader title="Punto de Venta" subtitle={'Pedidos para ' + dp.label} />
      <Banner>Pedidos de ahora son para <strong>{dp.label}</strong></Banner>

      {ticket.length > 0 && (
        <div className={styles.ticketTop}>
          <div className={styles.ticketTopHeader}>
            <span style={{ fontWeight: 600, fontSize: 13 }}>Ticket — {cli ? cli.nombre : 'Venta directa'}</span>
            <span style={{ fontFamily: "'Playfair Display',serif", fontSize: 16, color: 'var(--pur)', fontWeight: 700 }}>{fmt(total)}</span>
          </div>
          <div className={styles.ticketTopItems}>
            {ticket.map(item => (
              <div key={item.prodId} className={styles.ticketTopRow}>
                <span className={styles.ticketTopIco}>{item.icono}</span>
                <span className={styles.ticketTopNom}>{item.nombre}</span>
                <span className={styles.ticketTopQty}>
                  <button onClick={() => changeQty(item.prodId, -1)}>-</button>
                  <strong>{item.qty}</strong>
                  <button onClick={() => changeQty(item.prodId, 1)}>+</button>
                </span>
                <span className={styles.ticketTopPre}>{fmt(item.precio * item.qty)}</span>
                <span className={styles.ticketTopDel} onClick={() => changeQty(item.prodId, -999)}>x</span>
              </div>
            ))}
          </div>
          <div className={styles.ticketTopBtns}>
            <Btn fullWidth onClick={() => registrar(false)}>Cobrar {fmt(total)}</Btn>
            <Btn variant="ghost" fullWidth onClick={() => registrar(true)} style={{ marginTop: 5 }}>Comanda</Btn>
            <Btn variant="ghost" fullWidth onClick={() => setTicket([])} size="sm" style={{ marginTop: 4, color: 'var(--txt3)' }}>Limpiar</Btn>
          </div>
        </div>
      )}

      <div className={styles.posWrap}>
        <Card>
          <div style={{ marginBottom: 10 }}>
            <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--txt2)', textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 4 }}>Cliente (opcional)</label>
            <select value={cliId} onChange={e => onChangeCli(e.target.value)}>
              <option value="">Venta directa</option>
              {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre} ({c.tipo})</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', gap: 5, overflowX: 'auto', paddingBottom: 4, marginBottom: 10, scrollbarWidth: 'none' }}>
            <button onClick={() => setCatActiva('todas')} style={{ padding: '5px 11px', borderRadius: 20, border: '1.5px solid ' + (catActiva === 'todas' ? 'var(--bor2)' : 'var(--bor)'), background: catActiva === 'todas' ? 'var(--purbg)' : 'transparent', color: catActiva === 'todas' ? 'var(--pur)' : 'var(--txt2)', fontSize: 11, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}>Todos</button>
            {categoriasDisponibles.map(c => (
              <button key={c} onClick={() => setCatActiva(c)} style={{ padding: '5px 11px', borderRadius: 20, border: '1.5px solid ' + (catActiva === c ? 'var(--bor2)' : 'var(--bor)'), background: catActiva === c ? 'var(--purbg)' : 'transparent', color: catActiva === c ? 'var(--pur)' : 'var(--txt2)', fontSize: 11, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}>{getEmoji(c)} {c}</button>
            ))}
          </div>
          {loadingP ? <Loading /> : prodsFiltrados.length === 0 ? <Empty icon="🍞" text="No hay productos" /> : (
            <div className={styles.pgrid}>
              {prodsFiltrados.map(p => {
                const precio = getPrecio(p)
                const especial = cliId && precio !== p.precio
                const enTicket = ticket.find(i => i.prodId === p.id)
                return (
                  <button key={p.id} className={styles.pb + (enTicket ? ' ' + styles.pbActivo : '')} onClick={() => pulsarProducto(p)}>
                    {enTicket && <div className={styles.pbBadge}>{enTicket.qty}</div>}
                    <div className={styles.pbe}>{p.icono || getEmoji(p.categoria)}</div>
                    <div className={styles.pbn}>{p.nombre}</div>
                    <div className={styles.pbp} style={{ color: especial ? 'var(--ok)' : 'var(--pur)' }}>{fmt(precio)}</div>
                    {especial && <div className={styles.pbs}>especial</div>}
                  </button>
                )
              })}
            </div>
          )}
        </Card>

        <div className={styles.tck + ' ' + styles.tckDesktop}>
          <div className={styles.tTitle}>Ticket</div>
          <div className={styles.tSub}>{cli ? cli.nombre : 'Venta directa'}</div>
          <div className={styles.tItems}>
            {ticket.length === 0 ? <Empty icon="🛒" text="Pulsa un producto" /> : ticket.map(item => (
              <div key={item.prodId} className={styles.tRow}>
                <span>{item.icono}</span>
                <span className={styles.tName}>{item.nombre}</span>
                <span className={styles.tQty}>
                  <button onClick={() => changeQty(item.prodId, -1)}>-</button>
                  <input type="number" min="1" value={item.qty}
                    onChange={e => {
                      const n = parseInt(e.target.value)
                      if (!e.target.value || isNaN(n) || n <= 0) setTicket(prev => prev.filter(i => i.prodId !== item.prodId))
                      else setTicket(prev => prev.map(i => i.prodId === item.prodId ? { ...i, qty: n } : i))
                    }}
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
          <Btn variant="ghost" fullWidth onClick={() => registrar(true)} disabled={!ticket.length} style={{ marginTop: 5 }}>Comanda</Btn>
          {ticket.length > 0 && <Btn variant="ghost" fullWidth onClick={() => setTicket([])} size="sm" style={{ marginTop: 4, color: 'var(--txt3)' }}>Limpiar</Btn>}
        </div>
      </div>

      <Card>
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

      {modalCantidad && (
        <div onClick={e => { if (e.target === e.currentTarget) { setModalCantidad(null); setCantInput('') } }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(26,22,40,.55)', zIndex: 300, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', backdropFilter: 'blur(3px)' }}>
          <div style={{ background: 'var(--sur)', borderRadius: '20px 20px 0 0', padding: '20px 16px 32px', width: '100%', maxWidth: 420, boxShadow: '0 -8px 32px rgba(0,0,0,.2)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <span style={{ fontSize: 36 }}>{modalCantidad.prod.icono || getEmoji(modalCantidad.prod.categoria)}</span>
              <div>
                <div style={{ fontWeight: 600, fontSize: 16 }}>{modalCantidad.prod.nombre}</div>
                <div style={{ fontSize: 13, color: 'var(--pur)', fontWeight: 600 }}>{fmt(modalCantidad.precio)} por {modalCantidad.prod.unidad}</div>
              </div>
            </div>
            <div style={{ background: 'var(--sur2)', border: '1.5px solid var(--bor2)', borderRadius: 12, padding: '14px 18px', marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 13, color: 'var(--txt3)' }}>Cantidad</span>
              <span style={{ fontSize: 36, fontWeight: 700, fontFamily: "'Playfair Display',serif", color: cantInput ? 'var(--txt)' : 'var(--txt3)', minWidth: 70, textAlign: 'right' }}>
                {cantInput || '0'}
              </span>
            </div>
            {cantInput && parseInt(cantInput) > 0 && (
              <div style={{ textAlign: 'center', fontSize: 14, color: 'var(--txt2)', marginBottom: 12 }}>
                Total: <strong style={{ color: 'var(--pur)', fontSize: 16 }}>{fmt(parseInt(cantInput) * modalCantidad.precio)}</strong>
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 9, marginBottom: 12 }}>
              {numKeys.map(k => (
                <button key={k} onClick={() => tecla(k)} style={{
                  padding: '18px', borderRadius: 12, border: '1.5px solid var(--bor)',
                  background: k === 'C' ? 'rgba(181,46,30,.08)' : k === 'DEL' ? 'var(--sur2)' : 'var(--sur)',
                  color: k === 'C' ? 'var(--err)' : 'var(--txt)',
                  fontSize: k === 'DEL' ? 20 : 22, fontWeight: 600, cursor: 'pointer', fontFamily: "'Inter',sans-serif"
                }}>
                  {k === 'DEL' ? '⌫' : k}
                </button>
              ))}
            </div>
            <Btn fullWidth onClick={confirmarCantidad} style={{ padding: '15px', fontSize: 15 }}>
              {cantInput && parseInt(cantInput) > 0 ? 'Añadir ' + cantInput + ' ' + modalCantidad.prod.unidad : 'Quitar del ticket'}
            </Btn>
          </div>
        </div>
      )}
    </div>
  )
}
