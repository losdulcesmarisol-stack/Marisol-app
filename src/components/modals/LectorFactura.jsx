import { useState } from 'react'
import { Btn, Modal, ModalFooter } from '../ui'
import toast from 'react-hot-toast'

const VISION_KEY = 'AIzaSyA3zpAFy5OPaaZYC0cdI3xY7Xwpu4L5ojQ'

// Redimensiona la imagen antes de enviarla para evitar errores con fotos muy grandes
function resizeImage(file, maxWidth = 1200) {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        let width = img.width
        let height = img.height
        if (width > maxWidth) {
          height = Math.round(height * maxWidth / width)
          width = maxWidth
        }
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0, width, height)
        const base64 = canvas.toDataURL('image/jpeg', 0.85).split(',')[1]
        resolve(base64)
      }
      img.src = e.target.result
    }
    reader.readAsDataURL(file)
  })
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
    setImagen(file)
    const reader = new FileReader()
    reader.onload = ev => setPreview(ev.target.result)
    reader.readAsDataURL(file)
    setResultado(null)
    setTextoRaw('')
  }

  async function leerFactura() {
    if (!imagen) { toast.error('Selecciona una foto primero'); return }
    setLeyendo(true)
    try {
      // Redimensionar imagen
      const base64 = await resizeImage(imagen)

      // Llamar a Google Cloud Vision
      const resp = await fetch(
        `https://vision.googleapis.com/v1/images:annotate?key=${VISION_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            requests: [{
              image: { content: base64 },
              features: [
                { type: 'TEXT_DETECTION', maxResults: 1 },
                { type: 'DOCUMENT_TEXT_DETECTION', maxResults: 1 }
              ]
            }]
          })
        }
      )

      const data = await resp.json()

      if (data.error) {
        toast.error('Error API: ' + data.error.message)
        setLeyendo(false)
        return
      }

      const texto = data.responses?.[0]?.fullTextAnnotation?.text ||
                    data.responses?.[0]?.textAnnotations?.[0]?.description || ''

      if (!texto) {
        toast.error('No se detectó texto. Asegúrate de que la foto esté bien iluminada y enfocada.')
        setLeyendo(false)
        return
      }

      setTextoRaw(texto)

      // Extraer datos inteligentemente
      const lineas = texto.split('\n').map(l => l.trim()).filter(l => l.length > 0)
      const items = []
      let proveedor = ''
      let numeroFactura = ''
      let fecha = ''

      // Detectar proveedor
      for (const l of lineas.slice(0, 6)) {
        if (l.length > 3 && !/^\d/.test(l) && !l.includes('€') && !l.includes('EUR') && !l.match(/factura|albaran|fecha|total|iva/i)) {
          proveedor = l
          break
        }
      }

      // Detectar número de factura
      for (const l of lineas) {
        const m = l.match(/(?:factura|fra\.?|f\.?|n[uú]m\.?|n[°º]\.?)[:\s#]*([A-Z0-9][A-Z0-9\-\/]{2,})/i)
        if (m) { numeroFactura = m[1]; break }
      }

      // Detectar fecha
      for (const l of lineas) {
        const m = l.match(/(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/)
        if (m) { fecha = m[0]; break }
      }

      // Detectar líneas de producto con precio
      for (let i = 0; i < lineas.length; i++) {
        const l = lineas[i]

        // Buscar precio al final de la línea
        const mPrecio = l.match(/(\d{1,4}[.,]\d{2})\s*€?\s*$/)
        if (!mPrecio) continue

        const precio = parseFloat(mPrecio[1].replace(',', '.'))
        if (precio <= 0 || precio > 50000) continue

        // Limpiar la línea quitando el precio
        let resto = l.slice(0, l.lastIndexOf(mPrecio[0])).trim()
        if (resto.length < 2) continue

        // Buscar cantidad al inicio
        const mCant = resto.match(/^(\d+(?:[.,]\d+)?)\s+x?\s*(.+)/i) ||
                      resto.match(/^(.+)\s+x\s*(\d+(?:[.,]\d+)?)/i)

        let nombre = resto
        let cantidad = 1
        let precioUnit = precio

        if (mCant) {
          const posibleCant = parseFloat((mCant[1] || '').replace(',', '.'))
          if (!isNaN(posibleCant) && posibleCant > 0 && posibleCant < 10000) {
            cantidad = posibleCant
            nombre = (mCant[2] || resto).trim()
            precioUnit = parseFloat((precio / cantidad).toFixed(4))
          }
        }

        // Filtrar líneas que no son productos
        if (nombre.match(/total|subtotal|iva|descuento|base|impuesto/i)) continue
        if (nombre.length < 2 || nombre.length > 80) continue

        items.push({
          nombre: nombre.substring(0, 60),
          cantidad: cantidad,
          precio_unit: parseFloat(precioUnit.toFixed(2))
        })
      }

      setResultado({ proveedor, numeroFactura, fecha, items, textoCompleto: texto })

      if (items.length === 0) {
        toast.error('No se detectaron productos con precio. Revisa el texto extraído abajo.')
      } else {
        toast.success(items.length + ' producto(s) detectado(s)')
      }

    } catch (e) {
      toast.error('Error: ' + e.message)
      console.error(e)
    } finally {
      setLeyendo(false)
    }
  }

  function confirmar() {
    if (!resultado) return
    onDatosExtraidos(resultado)
    onClose()
  }

  // Añadir producto manualmente desde el texto
  function addManual() {
    if (!resultado) return
    onDatosExtraidos({ ...resultado, items: resultado.items })
    onClose()
  }

  return (
    <Modal open title="Lector de facturas con IA" onClose={onClose} wide>
      <div style={{ fontSize: 13, color: 'var(--txt2)', marginBottom: 12, background: 'var(--purbg)', border: '1px solid var(--bor2)', borderRadius: 'var(--r)', padding: '9px 12px' }}>
        💡 Haz una foto clara a la factura con buena luz y sin sombras. Cuanto más nítida mejor.
      </div>

      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--txt2)', textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 5 }}>
          Foto de la factura
        </label>
        <input type="file" accept="image/*" capture="environment" onChange={onFoto}
          style={{ padding: 8, background: 'var(--sur2)', border: '1.5px solid var(--bor)', borderRadius: 'var(--r)', width: '100%' }} />
      </div>

      {preview && (
        <img src={preview} alt="Factura" style={{ width: '100%', maxHeight: 220, objectFit: 'cover', borderRadius: 'var(--r)', marginBottom: 12, border: '1px solid var(--bor)' }} />
      )}

      {imagen && !resultado && (
        <Btn fullWidth onClick={leerFactura} disabled={leyendo}>
          {leyendo ? '🔍 Leyendo factura...' : '🔍 Leer factura automáticamente'}
        </Btn>
      )}

      {resultado && (
        <div style={{ marginTop: 12 }}>
          {resultado.proveedor && (
            <div style={{ fontSize: 12, color: 'var(--txt2)', marginBottom: 4 }}>
              🏭 Proveedor: <strong>{resultado.proveedor}</strong>
            </div>
          )}
          {resultado.numeroFactura && (
            <div style={{ fontSize: 12, color: 'var(--txt2)', marginBottom: 4 }}>
              🧾 Número: <strong>{resultado.numeroFactura}</strong>
            </div>
          )}
          {resultado.fecha && (
            <div style={{ fontSize: 12, color: 'var(--txt2)', marginBottom: 8 }}>
              📅 Fecha: <strong>{resultado.fecha}</strong>
            </div>
          )}

          {resultado.items.length > 0 ? (
            <>
              <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--pur)', marginBottom: 6 }}>
                {resultado.items.length} producto(s) detectado(s):
              </div>
              <div style={{ border: '1px solid var(--bor)', borderRadius: 'var(--r)', overflow: 'hidden', marginBottom: 10 }}>
                {resultado.items.map((item, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 11px', borderBottom: i < resultado.items.length - 1 ? '1px solid var(--bor)' : 'none', fontSize: 12 }}>
                    <span style={{ flex: 1, fontWeight: 500 }}>{item.nombre}</span>
                    <span style={{ color: 'var(--txt3)', minWidth: 50 }}>{item.cantidad} ud</span>
                    <span style={{ color: 'var(--pur)', fontWeight: 700 }}>
                      {item.precio_unit.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}/ud
                    </span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <>
              <div style={{ background: 'rgba(176,106,16,.08)', border: '1px solid rgba(176,106,16,.22)', borderRadius: 'var(--r)', padding: '10px 12px', fontSize: 12, color: 'var(--wrn)', marginBottom: 10 }}>
                ⚠️ No se detectaron productos automáticamente. Puedes usar el texto extraído para introducirlos manualmente.
              </div>
              {textoRaw && (
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--txt2)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 5 }}>
                    Texto extraído de la factura:
                  </div>
                  <div style={{ background: 'var(--sur2)', border: '1px solid var(--bor)', borderRadius: 'var(--r)', padding: '10px', fontSize: 11, fontFamily: 'monospace', whiteSpace: 'pre-wrap', maxHeight: 200, overflowY: 'auto', color: 'var(--txt2)' }}>
                    {textoRaw}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      <ModalFooter>
        <Btn variant="ghost" onClick={onClose}>Cancelar</Btn>
        {resultado && (
          <Btn onClick={confirmar}>
            {resultado.items.length > 0 ? 'Usar estos datos' : 'Abrir factura vacía'}
          </Btn>
        )}
        {imagen && resultado && (
          <Btn variant="ghost" onClick={() => { setResultado(null); setTextoRaw('') }}>
            Volver a intentar
          </Btn>
        )}
      </ModalFooter>
    </Modal>
  )
}
