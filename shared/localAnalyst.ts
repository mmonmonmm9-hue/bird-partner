import type { Category, CustomsFees, LaneRate, LinePatch, ServiceLine, SurchargeType, Tier, UnitBasis } from './types'
import { applyPatch, nextRequirement, remaining, type Pending } from './requirements'
import { BASIS_LABEL, CATEGORY_LABEL, SURCHARGE_LABEL } from './schema'
import { fmtNum } from './util'

export interface LineTurn {
  reply: string
  patch: LinePatch
  suggestions: string[]
  showPricing: boolean
  newLine: boolean
  finished: boolean
  mode: 'live' | 'offline'
  note?: string
}

/**
 * OFFLINE analyst — used when no Anthropic credentials are configured (or the live call fails).
 * It is rule-based: keyword/pattern extraction + the branching requirement list. It is NOT a language model.
 * The live analyst (server/aiPlugin.ts) uses the same requirement list but lets Claude interpret the answers.
 */

const normNum = (s: string) => s.replace(/[๐-๙]/g, (d) => String('๐๑๒๓๔๕๖๗๘๙'.indexOf(d)))
const num = (s: string) => parseFloat(s.replace(/,/g, ''))

// ------------------------------------------------------------------ glossary (FAQ in offline mode)
const GLOSSARY: [RegExp, string][] = [
  [/incoterm|อินโคเทอม|fob|cif|exw|ddp/i, 'Incoterms คือข้อตกลงการค้าระหว่างประเทศว่าผู้ขายหรือผู้ซื้อรับผิดชอบค่าขนส่ง ประกัน และพิธีการศุลกากรถึงจุดไหน เช่น EXW (ผู้ซื้อรับผิดชอบเกือบทั้งหมด), FOB (ผู้ขายรับผิดชอบถึงท่าต้นทาง), CIF (รวมค่าระวางและประกันถึงท่าปลายทาง), DDP (ผู้ขายจ่ายทุกอย่างรวมอากรปลายทาง) — ผลต่อเรา คือต้องรู้ว่าบริการของคุณครอบคลุมช่วงไหน'],
  [/hs\s*code|เอชเอส|พิกัดศุลกากร/i, 'HS Code คือรหัสพิกัดศุลกากรสินค้า 6–10 หลัก ใช้กำหนดอัตราอากรและสิทธิ์ต่าง ๆ ตัวแทนออกของจะเป็นผู้จัดจำแนกพิกัดให้ถูกต้อง ถ้าคุณคิดค่าบริการต่อรายการสินค้า (HS line) ให้แจ้งไว้ในค่าดำเนินพิธีการ'],
  [/ชิปปิ้ง|ตัวแทนออกของ|เคลียร์ศุลกากร|พิธีการ/i, 'พิธีการศุลกากร (เคลียร์ศุลกากร) คือการยื่นใบขนสินค้า ชำระอากร/ภาษี และตรวจปล่อยสินค้าเข้า–ออกประเทศ ผู้ทำต้องเป็นตัวแทนออกของที่มีใบอนุญาต ผมจึงถามว่าคุณทำเองหรือใช้พันธมิตร และใครจ่ายอากร'],
  [/volumetric|น้ำหนักตามปริมาตร|ปริมาตร|ตัวหาร/i, 'น้ำหนักตามปริมาตร = (กว้าง×ยาว×สูง ซม.) ÷ ตัวหาร (5000 หรือ 6000) ใช้เพราะของเบาแต่ใหญ่กินพื้นที่ จึงคิดค่าบริการจากค่าที่มากกว่าระหว่างน้ำหนักจริงกับน้ำหนักตามปริมาตร'],
  [/tier|weight.?break|ช่วงน้ำหนัก|ช่วงราคา/i, 'ราคาแบบช่วง (Tiered) คือกำหนดราคาตามช่วงน้ำหนัก/จำนวน เช่น 0–5 กก. = 60 บาท (เหมาช่วง) และ 5–20 กก. = 12 บาท/กก. (คิดต่อหน่วยเมื่ออยู่ในช่วงนั้น) ยิ่งมากยิ่งถูกต่อหน่วยได้'],
  [/ขั้นต่ำ|minimum|min charge/i, 'ค่าบริการขั้นต่ำ (Minimum charge) คือราคาต่ำสุดต่อรายการ ถ้าคำนวณได้น้อยกว่านี้ จะเรียกเก็บตามขั้นต่ำแทน'],
  [/fuel|ค่าน้ำมัน|surcharge|ส่วนเพิ่ม/i, 'ค่าธรรมเนียมเพิ่มเติม (Surcharge) เช่น Fuel surcharge มักเป็น % ของค่าขนส่งและปรับตามราคาน้ำมัน ส่วนพื้นที่ห่างไกลหรือ COD มักเป็นจำนวนเงินคงที่หรือ %'],
  [/cbm|ลูกบาศก์/i, 'CBM = ลูกบาศก์เมตร (กว้าง×ยาว×สูง เป็นเมตร) นิยมใช้คิดราคาสินค้าปริมาตรมาก เช่น LCL ทางเรือ หรือสินค้าที่เบาแต่ใหญ่'],
  [/cod|เก็บเงินปลายทาง/i, 'COD (Cash on Delivery) คือเก็บเงินค่าสินค้าจากผู้รับแทนผู้ส่ง แล้วนำส่งคืนผู้ส่ง ปกติมีค่าธรรมเนียมเป็น % ของยอดเก็บหรือเป็นจำนวนคงที่'],
  [/dg|วัตถุอันตราย|dangerous/i, 'วัตถุอันตราย (DG) เช่น แบตเตอรี่ลิเธียม สารไวไฟ ต้องมีบรรจุภัณฑ์ เอกสาร และใบอนุญาตเฉพาะ และมักคิดค่าธรรมเนียมพิเศษ'],
  [/bonded|ทัณฑ์บน/i, 'คลังทัณฑ์บน (Bonded warehouse) เก็บสินค้านำเข้าโดยยังไม่เสียอากร ต้องได้รับอนุญาตจากกรมศุลกากร'],
  [/awb|air waybill/i, 'AWB (Air Waybill) คือเอกสารขนส่งทางอากาศที่ระบุผู้ส่ง ผู้รับ สินค้า และเงื่อนไขการขนส่ง ถ้าคิดราคาต่อ AWB หมายถึงคิดต่อใบขนส่งหนึ่งใบ'],
  [/fcl|lcl/i, 'FCL คือเช่าตู้คอนเทนเนอร์เต็มตู้ ส่วน LCL คือสินค้าไม่เต็มตู้ที่รวมกับของลูกค้ารายอื่น คิดเป็น CBM หรือตัน'],
]

