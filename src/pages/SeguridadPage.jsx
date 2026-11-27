// src/pages/SeguridadPage.jsx
// Solo administradores: quién ha cambiado qué (historial) y copias de seguridad.
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { fmt } from '../lib/utils'
import { Card, CardTitle, SectionHeader, Btn, Loading, Empty, FilterTabs } from '../components/ui'
import toast from 'react-hot-toast'

const TABLAS = {
  comandas: '📋 Comanda', ventas: '💰 Venta', clientes: '👥 Cliente', productos: '🍞 Producto',
  proveedores: '🚚 Proveedor', facturas: '🧾 Factura', albaranes: '📄 Albarán', usuarios: '⚙️ Usuario',
  pedidos_fijos: '🔁 Pedido fijo', productos_coste: '📈 Coste', produccion_diaria: '🏭 Producción',
}
const ACCION = { crear: ['Creado', 'var(--ok)'], cambiar: ['Cambiado', 'var(--inf)'], borrar: ['Borrado', 'var(--err)'] }
const CAMPOS = {
  estado: 'estado', total: 'total', items: 'productos', fecha_entrega: 'fecha de entrega', fecha_cobro: 'fecha de cobro',
  nombre: 'nombre', precio: 'precio', activo: 'activo', telefono: 'teléfono', direccion: 'dirección', nif: 'NIF',
  notas: 'notas', notas_panadero: 'nota al panadero', precios_especiales: 'precios especiales', rol: 'rol',
  dias: 'días', coste: 'coste', categoria: 'categoría', tipo: 'tipo', inicio: 'pantalla de inicio', email: 'email',
}
const IGNORAR = new Set(['id', 'created_at', 'updated_at', 'hora_registro', 'fecha_registro'])

