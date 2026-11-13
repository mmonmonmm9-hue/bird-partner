import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { config } from './config.ts'

/** Key for encrypting national ID numbers at rest. DATA_KEY (base64, 32 bytes) in production; auto-generated key file in dev. */
function loadKey(): Buffer {
  const fromEnv = process.env.DATA_KEY
  if (fromEnv) {
    const k = Buffer.from(fromEnv, 'base64')
    if (k.length !== 32) throw new Error('DATA_KEY must be 32 bytes, base64 encoded (openssl rand -base64 32)')
    return k
  }
  if (config.prod) throw new Error('DATA_KEY is required in production')
  fs.mkdirSync(config.dataDir, { recursive: true })
  const file = path.join(config.dataDir, 'dev-data.key')
  if (fs.existsSync(file)) return Buffer.from(fs.readFileSync(file, 'utf8').trim(), 'base64')
  const k = crypto.randomBytes(32)
  fs.writeFileSync(file, k.toString('base64'), { mode: 0o600 })
  console.warn('[security] generated a development data key at data/dev-data.key — set DATA_KEY in production')
  return k
}

const KEY = loadKey()

export function encrypt(plain: string): string {
  const iv = crypto.randomBytes(12)
  const c = crypto.createCipheriv('aes-256-gcm', KEY, iv)
  const enc = Buffer.concat([c.update(plain, 'utf8'), c.final()])
  return [iv, c.getAuthTag(), enc].map((b) => b.toString('base64')).join('.')
}

export function decrypt(blob: string): string {
  const [iv, tag, enc] = blob.split('.').map((s) => Buffer.from(s, 'base64'))
  const d = crypto.createDecipheriv('aes-256-gcm', KEY, iv)
  d.setAuthTag(tag)
  return Buffer.concat([d.update(enc), d.final()]).toString('utf8')
}

export const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex')
export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url')
export const randomOtp = () => String(crypto.randomInt(0, 1_000_000)).padStart(6, '0')

/** Password hashing: scrypt with a per-password salt. Format: scrypt$N$salt$hash */
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16)
  const hash = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 })
  return `scrypt$16384$${salt.toString('base64')}$${hash.toString('base64')}`
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, n, salt, hash] = stored.split('$')
  if (scheme !== 'scrypt') return false
  const calc = crypto.scryptSync(password, Buffer.from(salt, 'base64'), 64, { N: Number(n), r: 8, p: 1 })
  const expected = Buffer.from(hash, 'base64')
  return calc.length === expected.length && crypto.timingSafeEqual(calc, expected)
}

export const safeEqual = (a: string, b: string) => {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && crypto.timingSafeEqual(x, y)
}

/** Deterministic keyed hash of a national ID: lets us reject duplicate registrations without storing the number in clear. */
export const idHash = (id: string) => crypto.createHmac('sha256', KEY).update(id.replace(/\D/g, '')).digest('hex')