const OFFTOPIC = /ราคาทอง|หุ้น|อากาศ|ฝนตก|ฟุตบอล|หวย|ข่าว|เพลง|หนัง|สูตรอาหาร|ผัดกะเพรา|ทำอาหาร|weather|stock|bitcoin|recipe|movie|joke|เขียนโค้ด|แปลภาษา|กลอน|การเมือง/i

export const OFFTOPIC_REPLY =
  'ขออภัยครับ ผมเป็นผู้ช่วยของ Bird Partner ตอบได้เฉพาะเรื่องการให้บริการโลจิสติกส์ โครงสร้างราคา เอกสาร และการสมัครเป็นพาร์ทเนอร์ ถ้าอยากเดินต่อ ตอบคำถามด้านล่างได้เลยครับ'

// ------------------------------------------------------------------ extraction
const CAT_RULES: [RegExp, Category][] = [
  [/forwarder|ฟอร์เวิร์ด|ฟอร์เวิดเดอร์/i, 'freight_forwarder'],
  // the partner IS a broker: "เป็นชิปปิ้ง", "รับทำพิธีการ" (customs merely mentioned as an add-on falls through to the transport category)
  [/เป็น\s*(ชิปปิ้ง|ตัวแทนออกของ|customs\s*broker)|รับทำ\s*(พิธีการ|ใบขน)|รับเคลียร์|ให้บริการ(ชิปปิ้ง|พิธีการศุลกากร)/i, 'customs_broker'],
  [/ข้ามแดน|cross.?border|ไทย.?(ลาว|กัมพูชา|เมียนมา|มาเลเซีย|เวียดนาม)/i, 'cross_border_road'],
  [/ทางอากาศ|air\s*freight|awb|csa|gsa|สายการบิน/i, 'air_freight'],
  [/ทางทะเล|sea\s*freight|fcl|lcl|คอนเทนเนอร์|container|ทางเรือ/i, 'sea_freight'],
  [/คลังสินค้า|fulfil|โกดัง|warehouse/i, 'warehouse'],
  [/last.?mile|ส่งด่วนในเมือง|same.?day|ส่งอาหาร|ไรเดอร์|delivery rider/i, 'last_mile'],
  [/พัสดุ|courier|คูเรียร์|ไปรษณีย์|parcel/i, 'courier_parcel'],
  [/ขนส่งทางถนน|รถบรรทุก|รถกระบะ|รถตู้|รถ\s*\d+\s*ล้อ|เหมาคัน|trucking|line.?haul|เทรลเลอร์/i, 'road_freight'],
  [/ชิปปิ้ง|ตัวแทนออกของ|customs\s*broker|เคลียร์ศุลกากร|พิธีการศุลกากร/i, 'customs_broker'],
]

