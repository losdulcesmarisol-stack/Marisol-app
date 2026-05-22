import { useState } from 'react'
import { Btn, Modal, ModalFooter } from '../ui'
import toast from 'react-hot-toast'

const VISION_KEY = 'AIzaSyA3zpAFy5OPaaZYC0cdI3xY7Xwpu4L5ojQ'

function resizeImage(file, maxWidth = 1400) {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        let width = img.width, height = img.height
        if (width > maxWidth) { height = Math.round(height * maxWidth / width); width = maxWidth }
        canvas.width = width; canvas.height = height
        canvas.getContext('2d').drawImage(img, 0, 0, width, height)
        resolve(canvas.toDataURL('image/jpeg', 0.9).split(',')[1])
      }
      img.src = e.target.result
    }
    reader.readAsDataURL(file)
  })
}

function extraerDatos(texto) {
  const lineas = texto.split('\n').map(l => l.trim()).filter(l => l)
  let proveedor = '', numeroFactura = '', fecha = ''
  const items = []

  // Proveedor — buscar línea con S.A., S.L., SOCIEDAD, etc o primera línea larga
  for (const l of lineas.slice(0, 10)) {
    if (l.match(/S\.A\.|S\.L\.|SOCIEDAD|COOPERATIVA|AGRICOLA|HARINERA|PANIFICADORA/i)) { proveedor = l; break }
  }
  if (!proveedor) {
    for (const l of lineas.slice(0, 6)) {
      if (l.length > 8 && !/^\d/.test(l) && !l.match(/certified|iso|food/i)) { proveedor = l; break }
    }
  }

  // Número de albarán o factura
  for (const l of lineas) {
    const m = l.match(/(?:albar[aá]n|factura|fra)[:\s#nNº°]*([A-Z0-9][A-Z0-9\/\-]{2,})/i)
    if (m) { numeroFactura = m[1]; break }
  }

  // Fecha
  for (const l of lineas) {
    const m = l.match(/(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/)
    if (m) { fecha = m[0]; break }
  }

  // ── EXTRACCIÓN DE PRODUCTOS ──
  // Estrategia 1: líneas con cantidad decimal + descripción + precio
  // Formato: "0,625 NOMBRE DEL PRODUCTO" con precio en otra columna o misma línea
  for (let i = 0; i < lineas.length; i++) {
    const l = lineas[i]

    // Buscar líneas con cantidad decimal al inicio (como 0,625 o 0,075)
    const mCantDec = l.match(/^(\d+[.,]\d+)\s+(.{5,})/)
    if (mCantDec) {
      const cantidad = parseFloat(mCantDec[1].replace(',', '.'))
      let nombre = mCantDec[2].trim()
      // Limpiar nombre — quitar texto entre paréntesis si es muy largo
      nombre = nombre.replace(/\(.*?\)/g, '').trim()
      if (nombre.length < 3) continue

      // Buscar precio: puede estar en la misma línea o en líneas cercanas
      let precioUnit = 0
      const mPrecioEnLinea = l.match(/(\d{1,4}[.,]\d{2})\s*€?\s*$/)
      if (mPrecioEnLinea) {
        precioUnit = parseFloat(mPrecioEnLinea[1].replace(',', '.'))
      } else {
        // Buscar en líneas siguientes o anteriores
        for (let j = Math.max(0, i-2); j <= Math.min(lineas.length-1, i+2); j++) {
          const mP = lineas[j].match(/(\d{3,4})\s*$/) // Precio por TM (ej: 610, 650)
          if (mP && j !== i) {
            const pTM = parseFloat(mP[1])
            if (pTM > 100 && pTM < 9999) {
              precioUnit = parseFloat((pTM * cantidad).toFixed(2))
              break
            }
          }
        }
      }

      if (cantidad > 0 && nombre.length > 2) {
        items.push({ nombre: nombre.substring(0, 60), cantidad, precio_unit: precioUnit })
      }
      continue
    }

    // Estrategia 2: línea normal con precio al final
    const mPrecio = l.match(/(.{5,}?)\s+(\d{1,4}[.,]\d{2})\s*€?\s*$/)
    if (mPrecio) {
      const nombre = mPrecio[1].trim()
      const precio = parseFloat(mPrecio[2].replace(',', '.'))
      if (nombre.match(/total|subtotal|iva|base|importe|portes|bruto|descuento/i)) continue
      if (nombre.length < 3 || precio <= 0 || precio > 99999) continue
      // Evitar duplicados
      if (!items.find(it => it.nombre.slice(0,10) === nombre.slice(0,10))) {
        items.push({ nombre: nombre.substring(0, 60), cantidad: 1, precio_unit: precio })
      }
    }
  }

  return { proveedor, numeroFactura, fecha, items }
}

export default function LectorFactura({ onDatosExtraidos, onClose }) {
  const [imagen, setImagen] = useState(null)
  const [preview, setPreview] = useState(null)
  const [leyendo, setLeyendo] = useState(false)
  const [resultado, setResultado] = useState(null)
  const [textoRaw, setTextoRaw] = useState('')

  function onFoto(e) {
    const file = e.target.files[0]
    if (!file) return
    setImagen(file); setResultado(null); setTextoRaw('')
    const reader = new FileReader()
    reader.onload = ev => setPreview(ev.target.result)
    reader.readAsDataURL(file)
  }

  async function leerFactura() {
    if (!imagen) { toast.error('Selecciona una foto primero'); return }
    setLeyendo(true)
    try {
      const base64 = await resizeImage(imagen)
      const resp = await fetch(
        `https://vision.googleapis.com/v1/images:annotate?key=${VISION_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            requests: [{
              image: { content: base64 },
              features: [
                { type: 'DOCUMENT_TEXT_DETECTION', maxResults: 1 }
              ]
            }]
          })
        }
      )
      const data = await resp.json()
      if (data.error) { toast.error('Error: ' + data.error.message); setLeyendo(false); return }
      const texto = data.responses?.[0]?.fullTextAnnotation?.text || ''
      if (!texto) { toast.error('No se detectó texto. Mejora la iluminación.'); setLeyendo(false); return }
      setTextoRaw(texto)
      const extraido = extraerDatos(texto)
      setResultado(extraido)
      if (extraido.items.length > 0) toast.success(extraido.items.length + ' producto(s) detectado(s)')
      else toast.error('Texto leído pero no se detectaron productos. Revisa abajo.')
    } catch (e) {
      toast.error('Error: ' + e.message)
    } finally {
      setLeyendo(false)
    }
  }

  function confirmar() {
    if (!resultado) return
    onDatosExtraidos(resultado)
    onClose()
  }

  return (
    <Modal open title="Lector de facturas con IA" onClose={onClose} wide>
      <div style={{ fontSize: 13, color: 'var(--txt2)', marginBottom: 12, background: 'var(--purbg)', border: '1px solid var(--bor2)', borderRadius: 'var(--r)', padding: '9px 12px' }}>
        💡 Puedes hacer foto con la cámara o elegir una imagen de la galería.
      </div>

      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--txt2)', textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 5 }}>
          Foto o imagen de la factura
        </label>
        <input type="file" accept="image/*" onChange={onFoto}
          style={{ padding: 8, background: 'var(--sur2)', border: '1.5px solid var(--bor)', borderRadius: 'var(--r)', width: '100%' }} />
      </div>

      {preview && (
        <img src={preview} alt="Factura" style={{ width: '100%', maxHeight: 220, objectFit: 'cover', borderRadius: 'var(--r)', marginBottom: 12, border: '1px solid var(--bor)' }} />
      )}

      {imagen && (
        <Btn fullWidth onClick={leerFactura} disabled={leyendo}>
          {leyendo ? '🔍 Leyendo factura...' : '🔍 Leer factura automáticamente'}
        </Btn>
      )}

      {resultado && (
        <div style={{ marginTop: 14 }}>
          {resultado.proveedor && <div style={{ fontSize: 12, color: 'var(--txt2)', marginBottom: 3 }}>🏭 <strong>{resultado.proveedor}</strong></div>}
          {resultado.numeroFactura && <div style={{ fontSize: 12, color: 'var(--txt2)', marginBottom: 3 }}>🧾 Nº: <strong>{resultado.numeroFactura}</strong></div>}
          {resultado.fecha && <div style={{ fontSize: 12, color: 'var(--txt2)', marginBottom: 10 }}>📅 Fecha: <strong>{resultado.fecha}</strong></div>}

          {resultado.items.length > 0 ? (
            <>
              <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--pur)', marginBottom: 6 }}>
                ✅ {resultado.items.length} producto(s) detectado(s):
              </div>
              <div style={{ border: '1px solid var(--bor)', borderRadius: 'var(--r)', overflow: 'hidden', marginBottom: 10 }}>
                {resultado.items.map((item, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 11px', borderBottom: i < resultado.items.length - 1 ? '1px solid var(--bor)' : 'none', fontSize: 12 }}>
                    <span style={{ flex: 1, fontWeight: 500 }}>{item.nombre}</span>
                    <span style={{ color: 'var(--txt3)', minWidth: 50 }}>{item.cantidad} ud</span>
                    <span style={{ color: 'var(--pur)', fontWeight: 700 }}>
                      {item.precio_unit > 0 ? item.precio_unit.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' }) + '/ud' : 'Sin precio'}
                    </span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div style={{ background: 'rgba(176,106,16,.08)', border: '1px solid rgba(176,106,16,.22)', borderRadius: 'var(--r)', padding: '10px 12px', fontSize: 12, color: 'var(--wrn)', marginBottom: 10 }}>
              ⚠️ Texto leído pero no se detectaron productos automáticamente.
            </div>
          )}

          {textoRaw && (
            <details style={{ marginBottom: 10 }}>
              <summary style={{ fontSize: 11, color: 'var(--txt3)', cursor: 'pointer', marginBottom: 5 }}>Ver texto extraído completo</summary>
              <div style={{ background: 'var(--sur2)', border: '1px solid var(--bor)', borderRadius: 'var(--r)', padding: 10, fontSize: 11, fontFamily: 'monospace', whiteSpace: 'pre-wrap', maxHeight: 200, overflowY: 'auto', color: 'var(--txt2)' }}>
                {textoRaw}
              </div>
            </details>
          )}
        </div>
      )}

      <ModalFooter>
        <Btn variant="ghost" onClick={onClose}>Cancelar</Btn>
        {resultado && <Btn onClick={confirmar}>
          {resultado.items.length > 0 ? 'Usar estos datos' : 'Abrir factura vacía'}
        </Btn>}
        {resultado && <Btn variant="ghost" onClick={() => { setResultado(null); setTextoRaw('') }}>Reintentar</Btn>}
      </ModalFooter>
    </Modal>
  )
}
