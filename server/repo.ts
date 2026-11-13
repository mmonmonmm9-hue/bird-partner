import fs from 'node:fs'
import path from 'node:path'
import type { AppDto, AppStatus, ApplicantType, ChatMessageDto, DocSlotDto, Profile, ServiceLine } from '../shared/types.ts'
import { profileProgress, profileRemaining } from '../shared/profile.ts'
import { docTemplates } from '../shared/docs.ts'
import { lineProgress } from '../shared/requirements.ts'
import { maskId } from '../shared/thai.ts'
import { all, get, run, tx, nextCounter } from './db.ts'
import { decrypt } from './crypto.ts'
import { config, uploadsDir } from './config.ts'

export interface AppRow {
  id: string
  userId: number
  email: string
  type: ApplicantType
  idEnc: string
  status: AppStatus
  ref?: string
  profile: Profile
  lines: ServiceLine[]
  activeLineId?: string
  consentAt?: string
  submittedAt?: string
  reviewNote?: string
  sheetSyncedAt?: string
  sheetError?: string
  createdAt: string
  updatedAt: string
}

interface Raw {
  id: string; user_id: number; email: string; type: ApplicantType; id_enc: string; status: AppStatus; ref: string | null
  profile: string; lines: string; active_line_id: string | null; consent_at: string | null; submitted_at: string | null
  review_note: string | null; sheet_synced_at: string | null; sheet_error: string | null; created_at: string; updated_at: string
}

const BASE = 'SELECT a.*, u.email AS email FROM applications a JOIN users u ON u.id = a.user_id'

const toApp = (r: Raw): AppRow => ({
  id: r.id, userId: r.user_id, email: r.email, type: r.type, idEnc: r.id_enc, status: r.status, ref: r.ref ?? undefined,
  profile: JSON.parse(r.profile), lines: JSON.parse(r.lines), activeLineId: r.active_line_id ?? undefined,
  consentAt: r.consent_at ?? undefined, submittedAt: r.submitted_at ?? undefined, reviewNote: r.review_note ?? undefined,
  sheetSyncedAt: r.sheet_synced_at ?? undefined, sheetError: r.sheet_error ?? undefined, createdAt: r.created_at, updatedAt: r.updated_at,
})

export const getAppByUser = (userId: number) => {
  const r = get<Raw>(`${BASE} WHERE a.user_id = ?`, userId)
  return r ? toApp(r) : undefined
}
export const getApp = (id: string) => {
  const r = get<Raw>(`${BASE} WHERE a.id = ?`, id)
  return r ? toApp(r) : undefined
}
export const listApps = () => all<Raw>(`${BASE} WHERE a.status != 'draft' ORDER BY CASE a.status WHEN 'submitted' THEN 0 WHEN 'needs_info' THEN 1 ELSE 2 END, a.updated_at DESC`).map(toApp)

export function saveApp(a: AppRow) {
  run(
    `UPDATE applications SET status=?, ref=?, profile=?, lines=?, active_line_id=?, consent_at=?, submitted_at=?, review_note=?, sheet_synced_at=?, sheet_error=?, updated_at=? WHERE id=?`,
    a.status, a.ref ?? null, JSON.stringify(a.profile), JSON.stringify(a.lines), a.activeLineId ?? null, a.consentAt ?? null,
    a.submittedAt ?? null, a.reviewNote ?? null, a.sheetSyncedAt ?? null, a.sheetError ?? null, new Date().toISOString(), a.id,
  )
}

/** Narrow write used by the sheet sync so it can never overwrite chat edits made concurrently. */
export const setSheetState = (id: string, syncedAt: string | null, error: string | null) =>
  run('UPDATE applications SET sheet_synced_at = COALESCE(?, sheet_synced_at), sheet_error = ? WHERE id = ?', syncedAt, error, id)

export function createUserAndApp(opts: { email: string; pwHash: string; type: ApplicantType; idEnc: string; idHash: string; consentAt: string }): AppRow {
  return tx(() => {
    const now = new Date().toISOString()
    const u = run('INSERT INTO users(email, pw_hash, role, created_at) VALUES(?, ?, ?, ?)', opts.email, opts.pwHash, 'partner', now)
    const id = `BP-${10000 + nextCounter('partner')}`
    run('INSERT INTO applications(id, user_id, type, id_enc, id_hash, status, consent_at, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)', id, Number(u.lastInsertRowid), opts.type, opts.idEnc, opts.idHash, 'draft', opts.consentAt, now, now)
    return getApp(id)!
  })
}

export const nextRef = () => {
  const d = new Date()
  return `BP-${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}-${String(nextCounter('application')).padStart(4, '0')}`
}

