# Quesos San Francisco

Aplicación web en construcción por fases para cotizaciones y gestión comercial.

## Fase 1 — Estructura y marca

- Monorepo npm con `client/` (React + Vite + Tailwind) y `server/` (Node + Express + Mongoose).
- Paleta de marca en `client/tailwind.config.js`.
- Logo para cliente y PDF, favicon PNG y manifest PWA básico.

## Fase 2 — Backend base

- Conexión Mongoose a MongoDB antes de abrir el puerto HTTP; cierre ordenado y estado de salud en `GET /api/health`.
- Variables validadas al iniciar. En producción se exige MongoDB con TLS y una cantidad explícita de saltos de proxy.
- Helmet con CSP, HSTS en producción y cabeceras de protección; CORS limitado al origen configurado.
- Límite global de solicitudes, payload máximo de 100 KB, protección de contaminación de parámetros, sanitización de operadores MongoDB y verificación de origen para métodos que modifican datos.
- Registro Pino sin query strings ni cabeceras de autenticación; manejo centralizado de errores con mensajes genéricos.

## Fase 3 — Autenticación

- Registro con bcrypt (costo 12), reglas de contraseña fuerte, verificación de correo de un solo uso y primer usuario con rol `admin`; los siguientes se crean como `vendedor`.
- Inicio de sesión con mensajes genéricos, bloqueo de 15 minutos después de cinco intentos erróneos, límite de intentos por IP y opción de sesión extendida.
- JWT de acceso de 15 minutos y refresh token aleatorio rotativo almacenado solo como hash. Las cookies de sesión usan `httpOnly`, `SameSite=Strict` y `Secure` en producción; cerrar sesión y restablecer la contraseña revocan sesiones.
- Recuperación de contraseña con enlace de un solo uso válido por 15 minutos. El token nunca se guarda en claro en MongoDB.
- Protección CSRF con cookie de doble envío y cabecera `X-CSRF-Token`, además de validación de origen.
- Cliente con pantallas de registro, inicio de sesión, verificación, recuperación y cambio de contraseña; estado autenticado en memoria, sin guardar tokens en `localStorage`.

## Correo y secretos de autenticación

El `.env` local ya contiene secretos JWT generados aleatoriamente. No los publiques ni los copies a Git. Para habilitar registro, verificación y restablecimiento, completa en `.env` `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS` y `SMTP_FROM`. Los campos SMTP se dejan vacíos en `.env.example` y deben configurarse juntos. Sin SMTP, el registro no crea la cuenta y la recuperación mantiene una respuesta genérica.

Al preparar otro entorno, genera valores independientes para `ACCESS_TOKEN_SECRET` y `REFRESH_TOKEN_SECRET` (mínimo 32 caracteres aleatorios cada uno). En producción, configura cookies HTTPS a través de un proxy confiable.

## Requisitos

- Node.js 22 LTS o superior y npm.
- MongoDB local o una instancia administrada. En producción debe usar TLS.

## Instalación y ejecución local

1. Instale dependencias: `npm install`.
2. Copie `.env.example` a `.env` en la raíz, genere dos valores distintos para `ACCESS_TOKEN_SECRET` y `REFRESH_TOKEN_SECRET` con `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`, y ajuste `MONGODB_URI` si su MongoDB no usa el puerto local por defecto.
3. Inicie MongoDB.
4. Ejecute `npm run dev` para iniciar cliente y API. El cliente usa el puerto 5173 y la API el 4000.
5. Consulte `http://localhost:4000/api/health`; la respuesta debe indicar `ready`.

Rutas de autenticación: `POST /api/auth/register`, `/login`, `/logout`, `/refresh`, `/verify-email`, `/forgot-password` y `/reset-password`; `GET /api/auth/csrf` y `/me`. Las operaciones que cambian datos requieren la cookie CSRF más la cabecera `X-CSRF-Token`.

`client/.env.example` documenta `VITE_API_URL`, reservado para la integración del frontend en una fase posterior.

## Variables de entorno del servidor

| Variable | Uso | Valor local de ejemplo |
|---|---|---|
| `NODE_ENV` | Entorno de ejecución | `development` |
| `PORT` | Puerto de la API | `4000` |
| `CLIENT_URL` | Origen único permitido para el frontend | `http://localhost:5173` |
| `MONGODB_URI` | Cadena de conexión a MongoDB | `mongodb://127.0.0.1:27017/quesos_san_francisco` |
| `TRUST_PROXY_HOPS` | Número de proxies confiables delante de la API | `0` en local; configurar según el despliegue en producción |
| `ACCESS_TOKEN_SECRET` / `REFRESH_TOKEN_SECRET` | Secretos JWT independientes de 32+ caracteres | Generar uno distinto para cada variable |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Transporte de correo para enlaces de verificación y recuperación | Configurar todos juntos |

Para producción, use `mongodb+srv://` o `tls=true` en la URI, configure el proxy HTTPS y establezca `TRUST_PROXY_HOPS` al número real de saltos confiables. No exponga la API directamente con `trust proxy` habilitado si no controla ese proxy.

## Comandos

```bash
npm run dev
npm run build
npm start
npm run audit
```

Las fases siguientes agregarán almacenes, quesos y precios; cotizaciones; PDF; Drive; dashboard; auditoría y seed.