const BASIS_RULES: [RegExp, UnitBasis][] = [
  [/ต่อ\s*awb|per\s*awb|ต่อ\s*bl\b/i, 'per_awb'],
  [/กิโลเมตร|ต่อ\s*กม|per\s*km/i, 'per_km'],
  [/กิโล|กก\b|กก\.|kg|น้ำหนัก/i, 'per_kg'],
  [/กล่อง|per\s*box|carton/i, 'per_box'],
  [/พาเลท|pallet/i, 'per_pallet'],
  [/cbm|ลูกบาศก์|ลบ\.?\s*ม/i, 'per_cbm'],
  [/ตู้|container/i, 'per_container'],
  [/ตัน|ton/i, 'per_ton'],
  [/เที่ยว|trip/i, 'per_trip'],
  [/ชิ้น|พัสดุ|piece|parcel/i, 'per_piece'],
  [/shipment|ใบงาน|ต่องาน/i, 'per_shipment'],
  [/ชั่วโมง|hour/i, 'per_hour'],
  [/เดือน|month/i, 'per_month'],
  [/วัน\b|per\s*day/i, 'per_day'],
]

const UNIT_RE = '(กก\\.?|กิโลกรัม|กิโล|ชิ้น|พัสดุ|กล่อง|พาเลท|pallet|cbm|ลบ\\.?ม|ตัน|เที่ยว|กม\\.?|กิโลเมตร|ตู้|shipment|ใบงาน|awb|bl|ชั่วโมง|วัน|เดือน)'

function basisFromWord(w: string): UnitBasis | undefined {
  return BASIS_RULES.find(([re]) => re.test(w))?.[1]
}

function parseTiers(text: string): Tier[] {
  const tiers: Tier[] = []
  for (const seg of text.split(/[,;\n]|\s{2,}/)) {
    const s = seg.trim()
    if (!s) continue
    const perUnit = /ต่อ|\//.test(s)
    const range = s.match(/(\d+(?:\.\d+)?)\s*(?:-|–|ถึง)\s*(\d+(?:\.\d+)?)\s*(?:กก\.?|กิโล\w*|ชิ้น|กล่อง|พาเลท|cbm|ตัน)?\D{0,12}?(\d[\d,]*(?:\.\d+)?)/i)
    const open = s.match(/(?:(\d+(?:\.\d+)?)\s*(?:กก\.?|กิโล\w*|ชิ้น|กล่อง|พาเลท|cbm|ตัน)?\s*(?:ขึ้นไป|\+|ขึ้น)|(?:มากกว่า|เกิน)\s*(\d+(?:\.\d+)?)\s*(?:กก\.?|กิโล\w*|ชิ้น|กล่อง|พาเลท|cbm|ตัน)?)\D{0,12}?(\d[\d,]*(?:\.\d+)?)/i)
    if (range) tiers.push({ from: num(range[1]), to: num(range[2]), rate: num(range[3]), mode: perUnit ? 'per_unit' : 'flat' })
    else if (open) tiers.push({ from: num(open[1] ?? open[2]), rate: num(open[3]), mode: perUnit ? 'per_unit' : 'flat' })
  }
  return tiers.filter((t) => Number.isFinite(t.rate) && Number.isFinite(t.from))
}

function parseLanes(text: string): LaneRate[] {
  const lanes: LaneRate[] = []
  for (const seg of text.split(/[,;\n]/)) {
    const m = seg.trim().match(/(.+?)\s*(?:→|->|=>|ไป|ถึง|to)\s*(.+?)\s*[:=\s]\s*(\d[\d,]*(?:\.\d+)?)\s*(?:บาท|฿|thb)?\s*$/i)
    if (m) lanes.push({ origin: m[1].trim(), destination: m[2].trim(), rate: num(m[3]) })
  }
  return lanes
}

const SURCHARGE_RULES: [RegExp, SurchargeType][] = [
  [/น้ำมัน|fuel/i, 'fuel'],
  [/ห่างไกล|remote/i, 'remote_area'],
  [/\bcod\b|เก็บเงินปลายทาง/i, 'cod'],
  [/ขนาดใหญ่|oversize|เกินมาตรฐาน/i, 'oversize'],
  [/เทศกาล|peak/i, 'peak_season'],
  [/วัตถุอันตราย|\bdg\b/i, 'dangerous_goods'],
  [/ประกัน|insurance/i, 'insurance'],
  [/ค่ารอ|ล่วงเวลา|waiting/i, 'waiting'],
  [/ทางด่วน|toll/i, 'tollway'],
  [/ยกของ|จัดการ|handling/i, 'handling'],
]

