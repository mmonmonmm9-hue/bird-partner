import { AnimatePresence, motion } from 'framer-motion'
import { Camera, Check, ClipboardList, FileText, HelpCircle, Paperclip, SendHorizonal, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import type { AppDto, ChatMessageDto, Profile } from '@shared/types'
import { lineTitle } from '@shared/requirements'
import { pricingSummary } from '@shared/pricing'
import { api, ApiError, type AppState } from '../lib/api'
import { useApp } from '../lib/session'
import { PricingCard } from '../components/PricingCard'
import { ErrorLine, Notice, Orb, cn, fmtSize } from '../components/ui'

const PROFILE_LABELS: [keyof Profile, string][] = [
  ['fullName', 'ชื่อ-นามสกุล'], ['companyNameTh', 'ชื่อบริษัท'], ['phone', 'เบอร์โทร'], ['contactName', 'ผู้ติดต่อ'], ['contactPhone', 'เบอร์ผู้ติดต่อ'],
  ['birthDate', 'วันเกิด'], ['address', 'ที่อยู่'], ['registeredAddress', 'ที่อยู่จดทะเบียน'], ['province', 'จังหวัด'], ['postalCode', 'รหัสไปรษณีย์'],
  ['directorName', 'กรรมการ'], ['uboName', 'เจ้าของผู้รับผลประโยชน์'], ['uboPercent', 'สัดส่วนถือหุ้น (%)'], ['vatRegistered', 'จด VAT'],
  ['bankName', 'ธนาคาร'], ['bankAccountNo', 'เลขบัญชี'], ['bankAccountName', 'ชื่อบัญชี'],
]
const REMAINING_LABEL: Record<string, string> = {
  fullName: 'ชื่อ-นามสกุล', phone: 'เบอร์โทร', birthDate: 'วันเกิด', address: 'ที่อยู่', idPhoto: 'รูปบัตรประชาชน', nameOnCard: 'ยืนยันชื่อบนบัตร', bank: 'บัญชีธนาคาร',
  companyNameTh: 'ชื่อบริษัท', contact: 'ผู้ติดต่อ', registeredAddress: 'ที่อยู่จดทะเบียน', vat: 'สถานะ VAT', directorName: 'กรรมการ', ubo: 'เจ้าของผู้รับผลประโยชน์ (UBO)',
}

const fmtVal = (k: keyof Profile, v: unknown) => (k === 'vatRegistered' ? (v ? 'จด VAT' : 'ไม่จด VAT') : String(v))

export function Chat() {
  const { app, messages, apply } = useApp()
  const [text, setText] = useState('')
  const [pending, setPending] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string>()
  const [sheet, setSheet] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)
  const taRef = useRef<HTMLTextAreaElement>(null)
  const camRef = useRef<HTMLInputElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const editable = app.status === 'draft' || app.status === 'needs_info'

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages.length, pending, busy])

  useEffect(() => {
    const ta = taRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = `${Math.min(ta.scrollHeight, 140)}px`
  }, [text])

  const guard = async (fn: () => Promise<AppState>) => {
    setBusy(true)
    setErr(undefined)
    try {
      apply(await fn())
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'ส่งไม่สำเร็จ ลองใหม่อีกครั้ง')
      return false
    } finally {
      setBusy(false)
      setPending(null)
    }
    return true
  }

  const send = async () => {
    const t = text.trim()
    if (!t || busy || !editable) return
    setText('')
    setPending(t)
    const ok = await guard(() => api.post<AppState>('/app/chat', { text: t }))
    if (!ok) setText(t)
    taRef.current?.focus()
  }

  const attach = async (f?: File | null) => {
    if (!f || busy || !editable) return
    setPending(f.type.startsWith('image/') ? 'กำลังส่งรูป…' : 'กำลังส่งไฟล์…')
    await guard(() => api.upload<AppState>('/app/chat/file', f))
  }

  const pricing = (lineId: string, action: 'confirm' | 'revise') => void guard(() => api.post<AppState>(`/app/lines/${lineId}/pricing`, { action }))

  // the pricing table is interactive only on the newest message that shows it
  const lastPricingMsg = [...messages].reverse().find((m) => m.showPricingLineId)?.id

  return (
    <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,1fr)_340px]">
      <section className="flex min-h-0 flex-col">
        <div className="flex items-center gap-3 px-4 pb-2 pt-3 sm:px-6">
          <Orb size={54} />
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-[16px] font-bold text-navy">ผู้ช่วย Bird Partner</span>
            <span className="truncate text-[12.5px] text-teal">{app.ai.configured ? 'ถามทีละเรื่อง · จดข้อมูลให้อัตโนมัติ' : 'โหมดสำรอง: ตอบตามกฎ ไม่ใช่โมเดลภาษา (ยังไม่ได้ตั้งค่า AI)'}</span>
          </div>
          <button onClick={() => setSheet(true)} className="btn btn-ghost btn-sm lg:hidden"><ClipboardList size={16} /> ที่จดไว้</button>
        </div>

        <div className="scroll-thin flex-1 overflow-y-auto px-4 pb-3 sm:px-6" aria-live="polite">
          <div className="mx-auto flex max-w-[720px] flex-col gap-3.5 pt-2">
            {app.status === 'needs_info' && app.reviewNote && <Notice tone="info"><b>เจ้าหน้าที่ขอข้อมูลเพิ่มเติม:</b> {app.reviewNote}</Notice>}
            {messages.map((m) => (
              <Bubble key={m.id} m={m} app={app} interactive={m.id === lastPricingMsg && editable} busy={busy} onPricing={pricing} />
            ))}
            {pending && <Msg mine><span className="whitespace-pre-wrap">{pending}</span></Msg>}
            {busy && <Typing />}
            <div ref={endRef} />
          </div>
        </div>

        <div className="border-t border-[rgba(17,80,173,0.1)] bg-white/80 px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl sm:px-6">
          <div className="mx-auto flex max-w-[720px] flex-col gap-2">
            <ErrorLine>{err}</ErrorLine>
            {editable ? (
              <div className="flex items-end gap-2">
                <div className="glass flex flex-1 items-end gap-1 rounded-[22px] px-2 py-1.5">
                  <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { void attach(e.target.files?.[0]); e.target.value = '' }} />
                  <input ref={fileRef} type="file" accept="image/*,application/pdf" hidden onChange={(e) => { void attach(e.target.files?.[0]); e.target.value = '' }} />
                  <button type="button" onClick={() => camRef.current?.click()} aria-label="ถ่ายรูป" className="grid h-10 w-10 flex-none place-items-center rounded-full border-0 bg-transparent text-bird hover:bg-[rgba(77,141,255,0.1)]"><Camera size={21} /></button>
                  <button type="button" onClick={() => fileRef.current?.click()} aria-label="แนบไฟล์" className="grid h-10 w-10 flex-none place-items-center rounded-full border-0 bg-transparent text-bird hover:bg-[rgba(77,141,255,0.1)]"><Paperclip size={21} /></button>
                  <textarea
                    ref={taRef}
                    rows={1}
                    aria-label="พิมพ์ข้อความ"
                    placeholder="พิมพ์ตอบได้เลย"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                        e.preventDefault()
                        void send()
                      }
                    }}
                    className="max-h-[140px] min-h-[42px] flex-1 resize-none border-0 bg-transparent px-2 py-2.5 text-[16px] leading-snug text-ink outline-none placeholder:text-[#98a2b8]"
                  />
                </div>
                <button onClick={() => void send()} disabled={!text.trim() || busy} aria-label="ส่งข้อความ" className="btn btn-primary !min-h-[52px] !w-[52px] !rounded-full !p-0"><SendHorizonal size={22} /></button>
              </div>
            ) : (
              <Notice tone="info">ใบสมัครอยู่ระหว่างการตรวจสอบโดยเจ้าหน้าที่ จึงแก้ไขในแชตไม่ได้ในขณะนี้ <Link to="/app/review" className="font-semibold text-bird">ดูสถานะ</Link></Notice>
            )}
            {editable && (
              <div className="flex items-center justify-between gap-3 text-[12.5px] text-faint">
                <span>ผู้ช่วยไม่ได้อ่านรูปหรือไฟล์ที่แนบ เจ้าหน้าที่เป็นผู้ตรวจ</span>
                <Link to="/app/docs" className="inline-flex flex-none items-center gap-1 font-semibold text-bird"><FileText size={14} /> ไปหน้าเอกสาร</Link>
              </div>
            )}
          </div>
        </div>
      </section>

      <aside className="hidden min-h-0 overflow-y-auto border-l border-[rgba(17,80,173,0.1)] bg-white/50 p-5 lg:block scroll-thin"><Captured app={app} /></aside>

      <AnimatePresence>
        {sheet && (
          <motion.div className="fixed inset-0 z-40 flex items-end bg-[rgba(15,42,99,0.28)] backdrop-blur-[2px] lg:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setSheet(false)}>
            <motion.div role="dialog" aria-label="ที่ผมจดไว้แล้ว" className="max-h-[82dvh] w-full overflow-y-auto rounded-t-[28px] bg-white p-5 pb-8" initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 30, stiffness: 320 }} onClick={(e) => e.stopPropagation()}>
              <button onClick={() => setSheet(false)} aria-label="ปิด" className="float-right grid h-9 w-9 place-items-center rounded-full border-0 bg-[rgba(17,80,173,0.08)] text-bird"><X size={18} /></button>
              <Captured app={app} />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function Msg({ mine, children }: { mine?: boolean; children: React.ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: 14, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }} className={cn('px-4 py-3 text-[15.5px] leading-[1.65]', mine ? 'max-w-[86%] self-end rounded-[20px_20px_6px_20px] text-white shadow-[0_14px_28px_-14px_rgba(77,141,255,0.9)] sm:max-w-[78%]' : 'glass max-w-full self-start rounded-[6px_20px_20px_20px]')} style={mine ? { background: 'linear-gradient(135deg,#3b78f2,#1b4fc4)' } : undefined}>
      {children}
    </motion.div>
  )
}

