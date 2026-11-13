import type { ApplicantType, Profile, ProfilePatch } from './types'
import { ageFromBirth, validThaiPhone } from './thai'
import { findProvince } from './provinces'

/**
 * Applicant-profile interview (KYC data other than the ID number, which is collected on the sign-up page).
 * Like the service-line rules, this list is the guard-rail: the AI decides how to ask, these rules decide what must be known.
 */

export interface ProfileRule {
  key: string
  applies: (t: ApplicantType) => boolean
  filled: (p: Profile, ctx: ProfileCtx) => boolean
  ask: (p: Profile) => string
  hint: string
  why: string
}

export interface ProfileCtx {
  hasIdPhoto: boolean
}

export interface ProfilePending {
  key: string
  ask: string
  hint: string
  why: string
}

const ind = (t: ApplicantType) => t === 'individual'
const biz = (t: ApplicantType) => t === 'business'
const addressDone = (p: Profile) => !!(p.address && p.province && p.postalCode)
const bankDone = (p: Profile) => !!(p.bankName && p.bankAccountNo && p.bankAccountName)

export const PROFILE_RULES: ProfileRule[] = [
  { key: 'fullName', applies: ind, filled: (p) => !!p.fullName, ask: () => 'เริ่มจากชื่อ-นามสกุลของคุณก่อนนะครับ', hint: 'สมชาย ใจดี', why: 'ใช้ตรวจสอบกับบัตรประชาชนและบัญชีธนาคาร' },
  { key: 'phone', applies: ind, filled: (p) => !!p.phone, ask: () => 'ขอเบอร์โทรศัพท์ที่ติดต่อได้ครับ', hint: '081-234-5678', why: 'ใช้ติดต่อเรื่องงานและผลการสมัคร' },
  { key: 'birthDate', applies: ind, filled: (p) => !!p.birthDate, ask: () => 'วันเดือนปีเกิดของคุณครับ', hint: '20/05/2533 (พ.ศ.) หรือ 20/05/1990', why: 'ผู้สมัครต้องมีอายุตั้งแต่ 20 ปีบริบูรณ์' },
  { key: 'address', applies: ind, filled: (p) => addressDone(p), ask: () => 'ขอที่อยู่ตามบัตรประชาชนครับ', hint: '99/9 ถ.สุขุมวิท แขวงบางนา เขตบางนา กรุงเทพฯ 10260\nเรียงตาม: บ้านเลขที่ ถนน แขวง/ตำบล เขต/อำเภอ จังหวัด รหัสไปรษณีย์', why: 'ต้องตรงกับที่อยู่บนบัตรประชาชน' },
  { key: 'idPhoto', applies: ind, filled: (_p, c) => c.hasIdPhoto, ask: () => 'ต่อไปขอรูปบัตรประชาชนด้านหน้าหน่อยครับ ถ่ายตอนนี้หรือเลือกจากอัลบั้มก็ได้ (ส่งผ่านไอคอนกล้องหรือคลิปหนีบกระดาษข้างช่องพิมพ์)', hint: 'ถ่ายให้เห็นข้อมูลครบทั้งใบ ไม่สะท้อนแสง วางบนพื้นเรียบ', why: 'เจ้าหน้าที่ Bird จะตรวจรูปบัตร (AI ไม่ได้อ่านข้อมูลจากรูป)' },
  { key: 'nameOnCard', applies: ind, filled: (p) => !!p.nameOnCardConfirmed, ask: (p) => `ชื่อ-นามสกุลบนบัตรตรงกับ "${p.fullName ?? ''}" ที่แจ้งไว้ใช่ไหมครับ`, hint: 'ตรงกัน หรือพิมพ์ชื่อ-นามสกุลตามบัตร', why: 'AI ไม่ได้อ่านรูป จึงขอให้คุณยืนยันชื่อบนบัตรด้วยตัวเอง' },
  { key: 'bank', applies: ind, filled: (p) => bankDone(p), ask: () => 'บัญชีธนาคารสำหรับรับค่าตอบแทนครับ ชื่อบัญชีต้องตรงกับชื่อของคุณ', hint: 'กสิกรไทย 123-4-56789-0 สมชาย ใจดี\nเรียงตาม: ธนาคาร เลขบัญชี ชื่อบัญชี', why: 'ใช้โอนค่าตอบแทน และตรวจว่าชื่อบัญชีตรงกับผู้สมัคร' },

  { key: 'companyNameTh', applies: biz, filled: (p) => !!p.companyNameTh, ask: () => 'เริ่มจากชื่อบริษัท (ตามหนังสือรับรอง) ครับ', hint: 'บริษัท ตัวอย่างโลจิสติกส์ จำกัด', why: 'ต้องตรงกับหนังสือรับรองบริษัทและเลขทะเบียนที่แจ้งไว้' },
  { key: 'contact', applies: biz, filled: (p) => !!(p.contactName && p.contactPhone), ask: () => 'ผู้ติดต่อหลักของบริษัทคือใคร และเบอร์โทรอะไรครับ', hint: 'คุณวีระ ศรีสุข 02-123-4567', why: 'ใช้ติดต่อเรื่องงานและผลการสมัคร' },
  { key: 'registeredAddress', applies: biz, filled: (p) => !!(p.registeredAddress && p.province && p.postalCode), ask: () => 'ที่อยู่จดทะเบียนของบริษัทครับ', hint: '123 ถ.ตัวอย่าง แขวงทดสอบ เขตตัวอย่าง กรุงเทพฯ 10260', why: 'ต้องตรงกับหนังสือรับรองบริษัท' },
  { key: 'vat', applies: biz, filled: (p) => p.vatRegistered !== undefined, ask: () => 'บริษัทจดทะเบียนภาษีมูลค่าเพิ่ม (VAT) หรือไม่ครับ', hint: 'จด VAT หรือ ไม่จด VAT', why: 'ถ้าจด VAT ต้องแนบใบ ภ.พ.20' },
  { key: 'directorName', applies: biz, filled: (p) => !!p.directorName, ask: () => 'กรรมการผู้มีอำนาจลงนามคือใครครับ', hint: 'นายตัวอย่าง ผู้มีอำนาจ', why: 'ใช้ตรวจกับหนังสือรับรองบริษัทและบัตรกรรมการ' },
  { key: 'ubo', applies: biz, filled: (p) => !!(p.uboName && p.uboPercent !== undefined), ask: () => 'เจ้าของผู้รับผลประโยชน์ (UBO) คือใครครับ หมายถึงผู้ถือหุ้นตั้งแต่ 25% ขึ้นไป', hint: 'นายตัวอย่าง ผู้มีอำนาจ 60%', why: 'ข้อกำหนดการรู้จักเจ้าของที่แท้จริงของนิติบุคคล (KYB)' },
  { key: 'bank', applies: biz, filled: (p) => bankDone(p), ask: () => 'บัญชีธนาคารของบริษัทสำหรับรับค่าตอบแทนครับ ชื่อบัญชีต้องตรงกับชื่อบริษัท', hint: 'กรุงเทพ 123-4-56789-0 บริษัท ตัวอย่างโลจิสติกส์ จำกัด', why: 'ใช้โอนค่าตอบแทน และตรวจว่าชื่อบัญชีตรงกับบริษัท' },
]

