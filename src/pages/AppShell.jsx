// src/pages/AppShell.jsx
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
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
  const [pendientes, setPendientes] = useState(0)
  const dp = getDiaPanadero()

  useEffect(() => {
    loadPendientes()
    // Refrescar badge cada 30s
    const iv = setInterval(loadPendientes, 30000)
    return () => clearInterval(iv)
  }, [])

  async function loadPendientes() {
    const { count } = await supabase
      .from('comandas')
      .select('*', { count: 'exact', head: true })
      .eq('estado', 'pendiente')
    setPendientes(count || 0)
  }

  function handleLogout() {
    logout()
    toast('Sesión cerrada')
    navigate('/login', { replace: true })
  }

  const turnoCls = { tarde: styles.tTarde, noche: styles.tNoche, mañana: styles.tManana }[dp.turno] || styles.tManana
  const turnoLabel = { tarde: 'Turno Tarde ☀️', noche: 'Turno Noche 🌙', mañana: 'Turno Mañana 🌅' }[dp.turno]

  const navItems = [
    { to: '/', label: '📊 Inicio', end: true },
    { to: '/productos', label: '🍞 Productos' },
    { to: '/clientes', label: '👥 Clientes' },
    { to: '/ventas', label: '💰 Ventas' },
    { to: '/comandas', label: '📋 Comandas', badge: pendientes },
    { to: '/proveedores', label: '🚚 Proveedores' },
    ...(isAdmin ? [{ to: '/usuarios', label: '⚙️ Usuarios' }] : []),
  ]

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <img src={logoUrl} alt="MariSol" className={styles.hlogo} />
        <div className={styles.hbrand}>
          <div className={styles.hn}>Productos MariSol</div>
          <div className={styles.hs}>Artesanal · Con amor</div>
        </div>
        <span className={`${styles.tpill} ${turnoCls}`}>{turnoLabel}</span>

        <nav className={styles.nav}>
          {navItems.map(({ to, label, end, badge }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) => `${styles.navBtn} ${isActive ? styles.navOn : ''}`}
            >
              <span className={styles.navLabel}>{label}</span>
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
    </div>
  )
}