function parseSurcharges(text: string): NonNullable<NonNullable<LinePatch['pricing']>['surcharges']> {
  const out: NonNullable<NonNullable<LinePatch['pricing']>['surcharges']> = []
  // one answer can name several surcharges ("ค่าน้ำมัน 8% พื้นที่ห่างไกล 30 บาท"): cut each comma-separated part at every keyword it contains
  const segs: [string, (typeof SURCHARGE_RULES)[number][1]][] = []
  for (const part of text.split(/[,;\n]/)) {
    const hits = SURCHARGE_RULES.flatMap(([re, t]) => {
      const m = re.exec(part)
      return m ? [{ t, i: m.index }] : []
    }).sort((a, b) => a.i - b.i)
    hits.forEach((h, n) => segs.push([part.slice(h.i, hits[n + 1]?.i ?? part.length), h.t]))
  }
  for (const [seg, type] of segs) {
    const pct = seg.match(/(\d+(?:\.\d+)?)\s*%/)
    const fixed = seg.match(/(\d[\d,]*(?:\.\d+)?)\s*(?:บาท|฿|thb)/i) ?? seg.match(/\s(\d[\d,]*(?:\.\d+)?)\s*$/)
    out.push({
      id: `s_${type}`,
      type,
      mode: pct ? 'percent' : /ต่อ/.test(seg) ? 'per_unit' : 'fixed',
      value: pct ? num(pct[1]) : fixed ? num(fixed[1]) : undefined,
    })
  }
  return out
}

function parseCustomsFees(text: string): CustomsFees | undefined {
  const f: CustomsFees = {}
  const decl = text.match(/(?:ต่อใบขน|ใบขน|declaration)\D{0,6}(\d[\d,]*)/i)
  const hs = text.match(/(?:ต่อรายการ|hs\s*line|ต่อ\s*hs)\D{0,8}(\d[\d,]*)/i)
  const cif = text.match(/(\d+(?:\.\d+)?)\s*%\s*(?:ของ)?\s*(?:cif|มูลค่า)/i)
  const dis = text.match(/ทดรอง\D{0,12}(\d+(?:\.\d+)?)\s*%/i)
  const min = text.match(/ขั้นต่ำ\D{0,4}(\d[\d,]*)/)
  if (decl) f.perDeclaration = num(decl[1])
  if (hs) f.perHsLine = num(hs[1])
  if (cif) f.percentOfCif = num(cif[1])
  if (dis) f.disbursementMarkupPct = num(dis[1])
  if (min) f.minFee = num(min[1])
  return Object.keys(f).length ? f : undefined
}

function mergePatches(list: LinePatch[]): LinePatch {
  const out: LinePatch = {}
  for (const p of list) {
    const { pricing, customs, serviceLevels, cargoTypes, ...rest } = p
    Object.assign(out, rest)
    if (serviceLevels) out.serviceLevels = Array.from(new Set([...(out.serviceLevels ?? []), ...serviceLevels]))
    if (cargoTypes) out.cargoTypes = Array.from(new Set([...(out.cargoTypes ?? []), ...cargoTypes]))
    if (customs) out.customs = { ...(out.customs ?? {}), ...customs }
    if (pricing) {
      const { surcharges, ...pr } = pricing
      out.pricing = { ...(out.pricing ?? {}), ...pr }
      if (surcharges) out.pricing.surcharges = [...(out.pricing.surcharges ?? []), ...surcharges]
    }
  }
  return out
}

function matchOptions(text: string, req?: Pending): LinePatch | undefined {
  if (!req?.options?.length) return undefined
  const t = text.toLowerCase().trim()
  const hits = req.options.filter((o) => {
    const l = o.label.toLowerCase()
    return t.includes(l) || (t.length >= 3 && l.includes(t))
  })
  // prefer the longest label when several overlap (e.g. "Door-to-door" inside a longer chip)
  const chosen = req.multi ? hits : hits.sort((x, y) => y.label.length - x.label.length).slice(0, 1)
  return chosen.length ? mergePatches(chosen.map((c) => c.patch)) : undefined
}

