// src/pages/InformesPage.jsx
// Informes para administradores: lo cobrado por fechas, por producto (con lo que se gana)
// y por cliente, más lo que está pendiente de pago. Se puede descargar para Excel.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { fmt, todayStr, sumarDias, getEmoji } from '../lib/utils'
import { Card, CardTitle, SectionHeader, Btn, StatCard, Grid4, Loading, Empty, FilterTabs } from '../components/ui'
import toast from 'react-hot-toast'

const PERIODOS = [
  { value: 'hoy', label: 'Hoy' },
  { value: 'semana', label: '7 días' },
  { value: 'mes', label: 'Este mes' },
  { value: 'mesPasado', label: 'Mes pasado' },
  { value: 'otro', label: 'Elegir fechas' },
]

function rango(periodo) {
  const hoy = todayStr()
  const [y, m] = hoy.split('-').map(Number)
  const p2 = n => String(n).padStart(2, '0')
  if (periodo === 'hoy') return [hoy, hoy]
  if (periodo === 'semana') return [sumarDias(hoy, -6), hoy]
  if (periodo === 'mes') return [`${y}-${p2(m)}-01`, hoy]
  const pm = m === 1 ? 12 : m - 1, py = m === 1 ? y - 1 : y
  return [`${py}-${p2(pm)}-01`, sumarDias(`${y}-${p2(m)}-01`, -1)]
}

// Supabase devuelve como mucho 1000 filas por consulta: se piden por páginas
async function todas(consulta) {
  const out = []
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await consulta().range(desde, desde + 999)
    if (error) throw error
    out.push(...data)
    if (data.length < 1000) return out
  }
}

const num = v => Number(v) || 0
const fechaCorta = f => new Date(f + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })

