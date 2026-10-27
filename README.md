# Quesos San Francisco

Aplicación web en construcción por fases para cotizaciones y gestión comercial.

## Fase 1 — Estructura y marca

- Monorepo npm con `client/` (React + Vite + Tailwind) y `server/` (Node + Express).
- Paleta de marca definida en `client/tailwind.config.js`.
- Logo en cliente, favicon PNG y manifest PWA básico; copia del logo lista para los PDF en `server/assets/logo.png`.
- La pantalla inicial es únicamente una base visual. Autenticación, datos y módulos se implementarán en fases confirmadas.

## Requisitos

- Node.js LTS y npm.

## Comandos previstos

```bash
npm install
npm run dev
npm run build
```

El cliente usa el puerto 5173. La API y sus variables de entorno se configurarán en la Fase 2.