/** Free-text extraction. Returns a patch of everything we could understand, current question or not. */
export function extractPatch(raw: string, line: ServiceLine, current?: Pending): LinePatch {
  const text = normNum(raw)
  const patch: LinePatch = { pricing: {} }
  const pricing = patch.pricing!

  // 1) chips / exact option labels for the current question
  // (not when a surcharge answer carries numbers: "ค่าน้ำมัน 8% ห่างไกล 30 บาท" must be parsed as values, not as ticked option names)
  const viaOption = current?.key === 'pricing.surcharges' && /\d/.test(text) ? undefined : matchOptions(text, current)
  if (viaOption) return viaOption

  if (!line.category) {
    const c = CAT_RULES.find(([re]) => re.test(text))?.[1]
    if (c) patch.category = c
  }
  if (/ต่างประเทศ|ระหว่างประเทศ|international|นำเข้า|ส่งออก|import|export|ข้ามแดน/i.test(text)) patch.scope = 'international'
  else if (/ในประเทศ|domestic/i.test(text) && (current?.key === 'scope' || !line.scope)) patch.scope = 'domestic'
  if (/ทั้งนำเข้า|ทั้งสองทาง|นำเข้าและส่งออก|both/i.test(text)) patch.direction = 'both'
  else if (/ส่งออก|export/i.test(text)) patch.direction = 'export'
  else if (/นำเข้า|import/i.test(text)) patch.direction = 'import'

  if (/ไม่ทำพิธีการ|ไม่เคลียร์|ลูกค้าเคลียร์เอง|ลูกค้าจัดการเอง/.test(text)) patch.customs = { clearance: 'none' }
  else if (/ทำพิธีการ.*(ทั้งสอง|ทั้งต้นทางและปลายทาง)|เคลียร์.*ทั้งสอง/.test(text)) patch.customs = { clearance: 'both' }
  else if (/(ทำพิธีการ|เคลียร์ศุลกากร|เคลียร์).{0,10}(ต้นทาง|ขาออก)/.test(text)) patch.customs = { clearance: 'origin' }
  else if (/(ทำพิธีการ|เคลียร์ศุลกากร|เคลียร์).{0,10}(ปลายทาง|ขาเข้า)/.test(text)) patch.customs = { clearance: 'destination' }
  else if (current?.key === 'customs.clearance' && /ทำ|มี|เคลียร์|yes|ใช่/.test(text) && !/ไม่/.test(text)) patch.customs = { clearance: 'both' }
  if (/ใบอนุญาต|ทำเอง|ในนามบริษัท/.test(text) && /พิธีการ|ศุลกากร|ตัวแทนออกของ|ใบอนุญาต/.test(text)) patch.customs = { ...(patch.customs ?? {}), handling: 'self_licensed' }
  else if (/พันธมิตร|ชิปปิ้ง.*(ภายนอก|ร่วม)|ส่งต่อ.*ชิปปิ้ง/.test(text)) patch.customs = { ...(patch.customs ?? {}), handling: 'partner_broker' }
  if (/ทดรอง/.test(text)) patch.customs = { ...(patch.customs ?? {}), dutyTax: 'advance_and_rebill' }
  else if (/ลูกค้าจ่าย(อากร|ภาษี)?เอง|ลูกค้าชำระเอง/.test(text)) patch.customs = { ...(patch.customs ?? {}), dutyTax: 'customer_direct' }

  const levels: string[] = []
  if (/ด่วน|express/i.test(text)) levels.push('ด่วน (Express)')
  if (/มาตรฐาน|standard/i.test(text)) levels.push('มาตรฐาน (Standard)')
  if (/ประหยัด|economy/i.test(text)) levels.push('ประหยัด (Economy)')
  if (levels.length && (current?.key === 'serviceLevels' || !line.serviceLevels?.length)) patch.serviceLevels = levels

  const cargo: string[] = []
  if (/ทั่วไป|general/i.test(text)) cargo.push('สินค้าทั่วไป')
  if (/แตกหัก|fragile/i.test(text)) cargo.push('แตกหักง่าย')
  if (/อุณหภูมิ|cold|แช่เย็น|แช่แข็ง/i.test(text)) cargo.push('ควบคุมอุณหภูมิ (Cold chain)')
  if (/วัตถุอันตราย|\bdg\b|dangerous/i.test(text)) cargo.push('วัตถุอันตราย (DG)')
  if (/ขนาดใหญ่|น้ำหนักมาก|oversize/i.test(text)) cargo.push('สินค้าขนาดใหญ่/น้ำหนักมาก')
  if (/ของมีค่า|valuable/i.test(text)) cargo.push('ของมีค่า')
  if (cargo.length && current?.key === 'cargoTypes') patch.cargoTypes = cargo

  // -------- pricing
  const flat = text.match(new RegExp('(\\d[\\d,]*(?:\\.\\d+)?)\\s*(?:บาท|฿|thb)?\\s*(?:ต่อ|/)\\s*' + UNIT_RE, 'i'))
  const tiers = parseTiers(text)
  const lanes = parseLanes(text)
  const stated = text.match(/คิด(?:ราคา|ค่าบริการ|ค่าขนส่ง)?\s*(?:เป็น|ตาม|ต่อ|เป็นราย)\s*([ก-๙A-Za-z]+)/)
  if (stated && !line.pricing.basis && !pricing.basis) {
    const b = basisFromWord(stated[1])
    if (b) pricing.basis = b
  }
  if (current?.key === 'pricing.basis' || (!line.pricing.basis && flat)) {
    const b = flat ? basisFromWord(flat[2]) : (BASIS_RULES.find(([re]) => re.test(text)) ?? [])[1]
    if (b) pricing.basis = b
  }
  if (tiers.length >= 1 && (tiers.length >= 2 || /กก|ช่วง|ขึ้นไป/.test(text))) {
    pricing.tiers = tiers
    pricing.model = 'tiered'
    const unitWord = text.match(new RegExp('ต่อ\\s*' + UNIT_RE, 'i'))
    if (!line.pricing.basis && !pricing.basis) pricing.basis = unitWord ? basisFromWord(unitWord[1]) : 'per_kg'
  } else if (lanes.length) {
    pricing.lanes = lanes
    pricing.model = 'lane_table'
  } else if (flat && (current?.key === 'pricing.values' || current?.key === 'pricing.basis' || current?.key === 'pricing.model' || line.pricing.model === 'flat')) {
    pricing.rate = num(flat[1])
    pricing.model = line.pricing.model ?? 'flat'
    if (!line.pricing.basis) pricing.basis = basisFromWord(flat[2])
  }
  if (current?.key === 'pricing.model') {
    if (/ราคาเดียว|flat|เหมา(?!คัน)/i.test(text)) pricing.model = 'flat'
    else if (/ช่วง|tier|weight/i.test(text)) pricing.model = 'tiered'
    else if (/เส้นทาง|lane|โซน|zone/i.test(text)) pricing.model = 'lane_table'
    else if (/quote|เสนอราคา|รายงาน/i.test(text)) pricing.model = 'quote_on_request'
  }
  if (current?.key === 'pricing.values' && !pricing.rate && !pricing.tiers && !pricing.lanes && line.pricing.model === 'flat') {
    const bare = text.match(/^\D{0,6}(\d[\d,]*(?:\.\d+)?)\s*(?:บาท|฿|thb)?\s*$/i)
    if (bare) pricing.rate = num(bare[1])
  }
  const minC = current?.key === 'pricing.customsFees' ? null : text.match(/ขั้นต่ำ\D{0,6}(\d[\d,]*)/)
  if (minC) pricing.minCharge = num(minC[1])
  if (/ไม่มี(ค่า)?ขั้นต่ำ/.test(text)) pricing.minChargeAsked = true
  const base = text.match(/(?:ค่าเปิดบริการ|ค่าเปิดงาน|base fee|flag.?fall)\D{0,6}(\d[\d,]*)/i)
  if (base) pricing.baseFee = num(base[1])

  if (current?.key === 'pricing.chargeable' || /ปริมาตร|volumetric/i.test(text)) {
    const div = text.match(/(?:÷|หาร|÷\s*)\s*(\d{4})|\b(5000|6000)\b/)
    const divisor = div ? parseInt(div[1] ?? div[2], 10) : undefined
    if (/ที่มากกว่า|มากกว่า|greater/i.test(text)) pricing.chargeable = { rule: 'greater', divisor: divisor ?? 5000 }
    else if (/ปริมาตร/.test(text) && !/จริง/.test(text)) pricing.chargeable = { rule: 'volumetric', divisor: divisor ?? 5000 }
    else if (/น้ำหนักจริง|actual/i.test(text)) pricing.chargeable = { rule: 'actual' }
  }

  if (current?.key === 'pricing.surcharges' || /ค่าน้ำมัน|fuel|ห่างไกล|\bcod\b|เทศกาล/i.test(text)) {
    const sc = parseSurcharges(text)
    if (sc.length) {
      pricing.surcharges = sc
      if (sc.every((s) => s.value != null)) pricing.surchargesAsked = true
    }
    if (/ไม่มี(ค่า)?(ธรรมเนียม|เพิ่ม)|ไม่มี$/.test(text)) pricing.surchargesAsked = true
  }

  if (current?.key === 'pricing.customsFees') {
    const cf = parseCustomsFees(text)
    if (cf) pricing.customsFees = cf
  }

  const inc = text.match(/(?:^|\s|,)รวม\s*([^,;]+?)(?=\s*(?:ไม่รวม|$|[,;]))/)
  const exc = text.match(/ไม่รวม\s*([^,;]+)/)
  if (current?.key === 'pricing.scope' || inc || exc) {
    if (inc) pricing.included = inc[1].trim()
    if (exc) pricing.excluded = exc[1].trim()
    if (current?.key === 'pricing.scope' && !inc && !exc) {
      if (/^(ไม่มี|ไม่ระบุ|none)/i.test(text.trim())) pricing.included = 'ไม่ระบุเพิ่มเติม'
      else pricing.included = text.trim().slice(0, 200)
    }
  }

  const credit = text.match(/เครดิต\D{0,6}(\d+)/)
  if (credit) pricing.paymentTermsDays = parseInt(credit[1], 10)
  if (current?.key === 'pricing.validity' || /ใช้ได้ถึง|ยืนราคาถึง|valid\s*until/i.test(text)) {
    const until = text.match(/(?:ใช้ได้ถึง|ถึงวันที่|ถึง|valid(?:\s*until)?)\s*([^,;]+?)(?=\s*(?:เครดิต|$|[,;]))/i)
    pricing.validTo = (until ? until[1] : text.replace(/เครดิต.*/, '')).trim().slice(0, 40) || undefined
  }

  // -------- free-text fields for the current question
  if (current?.free && !viaOption) {
    const t = raw.trim()
    const usedByPricing = Object.keys(pricing).length > 0
    if (t && !usedByPricing && t.length >= 2) {
      const k = current.key
      if (k === 'coverage') patch.coverage = t.slice(0, 160)
      else if (k === 'equipment') patch.equipment = t.slice(0, 160)
      else if (k === 'transit') patch.transit = t.slice(0, 60)
      else if (k === 'capacity') patch.capacity = t.slice(0, 120)
      else if (k === 'pricing.minCharge') {
        const m = t.match(/(\d[\d,]*)/)
        if (m) pricing.minCharge = num(m[1])
      }
    }
  }
  return patch
}