export function profileRemaining(type: ApplicantType, p: Profile, ctx: ProfileCtx): ProfilePending[] {
  return PROFILE_RULES.filter((r) => r.applies(type) && !r.filled(p, ctx)).map((r) => ({ key: r.key, ask: r.ask(p), hint: r.hint, why: r.why }))
}

export const profileProgress = (type: ApplicantType, p: Profile, ctx: ProfileCtx) => {
  const all = PROFILE_RULES.filter((r) => r.applies(type))
  return all.length ? Math.round(((all.length - profileRemaining(type, p, ctx).length) / all.length) * 100) : 100
}

export const applyProfilePatch = (p: Profile, patch: ProfilePatch): Profile => ({ ...p, ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined && v !== null && v !== '')) })

// ------------------------------------------------------------------ validation of untrusted patches (model output, offline parser)
const BANKS: [RegExp, string][] = [
  [/กสิกร|kbank|k-bank|kasikorn/i, 'กสิกรไทย'],
  [/ไทยพาณิชย์|scb/i, 'ไทยพาณิชย์'],
  [/กรุงเทพ|bbl|bangkok bank/i, 'กรุงเทพ'],
  [/กรุงไทย|ktb|krungthai/i, 'กรุงไทย'],
  [/กรุงศรี|bay|krungsri/i, 'กรุงศรีอยุธยา'],
  [/ทหารไทย|ธนชาต|ttb/i, 'ทหารไทยธนชาต'],
  [/ออมสิน|gsb/i, 'ออมสิน'],
  [/ธ\.?ก\.?ส|baac/i, 'ธ.ก.ส.'],
  [/ยูโอบี|uob/i, 'ยูโอบี'],
  [/ซีไอเอ็มบี|cimb/i, 'ซีไอเอ็มบี ไทย'],
  [/เกียรตินาคิน|kkp/i, 'เกียรตินาคินภัทร'],
  [/ทิสโก้|tisco/i, 'ทิสโก้'],
  [/แลนด์|lh bank/i, 'แลนด์ แอนด์ เฮ้าส์'],
]
export const canonicalBank = (s: string) => BANKS.find(([re]) => re.test(s))?.[1]