// ------------------------------------------------------------------ chat
export function addMessage(appId: string, role: 'user' | 'assistant' | 'system', text: string, meta: Record<string, unknown> = {}) {
  run('INSERT INTO messages(application_id, role, text, meta, created_at) VALUES(?, ?, ?, ?, ?)', appId, role, text, JSON.stringify(meta), new Date().toISOString())
}

export function listMessages(appId: string): ChatMessageDto[] {
  const files = new Map(listFiles(appId).map((f) => [f.id, f]))
  return all<{ id: number; role: ChatMessageDto['role']; text: string; meta: string | null; created_at: string }>(
    'SELECT * FROM messages WHERE application_id = ? ORDER BY id', appId,
  ).map((m) => {
    const meta = m.meta ? (JSON.parse(m.meta) as Record<string, unknown>) : {}
    const f = typeof meta.fileId === 'string' ? files.get(meta.fileId) : undefined
    return {
      id: String(m.id), role: m.role, text: m.text, at: m.created_at,
      formatHint: meta.formatHint as string | undefined, why: meta.why as string | undefined, note: meta.note as string | undefined,
      captured: meta.captured as string | undefined, showPricingLineId: meta.showPricingLineId as string | undefined, mode: meta.mode as ChatMessageDto['mode'],
      attachment: f ? { id: f.id, name: f.original_name, size: f.size, mime: f.mime } : undefined,
    }
  })
}

export const recentMessages = (appId: string, n = 14) =>
  all<{ role: string; text: string }>('SELECT role, text FROM messages WHERE application_id = ? AND role != \'system\' ORDER BY id DESC LIMIT ?', appId, n).reverse()

// ------------------------------------------------------------------ files
export interface FileRow {
  id: string; application_id: string; doc_key: string; original_name: string; stored_name: string; size: number; mime: string; source: 'chat' | 'docs'; created_at: string
}
export const listFiles = (appId: string) => all<FileRow>('SELECT * FROM files WHERE application_id = ? ORDER BY created_at', appId)
export const getFile = (id: string) => get<FileRow>('SELECT * FROM files WHERE id = ?', id)
export function addFile(f: Omit<FileRow, 'created_at'>) {
  run('INSERT INTO files(id, application_id, doc_key, original_name, stored_name, size, mime, source, created_at) VALUES(?,?,?,?,?,?,?,?,?)', f.id, f.application_id, f.doc_key, f.original_name, f.stored_name, f.size, f.mime, f.source, new Date().toISOString())
}
export function deleteFile(f: FileRow) {
  run('DELETE FROM files WHERE id = ?', f.id)
  fs.rmSync(path.join(uploadsDir, f.application_id, f.stored_name), { force: true })
}
export const uploadedKeys = (appId: string) => new Set(listFiles(appId).map((f) => f.doc_key))

export function audit(appId: string | null, actor: string, action: string, detail?: string) {
  run('INSERT INTO audit(application_id, actor, action, detail, at) VALUES(?,?,?,?,?)', appId, actor, action, detail ?? null, new Date().toISOString())
}
export const listAudit = (appId: string) => all<{ actor: string; action: string; detail: string | null; at: string }>('SELECT actor, action, detail, at FROM audit WHERE application_id = ? ORDER BY id DESC LIMIT 100', appId)

// ------------------------------------------------------------------ DTO
export function docSlots(a: AppRow): DocSlotDto[] {
  const files = listFiles(a.id)
  return docTemplates(a.type, a.profile, a.lines).map((d) => ({
    key: d.key, label: d.label, hint: d.hint, required: d.required, reason: d.reason,
    files: files.filter((f) => f.doc_key === d.key).map((f) => ({ id: f.id, name: f.original_name, size: f.size, source: f.source })),
  }))
}

export function toDto(a: AppRow): AppDto {
  const keys = uploadedKeys(a.id)
  const ctx = { hasIdPhoto: keys.has('id_front') }
  const docs = docSlots(a)
  const req = docs.filter((d) => d.required)
  return {
    id: a.id, type: a.type, status: a.status, ref: a.ref, email: a.email,
    idMasked: maskId(decrypt(a.idEnc)), profile: a.profile, lines: a.lines, activeLineId: a.activeLineId, docs,
    profileRemaining: profileRemaining(a.type, a.profile, ctx).map((p) => p.key),
    submittedAt: a.submittedAt, reviewNote: a.reviewNote,
    progress: {
      profile: profileProgress(a.type, a.profile, ctx),
      services: a.lines.length ? Math.round(a.lines.reduce((s, l) => s + lineProgress(l), 0) / a.lines.length) : 0,
      docs: req.length ? Math.round((req.filter((d) => d.files.length).length / req.length) * 100) : 100,
    },
    ai: { configured: config.anthropicConfigured, model: config.anthropicModel },
  }
}