function describe(patch: LinePatch): string[] {
  const out: string[] = []
  if (patch.serviceMode) out.push(`รูปแบบบริการ: ${patch.serviceMode}`)
  if (patch.serviceLevels?.length) out.push(`ระดับบริการ: ${patch.serviceLevels.join(', ')}`)
  if (patch.coverage) out.push('เส้นทาง/พื้นที่')
  if (patch.equipment) out.push('อุปกรณ์/พาหนะ')
  if (patch.cargoTypes?.length) out.push(`สินค้าที่รับ: ${patch.cargoTypes.join(', ')}`)
  if (patch.transit) out.push(`เวลาขนส่ง ${patch.transit}`)
  if (patch.capacity) out.push('ปริมาณงาน')
  if (patch.category) out.push(`ประเภทบริการ: ${CATEGORY_LABEL[patch.category]}`)
  if (patch.scope) out.push(patch.scope === 'international' ? 'ระหว่างประเทศ' : 'ในประเทศ')
  if (patch.direction) out.push(`ทิศทาง: ${{ export: 'ส่งออก', import: 'นำเข้า', both: 'ทั้งสองทาง' }[patch.direction]}`)
  if (patch.customs?.clearance) out.push(`ศุลกากร: ${{ none: 'ไม่ทำพิธีการ', origin: 'ทำที่ต้นทาง', destination: 'ทำที่ปลายทาง', both: 'ทำทั้งสองฝั่ง' }[patch.customs.clearance]}`)
  if (patch.customs?.handling) out.push(patch.customs.handling === 'self_licensed' ? 'ทำพิธีการเอง (มีใบอนุญาต)' : 'ใช้ชิปปิ้งพันธมิตร')
  if (patch.customs?.dutyTax) out.push(patch.customs.dutyTax === 'advance_and_rebill' ? 'ออกเงินทดรองอากร' : 'ลูกค้าจ่ายอากรเอง')
  const p = patch.pricing
  if (p?.basis) out.push(`หน่วยคิดราคา ${BASIS_LABEL[p.basis]}`)
  if (p?.model) out.push('รูปแบบราคา')
  if (p?.rate != null) out.push(`ราคา ${fmtNum(p.rate)}`)
  if (p?.tiers?.length) out.push(`${p.tiers.length} ช่วงราคา`)
  if (p?.lanes?.length) out.push(`${p.lanes.length} เส้นทาง`)
  if (p?.minCharge != null) out.push(`ขั้นต่ำ ${fmtNum(p.minCharge)}`)
  if (p?.surcharges?.length) out.push(`ส่วนเพิ่ม: ${p.surcharges.map((s) => SURCHARGE_LABEL[s.type].split(' ')[0]).join(', ')}`)
  if (p?.customsFees) out.push('ค่าดำเนินพิธีการ')
  return out
}

