import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { getDiaPanadero } from '../lib/utils'
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'
import logoUrl from '/logo.png'
import styles from './AppShell.module.css'
import { temaActual, cambiarTema } from '../lib/tema'
import { subirCola, pendientesOffline } from '../lib/colaOffline'

export default function AppShell() {
  const { user, logout, isAdmin } = useAuth()
  const [tema, setTema] = useState(temaActual)
  const [enLinea, setEnLinea] = useState(navigator.onLine)
  const [enCola, setEnCola] = useState(pendientesOffline)
  const [instalar, setInstalar] = useState(null)
  useEffect(() => {
    const h = e => { e.preventDefault(); setInstalar(e) }
    window.addEventListener('beforeinstallprompt', h)
    return () => window.removeEventListener('beforeinstallprompt', h)
  }, [])
  async function instalarApp() {
    if (!instalar) return
    instalar.prompt()
    await instalar.userChoice.catch(() => null)
    setInstalar(null); setMasAbierto(false)
  }

  useEffect(() => {
    const subir = async () => {
      const n = await subirCola()
      if (n > 0) { toast.success(`☁️ Subidas ${n} venta(s)/comanda(s) guardadas sin internet`); loadPendientes() }
    }
    const on = () => { setEnLinea(true); subir() }
    const off = () => setEnLinea(false)
    const cambio = e => setEnCola(e.detail)
    window.addEventListener('online', on); window.addEventListener('offline', off); window.addEventListener('cola-offline', cambio)
    subir()
    const t = setInterval(subir, 30000)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); window.removeEventListener('cola-offline', cambio); clearInterval(t) }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const navigate = useNavigate()
  const location = useLocation()
  const [pendientes, setPendientes] = useState(0)
  const [masAbierto, setMasAbierto] = useState(false)
  const dp = getDiaPanadero()

  // Crea las comandas de los pedidos fijos que toquen (también lo hace el servidor cada hora)
  useEffect(() => { supabase.rpc('generar_pedidos_fijos').then(({ data }) => { if (data > 0) loadPendientes() }) }, [])
  useEffect(() => { setMasAbierto(false) }, [location.pathname])

  useEffect(() => {
    loadPendientes()
    const iv = setInterval(loadPendientes, 30000)
    return () => clearInterval(iv)
  }, [])

  async function loadPendientes() {
    const { count } = await supabase.from('comandas').select('*', { count: 'exact', head: true }).eq('estado', 'pendiente')
    setPendientes(count || 0)
  }

  function handleLogout() {
    logout()
    toast('Sesion cerrada')
    navigate('/login', { replace: true })
  }

  const turnoCls = { tarde: styles.tTarde, noche: styles.tNoche, manana: styles.tManana }[dp.turno] || styles.tManana
  const turnoLabel = { tarde: 'Tarde', noche: 'Noche', manana: 'Manana' }[dp.turno] || 'Manana'

  const navItems = [
    { to: '/', icon: '📊', label: 'Inicio', end: true },
    { to: '/productos', icon: '🍞', label: 'Productos' },
    { to: '/clientes', icon: '👥', label: 'Clientes' },
    { to: '/ventas', icon: '💰', label: 'Ventas' },
    { to: '/comandas', icon: '📋', label: 'Comandas', badge: pendientes },
    { to: '/produccion', icon: '🏭', label: 'Produccion' },
    { to: '/proveedores', icon: '🚚', label: 'Proveedores' },
    { to: '/appcc', icon: '✅', label: 'APPCC' },
    ...(isAdmin ? [{ to: '/informes', icon: '📈', label: 'Informes' }, { to: '/usuarios', icon: '⚙️', label: 'Usuarios' }] : []),
  ]

  // Móvil: 4 accesos principales abajo y el resto en «Más»
  const PRINCIPALES = ['/', '/ventas', '/comandas', '/produccion']
  const abajo = navItems.filter(i => PRINCIPALES.includes(i.to))
  const enMas = navItems.filter(i => !PRINCIPALES.includes(i.to))
  const masActivo = enMas.some(i => location.pathname.startsWith(i.to))

  function isActive(item) {
    if (item.end) return location.pathname === item.to
    return location.pathname.startsWith(item.to)
  }

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <img src={logoUrl} alt="MariSol" className={styles.hlogo} />
        <div className={styles.hbrand}>
          <div className={styles.hn}>Productos MariSol</div>
          <div className={styles.hs}>Artesanal</div>
        </div>
        <span className={`${styles.tpill} ${turnoCls}`}>{turnoLabel}</span>
        <nav className={styles.nav}>
          {navItems.map(({ to, icon, label, end, badge }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => `${styles.navBtn} ${isActive ? styles.navOn : ''}`}>
              {icon} <span>{label}</span>
              {badge > 0 && <span className={styles.nbadge}>{badge}</span>}
            </NavLink>
          ))}
        </nav>
        <div className={styles.hright}>
          <div className={styles.huser}>
            <span className={styles.hname}>{user?.nombre}</span>
            <span className={styles.hrol}>{user?.rol}</span>
          </div>
          <button className={styles.hout} onClick={() => setTema(cambiarTema())} aria-label={tema === 'oscuro' ? 'Poner modo claro' : 'Poner modo oscuro'} title={tema === 'oscuro' ? 'Modo claro' : 'Modo oscuro'}>{tema === 'oscuro' ? '☀️' : '🌙'}</button>
          <button className={styles.hout} onClick={handleLogout}>Salir</button>
        </div>
      </header>

      {(!enLinea || enCola > 0) && (
        <div role="status" style={{ background: enLinea ? 'var(--inf)' : 'var(--wrn)', color: '#fff', textAlign: 'center', padding: '7px 12px', fontSize: 13, fontWeight: 600 }}>
          {!enLinea ? '📴 Sin internet. Puedes seguir cobrando y apuntando comandas: se guardan y se suben solas.' : `☁️ Subiendo ${enCola} pendiente(s)…`}
          {enCola > 0 && !enLinea && ` (${enCola} guardada(s))`}
        </div>
      )}

      <main className={styles.main}>
        <Outlet context={{ refreshPendientes: loadPendientes }} />
      </main>

      {masAbierto && (
        <div className={styles.masFondo} onClick={() => setMasAbierto(false)}>
          <div className={styles.masHoja} onClick={e => e.stopPropagation()} role="dialog" aria-label="Más secciones">
            <div className={styles.masAsa} />
            <div className={styles.masGrid}>
              {enMas.map(({ to, icon, label }) => (
                <button key={to} className={`${styles.masBtn} ${location.pathname.startsWith(to) ? styles.masOn : ''}`} onClick={() => navigate(to)}>
                  <span className={styles.masIcon}>{icon}</span><span>{label}</span>
                </button>
              ))}
              {instalar && (
                <button className={styles.masBtn} onClick={instalarApp}>
                  <span className={styles.masIcon}>📲</span><span>Instalar app</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <nav className={styles.bottomNav}>
        {abajo.map(({ to, icon, label, end, badge }) => (
          <button key={to} className={`${styles.bottomBtn} ${isActive({ to, end }) ? styles.on : ''}`} onClick={() => navigate(to)}>
            <span className={styles.bottomIcon}>{icon}</span>
            <span className={styles.bottomLabel}>{label}</span>
            {badge > 0 && <span className={styles.bottomBadge}>{badge}</span>}
          </button>
        ))}
        <button className={`${styles.bottomBtn} ${masActivo || masAbierto ? styles.on : ''}`} onClick={() => setMasAbierto(v => !v)} aria-expanded={masAbierto}>
          <span className={styles.bottomIcon}>☰</span>
          <span className={styles.bottomLabel}>Más</span>
        </button>
      </nav>
    </div>
  )
}
