// src/pages/ComandasPage.jsx
import { useState, useEffect, useCallback } from 'react'
import { useOutletContext } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { fmt, todayStr, labelFecha } from '../lib/utils'
import { SectionHeader, FilterTabs, Loading, Empty, Btn, Modal, ModalFooter, Tag } from '../components/ui'
import toast from 'react-hot-toast'

const FILTROS = [
  { value: 'pend', label: '⏳ Pendientes' },
  { value: 'todas', label: '📁 Todas' },
  { value: 'cobradas', label: '✅ Cobradas' },
]

export default function ComandasPage() {
  const { refreshPendientes } = useOutletContext()
  const [filtro, setFiltro] = useState('pend')
  const [comandas, setComandas] = useState([])
  const [loading, setLoading] = useState(true)
  const [cobrarId, setCobrarId] = useState(null)
  const [cobrarData, setCobrarData] = useState(null)
  const [saving, setSaving] = useState(false)

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

  function openCobrar(c) {
    setCobrarId(c.id)
    setCobrarData(c)
  }

  async function confirmarCobro() {
    if (!cobrarId || !cobrarData) return
    setSaving(true)
    try {
      const { error: e1 } = await supabase.from('comandas')
        .update({ estado: 'cobrada', fecha_cobro: todayStr() })
        .eq('id', cobrarId)
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

      toast.success('✅ Comanda cobrada: ' + fmt(cobrarData.total))
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
    if (!window.confirm('¿Cancelar esta comanda?')) return
    const { error } = await supabase.from('comandas').delete().eq('id', id)
    if (error) { toast.error('Error al cancelar'); return }
    toast.success('🗑 Comanda cancelada')
    await load()
    refreshPendientes()
  }

  // Agrupar por fecha de entrega
  const grupos = {}
  comandas.forEach(c => {
    if (!grupos[c.fecha_entrega]) grupos[c.fecha_entrega] = []
    grupos[c.fecha_entrega].push(c)
  })
  const fechasOrdenadas = Object.keys(grupos).sort()

  return (
    <div className="fade-in">
      <SectionHeader title="📋 Comandas" subtitle="Pedidos pendientes de cobro, agrupados por día de entrega" />
      <FilterTabs tabs={FILTROS} active={filtro} onChange={v => setFiltro(v)} />

      {loading ? <Loading /> : comandas.length === 0 ? (
        <Empty icon="📋" text="No hay comandas en esta categoría" />
      ) : (
        fechasOrdenadas.map(fecha => {
          const tot = grupos[fecha].reduce((s, c) => s + parseFloat(c.total || 0), 0)
          const fechaLarga = new Date(fecha + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })
          return (
            <div key={fecha}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap', margin: '16px 0 8px' }}>
                <Tag color="blue">{labelFecha(fecha)}</Tag>
                <strong style={{ fontSize: 13 }}>{fechaLarga}</strong>
                <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--txt2)' }}>
                  Total grupo: <strong style={{ color: 'var(--pur)' }}>{fmt(tot)}</strong>
                </span>
              </div>
              {grupos[fecha].map(c => (
                <div key={c.id} style={{
                  background: 'var(--sur)', border: `1px solid ${c.estado === 'pendiente' ? 'var(--bor2)' : 'var(--bor)'}`,
                  borderLeft: `3px solid ${c.estado === 'pendiente' ? 'var(--pur)' : 'var(--ok)'}`,
                  borderRadius: 'var(--r)', padding: 13, marginBottom: 7,
                  opacity: c.estado === 'cobrada' ? 0.7 : 1
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5, flexWrap: 'wrap' }}>
                    <strong style={{ fontSize: 14 }}>{c.cliente_nombre}</strong>
                    <Tag color={c.estado === 'pendiente' ? 'warn' : 'green'}>
                      {c.estado === 'pendiente' ? '⏳ Pendiente' : '✅ Cobrada'}
                    </Tag>
                    <span style={{ fontSize: 11, color: 'var(--txt3)' }}>
                      Encargada a las {(c.hora_registro || '').slice(0, 5)}h
                    </span>
                    <strong style={{ marginLeft: 'auto', color: 'var(--pur)' }}>{fmt(c.total)}</strong>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--txt2)', lineHeight: 1.6 }}>
                    {(c.items || []).map(i => `${i.icono || ''} ${i.nombre} × ${i.qty}`).join(' · ')}
                  </div>
                  {c.estado === 'pendiente' && (
                    <div style={{ display: 'flex', gap: 6, marginTop: 7, flexWrap: 'wrap' }}>
                      <Btn variant="success" size="sm" onClick={() => openCobrar(c)}>✅ Cobrar</Btn>
                      <Btn variant="danger" size="sm" onClick={() => cancelar(c.id)}>🗑 Cancelar</Btn>
                    </div>
                  )}
                  {c.estado === 'cobrada' && (
                    <div style={{ fontSize: 11, color: 'var(--ok)', marginTop: 5 }}>
                      ✅ Cobrada el {c.fecha_cobro || '—'}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )
        })
      )}

      {/* Modal confirmar cobro */}
      <Modal open={!!cobrarId} onClose={() => setCobrarId(null)} title="✅ Cobrar comanda">
        {cobrarData && (
          <>
            <div style={{ marginBottom: 8 }}>
              <strong style={{ fontSize: 15 }}>{cobrarData.cliente_nombre}</strong>
              {' · '}
              <Tag color="blue">{labelFecha(cobrarData.fecha_entrega)}</Tag>
            </div>
            <div style={{ fontSize: 12, color: 'var(--txt2)', marginBottom: 10 }}>
              {(cobrarData.items || []).map(i => `${i.icono || ''} ${i.nombre} × ${i.qty}`).join(', ')}
            </div>
            <div style={{ fontSize: 18, fontFamily: "'Playfair Display', serif", color: 'var(--pur)' }}>
              Total a cobrar: {fmt(cobrarData.total)}
            </div>
          </>
        )}
        <ModalFooter>
          <Btn variant="ghost" onClick={() => setCobrarId(null)}>Cancelar</Btn>
          <Btn variant="success" onClick={confirmarCobro} disabled={saving}>
            {saving ? 'Procesando...' : '✅ Confirmar cobro'}
          </Btn>
        </ModalFooter>
      </Modal>
    </div>
  )
}