const str = (v: unknown, max = 200) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined)

export function parseBirthDate(text: string): string | undefined {
  const months: Record<string, number> = { 'ม.ค.': 1, 'ก.พ.': 2, 'มี.ค.': 3, 'เม.ย.': 4, 'พ.ค.': 5, 'มิ.ย.': 6, 'ก.ค.': 7, 'ส.ค.': 8, 'ก.ย.': 9, 'ต.ค.': 10, 'พ.ย.': 11, 'ธ.ค.': 12 }
  let d: number | undefined, m: number | undefined, y: number | undefined
  const iso = text.match(/(\d{4})-(\d{1,2})-(\d{1,2})/)
  const sl = text.match(/(\d{1,2})\s*[/\-.]\s*(\d{1,2})\s*[/\-.]\s*(\d{4})/)
  const th = text.match(/(\d{1,2})\s*(ม\.ค\.|ก\.พ\.|มี\.ค\.|เม\.ย\.|พ\.ค\.|มิ\.ย\.|ก\.ค\.|ส\.ค\.|ก\.ย\.|ต\.ค\.|พ\.ย\.|ธ\.ค\.)\s*(\d{4})/)
  if (iso) [y, m, d] = [+iso[1], +iso[2], +iso[3]]
  else if (sl) [d, m, y] = [+sl[1], +sl[2], +sl[3]]
  else if (th) [d, m, y] = [+th[1], months[th[2]], +th[3]]
  if (!d || !m || !y) return undefined
  if (y > 2400) y -= 543
  const iso2 = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  const t = new Date(iso2)
  if (Number.isNaN(t.getTime()) || t.getUTCDate() !== d) return undefined
  return iso2
}

/** Keeps only valid values. Invalid values are dropped (and reported) so the question is asked again. */
export function sanitizeProfilePatch(raw: unknown, type: ApplicantType): { patch: ProfilePatch; rejected: string[] } {
  const o = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>
  const patch: ProfilePatch = {}
  const rejected: string[] = []
  const text = (k: keyof Profile, max = 200) => {
    const v = str(o[k], max)
    if (v) (patch as Record<string, unknown>)[k] = v
  }
  for (const k of ['fullName', 'address', 'registeredAddress', 'companyNameTh', 'companyNameEn', 'contactName', 'directorName', 'uboName', 'bankAccountName'] as const) text(k)
  const phone = (k: 'phone' | 'contactPhone') => {
    const v = str(o[k], 30)
    if (!v) return
    const d = v.replace(/\D/g, '')
    if (validThaiPhone(d)) patch[k] = d
    else rejected.push(k)
  }
  phone('phone')
  phone('contactPhone')
  const b = str(o.birthDate, 40)
  if (b) {
    const iso = parseBirthDate(b) ?? (/^\d{4}-\d{2}-\d{2}$/.test(b) ? b : undefined)
    if (iso && ageFromBirth(iso) >= 20 && ageFromBirth(iso) < 100) patch.birthDate = iso
    else rejected.push('birthDate')
  }
  const prov = str(o.province, 60)
  if (prov) {
    const p = findProvince(prov)
    if (p) patch.province = p
    else rejected.push('province')
  }
  const pc = str(o.postalCode, 10)
  if (pc) {
    if (/^\d{5}$/.test(pc.replace(/\D/g, ''))) patch.postalCode = pc.replace(/\D/g, '')
    else rejected.push('postalCode')
  }
  // the province and postal code are inside the address text: fill them from it when the model did not split them out
  const addr = patch.address ?? patch.registeredAddress
  if (addr) {
    if (!patch.province) {
      const p = findProvince(addr)
      if (p) patch.province = p
    }
    if (!patch.postalCode) {
      const codes = addr.match(/(?<!\d)\d{5}(?!\d)/g)
      if (codes) patch.postalCode = codes[codes.length - 1]
    }
  }
  const bank = str(o.bankName, 60)
  if (bank) patch.bankName = canonicalBank(bank) ?? bank
  const acc = str(o.bankAccountNo, 30)
  if (acc) {
    const d = acc.replace(/\D/g, '')
    if (/^\d{10,15}$/.test(d)) patch.bankAccountNo = d
    else rejected.push('bankAccountNo')
  }
  if (typeof o.nameOnCardConfirmed === 'boolean' && type === 'individual') patch.nameOnCardConfirmed = o.nameOnCardConfirmed
  if (typeof o.vatRegistered === 'boolean') patch.vatRegistered = o.vatRegistered
  if (typeof o.uboPercent === 'number' && o.uboPercent >= 0 && o.uboPercent <= 100) {
    if (o.uboPercent >= 25) patch.uboPercent = o.uboPercent
    else rejected.push('uboPercent')
  }
  return { patch, rejected }
}

