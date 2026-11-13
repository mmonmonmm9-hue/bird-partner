import type { AiTurnResult, ApplicantType, Profile, ServiceLine } from './types'
import { localTurn, OFFTOPIC_REPLY } from './localAnalyst'
import { applyProfilePatch, offlineProfileExtract, profileRemaining, sanitizeProfilePatch } from './profile'
import { applyPatch, nextRequirement } from './requirements'

/**
 * OFFLINE analyst: used when ANTHROPIC_API_KEY is not configured or a live call fails.
 * Rule-based (keyword / pattern extraction + the same requirement lists). It is NOT a language model.
 */

export interface OfflineCtx {
  type: ApplicantType
  profile: Profile
  line: ServiceLine | undefined
  hasIdPhoto: boolean
}

const OFFTOPIC = /ราคาทอง|หุ้น|อากาศ|ฝนตก|ฟุตบอล|หวย|ข่าว|เพลง|หนัง|สูตรอาหาร|ผัดกะเพรา|ทำอาหาร|weather|stock|bitcoin|recipe|movie|joke|เขียนโค้ด|แปลภาษา|กลอน|การเมือง/i

const hintFrom = (s: string[]) => (s.length ? 'ตอบได้เช่น ' + s.slice(0, 4).map((x) => `"${x}"`).join(' หรือ ') : undefined)

export function offlineTurn(text: string, ctx: OfflineCtx): AiTurnResult {
  const base = { mode: 'offline' as const, note: undefined, newLine: false, finished: false, showPricing: false, requestIdPhoto: false, profilePatch: {}, patch: {} }
  const t = text.trim()
  const pending = profileRemaining(ctx.type, ctx.profile, { hasIdPhoto: ctx.hasIdPhoto })

  if (pending.length) {
    const cur = pending[0]
    if (OFFTOPIC.test(t) && !/ขนส่ง|ศุลกากร|พัสดุ|บริการ/.test(t)) {
      return { ...base, reply: `${OFFTOPIC_REPLY}\n\n${cur.ask}`, formatHint: cur.hint, requestIdPhoto: cur.key === 'idPhoto' }
    }
    if (/ทำไมต้อง|ถามทำไม/.test(t)) return { ...base, reply: `${cur.why}\n\nคำถามเดิม: ${cur.ask}`, formatHint: cur.hint, requestIdPhoto: cur.key === 'idPhoto' }
    if (cur.key === 'idPhoto') {
      return { ...base, reply: 'ผมยังไม่ได้รับรูปบัตรครับ ส่งรูปผ่านไอคอนกล้องหรือคลิปหนีบกระดาษข้างช่องพิมพ์ด้านล่างได้เลย', formatHint: cur.hint, requestIdPhoto: true }
    }
    const raw = offlineProfileExtract(cur.key, t, ctx.profile)
    const { patch: clean, rejected } = sanitizeProfilePatch(raw, ctx.type)
    // second-order fields typed alongside (e.g. name + phone in one message)
    if (Object.keys(clean).length === 0) {
      const why = rejected.length ? 'ข้อมูลที่ได้ยังไม่ถูกรูปแบบ (เช่น เบอร์โทร 10 หลัก, รหัสไปรษณีย์ 5 หลัก, อายุ 20 ปีขึ้นไป)' : 'ผมยังจับใจความไม่ได้ครับ'
      return { ...base, reply: `${why} ลองตอบตามตัวอย่างด้านล่าง\n\n${cur.ask}`, formatHint: cur.hint }
    }
    const after = applyProfilePatch(ctx.profile, clean)
    const next = profileRemaining(ctx.type, after, { hasIdPhoto: ctx.hasIdPhoto })[0]
    const names: Record<string, string> = { fullName: 'ชื่อ-นามสกุล', phone: 'เบอร์โทร', birthDate: 'วันเกิด', address: 'ที่อยู่', province: 'จังหวัด', postalCode: 'รหัสไปรษณีย์', bankName: 'ธนาคาร', bankAccountNo: 'เลขบัญชี', bankAccountName: 'ชื่อบัญชี', nameOnCardConfirmed: 'ยืนยันชื่อบนบัตร', companyNameTh: 'ชื่อบริษัท', contactName: 'ผู้ติดต่อ', contactPhone: 'เบอร์ผู้ติดต่อ', registeredAddress: 'ที่อยู่จดทะเบียน', vatRegistered: 'สถานะ VAT', directorName: 'กรรมการผู้มีอำนาจ', uboName: 'เจ้าของผู้รับผลประโยชน์', uboPercent: 'สัดส่วนถือหุ้น' }
    const got = Object.keys(clean).map((k) => names[k] ?? k)
    const warn = rejected.length ? '\n(บางรายการยังไม่ถูกรูปแบบ ผมจึงยังไม่บันทึก: ' + rejected.map((k) => names[k] ?? k).join(', ') + ')' : ''
    if (!next) {
      const line = ctx.line ?? undefined
      const q = line ? nextRequirement(line) : undefined
      return { ...base, profilePatch: clean, reply: `รับทราบครับ ข้อมูลผู้สมัครครบแล้ว ต่อไปเรื่องบริการและราคาครับ${warn}\n\n${q?.ask ?? 'บริการที่ต้องการลงทะเบียนเป็นประเภทไหนครับ เช่น ขนส่งทางถนน พัสดุ ขนส่งทางอากาศ คลังสินค้า หรือชิปปิ้ง'}`, formatHint: 'เล่าเป็นประโยคได้เลย เช่น "ผมรับส่งของไปลาว ใช้รถหัวลาก คิดเป็นเที่ยว"' }
    }
    return { ...base, profilePatch: clean, reply: `รับทราบครับ ${got.join(' · ')}${warn}\n\n${next.ask}`, formatHint: next.hint, requestIdPhoto: next.key === 'idPhoto', why: next.why }
  }

  // profile complete -> service interview
  const line = ctx.line
  if (!line) return { ...base, reply: 'เล่าบริการที่ต้องการลงทะเบียนได้เลยครับ', formatHint: 'เช่น "ผมรับส่งของไปลาว ใช้รถหัวลาก คิดเป็นเที่ยว"' }
  const r = localTurn(t, line)
  // the question that is asked NEXT is decided on the line as it will be after this answer is applied
  const q = nextRequirement(applyPatch(line, r.patch))
  return {
    ...base,
    patch: r.patch,
    newLine: r.newLine,
    finished: r.finished,
    showPricing: r.showPricing,
    reply: r.reply,
    formatHint: q && VALUE_FIRST.has(q.key) ? KEY_HINTS[q.key] : (hintFrom(r.suggestions) ?? (q ? KEY_HINTS[q.key] : undefined)),
    why: q?.why,
    note: r.note,
  }
}

