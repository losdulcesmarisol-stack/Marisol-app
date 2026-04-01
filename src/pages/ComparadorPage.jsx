// src/pages/ComparadorPage.jsx
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { fmt } from '../lib/utils'
import { SectionHeader, Card, CardTitle, Btn, Loading, Empty, Tag } from '../components/ui'

export default function ComparadorPage() {
  const navigate = useNavigate()
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data: facturas } = await supabase.from('facturas').select('*').order('fecha_factura', { ascending: false })
    if (!facturas?.length) { setData([]); setLoading(false); return }

    const pp = {}
    facturas.forEach(f => {
      (f.items || []).forEach(i => {
        if (!i.nombre || !i.precio_unit) return
        const k = i.nombre.toLowerCase().trim()
        if (!pp[k]) pp[k] = { nombre: i.nombre, entradas: [] }
        pp[k].entradas.push({ prov: f.proveedor_nombre, precio: i.precio_unit, fecha: f.fecha_factura })
      })
    })

    const result = Object.values(pp).map(prod => {
      const byProv = {}
      prod.entradas.forEach(e => { if (!byProv[e.prov] || e.fecha > byProv[e.prov].fecha) byProv[e.prov] = e })
      const lst = Object.values(byProv).sort((a, b) => a.precio - b.precio)
      return { nombre: prod.nombre, proveedores: lst }
    })
    setData(result)
    setLoading(false)
  }

  return (
    <div className="fade-in">
      <SectionHeader
        title="📊 Comparador de precios"
        subtitle="Qué proveedor tiene cada producto más barato"
        action={<Btn variant="ghost" onClick={() => navigate('/proveedores')}>← Volver</Btn>}
      />
      <Card>
        <CardTitle>📉 Comparativa por producto</CardTitle>
        {loading ? <Loading /> : data.length === 0 ? (
          <Empty icon="📊" text="Añade facturas con líneas de producto para comparar" />
        ) : data.map((prod, pi) => (
          <div key={pi} style={{ marginBottom: 18 }}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 7 }}>{prod.nombre}</div>
            {prod.proveedores.map((e, i) => {
              const diff = i === 0 ? null : ((e.precio - prod.proveedores[0].precio) / prod.proveedores[0].precio * 100).toFixed(1)
              return (
                <div key={i} style={{ display:'flex',alignItems:'center',gap:9,padding:'7px 0',borderBottom:'1px solid var(--bor)',fontSize:12,flexWrap:'wrap' }}>
                  <div style={{ flex:1,minWidth:120,fontWeight:600 }}>
                    {i===0?'🥇 ':i===1?'🥈 ':'🥉 '}{e.prov}
                  </div>
                  <div style={{ fontWeight:700,minWidth:58,color:'var(--pur)' }}>{fmt(e.precio)}/ud</div>
                  <div>
                    {i===0 ? <Tag color="green">✓ Más barato</Tag> : diff ? <Tag color="red">+{diff}%</Tag> : null}
                  </div>
                  <div style={{ fontSize:10,color:'var(--txt3)' }}>{e.fecha}</div>
                </div>
              )
            })}
            {prod.proveedores.length > 1 && (
              <div style={{ fontSize:11,color:'var(--txt2)',marginTop:5,padding:'5px 8px',background:'var(--purbg)',borderRadius:6,border:'1px solid var(--bor2)' }}>
                💡 Ahorro eligiendo {prod.proveedores[0].prov}: <strong style={{ color:'var(--ok)' }}>
                  {fmt(prod.proveedores[prod.proveedores.length-1].precio - prod.proveedores[0].precio)}/ud
                </strong>
              </div>
            )}
          </div>
        ))}
      </Card>
    </div>
  )
}
