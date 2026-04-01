# 🥖 Productos MariSol — App de Gestión de Panadería

## INSTRUCCIONES COMPLETAS PASO A PASO

---

## PASO 1 — INSTALAR NODE.JS (solo la primera vez)

1. Entra en https://nodejs.org
2. Descarga la versión LTS (la verde, recomendada)
3. Instálala con las opciones por defecto
4. Verifica que se instaló correctamente:
   - Abre el terminal (en Mac: busca "Terminal"; en Windows: busca "PowerShell")
   - Escribe: `node --version`
   - Debe aparecer algo como: v20.10.0
   - Escribe: `npm --version`
   - Debe aparecer algo como: 10.2.3

---

## PASO 2 — DESCARGAR EL PROYECTO

Tienes dos opciones:

### Opción A — Subir a GitHub y clonar (RECOMENDADO)
1. Ve a github.com → botón verde "New" → crea repositorio "marisol-app"
2. En tu ordenador, abre el terminal en la carpeta donde tienes el proyecto
3. Ejecuta estos comandos uno a uno:

```bash
git init
git add .
git commit -m "Primera versión de Panadería MariSol"
git branch -M main
git remote add origin https://github.com/TUNOMBRE/marisol-app.git
git push -u origin main
```

### Opción B — Usar directamente la carpeta
Simplemente abre el terminal en la carpeta del proyecto.

---

## PASO 3 — INSTALAR DEPENDENCIAS

En el terminal, dentro de la carpeta del proyecto:

```bash
npm install
```

Esto descarga todas las librerías necesarias (puede tardar 1-2 minutos).

---

## PASO 4 — CONFIGURAR SUPABASE

### 4.1 Ejecutar el SQL (si no lo has hecho ya)

1. Ve a supabase.com → tu proyecto
2. Menú izquierdo → SQL Editor → New query
3. Copia y pega el contenido del archivo `supabase_setup_v3.sql`
4. Pulsa Run (botón verde)
5. Verifica en Table Editor que aparecen 8 tablas

### 4.2 Verificar el archivo .env.local

El archivo `.env.local` ya tiene tus credenciales:
```
VITE_SUPABASE_URL=https://lkcoxxcwtsvdyjeyyqll.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_Il4ay0whxQIXDTdZ-0tvCQ_uR7-FUKj
```

---

## PASO 5 — PROBAR EN LOCAL

```bash
npm run dev
```

Verás algo como:
```
  ➜  Local:   http://localhost:5173/
```

Abre esa URL en el navegador. La app debe aparecer con el login de MariSol.

**Usuarios por defecto:**
- Marisol (admin) → PIN: 1234
- Empleado → PIN: 0000

---

## PASO 6 — EJECUTAR LOS TESTS

```bash
npm test
```

Verás los resultados de todas las pruebas. Deben salir en verde.

---

## PASO 7 — COMPILAR PARA PRODUCCIÓN

```bash
npm run build
```

Esto crea una carpeta `dist/` con la app lista para subir a internet.

Para verificar que la build funciona correctamente:
```bash
npm run preview
```

---

## PASO 8 — DESPLEGAR EN NETLIFY (gratis, con URL pública)

### 8.1 Conectar GitHub a Netlify

1. Ve a netlify.com → Log in with GitHub
2. Pulsa "Add new site" → "Import an existing project"
3. Selecciona GitHub → elige tu repositorio marisol-app
4. En la configuración:
   - **Build command:** `npm run build`
   - **Publish directory:** `dist`
5. Pulsa "Deploy site"

### 8.2 Añadir las variables de entorno en Netlify

IMPORTANTE: Netlify necesita las variables de entorno por separado.

1. En Netlify → tu sitio → Site configuration → Environment variables
2. Pulsa "Add a variable" y añade:
   - Key: `VITE_SUPABASE_URL`  → Value: `https://lkcoxxcwtsvdyjeyyqll.supabase.co`
   - Key: `VITE_SUPABASE_ANON_KEY` → Value: `sb_publishable_Il4ay0whxQIXDTdZ-0tvCQ_uR7-FUKj`
3. Vuelve a hacer deploy: Deploys → Trigger deploy → Deploy site

### 8.3 Cambiar el nombre del sitio (opcional)

1. Site configuration → General → Change site name
2. Ponle por ejemplo: `marisol-panaderia`
3. Tu URL será: https://marisol-panaderia.netlify.app

---

## PASO 9 — INSTALAR EN EL MÓVIL COMO APP

Una vez que tengas la URL de Netlify:

