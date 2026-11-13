import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import crypto from 'node:crypto'
import { z } from 'zod'
import { validThaiId13 } from '../../shared/thai.ts'
import { greeting } from '../../shared/offline.ts'
import { profileRemaining } from '../../shared/profile.ts'
import { config } from '../config.ts'
import { get, run } from '../db.ts'
import { encrypt, hashPassword, idHash, randomOtp, safeEqual, sha256, verifyPassword } from '../crypto.ts'
import { clearSignupCookie, endSession, setSignupCookie, signupId, startSession } from '../auth.ts'
import { addMessage, audit, createUserAndApp } from '../repo.ts'
import { mailConfigured, sendOtp, sendResetCode } from '../mailer.ts'

export const authRouter = Router()

const limit = (max: number, windowMin = 15) =>
  rateLimit({ windowMs: windowMin * 60_000, limit: max, standardHeaders: true, legacyHeaders: false, message: { error: 'too_many_requests' } })

const emailSchema = z.string().trim().toLowerCase().pipe(z.email().max(160))
const passwordSchema = z
  .string()
  .min(10, 'รหัสผ่านต้องยาวอย่างน้อย 10 ตัวอักษร')
  .max(128)
  .refine((p) => /[A-Za-z]/.test(p) && /\d/.test(p), 'รหัสผ่านต้องมีทั้งตัวอักษรและตัวเลข')

const startSchema = z.object({
  type: z.enum(['individual', 'business']),
  idNumber: z.string().refine(validThaiId13, 'เลข 13 หลักไม่ถูกต้อง'),
  consent: z.literal(true),
})

type SignupRow = {
  id: string; type: 'individual' | 'business'; id_enc: string; id_hash: string; consent_at: string; email: string | null
  otp_hash: string | null; otp_expires: number | null; otp_attempts: number; otp_sent_at: number | null; email_verified: number; created_at: number
}

const currentSignup = (id: string | undefined) => {
  if (!id) return undefined
  const s = get<SignupRow>('SELECT * FROM signups WHERE id = ?', id)
  if (!s || s.created_at < Date.now() - 60 * 60_000) return undefined
  return s
}

authRouter.post('/signup/start', limit(20), (req, res) => {
  const p = startSchema.safeParse(req.body)
  if (!p.success) return res.status(400).json({ error: 'invalid', message: p.error.issues[0]?.message ?? 'ข้อมูลไม่ถูกต้อง' })
  const h = idHash(p.data.idNumber)
  if (get('SELECT 1 FROM applications WHERE id_hash = ?', h)) {
    return res.status(409).json({ error: 'unavailable', message: 'ไม่สามารถใช้เลขนี้สมัครได้ ถ้าเคยสมัครแล้ว กรุณาเข้าสู่ระบบ' })
  }
  const id = crypto.randomUUID()
  run('DELETE FROM signups WHERE created_at < ?', Date.now() - 60 * 60_000)
  run('INSERT INTO signups(id, type, id_enc, id_hash, consent_at, created_at) VALUES(?,?,?,?,?,?)', id, p.data.type, encrypt(p.data.idNumber.replace(/\D/g, '')), h, new Date().toISOString(), Date.now())
  setSignupCookie(res, id)
  res.json({ ok: true })
})

