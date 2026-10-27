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

## Requisitos

- Node.js 22 LTS o superior y npm.
- MongoDB local o una instancia administrada. En producción debe usar TLS.

## Instalación y ejecución local

1. Instale dependencias: `npm install`.
2. Copie `.env.example` a `.env` en la raíz y ajuste `MONGODB_URI` si su MongoDB no usa el puerto local por defecto.
3. Inicie MongoDB.
4. Ejecute `npm run dev` para iniciar cliente y API. El cliente usa el puerto 5173 y la API el 4000.
5. Consulte `http://localhost:4000/api/health`; la respuesta debe indicar `ready`.

`client/.env.example` documenta `VITE_API_URL`, reservado para la integración del frontend en una fase posterior.

## Variables de entorno del servidor

| Variable | Uso | Valor local de ejemplo |
|---|---|---|
| `NODE_ENV` | Entorno de ejecución | `development` |
| `PORT` | Puerto de la API | `4000` |
| `CLIENT_URL` | Origen único permitido para el frontend | `http://localhost:5173` |
| `MONGODB_URI` | Cadena de conexión a MongoDB | `mongodb://127.0.0.1:27017/quesos_san_francisco` |
| `TRUST_PROXY_HOPS` | Número de proxies confiables delante de la API | `0` en local; configurar según el despliegue en producción |

Para producción, use `mongodb+srv://` o `tls=true` en la URI, configure el proxy HTTPS y establezca `TRUST_PROXY_HOPS` al número real de saltos confiables. No exponga la API directamente con `trust proxy` habilitado si no controla ese proxy.

## Comandos

```bash
npm run dev
npm run build
npm start
npm run audit
```

Las fases siguientes agregarán autenticación, modelos de negocio, cotizaciones, PDF, Drive, seed y sus pruebas.
