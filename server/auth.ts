import type { NextFunction, Request, Response } from 'express'
import { config } from './config.ts'
import { get, run } from './db.ts'
import { hashPassword, randomToken, sha256 } from './crypto.ts'

export interface SessionUser {
  id: number
  email: string
  role: 'partner' | 'admin'
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: SessionUser
  }
}

const COOKIE = 'bp_session'
const SIGNUP_COOKIE = 'bp_signup'
const SESSION_DAYS = 14

const cookieBase = { httpOnly: true, sameSite: 'lax' as const, secure: config.prod, path: '/' }

export function startSession(res: Response, userId: number) {
  const token = randomToken()
  const exp = Date.now() + SESSION_DAYS * 86_400_000
  run('INSERT INTO sessions(token_hash, user_id, expires_at, created_at) VALUES(?,?,?,?)', sha256(token), userId, exp, new Date().toISOString())
  res.cookie(COOKIE, token, { ...cookieBase, maxAge: SESSION_DAYS * 86_400_000 })
}

export function endSession(req: Request, res: Response) {
  const t = req.cookies?.[COOKIE]
  if (t) run('DELETE FROM sessions WHERE token_hash = ?', sha256(String(t)))
  res.clearCookie(COOKIE, cookieBase)
}

export const setSignupCookie = (res: Response, id: string) => res.cookie(SIGNUP_COOKIE, id, { ...cookieBase, maxAge: 60 * 60 * 1000 })
export const signupId = (req: Request): string | undefined => (typeof req.cookies?.[SIGNUP_COOKIE] === 'string' ? req.cookies[SIGNUP_COOKIE] : undefined)
export const clearSignupCookie = (res: Response) => res.clearCookie(SIGNUP_COOKIE, cookieBase)

/** Loads the session user (if any) on every request. */
export function loadUser(req: Request, _res: Response, next: NextFunction) {
  const t = req.cookies?.[COOKIE]
  if (typeof t === 'string') {
    const row = get<{ id: number; email: string; role: 'partner' | 'admin'; expires_at: number }>(
      'SELECT u.id, u.email, u.role, s.expires_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?', sha256(t),
    )
    if (row && row.expires_at > Date.now()) req.user = { id: row.id, email: row.email, role: row.role }
    else if (row) run('DELETE FROM sessions WHERE token_hash = ?', sha256(t))
  }
  next()
}

export const requireUser = (req: Request, res: Response, next: NextFunction) =>
  req.user ? next() : res.status(401).json({ error: 'unauthenticated' })

export const requirePartner = (req: Request, res: Response, next: NextFunction) =>
  req.user?.role === 'partner' ? next() : res.status(401).json({ error: 'unauthenticated' })

export const requireAdmin = (req: Request, res: Response, next: NextFunction) =>
  req.user?.role === 'admin' ? next() : res.status(req.user ? 403 : 401).json({ error: req.user ? 'forbidden' : 'unauthenticated' })

/**
 * CSRF defence for cookie auth: state-changing requests must be JSON/multipart from our own origin.
 * (SameSite=Lax cookies + custom header + Origin check.)
 */
export function csrfGuard(req: Request, res: Response, next: NextFunction) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next()
  if (req.get('x-requested-with') !== 'bird-web') return res.status(403).json({ error: 'bad_request_origin' })
  const origin = req.get('origin')
  if (origin) {
    const host = req.get('host')
    let ok = false
    try {
      const o = new URL(origin)
      ok = o.host === host || (!!config.appOrigin && o.origin === config.appOrigin) || (!config.prod && /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(o.host))
    } catch {
      ok = false
    }
    if (!ok) return res.status(403).json({ error: 'bad_request_origin' })
  }
  next()
}

/** Ensures an admin account exists. A random password is generated (and printed once) when ADMIN_PASSWORD is not set. */
export function ensureAdmin() {
  const email = config.admin.email || 'admin@birdexpress.local'
  const exists = get<{ id: number }>('SELECT id FROM users WHERE email = ?', email)
  if (exists) return
  // production never invents an admin password: the operator must choose one (and a strong one)
  if (config.prod && (!config.admin.email || config.admin.password.length < 12)) {
    throw new Error('Production needs ADMIN_EMAIL and an ADMIN_PASSWORD of at least 12 characters to create the first officer account')
  }
  const password = config.admin.password || randomToken(12)
  run('INSERT INTO users(email, pw_hash, role, created_at) VALUES(?,?,?,?)', email, hashPassword(password), 'admin', new Date().toISOString())
  if (!config.admin.password) console.warn(`\n[admin] created admin account ${email}\n[admin] one-time password: ${password}\n[admin] set ADMIN_EMAIL / ADMIN_PASSWORD in .env to choose your own\n`)
  else console.log(`[admin] created admin account ${email}`)
}
