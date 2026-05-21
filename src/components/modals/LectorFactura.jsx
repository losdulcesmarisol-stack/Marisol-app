import { useState } from 'react'
import { Btn, Modal, ModalFooter } from '../ui'
import toast from 'react-hot-toast'

const VISION_KEY = 'AIzaSyA3zpAFy5OPaaZYC0cdI3xY7Xwpu4L5ojQ'

export default function LectorFactura({ onDatosExtraidos, onClose }) {
  const [imagen, setImagen] = useState(null)
  const [preview, setPreview] = useState(null)
  const [leyendo, setLeyendo] = useState(false)
  const [resultado, setResultado] = useState(null)

  function onFoto(e) {
    const file = e.target.files[0]
    if (!file) return
    setImagen(file)
    const reader = new FileReader()
    reader.onload = ev => setPreview(ev.target.result)
    reader.readAsDataURL(file)
    setResultado(null)
  }

  async function leerFactura() {
    if (!imagen) { toast.error('Selecciona una foto primero'); return }
    setLeyendo(true)
    try {
      // Convertir imagen a base64
      const base64 = await new Promise((res, rej) => {
        const reader = new FileReader()
        reader.onload = e => res(e.target.result.split(',')[1])
        reader.onerror = rej
        reader.readAsDataURL(imagen)
      })

      // Llamar a Google Cloud Vision
      const resp = await fetch(
        `https://vision.googleapis.com/v1/images:annotate?key=${VISION_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            requests: [{
              image: { content: base64 },
              features: [{ type: 'TEXT_DETECTION', maxResults: 1 }]
            }]
          })
        }
      )
      const data = await resp.json()
      const texto = data.responses?.[0]?.fullTextAnnotation?.text || ''

      if (!texto) {
        toast.error('No se pudo leer texto en la imagen')
        setLeyendo(false)
        return
      }

      // Extraer datos de la factura con lógica inteligente
      const lineas = texto.split('\n').map(l => l.trim()).filter(l => l)
      const items = []
      let proveedor = ''
      let numeroFactura = ''
      let fecha = ''

      // Detectar proveedor (primera línea con texto largo)
      for (const l of lineas.slice(0, 5)) {
        if (l.length > 4 && !/^\d/.test(l) && !l.includes('€') && !l.includes('EUR')) {
          proveedor = l
          break
        }
      }

      // Detectar número de factura
      for (const l of lineas) {
        const mF = l.match(/(?:factura|fra|n[uú]m|n[°º])[:\s.]*([A-Z0-9\-\/]+)/i)
        if (mF) { numeroFactura = mF[1]; break }
      }

      // Detectar fecha
      for (const l of lineas) {
        const mD = l.match(/(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/)
        if (mD) { fecha = mD[0]; break }
      }

      // Detectar líneas de producto con precio
      // Busca patrones: DESCRIPCION ... CANTIDAD ... PRECIO
      const regexPrecio = /(\d+[.,]\d{2})\s*€?$/
      const regexCant = /^\s*(\d+(?:[.,]\d+)?)\s+/

      for (let i = 0; i < lineas.length; i++) {
        const l = lineas[i]
        const matchPrecio = l.match(/(\d+[.,]\d{2})\s*[€]?\s*$/)
        if (!matchPrecio) continue

        const precio = parseFloat(matchPrecio[1].replace(',', '.'))
        if (precio <= 0 || precio > 9999) continue

        // Extraer nombre del producto (texto antes del precio)
        const sinPrecio = l.replace(matchPrecio[0], '').trim()
        
        // Extraer cantidad al inicio si existe
        const matchCant = sinPrecio.match(/^(\d+(?:[.,]\d+)?)\s+(.+)/)
        let nombre = sinPrecio
        let cantidad = 1
        let precioUnit = precio

        if (matchCant) {
          cantidad = parseFloat(matchCant[1].replace(',', '.'))
          nombre = matchCant[2].trim()
          if (cantidad > 0 && cantidad < 10000) {
            precioUnit = precio / cantidad
          }
        }

        if (nombre.length > 2 && nombre.length < 60) {
          items.push({
            nombre: nombre.substring(0, 50),
            cantidad: cantidad,
            precio_unit: parseFloat(precioUnit.toFixed(2))
          })
        }
      }

      const datosExtraidos = { proveedor, numeroFactura, fecha, items, textoCompleto: texto }
      setResultado(datosExtraidos)
      toast.success(`Leída: ${items.length} producto(s) detectado(s)`)
    } catch (e) {
      toast.error('Error al leer la factura: ' + e.message)
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
    <Modal open title="📷 Lector automático de facturas" onClose={onClose} wide>
      <div style={{ fontSize: 13, color: 'var(--txt2)', marginBottom: 12, background: 'var(--purbg)', border: '1px solid var(--bor2)', borderRadius: 'var(--r)', padding: '9px 12px' }}>
        💡 Haz una foto clara a la factura. La IA extraerá automáticamente los productos y precios.
      </div>

      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--txt2)', textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 5 }}>
          Foto de la factura
        </label>
        <input type="file" accept="image/*" capture="environment" onChange={onFoto}
          style={{ padding: 8, background: 'var(--sur2)', border: '1.5px solid var(--bor)', borderRadius: 'var(--r)', width: '100%' }} />
      </div>

      {preview && (
        <img src={preview} alt="Factura" style={{ width: '100%', maxHeight: 200, objectFit: 'cover', borderRadius: 'var(--r)', marginBottom: 12, border: '1px solid var(--bor)' }} />
      )}

      {imagen && !resultado && (
        <Btn fullWidth onClick={leerFactura} disabled={leyendo}>
          {leyendo ? '🔍 Leyendo factura con IA...' : '🔍 Leer factura automáticamente'}
        </Btn>
      )}

      {resultado && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontWeight: 600, color: 'var(--pur)', fontSize: 13, marginBottom: 8 }}>
            ✅ Datos extraídos de la factura
          </div>

          {resultado.proveedor && (
            <div style={{ fontSize: 12, color: 'var(--txt2)', marginBottom: 4 }}>
              🏭 Proveedor detectado: <strong>{resultado.proveedor}</strong>
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

          {resultado.items.length === 0 ? (
            <div style={{ background: 'rgba(181,46,30,.08)', border: '1px solid rgba(181,46,30,.2)', borderRadius: 'var(--r)', padding: '10px 12px', fontSize: 12, color: 'var(--err)' }}>
              ⚠️ No se detectaron líneas de producto. Revisa que la foto sea clara y la factura esté bien iluminada.
            </div>
          ) : (
            <>
              <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 6 }}>
                📦 {resultado.items.length} producto(s) detectado(s):
              </div>
              <div style={{ border: '1px solid var(--bor)', borderRadius: 'var(--r)', overflow: 'hidden', marginBottom: 10 }}>
                {resultado.items.map((item, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 11px', borderBottom: i < resultado.items.length - 1 ? '1px solid var(--bor)' : 'none', fontSize: 12 }}>
                    <span style={{ flex: 1, fontWeight: 500 }}>{item.nombre}</span>
                    <span style={{ color: 'var(--txt3)', minWidth: 50 }}>{item.cantidad} ud</span>
                    <span style={{ color: 'var(--pur)', fontWeight: 700, minWidth: 60, textAlign: 'right' }}>
                      {item.precio_unit.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}/ud
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}

          <div style={{ fontSize: 11, color: 'var(--txt3)', marginBottom: 10 }}>
            Puedes revisar y editar los datos antes de guardar en la pantalla de factura.
          </div>
        </div>
      )}

      <ModalFooter>
        <Btn variant="ghost" onClick={onClose}>Cancelar</Btn>
        {resultado && resultado.items.length > 0 && (
          <Btn onClick={confirmar}>✅ Usar estos datos</Btn>
        )}
      </ModalFooter>
    </Modal>
  )
}