### En iPhone/iPad:
1. Abre Safari (DEBE ser Safari, no Chrome)
2. Ve a tu URL de Netlify (ej: https://marisol-panaderia.netlify.app)
3. Pulsa el botón de compartir (cuadrado con flecha hacia arriba)
4. Desplázate hacia abajo → "Añadir a pantalla de inicio"
5. Ponle nombre: "MariSol"
6. Pulsa "Añadir"
7. Aparecerá el icono con el logo en tu pantalla de inicio

### En Android:
1. Abre Chrome
2. Ve a tu URL de Netlify
3. Pulsa los tres puntos (menú)
4. "Añadir a pantalla de inicio" o "Instalar aplicación"
5. Pulsa "Instalar"

### En ordenador (Windows/Mac):
1. Abre Chrome o Edge
2. Ve a tu URL de Netlify
3. En la barra de direcciones, verás un icono de instalar (ordenador con flecha)
4. Pulsa "Instalar Productos MariSol"

---

## PASO 10 — ACTUALIZACIONES FUTURAS

Cuando quieras actualizar la app:

1. Modifica el código
2. En el terminal:
```bash
git add .
git commit -m "Descripción del cambio"
git push
```
3. Netlify detecta el cambio y despliega automáticamente en 1-2 minutos

---

## SOLUCIÓN DE ERRORES COMUNES

### Error: "Sin usuarios — ejecuta el SQL primero"
→ Solución: Ejecuta el archivo SQL en Supabase → SQL Editor

### Error: "Error conectando con Supabase"
→ Comprueba las variables de entorno en .env.local
→ En Netlify, verifica que las variables de entorno están configuradas

### Error: "npm: command not found"
→ Node.js no está instalado. Ve al Paso 1.

### Error: "Cannot find module"
→ Ejecuta `npm install` en la carpeta del proyecto

### La app no carga en Netlify
→ Verifica que el Build command es `npm run build`
→ Verifica que el Publish directory es `dist`
→ Añade un archivo `netlify.toml` en la raíz con este contenido:
```toml
[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

### El login no funciona
→ Comprueba en Supabase → Table Editor → tabla usuarios
→ Debe haber al menos un usuario con activo=true

### Las fotos de facturas no se suben
→ En Supabase → Storage, verifica que existe un bucket llamado "facturas" con acceso público

---

## ESTRUCTURA DEL PROYECTO

```
marisol-app/
├── public/
│   └── logo.png              ← Logo de MariSol
├── src/
│   ├── components/
│   │   ├── ui/               ← Botones, cards, modales, tablas...
│   │   └── modals/           ← Modal de albarán
│   ├── context/
│   │   └── AuthContext.jsx   ← Gestión de sesión/login
│   ├── hooks/
│   │   ├── useProductos.js   ← Lógica de productos
│   │   └── useClientes.js    ← Lógica de clientes
│   ├── lib/
│   │   ├── supabase.js       ← Conexión a base de datos
│   │   └── utils.js          ← Funciones de utilidad
│   ├── pages/
│   │   ├── LoginPage.jsx     ← Pantalla de login con PIN
│   │   ├── AppShell.jsx      ← Cabecera y navegación
│   │   ├── DashboardPage.jsx ← Inicio con estadísticas
│   │   ├── ProductosPage.jsx ← Catálogo de productos
│   │   ├── ClientesPage.jsx  ← Gestión de clientes
│   │   ├── VentasPage.jsx    ← Punto de venta
│   │   ├── ComandasPage.jsx  ← Comandas pendientes
│   │   ├── ProveedoresPage.jsx ← Proveedores y facturas
│   │   ├── ComparadorPage.jsx  ← Comparador de precios
│   │   └── UsuariosPage.jsx  ← Gestión de usuarios
│   ├── test/
│   │   └── utils.test.js     ← Tests automáticos
│   ├── App.jsx               ← Rutas de la aplicación
│   ├── main.jsx              ← Punto de entrada
│   └── index.css             ← Estilos globales
├── .env.local                ← Credenciales Supabase (NO subir a git)
├── .gitignore                ← Archivos excluidos de git
├── index.html                ← HTML principal
├── package.json              ← Dependencias
└── vite.config.js            ← Configuración con PWA
```

---

## MEJORAS FUTURAS RECOMENDADAS

1. **Notificaciones push** — avisar al móvil cuando llega una comanda nueva
2. **Modo offline** — que funcione sin internet con sincronización posterior
3. **Estadísticas avanzadas** — comparativa semanal/mensual, gráficas de crecimiento
4. **Exportación a Excel** — descargar ventas del mes en formato Excel
5. **Múltiples panaderías** — sistema multi-tenant para escalar el negocio
6. **Backup automático** — exportación periódica de datos
7. **Escáner de código de barras** — para leer facturas de proveedores

---

## CONTACTO Y SOPORTE

Si tienes algún problema siguiendo estas instrucciones, describe:
1. En qué paso estás
2. Qué mensaje de error aparece exactamente
3. Qué sistema operativo usas (Windows/Mac/Linux)
