// src/pages/ProductosPage.jsx
import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useProductos } from '../hooks/useProductos'
import { getEmoji, CAT_EMOJI } from '../lib/utils'
import {
  Card, CardTitle, SectionHeader, Btn, Modal, ModalFooter,
  FormGroup, Grid2, Tag, Loading, Empty, LockOverlay, Table
} from '../components/ui'
import toast from 'react-hot-toast'

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

  function openNew() {
    setForm(EMPTY_FORM)
    setEditId(null)
    setErrors({})
    setModal(true)
  }

  function openEdit(p) {
    setForm({ nombre: p.nombre, categoria: p.categoria, precio: p.precio, icono: p.icono || '', unidad: p.unidad || 'unidad' })
    setEditId(p.id)
    setErrors({})
    setModal(true)
  }

  function validate() {
    const errs = {}
    if (!form.nombre.trim()) errs.nombre = 'El nombre es obligatorio'
    if (!form.precio || isNaN(parseFloat(form.precio)) || parseFloat(form.precio) < 0)
      errs.precio = 'Introduce un precio válido'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  async function handleSave() {
    if (!validate()) return
    setSaving(true)
    const ok = await save(
      { nombre: form.nombre.trim(), categoria: form.categoria, precio: parseFloat(form.precio), icono: form.icono.trim() || getEmoji(form.categoria), unidad: form.unidad },
      editId
    )
    setSaving(false)
    if (ok) setModal(false)
  }

  async function handleDelete(id, nombre) {
    if (!window.confirm(`¿Eliminar el producto "${nombre}"?`)) return
    await remove(id)
  }

  return (
    <div className="fade-in">
      <SectionHeader
        title="🍞 Productos"
        subtitle="Catálogo de la panadería"
        action={isAdmin && <Btn onClick={openNew}>+ Añadir producto</Btn>}
      />

      <Card style={{ position: 'relative' }}>
        <LockOverlay visible={!isAdmin} />
        {loading ? <Loading /> : productos.length === 0 ? (
          <Empty icon="🫙" text="No hay productos. ¡Añade el primero!" />
        ) : (
          <Table headers={['', 'Nombre', 'Categoría', 'Precio', 'Unidad', 'Acciones']}>
            {productos.map(p => (
              <tr key={p.id}>
                <td style={{ fontSize: 22 }}>{p.icono || getEmoji(p.categoria)}</td>
                <td><strong>{p.nombre}</strong></td>
                <td><Tag color="purple">{getEmoji(p.categoria)} {p.categoria}</Tag></td>
                <td><strong style={{ color: 'var(--pur)' }}>{parseFloat(p.precio).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}</strong></td>
                <td style={{ color: 'var(--txt2)' }}>{p.unidad}</td>
                <td>
                  {isAdmin && (
                    <div style={{ display: 'flex', gap: 5 }}>
                      <Btn variant="ghost" size="sm" onClick={() => openEdit(p)}>✏️ Editar</Btn>
                      <Btn variant="danger" size="sm" onClick={() => handleDelete(p.id, p.nombre)}>🗑</Btn>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      <Modal open={modal} onClose={() => setModal(false)} title={editId ? '✏️ Editar producto' : '🍞 Nuevo producto'}>
        <Grid2>
          <FormGroup label="Nombre del producto *" error={errors.nombre}>
            <input
              type="text"
              value={form.nombre}
              onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
              placeholder="Ej: Pan de pueblo"
              autoFocus
            />
          </FormGroup>
          <FormGroup label="Categoría">
            <select value={form.categoria} onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))}>
              {CATEGORIAS.map(c => <option key={c} value={c}>{getEmoji(c)} {c}</option>)}
            </select>
          </FormGroup>
        </Grid2>
        <Grid2>
          <FormGroup label="Precio base (€) *" error={errors.precio}>
            <input
              type="number"
              step="0.01"
              min="0"
              value={form.precio}
              onChange={e => setForm(f => ({ ...f, precio: e.target.value }))}
              placeholder="0.00"
            />
          </FormGroup>
          <FormGroup label="Emoji personalizado">
            <input
              type="text"
              maxLength={4}
              value={form.icono}
              onChange={e => setForm(f => ({ ...f, icono: e.target.value }))}
              placeholder={getEmoji(form.categoria)}
            />
          </FormGroup>
        </Grid2>
        <FormGroup label="Unidad de venta">
          <select value={form.unidad} onChange={e => setForm(f => ({ ...f, unidad: e.target.value }))}>
            {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
          </select>
        </FormGroup>
        <ModalFooter>
          <Btn variant="ghost" onClick={() => setModal(false)}>Cancelar</Btn>
          <Btn onClick={handleSave} disabled={saving}>{saving ? 'Guardando...' : '💾 Guardar'}</Btn>
        </ModalFooter>
      </Modal>
    </div>
  )
}
