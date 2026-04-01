// src/pages/VentasPage.jsx
import { useState, useEffect, useCallback } from 'react'
import { useOutletContext } from 'react-router-dom'
import { useProductos } from '../hooks/useProductos'
import { useClientes } from '../hooks/useClientes'
import { supabase } from '../lib/supabase'
import { fmt, todayStr, getDiaPanadero, labelFecha, getEmoji } from '../lib/utils'
import { Card, CardTitle, SectionHeader, Btn, Tag, Loading, Empty, Banner } from '../components/ui'
import toast from 'react-hot-toast'
import styles from './VentasPage.module.css'

export default function VentasPage() {
  const { refreshPendientes } = useOutletContext()
  const { productos, loading: loadingP } = useProductos()
  const { clientes, loading: loadingC } = useClientes()
  const [cliId, setCliId] = useState('')
  const [ticket, setTicket] = useState([]) // [{prodId,nombre,icono,qty,precio}]
  const [historial, setHistorial] = useState([])
  const [loadingH, setLoadingH] = useState(false)
  const dp = getDiaPanadero()

  useEffect(() => { loadHistorial() }, [])

  async function loadHistorial() {
    setLoadingH(true)
    const { data } = await supabase
      .from('ventas')
      .select('*')
      .eq('fecha_registro', todayStr())
      .order('hora_registro', { ascending: false })
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
    // Recalcular precios del ticket al cambiar cliente
    setTicket(prev => prev.map(item => {
      const prod = productos.find(p => p.id === item.prodId)
      if (!prod) return item
      const cli = clientes.find(c => c.id === newCliId)
      const pe = cli?.precios_especiales?.[item.prodId]
      const precio = (pe && pe > 0) ? pe : prod.precio
      return { ...item, precio }
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
    setTicket(prev => {
      const updated = prev.map(i => i.prodId === prodId ? { ...i, qty: i.qty + delta } : i)
      return updated.filter(i => i.qty > 0)
    })
  }

  const total = ticket.reduce((s, i) => s + i.precio * i.qty, 0)
  const cli = clientes.find(c => c.id === cliId)

  async function registrar(esComanda) {
    if (!ticket.length) { toast.error('El ticket está vacío'); return }
    const now = new Date()
    const base = {
      fecha_registro: todayStr(),
      hora_registro: now.toTimeString().slice(0, 5),
      fecha_entrega: dp.fechaEntrega,
      cliente_id: cliId || null,
      cliente_nombre: cli ? cli.nombre : 'Directo',
      items: ticket,
      total,
    }
    try {
      if (esComanda) {
        const { error } = await supabase.from('comandas').insert({ ...base, estado: 'pendiente' })
        if (error) throw error
        toast.success('📋 Comanda enviada — ' + dp.label)
        refreshPendientes()
      } else {
        const { error } = await supabase.from('ventas').insert({ ...base, tipo: 'cobrado' })
        if (error) throw error
        toast.success('✅ Venta cobrada: ' + fmt(total))
        await loadHistorial()
      }
      setTicket([])
    } catch (e) {
      toast.error('Error: ' + e.message)
    }
  }

  return (
    <div className="fade-in">
      <SectionHeader title="💰 Punto de Venta" subtitle={'Pedidos ahora son para ' + dp.label} />
      <Banner>
        🕐 <strong>{new Date().toTimeString().slice(0, 5)}</strong> · Turno: <strong>{dp.turno}</strong> · Los pedidos registrados ahora son para <strong>{dp.label}</strong>
      </Banner>

      <div className={styles.posWrap}>
        {/* Columna productos */}
        <Card>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--txt2)', textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 4 }}>
              Cliente (opcional)
            </label>
            <select value={cliId} onChange={e => onChangeCli(e.target.value)}>
              <option value="">— Venta directa —</option>
              {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre} ({c.tipo})</option>)}
            </select>
          </div>
          <CardTitle>🛒 Selecciona productos</CardTitle>
          {loadingP ? <Loading /> : productos.length === 0 ? (
            <Empty icon="🍞" text="Añade productos primero" />
          ) : (
            <div className={styles.pgrid}>
              {productos.map(p => {
                const precio = getPrecio(p)
                const especial = cliId && precio !== p.precio
                return (
                  <button key={p.id} className={styles.pb} onClick={() => addToTicket(p)}>
                    <div className={styles.pbe}>{p.icono || getEmoji(p.categoria)}</div>
                    <div className={styles.pbn}>{p.nombre}</div>
                    <div className={styles.pbp} style={{ color: especial ? 'var(--ok)' : 'var(--pur)' }}>
                      {fmt(precio)}
                    </div>
                    {especial && <div className={styles.pbs}>💡 precio especial</div>}
                  </button>
                )
              })}
            </div>
          )}
        </Card>

        {/* Ticket */}
        <div className={styles.tck}>
          <div className={styles.tTitle}>🧾 Ticket</div>
          <div className={styles.tSub}>{cli ? `👤 ${cli.nombre} (${cli.tipo})` : 'Venta directa'}</div>

          <div className={styles.tItems}>
            {ticket.length === 0 ? (
              <Empty icon="🛒" text="Selecciona productos" />
            ) : ticket.map(item => (
              <div key={item.prodId} className={styles.tRow}>
                <span>{item.icono}</span>
                <span className={styles.tName}>{item.nombre}</span>
                <span className={styles.tQty}>
                  <button onClick={() => changeQty(item.prodId, -1)}>−</button>
                  <strong>{item.qty}</strong>
                  <button onClick={() => changeQty(item.prodId, 1)}>+</button>
                </span>
                <span className={styles.tPrice}>{fmt(item.precio * item.qty)}</span>
                <span className={styles.tDel} onClick={() => changeQty(item.prodId, -999)}>×</span>
              </div>
            ))}
          </div>

          <div className={styles.tTotal}>
            <span>TOTAL</span>
            <span>{fmt(total)}</span>
          </div>

          <Btn fullWidth onClick={() => registrar(false)} disabled={!ticket.length}>
            ✅ Cobrar ahora
          </Btn>
          <Btn variant="ghost" fullWidth onClick={() => registrar(true)} disabled={!ticket.length} style={{ marginTop: 5 }}>
            📋 Enviar como comanda
          </Btn>
          {ticket.length > 0 && (
            <Btn variant="ghost" fullWidth onClick={() => setTicket([])} size="sm" style={{ marginTop: 4, color: 'var(--txt3)' }}>
              🗑 Limpiar ticket
            </Btn>
          )}
        </div>
      </div>

      {/* Historial del día */}
      <Card>
        <CardTitle>📋 Ventas cobradas hoy</CardTitle>
        {loadingH ? <Loading /> : historial.length === 0 ? (
          <Empty icon="📋" text="Sin ventas cobradas hoy" />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>{['Hora','Cliente','Entrega','Productos','Total'].map(h => (
                  <th key={h} style={{ background: 'var(--pur)', color: '#fff', padding: '9px 11px', textAlign: 'left', fontSize: 10, letterSpacing: 1, textTransform: 'uppercase' }}>{h}</th>
                ))}</tr>
              </thead>
              <tbody>
                {historial.map(v => (
                  <tr key={v.id} style={{ borderBottom: '1px solid var(--bor)' }}>
                    <td style={{ padding: '9px 11px', color: 'var(--txt2)' }}>{(v.hora_registro || '').slice(0, 5)}</td>
                    <td style={{ padding: '9px 11px' }}>{v.cliente_nombre}</td>
                    <td style={{ padding: '9px 11px' }}><Tag color="blue">{labelFecha(v.fecha_entrega)}</Tag></td>
                    <td style={{ padding: '9px 11px', fontSize: 11, color: 'var(--txt2)' }}>
                      {(v.items || []).map(i => `${i.icono || ''}${i.nombre}×${i.qty}`).join(', ')}
                    </td>
                    <td style={{ padding: '9px 11px' }}><strong style={{ color: 'var(--pur)' }}>{fmt(v.total)}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