export default function InformesPage() {
  const [periodo, setPeriodo] = useState('mes')
  const [desde, setDesde] = useState(() => rango('mes')[0])
  const [hasta, setHasta] = useState(() => rango('mes')[1])
  const [datos, setDatos] = useState(null)
  const [costes, setCostes] = useState({})
  const [editCoste, setEditCoste] = useState({})

  useEffect(() => { if (periodo !== 'otro') { const [a, b] = rango(periodo); setDesde(a); setHasta(b) } }, [periodo])

  const cargar = useCallback(async () => {
    if (!desde || !hasta || desde > hasta) return
    setDatos(null)
    try {
      const [ventas, aCuenta, pend, prods, cst] = await Promise.all([
        todas(() => supabase.from('ventas').select('fecha_registro, cliente_id, cliente_nombre, items, total, tipo').gte('fecha_registro', desde).lte('fecha_registro', hasta).order('fecha_registro')),
        todas(() => supabase.from('comandas').select('cliente_id, cliente_nombre, total').eq('estado', 'a_cuenta')),
        todas(() => supabase.from('comandas').select('total').eq('estado', 'pendiente')),
        supabase.from('productos').select('id, nombre, icono, categoria, precio, activo').order('nombre'),
        supabase.from('productos_coste').select('producto_id, coste'),
      ])
      if (prods.error) throw prods.error
      if (cst.error) throw cst.error
      setCostes(Object.fromEntries(cst.data.map(c => [c.producto_id, num(c.coste)])))
      setDatos({ ventas, aCuenta, pend, prods: prods.data })
    } catch (e) { toast.error('Error cargando informes: ' + e.message); setDatos({ ventas: [], aCuenta: [], pend: [], prods: [] }) }
  }, [desde, hasta])
  useEffect(() => { cargar() }, [cargar])

  const r = useMemo(() => {
    if (!datos) return null
    const total = datos.ventas.reduce((s, v) => s + num(v.total), 0)
    const porDia = {}, porProd = {}, porCli = {}
    for (const v of datos.ventas) {
      porDia[v.fecha_registro] = (porDia[v.fecha_registro] || 0) + num(v.total)
      const k = v.cliente_id || 'directo'
      porCli[k] ??= { nombre: v.cliente_id ? v.cliente_nombre : 'Venta directa (mostrador)', total: 0, n: 0 }
      porCli[k].total += num(v.total); porCli[k].n++
      for (const it of v.items || []) {
        const q = num(it.qty); if (!q) continue
        porProd[it.prodId] ??= { id: it.prodId, nombre: it.nombre, icono: it.icono, uds: 0, euros: 0 }
        porProd[it.prodId].uds += q; porProd[it.prodId].euros += q * num(it.precio)
      }
    }
    const prodById = Object.fromEntries(datos.prods.map(p => [p.id, p]))
    const productos = Object.values(porProd).map(p => {
      const c = costes[p.id]
      const coste = c != null ? c * p.uds : null
      return { ...p, icono: p.icono || getEmoji(prodById[p.id]?.categoria), costeUd: c, coste, margen: coste != null ? p.euros - coste : null }
    }).sort((a, b) => b.euros - a.euros)
    const conCoste = productos.filter(p => p.margen != null)
    const deudores = {}
    for (const c of datos.aCuenta) { deudores[c.cliente_id] ??= { nombre: c.cliente_nombre, total: 0, n: 0 }; deudores[c.cliente_id].total += num(c.total); deudores[c.cliente_id].n++ }
    const dias = []
    for (let d = desde; d <= hasta && dias.length < 62; d = sumarDias(d, 1)) dias.push({ d, tot: porDia[d] || 0 })
    return {
      total, tickets: datos.ventas.length,
      fiado: datos.aCuenta.reduce((s, c) => s + num(c.total), 0),
      porEntregar: datos.pend.reduce((s, c) => s + num(c.total), 0), nPend: datos.pend.length,
      dias, max: Math.max(1, ...dias.map(x => x.tot)),
      productos, margen: conCoste.reduce((s, p) => s + p.margen, 0), ventasConCoste: conCoste.reduce((s, p) => s + p.euros, 0),
      clientes: Object.values(porCli).sort((a, b) => b.total - a.total),
      deudores: Object.values(deudores).sort((a, b) => b.total - a.total),
    }
  }, [datos, costes, desde, hasta])

  async function guardarCoste(id) {
    const txt = String(editCoste[id] ?? '').replace(',', '.').trim()
    const v = parseFloat(txt)
    if (txt === '') {
      const { error } = await supabase.from('productos_coste').delete().eq('producto_id', id)
      if (error) return toast.error('Error: ' + error.message)
      setCostes(c => { const n = { ...c }; delete n[id]; return n })
    } else {
      if (isNaN(v) || v < 0) return toast.error('Pon un coste válido, por ejemplo 0,35')
      const { error } = await supabase.from('productos_coste').upsert({ producto_id: id, coste: v, updated_at: new Date().toISOString() })
      if (error) return toast.error('Error: ' + error.message)
      setCostes(c => ({ ...c, [id]: v }))
    }
    setEditCoste(e => { const n = { ...e }; delete n[id]; return n })
    toast.success('Coste guardado')
  }

  function descargar() {
    if (!r) return
    const f = n => String(Math.round(n * 100) / 100).replace('.', ',')
    const filas = [
      [`Informe Productos MariSol del ${desde} al ${hasta}`], [],
      ['Total cobrado', f(r.total)], ['Tickets', r.tickets], ['Pendiente de pago (a cuenta de clientes)', f(r.fiado)], [],
      ['Por día'], ['Fecha', 'Cobrado'], ...r.dias.map(x => [x.d, f(x.tot)]), [],
      ['Por producto'], ['Producto', 'Unidades', 'Vendido €', 'Coste €', 'Ganancia €'],
      ...r.productos.map(p => [p.nombre, f(p.uds), f(p.euros), p.coste != null ? f(p.coste) : '', p.margen != null ? f(p.margen) : '']), [],
      ['Por cliente'], ['Cliente', 'Tickets', 'Total €'], ...r.clientes.map(c => [c.nombre, c.n, f(c.total)]),
    ]
    const csv = '﻿' + filas.map(l => l.map(x => `"${String(x ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    a.download = `informe-marisol-${desde}-a-${hasta}.csv`
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000)
  }

  const th = { background: 'var(--pur)', color: '#fff', padding: '8px 10px', textAlign: 'left', fontSize: 10, letterSpacing: 1, textTransform: 'uppercase' }
  const td = { padding: '8px 10px', borderBottom: '1px solid var(--bor)', fontSize: 13 }
  const tdn = { ...td, textAlign: 'right', whiteSpace: 'nowrap' }

  return (
    <div className="fade-in">
      <SectionHeader title="Informes" subtitle="Lo cobrado, lo que ganas con cada producto y lo que te deben"
        action={<Btn variant="gold" onClick={descargar} disabled={!r}>⬇️ Descargar (Excel)</Btn>} />
      <FilterTabs tabs={PERIODOS} active={periodo} onChange={setPeriodo} />
      {periodo === 'otro' && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', margin: '10px 0' }}>
          <label style={{ fontSize: 13 }}>Desde <input type="date" value={desde} max={hasta} onChange={e => setDesde(e.target.value)} /></label>
          <label style={{ fontSize: 13 }}>Hasta <input type="date" value={hasta} min={desde} onChange={e => setHasta(e.target.value)} /></label>
        </div>
      )}
      <p style={{ fontSize: 12, color: 'var(--txt2)', margin: '8px 0 12px' }}>Del {fechaCorta(desde)} al {fechaCorta(hasta)} · cuenta lo cobrado cada día (ventas de mostrador y comandas cobradas).</p>

      {!r ? <Loading /> : (<>
        <Grid4>
          <StatCard icon="💶" value={fmt(r.total)} label="Cobrado" diff={`${r.tickets} tickets · media ${fmt(r.tickets ? r.total / r.tickets : 0)}`} />
          <StatCard icon="📈" value={r.ventasConCoste ? fmt(r.margen) : '—'} label="Ganancia estimada" diff={r.ventasConCoste ? `${Math.round((r.margen / r.ventasConCoste) * 100)} % de lo vendido con coste` : 'Pon el coste de los productos abajo'} />
          <StatCard icon="🧾" value={fmt(r.fiado)} label="Pendiente de pago" diff={`${r.deudores.length} cliente(s) · a día de hoy`} />
          <StatCard icon="📋" value={fmt(r.porEntregar)} label="Comandas sin cobrar" diff={`${r.nPend} comanda(s) pendientes`} />
        </Grid4>

        {r.dias.length > 1 && (
          <Card style={{ marginTop: 14 }}>
            <CardTitle>📅 Cobrado por día</CardTitle>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 150, overflowX: 'auto', paddingTop: 16 }}>
              {r.dias.map(x => (
                <div key={x.d} title={`${fechaCorta(x.d)}: ${fmt(x.tot)}`} style={{ flex: '1 0 14px', display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end' }}>
                  <div style={{ width: '100%', height: `${Math.max(2, (x.tot / r.max) * 100)}%`, background: x.tot ? 'var(--gold)' : 'var(--bor)', borderRadius: '4px 4px 0 0' }} />
                  <span style={{ fontSize: 9, color: 'var(--txt3)', marginTop: 3 }}>{Number(x.d.slice(8))}</span>
                </div>
              ))}
            </div>
          </Card>
        )}

        <Card style={{ marginTop: 14 }}>
          <CardTitle>🥖 Por producto</CardTitle>
          <p style={{ fontSize: 12, color: 'var(--txt2)', marginTop: -4 }}>Escribe lo que te cuesta hacer <b>una unidad</b> (harina, luz, envase…) y verás lo que ganas. Solo lo ven los administradores.</p>
          {!r.productos.length ? <Empty text="No hay ventas en estas fechas" /> : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
                <thead><tr>{['Producto', 'Uds', 'Vendido', 'Coste/ud', 'Ganancia'].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
                <tbody>
                  {r.productos.map(p => (
                    <tr key={p.id}>
                      <td style={td}>{p.icono} {p.nombre}</td>
                      <td style={tdn}>{Math.round(p.uds * 100) / 100}</td>
                      <td style={tdn}><b>{fmt(p.euros)}</b></td>
                      <td style={tdn}>
                        <input inputMode="decimal" aria-label={'Coste por unidad de ' + p.nombre} placeholder="0,00"
                          value={editCoste[p.id] ?? (p.costeUd != null ? String(p.costeUd).replace('.', ',') : '')}
                          onChange={e => setEditCoste(c => ({ ...c, [p.id]: e.target.value }))}
                          onBlur={() => editCoste[p.id] !== undefined && guardarCoste(p.id)}
                          onKeyDown={e => e.key === 'Enter' && e.currentTarget.blur()}
                          style={{ width: 80, textAlign: 'right', padding: '5px 7px' }} />
                      </td>
                      <td style={{ ...tdn, color: p.margen == null ? 'var(--txt3)' : p.margen >= 0 ? 'var(--ok)' : 'var(--err)', fontWeight: 700 }}>
                        {p.margen == null ? '—' : `${fmt(p.margen)} (${p.euros ? Math.round((p.margen / p.euros) * 100) : 0} %)`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 14, marginTop: 14 }}>
          <Card>
            <CardTitle>👥 Por cliente</CardTitle>
            {!r.clientes.length ? <Empty text="Sin ventas" /> : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>{['Cliente', 'Tickets', 'Total'].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
                <tbody>{r.clientes.map(c => <tr key={c.nombre}><td style={td}>{c.nombre}</td><td style={tdn}>{c.n}</td><td style={tdn}><b>{fmt(c.total)}</b></td></tr>)}</tbody>
              </table>
            )}
          </Card>
          <Card>
            <CardTitle>🧾 Te deben (pendiente de pago)</CardTitle>
            {!r.deudores.length ? <p style={{ color: 'var(--ok)', fontWeight: 600 }}>✓ Nadie tiene nada pendiente.</p> : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>{['Cliente', 'Comandas', 'Debe'].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
                <tbody>{r.deudores.map(c => <tr key={c.nombre}><td style={td}>{c.nombre}</td><td style={tdn}>{c.n}</td><td style={{ ...tdn, color: 'var(--err)', fontWeight: 700 }}>{fmt(c.total)}</td></tr>)}</tbody>
              </table>
            )}
          </Card>
        </div>
      </>)}
    </div>
  )
}
