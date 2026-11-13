import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'

const env = process.env
const prod = env.NODE_ENV === 'production'

export const config = {
  prod,
  port: Number(env.PORT ?? 3001),
  dataDir: path.resolve(env.DATA_DIR ?? 'data'),
  /** public origin of the web app; used for CSRF origin checks and cookie settings */
  appOrigin: env.APP_ORIGIN ?? '',
  /** chat messages allowed per minute per IP (each message may cost an AI call) */
  chatPerMin: Number(env.CHAT_RATE_PER_MIN ?? 40),
  anthropicModel: env.ANTHROPIC_MODEL ?? 'claude-opus-5-5',
  anthropicConfigured: !!(env.ANTHROPIC_API_KEY || env.ANTHROPIC_AUTH_TOKEN) || fs.existsSync(path.join(os.homedir(), '.config', 'anthropic')),
  smtp: {
    host: env.SMTP_HOST ?? '',
    port: Number(env.SMTP_PORT ?? 587),
    user: env.SMTP_USER ?? '',
    pass: env.SMTP_PASS ?? '',
    from: env.SMTP_FROM ?? 'Bird Partner <no-reply@localhost>',
  },
  /** DEV ONLY: return the e-mail code in the API response when no SMTP server is configured. Never enable in production. */
  devOtp: !prod && env.ALLOW_DEV_OTP !== 'false',
  admin: { email: (env.ADMIN_EMAIL ?? '').trim().toLowerCase(), password: env.ADMIN_PASSWORD ?? '' },
  sheets: {
    spreadsheetId: env.GOOGLE_SHEET_ID ?? '',
    credentialsFile: env.GOOGLE_APPLICATION_CREDENTIALS ?? '',
    credentialsJson: env.GOOGLE_SERVICE_ACCOUNT_JSON ?? '',
  },
}

export const uploadsDir = path.join(config.dataDir, 'uploads')
fs.mkdirSync(uploadsDir, { recursive: true })
