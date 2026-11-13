import type { ChatMessageDto, ServiceLine } from '../shared/types.ts'
import { applyProfilePatch, profileRemaining, sanitizeProfilePatch } from '../shared/profile.ts'
import { applyPatch, CARRY_ALL_RE, nextRequirement } from '../shared/requirements.ts'
import { sanitizePatch } from '../shared/patch.ts'
import { CARGO_TYPES, newLine } from '../shared/schema.ts'
import { addMessage, audit, recentMessages, saveApp, uploadedKeys, getApp, type AppRow } from './repo.ts'
import { aiTurn } from './ai.ts'
import { syncApplication } from './sheets.ts'

const NAMES: Record<string, string> = {
  fullName: 'ชื่อ-นามสกุล', phone: 'เบอร์โทร', birthDate: 'วันเกิด', address: 'ที่อยู่', province: 'จังหวัด', postalCode: 'รหัสไปรษณีย์',
  bankName: 'ธนาคาร', bankAccountNo: 'เลขบัญชี', bankAccountName: 'ชื่อบัญชี', nameOnCardConfirmed: 'ยืนยันชื่อบนบัตร',
  companyNameTh: 'ชื่อบริษัท', contactName: 'ผู้ติดต่อ', contactPhone: 'เบอร์ผู้ติดต่อ', registeredAddress: 'ที่อยู่จดทะเบียน',
  vatRegistered: 'สถานะ VAT', directorName: 'กรรมการ', uboName: 'เจ้าของผู้รับผลประโยชน์', uboPercent: 'สัดส่วนถือหุ้น', directorId: 'กรรมการ',
}

const activeLine = (a: AppRow): ServiceLine | undefined => a.lines.find((l) => l.id === a.activeLineId) ?? a.lines[a.lines.length - 1]

/** Editable state is only mutable before the officers have the application (or when they asked for more info). */
export const isEditable = (a: AppRow) => a.status === 'draft' || a.status === 'needs_info'

/**
 * Runs one conversational turn:
 *  - the AI (live Claude, or the offline rule-based fallback) returns a reply + structured patches
 *  - every patch is sanitized again here (model output is untrusted) before touching the application
 *  - requirement lists decide what is still missing; the AI never decides completeness or approval
 */
export async function chatTurn(appId: string, text: string, opts: { echoUser?: boolean } = {}): Promise<void> {
  let app = getApp(appId)!
  if (opts.echoUser !== false) addMessage(app.id, 'user', text)
  const keys = uploadedKeys(app.id)
  const hasIdPhoto = keys.has('id_front')

  // once the applicant profile is complete the interview moves to services: make sure there is a line to fill
  if (!profileRemaining(app.type, app.profile, { hasIdPhoto }).length && !app.lines.length) {
    const l = newLine()
    app.lines.push(l)
    app.activeLineId = l.id
  }

  const history = recentMessages(app.id, 14).slice(0, -1) // everything before the message we just stored
  const result = await aiTurn({ app, text, line: activeLine(app), hasIdPhoto, history })

  // ---- apply patches (sanitized)
  const captured: string[] = []
  const { patch: profPatch } = sanitizeProfilePatch(result.profilePatch, app.type)
  if (Object.keys(profPatch).length) {
    app.profile = applyProfilePatch(app.profile, profPatch)
    captured.push(...Object.keys(profPatch).map((k) => NAMES[k] ?? k))
  }

  // Service details are kept even when the applicant volunteers them while profile questions are still open
  // (what to ask next is still decided by the requirement lists, in order).
  const lp = sanitizePatch(result.patch)
  const profileDone = !profileRemaining(app.type, app.profile, { hasIdPhoto }).length
  if ((profileDone && (result.newLine || !app.lines.length)) || (Object.keys(lp).length && !app.lines.length)) {
    const l = newLine()
    app.lines.push(l)
    app.activeLineId = l.id
  }
  const cur = activeLine(app)
  // "we can carry everything" counts as every cargo type until dangerous goods is answered explicitly (then its permit is required)
  if (cur && cur.dangerousGoods === undefined && CARRY_ALL_RE.test(text)) lp.cargoTypes = [...CARGO_TYPES]
  if (cur && Object.keys(lp).length) {
    const before = JSON.stringify(cur)
    const next = applyPatch(cur, lp)
    if (JSON.stringify(next) !== before) {
      app.lines = app.lines.map((x) => (x.id === next.id ? next : x))
      captured.push('ข้อมูลบริการ/ราคา')
    }
  }

  // a partner who edits after "needs_info" stays in needs_info until they resubmit
  saveApp(app)
  app = getApp(app.id)!

  const line = activeLine(app)
  // the summary table appears only once every pricing question is answered (the requirement list decides, not the model)
  const nextReq = line ? nextRequirement(line) : undefined
  const showPricing = !!line && !!line.pricing.model && !line.pricing.confirmed && (!nextReq || nextReq.key === 'pricing.confirm')
  addMessage(app.id, 'assistant', result.reply, {
    formatHint: result.formatHint,
    why: result.why,
    note: result.note,
    captured: captured.length ? [...new Set(captured)].join(' · ') : undefined,
    showPricingLineId: showPricing ? line!.id : undefined,
    mode: result.mode,
  })
  void syncApplication(app.id).catch(() => undefined)
}

/** The ID-card photo arrived in chat: the AI only acknowledges it (it never reads the image), then asks for confirmation of the name. */
export async function onIdPhotoReceived(appId: string): Promise<void> {
  const app = getApp(appId)!
  const rest = profileRemaining(app.type, app.profile, { hasIdPhoto: true })[0]
  addMessage(appId, 'assistant', `ได้รับรูปบัตรแล้วครับ เจ้าหน้าที่ Bird จะตรวจรูปเอง (ผมไม่ได้อ่านข้อมูลจากรูป)${rest ? `\n\n${rest.ask}` : '\n\nข้อมูลผู้สมัครครบแล้ว ต่อไปเรื่องบริการและราคาครับ'}`, {
    formatHint: rest?.hint,
    why: rest?.why,
  })
  audit(appId, 'partner', 'id_photo_uploaded')
  void syncApplication(appId).catch(() => undefined)
}

export type { ChatMessageDto }