authRouter.post('/signup/email', limit(10), async (req, res) => {
  const s = currentSignup(signupId(req))
  if (!s) return res.status(400).json({ error: 'no_signup', message: 'เริ่มลงทะเบียนใหม่อีกครั้งครับ' })
  const e = emailSchema.safeParse(req.body?.email)
  if (!e.success) return res.status(400).json({ error: 'invalid', message: 'รูปแบบอีเมลไม่ถูกต้อง' })
  if (get('SELECT 1 FROM users WHERE email = ?', e.data)) return res.status(409).json({ error: 'unavailable', message: 'อีเมลนี้มีบัญชีแล้ว กรุณาเข้าสู่ระบบ' })
  if (s.otp_sent_at && Date.now() - s.otp_sent_at < 45_000) return res.status(429).json({ error: 'wait', message: 'ขอรหัสใหม่ได้ภายใน 45 วินาที' })
  const code = randomOtp()
  run('UPDATE signups SET email=?, otp_hash=?, otp_expires=?, otp_attempts=0, otp_sent_at=?, email_verified=0 WHERE id=?', e.data, sha256(`${s.id}:${code}`), Date.now() + 10 * 60_000, Date.now(), s.id)
  try {
    await sendOtp(e.data, code)
  } catch (err) {
    console.error('[mail] failed', err)
    return res.status(502).json({ error: 'mail_failed', message: 'ส่งอีเมลไม่สำเร็จ กรุณาลองใหม่อีกครั้ง' })
  }
  res.json({ ok: true, email: e.data, ...(config.devOtp && !mailConfigured ? { devCode: code } : {}) })
})

authRouter.post('/signup/verify', limit(30), (req, res) => {
  const s = currentSignup(signupId(req))
  if (!s || !s.otp_hash || !s.otp_expires) return res.status(400).json({ error: 'no_code', message: 'ยังไม่ได้ขอรหัสยืนยัน' })
  if (Date.now() > s.otp_expires) return res.status(400).json({ error: 'expired', message: 'รหัสหมดอายุ กรุณาขอรหัสใหม่' })
  if (s.otp_attempts >= 5) return res.status(429).json({ error: 'locked', message: 'กรอกรหัสผิดหลายครั้ง กรุณาขอรหัสใหม่' })
  const code = String(req.body?.code ?? '').replace(/\D/g, '')
  run('UPDATE signups SET otp_attempts = otp_attempts + 1 WHERE id = ?', s.id)
  if (code.length !== 6 || !safeEqual(sha256(`${s.id}:${code}`), s.otp_hash)) return res.status(400).json({ error: 'wrong_code', message: 'รหัสไม่ถูกต้อง' })
  run('UPDATE signups SET email_verified = 1, otp_hash = NULL WHERE id = ?', s.id)
  res.json({ ok: true })
})

authRouter.post('/signup/password', limit(10), (req, res) => {
  const s = currentSignup(signupId(req))
  if (!s || !s.email_verified || !s.email) return res.status(400).json({ error: 'not_verified', message: 'ยังไม่ได้ยืนยันอีเมล' })
  const pw = passwordSchema.safeParse(req.body?.password)
  if (!pw.success) return res.status(400).json({ error: 'weak_password', message: pw.error.issues[0]?.message ?? 'รหัสผ่านไม่ผ่านเงื่อนไข' })
  if (get('SELECT 1 FROM users WHERE email = ?', s.email)) return res.status(409).json({ error: 'unavailable', message: 'อีเมลนี้มีบัญชีแล้ว' })
  const app = createUserAndApp({ email: s.email, pwHash: hashPassword(pw.data), type: s.type, idEnc: s.id_enc, idHash: s.id_hash, consentAt: s.consent_at })
  run('DELETE FROM signups WHERE id = ?', s.id)
  clearSignupCookie(res)
  const first = profileRemaining(app.type, app.profile, { hasIdPhoto: false })[0]
  addMessage(app.id, 'assistant', greeting(app.type), { mode: config.anthropicConfigured ? 'live' : 'offline', formatHint: first?.hint, why: first?.why })
  audit(app.id, 'partner', 'account_created', s.email)
  startSession(res, app.userId)
  res.json({ ok: true })
})

