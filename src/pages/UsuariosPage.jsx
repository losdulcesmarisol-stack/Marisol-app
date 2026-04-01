// src/pages/UsuariosPage.jsx
import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { validarPin } from '../lib/utils'
import { SectionHeader, Card, Btn, Modal, ModalFooter, FormGroup, Grid2, Tag, Loading, Empty } from '../components/ui'
import toast from 'react-hot-toast'

export default function UsuariosPage() {
  const { user: me } = useAuth()
  const [usuarios, setUsuarios] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [editId, setEditId] = useState(null)
  const [form, setForm] = useState({ nombre: '', pin: '', rol: 'empleado' })
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState({})

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('usuarios').select('*').order('nombre')
    setUsuarios(data || [])
    setLoading(false)
  }

  function openNew() { setForm({ nombre:'',pin:'',rol:'empleado' }); setEditId(null); setErrors({}); setModal(true) }
  function openEdit(u) { setForm({ nombre:u.nombre,pin:'',rol:u.rol }); setEditId(u.id); setErrors({}); setModal(true) }

  function validate() {
    const errs = {}
    if (!form.nombre.trim()) errs.nombre = 'Nombre obligatorio'
    if (!editId && !form.pin) errs.pin = 'PIN obligatorio para nuevo usuario'
    if (form.pin && !validarPin(form.pin)) errs.pin = 'El PIN debe ser de 4 dígitos numéricos'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  async function save() {
    if (!validate()) return
    setSaving(true)
    try {
      const datos = { nombre: form.nombre.trim(), rol: form.rol }
      if (form.pin) datos.pin = form.pin
      if (editId) {
        await supabase.from('usuarios').update(datos).eq('id', editId)
      } else {
        await supabase.from('usuarios').insert({ ...datos, activo: true })
      }
      toast.success('✅ Usuario guardado')
      setModal(false)
      await load()
    } catch (e) {
      toast.error('Error: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  async function toggle(u) {
    if (u.id === me.id) { toast.error('No puedes desactivarte a ti mismo'); return }
    await supabase.from('usuarios').update({ activo: !u.activo }).eq('id', u.id)
    toast.success(u.activo ? '⛔ Usuario desactivado' : '✅ Usuario activado')
    await load()
  }

  return (
    <div className="fade-in">
      <SectionHeader title="⚙️ Usuarios" subtitle="Gestiona accesos y PINs" action={<Btn onClick={openNew}>+ Añadir usuario</Btn>} />
      <Card>
        {loading ? <Loading /> : usuarios.length === 0 ? <Empty icon="👤" text="No hay usuarios" /> : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width:'100%',borderCollapse:'collapse',fontSize:13 }}>
              <thead><tr>{['Nombre','Rol','Estado','Acciones'].map(h=><th key={h} style={{ background:'var(--pur)',color:'#fff',padding:'9px 11px',textAlign:'left',fontSize:10,letterSpacing:1,textTransform:'uppercase' }}>{h}</th>)}</tr></thead>
              <tbody>
                {usuarios.map(u => (
                  <tr key={u.id} style={{ borderBottom:'1px solid var(--bor)' }}>
                    <td style={{ padding:'9px 11px' }}><strong>{u.nombre}</strong>{u.id===me.id&&<span style={{ fontSize:10,color:'var(--txt3)',marginLeft:6 }}>(tú)</span>}</td>
                    <td style={{ padding:'9px 11px' }}><Tag color={u.rol==='admin'?'purple':'green'}>{u.rol}</Tag></td>
                    <td style={{ padding:'9px 11px' }}><Tag color={u.activo?'green':'gray'}>{u.activo?'Activo':'Inactivo'}</Tag></td>
                    <td style={{ padding:'9px 11px' }}>
                      <div style={{ display:'flex',gap:5 }}>
                        <Btn variant="ghost" size="sm" onClick={()=>openEdit(u)}>✏️ Editar</Btn>
                        {u.id!==me.id && <Btn variant={u.activo?'danger':'success'} size="sm" onClick={()=>toggle(u)}>{u.activo?'Desactivar':'Activar'}</Btn>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal open={modal} onClose={()=>setModal(false)} title={editId?'✏️ Editar usuario':'👤 Nuevo usuario'}>
        <FormGroup label="Nombre *" error={errors.nombre}>
          <input value={form.nombre} onChange={e=>setForm(f=>({...f,nombre:e.target.value}))} placeholder="Nombre del usuario" autoFocus/>
        </FormGroup>
        <FormGroup label={editId ? 'Nuevo PIN (deja en blanco para no cambiar)' : 'PIN de acceso (4 dígitos) *'} error={errors.pin}>
          <input
            type="password"
            inputMode="numeric"
            maxLength={4}
            value={form.pin}
            onChange={e=>setForm(f=>({...f,pin:e.target.value.replace(/\D/,'').slice(0,4)}))}
            placeholder="••••"
          />
        </FormGroup>
        <FormGroup label="Rol">
          <select value={form.rol} onChange={e=>setForm(f=>({...f,rol:e.target.value}))}>
            <option value="empleado">Empleado — solo ventas y comandas</option>
            <option value="admin">Admin — acceso completo</option>
          </select>
        </FormGroup>
        <div style={{ fontSize:11,color:'var(--txt3)',marginTop:8,padding:'8px',background:'var(--sur2)',borderRadius:'var(--r)' }}>
          ℹ️ Los empleados pueden ver y crear ventas y comandas, pero no pueden editar productos, clientes ni configuración.
        </div>
        <ModalFooter>
          <Btn variant="ghost" onClick={()=>setModal(false)}>Cancelar</Btn>
          <Btn onClick={save} disabled={saving}>{saving?'Guardando...':'💾 Guardar usuario'}</Btn>
        </ModalFooter>
      </Modal>
    </div>
  )
}
