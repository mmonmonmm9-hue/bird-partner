import { motion } from 'framer-motion'
import { BadgeCheck, Calculator, Check, PencilLine } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { ServiceLine } from '@shared/types'
import { BASIS_LABEL, BASIS_SHORT, CATEGORY_LABEL, CUSTOMS_CLEARANCE_LABEL, MODEL_LABEL, SURCHARGE_LABEL, fmtMoney } from '@shared/schema'
import { simulateQuote, type QuoteInput } from '@shared/pricing'
import { cn, Spinner } from './ui'

const CUSTOMS_HANDLING = { self_licensed: 'ทำพิธีการเอง (มีใบอนุญาต)', partner_broker: 'ใช้พันธมิตรตัวแทนออกของ' } as const
const CUSTOMS_DUTY = { customer_direct: 'ลูกค้าจ่ายอากรเอง', advance_and_rebill: 'ออกเงินทดรองจ่ายแล้วเรียกเก็บคืน' } as const

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[112px_1fr] gap-3 border-b border-[rgba(17,80,173,0.08)] py-2 last:border-0 sm:grid-cols-[150px_1fr]">
      <dt className="text-[13px] text-faint">{k}</dt>
      <dd className="m-0 text-[14px] font-medium text-navy">{children}</dd>
    </div>
  )
}

