// src/context/AuthContext.jsx
// Sesión real de Supabase: el PIN se comprueba en el servidor (función
// "login-pin"), la sesión se guarda en el dispositivo y sobrevive a recargar.
import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

function usuarioDeSesion(session) {
  const m = session?.user?.app_metadata
  return m?.usuario_id ? { id: m.usuario_id, nombre: m.nombre, rol: m.rol } : null
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null) // { id, nombre, rol }
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUser(usuarioDeSesion(data.session))
      setCargando(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_evento, session) => {
      setUser(usuarioDeSesion(session))
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  // Devuelve null si todo va bien, o el mensaje de error para mostrar.
  const login = useCallback(async (usuarioId, pin) => {
    const { data, error } = await supabase.functions.invoke('login-pin', {
      body: { usuario_id: usuarioId, pin },
    })
    if (error) {
      let msg = 'No se pudo entrar. Revisa la conexión.'
      try { msg = (await error.context.json()).error || msg } catch { /* sin cuerpo */ }
      return msg
    }
    const { data: v, error: e2 } = await supabase.auth.verifyOtp({ token_hash: data.token_hash, type: 'magiclink' })
    if (e2) return 'No se pudo abrir la sesión: ' + e2.message
    setUser(usuarioDeSesion(v.session) || data.usuario)
    return null
  }, [])

  const logout = useCallback(async () => {
    await supabase.auth.signOut()
    setUser(null)
  }, [])

  const isAdmin = user?.rol === 'admin'

  return (
    <AuthContext.Provider value={{ user, cargando, login, logout, isAdmin }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider')
  return ctx
}
