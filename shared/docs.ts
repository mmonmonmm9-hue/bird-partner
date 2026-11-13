import type { ApplicantType, Profile, ServiceLine } from './types'

export interface DocTemplate {
  key: string
  label: string
  hint: string
  required: boolean
  reason?: string
}

const T = (key: string, label: string, hint: string, required = true, reason?: string): DocTemplate => ({ key, label, hint, required, reason })

/** Dynamic KYC/KYB checklist: depends on applicant type, VAT status and the services offered. */
export function docTemplates(type: ApplicantType, profile: Profile, lines: ServiceLine[]): DocTemplate[] {
  const out: DocTemplate[] =
    type === 'individual'
      ? [
          T('id_front', 'บัตรประชาชน (ด้านหน้า)', 'เห็นข้อมูลครบทั้งใบ ไม่สะท้อนแสง (ส่งในแชตได้)'),
          T('id_selfie', 'รูปถ่ายคู่บัตรประชาชน', 'ถือบัตรข้างใบหน้า เห็นหน้าและบัตรชัดเจน'),
          T('bank_book', 'หน้าสมุดบัญชีธนาคาร', 'ชื่อบัญชีต้องตรงกับชื่อผู้สมัคร'),
        ]
      : [
          T('company_cert', 'หนังสือรับรองบริษัท', 'ออกโดยกรมพัฒนาธุรกิจการค้า อายุไม่เกิน 6 เดือน'),
          T('shareholders', 'บัญชีรายชื่อผู้ถือหุ้น (บอจ.5)', 'ใช้ระบุเจ้าของผู้รับผลประโยชน์ (UBO)'),
          T('director_id', 'บัตรประชาชนกรรมการผู้มีอำนาจลงนาม', 'พร้อมลงนามรับรองสำเนาถูกต้อง'),
          T('poa', 'หนังสือมอบอำนาจ', 'แนบเมื่อผู้ติดต่อไม่ใช่กรรมการผู้มีอำนาจ', !!profile.contactName && !!profile.directorName && !sameName(profile.contactName, profile.directorName), 'ผู้ติดต่อไม่ใช่กรรมการ'),
          T('vat_cert', 'ใบทะเบียนภาษีมูลค่าเพิ่ม (ภ.พ.20)', 'แนบเมื่อจดทะเบียน VAT', profile.vatRegistered === true, profile.vatRegistered ? 'บริษัทจด VAT' : undefined),
          T('bank_book', 'หน้าสมุดบัญชีธนาคารของบริษัท', 'ชื่อบัญชีต้องตรงกับชื่อบริษัท'),
        ]

  const cats = new Set(lines.map((l) => l.category))
  const selfCustoms = lines.some((l) => l.customs?.handling === 'self_licensed')
  if (cats.has('customs_broker') || selfCustoms) out.push(T('customs_license', 'ใบอนุญาตตัวแทนออกของ (ศุลกากร)', 'ที่ยังไม่หมดอายุ', true, 'เพราะคุณทำพิธีการศุลกากรเอง'))
  if (cats.has('air_freight') || cats.has('freight_forwarder')) out.push(T('airline_auth', 'หนังสือแต่งตั้ง CSA/GSA หรือหลักฐานตัวแทนสายการบิน/IATA', 'ถ้าให้บริการขนส่งทางอากาศผ่านสายการบิน', false, 'เพราะให้บริการขนส่งทางอากาศ'))
  // an individual partner is the driver: show the licence from the start (before any service is chosen) unless every chosen service is not a driving one
  const nonDriving = new Set(['warehouse', 'customs_broker', 'freight_forwarder', 'air_freight', 'sea_freight'])
  const drives = type === 'individual' ? lines.length === 0 || lines.some((l) => !l.category || !nonDriving.has(l.category)) : cats.has('road_freight') || cats.has('cross_border_road') || cats.has('last_mile') || cats.has('courier_parcel')
  if (drives)
    out.push(T('driver_license', type === 'individual' ? 'ใบขับขี่' : 'ใบขับขี่ของพนักงานขับรถ (ตัวอย่าง)', type === 'individual' ? 'ใบขับขี่ที่ยังไม่หมดอายุ ตรงกับประเภทรถที่ใช้ให้บริการ' : 'ของพนักงานขับรถหลัก 1–2 คน ถ้ามีหลายคนแนบเพิ่มได้ภายหลัง', type === 'individual', type === 'individual' ? 'เพราะคุณขับรถให้บริการเอง' : undefined))
  if (cats.has('road_freight') || cats.has('cross_border_road') || cats.has('last_mile'))
    out.push(T('vehicle_docs', 'เล่มทะเบียนรถและประกันภัยของยานพาหนะที่ใช้ให้บริการ', 'รวมไฟล์เดียวได้ (ทุกคัน)', true, 'เพราะให้บริการขนส่งทางถนน'))
  if (cats.has('cross_border_road')) out.push(T('border_permit', 'ใบอนุญาตขนส่งข้ามแดน', 'ตามเส้นทางประเทศที่ให้บริการ', true, 'เพราะให้บริการข้ามแดน'))
  if (cats.has('road_freight') && type === 'business') out.push(T('transport_permit', 'ใบอนุญาตประกอบการขนส่ง', 'สำหรับบริษัทที่ขนส่งสินค้าเชิงพาณิชย์', true, 'เพราะเป็นบริษัทขนส่งสินค้า'))
  if (cats.has('warehouse')) out.push(T('warehouse_proof', 'เอกสารสิทธิ์/สัญญาเช่าคลัง', 'ระบุที่ตั้งและพื้นที่คลัง', true, 'เพราะให้บริการคลังสินค้า'))
  if (lines.some((l) => l.dangerousGoods === true || l.cargoTypes?.some((c) => /DG|วัตถุอันตราย/.test(c)))) out.push(T('dg_permit', 'ใบอนุญาตขนส่งวัตถุอันตราย', 'จำเป็นเมื่อรับวัตถุอันตราย', true, 'เพราะรับวัตถุอันตราย'))
  if (lines.some((l) => l.cargoTypes?.some((c) => /Cold/i.test(c)))) out.push(T('cold_chain', 'หลักฐานระบบควบคุมอุณหภูมิ (Cold chain)', 'เช่น ใบรับรองรถ/คลังควบคุมอุณหภูมิ', false, 'เพราะรับสินค้าควบคุมอุณหภูมิ'))
  return out
}

function sameName(a: string, b: string) {
  const n = (s: string) => s.replace(/^(นาย|นางสาว|นาง|คุณ)/, '').replace(/\s+/g, '')
  return n(a) === n(b)
}

export const DOC_KEYS_ALLOWED = new Set([
  'id_front', 'id_selfie', 'driver_license', 'bank_book', 'company_cert', 'shareholders', 'director_id', 'poa', 'vat_cert', 'customs_license', 'airline_auth',
  'vehicle_docs', 'border_permit', 'transport_permit', 'warehouse_proof', 'dg_permit', 'cold_chain',
])
