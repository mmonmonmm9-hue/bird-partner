import type { Category, LinePatch, Requirement, ServiceLine, UnitBasis } from './types'
import {
  BASIS_LABEL, CARGO_TYPES, CATEGORY_LABEL, CUSTOMS_CLEARANCE_LABEL, DIRECTION_LABEL, INTERNATIONAL_BY_NATURE, MODEL_LABEL,
  SURCHARGE_LABEL, TYPICAL_BASIS,
} from './schema'

/**
 * The interview is data-driven and BRANCHING: what is asked next depends on what is already known
 * (e.g. an international line triggers customs-clearance questions; a per-kg basis triggers chargeable-weight rules).
 * The deterministic rules below are the guard-rail: they decide what must still be known before a service line is complete.
 * In live mode Claude reads this list, decides how to ask it, and may ask extra clarifying questions; it cannot skip it.
 */

interface Rule {
  key: string
  applies: (l: ServiceLine) => boolean
  filled: (l: ServiceLine) => boolean
  ask: (l: ServiceLine) => string
  why: string
  options?: (l: ServiceLine) => { label: string; patch: LinePatch }[]
  multi?: boolean
  free?: boolean
}

export const DG_RE = /DG|วัตถุอันตราย/
const DG_LABEL = CARGO_TYPES.find((c) => DG_RE.test(c)) ?? 'วัตถุอันตราย (DG)'
/** "we carry everything": counts as every cargo type until the dangerous-goods question is answered explicitly */
export const CARRY_ALL_RE = /(ขน|รับ)?ได้ทุกอย่าง|รับทุกอย่าง|ขนทุกอย่าง|ทุกประเภท|ได้หมด|carry everything|all (types|cargo)/i
const intl = (l: ServiceLine) => l.scope === 'international'
const in_ = (l: ServiceLine, ...c: Category[]) => !!l.category && c.includes(l.category)
const hasCustoms = (l: ServiceLine) => intl(l) && !!l.customs?.clearance && l.customs.clearance !== 'none'

const MODE_OPTIONS: Partial<Record<Category, string[]>> = {
  road_freight: ['Door-to-door', 'Point-to-point (จุดต่อจุด)', 'Line-haul ระหว่างศูนย์กระจาย', 'เหมาคัน (FTL)', 'รวมสินค้า (LTL)'],
  courier_parcel: ['รับถึงที่-ส่งถึงมือ (Door-to-door)', 'ลูกค้านำส่งที่จุดบริการ (Drop-off)', 'เฉพาะรับพัสดุ (Pickup only)', 'เฉพาะนำส่ง (Delivery only)'],
  last_mile: ['ส่งด่วนภายในวัน (Same-day)', 'ส่งตามรอบ (Scheduled)', 'ส่งตามคำสั่งซื้อ (On-demand)'],
  air_freight: ['Airport-to-airport', 'Door-to-airport', 'Airport-to-door', 'Door-to-door'],
  sea_freight: ['Port-to-port', 'Door-to-port', 'Port-to-door', 'Door-to-door'],
  cross_border_road: ['Door-to-door', 'Border-to-border (ถ่ายลำที่ชายแดน)', 'Terminal-to-terminal'],
  warehouse: ['ฝากเก็บ (Storage)', 'Pick & Pack / Fulfillment', 'Cross-dock', 'คลังทัณฑ์บน (Bonded warehouse)'],
  customs_broker: ['ทำพิธีการขาเข้า', 'ทำพิธีการขาออก', 'ทำทั้งขาเข้าและขาออก'],
  freight_forwarder: ['FCL', 'LCL', 'Air', 'Multimodal (หลายรูปแบบ)'],
  other: [],
}

