import type { Category, CustomsFees, Direction, LaneRate, LinePatch, PricingModel, SurchargeType, Tier, UnitBasis } from './types'

/**
 * Model output is untrusted data. Only known keys with valid types/enums survive; everything else is dropped.
 * (The same function protects against typos from the offline analyst's own extraction.)
 */

const CATS: Category[] = ['road_freight', 'courier_parcel', 'last_mile', 'air_freight', 'sea_freight', 'cross_border_road', 'warehouse', 'customs_broker', 'freight_forwarder', 'other']
const BASES: UnitBasis[] = ['per_kg', 'per_piece', 'per_box', 'per_pallet', 'per_cbm', 'per_ton', 'per_trip', 'per_km', 'per_container', 'per_shipment', 'per_awb', 'per_hour', 'per_day', 'per_month']
const MODELS: PricingModel[] = ['flat', 'tiered', 'lane_table', 'quote_on_request']
const SURCH: SurchargeType[] = ['fuel', 'remote_area', 'cod', 'oversize', 'peak_season', 'dangerous_goods', 'insurance', 'waiting', 'tollway', 'handling', 'documentation', 'other']

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)
const str = (v: unknown, max = 240) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined)
const numv = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v < 1e9 ? v : undefined)
const oneOf = <T extends string>(v: unknown, list: readonly T[]): T | undefined => (typeof v === 'string' && (list as readonly string[]).includes(v) ? (v as T) : undefined)
const strArr = (v: unknown) => (Array.isArray(v) ? v.map((x) => str(x, 80)).filter((x): x is string => !!x).slice(0, 12) : undefined)

export function sanitizePatch(raw: unknown): LinePatch {
  const o: Obj = isObj(raw) ? raw : {}
  const patch: LinePatch = {}
  const category = oneOf(o.category, CATS)
  if (category) patch.category = category
  const scope = oneOf(o.scope, ['domestic', 'international'] as const)
  if (scope) patch.scope = scope
  const direction = oneOf<Direction>(o.direction, ['export', 'import', 'both'])
  if (direction) patch.direction = direction
  for (const k of ['serviceMode', 'coverage', 'equipment', 'transit', 'capacity', 'notes'] as const) {
    const v = str(o[k], 200)
    if (v) patch[k] = v
  }
  if (typeof o.dangerousGoods === 'boolean') patch.dangerousGoods = o.dangerousGoods
  const levels = strArr(o.serviceLevels)
  if (levels?.length) patch.serviceLevels = levels
  const cargo = strArr(o.cargoTypes)
  if (cargo?.length) patch.cargoTypes = cargo

  if (isObj(o.customs)) {
    const c: NonNullable<LinePatch['customs']> = {}
    const cl = oneOf(o.customs.clearance, ['none', 'origin', 'destination', 'both'] as const)
    if (cl) c.clearance = cl
    const h = oneOf(o.customs.handling, ['self_licensed', 'partner_broker'] as const)
    if (h) c.handling = h
    const d = oneOf(o.customs.dutyTax, ['customer_direct', 'advance_and_rebill'] as const)
    if (d) c.dutyTax = d
    if (Object.keys(c).length) patch.customs = c
  }

  if (isObj(o.pricing)) {
    const p = o.pricing
    const out: NonNullable<LinePatch['pricing']> = {}
    const basis = oneOf(p.basis, BASES)
    if (basis) out.basis = basis
    const model = oneOf(p.model, MODELS)
    if (model) out.model = model
    const cur = str(p.currency, 4)
    if (cur) out.currency = cur.toUpperCase()
    for (const k of ['rate', 'baseFee', 'minCharge', 'paymentTermsDays'] as const) {
      const v = numv(p[k])
      if (v !== undefined) out[k] = v
    }
    if (p.minChargeAsked === true) out.minChargeAsked = true
    if (p.surchargesAsked === true) out.surchargesAsked = true
    for (const k of ['included', 'excluded', 'validTo'] as const) {
      const v = str(p[k], 300)
      if (v) out[k] = v
    }
    if (Array.isArray(p.tiers)) {
      const tiers: Tier[] = []
      for (const t of p.tiers.slice(0, 20)) {
        if (!isObj(t)) continue
        const from = numv(t.from)
        const rate = numv(t.rate)
        if (from === undefined || rate === undefined) continue
        const to = numv(t.to)
        tiers.push({ from, ...(to !== undefined ? { to } : {}), rate, mode: t.mode === 'per_unit' ? 'per_unit' : 'flat' })
      }
      if (tiers.length) out.tiers = tiers.sort((a, b) => a.from - b.from)
    }
    if (Array.isArray(p.lanes)) {
      const lanes: LaneRate[] = []
      for (const l of p.lanes.slice(0, 40)) {
        if (!isObj(l)) continue
        const origin = str(l.origin, 60)
        const destination = str(l.destination, 60)
        const rate = numv(l.rate)
        if (origin && destination && rate !== undefined) lanes.push({ origin, destination, rate })
      }
      if (lanes.length) out.lanes = lanes
    }
    if (isObj(p.chargeable)) {
      const rule = oneOf(p.chargeable.rule, ['actual', 'volumetric', 'greater'] as const)
      if (rule) out.chargeable = { rule, ...(numv(p.chargeable.divisor) ? { divisor: numv(p.chargeable.divisor) } : {}) }
    }
    if (Array.isArray(p.surcharges)) {
      const sc: NonNullable<NonNullable<LinePatch['pricing']>['surcharges']> = []
      for (const s of p.surcharges.slice(0, 12)) {
        if (!isObj(s)) continue
        const type = oneOf(s.type, SURCH)
        if (!type) continue
        const value = numv(s.value)
        sc.push({
          id: `s_${type}`,
          type,
          mode: oneOf(s.mode, ['fixed', 'percent', 'per_unit'] as const) ?? 'fixed',
          ...(value !== undefined ? { value } : {}),
          ...(str(s.note, 120) ? { note: str(s.note, 120) } : {}),
        })
      }
      if (sc.length) out.surcharges = sc
    }
    if (isObj(p.customsFees)) {
      const f: CustomsFees = {}
      for (const k of ['perDeclaration', 'perHsLine', 'percentOfCif', 'minFee', 'disbursementMarkupPct'] as const) {
        const v = numv(p.customsFees[k])
        if (v !== undefined) f[k] = v
      }
      if (Object.keys(f).length) out.customsFees = f
    }
    if (Object.keys(out).length) patch.pricing = out
  }
  return patch
}
