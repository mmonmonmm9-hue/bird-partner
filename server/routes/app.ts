import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import fs from 'node:fs'
import crypto from 'node:crypto'
import { z } from 'zod'
import { DOC_KEYS_ALLOWED } from '../../shared/docs.ts'
import { blockers } from '../../shared/readiness.ts'
import { profileRemaining } from '../../shared/profile.ts'
import { remaining } from '../../shared/requirements.ts'
import { requireUser } from '../auth.ts'
import { config } from '../config.ts'
import { addFile, addMessage, audit, deleteFile, getApp, getAppByUser, getFile, listMessages, nextRef, saveApp, toDto, uploadedKeys, type AppRow } from '../repo.ts'
import { chatTurn, isEditable, onIdPhotoReceived } from '../engine.ts'
import { addRateReply, readRateCard } from '../rates.ts'
import { filePath, uploadMiddleware, validateAndStore } from '../uploads.ts'
import { syncApplication } from '../sheets.ts'

export const appRouter = Router()
appRouter.use(requireUser)

const chatLimit = rateLimit({ windowMs: 60_000, limit: config.chatPerMin, standardHeaders: true, legacyHeaders: false, message: { error: 'too_many_requests' } })
const uploadLimit = rateLimit({ windowMs: 10 * 60_000, limit: 40, standardHeaders: true, legacyHeaders: false, message: { error: 'too_many_requests' } })

/** The partner's own application. Admins use /api/admin instead. */
const mine = (userId: number) => getAppByUser(userId)

const snapshot = (a: AppRow) => ({ type: a.type, profile: a.profile, lines: a.lines, uploadedKeys: uploadedKeys(a.id), consent: !!a.consentAt })

appRouter.get('/', (req, res) => {
  const a = mine(req.user!.id)
  if (!a) return res.status(404).json({ error: 'no_application' })
  res.json({ app: toDto(a), messages: listMessages(a.id), blockers: blockers(snapshot(a)) })
})

appRouter.post('/chat', chatLimit, async (req, res) => {
  const a = mine(req.user!.id)
  if (!a) return res.status(404).json({ error: 'no_application' })
  if (!isEditable(a)) return res.status(409).json({ error: 'locked', message: 'ใบสมัครอยู่ระหว่างการตรวจสอบ แก้ไขไม่ได้ในขณะนี้' })
  const p = z.object({ text: z.string().trim().min(1).max(2000) }).safeParse(req.body)
  if (!p.success) return res.status(400).json({ error: 'invalid' })
  try {
    await chatTurn(a.id, p.data.text)
  } catch (e) {
    console.error('[chat] failed', e)
    return res.status(500).json({ error: 'chat_failed', message: 'ระบบขัดข้องชั่วคราว ลองส่งอีกครั้งครับ' })
  }
  const next = getApp(a.id)!
  res.json({ app: toDto(next), messages: listMessages(a.id), blockers: blockers(snapshot(next)) })
})