const EQUIP_ASK: Partial<Record<Category, { ask: string; chips: string[] }>> = {
  road_freight: { ask: 'ใช้ยานพาหนะอะไรบ้าง และบรรทุกได้เท่าไร (เช่น รถ 6 ล้อ 4 ตัน, กระบะ 1.5 ตัน)', chips: ['รถกระบะ', 'รถตู้ทึบ', 'รถ 6 ล้อ', 'รถ 10 ล้อ', 'รถหัวลาก/เทรลเลอร์'] },
  courier_parcel: { ask: 'พัสดุ 1 ชิ้นรับได้หนักสุดและใหญ่สุดเท่าไร (น้ำหนัก และขนาด กxยxส ซม.)', chips: ['ไม่เกิน 5 กก.', 'ไม่เกิน 30 กก.', 'ไม่เกิน 70 กก.'] },
  last_mile: { ask: 'ใช้พาหนะอะไรส่ง และของ 1 ชิ้นรับได้ขนาด/น้ำหนักสูงสุดเท่าไร', chips: ['มอเตอร์ไซค์', 'รถยนต์', 'รถกระบะ/รถตู้'] },
  air_freight: { ask: 'ให้บริการกับสายการบินหรือท่าอากาศยานใดบ้าง', chips: ['BKK สุวรรณภูมิ', 'DMK ดอนเมือง', 'หลายสายการบิน'] },
  sea_freight: { ask: 'รับตู้/สินค้าประเภทใด', chips: ["FCL 20'", "FCL 40'/40HC", 'LCL', 'ตู้เย็น (Reefer)'] },
  cross_border_road: { ask: 'ใช้รถแบบใดข้ามแดน (ทะเบียนข้ามแดน/ใบอนุญาต GMS ถ้ามี)', chips: ['รถ 10 ล้อ', 'รถหัวลาก', 'รถตู้ทึบ/กระบะ'] },
  warehouse: { ask: 'พื้นที่คลังและความจุเป็นเท่าไร (ตร.ม. หรือจำนวนพาเลท) และมีระบบ WMS ไหม', chips: ['ไม่เกิน 1,000 ตร.ม.', '1,000-5,000 ตร.ม.', 'มากกว่า 5,000 ตร.ม.'] },
  freight_forwarder: { ask: 'มีเครือข่าย/ตัวแทนปลายทางที่ไหน หรือสายเรือ/สายการบินที่ใช้', chips: [] },
  other: { ask: 'ช่วยอธิบายบริการและอุปกรณ์/ทรัพยากรที่ใช้', chips: [] },
}

