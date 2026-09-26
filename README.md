# Control de Asistencia y Portería

## Estructura

```
control-asistencia/
├─ index.html            <- redirige a login o a la app según la sesión
├─ assets/                <- logo de la empresa, imágenes
├─ css/
│  └─ styles.css          <- paleta y estilos compartidos (usado por login.html)
├─ js/
│  ├─ supabaseConfig.js   <- ⚠️ completar con tu URL y anon key de Supabase
│  ├─ supabaseClient.js   <- crea el cliente de Supabase
│  └─ auth.js             <- requireAuth() / logout() para proteger páginas
├─ migrations/
│  └─ 001_schema.sql      <- esquema completo (tablas + RLS) para Supabase
├─ pages/
│  ├─ login.html          <- inicio de sesión (Supabase Auth, sin registro público)
│  └─ app.html            <- la aplicación completa (todos los módulos)
├─ package.json
└─ .gitignore
```

## 1. Configurar Supabase (una sola vez)

1. Crea un proyecto en https://supabase.com (o usa uno que ya tengas).
2. Abre el **SQL Editor** y ejecuta el contenido de `migrations/001_schema.sql`.
3. En **Authentication → Providers → Email**, desactiva
   "Allow new users to sign up" — el acceso es solo por invitación.
4. Invita a cada usuario desde **Authentication → Users → Invite user**
   (o con `supabase.auth.admin.inviteUserByEmail(...)` desde un backend).
5. Después de que el usuario acepte la invitación, crea su fila en la
   tabla `perfiles` con su rol (`admin`, `oficina`, `porteria`, `bodega`,
   `prevencion` o `rrhh`).
6. En **Project Settings → API**, copia el **Project URL** y la
   **anon public key**, y pégalos en `js/supabaseConfig.js`.

## 2. Probar localmente

```bash
npm start
```
Abre la URL que indique (normalmente `http://localhost:3000`). Debería
mandarte a `pages/login.html` si no hay sesión activa.

## 3. Subir a Git

```bash
cd control-asistencia
git init
git add .
git commit -m "Login por invitación + estructura de páginas"
git branch -M main
git remote add origin <URL-de-tu-repositorio>
git push -u origin main
```

## 4. Publicar

Sitio 100% estático — funciona en Vercel, Netlify o GitHub Pages sin
build command (output: la raíz del proyecto).

## Estado actual de la migración a Supabase

✅ **Ya conectado a Supabase:**
- Login / logout (`pages/login.html`, `js/auth.js`), invitación-only.
- `pages/app.html` está protegida: si no hay sesión, redirige a login.

⏳ **Pendiente (todavía usa localStorage dentro de `app.html`):**
- Trabajadores, tarjeta, asistencia, bodega, herramientas, supervisores,
  empresa. El esquema de todas estas tablas ya existe en
  `migrations/001_schema.sql`; falta reemplazar cada función que hoy
  lee/escribe `localStorage` por una llamada a `window.supabaseClient
  .from('tabla')...`. Recomiendo hacerlo un módulo a la vez — dime cuál
  quieres primero (sugiero **Trabajadores**, porque el resto depende de
  esa tabla) y sigo con el reemplazo.

Mientras un módulo no esté migrado, sus datos quedan guardados solo en
el navegador de cada dispositivo (no se comparten entre portería,
bodega y oficina).

## Notas de negocio ya definidas

- Códigos de marcaje: `X` Presente, `F` Falla, `P` Permiso, `L` Licencia,
  `A` Accidente Mutual, `PP` Permiso Pagado, `V` Vacaciones.
- Días efectivos (liquidación) = X + V + PP. Días reales trabajados
  (informes) = solo X. Base 30 = (X+V+PP) llevado proporcionalmente a
  un mes de 30 días. Licencias/Accidentes = L + A. Inasistencias = F + P.
- Los supervisores son trabajadores marcados "Es supervisor"; cada
  trabajador puede tener un `supervisor_code` asignado.
- Tarjeta CR80 (85.6×53.98mm): frente con foto/QR/código de barras y
  logo de empresa; reverso con contacto de emergencia y prevención.
