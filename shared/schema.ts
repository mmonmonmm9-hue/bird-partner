import type { Category, SurchargeType, UnitBasis, PricingModel, ServiceLine, PricingStructure } from './types'
import { uid } from './util'

export const CATEGORY_LABEL: Record<Category, string> = {
  road_freight: 'ขนส่งทางถนนในประเทศ',
  courier_parcel: 'พัสดุ / Courier',
  last_mile: 'ส่งด่วนในเมือง / Last-mile',
  air_freight: 'ขนส่งทางอากาศ (Air freight)',
  sea_freight: 'ขนส่งทางทะเล (Sea freight)',
  cross_border_road: 'ขนส่งข้ามแดนทางถนน',
  warehouse: 'คลังสินค้า / Fulfillment',
  customs_broker: 'ชิปปิ้ง / พิธีการศุลกากร',
  freight_forwarder: 'Freight Forwarder',
  other: 'บริการอื่น ๆ',
}

export const CATEGORY_EN: Record<Category, string> = {
  road_freight: 'Road Freight', courier_parcel: 'Courier / Parcel', last_mile: 'Last-mile Delivery',
  air_freight: 'Air Freight', sea_freight: 'Sea Freight', cross_border_road: 'Cross-border Road',
  warehouse: 'Warehouse / Fulfillment', customs_broker: 'Customs Brokerage', freight_forwarder: 'Freight Forwarder', other: 'Other',
}

export const BASIS_LABEL: Record<UnitBasis, string> = {
  per_kg: 'ต่อกิโลกรัม', per_piece: 'ต่อชิ้น/พัสดุ', per_box: 'ต่อกล่อง', per_pallet: 'ต่อพาเลท', per_cbm: 'ต่อ CBM (ลูกบาศก์เมตร)',
  per_ton: 'ต่อตัน', per_trip: 'ต่อเที่ยว', per_km: 'ต่อกิโลเมตร', per_container: 'ต่อตู้คอนเทนเนอร์',
  per_shipment: 'ต่อใบงาน/ต่อเที่ยวส่ง (Shipment)', per_awb: 'ต่อ AWB/BL', per_hour: 'ต่อชั่วโมง', per_day: 'ต่อวัน', per_month: 'ต่อเดือน',
}

export const BASIS_SHORT: Record<UnitBasis, string> = {
  per_kg: 'กก.', per_piece: 'ชิ้น', per_box: 'กล่อง', per_pallet: 'พาเลท', per_cbm: 'CBM', per_ton: 'ตัน', per_trip: 'เที่ยว',
  per_km: 'กม.', per_container: 'ตู้', per_shipment: 'shipment', per_awb: 'AWB/BL', per_hour: 'ชม.', per_day: 'วัน', per_month: 'เดือน',
}

export const BASIS_EN: Record<UnitBasis, string> = {
  per_kg: 'kg', per_piece: 'piece', per_box: 'box', per_pallet: 'pallet', per_cbm: 'CBM', per_ton: 'ton', per_trip: 'trip',
  per_km: 'km', per_container: 'container', per_shipment: 'shipment', per_awb: 'AWB/BL', per_hour: 'hour', per_day: 'day', per_month: 'month',
}

export const MODEL_LABEL: Record<PricingModel, string> = {
  flat: 'ราคาเดียว (Flat rate)',
  tiered: 'ตามช่วงน้ำหนัก/จำนวน (Tiered / Weight-break)',
  lane_table: 'ตามเส้นทาง (Lane table)',
  quote_on_request: 'เสนอราคาเป็นรายงาน (Quote on request)',
}

export const SURCHARGE_LABEL: Record<SurchargeType, string> = {
  fuel: 'ค่าน้ำมัน (Fuel surcharge)', remote_area: 'พื้นที่ห่างไกล', cod: 'เก็บเงินปลายทาง (COD)', oversize: 'สินค้าขนาดใหญ่เกินมาตรฐาน',
  peak_season: 'ช่วงเทศกาล/Peak season', dangerous_goods: 'วัตถุอันตราย (DG)', insurance: 'ค่าประกันสินค้า', waiting: 'ค่ารอ/ค่าล่วงเวลา',
  tollway: 'ค่าทางด่วน', handling: 'ค่าจัดการ/ยกของ', documentation: 'ค่าเอกสาร', other: 'อื่น ๆ',
}

export const CARGO_TYPES = ['สินค้าทั่วไป', 'แตกหักง่าย', 'ควบคุมอุณหภูมิ (Cold chain)', 'วัตถุอันตราย (DG)', 'สินค้าขนาดใหญ่/น้ำหนักมาก', 'ของมีค่า']

export const CUSTOMS_CLEARANCE_LABEL = {
  none: 'ไม่ทำพิธีการศุลกากร (ลูกค้าจัดการเอง)',
  origin: 'ทำพิธีการเฉพาะต้นทาง (ส่งออก)',
  destination: 'ทำพิธีการเฉพาะปลายทาง (นำเข้า)',
  both: 'ทำพิธีการทั้งต้นทางและปลายทาง',
} as const

export const DIRECTION_LABEL = { export: 'ส่งออก', import: 'นำเข้า', both: 'ทั้งนำเข้าและส่งออก' } as const

export const newPricing = (): PricingStructure => ({ currency: 'THB', tiers: [], lanes: [], surcharges: [] })
export const newLine = (): ServiceLine => ({ id: uid('sl'), pricing: newPricing() })

export const INTERNATIONAL_BY_NATURE: Category[] = ['sea_freight', 'cross_border_road', 'customs_broker', 'freight_forwarder']

/** Pricing bases that are typical per category (shown first; the partner can still choose any). */
export const TYPICAL_BASIS: Record<Category, UnitBasis[]> = {
  road_freight: ['per_trip', 'per_km', 'per_ton', 'per_pallet', 'per_kg'],
  courier_parcel: ['per_kg', 'per_piece', 'per_box', 'per_shipment'],
  last_mile: ['per_piece', 'per_shipment', 'per_km', 'per_kg'],
  air_freight: ['per_kg', 'per_awb', 'per_shipment', 'per_cbm'],
  sea_freight: ['per_container', 'per_cbm', 'per_ton', 'per_shipment'],
  cross_border_road: ['per_trip', 'per_kg', 'per_ton', 'per_pallet'],
  warehouse: ['per_pallet', 'per_cbm', 'per_piece', 'per_month'],
  customs_broker: ['per_shipment', 'per_awb', 'per_piece'],
  freight_forwarder: ['per_kg', 'per_cbm', 'per_container', 'per_shipment'],
  other: ['per_trip', 'per_kg', 'per_piece', 'per_hour'],
}

export const fmtMoney = (n: number | undefined, cur = 'THB') => (n == null ? '—' : `${n.toLocaleString('en-US')} ${cur}`)