const RULES: Rule[] = [
  {
    key: 'category',
    applies: () => true,
    filled: (l) => !!l.category,
    ask: () => 'บริการที่ต้องการลงทะเบียนเป็นประเภทไหนครับ? (1 บริการ = 1 ชุดราคา ถ้ามีหลายบริการเพิ่มได้ภายหลัง)',
    why: 'ประเภทบริการกำหนดคำถามและโครงสร้างราคาที่เหมาะสม',
    options: () =>
      (Object.keys(CATEGORY_LABEL) as Category[]).map((c) => ({
        label: CATEGORY_LABEL[c],
        patch: {
          category: c,
          ...(INTERNATIONAL_BY_NATURE.includes(c) ? { scope: 'international' as const } : {}),
          ...(c === 'last_mile' || c === 'warehouse' ? { scope: 'domestic' as const } : {}),
        },
      })),
  },
  {
    key: 'scope',
    applies: (l) => in_(l, 'road_freight', 'courier_parcel', 'air_freight', 'other'),
    filled: (l) => !!l.scope,
    ask: () => 'บริการนี้เป็นการขนส่งภายในประเทศ หรือระหว่างประเทศครับ?',
    why: 'ถ้าเป็นระหว่างประเทศ ต้องถามเรื่องพิธีการศุลกากร ประเทศปลายทาง และค่าธรรมเนียมที่เกี่ยวข้อง',
    options: () => [
      { label: 'ภายในประเทศ', patch: { scope: 'domestic' } },
      { label: 'ระหว่างประเทศ', patch: { scope: 'international' } },
    ],
  },
  {
    key: 'direction',
    applies: intl,
    filled: (l) => !!l.direction,
    ask: () => 'ให้บริการทิศทางไหนครับ ส่งออก นำเข้า หรือทั้งสองทาง?',
    why: 'ทิศทางกำหนดว่าพิธีการศุลกากรและเอกสารฝั่งไหนที่ต้องรับผิดชอบ',
    options: () => (['export', 'import', 'both'] as const).map((d) => ({ label: DIRECTION_LABEL[d], patch: { direction: d } })),
  },
  {
    key: 'serviceMode',
    applies: (l) => !!l.category && l.category !== 'other',
    filled: (l) => !!l.serviceMode,
    ask: (l) => (l.category === 'customs_broker' ? 'รับทำพิธีการศุลกากรขาไหนครับ?' : 'รูปแบบการให้บริการ (ขอบเขตงาน) เป็นแบบไหนครับ?'),
    why: 'รูปแบบบริการ เช่น Door-to-door หรือ Port-to-port ต่างกันที่จุดรับ-ส่งและค่าใช้จ่ายที่รวมในราคา',
    options: (l) => (MODE_OPTIONS[l.category!] ?? []).map((m) => ({ label: m, patch: { serviceMode: m } })),
  },
  {
    key: 'serviceLevels',
    applies: (l) => in_(l, 'road_freight', 'courier_parcel', 'last_mile', 'air_freight', 'sea_freight', 'cross_border_road', 'freight_forwarder'),
    filled: (l) => !!l.serviceLevels?.length,
    ask: () => 'ระดับความเร็วของบริการมีแบบไหนบ้างครับ? (เลือกได้หลายแบบ)',
    why: 'แต่ละระดับ เช่น ด่วน/มาตรฐาน/ประหยัด มักมีราคาและเวลาส่งต่างกัน',
    multi: true,
    options: () => ['ด่วน (Express)', 'มาตรฐาน (Standard)', 'ประหยัด (Economy)'].map((s) => ({ label: s, patch: { serviceLevels: [s] } })),
  },
  {
    key: 'coverage',
    applies: () => true,
    filled: (l) => !!l.coverage,
    ask: (l) =>
      intl(l)
        ? 'ให้บริการเส้นทางไหนบ้างครับ? บอกประเทศ/ท่า/สนามบินต้นทาง→ปลายทาง เช่น "กรุงเทพ→เวียงจันทน์", "BKK→LAX", "แหลมฉบัง→เซี่ยงไฮ้"'
        : 'ให้บริการพื้นที่หรือเส้นทางไหนบ้างครับ? เช่น "กรุงเทพ–ชลบุรี–ระยอง" หรือ "ทั่วประเทศ"',
    why: 'พื้นที่และเส้นทางใช้ทั้งจับคู่งานและกำหนดราคาตามเส้นทาง',
    free: true,
  },
  {
    key: 'equipment',
    applies: (l) => !!l.category && l.category !== 'customs_broker',
    filled: (l) => !!l.equipment,
    ask: (l) => EQUIP_ASK[l.category!]?.ask ?? 'ใช้อุปกรณ์/พาหนะอะไร',
    why: 'ใช้จัดงานให้เหมาะกับขนาดและน้ำหนักที่รับได้',
    free: true,
    options: (l) => (EQUIP_ASK[l.category!]?.chips ?? []).map((c) => ({ label: c, patch: { equipment: c } })),
  },
  {
    key: 'cargoTypes',
    applies: (l) => !!l.category && l.category !== 'customs_broker',
    filled: (l) => !!l.cargoTypes?.length,
    ask: () => 'รับสินค้าประเภทไหนได้บ้างครับ? (เลือกได้หลายอย่าง)',
    why: 'สินค้าควบคุมอุณหภูมิ วัตถุอันตราย หรือของแตกหักง่าย ต้องใช้อุปกรณ์/ใบอนุญาตเพิ่มและมักมีค่าธรรมเนียมพิเศษ',
    multi: true,
    options: () => CARGO_TYPES.map((c) => ({ label: c, patch: { cargoTypes: [c] } })),
  },
  {
    key: 'dangerousGoods',
    applies: (l) => !!l.category && l.category !== 'customs_broker' && !!l.cargoTypes?.length,
    filled: (l) => l.dangerousGoods !== undefined,
    ask: () => 'บริการนี้รับขนส่งวัตถุอันตรายด้วยไหมครับ เช่น แบตเตอรี่ลิเธียม สารไวไฟ สารเคมี ถ้ารับต้องมีใบอนุญาตขนวัตถุอันตราย รบกวนตอบให้ชัดว่า "รับ" หรือ "ไม่รับ"',
    why: 'การขนวัตถุอันตรายต้องมีใบอนุญาตเฉพาะ ถ้าบอกว่ารับ ระบบจะขอเอกสารนี้เป็นเอกสารบังคับ',
    options: () => [
      { label: 'รับวัตถุอันตราย', patch: { dangerousGoods: true } },
      { label: 'ไม่รับวัตถุอันตราย', patch: { dangerousGoods: false } },
    ],
  },
  {
    key: 'customs.clearance',
    applies: intl,
    filled: (l) => !!l.customs?.clearance,
    ask: (l) =>
      l.category === 'customs_broker'
        ? 'พิธีการศุลกากรทำที่ฝั่งไหนบ้างครับ?'
        : 'บริการระหว่างประเทศนี้ "ทำพิธีการศุลกากร (เคลียร์ศุลกากร)" ให้ลูกค้าด้วยไหมครับ? ถ้าทำ ทำที่ต้นทาง ปลายทาง หรือทั้งสองฝั่ง?',
    why: 'พิธีการศุลกากรเกี่ยวกับใบอนุญาต เอกสาร (Invoice, Packing list, HS Code) และความรับผิดชอบเรื่องอากร จึงต้องระบุให้ชัดว่าใครทำ',
    options: () =>
      (Object.keys(CUSTOMS_CLEARANCE_LABEL) as (keyof typeof CUSTOMS_CLEARANCE_LABEL)[]).map((k) => ({
        label: CUSTOMS_CLEARANCE_LABEL[k],
        patch: { customs: { clearance: k } },
      })),
  },
  {
    key: 'customs.handling',
    applies: hasCustoms,
    filled: (l) => !!l.customs?.handling,
    ask: () => 'พิธีการศุลกากรนี้ทำเองในนามบริษัท (มีใบอนุญาตตัวแทนออกของ) หรือส่งต่อให้ชิปปิ้ง/ตัวแทนออกของพันธมิตรครับ?',
    why: 'ผู้ทำพิธีการต้องมีใบอนุญาตตัวแทนออกของ ถ้าใช้พันธมิตร Bird จะขอข้อมูลผู้ให้บริการด้วย',
    options: () => [
      { label: 'ทำเองในนามบริษัท (มีใบอนุญาตตัวแทนออกของ)', patch: { customs: { handling: 'self_licensed' } } },
      { label: 'ใช้ชิปปิ้ง/ตัวแทนออกของพันธมิตร', patch: { customs: { handling: 'partner_broker' } } },
    ],
  },
  {
    key: 'customs.dutyTax',
    applies: hasCustoms,
    filled: (l) => !!l.customs?.dutyTax,
    ask: () => 'เรื่องอากรและภาษีนำเข้า ลูกค้าจ่ายเองกับกรมศุลกากร หรือบริษัทออกเงินทดรองจ่ายแล้วเรียกเก็บคืนครับ?',
    why: 'การออกเงินทดรองมีความเสี่ยงด้านการเงิน และมีผลต่อวิธีคิดค่าบริการ (disbursement) และเครดิตเทอม',
    options: () => [
      { label: 'ลูกค้าจ่ายอากรเอง', patch: { customs: { dutyTax: 'customer_direct' } } },
      { label: 'ออกเงินทดรองจ่ายแล้วเรียกเก็บคืน', patch: { customs: { dutyTax: 'advance_and_rebill' } } },
    ],
  },
  {
    key: 'transit',
    applies: (l) => !!l.category && !in_(l, 'warehouse', 'customs_broker'),
    filled: (l) => !!l.transit,
    ask: () => 'เวลาขนส่งโดยทั่วไปประมาณกี่วันครับ? (เช่น 1–2 วัน ภายในวัน 3–5 วันทำการ)',
    why: 'ใช้เป็นข้อตกลงระดับบริการ (SLA) กับลูกค้า',
    free: true,
  },
  {
    key: 'capacity',
    applies: (l) => !!l.category,
    filled: (l) => !!l.capacity,
    ask: (l) => (in_(l, 'warehouse') ? 'รองรับสินค้าเข้า-ออกได้ปริมาณเท่าไรต่อวัน' : 'รับงานได้ประมาณเท่าไรต่อวัน/สัปดาห์ (จำนวนเที่ยว ชิ้น หรือกิโลกรัม)'),
    why: 'ใช้ป้องกันการรับงานเกินกำลัง',
    free: true,
  },
  {
    key: 'pricing.basis',
    applies: (l) => !!l.category,
    filled: (l) => !!l.pricing.basis,
    ask: () => 'ราคาที่คุณคิดกับลูกค้า นับเป็นหน่วยอะไรครับ? แต่ละเจ้าคิดไม่เหมือนกัน เช่น ต่อกิโลกรัม ต่อกล่อง ต่อพาเลท ต่อเที่ยว หรือต่อ CBM',
    why: 'หน่วยคิดราคาเป็นฐานของโครงสร้างราคาทั้งหมด (ค่าขนส่ง ขั้นต่ำ ส่วนเพิ่ม)',
    options: (l) => {
      const typical = TYPICAL_BASIS[l.category ?? 'other']
      const all = Object.keys(BASIS_LABEL) as UnitBasis[]
      return [...typical, ...all.filter((b) => !typical.includes(b))].slice(0, 9).map((b) => ({ label: BASIS_LABEL[b], patch: { pricing: { basis: b } } }))
    },
  },
  {
    key: 'pricing.model',
    applies: (l) => !!l.pricing.basis,
    filled: (l) => !!l.pricing.model,
    ask: () => 'โครงสร้างราคาเป็นแบบไหนครับ? ราคาเดียวทุกกรณี คิดตามช่วงน้ำหนัก/จำนวน (เช่น 0–5 กก. = 60 บาท, 5–20 กก. = 12 บาท/กก.) หรือกำหนดตามเส้นทาง',
    why: 'เลือกแบบที่ตรงกับวิธีคิดจริงของคุณ เพื่อให้ผู้ช่วยถามตัวเลขได้ตรงกับแบบที่คุณใช้',
    options: () => (Object.keys(MODEL_LABEL) as (keyof typeof MODEL_LABEL)[]).map((m) => ({ label: MODEL_LABEL[m], patch: { pricing: { model: m } } })),
  },
  {
    key: 'pricing.values',
    applies: (l) => !!l.pricing.model && l.pricing.model !== 'quote_on_request',
    filled: (l) => {
      const p = l.pricing
      if (p.model === 'flat') return p.rate != null
      if (p.model === 'tiered') return p.tiers.length > 0
      if (p.model === 'lane_table') return p.lanes.length > 0
      return true
    },
    ask: (l) =>
      l.pricing.model === 'flat'
        ? 'ราคาเท่าไรครับ? พิมพ์ได้เลย เช่น "1,500 บาทต่อเที่ยว"'
        : l.pricing.model === 'tiered'
          ? 'ขอช่วงราคาครับ พิมพ์ได้เลย เช่น "0-5 กก. 60 บาท, 5-20 กก. 12 บาทต่อกก., 20 กก.ขึ้นไป 9 บาทต่อกก."'
          : 'ขอราคาตามเส้นทางครับ เช่น "กรุงเทพ→ชลบุรี 1,500, กรุงเทพ→ระยอง 2,200"',
    why: 'ต้องมีตัวเลขราคาอย่างน้อยหนึ่งชุดจึงจะตรวจสอบและอนุมัติเชิงพาณิชย์ได้',
    free: true,
  },
  {
    key: 'pricing.minCharge',
    applies: (l) => !!l.pricing.model && l.pricing.model !== 'quote_on_request',
    filled: (l) => !!l.pricing.minChargeAsked || l.pricing.minCharge != null,
    ask: () => 'มีค่าบริการขั้นต่ำต่อรายการ (Minimum charge) หรือค่าเปิดบริการ (Base fee) ไหมครับ? เช่น ขั้นต่ำ 100 บาท',
    why: 'งานชิ้นเล็กอาจไม่คุ้มต้นทุน ค่าขั้นต่ำช่วยป้องกันการขาดทุน',
    free: true,
    options: () => [{ label: 'ไม่มีค่าขั้นต่ำ', patch: { pricing: { minChargeAsked: true } } }],
  },
  {
    key: 'pricing.chargeable',
    applies: (l) => l.pricing.basis === 'per_kg' && in_(l, 'courier_parcel', 'air_freight', 'last_mile', 'freight_forwarder', 'cross_border_road'),
    filled: (l) => !!l.pricing.chargeable,
    ask: () => 'น้ำหนักที่ใช้คิดราคา คิดจากน้ำหนักจริง น้ำหนักตามปริมาตร (กxยxส÷ตัวหาร) หรือเอาค่าที่มากกว่าครับ?',
    why: 'พัสดุเบาแต่ใหญ่คิดตามปริมาตรจึงจะคุ้มต้นทุน ตัวหารที่ใช้บ่อย: 5000 (Express/ Air) หรือ 6000',
    options: () => [
      { label: 'น้ำหนักจริง', patch: { pricing: { chargeable: { rule: 'actual' } } } },
      { label: 'ค่าที่มากกว่า (จริง vs ปริมาตร ÷5000)', patch: { pricing: { chargeable: { rule: 'greater', divisor: 5000 } } } },
      { label: 'ค่าที่มากกว่า (จริง vs ปริมาตร ÷6000)', patch: { pricing: { chargeable: { rule: 'greater', divisor: 6000 } } } },
      { label: 'น้ำหนักตามปริมาตรเท่านั้น (÷5000)', patch: { pricing: { chargeable: { rule: 'volumetric', divisor: 5000 } } } },
    ],
  },
  {
    key: 'pricing.surcharges',
    applies: (l) => !!l.pricing.model && l.pricing.model !== 'quote_on_request',
    filled: (l) => !!l.pricing.surchargesAsked && l.pricing.surcharges.every((s) => s.value != null),
    ask: (l) =>
      l.pricing.surcharges.some((s) => s.value == null)
        ? 'ค่าธรรมเนียมเพิ่มเติมที่เลือกไว้ ยังไม่มีตัวเลขครับ ช่วยบอกตัวเลขหน่อย เช่น "ค่าน้ำมัน 8%" หรือ "พื้นที่ห่างไกล 30 บาท"'
        : 'มีค่าธรรมเนียมเพิ่มเติมนอกเหนือจากค่าขนส่งไหมครับ? เลือกได้หลายอย่าง',
    why: 'ส่วนเพิ่มอย่างค่าน้ำมัน พื้นที่ห่างไกล COD ฯลฯ ต้องระบุล่วงหน้าเพื่อไม่ให้เกิดข้อพิพาทเรื่องราคาภายหลัง',
    multi: true,
    options: () => [
      ...(['fuel', 'remote_area', 'cod', 'oversize', 'peak_season', 'dangerous_goods', 'insurance', 'waiting', 'tollway', 'handling'] as const).map((t) => ({
        label: SURCHARGE_LABEL[t],
        patch: { pricing: { surcharges: [{ id: `s_${t}`, type: t, mode: t === 'fuel' || t === 'peak_season' || t === 'cod' ? ('percent' as const) : ('fixed' as const) }] } },
      })),
      { label: 'ไม่มีค่าธรรมเนียมเพิ่มเติม', patch: { pricing: { surchargesAsked: true } } },
    ],
  },
  {
    key: 'pricing.customsFees',
    applies: hasCustoms,
    filled: (l) => !!l.pricing.customsFees && Object.values(l.pricing.customsFees).some((v) => v != null),
    ask: () => 'ค่าดำเนินพิธีการศุลกากรคิดอย่างไรครับ? เช่น ต่อใบขน 1,500 บาท, ต่อรายการสินค้า (HS line) 200 บาท, หรือ % ของมูลค่า CIF, และค่าบริการเมื่อออกเงินทดรอง (%)',
    why: 'ค่าพิธีการเป็นรายได้คนละส่วนกับค่าขนส่ง และมักคิดตามจำนวนใบขนหรือรายการสินค้า',
    free: true,
  },
  {
    key: 'pricing.scope',
    applies: (l) => !!l.pricing.model && l.pricing.model !== 'quote_on_request',
    filled: (l) => !!l.pricing.included || !!l.pricing.excluded,
    ask: () => 'ราคานี้ "รวม" อะไรบ้าง และ "ไม่รวม" อะไรบ้างครับ? เช่น รวมค่าขึ้น-ลงสินค้า ไม่รวมค่าทางด่วนและภาษี',
    why: 'ขอบเขตของราคาคือข้อความสำคัญที่สุดเมื่อมีข้อโต้แย้งทางพาณิชย์',
    free: true,
  },
  {
    key: 'pricing.validity',
    applies: (l) => !!l.pricing.model,
    filled: (l) => !!l.pricing.validTo || l.pricing.model === 'quote_on_request',
    ask: () => 'ราคานี้ใช้ได้ถึงวันที่เท่าไร และให้เครดิตเทอมลูกค้ากี่วันครับ? เช่น "ใช้ได้ถึง 31 ธ.ค. 2569 เครดิต 30 วัน"',
    why: 'ราคาต้องมีวันหมดอายุ เพื่อทบทวนตามต้นทุนน้ำมันและตลาด',
    free: true,
  },
  {
    key: 'pricing.confirm',
    applies: (l) => !!l.pricing.model,
    filled: (l) => !!l.pricing.confirmed,
    ask: () => 'ตรวจโครงสร้างราคาในตารางด้านล่าง ลองจำลองการคำนวณราคา แล้วกด "ยืนยันโครงสร้างราคา" ได้เลยครับ',
    why: 'ต้องยืนยันเองก่อนส่งให้ทีมพาณิชย์ของ Bird ตรวจ',
    free: true,
  },
]