/** Read-only summary of the pricing structure the partner described. Corrections happen by typing in the chat. */
export function PricingCard({ line, editable, busy, onConfirm, onRevise }: { line: ServiceLine; editable: boolean; busy: boolean; onConfirm: () => void; onRevise: () => void }) {
  const p = line.pricing
  const [q, setQ] = useState<{ qty: string; kg: string; l: string; w: string; h: string; pcs: string; lane: string }>({ qty: '1', kg: '', l: '', w: '', h: '', pcs: '1', lane: '' })
  const input: QuoteInput = {
    quantity: Number(q.qty) || 0, actualKg: Number(q.kg) || undefined, lengthCm: Number(q.l) || undefined, widthCm: Number(q.w) || undefined,
    heightCm: Number(q.h) || undefined, pieces: Number(q.pcs) || 1, lane: q.lane || (p.lanes[0] ? `${p.lanes[0].origin}→${p.lanes[0].destination}` : undefined),
  }
  const quote = useMemo(() => simulateQuote(p, input), [p, q]) // eslint-disable-line react-hooks/exhaustive-deps
  const kg = p.basis === 'per_kg'
  const cust = line.customs
  const set = (k: keyof typeof q) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setQ((s) => ({ ...s, [k]: e.target.value }))

  return (
    <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }} className="glass flex w-full flex-col gap-3 rounded-3xl p-4" aria-label="สรุปโครงสร้างราคา">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[15px] font-bold text-navy">สรุปโครงสร้างราคา</span>
        <span className="chip">{line.category ? CATEGORY_LABEL[line.category] : 'บริการ'}{line.scope === 'international' ? ' · ระหว่างประเทศ' : line.scope === 'domestic' ? ' · ในประเทศ' : ''}</span>
        {p.confirmed && <span className="chip !bg-[rgba(11,122,75,0.1)] !text-ok"><BadgeCheck size={14} /> ยืนยันแล้ว</span>}
      </div>

      <dl className="m-0">
        {p.basis && <Row k="หน่วยคิดราคา">{BASIS_LABEL[p.basis]}</Row>}
        {p.model && <Row k="รูปแบบราคา">{MODEL_LABEL[p.model]}</Row>}
        {p.model === 'flat' && <Row k="ราคา">{fmtMoney(p.rate, p.currency)} {p.basis ? BASIS_LABEL[p.basis] : ''}</Row>}
        {p.model === 'tiered' && p.tiers.length > 0 && (
          <Row k="ช่วงราคา">
            <table className="w-full border-collapse text-[13.5px]"><tbody>
              {[...p.tiers].sort((a, b) => a.from - b.from).map((t, i) => (
                <tr key={i}><td className="py-0.5 pr-3 text-muted">{t.from}–{t.to ?? '∞'} {p.basis ? BASIS_SHORT[p.basis] : ''}</td><td className="py-0.5">{fmtMoney(t.rate, p.currency)}{t.mode === 'per_unit' ? ` /${p.basis ? BASIS_SHORT[p.basis] : 'หน่วย'}` : ' (เหมาช่วง)'}</td></tr>
              ))}
            </tbody></table>
          </Row>
        )}
        {p.model === 'lane_table' && p.lanes.length > 0 && (
          <Row k="ราคาตามเส้นทาง">
            <table className="w-full border-collapse text-[13.5px]"><tbody>
              {p.lanes.map((l, i) => <tr key={i}><td className="py-0.5 pr-3 text-muted">{l.origin} → {l.destination}</td><td className="py-0.5">{fmtMoney(l.rate, p.currency)}</td></tr>)}
            </tbody></table>
          </Row>
        )}
        {p.baseFee != null && <Row k="ค่าเปิดบริการ">{fmtMoney(p.baseFee, p.currency)}</Row>}
        {p.minCharge != null && <Row k="ค่าบริการขั้นต่ำ">{fmtMoney(p.minCharge, p.currency)}</Row>}
        {p.chargeable && kg && <Row k="น้ำหนักที่ใช้คิด">{p.chargeable.rule === 'actual' ? 'น้ำหนักจริง' : p.chargeable.rule === 'volumetric' ? `น้ำหนักตามปริมาตร (ตัวหาร ${p.chargeable.divisor})` : `ค่าที่มากกว่าระหว่างน้ำหนักจริงและตามปริมาตร (ตัวหาร ${p.chargeable.divisor})`}</Row>}
        {p.surcharges.length > 0 && (
          <Row k="ส่วนเพิ่ม">
            <ul className="m-0 list-none p-0">{p.surcharges.map((s) => <li key={s.id} className="py-0.5">{SURCHARGE_LABEL[s.type]}: {s.value == null ? '—' : s.mode === 'percent' ? `${s.value}%` : s.mode === 'per_unit' ? `${s.value} ${p.currency}/${p.basis ? BASIS_SHORT[p.basis] : 'หน่วย'}` : fmtMoney(s.value, p.currency)}{s.note ? ` (${s.note})` : ''}</li>)}</ul>
          </Row>
        )}
        {p.surchargesAsked && !p.surcharges.length && <Row k="ส่วนเพิ่ม">ไม่มีค่าธรรมเนียมเพิ่มเติม</Row>}
        {cust?.clearance && <Row k="พิธีการศุลกากร">{CUSTOMS_CLEARANCE_LABEL[cust.clearance]}{cust.handling ? ` · ${CUSTOMS_HANDLING[cust.handling]}` : ''}{cust.dutyTax ? ` · ${CUSTOMS_DUTY[cust.dutyTax]}` : ''}</Row>}
        {p.customsFees && Object.keys(p.customsFees).length > 0 && (
          <Row k="ค่าดำเนินพิธีการ">{[p.customsFees.perDeclaration != null && `ต่อใบขน ${fmtMoney(p.customsFees.perDeclaration, p.currency)}`, p.customsFees.perHsLine != null && `ต่อรายการ HS ${fmtMoney(p.customsFees.perHsLine, p.currency)}`, p.customsFees.percentOfCif != null && `${p.customsFees.percentOfCif}% ของ CIF`, p.customsFees.minFee != null && `ขั้นต่ำ ${fmtMoney(p.customsFees.minFee, p.currency)}`, p.customsFees.disbursementMarkupPct != null && `ค่าบริการทดรองจ่าย ${p.customsFees.disbursementMarkupPct}%`].filter(Boolean).join(' · ')}</Row>
        )}
        {p.included && <Row k="ราคานี้รวม">{p.included}</Row>}
        {p.excluded && <Row k="ราคานี้ไม่รวม">{p.excluded}</Row>}
        {p.validTo && <Row k="ใช้ได้ถึง">{p.validTo}</Row>}
        {p.paymentTermsDays != null && <Row k="เครดิตเทอม">{p.paymentTermsDays} วัน</Row>}
      </dl>

      <details className="rounded-2xl border border-[rgba(11,111,142,0.25)] bg-[rgba(11,111,142,0.05)] px-3.5 py-2.5">
        <summary className="flex cursor-pointer list-none items-center gap-2 text-[13.5px] font-semibold text-teal"><Calculator size={16} /> ลองจำลองการคำนวณราคา</summary>
        <div className="mt-3 flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-2.5">
            {kg ? (
              <>
                <Num label="น้ำหนักต่อชิ้น (กก.)" v={q.kg} on={set('kg')} />
                <Num label="จำนวนชิ้น" v={q.pcs} on={set('pcs')} />
                {p.chargeable?.divisor ? (<><Num label="ยาว (ซม.)" v={q.l} on={set('l')} /><Num label="กว้าง (ซม.)" v={q.w} on={set('w')} /><Num label="สูง (ซม.)" v={q.h} on={set('h')} /></>) : null}
              </>
            ) : (
              <Num label={`จำนวน (${p.basis ? BASIS_SHORT[p.basis] : 'หน่วย'})`} v={q.qty} on={set('qty')} />
            )}
            {p.model === 'lane_table' && p.lanes.length > 1 && (
              <label className="col-span-2 flex flex-col gap-1 text-[12.5px] text-faint">เส้นทาง
                <select className="field !min-h-[40px] !text-[14px]" value={q.lane} onChange={set('lane')}>{p.lanes.map((l) => <option key={`${l.origin}${l.destination}`} value={`${l.origin}→${l.destination}`}>{l.origin} → {l.destination}</option>)}</select>
              </label>
            )}
          </div>
          {quote.ok ? (
            <div className="flex flex-col gap-1 rounded-xl bg-white/80 p-3 text-[13.5px]">
              {quote.lines.map((l, i) => <div key={i} className="flex justify-between gap-3"><span className="text-muted">{l.label}</span><span className="flex-none font-medium">{l.amount.toLocaleString('en-US')}</span></div>)}
              <div className="mt-1 flex justify-between border-t border-[rgba(17,80,173,0.12)] pt-2 text-[15px] font-bold text-navy"><span>รวมโดยประมาณ</span><span>{fmtMoney(quote.total, p.currency)}</span></div>
            </div>
          ) : <p className="m-0 text-[13px] text-faint">{quote.error}</p>}
        </div>
      </details>

      {!p.confirmed && editable ? (
        <div className="flex flex-col gap-2 sm:flex-row">
          <button disabled={busy} onClick={onConfirm} className="btn btn-primary flex-1">{busy ? <Spinner className="h-5 w-5" /> : <Check size={18} />} ถูกต้อง ยืนยัน</button>
          <button disabled={busy} onClick={onRevise} className={cn('btn btn-ghost flex-1')}><PencilLine size={17} /> ขอแก้ไข</button>
        </div>
      ) : null}
      <p className="m-0 text-[12.5px] leading-relaxed text-faint">ราคานี้เป็นราคาที่คุณเสนอ (Partner Buy Rate) ต้องผ่านการอนุมัติเชิงพาณิชย์ของ Bird ก่อนใช้งานจริง · ถ้าต้องการแก้ ให้พิมพ์บอกในแชตได้เลย</p>
    </motion.section>
  )
}

function Num({ label, v, on }: { label: string; v: string; on: (e: React.ChangeEvent<HTMLInputElement>) => void }) {
  return (
    <label className="flex flex-col gap-1 text-[12.5px] text-faint">{label}
      <input className="field !min-h-[40px] !text-[14px]" inputMode="decimal" value={v} onChange={on} />
    </label>
  )
}
