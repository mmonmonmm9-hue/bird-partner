import express from 'express'
import helmet from 'helmet'
import cookieParser from 'cookie-parser'
import path from 'node:path'
import fs from 'node:fs'
import { config } from './config.ts'
import './db.ts'
import { csrfGuard, ensureAdmin, loadUser } from './auth.ts'
import { authRouter } from './routes/auth.ts'
import { appRouter } from './routes/app.ts'
import { adminRouter } from './routes/admin.ts'
import { sheetsConfigured } from './sheets.ts'
import { mailConfigured } from './mailer.ts'
import { run } from './db.ts'

const app = express()
app.disable('x-powered-by')
if (config.prod) app.set('trust proxy', 1)

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:', 'blob:'],
        frameSrc: ["'self'"],
        objectSrc: ["'self'"],
        connectSrc: ["'self'"],
        frameAncestors: ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  }),
)
app.use(express.json({ limit: '64kb' }))
app.use(cookieParser())
app.use(loadUser)
app.use('/api', csrfGuard)

app.get('/api/health', (_req, res) => res.json({ ok: true }))
app.use('/api/auth', authRouter)
app.use('/api/app', appRouter)
app.use('/api/admin', adminRouter)
app.use('/api', (_req, res) => res.status(404).json({ error: 'not_found' }))

// production: serve the built web app
const dist = path.resolve('web/dist')
if (fs.existsSync(path.join(dist, 'index.html'))) {
  app.use(express.static(dist, { index: false, maxAge: '1h' }))
  app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')))
}

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[error]', err)
  res.status(500).json({ error: 'server_error', message: 'ระบบขัดข้อง ลองใหม่อีกครั้ง' })
})

ensureAdmin()
setInterval(() => {
  run('DELETE FROM sessions WHERE expires_at < ?', Date.now())
  run('DELETE FROM signups WHERE created_at < ?', Date.now() - 60 * 60_000)
}, 30 * 60_000).unref()

app.listen(config.port, () => {
  console.log(`\nBird Partner API on http://localhost:${config.port}`)
  console.log(`  AI:      ${config.anthropicConfigured ? `Claude (${config.anthropicModel})` : 'offline rule-based fallback (set ANTHROPIC_API_KEY for the live model)'}`)
  console.log(`  Sheets:  ${sheetsConfigured ? 'Google Sheets sync ON' : 'not configured (data stays in the local database)'}`)
  console.log(`  E-mail:  ${mailConfigured ? 'SMTP' : config.devOtp ? 'no SMTP — verification code is printed here and shown on screen (dev mode)' : 'no SMTP — codes are only printed in this log'}`)
})