export interface Pending extends Requirement {
  builder: boolean
}

const BUILDER_KEYS = new Set(['pricing.values', 'pricing.surcharges', 'pricing.customsFees', 'pricing.confirm', 'pricing.minCharge', 'pricing.validity', 'pricing.scope'])

export function remaining(line: ServiceLine): Pending[] {
  return RULES.filter((r) => r.applies(line) && !r.filled(line)).map((r) => ({
    key: r.key,
    ask: r.ask(line),
    why: r.why,
    options: r.options?.(line),
    multi: r.multi,
    free: r.free,
    builder: BUILDER_KEYS.has(r.key),
  }))
}

export const nextRequirement = (line: ServiceLine) => remaining(line)[0]
export const totalApplicable = (line: ServiceLine) => RULES.filter((r) => r.applies(line)).length
export const lineProgress = (line: ServiceLine) => {
  const t = totalApplicable(line)
  return t ? Math.round(((t - remaining(line).length) / t) * 100) : 0
}
export const isLineComplete = (line: ServiceLine) => remaining(line).length === 0

/** Merge a patch coming from a chip, the offline analyst, or the live model into a line (immutably). */
export function applyPatch(line: ServiceLine, patch: LinePatch): ServiceLine {
  const next: ServiceLine = structuredClone(line)
  const { pricing, customs, serviceLevels, cargoTypes, ...rest } = patch
  Object.entries(rest).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') (next as unknown as Record<string, unknown>)[k] = v
  })
  if (serviceLevels?.length) next.serviceLevels = Array.from(new Set([...(next.serviceLevels ?? []), ...serviceLevels]))
  if (cargoTypes?.length) next.cargoTypes = Array.from(new Set([...(next.cargoTypes ?? []), ...cargoTypes]))
  if (customs) next.customs = { ...(next.customs ?? {}), ...customs }
  if (pricing) {
    const p = next.pricing
    const { surcharges, tiers, lanes, customsFees, chargeable, ...pr } = pricing
    Object.entries(pr).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') (p as unknown as Record<string, unknown>)[k] = v
    })
    if (tiers?.length) p.tiers = tiers
    if (lanes?.length) p.lanes = lanes
    if (chargeable) p.chargeable = { ...(p.chargeable ?? { rule: 'actual' }), ...chargeable }
    if (customsFees) p.customsFees = { ...(p.customsFees ?? {}), ...customsFees }
    if (surcharges?.length) {
      for (const s of surcharges) {
        const i = p.surcharges.findIndex((x) => x.type === s.type)
        if (i >= 0) p.surcharges[i] = { ...p.surcharges[i], ...s }
        else p.surcharges.push(s)
      }
    }
    // changing basis/model invalidates a previous confirmation
    if (pricing.basis || pricing.model || tiers || lanes || pricing.rate !== undefined) p.confirmed = pricing.confirmed ?? false
  }
  // implied facts
  if (next.dangerousGoods === true && !next.cargoTypes?.some((c) => DG_RE.test(c))) next.cargoTypes = [...(next.cargoTypes ?? []), DG_LABEL]
  if (next.dangerousGoods === false && next.cargoTypes) next.cargoTypes = next.cargoTypes.filter((c) => !DG_RE.test(c))
  if (next.category && INTERNATIONAL_BY_NATURE.includes(next.category) && !next.scope) next.scope = 'international'
  if (next.scope === 'domestic') {
    delete next.direction
    delete next.customs
  }
  if (next.category === 'customs_broker' && next.serviceMode && !next.direction)
    next.direction = /ทั้ง/.test(next.serviceMode) ? 'both' : /ขาออก/.test(next.serviceMode) ? 'export' : 'import'
  return next
}

export const lineTitle = (l: ServiceLine) =>
  l.category ? CATEGORY_LABEL[l.category] + (l.scope === 'international' ? ' (ระหว่างประเทศ)' : l.scope === 'domestic' ? ' (ในประเทศ)' : '') : 'บริการใหม่'