export function localTurn(text: string, line: ServiceLine): LineTurn {
  const base = { mode: 'offline' as const, finished: false, newLine: false }
  const t = text.trim()

  if (t === '__continue__') {
    const n = nextRequirement(line)
    return n
      ? { ...base, reply: `บันทึกการแก้ไขแล้วครับ

${n.ask}`, patch: {}, suggestions: n.options?.map((o) => o.label).slice(0, 10) ?? [], showPricing: n.builder }
      : { ...base, reply: 'ข้อมูลของบริการนี้ครบแล้วครับ ถ้ามีบริการอื่นเล่าต่อได้เลย หรือพิมพ์ "ไม่มีแล้ว" เพื่อไปแนบเอกสาร', patch: {}, suggestions: ['มี ผมมีบริการอื่นด้วย', 'ไม่มีแล้ว'], showPricing: false }
  }
  if (OFFTOPIC.test(t) && !/ขนส่ง|ศุลกากร|พัสดุ|ราคา|บริการ/.test(t)) {
    const req = nextRequirement(line)
    return { ...base, reply: OFFTOPIC_REPLY + (req ? '\n\n' + req.ask : ''), patch: {}, suggestions: req?.options?.map((o) => o.label).slice(0, 10) ?? [], showPricing: !!req?.builder }
  }
  if (/เพิ่มบริการ|อีกบริการ|บริการอื่น|add (another )?service/i.test(t)) return { ...base, reply: 'ได้ครับ เริ่มบริการใหม่ได้เลย', patch: {}, suggestions: [], showPricing: false, newLine: true }
  if (/^(พอแล้ว|เสร็จแล้ว|เสร็จ|จบ|ไม่มีแล้ว|ไม่เพิ่มแล้ว|done)/i.test(t)) return { ...base, reply: 'เรียบร้อยครับ ไปที่หน้า "เอกสาร" เพื่อแนบเอกสารบังคับ แล้วตรวจสรุปและส่งใบสมัครได้เลย', patch: {}, suggestions: [], showPricing: false, finished: true }

  const asks = /\?|ไหม|คืออะไร|หมายถึง|ยังไง|อย่างไร|ทำไม|what is/i.test(t)
  const gloss = GLOSSARY.find(([re]) => re.test(t))
  const current = nextRequirement(line)
  if (asks && gloss) {
    return {
      ...base,
      reply: gloss[1] + (current ? '\n\nกลับมาที่คำถามเดิมนะครับ: ' + current.ask : ''),
      patch: {},
      suggestions: current?.options?.map((o) => o.label).slice(0, 9) ?? [],
      showPricing: !!current?.builder,
    }
  }
  if (/ทำไมต้องถาม|ถามทำไม|เพราะอะไร/.test(t) && current) {
    return { ...base, reply: `${current.why}\n\nคำถามเดิม: ${current.ask}`, patch: {}, suggestions: current.options?.map((o) => o.label).slice(0, 9) ?? [], showPricing: !!current.builder }
  }

  const patch = extractPatch(t, line, current)
  if (patch.pricing && Object.keys(patch.pricing).length === 0) delete patch.pricing
  const got = describe(patch)
  const updated = applyPatch(line, patch)
  const next = nextRequirement(updated)

  if (!got.length && Object.keys(patch).length === 0) {
    return {
      ...base,
      reply: 'ขอโทษครับ ผมยังจับใจความไม่ได้ ลองตอบสั้น ๆ ตามตัวอย่างด้านล่างได้เลย\n\n' + (current ? current.ask : ''),
      patch: {},
      suggestions: current?.options?.map((o) => o.label).slice(0, 9) ?? [],
      showPricing: !!current?.builder,
    }
  }

  let reply = 'รับทราบครับ'
  // analysis notes: explain *why* the interview branches
  if (patch.scope === 'international' && !line.scope) reply += '\nเนื่องจากเป็นบริการระหว่างประเทศ ผมจะถามเรื่องพิธีการศุลกากร (เคลียร์ศุลกากร) และค่าธรรมเนียมที่เกี่ยวข้องเพิ่มด้วย'
  if (patch.pricing?.basis === 'per_kg' && updated.category && ['courier_parcel', 'air_freight', 'last_mile'].includes(updated.category)) reply += '\nคิดเป็นกิโลกรัม จึงต้องกำหนดด้วยว่าใช้น้ำหนักจริงหรือน้ำหนักตามปริมาตร'
  if (patch.customs?.clearance && patch.customs.clearance !== 'none') reply += '\nเมื่อทำพิธีการศุลกากร ต้องรู้ว่าใครเป็นผู้ทำและใครจ่ายอากร รวมถึงค่าดำเนินพิธีการ'

  if (!next) {
    return { ...base, reply: reply + '\n\nข้อมูลของบริการนี้ครบแล้วครับ ถ้ามีบริการอื่น เช่น เส้นทางหรือประเภทอื่น เล่าต่อได้เลย หรือพิมพ์ "ไม่มีแล้ว" แล้วไปแนบเอกสารในหน้า "เอกสาร"', patch, suggestions: ['มี ผมมีบริการอื่นด้วย', 'ไม่มีแล้ว'], showPricing: false }
  }
  reply += `\n\n${next.ask}`
  return {
    ...base,
    reply,
    patch,
    suggestions: next.options?.map((o) => o.label).slice(0, 10) ?? [],
    showPricing: next.builder || !!patch.pricing,
  }
}

export { remaining }
