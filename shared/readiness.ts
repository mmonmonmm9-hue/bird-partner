import type { ApplicantType, Profile, ServiceLine } from './types'
import { profileRemaining } from './profile'
import { isLineComplete, lineTitle } from './requirements'
import { pricingIssues } from './pricing'
import { docTemplates } from './docs'

export interface Finding {
  tone: 'ok' | 'warn' | 'info'
  text: string
}

interface Snapshot {
  type: ApplicantType
  profile: Profile
  lines: ServiceLine[]
  uploadedKeys: Set<string>
  consent: boolean
}

/** Hard blockers: the application cannot be submitted until these are empty. */
export function blockers(s: Snapshot): string[] {
  const out: string[] = []
  if (!s.consent) out.push('ยังไม่ได้ยืนยันความยินยอม PDPA')
  const pr = profileRemaining(s.type, s.profile, { hasIdPhoto: s.uploadedKeys.has('id_front') })
  if (pr.length) out.push(`ข้อมูลผู้สมัครยังไม่ครบ (${pr.length} หัวข้อ)`)
  if (!s.lines.length) out.push('ยังไม่มีบริการในใบสมัคร')
  for (const l of s.lines) {
    if (!isLineComplete(l)) out.push(`${lineTitle(l)}: ข้อมูลบริการหรือราคายังไม่ครบ`)
    else if (!l.pricing.confirmed) out.push(`${lineTitle(l)}: ยังไม่ได้ยืนยันโครงสร้างราคา`)
    for (const i of pricingIssues(l.pricing)) out.push(`${lineTitle(l)}: ${i}`)
  }
  const missing = docTemplates(s.type, s.profile, s.lines).filter((d) => d.required && !s.uploadedKeys.has(d.key))
  if (missing.length) out.push(`ยังขาดเอกสารบังคับ ${missing.length} รายการ`)
  return out
}

/** AI preliminary findings shown to the human reviewer. Never a decision. */
export function analyze(s: Snapshot): Finding[] {
  const f: Finding[] = []
  const miss = docTemplates(s.type, s.profile, s.lines).filter((d) => d.required && !s.uploadedKeys.has(d.key))
  f.push(miss.length ? { tone: 'warn', text: `เอกสารบังคับยังขาด: ${miss.map((d) => d.label).join(', ')}` } : { tone: 'ok', text: 'เอกสารบังคับครบถ้วน (ตรวจเฉพาะการมีไฟล์ ไม่ได้ตรวจเนื้อหา)' })
  const p = s.profile
  if (s.type === 'individual' && p.fullName && p.bankAccountName) {
    const first = p.fullName.replace(/^(นาย|นางสาว|นาง|คุณ)/, '').split(/\s+/)[0]
    if (first && !p.bankAccountName.includes(first)) f.push({ tone: 'warn', text: 'ชื่อบัญชีธนาคารไม่ตรงกับชื่อต้นของผู้สมัคร' })
  }
  if (s.type === 'business' && p.companyNameTh && p.bankAccountName) {
    const key = p.companyNameTh.replace(/บริษัท|จำกัด|\(มหาชน\)|\s/g, '').slice(0, 6)
    if (key && !p.bankAccountName.replace(/\s/g, '').includes(key)) f.push({ tone: 'warn', text: 'ชื่อบัญชีธนาคารไม่ตรงกับชื่อบริษัท' })
    if (p.contactName && p.directorName && p.contactName.replace(/\s/g, '') !== p.directorName.replace(/\s/g, '') && !s.uploadedKeys.has('poa')) f.push({ tone: 'warn', text: 'ผู้ติดต่อไม่ใช่กรรมการ แต่ยังไม่มีหนังสือมอบอำนาจ' })
  }
  for (const l of s.lines) {
    const t = lineTitle(l)
    if (!isLineComplete(l)) f.push({ tone: 'warn', text: `${t}: ข้อมูลบริการ/ราคายังไม่ครบ` })
    if (!l.pricing.confirmed) f.push({ tone: 'warn', text: `${t}: พาร์ทเนอร์ยังไม่ได้ยืนยันโครงสร้างราคา` })
    for (const i of pricingIssues(l.pricing)) f.push({ tone: 'warn', text: `${t}: ${i}` })
    if (l.scope === 'international' && !l.customs?.clearance) f.push({ tone: 'warn', text: `${t}: เป็นบริการระหว่างประเทศ แต่ไม่ได้ระบุเรื่องพิธีการศุลกากร` })
    if (l.customs?.handling === 'self_licensed' && !s.uploadedKeys.has('customs_license')) f.push({ tone: 'warn', text: `${t}: แจ้งว่าทำพิธีการเองแต่ยังไม่มีใบอนุญาตตัวแทนออกของ` })
    if (l.customs?.dutyTax === 'advance_and_rebill') f.push({ tone: 'info', text: `${t}: ออกเงินทดรองจ่ายอากร — ตรวจเครดิตเทอมและความเสี่ยงทางการเงิน` })
    if ((l.dangerousGoods === true || l.cargoTypes?.some((c) => /DG|วัตถุอันตราย/.test(c))) && !s.uploadedKeys.has('dg_permit')) f.push({ tone: 'warn', text: `${t}: รับวัตถุอันตรายแต่ยังไม่มีใบอนุญาต` })
  }
  f.push({ tone: 'info', text: 'ราคาที่พาร์ทเนอร์เสนอเป็น Partner Buy Rate ต้องผ่านการอนุมัติเชิงพาณิชย์ก่อนเผยแพร่ · การตรวจของ AI เป็นเบื้องต้น ไม่ใช่การยืนยันตัวตนจริง' })
  return f
}
