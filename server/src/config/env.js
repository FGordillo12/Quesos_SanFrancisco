import 'dotenv/config'
import { z } from 'zod'

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  CLIENT_URL: z.url().default('http://localhost:5173'),
  MONGODB_URI: z.string().min(1, 'MONGODB_URI es obligatoria.'),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(10).default(0),
  ACCESS_TOKEN_SECRET: z.string().min(32),
  REFRESH_TOKEN_SECRET: z.string().min(32),
  SMTP_HOST: z.preprocess((value) => value === '' ? undefined : value, z.string().min(1).optional()),
  SMTP_PORT: z.preprocess((value) => value === '' ? undefined : value, z.coerce.number().int().min(1).max(65535).optional()),
  SMTP_SECURE: z.enum(['true', 'false']).default('false'),
  SMTP_USER: z.preprocess((value) => value === '' ? undefined : value, z.string().min(1).optional()),
  SMTP_PASS: z.preprocess((value) => value === '' ? undefined : value, z.string().min(1).optional()),
  SMTP_FROM: z.preprocess((value) => value === '' ? undefined : value, z.string().min(3).optional()),
})

const result = schema.safeParse(process.env)
if (!result.success) {
  const details = result.error.issues.map((issue) => `- ${issue.path.join('.') || 'configuración'}: ${issue.message}`).join('\n')
  throw new Error(`Configuración de entorno inválida:\n${details}`)
}

const parsed = result.data
const smtpFields = [parsed.SMTP_HOST, parsed.SMTP_PORT, parsed.SMTP_USER, parsed.SMTP_PASS, parsed.SMTP_FROM]
if (smtpFields.some(Boolean) && smtpFields.some((value) => !value)) {
  throw new Error('Configure SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS y SMTP_FROM juntos.')
}
const clientOrigin = new URL(parsed.CLIENT_URL).origin
if (parsed.NODE_ENV === 'production') {
  const tlsEnabled = parsed.MONGODB_URI.startsWith('mongodb+srv://') || /[?&]tls=true(?:&|$)/i.test(parsed.MONGODB_URI)
  if (!tlsEnabled) throw new Error('En producción, MONGODB_URI debe usar mongodb+srv o tls=true.')
  if (parsed.TRUST_PROXY_HOPS < 1) throw new Error('En producción, configure TRUST_PROXY_HOPS según el proxy HTTPS de despliegue.')
}

export const env = Object.freeze({
  nodeEnv: parsed.NODE_ENV,
  port: parsed.PORT,
  clientUrl: clientOrigin,
  mongoUri: parsed.MONGODB_URI,
  trustProxyHops: parsed.TRUST_PROXY_HOPS,
  isProduction: parsed.NODE_ENV === 'production',
  accessTokenSecret: parsed.ACCESS_TOKEN_SECRET,
  refreshTokenSecret: parsed.REFRESH_TOKEN_SECRET,
  smtp: parsed.SMTP_HOST ? Object.freeze({
    host: parsed.SMTP_HOST,
    port: parsed.SMTP_PORT,
    secure: parsed.SMTP_SECURE === 'true',
    user: parsed.SMTP_USER,
    pass: parsed.SMTP_PASS,
    from: parsed.SMTP_FROM,
  }) : null,
})
