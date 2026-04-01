// src/pages/ClientesPage.jsx
import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useClientes } from '../hooks/useClientes'
import { useProductos } from '../hooks/useProductos'
import { getEmoji, fmt } from '../lib/utils'
import {
  Card, SectionHeader, Btn, Modal, ModalFooter,
  FormGroup, Grid2, Tag, Loading, Empty, LockOverlay, Table
} from '../components/ui'
import AlbaranModal from '../components/modals/AlbaranModal'

const EMPTY_FORM = {
  nombre: '', telefono: '', tipo: 'particular',
  nif: '', direccion: '', notas: '', precios_especiales: {}
}
const TIPOS = ['particular', 'hosteleria', 'comercio', 'mayorista']

export default function ClientesPage() {
  const { isAdmin } = useAuth()
  const { clientes, loading, save, remove } = useClientes()
  const { productos } = useProductos()
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [editId, setEditId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState({})
  const [preciosEsp, setPreciosEsp] = useState({}) // { prodId: precio }
  const [albaranCli, setAlbaranCli] = useState(null)

  function openNew() {
    setForm(EMPTY_FORM)
    setPreciosEsp({})
    setEditId(null)
    setErrors({})
    setModal(true)
  }

  function openEdit(c) {
    setForm({
      nombre: c.nombre || '',
      telefono: c.telefono || '',
      tipo: c.tipo || 'particular',
      nif: c.nif || '',
      direccion: c.direccion || '',
      notas: c.notas || '',
    })
    setPreciosEsp(c.precios_especiales || {})
    setEditId(c.id)
    setErrors({})
    setModal(true)
  }

  function validate() {
    const errs = {}
    if (!form.nombre.trim()) errs.nombre = 'El nombre es obligatorio'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  async function handleSave() {
    if (!validate()) return
    setSaving(true)
    // Construir precios especiales (solo válidos)
    const pe = {}
    Object.entries(preciosEsp).forEach(([k, v]) => {
      const n = parseFloat(v)
      if (!isNaN(n) && n > 0) pe[k] = n
    })
    const ok = await save(
      { ...form, nombre: form.nombre.trim(), precios_especiales: pe },
      editId
    )
    setSaving(false)
    if (ok) setModal(false)
  }

  async function handleDelete(id, nombre) {
    if (!window.confirm(`¿Eliminar el cliente "${nombre}"?`)) return
    await remove(id)
  }

  function setPrecioEsp(prodId, val) {
    setPreciosEsp(p => ({ ...p, [prodId]: val }))
  }

  return (
    <div className="fade-in">
      <SectionHeader
        title="👥 Clientes"
        subtitle="Precios especiales y albaranes"
        action={isAdmin && <Btn onClick={openNew}>+ Añadir cliente</Btn>}
      />

      <Card style={{ position: 'relative' }}>
        <LockOverlay visible={!isAdmin} />
        {loading ? <Loading /> : clientes.length === 0 ? (
          <Empty icon="🙋" text="No hay clientes. ¡Añade el primero!" />
        ) : (
          <Table headers={['Nombre', 'Teléfono', 'Tipo', 'Precios esp.', 'Acciones']}>
            {clientes.map(c => {
              const npe = Object.keys(c.precios_especiales || {}).length
              return (
                <tr key={c.id}>
                  <td>
                    <strong>{c.nombre}</strong>
                    {c.notas && <><br /><small style={{ color: 'var(--txt3)' }}>{c.notas}</small></>}
                  </td>
                  <td style={{ color: 'var(--txt2)' }}>{c.telefono || '—'}</td>
                  <td><Tag color="gray">{c.tipo}</Tag></td>
                  <td>
                    {npe > 0
                      ? <Tag color="purple">💡 {npe} especiales</Tag>
                      : <span style={{ color: 'var(--txt3)', fontSize: 11 }}>Precio base</span>
                    }
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                      {isAdmin && <Btn variant="ghost" size="sm" onClick={() => openEdit(c)}>✏️</Btn>}
                      <Btn variant="info" size="sm" onClick={() => setAlbaranCli(c)}>📄 Albarán</Btn>
                      {isAdmin && <Btn variant="danger" size="sm" onClick={() => handleDelete(c.id, c.nombre)}>🗑</Btn>}
                    </div>
                  </td>
                </tr>
              )
            })}
          </Table>
        )}
      </Card>

      {/* Modal editar/crear cliente */}
      <Modal
        open={modal}
        onClose={() => setModal(false)}
        title={editId ? '✏️ Editar cliente' : '👤 Nuevo cliente'}
        wide
      >
        <Grid2>
          <FormGroup label="Nombre completo *" error={errors.nombre}>
            <input
              type="text"
              value={form.nombre}
              onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
              placeholder="Nombre del cliente"
              autoFocus
            />
          </FormGroup>
          <FormGroup label="Teléfono">
            <input
              type="tel"
              value={form.telefono}
              onChange={e => setForm(f => ({ ...f, telefono: e.target.value }))}
              placeholder="600 000 000"
            />
          </FormGroup>
        </Grid2>
        <Grid2>
          <FormGroup label="Tipo de cliente">
            <select value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))}>
              {TIPOS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </FormGroup>
          <FormGroup label="NIF/CIF (para albaranes)">
            <input
              type="text"
              value={form.nif}
              onChange={e => setForm(f => ({ ...f, nif: e.target.value }))}
              placeholder="12345678A"
            />
          </FormGroup>
        </Grid2>
        <Grid2>
          <FormGroup label="Dirección">
            <input
              type="text"
              value={form.direccion}
              onChange={e => setForm(f => ({ ...f, direccion: e.target.value }))}
              placeholder="Calle, número..."
            />
          </FormGroup>
          <FormGroup label="Notas internas">
            <input
              type="text"
              value={form.notas}
              onChange={e => setForm(f => ({ ...f, notas: e.target.value }))}
              placeholder="Cualquier anotación..."
            />
          </FormGroup>
        </Grid2>

        <div style={{ fontWeight: 600, color: 'var(--pur)', fontSize: 12, margin: '12px 0 4px' }}>
          💡 Precios especiales por producto
        </div>
        <div style={{ fontSize: 11, color: 'var(--txt3)', marginBottom: 8 }}>
          Deja en blanco para usar el precio base
        </div>
        <div style={{ maxHeight: 200, overflowY: 'auto', border: '1px solid var(--bor)', borderRadius: 'var(--r)', padding: 8 }}>
          {productos.length === 0 ? (
            <p style={{ fontSize: 12, color: 'var(--txt3)', padding: 8 }}>Añade productos primero</p>
          ) : productos.map(p => (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: '1px solid var(--bor)', fontSize: 12 }}>
              <span style={{ flex: 1, fontWeight: 500 }}>{p.icono || getEmoji(p.categoria)} {p.nombre}</span>
              <span style={{ color: 'var(--txt3)', minWidth: 58 }}>Base: {fmt(p.precio)}</span>
              <input
                type="number"
                step="0.01"
                min="0"
                style={{ width: 85, padding: '4px 7px', fontSize: 12 }}
                value={preciosEsp[p.id] || ''}
                placeholder={p.precio.toFixed(2)}
                onChange={e => setPrecioEsp(p.id, e.target.value)}
              />
            </div>
          ))}
        </div>

        <ModalFooter>
          <Btn variant="ghost" onClick={() => setModal(false)}>Cancelar</Btn>
          <Btn onClick={handleSave} disabled={saving}>{saving ? 'Guardando...' : '💾 Guardar cliente'}</Btn>
        </ModalFooter>
      </Modal>

      {/* Modal albarán */}
      {albaranCli && (
        <AlbaranModal
          cliente={albaranCli}
          productos={productos}
          onClose={() => setAlbaranCli(null)}
        />
      )}
    </div>
  )
}