function Typing() {
  return (
    <div className="glass flex w-fit items-center gap-1.5 self-start rounded-[6px_20px_20px_20px] px-4 py-3.5" aria-label="ผู้ช่วยกำลังพิมพ์">
      {[0, 0.15, 0.3].map((d) => <span key={d} className="dot h-2 w-2 rounded-full bg-sky" style={{ animationDelay: `${d}s` }} />)}
    </div>
  )
}

function Bubble({ m, app, interactive, busy, onPricing }: { m: ChatMessageDto; app: AppDto; interactive: boolean; busy: boolean; onPricing: (lineId: string, a: 'confirm' | 'revise') => void }) {
  const [why, setWhy] = useState(false)
  if (m.role === 'system') return <div className="self-center"><Notice tone="info">{m.text}</Notice></div>
  if (m.role === 'user') {
    return (
      <Msg mine>
        {m.attachment && (
          <div className="mb-2 overflow-hidden rounded-2xl bg-white/15">
            {m.attachment.mime.startsWith('image/') && m.attachment.mime !== 'image/heic'
              ? <img src={`/api/app/files/${m.attachment.id}`} alt={m.attachment.name} className="max-h-48 w-full object-cover" />
              : <div className="flex items-center gap-2 p-3 text-[14px]"><FileText size={20} /> <span className="truncate">{m.attachment.name}</span></div>}
            <div className="px-3 py-1.5 text-[12px] opacity-85">{m.attachment.name} · {fmtSize(m.attachment.size)}</div>
          </div>
        )}
        <span className="whitespace-pre-wrap">{m.text}</span>
      </Msg>
    )
  }
  const line = m.showPricingLineId ? app.lines.find((l) => l.id === m.showPricingLineId) : undefined
  return (
    <div className="flex max-w-[92%] flex-col gap-2 self-start sm:max-w-[82%]">
      <Msg><span className="whitespace-pre-wrap">{m.text}</span></Msg>
      {m.captured && (
        <motion.div initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.25 }} className="flex w-fit items-center gap-1.5 rounded-full bg-[rgba(11,122,75,0.08)] px-3 py-1 text-[12.5px] font-semibold text-ok">
          <Check size={14} /> บันทึกแล้ว: {m.captured}
        </motion.div>
      )}
      {line && <PricingCard line={line} editable={interactive} busy={busy} onConfirm={() => onPricing(line.id, 'confirm')} onRevise={() => onPricing(line.id, 'revise')} />}
      {m.formatHint && (
        <div className="flex flex-col gap-1 rounded-2xl border-[1.5px] border-dashed border-[rgba(11,111,142,0.5)] bg-[rgba(11,111,142,0.05)] px-3.5 py-2.5">
          <span className="text-[12px] font-semibold text-teal">ตอบแบบนี้ได้เลย</span>
          <span className="whitespace-pre-line text-[14px] leading-relaxed text-ink">{m.formatHint}</span>
        </div>
      )}
      {m.why && (
        <div>
          <button onClick={() => setWhy((v) => !v)} className="inline-flex items-center gap-1.5 border-0 bg-transparent p-0 text-[12.5px] font-semibold text-faint hover:text-bird"><HelpCircle size={14} /> ทำไมถึงถาม</button>
          <AnimatePresence initial={false}>{why && <motion.p initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="m-0 mt-1 overflow-hidden text-[13.5px] leading-relaxed text-muted">{m.why}</motion.p>}</AnimatePresence>
        </div>
      )}
      {m.note && <p className="m-0 text-[12.5px] text-warn">{m.note}</p>}
    </div>
  )
}