/** Attach a file from the chat composer (camera / attach). The AI only receives it; officers review the content. */
appRouter.post('/chat/file', uploadLimit, (req, res) => {
  uploadMiddleware(req, res, async (err) => {
    try {
      const a = mine(req.user!.id)
      if (!a) return res.status(404).json({ error: 'no_application' })
      if (!isEditable(a)) return res.status(409).json({ error: 'locked', message: 'ใบสมัครอยู่ระหว่างการตรวจสอบ' })
      if (err) return res.status(400).json({ error: 'upload', message: err.code === 'LIMIT_FILE_SIZE' ? 'ไฟล์ใหญ่เกิน 8 MB' : 'อัปโหลดไม่สำเร็จ' })
      if (!req.file) return res.status(400).json({ error: 'no_file', message: 'ไม่พบไฟล์' })
      const stored = validateAndStore(a.id, req.file)
      if ('error' in stored) return res.status(400).json({ error: 'bad_type', message: stored.error })

      // which document is this? the ID photo while it is the pending question, else what the client says, else "other"
      const pending = profileRemaining(a.type, a.profile, { hasIdPhoto: uploadedKeys(a.id).has('id_front') })[0]
      const asked = String(req.body?.docKey ?? '')
      // the rate-card button is an explicit choice by the partner: it is the only kind of file the assistant reads
      const docKey = asked === 'rate_card' ? 'rate_card' : pending?.key === 'idPhoto' ? 'id_front' : DOC_KEYS_ALLOWED.has(asked) ? asked : 'other'
      const id = crypto.randomUUID()
      addFile({ id, application_id: a.id, doc_key: docKey, original_name: stored.originalName, stored_name: stored.storedName, size: stored.size, mime: stored.mime, source: 'chat' })
      addMessage(a.id, 'user', docKey === 'id_front' ? 'ส่งรูปบัตรประชาชน' : docKey === 'rate_card' ? 'ส่งใบเสนอราคา' : 'ส่งไฟล์แนบ', { fileId: id })
      if (docKey === 'rate_card') {
        const file = getFile(id)!
        addRateReply(a.id, await readRateCard(a.id, file))
      } else if (docKey === 'id_front') await onIdPhotoReceived(a.id)
      else addMessage(a.id, 'assistant', 'ได้รับไฟล์แล้วครับ ผมเก็บไว้ให้เจ้าหน้าที่ตรวจ (ผมไม่ได้อ่านเนื้อหาในไฟล์) ถ้าเป็นเอกสารบังคับ ไปแนบในหน้า "เอกสาร" ได้ภายหลังครับ', {})
      const next = getApp(a.id)!
      res.json({ app: toDto(next), messages: listMessages(a.id), blockers: blockers(snapshot(next)) })
    } catch (e) {
      console.error('[chat/file] failed', e)
      res.status(500).json({ error: 'upload_failed', message: 'อัปโหลดไม่สำเร็จ' })
    }
  })
})

/** Confirm or ask to revise the pricing summary of a service line. */
appRouter.post('/lines/:id/pricing', async (req, res) => {
  const a = mine(req.user!.id)
  if (!a) return res.status(404).json({ error: 'no_application' })
  if (!isEditable(a)) return res.status(409).json({ error: 'locked' })
  const line = a.lines.find((l) => l.id === req.params.id)
  if (!line) return res.status(404).json({ error: 'no_line' })
  const action = req.body?.action
  if (action === 'confirm') {
    if (!line.pricing.model || remaining(line).some((r) => r.key !== 'pricing.confirm')) return res.status(400).json({ error: 'incomplete', message: 'ยังตอบเรื่องบริการและราคาไม่ครบ ผู้ช่วยจะถามต่อในแชต' })
    line.pricing.confirmed = true
    saveApp(a)
    audit(a.id, 'partner', 'pricing_confirmed', line.id)
    addMessage(a.id, 'user', 'ถูกต้อง ยืนยันโครงสร้างราคา', {})
    addMessage(a.id, 'assistant', 'บันทึกโครงสร้างราคาแล้วครับ ราคานี้เป็นราคาที่คุณเสนอ ทีมพาณิชย์ของ Bird จะตรวจก่อนใช้งานจริง\n\nมีบริการอื่นที่อยากลงทะเบียนเพิ่มไหมครับ ถ้ามีเล่าได้เลย ถ้าไม่มีแล้ว ไปที่หน้า "เอกสาร" เพื่อแนบเอกสารบังคับต่อได้เลยครับ', {
      formatHint: 'มี ผมมีคลังสินค้าด้วย หรือ ไม่มีแล้ว',
      captured: 'ยืนยันโครงสร้างราคา',
    })
    void syncApplication(a.id).catch(() => undefined)
  } else if (action === 'revise') {
    line.pricing.confirmed = false
    saveApp(a)
    addMessage(a.id, 'user', 'ขอแก้ไขโครงสร้างราคา', {})
    addMessage(a.id, 'assistant', 'ได้ครับ บอกได้เลยว่าต้องการแก้ตรงไหน เช่น "ราคาช่วง 5-20 กก. เปลี่ยนเป็น 10 บาท/กก." หรือ "เพิ่มค่าน้ำมัน 8%" แล้วผมจะอัปเดตตารางให้', { formatHint: 'ราคาช่วง 5-20 กก. เปลี่ยนเป็น 10 บาท/กก.' })
  } else return res.status(400).json({ error: 'invalid' })
  const next = getApp(a.id)!
  res.json({ app: toDto(next), messages: listMessages(a.id), blockers: blockers(snapshot(next)) })
})

