import { Router } from 'express'
import fs from 'node:fs'
import { z } from 'zod'
import { analyze } from '../../shared/readiness.ts'
import { requireAdmin } from '../auth.ts'
import { config } from '../config.ts'
import { decrypt } from '../crypto.ts'
import { addMessage, audit, getApp, getFile, listApps, listAudit, listFiles, listMessages, saveApp, toDto, uploadedKeys } from '../repo.ts'
import { filePath } from '../uploads.ts'
import { sheetsConfigured, syncNow } from '../sheets.ts'
import { sendDecision } from '../mailer.ts'

export const adminRouter = Router()
adminRouter.use(requireAdmin)

adminRouter.get('/applications', (_req, res) => {
  res.json({
    apps: listApps().map((a) => ({
      id: a.id, ref: a.ref, type: a.type, status: a.status, email: a.email, submittedAt: a.submittedAt, updatedAt: a.updatedAt,
      name: a.profile.companyNameTh || a.profile.fullName || '—', services: a.lines.length,
    })),
    sheets: { configured: sheetsConfigured },
    ai: { configured: config.anthropicConfigured, model: config.anthropicModel },
  })
})

adminRouter.get('/applications/:id', (req, res) => {
  const a = getApp(String(req.params.id))
  if (!a || a.status === 'draft') return res.status(404).json({ error: 'not_found' })
  audit(a.id, `admin:${req.user!.email}`, 'viewed')
  res.json({
    app: toDto(a),
    // the full ID number is visible to officers only, and every view is audited
    idNumber: decrypt(a.idEnc),
    findings: analyze({ type: a.type, profile: a.profile, lines: a.lines, uploadedKeys: uploadedKeys(a.id), consent: !!a.consentAt }),
    files: listFiles(a.id).map((f) => ({ id: f.id, key: f.doc_key, name: f.original_name, size: f.size, mime: f.mime, source: f.source, at: f.created_at })),
    messages: listMessages(a.id),
    audit: listAudit(a.id),
    sheet: { configured: sheetsConfigured, syncedAt: a.sheetSyncedAt, error: a.sheetError },
  })
})

adminRouter.get('/files/:id', (req, res) => {
  const f = getFile(String(req.params.id))
  if (!f) return res.status(404).json({ error: 'not_found' })
  const p = filePath(f.application_id, f.stored_name)
  if (!fs.existsSync(p)) return res.status(404).json({ error: 'not_found' })
  audit(f.application_id, `admin:${req.user!.email}`, 'file_opened', f.doc_key)
  res.setHeader('Content-Type', f.mime)
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(f.original_name)}`)
  res.sendFile(p)
})

const decisionSchema = z.object({
  decision: z.enum(['approved', 'needs_info', 'rejected']),
  note: z.string().trim().max(1000).optional(),
})

/** The only place an application's outcome is decided. The AI never approves or rejects. */
adminRouter.post('/applications/:id/decision', async (req, res) => {
  const a = getApp(String(req.params.id))
  if (!a || a.status === 'draft') return res.status(404).json({ error: 'not_found' })
  const p = decisionSchema.safeParse(req.body)
  if (!p.success) return res.status(400).json({ error: 'invalid' })
  if (p.data.decision !== 'approved' && !p.data.note) return res.status(400).json({ error: 'note_required', message: 'กรุณาระบุเหตุผลหรือรายการที่ต้องการเพิ่มเติม' })
  a.status = p.data.decision
  a.reviewNote = p.data.note
  saveApp(a)
  audit(a.id, `admin:${req.user!.email}`, p.data.decision, p.data.note)
  const text =
    p.data.decision === 'approved'
      ? 'ใบสมัครของคุณได้รับการอนุมัติแล้วครับ ทีมงาน Bird จะติดต่อเรื่องขั้นตอนถัดไป'
      : p.data.decision === 'needs_info'
        ? `เจ้าหน้าที่ขอข้อมูลเพิ่มเติมครับ: ${p.data.note}\nคุณแก้ไขข้อมูลหรือแนบเอกสารเพิ่มได้ แล้วกดส่งใบสมัครอีกครั้ง`
        : `ใบสมัครไม่ผ่านการพิจารณาครับ เหตุผล: ${p.data.note}`
  addMessage(a.id, 'system', text, {})
  await syncNow(a.id)
  void sendDecision(a.email, p.data.decision, a.ref, p.data.note)
  res.json({ ok: true, status: a.status })
})
