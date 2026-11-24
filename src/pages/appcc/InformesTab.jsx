// src/pages/appcc/InformesTab.jsx
// Informes en PDF por fechas para Sanidad (solo administradores).
import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { todayStr, sumarDias, fechaES, horaStr } from '../../lib/utils'
import { tareasDelDia, loteDe, fd, num, frecuenciaTxt, udsProduccion } from '../../lib/appcc'
import { Card, CardTitle, Btn, FormGroup } from '../../components/ui'
import toast from 'react-hot-toast'
import s from './appcc.module.css'

const SECCIONES = [
  ['temp', 'Temperaturas y medidas correctoras'],
  ['limp', 'Limpieza y desinfección (con revisiones mensuales)'],
  ['rec', 'Recepción de mercancía (albaranes, lotes y caducidades)'],
  ['prod', 'Producción y lotes del día (materias primas usadas)'],
  ['traza', 'Trazabilidad: a qué clientes fue cada lote'],
  ['stock', 'Recuentos de stock y productos retirados'],
  ['plan', 'Anexo: plan de limpieza y desinfección'],
]

export default function InformesTab() {
  const { user } = useAuth()
  const [desde, setDesde] = useState(sumarDias(todayStr(), -30))
  const [hasta, setHasta] = useState(todayStr())
  const [sec, setSec] = useState(Object.fromEntries(SECCIONES.map(([k]) => [k, true])))
  const [generando, setGenerando] = useState(false)

  async function generar() {
    if (desde > hasta) return toast.error('La fecha «desde» es posterior a «hasta»')
    setGenerando(true)
    try {
      const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
      const q = async (pr) => { const r = await pr; if (r.error) throw r.error; return r.data }
      const ini = desde + 'T00:00:00+02:00'; const fin = sumarDias(hasta, 1) + 'T02:00:00+02:00'
      const [equipos, temps, tareas, incid, verif, recep, prods, comandas, ventas, recuentos, retirados] = await Promise.all([
        q(supabase.from('appcc_equipos').select('*').order('orden')),
        sec.temp ? q(supabase.from('appcc_temperaturas').select('*').gte('fecha_hora', ini).lt('fecha_hora', fin).order('fecha_hora')) : [],
        q(supabase.from('limpieza_tareas').select('*').order('orden')),
        sec.limp ? q(supabase.from('limpieza_incidencias').select('*').gte('fecha', desde).lte('fecha', hasta)) : [],
        sec.limp ? q(supabase.from('limpieza_verificaciones').select('*').gte('fecha', desde).lte('fecha', hasta).order('fecha')) : [],
        sec.rec ? q(supabase.from('recepciones').select('*, lotes_mp(*, materias_primas(nombre,unidad))').gte('fecha', desde).lte('fecha', hasta).order('fecha')) : [],
        sec.prod ? q(supabase.from('produccion_diaria').select('id,fecha,productos, produccion_consumos(cantidad, materias_primas(nombre,unidad), lotes_mp(lote))').gte('fecha', desde).lte('fecha', hasta).order('fecha')) : [],
        sec.traza ? q(supabase.from('comandas').select('fecha_entrega,cliente_nombre,items').gte('fecha_entrega', desde).lte('fecha_entrega', hasta).not('cliente_id', 'is', null).order('fecha_entrega')) : [],
        sec.traza ? q(supabase.from('ventas').select('fecha_entrega,cliente_nombre,items,tipo').gte('fecha_entrega', desde).lte('fecha_entrega', hasta).not('cliente_id', 'is', null).neq('tipo', 'comanda_cobrada').order('fecha_entrega')) : [],
        sec.stock ? q(supabase.from('recuentos').select('*, stock_ajustes(cantidad, lotes_mp(lote, materias_primas(nombre,unidad)))').gte('fecha', desde).lte('fecha', hasta).order('fecha')) : [],
        sec.stock ? q(supabase.from('stock_terminados').select('*').eq('estado', 'retirado').gte('created_at', ini).order('created_at')) : [],
      ])

      const doc = new jsPDF({ unit: 'mm', format: 'a4' })
      const W = doc.internal.pageSize.getWidth(); const morado = [46, 42, 92]; const dorado = [209, 165, 62]
      let y = 50
      const sigY = () => (doc.lastAutoTable ? doc.lastAutoTable.finalY : y)
      const titulo = (t, sub) => {
        let yy = sigY() + 10; if (yy > 262) { doc.addPage(); yy = 20 }
        doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(...morado); doc.text(t, 14, yy)
        doc.setDrawColor(...dorado); doc.setLineWidth(0.6); doc.line(14, yy + 1.5, 40, yy + 1.5); doc.setTextColor(0); doc.setFont('helvetica', 'normal')
        if (sub) { doc.setFontSize(8); doc.text(sub, 14, yy + 6); yy += 5 }
        y = yy + 1; doc.lastAutoTable = null
      }
      const tabla = (head, body, extra = {}) => autoTable(doc, {
        head: [head], body: body.length ? body : [[{ content: 'Sin registros en este periodo', colSpan: head.length, styles: { fontStyle: 'italic', textColor: 120 } }]],
        startY: sigY() + 3, theme: 'grid', styles: { fontSize: 8, cellPadding: 1.6, valign: 'middle' }, headStyles: { fillColor: morado, textColor: 255 }, margin: { left: 14, right: 14 }, ...extra,
      })
      const rojo = col => ({ didParseCell: c => { if (c.section === 'body' && c.column.index === col && /FUERA|NO REALIZADA|Rechazado/.test(String(c.cell.raw))) { c.cell.styles.textColor = [181, 46, 30]; c.cell.styles.fontStyle = 'bold' } } })

      doc.setFillColor(...morado); doc.rect(0, 0, W, 26, 'F'); doc.setFillColor(...dorado); doc.rect(0, 26, W, 1.2, 'F')
      doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.text('Productos MariSol', 14, 12)
      doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.text('Registros del sistema de autocontrol (APPCC)', 14, 19)
      doc.setTextColor(0); doc.setFontSize(10)
      doc.text(`Periodo: del ${fd(desde)} al ${fd(hasta)}`, 14, 36)
      doc.text(`Generado el ${new Date().toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })} por ${user?.nombre || ''}`, 14, 42)

      const dias = []; for (let f = desde; f <= hasta; f = sumarDias(f, 1)) dias.push(f)
      const nEq = id => equipos.find(e => e.id === id)?.nombre || ''

      if (sec.temp) {
        titulo('1. Temperaturas de los equipos de frío', 'Rangos: refrigeración entre 0 y 4 °C; congelación a -18 °C o menos.')
        tabla(['Fecha', 'Hora', 'Equipo', 'Temperatura', 'Estado', 'Medida correctora', 'Registrado por'],
          temps.map(t => [fd(fechaES(new Date(t.fecha_hora))), horaStr(new Date(t.fecha_hora)), nEq(t.equipo_id), num(t.valor, 1) + ' °C', t.fuera_rango ? 'FUERA DE RANGO' : 'Correcta', t.correctora || '', t.usuario_nombre || (t.fuente === 'sensor' ? 'Sensor' : '')]),
          { ...rojo(4), columnStyles: { 5: { cellWidth: 45 } } })
      }
      if (sec.limp) {
        titulo('2. Limpieza y desinfección', 'Registro según el plan de limpieza; se anotan las tareas que no se realizaron.')
        const filas = []
        for (const f of dias) for (const t of tareasDelDia(tareas, f)) { const i = incid.find(x => x.tarea_id === t.id && x.fecha === f); filas.push([fd(f), t.nombre, i ? 'NO REALIZADA' : 'Realizada según el plan', i ? `${i.motivo} (${i.usuario_nombre})` : '']) }
        tabla(['Fecha', 'Qué', 'Estado', 'Observaciones'], filas, rojo(2))
        titulo('Revisiones mensuales del plan (verificación)')
        tabla(['Mes revisado', 'Fecha de firma', 'Responsable', 'Observaciones'], verif.map(v => [new Date(v.mes + '-15T12:00:00').toLocaleDateString('es-ES', { month: 'long', year: 'numeric' }), fd(v.fecha), v.usuario_nombre, v.observaciones]))
      }
      if (sec.rec) {
        titulo('3. Recepción de mercancía')
        const filas = []; recep.forEach(r => r.lotes_mp.forEach(l => filas.push([fd(r.fecha), r.proveedor_nombre, r.albaran || 's/n', l.materias_primas?.nombre, num(l.cantidad) + ' ' + (l.materias_primas?.unidad || ''), l.lote, l.caducidad ? fd(l.caducidad) : '', l.temperatura != null ? num(l.temperatura, 1) + ' °C' : '-', l.estado === 'aceptado' ? 'Aceptado' : 'Rechazado: ' + (l.motivo || ''), r.usuario_nombre])))
        tabla(['Fecha', 'Proveedor', 'Albarán', 'Producto', 'Cantidad', 'Lote', 'Caducidad', 'T.ª', 'Estado', 'Recibió'], filas, { styles: { fontSize: 7, cellPadding: 1.3 }, ...rojo(8) })
      }
      if (sec.prod) {
        titulo('4. Producción y lotes', 'Lote = fecha de fabricación (ddmmaaaa).')
        tabla(['Fecha', 'Lote', 'Productos fabricados', 'Materias primas usadas (lote: cantidad)'],
          prods.map(p => {
            const usados = {}; (p.produccion_consumos || []).forEach(c => { const k = `${c.materias_primas?.nombre} (${c.lotes_mp ? 'lote ' + c.lotes_mp.lote : 'sin stock'})`; usados[k] = (usados[k] || 0) + Number(c.cantidad) })
            return [fd(p.fecha), loteDe(p.fecha), (p.productos || []).filter(x => udsProduccion(x) > 0).map(x => `${x.nombre} x${udsProduccion(x)}`).join(', '), Object.entries(usados).map(([k, v]) => `${k}: ${num(v)}`).join('; ') || 'Sin consumos registrados']
          }), { styles: { fontSize: 7, cellPadding: 1.3 }, columnStyles: { 2: { cellWidth: 60 }, 3: { cellWidth: 75 } } })
      }
      if (sec.traza) {
        titulo('5. Trazabilidad hacia delante (clientes)', 'Venta directa al consumidor final en mostrador: exenta de registro de destino.')
        tabla(['Fecha', 'Lote', 'Cliente', 'Productos'], [...comandas, ...ventas].sort((a, b) => a.fecha_entrega.localeCompare(b.fecha_entrega))
          .map(x => [fd(x.fecha_entrega), loteDe(x.fecha_entrega), x.cliente_nombre, (x.items || []).filter(i => i.qty > 0).map(i => `${i.nombre} x${i.qty}`).join(', ')]), { columnStyles: { 3: { cellWidth: 95 } } })
      }
      if (sec.stock) {
        titulo('6. Recuentos de stock (ajustes por mermas)')
        const filas = []; recuentos.forEach(r => (r.stock_ajustes || []).forEach(a => filas.push([fd(r.fecha), a.lotes_mp?.materias_primas?.nombre, 'lote ' + a.lotes_mp?.lote, (a.cantidad > 0 ? '+' : '') + num(a.cantidad) + ' ' + (a.lotes_mp?.materias_primas?.unidad || ''), r.usuario_nombre, r.observaciones])))
        tabla(['Fecha', 'Materia prima', 'Lote', 'Ajuste', 'Responsable', 'Observaciones'], filas)
        titulo('Productos hechos retirados')
        tabla(['Fecha', 'Producto', 'Lote', 'Cantidad', 'Motivo', 'Responsable'], retirados.map(t => [fd(fechaES(new Date(t.created_at))), t.producto_nombre, loteDe(t.fecha_fabricacion), num(t.cantidad) + ' ' + t.unidad, t.motivo || '', t.usuario_nombre || '']))
      }
      if (sec.plan) {
        titulo('Anexo. Plan de limpieza y desinfección')
        tabla(['Qué', 'Frecuencia', 'Producto', 'Procedimiento'], tareas.filter(t => t.activo).map(t => [t.nombre, frecuenciaTxt(t.cada_dias), t.producto, t.procedimiento]), { styles: { fontSize: 7, cellPadding: 1.3 }, columnStyles: { 3: { cellWidth: 85 } } })
      }
      let yf = sigY() + 18; if (yf > 270) { doc.addPage(); yf = 30 }
      doc.setFontSize(9); doc.setDrawColor(120); doc.line(14, yf, 84, yf); doc.text('Firma del responsable', 14, yf + 5)
      const n = doc.getNumberOfPages()
      for (let p = 1; p <= n; p++) { doc.setPage(p); doc.setFontSize(7); doc.setTextColor(120); doc.text(`Productos MariSol · Registros APPCC ${fd(desde)} - ${fd(hasta)} · Página ${p} de ${n}`, W / 2, 290, { align: 'center' }) }
      doc.save(`APPCC-MariSol-${desde}_a_${hasta}.pdf`)
      toast.success('Informe descargado')
    } catch (e) { toast.error('No se pudo generar el informe: ' + e.message) }
    setGenerando(false)
  }

  const rapido = (n, t) => <button className={s.tab} onClick={() => { setDesde(sumarDias(todayStr(), -n)); setHasta(todayStr()) }}>{t}</button>
  return (
    <div className={s.stack}>
      <p className={s.muted} style={{ margin: 0 }}>Elige las fechas y qué incluir. Se descarga un PDF con todos los registros de ese periodo, listo para entregar a Sanidad.</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
        <Card>
          <CardTitle>Periodo</CardTitle>
          <div className={s.row} style={{ marginBottom: 10 }}>{rapido(7, 'Última semana')}{rapido(30, 'Último mes')}{rapido(90, 'Últimos 3 meses')}{rapido(365, 'Último año')}</div>
          <div className={s.row}><div className={s.grow}><FormGroup label="Desde"><input type="date" value={desde} max={todayStr()} onChange={e => setDesde(e.target.value)} /></FormGroup></div>
            <div className={s.grow}><FormGroup label="Hasta"><input type="date" value={hasta} max={todayStr()} onChange={e => setHasta(e.target.value)} /></FormGroup></div></div>
        </Card>
        <Card>
          <CardTitle>Qué incluir</CardTitle>
          <div className={s.list}>{SECCIONES.map(([k, t]) => (
            <label key={k} className={s.item} style={{ cursor: 'pointer' }}><input type="checkbox" checked={sec[k]} onChange={e => setSec({ ...sec, [k]: e.target.checked })} style={{ width: 20, height: 20 }} /><span className={s.grow}>{t}</span></label>))}</div>
        </Card>
      </div>
      <Btn variant="gold" fullWidth onClick={generar} disabled={generando}>{generando ? 'Preparando el informe…' : '📄 Descargar informe en PDF'}</Btn>
    </div>
  )
}
