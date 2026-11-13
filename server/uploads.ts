import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import multer from 'multer'
import { uploadsDir } from './config.ts'

export const MAX_FILE_BYTES = 8 * 1024 * 1024

/** Memory storage: nothing touches disk until the content has been validated by its magic bytes. */
export const uploadMiddleware = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_FILE_BYTES, files: 1, fields: 6 } }).single('file')

const SIGNATURES: { mime: string; ext: string; test: (b: Buffer) => boolean }[] = [
  { mime: 'image/jpeg', ext: 'jpg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: 'image/png', ext: 'png', test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { mime: 'image/webp', ext: 'webp', test: (b) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP' },
  { mime: 'application/pdf', ext: 'pdf', test: (b) => b.subarray(0, 5).toString('latin1') === '%PDF-' },
  { mime: 'image/heic', ext: 'heic', test: (b) => b.subarray(4, 8).toString('latin1') === 'ftyp' && /^(heic|heix|hevc|mif1|msf1)/.test(b.subarray(8, 12).toString('latin1')) },
]

export interface StoredFile {
  storedName: string
  mime: string
  size: number
  originalName: string
}

/** Detects the real type from content (the client-supplied mime/extension is ignored), then writes under uploads/<appId>/. */
export function validateAndStore(appId: string, file: Express.Multer.File): StoredFile | { error: string } {
  const sig = SIGNATURES.find((s) => s.test(file.buffer))
  if (!sig) return { error: 'รองรับเฉพาะไฟล์ JPG, PNG, WEBP, HEIC และ PDF เท่านั้น' }
  const dir = path.join(uploadsDir, appId)
  fs.mkdirSync(dir, { recursive: true })
  const storedName = `${crypto.randomUUID()}.${sig.ext}`
  fs.writeFileSync(path.join(dir, storedName), file.buffer, { mode: 0o600 })
  // multer decodes names as latin1; restore UTF-8 (Thai file names) and strip anything path-like
  const decoded = Buffer.from(file.originalname, 'latin1').toString('utf8')
  const originalName = path.basename(decoded).replace(/[^\p{L}\p{N}._ ()-]/gu, '_').slice(0, 120) || `file.${sig.ext}`
  return { storedName, mime: sig.mime, size: file.size, originalName }
}

export const filePath = (appId: string, storedName: string) => path.join(uploadsDir, appId, path.basename(storedName))