/** Questions whose answer needs a number: show a value example instead of the option names. */
const VALUE_FIRST = new Set(['pricing.surcharges'])

/** Example answers for open (free-text) questions, so every question carries a format hint. */
export const KEY_HINTS: Record<string, string> = {
  coverage: '"กรุงเทพฯ ปริมณฑล และภาคกลาง" หรือ "ทั่วประเทศ" หรือ "กรุงเทพ–ชลบุรี–ระยอง"',
  equipment: '"รถกระบะ 4 ล้อ 5 คัน" หรือ "มอเตอร์ไซค์ 10 คัน" หรือ "รถหัวลาก 3 คัน"',
  transit: '"1–2 วัน" หรือ "3–5 วันทำการ" หรือ "ภายในวัน"',
  capacity: '"ประมาณ 200 ชิ้นต่อวัน" หรือ "10 เที่ยวต่อสัปดาห์"',
  'pricing.values': '"35 บาทต่อชิ้น" หรือ "1,500 บาทต่อเที่ยว" หรือ "0–5 กก. 60 บาท, 5–20 กก. 12 บาท/กก."',
  'pricing.minCharge': '"ขั้นต่ำ 100 บาท" หรือ "ไม่มีขั้นต่ำ"',
  'pricing.surcharges': '"ค่าน้ำมัน 8% พื้นที่ห่างไกล 30 บาท" หรือ "ไม่มีค่าธรรมเนียมเพิ่ม"',
  'pricing.customsFees': '"ต่อใบขน 1,500 บาท ต่อรายการ HS 200 บาท ค่าทดรองจ่าย 3%"',
  'pricing.scope': '"รวมค่าขึ้น-ลงสินค้า ไม่รวมค่าทางด่วนและภาษี"',
  'pricing.validity': '"ใช้ได้ถึง 31 ธ.ค. 2569 เครดิต 30 วัน"',
}

export const greeting = (type: ApplicantType, name?: string) =>
  `สวัสดีครับ${name ? ` คุณ${name}` : ''} ผมเป็นผู้ช่วย Bird Partner จะถามทีละเรื่องและจดข้อมูลให้เอง ไม่ต้องกรอกฟอร์มครับ ${type === 'business' ? 'เริ่มจากชื่อบริษัทก่อนนะครับ' : 'เริ่มจากชื่อ-นามสกุลของคุณก่อนนะครับ'}`
