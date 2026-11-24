// src/main.jsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import App from './App'
import { AuthProvider } from './context/AuthContext'
import './index.css'

// Si la app se carga dentro de otra copia de sí misma (versión antigua guardada en el
// navegador, que mostraba la demo del APPCC en un recuadro), se recarga la página
// completa para quedarse con la versión nueva, en vez de salir con la barra duplicada.
let dentroDeOtraCopia = false
try { dentroDeOtraCopia = window.top !== window.self && window.top.location.origin === window.location.origin } catch { /* otro dominio */ }
if (dentroDeOtraCopia) {
  window.top.location.replace('/appcc')
} else ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
        <Toaster
          position="bottom-right"
          toastOptions={{
            style: {
              background: '#2e2a5c',
              color: '#fff',
              borderRadius: '10px',
              fontSize: '13px',
              padding: '12px 16px',
            },
            success: { iconTheme: { primary: '#5dcaa5', secondary: '#fff' } },
            error: { iconTheme: { primary: '#f09595', secondary: '#fff' } },
          }}
        />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
)
