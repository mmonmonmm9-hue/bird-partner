import type { PricingStructure, ServiceLine } from './types'
import { BASIS_EN, BASIS_LABEL, BASIS_SHORT, SURCHARGE_LABEL, fmtMoney } from './schema'

export interface QuoteInput {
  quantity: number // units on the pricing basis (pieces, boxes, pallets, trips, …); for per_kg this is ignored
  actualKg?: number
  lengthCm?: number
  widthCm?: number
  heightCm?: number
  pieces?: number
  lane?: string
}

export interface QuoteLine {
  label: string
  amount: number
  note?: string
}

export interface Quote {
  ok: boolean
  error?: string
  lines: QuoteLine[]
  total: number
  chargeableQty?: number
}

/** Calculates what a customer would be charged, using exactly the structure the partner entered. Used as a self-check. */
export function simulateQuote(p: PricingStructure, q: QuoteInput): Quote {
  const lines: QuoteLine[] = []
  if (!p.basis || !p.model) return { ok: false, error: 'ยังไม่ได้เลือกหน่วยคิดราคาและรูปแบบราคา', lines, total: 0 }
  if (p.model === 'quote_on_request') return { ok: false, error: 'โครงสร้างแบบ "เสนอราคาเป็นรายงาน" ไม่มีสูตรให้คำนวณ', lines, total: 0 }

  // 1) chargeable quantity
  let qty = q.quantity
  if (p.basis === 'per_kg') {
    const actual = (q.actualKg ?? 0) * Math.max(1, q.pieces ?? 1)
    const vol =
      q.lengthCm && q.widthCm && q.heightCm && p.chargeable?.divisor
        ? ((q.lengthCm * q.widthCm * q.heightCm) / p.chargeable.divisor) * Math.max(1, q.pieces ?? 1)
        : 0
    const rule = p.chargeable?.rule ?? 'actual'
    qty = rule === 'volumetric' ? vol : rule === 'greater' ? Math.max(actual, vol) : actual
    if (qty <= 0) return { ok: false, error: 'ใส่น้ำหนัก (และขนาด ถ้าใช้น้ำหนักตามปริมาตร)', lines, total: 0 }
    qty = Math.ceil(qty * 10) / 10
  }
  if (!(qty > 0)) return { ok: false, error: 'ใส่จำนวนหน่วยที่ต้องการคำนวณ', lines, total: 0 }

  // 2) base freight
  let freight = 0
  if (p.model === 'flat') {
    if (p.rate == null) return { ok: false, error: 'ยังไม่ได้กรอกราคา', lines, total: 0 }
    freight = p.rate * qty
    lines.push({ label: `ค่าขนส่ง ${fmtMoney(p.rate, p.currency)} × ${qty} ${BASIS_SHORT[p.basis]}`, amount: freight })
  } else if (p.model === 'tiered') {
    const tier = [...p.tiers].sort((a, b) => a.from - b.from).find((t) => qty >= t.from && (t.to == null || qty <= t.to))
    if (!tier) return { ok: false, error: `จำนวน ${qty} ไม่อยู่ในช่วงราคาใดเลย — ตรวจช่วงราคาให้ครอบคลุม`, lines, total: 0 }
    freight = tier.mode === 'flat' ? tier.rate : tier.rate * qty
    lines.push({
      label: `ช่วง ${tier.from}–${tier.to ?? '∞'} ${BASIS_SHORT[p.basis]}: ${tier.mode === 'flat' ? 'ราคาเหมาช่วง' : `${fmtMoney(tier.rate, p.currency)} × ${qty}`}`,
      amount: freight,
    })
  } else if (p.model === 'lane_table') {
    const lane = p.lanes.find((l) => q.lane && `${l.origin}→${l.destination}` === q.lane) ?? p.lanes[0]
    if (!lane) return { ok: false, error: 'ยังไม่มีราคาตามเส้นทาง', lines, total: 0 }
    freight = lane.rate * qty
    lines.push({ label: `${lane.origin}→${lane.destination} ${fmtMoney(lane.rate, p.currency)} × ${qty} ${BASIS_SHORT[p.basis]}`, amount: freight })
  }
  if (p.baseFee) {
    lines.push({ label: 'ค่าเปิดบริการ (Base fee)', amount: p.baseFee })
    freight += p.baseFee
  }
  if (p.minCharge != null && freight < p.minCharge) {
    lines.push({ label: `ปรับเป็นค่าบริการขั้นต่ำ ${fmtMoney(p.minCharge, p.currency)}`, amount: p.minCharge - freight, note: 'minimum charge' })
    freight = p.minCharge
  }

  // 3) surcharges
  let total = freight
  for (const s of p.surcharges) {
    if (s.value == null) continue
    const amt = s.mode === 'percent' ? (freight * s.value) / 100 : s.mode === 'per_unit' ? s.value * qty : s.value
    lines.push({ label: `${SURCHARGE_LABEL[s.type]} ${s.mode === 'percent' ? s.value + '%' : s.mode === 'per_unit' ? `${s.value}/${BASIS_SHORT[p.basis]}` : fmtMoney(s.value, p.currency)}`, amount: Math.round(amt * 100) / 100 })
    total += amt
  }
  return { ok: true, lines, total: Math.round(total * 100) / 100, chargeableQty: qty }
}

