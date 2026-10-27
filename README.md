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

- Registro abierto con bcrypt (costo 12) y reglas de contraseña fuerte. Toda cuenta nueva inicia activa con rol `vendedor`; no depende de SMTP. El administrador se asigna manualmente en MongoDB hasta implementar el módulo de usuarios y roles.
- Inicio de sesión con mensajes genéricos, bloqueo de 15 minutos después de cinco intentos erróneos, límite de intentos por IP y opción de sesión extendida.
- JWT de acceso de 15 minutos y refresh token aleatorio rotativo almacenado solo como hash. Las cookies de sesión usan `httpOnly`, `SameSite=Strict` y `Secure` en producción; cerrar sesión y restablecer la contraseña revocan sesiones.
- Recuperación de contraseña con enlace de un solo uso válido por 15 minutos. El token nunca se guarda en claro en MongoDB.
- Protección CSRF con cookie de doble envío y cabecera `X-CSRF-Token`, además de validación de origen.
- Cliente con pantallas de registro, inicio de sesión, verificación, recuperación y cambio de contraseña; estado autenticado en memoria, sin guardar tokens en `localStorage`.

## Fase 4 — Catálogo, almacenes y precios

- CRUD autenticado de quesos y almacenes; solo `admin` puede crear, editar o desactivar. Las bajas son lógicas para conservar referencias.
- Matriz de tarifas particulares por queso y almacén, y una tarifa general por queso para facturas de almacenes nuevos. El vendedor consulta, pero no cambia precios.
- Cambios de precios en lote dentro de una transacción MongoDB, con historial de valor anterior/nuevo, usuario y fecha.
- El cotizador tiene una sola pantalla: selecciona un almacén registrado o permite ingresar los datos de uno nuevo sin guardarlo en el catálogo. Para el segundo caso usa la tarifa general; nunca pide al vendedor que escriba el precio del queso.

## Fase 5 — Cotizador

- Una sola pantalla ofrece ambas opciones de destino: almacén registrado (tarifa particular) o almacén nuevo (snapshot solo en la cotización y tarifa general).
- El vendedor agrega queso y cantidad; solo se muestran precios ya configurados. Las cantidades de kg admiten hasta tres decimales y las unidades deben ser enteras.
- La API consulta el catálogo y recalcula precios, subtotales y total usando aritmética entera; no acepta precios ni totales del navegador.
- El consecutivo `QSF-000001` se asigna con contador atómico dentro de una transacción MongoDB. La cotización congela nombre, unidad, precio y subtotal de cada línea.
- Vendedores solo consultan sus cotizaciones; administración puede consultar todas.

## Correo y secretos de autenticación

El `.env` local contiene secretos JWT generados aleatoriamente. No los publiques ni los copies a Git. SMTP solo es necesario para enviar enlaces de restablecimiento de contraseña; el alta abierta no envía correos. Si no se configura SMTP, la recuperación mantiene una respuesta genérica.

Para asignar el primer administrador manualmente, registra la cuenta y actualiza su documento en `users` desde MongoDB Atlas Data Explorer o Compass, por ejemplo: `db.users.updateOne({ email: "correo@empresa.com" }, { $set: { role: "admin" } })`. Las cuentas públicas siempre se crean como `vendedor`.

Para Google Drive en una unidad compartida, configura `GOOGLE_DRIVE_CLIENT_EMAIL` y `GOOGLE_DRIVE_PRIVATE_KEY`, y agrega la cuenta de servicio como editora. Las cuentas de servicio no tienen cuota propia y no pueden ser propietarias de archivos; para guardar en Mi unidad personal, configura OAuth con `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` y `GOOGLE_OAUTH_REDIRECT_URI`, además de `GOOGLE_PICKER_API_KEY` y `GOOGLE_PICKER_APP_ID`. Activa Drive API y Google Picker API, registra la URI de retorno exacta del `.env`, y restringe la API key al origen de tu cliente y a Google Picker API. Conecta la cuenta desde Empresa e impresión y selecciona la carpeta en el selector. La aplicación pide acceso `drive.file` a los archivos seleccionados; el token de renovación se cifra en MongoDB.

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

Rutas de autenticación: `POST /api/auth/register`, `/login`, `/logout`, `/refresh`, `/verify-email`, `/forgot-password` y `/reset-password`; `GET /api/auth/csrf` y `/me`. El catálogo usa `/api/stores`, `/api/cheeses` y `/api/prices` (incluye `/general` e `/history`). El cotizador usa `POST /api/quotes`, `GET /api/quotes`, `GET /api/quotes/:id` y `GET /api/quotes/:id/pdf`. La configuración de empresa usa `GET` y `PUT /api/settings/company` (edición solo para administrador). Las operaciones que cambian datos requieren la cookie CSRF más la cabecera `X-CSRF-Token`.

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
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Transporte opcional para recuperación de contraseña | Configurar todos juntos |
| `GOOGLE_DRIVE_CLIENT_EMAIL`, `GOOGLE_DRIVE_PRIVATE_KEY`, `GOOGLE_DRIVE_FOLDER_ID` | Cuenta de servicio para una unidad compartida | Credenciales de servicio juntas; folder ID es opcional si se usa OAuth |
| `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REDIRECT_URI` | Credenciales OAuth para conectar una unidad personal | ID y secreto juntos; el retorno local por defecto es `http://localhost:4000/api/drive/oauth/callback` |
| `GOOGLE_PICKER_API_KEY`, `GOOGLE_PICKER_APP_ID` | Permiten seleccionar la carpeta con el acceso limitado `drive.file` | API key y número de proyecto juntos |

Para producción, use `mongodb+srv://` o `tls=true` en la URI, configure el proxy HTTPS y establezca `TRUST_PROXY_HOPS` al número real de saltos confiables. Las transacciones de precios requieren una instancia MongoDB replica set (MongoDB Atlas cumple este requisito). No exponga la API directamente con `trust proxy` habilitado si no controla ese proxy.

## Comandos

```bash
npm run dev
npm run build
npm start
npm run audit
```

La Fase 6 genera PDF en carta o térmica de 80/58 mm, con datos de empresa y perfil configurable desde Empresa e impresión. Para la GOOJPRT PT-210, el PDF térmico de 58 mm centra el contenido en los 48 mm imprimibles. El perfil de impresión queda congelado al guardar cada cotización.

La Fase 7 guarda automáticamente el PDF de una cotización nueva en la carpeta seleccionada de Google Drive. Usa una cuenta de servicio para unidades compartidas o OAuth `drive.file` y Google Picker para Mi unidad personal. La aplicación conserva el ID y enlace del archivo para evitar subidas repetidas. Dashboard, auditoría, seed y ampliación de pruebas quedan para fases posteriores.
