import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useProductos } from '../hooks/useProductos'
import { getEmoji, CAT_EMOJI } from '../lib/utils'
import { Card, CardTitle, SectionHeader, Btn, Modal, ModalFooter, FormGroup, Grid2, Tag, Loading, Empty, LockOverlay, Table } from '../components/ui'

const EMPTY_FORM = { nombre: '', categoria: 'Pan', precio: '', icono: '', unidad: 'unidad' }
const CATEGORIAS = Object.keys(CAT_EMOJI)
const UNIDADES = ['unidad', 'kg', 'media docena', 'docena', 'bandeja']

export default function ProductosPage() {
  const { isAdmin } = useAuth()
  const { productos, loading, save, remove } = useProductos()
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [editId, setEditId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState({})

  function openNew() { setForm(EMPTY_FORM); setEditId(null); setErrors({}); setModal(true) }

  function openEdit(p) {
    setForm({ nombre: p.nombre, categoria: p.categoria, precio: p.precio, icono: p.icono || '', unidad: p.unidad || 'unidad' })
    setEditId(p.id); setErrors({}); setModal(true)
  }

  function validate() {
    const errs = {}
    if (!form.nombre.trim()) errs.nombre = 'El nombre es obligatorio'
    if (!form.precio || isNaN(parseFloat(form.precio)) || parseFloat(form.precio) < 0) errs.precio = 'Introduce un precio valido'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  async function handleSave() {
    if (!validate()) return
    setSaving(true)
    const ok = await save({ nombre: form.nombre.trim(), categoria: form.categoria, precio: parseFloat(form.precio), icono: form.icono.trim() || getEmoji(form.categoria), unidad: form.unidad }, editId)
    setSaving(false)
    if (ok) setModal(false)
  }

  async function handleDelete(id, nombre) {
    if (!window.confirm('Eliminar el producto ' + nombre + '?')) return
    await remove(id)
  }

  const porCategoria = {}
  productos.forEach(p => {
    if (!porCategoria[p.categoria]) porCategoria[p.categoria] = []
    porCategoria[p.categoria].push(p)
  })
  const categoriasConProductos = CATEGORIAS.filter(c => porCategoria[c]?.length > 0)

  return (
    <div className="fade-in">
      <SectionHeader title="Productos" subtitle="Catalogo organizado por categorias" action={isAdmin && <Btn onClick={openNew}>+ Añadir producto</Btn>} />
      {loading ? (
        <Card><Loading /></Card>
      ) : productos.length === 0 ? (
        <Card><Empty icon="🫙" text="No hay productos. Añade el primero!" /></Card>
      ) : (
        categoriasConProductos.map(cat => (
          <Card key={cat} style={{ position: 'relative' }}>
            <LockOverlay visible={!isAdmin} />
            <CardTitle>
              <span>{getEmoji(cat)} {cat}</span>
              <span style={{ fontSize: 11, color: 'var(--txt3)', fontWeight: 400 }}>{porCategoria[cat].length} producto{porCategoria[cat].length !== 1 ? 's' : ''}</span>
            </CardTitle>
            <Table headers={['', 'Nombre', 'Precio', 'Unidad', 'Acciones']}>
              {porCategoria[cat].map(p => (
                <tr key={p.id}>
                  <td style={{ fontSize: 22 }}>{p.icono || getEmoji(p.categoria)}</td>
                  <td><strong>{p.nombre}</strong></td>
                  <td><strong style={{ color: 'var(--pur)' }}>{parseFloat(p.precio).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}</strong></td>
                  <td style={{ color: 'var(--txt2)' }}>{p.unidad}</td>
                  <td>{isAdmin && <div style={{ display: 'flex', gap: 5 }}><Btn variant="ghost" size="sm" onClick={() => openEdit(p)}>Editar</Btn><Btn variant="danger" size="sm" onClick={() => handleDelete(p.id, p.nombre)}>Borrar</Btn></div>}</td>
                </tr>
              ))}
            </Table>
          </Card>
        ))
      )}
      <Modal open={modal} onClose={() => setModal(false)} title={editId ? 'Editar producto' : 'Nuevo producto'}>
        <Grid2>
          <FormGroup label="Nombre *" error={errors.nombre}>
            <input type="text" value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} placeholder="Ej: Pan de pueblo" autoFocus />
          </FormGroup>
          <FormGroup label="Categoria">
            <select value={form.categoria} onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))}>
              {CATEGORIAS.map(c => <option key={c} value={c}>{getEmoji(c)} {c}</option>)}
            </select>
          </FormGroup>
        </Grid2>
        <Grid2>
          <FormGroup label="Precio (euros) *" error={errors.precio}>
            <input type="number" step="0.01" min="0" value={form.precio} onChange={e => setForm(f => ({ ...f, precio: e.target.value }))} placeholder="0.00" />
          </FormGroup>
          <FormGroup label="Emoji">
            <input type="text" maxLength={4} value={form.icono} onChange={e => setForm(f => ({ ...f, icono: e.target.value }))} placeholder={getEmoji(form.categoria)} />
          </FormGroup>
        </Grid2>
        <FormGroup label="Unidad de venta">
          <select value={form.unidad} onChange={e => setForm(f => ({ ...f, unidad: e.target.value }))}>
            {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
          </select>
        </FormGroup>
        <ModalFooter>
          <Btn variant="ghost" onClick={() => setModal(false)}>Cancelar</Btn>
          <Btn onClick={handleSave} disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</Btn>
        </ModalFooter>
      </Modal>
    </div>
  )
}
