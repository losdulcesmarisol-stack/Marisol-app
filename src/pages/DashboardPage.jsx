// src/pages/DashboardPage.jsx
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { fmt, todayStr, getDiaPanadero } from '../lib/utils'
import { Card, CardTitle, Grid2, Grid4, StatCard, Banner, Loading, Empty } from '../components/ui'

export default function DashboardPage() {
  const [stats, setStats] = useState({ ventas: 0, pedidos: 0, comandas: 0, clientes: 0 })
  const [statsAyer, setStatsAyer] = useState({ ventas: 0, pedidos: 0 })
  const [chart, setChart] = useState([])
  const [topProds, setTopProds] = useState([])
  const [pendElabH, setPendElabH] = useState([])
  const [alertas, setAlertas] = useState([])
  const [loading, setLoading] = useState(true)
  const dp = getDiaPanadero()

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const hoy = todayStr()
    const ayer = (() => { const d = new Date(); d.setDate(d.getDate()-1); return d.toISOString().slice(0,10) })()
    const man  = (() => { const d = new Date(); d.setDate(d.getDate()+1); return d.toISOString().slice(0,10) })()

    const [vHoy, vAyer, pend, nCli] = await Promise.all([
      supabase.from('ventas').select('total,items').eq('fecha_registro', hoy),
      supabase.from('ventas').select('total').eq('fecha_registro', ayer),
      supabase.from('comandas').select('*').eq('estado', 'pendiente'),
      supabase.from('clientes').select('*', { count: 'exact', head: true }).eq('activo', true),
    ])

    const tH = (vHoy.data||[]).reduce((s,v) => s + parseFloat(v.total||0), 0)
    const tA = (vAyer.data||[]).reduce((s,v) => s + parseFloat(v.total||0), 0)
    setStats({ ventas: tH, pedidos: (vHoy.data||[]).length, comandas: (pend.data||[]).length, clientes: nCli.count||0 })
    setStatsAyer({ ventas: tA, pedidos: (vAyer.data||[]).length })

    // Chart 7 días
    const dias = []
    for (let i = 6; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate()-i); dias.push(d.toISOString().slice(0,10)) }
    const chartRes = await Promise.all(dias.map(d => supabase.from('ventas').select('total').eq('fecha_registro', d)))
    const tots = chartRes.map(r => (r.data||[]).reduce((s,v) => s+parseFloat(v.total||0), 0))
    const max = Math.max(...tots, 1)
    const lbls = ['Lu','Ma','Mi','Ju','Vi','Sá','Do']
    setChart(dias.map((d,i) => ({ dia: d, tot: tots[i], h: Math.max((tots[i]/max)*100, tots[i]>0?5:2), lbl: lbls[new Date(d+'T12:00:00').getDay()], esHoy: d===hoy })))

    // Top productos hoy
    const pm = {}
    ;(vHoy.data||[]).forEach(v => (v.items||[]).forEach(i => {
      const k = i.prodId
      if (!k) return
      if (!pm[k]) pm[k] = { nom: i.nombre||i.nom, ico: i.icono||i.ico, qty: 0, tot: 0 }
      pm[k].qty += i.qty
      pm[k].tot += (i.precio||i.pr||0) * i.qty
    }))
    setTopProds(Object.values(pm).sort((a,b) => b.tot - a.tot).slice(0, 6))

    // Pendientes de elaborar (hoy o mañana)
    const prox = (pend.data||[]).filter(c => c.fecha_entrega === hoy || c.fecha_entrega === man)
    const res = {}
    prox.forEach(c => (c.items||[]).forEach(i => {
      const k = i.prodId
      if (!k) return
      if (!res[k]) res[k] = { nom: i.nombre||i.nom, ico: i.icono||i.ico, qty: 0 }
      res[k].qty += i.qty
    }))
    setPendElabH({ count: prox.length, items: Object.values(res) })

    // Alertas de precios
    await loadAlertas()
    setLoading(false)
  }

  async function loadAlertas() {
    const { data } = await supabase.from('facturas').select('*').order('fecha_factura')
    if (!data?.length) return
    const hist = {}
    data.forEach(f => (f.items||[]).forEach(i => {
      const k = (i.nombre||'').toLowerCase().trim()
      if (!k || !i.precio_unit) return
      if (!hist[k]) hist[k] = []
      hist[k].push({ precio: i.precio_unit, fecha: f.fecha_factura, prov: f.proveedor_nombre, nombre: i.nombre })
    }))
    const al = []
    Object.values(hist).forEach(entries => {
      if (entries.length < 2) return
      const sorted = [...entries].sort((a,b) => a.fecha.localeCompare(b.fecha))
      const ant = sorted[sorted.length-2], ult = sorted[sorted.length-1]
      if (ult.precio === ant.precio) return
      const pct = ((ult.precio - ant.precio) / ant.precio * 100).toFixed(1)
      al.push({ nombre: ult.nombre, ant: ant.precio, ult: ult.precio, pct, prov: ult.prov, sube: ult.precio > ant.precio })
    })
    setAlertas(al)
  }

  const diffV = statsAyer.ventas > 0 ? ((stats.ventas - statsAyer.ventas) / statsAyer.ventas * 100).toFixed(0) : null
  const diffP = statsAyer.pedidos

  return (
    <div className="fade-in">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 9 }}>
        <div>
          <h2 style={{ fontFamily: "'Playfair Display',serif", fontSize: 22 }} id="saludo">
            {dp.turno === 'tarde' ? 'Buenas tardes ☀️' : dp.turno === 'noche' ? 'Buenas noches 🌙' : 'Buenos días 🌅'}, Marisol
          </h2>
          <p style={{ fontSize: 12, color: 'var(--txt3)', marginTop: 2 }}>
            {new Date().toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>
      </div>

      <Banner>
        🕐 <strong>{new Date().toTimeString().slice(0, 5)}</strong> · Turno: <strong>{dp.turno}</strong> · Pedidos de ahora son para <strong>{dp.label}</strong>
      </Banner>

      {loading ? <Loading /> : (
        <>
          <Grid4 style={{ marginBottom: 14 }}>
            <StatCard icon="💶" value={fmt(stats.ventas)} label="Ventas hoy"
              diff={diffV !== null ? `${stats.ventas >= statsAyer.ventas ? '▲' : '▼'} ${Math.abs(diffV)}% vs ayer` : '— sin datos de ayer'}
              diffUp={diffV !== null ? stats.ventas >= statsAyer.ventas : undefined}
            />
            <StatCard icon="🛍️" value={stats.pedidos} label="Pedidos cobrados"
              diff={`${diffP} pedidos ayer`}
            />
            <StatCard icon="📋" value={stats.comandas} label="Comandas pendientes"
              diff="por cobrar"
            />
            <StatCard icon="👥" value={stats.clientes} label="Clientes" diff="registrados" />
          </Grid4>

          <Grid2>
            {/* Chart */}
            <Card>
              <CardTitle>📈 Ventas esta semana</CardTitle>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 5, height: 110 }}>
                {chart.map((d, i) => (
                  <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, height: '100%', justifyContent: 'flex-end' }}>
                    <div
                      title={fmt(d.tot)}
                      style={{
                        width: '100%', borderRadius: '4px 4px 0 0',
                        height: d.h + '%', minHeight: d.tot > 0 ? 5 : 2,
                        background: d.esHoy ? 'var(--pur)' : 'var(--purbg)',
                        border: '1px solid ' + (d.esHoy ? 'var(--purd)' : 'var(--bor2)'),
                        cursor: 'pointer', transition: 'height .5s'
                      }}
                    />
                    <span style={{ fontSize: 9, color: 'var(--txt3)', fontWeight: 600 }}>{d.lbl}</span>
                  </div>
                ))}
              </div>
            </Card>

            {/* Top productos */}
            <Card>
              <CardTitle>🥇 Más vendido hoy</CardTitle>
              {topProds.length === 0 ? (
                <Empty icon="🍞" text="Registra ventas para ver el resumen" />
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr>{['Producto','Uds','Total'].map(h => <th key={h} style={{ background:'var(--pur)',color:'#fff',padding:'7px 10px',textAlign:'left',fontSize:10,letterSpacing:1,textTransform:'uppercase' }}>{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {topProds.map((p, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--bor)' }}>
                        <td style={{ padding: '8px 10px' }}>{p.ico} {p.nom}</td>
                        <td style={{ padding: '8px 10px' }}>{p.qty}</td>
                        <td style={{ padding: '8px 10px' }}><strong style={{ color: 'var(--pur)' }}>{fmt(p.tot)}</strong></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>
          </Grid2>

          {/* Pedidos de elaborar */}
          <Card style={{ marginTop: 14 }}>
            <CardTitle>🌙 Pendientes de elaborar esta noche</CardTitle>
            {!pendElabH.count ? (
              <Empty icon="😴" text="Sin pedidos pendientes" />
            ) : (
              <>
                <p style={{ fontSize: 12, color: 'var(--txt2)', marginBottom: 10 }}>
                  <strong style={{ color: 'var(--pur)' }}>{pendElabH.count} comanda(s)</strong> pendientes. Necesitas elaborar:
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {pendElabH.items.map((r, i) => (
                    <div key={i} style={{ background:'var(--purbg)',border:'1px solid var(--bor2)',borderRadius:10,padding:'10px 14px',textAlign:'center',minWidth:80 }}>
                      <div style={{ fontSize: 22 }}>{r.ico || '🍞'}</div>
                      <div style={{ fontWeight: 600, fontSize: 12 }}>{r.nom}</div>
                      <div style={{ fontSize: 20, fontFamily:"'Playfair Display',serif", color:'var(--pur)' }}>{r.qty}</div>
                      <div style={{ fontSize: 10, color: 'var(--txt3)' }}>uds</div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </Card>

          {/* Alertas precios */}
          <Card style={{ marginTop: 14 }}>
            <CardTitle>🔔 Alertas de precios de proveedores</CardTitle>
            {alertas.length === 0 ? (
              <Empty icon="✅" text="Sin alertas de precio" />
            ) : alertas.map((a, i) => (
              <div key={i} style={{
                display:'flex',alignItems:'center',gap:8,padding:'8px 11px',borderRadius:'var(--r)',fontSize:12,marginBottom:5,
                background: a.sube ? 'rgba(181,46,30,.06)' : 'rgba(42,122,72,.06)',
                border: `1px solid ${a.sube ? 'rgba(181,46,30,.18)' : 'rgba(42,122,72,.18)'}`,
                color: a.sube ? 'var(--err)' : 'var(--ok)'
              }}>
                <span style={{ fontSize: 17 }}>{a.sube ? '📈' : '📉'}</span>
                <div>
                  <strong>{a.nombre}</strong> ({a.prov}): {fmt(a.ant)} → <strong>{fmt(a.ult)}</strong>
                  <span style={{ fontWeight: 700, marginLeft: 6 }}>{a.sube ? '+' : ''}{a.pct}%</span>
                </div>
              </div>
            ))}
          </Card>
        </>
      )}
    </div>
  )
}
