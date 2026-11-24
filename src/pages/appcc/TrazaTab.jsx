// src/pages/appcc/TrazaTab.jsx
// Trazabilidad: un paso atrás (de qué proveedor/lote vino) y un paso adelante (a qué clientes fue).
// Venta directa al público en mostrador: exenta de registrar el destino.
import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { todayStr } from '../../lib/utils'
import { loteDe, fd, num } from '../../lib/appcc'
import { Card, CardTitle, Loading, Tag, FormGroup } from '../../components/ui'
import toast from 'react-hot-toast'
import s from './appcc.module.css'

// Ventas a empresas (con cliente) de un día: comandas + ventas directas a clientes (sin duplicar las comandas cobradas)
async function salidasDelDia(fecha) {
  const [c, v] = await Promise.all([
    supabase.from('comandas').select('cliente_nombre,items,cliente_id').eq('fecha_entrega', fecha).not('cliente_id', 'is', null),
    supabase.from('ventas').select('cliente_nombre,items,cliente_id,tipo').eq('fecha_entrega', fecha).not('cliente_id', 'is', null).neq('tipo', 'comanda_cobrada'),
  ])
  if (c.error || v.error) throw (c.error || v.error)
  return [...c.data, ...v.data]
}

export default function TrazaTab() {
  const [lotes, setLotes] = useState(null)
  const [modo, setModo] = useState('mp')
  const [sel, setSel] = useState('')
  const [fecha, setFecha] = useState(todayStr())
  const [res, setRes] = useState(null)
  const [cargando, setCargando] = useState(false)

  useEffect(() => {
    supabase.from('lotes_mp').select('id,lote,caducidad,origen,created_at,materia_id,materias_primas(nombre)').order('created_at', { ascending: false }).limit(300)
      .then(({ data, error }) => { if (error) toast.error('Error: ' + error.message); setLotes(data || []) })
  }, [])

  useEffect(() => {
    let vivo = true
    async function buscar() {
      setRes(null)
      try {
        if (modo === 'mp' && sel) {
          setCargando(true)
          const { data: l, error } = await supabase.from('lotes_mp').select('*, materias_primas(nombre,unidad), recepciones(*)').eq('id', sel).single()
          if (error) throw error
          const { data: cons } = await supabase.from('produccion_consumos').select('cantidad, produccion_diaria(id,fecha,productos)').eq('lote_id', sel)
          const { data: rec } = await supabase.from('recetas').select('producto_id, productos(nombre)').eq('materia_id', l.materia_id)
          const prodsConMateria = new Set((rec || []).map(r => (r.productos?.nombre || '').toUpperCase()))
          const porProd = {}
          for (const c of cons || []) { const p = c.produccion_diaria; (porProd[p.id] ||= { fecha: p.fecha, q: 0 }).q += Number(c.cantidad) }
          const producciones = Object.values(porProd).sort((a, b) => a.fecha.localeCompare(b.fecha))
          const clientes = []
          for (const p of producciones) for (const sa of await salidasDelDia(p.fecha)) {
            const its = (sa.items || []).filter(i => i.qty > 0 && (prodsConMateria.size === 0 || prodsConMateria.has((i.nombre || '').toUpperCase())))
            if (its.length) clientes.push({ fecha: p.fecha, cliente: sa.cliente_nombre, its })
          }
          if (vivo) setRes({ tipo: 'mp', l, producciones, clientes, sinReceta: prodsConMateria.size === 0 })
        } else if (modo === 'prod' && fecha) {
          setCargando(true)
          const { data: p, error } = await supabase.from('produccion_diaria').select('id,fecha,productos').eq('fecha', fecha).maybeSingle()
          if (error) throw error
          let usados = []
          if (p) {
            const { data } = await supabase.from('produccion_consumos').select('cantidad, materias_primas(nombre,unidad), lotes_mp(lote, caducidad, origen, recepciones(proveedor_nombre, albaran, fecha))').eq('produccion_id', p.id)
            usados = data || []
          }
          const salidas = await salidasDelDia(fecha)
          if (vivo) setRes({ tipo: 'prod', p, usados, salidas })
        }
      } catch (e) { toast.error('Error: ' + e.message) }
      if (vivo) setCargando(false)
    }
    buscar(); return () => { vivo = false }
  }, [modo, sel, fecha])

  if (!lotes) return <Loading />
  return (
    <div className={s.stack}>
      <Card>
        <div className={s.row} style={{ marginBottom: 10 }}>
          <button className={`${s.tab} ${modo === 'mp' ? s.tabOn : ''}`} onClick={() => setModo('mp')}>Por lote de materia prima</button>
          <button className={`${s.tab} ${modo === 'prod' ? s.tabOn : ''}`} onClick={() => setModo('prod')}>Por lote de producción (fecha)</button>
        </div>
        {modo === 'mp' ? (
          <FormGroup label="Lote de materia prima"><select value={sel} onChange={e => setSel(e.target.value)}><option value="">Elige un lote…</option>
            {lotes.map(l => <option key={l.id} value={l.id}>{l.materias_primas?.nombre} · lote {l.lote}{l.caducidad ? ' · cad. ' + fd(l.caducidad) : ''}</option>)}</select></FormGroup>
        ) : (
          <FormGroup label="Fecha de fabricación"><input type="date" value={fecha} max={todayStr()} onChange={e => setFecha(e.target.value)} /> <span className={s.muted}>Lote {loteDe(fecha)}</span></FormGroup>
        )}
        <p className={s.muted} style={{ margin: 0 }}>Un paso atrás (de qué proveedor vino) y un paso adelante (a qué clientes fue). La venta en mostrador al público no necesita registrar el destino.</p>
      </Card>

      {cargando && <Loading text="Buscando…" />}
      {res?.tipo === 'mp' && (
        <Card>
          <CardTitle>{res.l.materias_primas?.nombre} · lote {res.l.lote}</CardTitle>
          <h3 style={{ fontSize: 14, margin: '0 0 6px' }}>1 · De dónde vino</h3>
          {res.l.recepciones ? <p style={{ margin: '0 0 12px' }}>{res.l.recepciones.proveedor_nombre} · albarán {res.l.recepciones.albaran || 's/n'} · recibido el {fd(res.l.recepciones.fecha)} por {res.l.recepciones.usuario_nombre} · {num(res.l.cantidad)} {res.l.materias_primas?.unidad}{res.l.caducidad ? ' · caduca ' + fd(res.l.caducidad) : ''}</p>
            : <p style={{ margin: '0 0 12px' }}>{res.l.origen === 'inventario' ? 'Existencias del inventario de arranque' : 'Ajuste de recuento'} · {num(res.l.cantidad)} {res.l.materias_primas?.unidad}</p>}
          <h3 style={{ fontSize: 14, margin: '0 0 6px' }}>2 · En qué producciones se usó</h3>
          {res.producciones.length === 0 ? <p className={s.muted}>Todavía no se ha usado.</p> : <div className={s.list} style={{ marginBottom: 12 }}>{res.producciones.map(p => <div key={p.fecha} className={s.item}><b>Lote {loteDe(p.fecha)}</b><span className={s.muted}>{fd(p.fecha)} · {num(p.q)} {res.l.materias_primas?.unidad}</span></div>)}</div>}
          <h3 style={{ fontSize: 14, margin: '0 0 6px' }}>3 · A qué clientes fue</h3>
          {res.clientes.length === 0 ? <p className={s.muted}>Sin ventas a empresas asociadas.</p> : <div className={s.list}>{res.clientes.map((c, i) => <div key={i} className={s.item}><span className={s.grow}><b>{c.cliente}</b> <span className={s.muted}>· {fd(c.fecha)} · lote {loteDe(c.fecha)}</span><div className={s.muted}>{c.its.map(x => x.nombre + ' × ' + x.qty).join(', ')}</div></span></div>)}</div>}
          {res.clientes.length > 0 && <div className={s.note} style={{ marginTop: 10 }}>Si hubiera una alerta sanitaria con este lote, estos son los clientes a los que avisar.</div>}
          {res.sinReceta && <div className={s.note} style={{ marginTop: 10 }}>No se ha podido saber qué productos llevan esta materia prima (faltan recetas, o solo las ven los administradores), así que se muestran todos los clientes de esos días.</div>}
        </Card>
      )}
      {res?.tipo === 'prod' && (
        <Card>
          <CardTitle>Producción del {fd(fecha)} · lote {loteDe(fecha)}</CardTitle>
          {!res.p ? <p className={s.muted}>No hay hoja de producción de ese día.</p> : (<>
            <h3 style={{ fontSize: 14, margin: '0 0 6px' }}>1 · Materias primas usadas</h3>
            {res.usados.length === 0 ? <p className={s.muted}>No hay consumos registrados (faltan recetas o es anterior al APPCC).</p> :
              <div className={s.list} style={{ marginBottom: 12 }}>{res.usados.map((u, i) => <div key={i} className={s.item}><span className={s.grow}><b>{u.materias_primas?.nombre}</b> · {num(u.cantidad)} {u.materias_primas?.unidad}<div className={s.muted}>{u.lotes_mp ? `Lote ${u.lotes_mp.lote}` + (u.lotes_mp.recepciones ? ` · ${u.lotes_mp.recepciones.proveedor_nombre}, albarán ${u.lotes_mp.recepciones.albaran || 's/n'}` : ' · existencias iniciales') : <span style={{ color: 'var(--err)' }}>Sin stock registrado</span>}</div></span></div>)}</div>}
            <h3 style={{ fontSize: 14, margin: '0 0 6px' }}>2 · Qué se hizo</h3>
            <p style={{ margin: '0 0 12px' }}>{(res.p.productos || []).filter(x => x.cocidas || x.masa).map(x => `${x.nombre} × ${x.cocidas || x.masa}`).join(', ') || '—'}</p>
          </>)}
          <h3 style={{ fontSize: 14, margin: '0 0 6px' }}>3 · A qué clientes fue</h3>
          {res.salidas.length === 0 ? <p className={s.muted}>Sin ventas a empresas ese día.</p> : <div className={s.list}>{res.salidas.map((sa, i) => <div key={i} className={s.item}><span className={s.grow}><b>{sa.cliente_nombre}</b><div className={s.muted}>{(sa.items || []).filter(x => x.qty > 0).map(x => x.nombre + ' × ' + x.qty).join(', ')}</div></span></div>)}</div>}
        </Card>
      )}
      {!res && !cargando && <Tag color="gray">Elige un lote para ver de dónde vino y a dónde fue</Tag>}
    </div>
  )
}