/** "ที่ผมจดไว้แล้ว": what the assistant has captured so far, grouped, always visible next to the chat. */
function Captured({ app }: { app: AppDto }) {
  const rows = PROFILE_LABELS.filter(([k]) => app.profile[k] !== undefined && app.profile[k] !== '')
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="m-0 mb-3 flex items-center gap-2 text-[16px] font-bold text-navy"><ClipboardList size={18} className="text-bird" /> ที่ผมจดไว้แล้ว</h2>
        <section className="glass rounded-2xl p-4">
          <h3 className="m-0 mb-2 text-[13px] font-semibold text-teal">ผู้สมัคร{app.type === 'business' ? ' (นิติบุคคล)' : ''}</h3>
          <dl className="m-0 flex flex-col gap-2 text-[13.5px]">
            <div className="flex justify-between gap-3"><dt className="text-faint">เลขประจำตัว</dt><dd className="m-0 font-medium">{app.idMasked}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-faint">อีเมล</dt><dd className="m-0 truncate font-medium">{app.email}</dd></div>
            {rows.map(([k, l]) => <div key={k} className="flex justify-between gap-3"><dt className="flex-none text-faint">{l}</dt><dd className="m-0 text-right font-medium text-navy">{fmtVal(k, app.profile[k])}</dd></div>)}
          </dl>
          {app.profileRemaining.length > 0 && <p className="m-0 mt-3 text-[12.5px] leading-relaxed text-faint">ยังขาด: {app.profileRemaining.map((k) => REMAINING_LABEL[k] ?? k).join(' · ')}</p>}
        </section>
      </div>
      <section className="glass rounded-2xl p-4">
        <h3 className="m-0 mb-2 text-[13px] font-semibold text-teal">บริการและราคา</h3>
        {app.lines.length === 0 ? <p className="m-0 text-[13.5px] text-faint">ยังไม่มีบริการ ผู้ช่วยจะถามต่อจากข้อมูลผู้สมัคร</p> : (
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {app.lines.map((l) => (
              <li key={l.id} className="text-[13.5px]">
                <div className="flex items-center gap-2 font-semibold text-navy">{lineTitle(l)}{l.pricing.confirmed && <Check size={15} className="text-ok" aria-label="ยืนยันราคาแล้ว" />}</div>
                {l.coverage && <div className="text-muted">พื้นที่: {l.coverage}</div>}
                {l.equipment && <div className="text-muted">พาหนะ/อุปกรณ์: {l.equipment}</div>}
                <div className="text-muted">ราคา: {pricingSummary(l.pricing)}</div>
              </li>
            ))}
          </ul>
        )}
      </section>
      <Link to="/app/docs" className="btn btn-ghost btn-sm w-full"><FileText size={16} /> ไปหน้าเอกสาร</Link>
    </div>
  )
}