authRouter.post('/login', limit(10), (req, res) => {
  const e = emailSchema.safeParse(req.body?.email)
  const pw = typeof req.body?.password === 'string' ? req.body.password.slice(0, 128) : ''
  const row = e.success ? get<{ id: number; pw_hash: string; role: 'partner' | 'admin' }>('SELECT id, pw_hash, role FROM users WHERE email = ?', e.data) : undefined
  // always run a hash comparison so response time does not reveal whether the e-mail exists
  const ok = verifyPassword(pw, row?.pw_hash ?? 'scrypt$16384$AAAAAAAAAAAAAAAAAAAAAA==$' + 'A'.repeat(86) + '==')
  if (!row || !ok) return res.status(401).json({ error: 'bad_credentials', message: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' })
  startSession(res, row.id)
  res.json({ ok: true, role: row.role })
})

authRouter.post('/logout', (req, res) => {
  endSession(req, res)
  res.json({ ok: true })
})

authRouter.get('/me', (req, res) => {
  res.json({ user: req.user ? { email: req.user.email, role: req.user.role } : null, ai: { configured: config.anthropicConfigured, model: config.anthropicModel } })
})

// ------------------------------------------------------------------ forgot / reset password
/** Always answers the same way, so the endpoint cannot be used to find out which e-mails have an account. */
authRouter.post('/forgot', limit(8), async (req, res) => {
  const e = emailSchema.safeParse(req.body?.email)
  if (!e.success) return res.status(400).json({ error: 'invalid', message: 'รูปแบบอีเมลไม่ถูกต้อง' })
  const user = get<{ id: number }>('SELECT id FROM users WHERE email = ?', e.data)
  let devCode: string | undefined
  if (user) {
    const prev = get<{ sent_at: number }>('SELECT sent_at FROM resets WHERE email = ?', e.data)
    if (!prev || Date.now() - prev.sent_at > 45_000) {
      const code = randomOtp()
      run(
        'INSERT INTO resets(email, code_hash, expires_at, attempts, sent_at) VALUES(?,?,?,0,?) ON CONFLICT(email) DO UPDATE SET code_hash=excluded.code_hash, expires_at=excluded.expires_at, attempts=0, sent_at=excluded.sent_at',
        e.data, sha256(`reset:${e.data}:${code}`), Date.now() + 10 * 60_000, Date.now(),
      )
      try {
        await sendResetCode(e.data, code)
        if (config.devOtp && !mailConfigured) devCode = code
      } catch (err) {
        console.error('[mail] reset failed', err instanceof Error ? err.message : err)
      }
    }
  }
  res.json({ ok: true, ...(devCode ? { devCode } : {}) })
})

authRouter.post('/reset', limit(15), (req, res) => {
  const e = emailSchema.safeParse(req.body?.email)
  const pw = passwordSchema.safeParse(req.body?.password)
  const code = String(req.body?.code ?? '').replace(/\D/g, '')
  const generic = { error: 'bad_code', message: 'รหัสไม่ถูกต้องหรือหมดอายุ ลองขอรหัสใหม่อีกครั้ง' }
  if (!e.success) return res.status(400).json({ error: 'invalid', message: 'รูปแบบอีเมลไม่ถูกต้อง' })
  if (!pw.success) return res.status(400).json({ error: 'weak_password', message: pw.error.issues[0]?.message ?? 'รหัสผ่านไม่ผ่านเงื่อนไข' })
  const row = get<{ code_hash: string; expires_at: number; attempts: number }>('SELECT code_hash, expires_at, attempts FROM resets WHERE email = ?', e.data)
  if (!row || row.expires_at < Date.now() || row.attempts >= 5) return res.status(400).json(generic)
  run('UPDATE resets SET attempts = attempts + 1 WHERE email = ?', e.data)
  if (code.length !== 6 || !safeEqual(sha256(`reset:${e.data}:${code}`), row.code_hash)) return res.status(400).json(generic)
  const user = get<{ id: number }>('SELECT id FROM users WHERE email = ?', e.data)
  if (!user) return res.status(400).json(generic)
  run('UPDATE users SET pw_hash = ? WHERE id = ?', hashPassword(pw.data), user.id)
  run('DELETE FROM resets WHERE email = ?', e.data)
  run('DELETE FROM sessions WHERE user_id = ?', user.id) // every existing login is signed out
  audit(null, `user:${e.data}`, 'password_reset')
  res.json({ ok: true })
})