// ------------------------------------------------------------------ OFFLINE extraction (rule-based fallback; not a language model)
const nameFrom = (t: string) => {
  const s = t
    .replace(/\+?\d[\d\s-]{6,17}\d/g, ' ')
    .replace(/^(ผม|ฉัน|ดิฉัน|หนู)?\s*(ชื่อ|คือ|เป็น)\s*(ว่า)?\s*/i, '')
    .replace(/(ครับ|ค่ะ|คะ)\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!s || s.length < 2 || s.length > 60 || s.split(' ').length > 5 || /\?|ไหม|อะไร/.test(s)) return undefined
  return s
}

const firstPhone = (t: string) => {
  for (const c of t.match(/\+?\d[\d\s-]{6,17}\d/g) ?? []) {
    const d = c.replace(/\D/g, '')
    const digits = d.startsWith('66') && c.trim().startsWith('+') ? '0' + d.slice(2) : d
    if (validThaiPhone(digits)) return digits
  }
  return undefined
}

export function offlineProfileExtract(key: string, text: string, p: Profile): ProfilePatch {
  const t = text.trim()
  const yes = /^(ใช่|ตรง|ตรงกัน|ถูก|ถูกต้อง|ครับ|ค่ะ|yes|ok|โอเค)/i.test(t)
  switch (key) {
    case 'fullName': {
      const n = nameFrom(t)
      const ph = firstPhone(t)
      return { ...(n ? { fullName: n } : {}), ...(ph && !p.phone ? { phone: ph } : {}) }
    }
    case 'phone': {
      const ph = firstPhone(t)
      return ph ? { phone: ph } : {}
    }
    case 'birthDate': {
      const b = parseBirthDate(t)
      return b ? { birthDate: b } : {}
    }
    case 'address':
    case 'registeredAddress': {
      const prov = findProvince(t)
      const pc = t.match(/\b(\d{5})\b/)?.[1]
      const field = key === 'address' ? 'address' : 'registeredAddress'
      return { ...(t.length >= 8 ? { [field]: t } : {}), ...(prov ? { province: prov } : {}), ...(pc ? { postalCode: pc } : {}) }
    }
    case 'nameOnCard': {
      if (yes) return { nameOnCardConfirmed: true }
      const n = nameFrom(t)
      return n ? { fullName: n, nameOnCardConfirmed: true } : {}
    }
    case 'bank':
    case 'bankAccountName': {
      const bank = canonicalBank(t)
      const accRaw = t.match(/\d[\d\s-]{8,18}\d/)?.[0]
      const acc = accRaw?.replace(/\D/g, '')
      let name = t
      if (accRaw) name = name.replace(accRaw, ' ')
      if (bank) name = name.replace(BANKS.find(([re]) => re.test(t))![0], ' ').replace(/ธนาคาร|ชื่อบัญชี|บัญชี|เลขที่/g, ' ')
      name = name.replace(/\s+/g, ' ').trim()
      return { ...(bank ? { bankName: bank } : {}), ...(acc ? { bankAccountNo: acc } : {}), ...(name.length >= 2 ? { bankAccountName: name } : {}) }
    }
    case 'companyNameTh': {
      const n = t.replace(/^(ชื่อบริษัท(คือ)?|บริษัทชื่อ)\s*/i, '').trim()
      return n.length >= 3 && n.length <= 100 ? { companyNameTh: n } : {}
    }
    case 'contact': {
      const ph = firstPhone(t)
      const n = nameFrom(t)
      return { ...(n ? { contactName: n } : {}), ...(ph ? { contactPhone: ph } : {}) }
    }
    case 'vat':
      if (/ไม่จด|ไม่ได้จด|ไม่มี|no\b/i.test(t)) return { vatRegistered: false }
      if (/จด|มี|ใช่|yes/i.test(t)) return { vatRegistered: true }
      return {}
    case 'directorName': {
      const n = nameFrom(t)
      return n ? { directorName: n } : {}
    }
    case 'ubo': {
      const pct = t.match(/(\d+(?:\.\d+)?)\s*%/)
      const n = nameFrom(t.replace(/(\d+(?:\.\d+)?)\s*%/, ' '))
      return { ...(n ? { uboName: n } : {}), ...(pct ? { uboPercent: parseFloat(pct[1]) } : {}) }
    }
  }
  return {}
}