/** Problems a reviewer (or the AI) should flag in a pricing structure. */
export function pricingIssues(p: PricingStructure): string[] {
  const out: string[] = []
  const t = [...p.tiers].sort((a, b) => a.from - b.from)
  for (let i = 1; i < t.length; i++) {
    const prev = t[i - 1]
    if (prev.to == null) out.push('มีช่วงราคาที่ไม่จำกัดบน แต่ยังมีช่วงถัดไปอีก')
    else if (t[i].from < prev.to) out.push(`ช่วงราคา ${prev.from}–${prev.to} ซ้อนกับช่วง ${t[i].from}–${t[i].to ?? '∞'}`)
    else if (t[i].from > prev.to) out.push(`มีช่องว่างระหว่างช่วง ${prev.from}–${prev.to} และ ${t[i].from}`)
  }
  if (t.length && t[0].from > 0) out.push(`ช่วงราคาเริ่มที่ ${t[0].from} — จำนวนต่ำกว่านี้ยังไม่มีราคา`)
  if (p.validTo && /^\d{4}-\d{2}-\d{2}$/.test(p.validTo) && p.validTo < new Date().toISOString().slice(0, 10)) out.push(`วันหมดอายุของราคา (${p.validTo}) ผ่านมาแล้ว`)
  if (p.surcharges.some((s) => s.mode === 'percent' && (s.value ?? 0) > 50)) out.push('มีส่วนเพิ่มแบบ % สูงกว่า 50% — ควรตรวจสอบ')
  return out
}

export function pricingSummary(p: PricingStructure, lang: 'th' | 'en' = 'th'): string {
  if (!p.basis || !p.model) return lang === 'th' ? 'ยังไม่กำหนด' : '—'
  const unit = lang === 'th' ? BASIS_LABEL[p.basis] : `per ${BASIS_EN[p.basis]}`
  const parts: string[] = []
  if (p.model === 'flat') parts.push(`${fmtMoney(p.rate, p.currency)} ${unit}`)
  else if (p.model === 'tiered') parts.push(`${lang === 'th' ? 'ช่วงราคา' : 'Tiered'} ${p.tiers.length} ${lang === 'th' ? 'ช่วง' : 'bands'} (${unit})`)
  else if (p.model === 'lane_table') parts.push(`${lang === 'th' ? 'ตามเส้นทาง' : 'Lane table'} ${p.lanes.length} ${lang === 'th' ? 'เส้นทาง' : 'lanes'} (${unit})`)
  else parts.push(lang === 'th' ? 'เสนอราคาเป็นรายงาน' : 'Quote on request')
  if (p.minCharge != null) parts.push(`${lang === 'th' ? 'ขั้นต่ำ' : 'min'} ${fmtMoney(p.minCharge, p.currency)}`)
  if (p.chargeable && p.basis === 'per_kg') parts.push(p.chargeable.rule === 'actual' ? (lang === 'th' ? 'น้ำหนักจริง' : 'actual wt') : `${p.chargeable.rule === 'volumetric' ? 'vol' : 'max(actual,vol)'} ÷${p.chargeable.divisor}`)
  if (p.surcharges.length) parts.push(`+${p.surcharges.length} ${lang === 'th' ? 'ส่วนเพิ่ม' : 'surcharges'}`)
  return parts.join(' · ')
}

export const lineLabel = (l: ServiceLine) => (l.category ? l.category : 'service')
