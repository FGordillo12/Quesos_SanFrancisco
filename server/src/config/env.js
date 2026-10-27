import dotenv from 'dotenv'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'

dotenv.config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)) })

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
  GOOGLE_DRIVE_CLIENT_EMAIL: z.preprocess((value) => value === '' ? undefined : value, z.string().email().optional()),
  GOOGLE_DRIVE_PRIVATE_KEY: z.preprocess((value) => value === '' ? undefined : value, z.string().min(100).optional()),
  GOOGLE_DRIVE_FOLDER_ID: z.preprocess((value) => value === '' ? undefined : value, z.string().min(5).max(200).optional()),
  GOOGLE_OAUTH_CLIENT_ID: z.preprocess((value) => value === '' ? undefined : value, z.string().min(10).optional()),
  GOOGLE_OAUTH_CLIENT_SECRET: z.preprocess((value) => value === '' ? undefined : value, z.string().min(10).optional()),
  GOOGLE_OAUTH_REDIRECT_URI: z.preprocess((value) => value === '' ? undefined : value, z.url().optional()),
  GOOGLE_PICKER_API_KEY: z.preprocess((value) => value === '' ? undefined : value, z.string().min(10).optional()),
  GOOGLE_PICKER_APP_ID: z.preprocess((value) => value === '' ? undefined : value, z.string().regex(/^\d+$/).optional()),
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
const driveServiceFields = [parsed.GOOGLE_DRIVE_CLIENT_EMAIL, parsed.GOOGLE_DRIVE_PRIVATE_KEY]
if (driveServiceFields.some(Boolean) && driveServiceFields.some((value) => !value)) {
  throw new Error('Configure GOOGLE_DRIVE_CLIENT_EMAIL y GOOGLE_DRIVE_PRIVATE_KEY juntos.')
}
const oauthFields = [parsed.GOOGLE_OAUTH_CLIENT_ID, parsed.GOOGLE_OAUTH_CLIENT_SECRET]
if (oauthFields.some(Boolean) && oauthFields.some((value) => !value)) {
  throw new Error('Configure GOOGLE_OAUTH_CLIENT_ID y GOOGLE_OAUTH_CLIENT_SECRET juntos.')
}
const pickerFields = [parsed.GOOGLE_PICKER_API_KEY, parsed.GOOGLE_PICKER_APP_ID]
if (pickerFields.some(Boolean) && pickerFields.some((value) => !value)) {
  throw new Error('Configure GOOGLE_PICKER_API_KEY y GOOGLE_PICKER_APP_ID juntos.')
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
  googleDriveServiceAccount: parsed.GOOGLE_DRIVE_CLIENT_EMAIL ? Object.freeze({
    clientEmail: parsed.GOOGLE_DRIVE_CLIENT_EMAIL,
    privateKey: parsed.GOOGLE_DRIVE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  }) : null,
  googleDriveFolderId: parsed.GOOGLE_DRIVE_FOLDER_ID || null,
  googleOAuth: parsed.GOOGLE_OAUTH_CLIENT_ID ? Object.freeze({
    clientId: parsed.GOOGLE_OAUTH_CLIENT_ID,
    clientSecret: parsed.GOOGLE_OAUTH_CLIENT_SECRET,
    redirectUri: parsed.GOOGLE_OAUTH_REDIRECT_URI || 'http://localhost:4000/api/drive/oauth/callback',
    pickerApiKey: parsed.GOOGLE_PICKER_API_KEY || null,
    pickerAppId: parsed.GOOGLE_PICKER_APP_ID || null,
  }) : null,
})