// ------------------------------------------------------------------ documents page
appRouter.post('/docs/:key', uploadLimit, (req, res) => {
  uploadMiddleware(req, res, (err) => {
    try {
      const a = mine(req.user!.id)
      if (!a) return res.status(404).json({ error: 'no_application' })
      if (!isEditable(a)) return res.status(409).json({ error: 'locked' })
      const key = String(req.params.key)
      if (!DOC_KEYS_ALLOWED.has(key)) return res.status(400).json({ error: 'bad_key' })
      if (err) return res.status(400).json({ error: 'upload', message: err.code === 'LIMIT_FILE_SIZE' ? 'ไฟล์ใหญ่เกิน 8 MB' : 'อัปโหลดไม่สำเร็จ' })
      if (!req.file) return res.status(400).json({ error: 'no_file' })
      const stored = validateAndStore(a.id, req.file)
      if ('error' in stored) return res.status(400).json({ error: 'bad_type', message: stored.error })
      addFile({ id: crypto.randomUUID(), application_id: a.id, doc_key: key, original_name: stored.originalName, stored_name: stored.storedName, size: stored.size, mime: stored.mime, source: 'docs' })
      audit(a.id, 'partner', 'doc_uploaded', key)
      void syncApplication(a.id).catch(() => undefined)
      const next = getApp(a.id)!
      res.json({ app: toDto(next), blockers: blockers(snapshot(next)) })
    } catch (e) {
      console.error('[docs] failed', e)
      res.status(500).json({ error: 'upload_failed' })
    }
  })
})

appRouter.delete('/files/:id', (req, res) => {
  const a = mine(req.user!.id)
  const f = getFile(String(req.params.id))
  if (!a || !f || f.application_id !== a.id) return res.status(404).json({ error: 'not_found' })
  if (!isEditable(a)) return res.status(409).json({ error: 'locked' })
  deleteFile(f)
  audit(a.id, 'partner', 'doc_removed', f.doc_key)
  const next = getApp(a.id)!
  res.json({ app: toDto(next), blockers: blockers(snapshot(next)) })
})

/** Partners can re-open their own uploads; admins use the admin route. */
appRouter.get('/files/:id', (req, res) => {
  const a = mine(req.user!.id)
  const f = getFile(String(req.params.id))
  if (!a || !f || f.application_id !== a.id) return res.status(404).json({ error: 'not_found' })
  const p = filePath(f.application_id, f.stored_name)
  if (!fs.existsSync(p)) return res.status(404).json({ error: 'not_found' })
  res.setHeader('Content-Type', f.mime)
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(f.original_name)}`)
  res.sendFile(p)
})

// ------------------------------------------------------------------ submit
appRouter.post('/submit', async (req, res) => {
  const a = mine(req.user!.id)
  if (!a) return res.status(404).json({ error: 'no_application' })
  if (!isEditable(a)) return res.status(409).json({ error: 'locked', message: 'ส่งใบสมัครไปแล้ว' })
  const b = blockers(snapshot(a))
  if (b.length) return res.status(400).json({ error: 'blocked', message: 'ยังส่งไม่ได้ ต้องแก้ไขรายการต่อไปนี้ก่อน', blockers: b })
  a.status = 'submitted'
  a.ref = a.ref ?? nextRef()
  a.submittedAt = new Date().toISOString()
  a.reviewNote = undefined
  saveApp(a)
  audit(a.id, 'partner', 'submitted', a.ref)
  addMessage(a.id, 'assistant', `ส่งใบสมัครเรียบร้อยแล้วครับ เลขอ้างอิง ${a.ref} เจ้าหน้าที่ Bird จะตรวจสอบและแจ้งผลทางอีเมล`, {})
  void syncApplication(a.id).catch(() => undefined)
  const next = getApp(a.id)!
  res.json({ app: toDto(next), blockers: [] })
})