const fechaHora = t => new Date(t).toLocaleString('es-ES', { timeZone: 'Europe/Madrid', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
function valor(k, v) {
  if (v == null || v === '') return '—'
  if (k === 'items' && Array.isArray(v)) return v.filter(i => Number(i.qty) > 0).map(i => `${i.nombre} × ${i.qty}`).join(', ') || '—'
  if (k === 'total' || k === 'precio' || k === 'coste') return fmt(v)
  if (typeof v === 'boolean') return v ? 'sí' : 'no'
  if (typeof v === 'object') return Array.isArray(v) ? v.join(', ') : `${Object.keys(v).length} elemento(s)`
  return String(v)
}
function nombreFila(r) {
  const d = r.despues || r.antes || {}
  return d.nombre || d.cliente_nombre || (d.fecha ? 'del ' + d.fecha : '') || ''
}
function cambios(r) {
  if (r.accion !== 'cambiar') return []
  const out = []
  for (const k of Object.keys({ ...r.antes, ...r.despues })) {
    if (IGNORAR.has(k)) continue
    if (JSON.stringify(r.antes?.[k]) !== JSON.stringify(r.despues?.[k])) out.push([CAMPOS[k] || k.replace(/_/g, ' '), valor(k, r.antes?.[k]), valor(k, r.despues?.[k])])
  }
  return out
}

const POR_PAGINA = 50

export default function SeguridadPage() {
  const [tab, setTab] = useState('historial')
  return (
    <div className="fade-in">
      <SectionHeader title="Historial y copias" subtitle="Quién ha cambiado qué, y copias de seguridad de todos los datos" />
      <FilterTabs tabs={[{ value: 'historial', label: '🕘 Historial de cambios' }, { value: 'copias', label: '💾 Copias de seguridad' }]} active={tab} onChange={setTab} />
      <div style={{ marginTop: 12 }}>{tab === 'historial' ? <Historial /> : <Copias />}</div>
    </div>
  )
}

function Historial() {
  const [filas, setFilas] = useState(null)
  const [tabla, setTabla] = useState('')
  const [pagina, setPagina] = useState(0)
  const [hayMas, setHayMas] = useState(false)

  const cargar = useCallback(async () => {
    setFilas(null)
    let q = supabase.from('historial_cambios').select('*').order('cuando', { ascending: false }).range(pagina * POR_PAGINA, pagina * POR_PAGINA + POR_PAGINA)
    if (tabla) q = q.eq('tabla', tabla)
    const { data, error } = await q
    if (error) { toast.error('Error: ' + error.message); setFilas([]); return }
    setHayMas(data.length > POR_PAGINA)
    setFilas(data.slice(0, POR_PAGINA))
  }, [tabla, pagina])
  useEffect(() => { cargar() }, [cargar])

  return (
    <Card>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
        <select value={tabla} onChange={e => { setTabla(e.target.value); setPagina(0) }} style={{ maxWidth: 240 }} aria-label="Qué mostrar">
          <option value="">Todo</option>
          {Object.entries(TABLAS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <span style={{ fontSize: 12, color: 'var(--txt3)' }}>Se guarda desde el 27 de noviembre de 2026, durante 2 años. Los PIN nunca se guardan.</span>
      </div>
      {!filas ? <Loading /> : !filas.length ? <Empty text="Todavía no hay cambios apuntados" /> : (
        <div style={{ display: 'grid', gap: 6 }}>
          {filas.map(r => {
            const [txt, color] = ACCION[r.accion]
            const cs = cambios(r)
            return (
              <div key={r.id} style={{ border: '1px solid var(--bor)', borderRadius: 'var(--r)', padding: '8px 12px', fontSize: 13 }}>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'baseline' }}>
                  <span style={{ color: 'var(--txt3)', fontSize: 12, minWidth: 110 }}>{fechaHora(r.cuando)}</span>
                  <b style={{ color }}>{txt}</b>
                  <span>{TABLAS[r.tabla] || r.tabla} <b>{nombreFila(r)}</b></span>
                  <span style={{ marginLeft: 'auto', color: 'var(--txt2)', fontSize: 12 }}>por {r.usuario_nombre}</span>
                </div>
                {cs.length > 0 && (
                  <ul style={{ margin: '4px 0 0 18px', color: 'var(--txt2)', fontSize: 12 }}>
                    {cs.map(([k, a, d]) => <li key={k}><b>{k}</b>: {a} → <span style={{ color: 'var(--txt)' }}>{d}</span></li>)}
                  </ul>
                )}
                {r.accion === 'borrar' && r.antes?.total != null && <div style={{ fontSize: 12, color: 'var(--txt2)', marginTop: 3 }}>{valor('items', r.antes.items)} · {fmt(r.antes.total)}</div>}
              </div>
            )
          })}
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10 }}>
        <Btn variant="ghost" size="sm" disabled={pagina === 0} onClick={() => setPagina(p => p - 1)}>← Más recientes</Btn>
        <Btn variant="ghost" size="sm" disabled={!hayMas} onClick={() => setPagina(p => p + 1)}>Más antiguos →</Btn>
      </div>
    </Card>
  )
}

function Copias() {
  const [copias, setCopias] = useState(null)
  const [ocupado, setOcupado] = useState(false)

  const cargar = useCallback(async () => {
    const { data, error } = await supabase.rpc('listar_copias')
    if (error) { toast.error('Error: ' + error.message); setCopias([]); return }
    setCopias(data)
  }, [])
  useEffect(() => { cargar() }, [cargar])

  async function hacerAhora() {
    setOcupado(true)
    const { error } = await supabase.rpc('hacer_copia_seguridad', { p_origen: 'hecha a mano' })
    setOcupado(false)
    if (error) return toast.error('Error: ' + error.message)
    toast.success('Copia hecha'); cargar()
  }

  async function descargar(c) {
    setOcupado(true)
    const { data, error } = await supabase.rpc('descargar_copia', { p_id: c.id })
    setOcupado(false)
    if (error || !data) return toast.error('Error: ' + (error?.message || 'no encontrada'))
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }))
    a.download = `copia-marisol-${new Date(c.creada).toISOString().slice(0, 10)}.json`
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000)
  }

  return (
    <Card>
      <CardTitle action={<Btn variant="gold" size="sm" onClick={hacerAhora} disabled={ocupado}>💾 Hacer copia ahora</Btn>}>Copias guardadas</CardTitle>
      <p style={{ fontSize: 13, color: 'var(--txt2)', marginTop: -4 }}>
        Cada noche se hace sola una copia de todo (ventas, comandas, clientes, productos, proveedores, producción…). Se guardan las de los últimos 30 días.
        Una vez al mes, descarga una y guárdala en el ordenador o mándatela por correo: así tienes una copia también fuera de la app.
      </p>
      {!copias ? <Loading /> : !copias.length ? <Empty text="Todavía no hay copias" /> : (
        <div style={{ display: 'grid', gap: 6 }}>
          {copias.map(c => (
            <div key={c.id} style={{ display: 'flex', gap: 10, alignItems: 'center', border: '1px solid var(--bor)', borderRadius: 'var(--r)', padding: '8px 12px', flexWrap: 'wrap' }}>
              <b style={{ minWidth: 150 }}>{fechaHora(c.creada)}</b>
              <span style={{ fontSize: 12, color: 'var(--txt2)', flex: 1 }}>{c.origen} · {c.filas.toLocaleString('es-ES')} registros · {c.tamano}</span>
              <Btn variant="ghost" size="sm" onClick={() => descargar(c)} disabled={ocupado}>⬇️ Descargar</Btn>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}
