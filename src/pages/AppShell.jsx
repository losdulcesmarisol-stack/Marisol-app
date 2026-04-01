import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { getDiaPanadero } from '../lib/utils'
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'
import logoUrl from '/logo.png'
import styles from './AppShell.module.css'

export default function AppShell() {
  const { user, logout, isAdmin } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [pendientes, setPendientes] = useState(0)
  const dp = getDiaPanadero()

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
    { to: '/proveedores', icon: '🚚', label: 'Proveedores' },
    ...(isAdmin ? [{ to: '/usuarios', icon: '⚙️', label: 'Usuarios' }] : []),
  ]

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
          <button className={styles.hout} onClick={handleLogout}>Salir</button>
        </div>
      </header>

      <main className={styles.main}>
        <Outlet context={{ refreshPendientes: loadPendientes }} />
      </main>

      <nav className={styles.bottomNav}>
        {navItems.map(({ to, icon, label, end, badge }) => (
          <button
            key={to}
            className={`${styles.bottomBtn} ${isActive({ to, end }) ? styles.on : ''}`}
            onClick={() => navigate(to)}
          >
            <span className={styles.bottomIcon}>{icon}</span>
            <span className={styles.bottomLabel}>{label}</span>
            {badge > 0 && <span className={styles.bottomBadge}>{badge}</span>}
          </button>
        ))}
      </nav>
    </div>
  )
}
