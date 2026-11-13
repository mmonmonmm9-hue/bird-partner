// ------------------------------------------------------------------ pricing
export type UnitBasis =
  | 'per_kg' | 'per_piece' | 'per_box' | 'per_pallet' | 'per_cbm' | 'per_ton' | 'per_trip'
  | 'per_km' | 'per_container' | 'per_shipment' | 'per_awb' | 'per_hour' | 'per_day' | 'per_month'

export type PricingModel = 'flat' | 'tiered' | 'lane_table' | 'quote_on_request'

export interface Tier {
  from: number
  to?: number
  rate: number
  /** per_unit: rate × quantity (weight-break pricing). flat: the rate is the whole price of the band. */
  mode: 'per_unit' | 'flat'
}

export interface LaneRate {
  origin: string
  destination: string
  rate: number
}

export type SurchargeType =
  | 'fuel' | 'remote_area' | 'cod' | 'oversize' | 'peak_season' | 'dangerous_goods'
  | 'insurance' | 'waiting' | 'tollway' | 'handling' | 'documentation' | 'other'

export interface Surcharge {
  id: string
  type: SurchargeType
  mode: 'fixed' | 'percent' | 'per_unit'
  value?: number
  note?: string
}

export interface CustomsFees {
  perDeclaration?: number
  perHsLine?: number
  percentOfCif?: number
  minFee?: number
  disbursementMarkupPct?: number
}

export interface PricingStructure {
  basis?: UnitBasis
  model?: PricingModel
  currency: string
  rate?: number
  baseFee?: number
  minCharge?: number
  minChargeAsked?: boolean
  tiers: Tier[]
  lanes: LaneRate[]
  chargeable?: { rule: 'actual' | 'volumetric' | 'greater'; divisor?: number }
  surcharges: Surcharge[]
  surchargesAsked?: boolean
  customsFees?: CustomsFees
  included?: string
  excluded?: string
  validTo?: string
  paymentTermsDays?: number
  confirmed?: boolean
}

// ------------------------------------------------------------------ service line
export type Category =
  | 'road_freight' | 'courier_parcel' | 'last_mile' | 'air_freight' | 'sea_freight'
  | 'cross_border_road' | 'warehouse' | 'customs_broker' | 'freight_forwarder' | 'other'

export type Direction = 'export' | 'import' | 'both'

export interface CustomsProfile {
  clearance?: 'none' | 'origin' | 'destination' | 'both'
  handling?: 'self_licensed' | 'partner_broker'
  dutyTax?: 'customer_direct' | 'advance_and_rebill'
}

export interface ServiceLine {
  id: string
  category?: Category
  scope?: 'domestic' | 'international'
  direction?: Direction
  serviceMode?: string
  serviceLevels?: string[]
  coverage?: string
  equipment?: string
  cargoTypes?: string[]
  /** explicit answer to "do you carry dangerous goods?" (undefined = not asked yet) */
  dangerousGoods?: boolean
  transit?: string
  capacity?: string
  customs?: CustomsProfile
  pricing: PricingStructure
  notes?: string
}

export interface Requirement {
  key: string
  ask: string
  why: string
  options?: { label: string; patch: LinePatch }[]
  multi?: boolean
  free?: boolean
}

export type LinePatch = Partial<Omit<ServiceLine, 'id' | 'pricing' | 'customs'>> & {
  customs?: CustomsProfile
  pricing?: Partial<PricingStructure>
}

// ------------------------------------------------------------------ applicant profile
export type ApplicantType = 'individual' | 'business'

export interface Profile {
  // individual
  fullName?: string
  phone?: string
  birthDate?: string
  address?: string
  province?: string
  postalCode?: string
  nameOnCardConfirmed?: boolean
  // business
  companyNameTh?: string
  companyNameEn?: string
  contactName?: string
  contactPhone?: string
  registeredAddress?: string
  directorName?: string
  uboName?: string
  uboPercent?: number
  vatRegistered?: boolean
  // both
  bankName?: string
  bankAccountNo?: string
  bankAccountName?: string
}

export type ProfilePatch = Partial<Profile>

export type AppStatus = 'draft' | 'submitted' | 'needs_info' | 'approved' | 'rejected'

// ------------------------------------------------------------------ AI
export interface AiTurnResult {
  reply: string
  /** shown in the dashed "ตอบแบบนี้ได้เลย" box */
  formatHint?: string
  why?: string
  patch: LinePatch
  profilePatch: ProfilePatch
  newLine: boolean
  finished: boolean
  showPricing: boolean
  requestIdPhoto: boolean
  mode: 'live' | 'offline'
  note?: string
}

// ------------------------------------------------------------------ API DTOs
export interface DocSlotDto {
  key: string
  label: string
  hint: string
  required: boolean
  reason?: string
  files: { id: string; name: string; size: number; source: 'chat' | 'docs' }[]
}

export interface ChatMessageDto {
  id: string
  role: 'user' | 'assistant' | 'system'
  text: string
  formatHint?: string
  why?: string
  note?: string
  captured?: string
  attachment?: { id: string; name: string; size: number; mime: string }
  showPricingLineId?: string
  mode?: 'live' | 'offline'
  at: string
}

export interface AppDto {
  id: string
  type: ApplicantType
  status: AppStatus
  ref?: string
  email: string
  idMasked: string
  profile: Profile
  lines: ServiceLine[]
  activeLineId?: string
  docs: DocSlotDto[]
  profileRemaining: string[]
  submittedAt?: string
  reviewNote?: string
  progress: { profile: number; services: number; docs: number }
  ai: { configured: boolean; model: string }
}
