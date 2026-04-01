// src/App.jsx
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import LoginPage from './pages/LoginPage'
import AppShell from './pages/AppShell'
import DashboardPage from './pages/DashboardPage'
import ProductosPage from './pages/ProductosPage'
import ClientesPage from './pages/ClientesPage'
import VentasPage from './pages/VentasPage'
import ComandasPage from './pages/ComandasPage'
import ProveedoresPage from './pages/ProveedoresPage'
import ComparadorPage from './pages/ComparadorPage'
import UsuariosPage from './pages/UsuariosPage'

// Protege rutas privadas
function PrivateRoute({ children }) {
  const { user } = useAuth()
  return user ? children : <Navigate to="/login" replace />
}

// Protege rutas solo para admin
function AdminRoute({ children }) {
  const { user, isAdmin } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  if (!isAdmin) return <Navigate to="/" replace />
  return children
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<PrivateRoute><AppShell /></PrivateRoute>}>
        <Route index element={<DashboardPage />} />
        <Route path="productos" element={<ProductosPage />} />
        <Route path="clientes" element={<ClientesPage />} />
        <Route path="ventas" element={<VentasPage />} />
        <Route path="comandas" element={<ComandasPage />} />
        <Route path="proveedores" element={<ProveedoresPage />} />
        <Route path="comparador" element={<ComparadorPage />} />
        <Route path="usuarios" element={<AdminRoute><UsuariosPage /></AdminRoute>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
