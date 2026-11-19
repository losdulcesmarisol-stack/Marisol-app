// src/pages/AppccDemoPage.jsx
// DEMO del módulo APPCC (temperaturas, limpieza, lotes, stock, trazabilidad, alérgenos).
// Funciona con datos de ejemplo dentro de public/appcc-demo.html y NO lee ni escribe
// nada en la base de datos. Solo lo ven los administradores.
import { useAuth } from '../context/AuthContext'

export default function AppccDemoPage() {
  const { user, isAdmin } = useAuth()
  const q = new URLSearchParams({ embed: '1', usuario: user?.nombre || '', rol: isAdmin ? 'admin' : 'empleado' })
  return (
    <div className="fade-in" style={{ margin: '-8px -4px 0' }}>
      <iframe
        title="Demo APPCC"
        src={`/appcc-demo.html?${q}`}
        style={{ width: '100%', height: 'calc(100vh - 110px)', minHeight: 600, border: '1px solid var(--bor)', borderRadius: 'var(--rl)', background: 'var(--bg)' }}
      />
    </div>
  )
}
