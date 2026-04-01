// src/pages/ProveedoresPage.jsx
import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { fmt, todayStr } from '../lib/utils'
import { Card, CardTitle, SectionHeader, Btn, Modal, ModalFooter, FormGroup, Grid2, Tag, Loading, Empty, LockOverlay, FilterTabs } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import toast from 'react-hot-toast'

export default function ProveedoresPage() {
  const { isAdmin } = useAuth()
  const navigate = useNavigate()
  const [proveedores, setProveedores] = useState([])
  const [loadingP, setLoadingP] = useState(true)
  const [facturas, setFacturas] = useState([])
  const [loadingF, setLoadingF] = useState(true)
  const [filtroF, setFiltroF] = useState('todas')
  const [modalProv, setModalProv] = useState(false)
  const [modalFac, setModalFac] = useState(false)
  const [modalVerFac, setModalVerFac] = useState(null)
  const [formProv, setFormProv] = useState({ nombre:'',telefono:'',email:'',nif:'',direccion:'',notas:'' })
  const [editProvId, setEditProvId] = useState(null)
  const [lineasFac, setLineasFac] = useState([{ nombre:'',cantidad:1,precio_unit:0 }])
  const [fotoFile, setFotoFile] = useState(null)
  const [fotoPreview, setFotoPreview] = useState(null)
  const [savingP, setSavingP] = useState(false)
  const [savingF, setSavingF] = useState(false)

  useEffect(() => { loadProveedores(); loadFacturas() }, [])
  useEffect(() => { loadFacturas() }, [filtroF])

  async function loadProveedores() {
    setLoadingP(true)
    const { data } = await supabase.from('proveedores').select('*').eq('activo', true).order('nombre')
    setProveedores(data || [])
    setLoadingP(false)
  }

  async function loadFacturas() {
    setLoadingF(true)
    let q = supabase.from('facturas').select('*').order('fecha_factura', { ascending: false })
    if (filtroF === 'pend') q = q.eq('estado', 'pendiente')
    else if (filtroF === 'pag') q = q.eq('estado', 'pagada')
    const { data } = await q
    setFacturas(data || [])
    setLoadingF(false)
  }

  function openNewProv() { setFormProv({ nombre:'',telefono:'',email:'',nif:'',direccion:'',notas:'' }); setEditProvId(null); setModalProv(true) }
  function openEditProv(p) { setFormProv({ nombre:p.nombre||'',telefono:p.telefono||'',email:p.email||'',nif:p.nif||'',direccion:p.direccion||'',notas:p.notas||'' }); setEditProvId(p.id); setModalProv(true) }

  async function saveProv() {
    if (!formProv.nombre.trim()) { toast.error('Nombre obligatorio'); return }
    setSavingP(true)
    try {
      if (editProvId) await supabase.from('proveedores').update(formProv).eq('id', editProvId)
      else await supabase.from('proveedores').insert(formProv)
      toast.success('✅ Proveedor guardado')
      setModalProv(false)
      await loadProveedores()
    } catch (e) { toast.error('Error: ' + e.message) }
    finally { setSavingP(false) }
  }

  async function delProv(id, nom) {
    if (!window.confirm(`¿Eliminar proveedor "${nom}"?`)) return
    await supabase.from('proveedores').update({ activo: false }).eq('id', id)
    toast.success('🗑 Eliminado')
    await loadProveedores()
  }

  function openNewFac() {
    setLineasFac([{ nombre:'',cantidad:1,precio_unit:0 }])
    setFotoFile(null); setFotoPreview(null)
    setModalFac(true)
  }

  function updateLinea(i, field, val) {
    setLineasFac(ls => ls.map((l, idx) => idx === i ? { ...l, [field]: field==='nombre'?val:parseFloat(val)||0 } : l))
  }

  function handleFoto(e) {
    const f = e.target.files[0]; if (!f) return
    setFotoFile(f)
    const reader = new FileReader()
    reader.onload = ev => setFotoPreview({ url: ev.target.result, isPdf: f.name.endsWith('.pdf'), name: f.name })
    reader.readAsDataURL(f)
  }

  async function saveFac() {
    const provSel = document.getElementById('fac-prov-sel')
    const provId = provSel?.value
    const provNom = provSel?.options[provSel?.selectedIndex]?.text
    if (!provId) { toast.error('Selecciona un proveedor'); return }
    const total = lineasFac.reduce((s,l) => s + l.cantidad * l.precio_unit, 0)
    setSavingF(true)
    try {
      let fotoUrl = null
      if (fotoFile) {
        const ext = fotoFile.name.split('.').pop()
        const path = `${provId}/${Date.now()}.${ext}`
        const { error: ue } = await supabase.storage.from('facturas').upload(path, fotoFile, { upsert: true })
        if (!ue) { const { data: ud } = supabase.storage.from('facturas').getPublicUrl(path); fotoUrl = ud.publicUrl }
      }
      const num = document.getElementById('fac-num-inp')?.value || ''
      const fec = document.getElementById('fac-fec-inp')?.value || todayStr()
      const ven = document.getElementById('fac-ven-inp')?.value || null
      const not = document.getElementById('fac-not-inp')?.value || ''
      await supabase.from('facturas').insert({ proveedor_id:provId, proveedor_nombre:provNom, numero_factura:num, fecha_factura:fec, fecha_vencimiento:ven||null, items:lineasFac, total, foto_url:fotoUrl, notas:not, estado:'pendiente' })
      toast.success('✅ Factura guardada')
      setModalFac(false)
      await loadFacturas()
    } catch (e) { toast.error('Error: ' + e.message) }
    finally { setSavingF(false) }
  }

  async function marcarPagada(id) {
    await supabase.from('facturas').update({ estado: 'pagada' }).eq('id', id)
    toast.success('✅ Marcada como pagada')
    await loadFacturas()
  }

  const totFac = lineasFac.reduce((s,l) => s + l.cantidad * l.precio_unit, 0)

  return (
    <div className="fade-in">
      <SectionHeader title="🚚 Proveedores" subtitle="Facturas y comparativa de precios"
        action={
          <div style={{ display:'flex',gap:7,flexWrap:'wrap' }}>
            <Btn variant="ghost" onClick={() => navigate('/comparador')}>📊 Comparar precios</Btn>
            {isAdmin && <Btn onClick={openNewProv}>+ Proveedor</Btn>}
          </div>
        }
      />

      {/* Lista proveedores */}
      <Card style={{ position:'relative' }}>
        <LockOverlay visible={!isAdmin} />
        <CardTitle>🏭 Mis proveedores</CardTitle>
        {loadingP ? <Loading /> : proveedores.length===0 ? <Empty icon="🚚" text="No hay proveedores"/> : (
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%',borderCollapse:'collapse',fontSize:13 }}>
              <thead><tr>{['Nombre','Teléfono','Email','Acciones'].map(h=><th key={h} style={{ background:'var(--pur)',color:'#fff',padding:'9px 11px',textAlign:'left',fontSize:10,letterSpacing:1,textTransform:'uppercase' }}>{h}</th>)}</tr></thead>
              <tbody>
                {proveedores.map(p => (
                  <tr key={p.id} style={{ borderBottom:'1px solid var(--bor)' }}>
                    <td style={{ padding:'9px 11px' }}><strong>{p.nombre}</strong>{p.notas && <><br/><small style={{ color:'var(--txt3)' }}>{p.notas}</small></>}</td>
                    <td style={{ padding:'9px 11px',color:'var(--txt2)' }}>{p.telefono||'—'}</td>
                    <td style={{ padding:'9px 11px',color:'var(--txt2)' }}>{p.email||'—'}</td>
                    <td style={{ padding:'9px 11px' }}>
                      {isAdmin && <div style={{ display:'flex',gap:5 }}>
                        <Btn variant="ghost" size="sm" onClick={() => openEditProv(p)}>✏️</Btn>
                        <Btn variant="danger" size="sm" onClick={() => delProv(p.id,p.nombre)}>🗑</Btn>
                      </div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Facturas */}
      <Card>
        <CardTitle>
          🧾 Facturas
          <Btn size="sm" onClick={openNewFac}>+ Nueva factura</Btn>
        </CardTitle>
        <FilterTabs
          tabs={[{value:'todas',label:'Todas'},{value:'pend',label:'⏳ Pendientes'},{value:'pag',label:'✅ Pagadas'}]}
          active={filtroF} onChange={setFiltroF}
        />
        {loadingF ? <Loading /> : facturas.length===0 ? <Empty icon="🧾" text="No hay facturas"/> : facturas.map(f => (
          <div key={f.id} style={{ background:'var(--sur)',border:'1px solid var(--bor)',borderRadius:'var(--r)',padding:13,marginBottom:7,cursor:'pointer' }}
            onClick={() => setModalVerFac(f)}>
            <div style={{ display:'flex',alignItems:'center',gap:8,flexWrap:'wrap',marginBottom:5 }}>
              <strong>{f.proveedor_nombre}</strong>
              <Tag color="gray">{f.numero_factura||'Sin número'}</Tag>
              <Tag color={f.estado==='pagada'?'green':'warn'}>{f.estado==='pagada'?'✅ Pagada':'⏳ Pendiente'}</Tag>
              <span style={{ marginLeft:'auto',color:'var(--pur)',fontWeight:700 }}>{fmt(f.total)}</span>
            </div>
            <div style={{ fontSize:11,color:'var(--txt3)' }}>
              {new Date(f.fecha_factura+'T12:00:00').toLocaleDateString('es-ES',{day:'numeric',month:'long',year:'numeric'})}
              {f.foto_url && ' · 📷 Con foto'}
            </div>
            <div style={{ fontSize:11,color:'var(--txt2)',marginTop:4 }}>
              {(f.items||[]).map(i=>`${i.nombre}: ${fmt(i.precio_unit)}/ud`).join(' · ')}
            </div>
            {f.estado==='pendiente' && (
              <div style={{ marginTop:7 }}>
                <Btn variant="success" size="sm" onClick={e=>{e.stopPropagation();marcarPagada(f.id)}}>✅ Marcar pagada</Btn>
              </div>
            )}
          </div>
        ))}
      </Card>

      {/* Modal proveedor */}
      <Modal open={modalProv} onClose={()=>setModalProv(false)} title={editProvId?'✏️ Editar proveedor':'🚚 Nuevo proveedor'}>
        <Grid2>
          <FormGroup label="Nombre *"><input value={formProv.nombre} onChange={e=>setFormProv(f=>({...f,nombre:e.target.value}))} placeholder="Nombre del proveedor" autoFocus/></FormGroup>
          <FormGroup label="Teléfono"><input type="tel" value={formProv.telefono} onChange={e=>setFormProv(f=>({...f,telefono:e.target.value}))}/></FormGroup>
        </Grid2>
        <Grid2>
          <FormGroup label="Email"><input type="email" value={formProv.email} onChange={e=>setFormProv(f=>({...f,email:e.target.value}))}/></FormGroup>
          <FormGroup label="NIF/CIF"><input value={formProv.nif} onChange={e=>setFormProv(f=>({...f,nif:e.target.value}))}/></FormGroup>
        </Grid2>
        <FormGroup label="Dirección"><input value={formProv.direccion} onChange={e=>setFormProv(f=>({...f,direccion:e.target.value}))}/></FormGroup>
        <FormGroup label="Notas"><textarea value={formProv.notas} onChange={e=>setFormProv(f=>({...f,notas:e.target.value}))} rows={2}/></FormGroup>
        <ModalFooter>
          <Btn variant="ghost" onClick={()=>setModalProv(false)}>Cancelar</Btn>
          <Btn onClick={saveProv} disabled={savingP}>{savingP?'Guardando...':'💾 Guardar'}</Btn>
        </ModalFooter>
      </Modal>

      {/* Modal nueva factura */}
      <Modal open={modalFac} onClose={()=>setModalFac(false)} title="🧾 Nueva factura de proveedor" wide>
        <Grid2>
          <FormGroup label="Proveedor *">
            <select id="fac-prov-sel">
              {proveedores.map(p=><option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          </FormGroup>
          <FormGroup label="Nº Factura"><input id="fac-num-inp" placeholder="F-2024-001"/></FormGroup>
        </Grid2>
        <Grid2>
          <FormGroup label="Fecha factura"><input id="fac-fec-inp" type="date" defaultValue={todayStr()}/></FormGroup>
          <FormGroup label="Vencimiento"><input id="fac-ven-inp" type="date"/></FormGroup>
        </Grid2>
        <FormGroup label="📷 Foto o PDF de la factura">
          <input type="file" accept="image/*,application/pdf" onChange={handleFoto} style={{ padding:8 }}/>
          {fotoPreview && !fotoPreview.isPdf && <img src={fotoPreview.url} alt="preview" style={{ width:'100%',maxHeight:180,objectFit:'cover',borderRadius:'var(--r)',marginTop:7,border:'1px solid var(--bor)' }}/>}
          {fotoPreview?.isPdf && <div style={{ padding:7,background:'var(--sur2)',borderRadius:7,fontSize:12,color:'var(--txt2)',marginTop:7 }}>📄 PDF: {fotoPreview.name}</div>}
        </FormGroup>
        <div style={{ fontWeight:600,color:'var(--pur)',fontSize:12,margin:'10px 0 7px' }}>Líneas de la factura</div>
        {lineasFac.map((l,i) => (
          <div key={i} style={{ display:'flex',gap:5,marginBottom:5,alignItems:'center',flexWrap:'wrap' }}>
            <input type="text" value={l.nombre} placeholder="Descripción" style={{ flex:2,minWidth:120 }} onChange={e=>updateLinea(i,'nombre',e.target.value)}/>
            <input type="number" value={l.cantidad} min="0.1" step="0.1" style={{ width:60 }} onChange={e=>updateLinea(i,'cantidad',e.target.value)}/>
            <input type="number" value={l.precio_unit} step="0.01" placeholder="€/ud" style={{ width:80 }} onChange={e=>updateLinea(i,'precio_unit',e.target.value)}/>
            <span style={{ minWidth:60,textAlign:'right',color:'var(--pur)',fontWeight:600,fontSize:12 }}>{fmt(l.cantidad*l.precio_unit)}</span>
            <Btn variant="danger" size="sm" onClick={()=>setLineasFac(ls=>ls.filter((_,idx)=>idx!==i))}>×</Btn>
          </div>
        ))}
        <Btn variant="ghost" size="sm" onClick={()=>setLineasFac(ls=>[...ls,{nombre:'',cantidad:1,precio_unit:0}])} style={{ marginTop:5 }}>+ Añadir línea</Btn>
        <div style={{ marginTop:10,textAlign:'right',fontSize:14,fontWeight:700,color:'var(--pur)' }}>Total: {fmt(totFac)}</div>
        <FormGroup label="Notas" style={{ marginTop:9 }}><textarea id="fac-not-inp" rows={2}/></FormGroup>
        <ModalFooter>
          <Btn variant="ghost" onClick={()=>setModalFac(false)}>Cancelar</Btn>
          <Btn onClick={saveFac} disabled={savingF}>{savingF?'Guardando...':'💾 Guardar factura'}</Btn>
        </ModalFooter>
      </Modal>

      {/* Modal ver factura */}
      {modalVerFac && (
        <Modal open title="🧾 Detalle de factura" onClose={()=>setModalVerFac(null)}>
          <div style={{ marginBottom:10 }}><strong style={{ fontSize:15 }}>{modalVerFac.proveedor_nombre}</strong><br/><span style={{ color:'var(--txt3)',fontSize:12 }}>{modalVerFac.numero_factura||''} · {modalVerFac.fecha_factura}</span></div>
          {modalVerFac.foto_url && (modalVerFac.foto_url.endsWith('.pdf')
            ? <a href={modalVerFac.foto_url} target="_blank" rel="noreferrer"><Btn variant="info" size="sm">📄 Ver PDF</Btn></a>
            : <img src={modalVerFac.foto_url} alt="factura" style={{ width:'100%',maxHeight:200,objectFit:'cover',borderRadius:'var(--r)',marginBottom:10,border:'1px solid var(--bor)' }}/>
          )}
          {(modalVerFac.items||[]).map((i,idx) => (
            <div key={idx} style={{ display:'flex',alignItems:'center',gap:8,padding:'5px 0',borderBottom:'1px solid var(--bor)',fontSize:12 }}>
              <span style={{ flex:1,fontWeight:500 }}>{i.nombre}</span>
              <span style={{ color:'var(--txt3)',minWidth:55 }}>{i.cantidad} ud</span>
              <span style={{ color:'var(--pur)',fontWeight:600 }}>{fmt(i.precio_unit)}/ud · {fmt(i.cantidad*i.precio_unit)}</span>
            </div>
          ))}
          <div style={{ marginTop:9,fontSize:16,fontFamily:"'Playfair Display',serif",color:'var(--pur)' }}>Total: {fmt(modalVerFac.total)}</div>
          {modalVerFac.notas && <div style={{ marginTop:7,fontSize:12,color:'var(--txt2)' }}>{modalVerFac.notas}</div>}
          <ModalFooter>
            <Btn variant="ghost" onClick={()=>setModalVerFac(null)}>Cerrar</Btn>
            {modalVerFac.estado==='pendiente' && <Btn variant="success" onClick={()=>{marcarPagada(modalVerFac.id);setModalVerFac(null)}}>✅ Marcar pagada</Btn>}
          </ModalFooter>
        </Modal>
      )}
    </div>
  )
}
