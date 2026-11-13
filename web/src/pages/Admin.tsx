import { motion } from 'framer-motion'
import { ArrowLeft, Check, ExternalLink, Eye, EyeOff, LogOut, MessageSquare, ShieldAlert, Sparkles } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import type { AppDto, ChatMessageDto, Profile } from '@shared/types'
import { lineTitle } from '@shared/requirements'
import { pricingSummary } from '@shared/pricing'
import { formatId } from '@shared/thai'
import { api, ApiError, type AdminListItem } from '../lib/api'
import { useSession } from '../lib/session'
import { ErrorLine, Logo, Notice, Screen, Spinner, StatusPill, cn, fmtDT, fmtSize } from '../components/ui'

function Top({ back }: { back?: boolean }) {
  const { logout, me } = useSession()
  return (
    <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-[rgba(17,80,173,0.12)] bg-white/80 px-4 py-3 backdrop-blur-xl sm:px-6">
      {back && <Link to="/admin" className="btn btn-ghost btn-sm" aria-label="กลับ"><ArrowLeft size={16} /></Link>}
      <Logo size={0.8} />
      <span className="chip">เจ้าหน้าที่</span>
      <span className="ml-auto hidden text-[13px] text-faint sm:inline">{me?.user?.email}</span>
      <button onClick={() => void logout()} className="btn btn-ghost btn-sm"><LogOut size={15} /> <span className="hidden sm:inline">ออกจากระบบ</span></button>
    </header>
  )
}

const FILTERS = [['all', 'ทั้งหมด'], ['submitted', 'รอตรวจ'], ['needs_info', 'ขอข้อมูลเพิ่ม'], ['approved', 'อนุมัติ'], ['rejected', 'ไม่ผ่าน']] as const

export function AdminList() {
  const [data, setData] = useState<{ apps: AdminListItem[]; sheets: { configured: boolean }; ai: { configured: boolean; model: string } }>()
  const [filter, setFilter] = useState<string>('all')
  const [err, setErr] = useState<string>()
  useEffect(() => {
    api.get<NonNullable<typeof data>>('/admin/applications').then(setData).catch((e) => setErr(e instanceof ApiError ? e.message : 'โหลดไม่สำเร็จ'))
  }, [])
  const rows = data?.apps.filter((a) => filter === 'all' || a.status === filter) ?? []
  return (
    <Screen>
      <Top />
      <main className="mx-auto flex w-full max-w-[1040px] flex-col gap-5 px-4 py-6 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div><h1 className="m-0 text-[26px] font-bold text-navy">ใบสมัครพาร์ทเนอร์</h1><p className="m-0 text-[14px] text-muted">เจ้าหน้าที่เป็นผู้ตัดสิน AI เป็นเพียงผู้ช่วยตรวจเบื้องต้น</p></div>
          {data && <div className="flex flex-wrap gap-2 text-[12.5px]"><span className="chip">AI: {data.ai.configured ? data.ai.model : 'โหมดสำรอง'}</span><span className="chip">Google Sheets: {data.sheets.configured ? 'เชื่อมต่อ' : 'ยังไม่ตั้งค่า'}</span></div>}
        </div>
        <div className="flex flex-wrap gap-2" role="tablist">
          {FILTERS.map(([k, l]) => <button key={k} role="tab" aria-selected={filter === k} onClick={() => setFilter(k)} className={cn('btn btn-sm', filter === k ? 'btn-primary' : 'btn-ghost')}>{l}</button>)}
        </div>
        <ErrorLine>{err}</ErrorLine>
        {!data && !err ? <div className="grid place-items-center py-16 text-bird"><Spinner className="h-8 w-8" /></div> : rows.length === 0 ? <Notice tone="info">ยังไม่มีใบสมัครในหมวดนี้</Notice> : (
          <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
            {rows.map((a, i) => (
              <motion.li key={a.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
                <Link to={`/admin/${a.id}`} className="glass flex flex-wrap items-center gap-x-4 gap-y-1 rounded-2xl p-4 no-underline transition hover:-translate-y-0.5 hover:border-[rgba(77,141,255,0.5)]">
                  <div className="flex min-w-0 flex-1 flex-col"><span className="truncate text-[16px] font-semibold text-navy">{a.name}</span><span className="truncate text-[13px] text-faint">{a.ref ?? a.id} · {a.email}</span></div>
                  <span className="chip">{a.type === 'business' ? 'นิติบุคคล' : 'บุคคลธรรมดา'}</span>
                  <span className="text-[13px] text-muted">{a.services} บริการ</span>
                  <span className="text-[13px] text-faint">ส่ง {fmtDT(a.submittedAt)}</span>
                  <StatusPill status={a.status} />
                </Link>
              </motion.li>
            ))}
          </ul>
        )}
      </main>
    </Screen>
  )
}

interface Detail {
  app: AppDto
  idNumber: string
  findings: { tone: 'ok' | 'warn' | 'info'; text: string }[]
  files: { id: string; key: string; name: string; size: number; mime: string; source: string; at: string }[]
  messages: ChatMessageDto[]
  audit: { actor: string; action: string; detail: string | null; at: string }[]
  sheet: { configured: boolean; syncedAt?: string; error?: string }
}

const PL: [keyof Profile, string][] = [
  ['fullName', 'ชื่อ-นามสกุล'], ['companyNameTh', 'ชื่อบริษัท'], ['phone', 'เบอร์โทร'], ['contactName', 'ผู้ติดต่อ'], ['contactPhone', 'เบอร์ผู้ติดต่อ'], ['birthDate', 'วันเกิด'],
  ['address', 'ที่อยู่'], ['registeredAddress', 'ที่อยู่จดทะเบียน'], ['province', 'จังหวัด'], ['postalCode', 'รหัสไปรษณีย์'], ['directorName', 'กรรมการ'],
  ['uboName', 'UBO'], ['uboPercent', 'สัดส่วนถือหุ้น (%)'], ['vatRegistered', 'จด VAT'], ['bankName', 'ธนาคาร'], ['bankAccountNo', 'เลขบัญชี'], ['bankAccountName', 'ชื่อบัญชี'],
]

export function AdminDetail() {
  const { id } = useParams()
  const nav = useNavigate()
  const [d, setD] = useState<Detail>()
  const [err, setErr] = useState<string>()
  const [showId, setShowId] = useState(false)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [chat, setChat] = useState(false)

  useEffect(() => {
    api.get<Detail>(`/admin/applications/${id}`).then(setD).catch((e) => setErr(e instanceof ApiError ? e.message : 'โหลดไม่สำเร็จ'))
  }, [id])

  const decide = async (decision: 'approved' | 'needs_info' | 'rejected') => {
    if (decision !== 'approved' && !note.trim()) return setErr('กรุณาระบุเหตุผลหรือรายการที่ต้องการเพิ่มเติม')
    if (decision === 'approved' && !window.confirm('ยืนยันอนุมัติพาร์ทเนอร์รายนี้?')) return
    setBusy(true)
    setErr(undefined)
    try {
      await api.post(`/admin/applications/${id}/decision`, { decision, note: note.trim() || undefined })
      nav('/admin')
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'บันทึกไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  if (!d) return <Screen><Top back /><div className="grid place-items-center py-24 text-bird">{err ? <ErrorLine>{err}</ErrorLine> : <Spinner className="h-8 w-8" />}</div></Screen>
  const a = d.app
  const decided = a.status === 'approved' || a.status === 'rejected'
  return (
    <Screen>
      <Top back />
      <main className="mx-auto flex w-full max-w-[920px] flex-col gap-4 px-4 py-6 sm:px-6">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="m-0 text-[24px] font-bold text-navy">{a.profile.companyNameTh || a.profile.fullName || a.id}</h1>
          <StatusPill status={a.status} />
          <span className="chip">{a.type === 'business' ? 'นิติบุคคล' : 'บุคคลธรรมดา'}</span>
          <span className="text-[13px] text-faint">{a.ref ?? a.id} · ส่ง {fmtDT(a.submittedAt)}</span>
        </div>

        <Sec title="ผลตรวจเบื้องต้นโดย AI (ไม่ใช่การตัดสิน)" icon={<Sparkles size={17} className="text-teal" />}>
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0 text-[14px]">
            {d.findings.map((f, i) => <li key={i} className={cn('flex gap-2', f.tone === 'warn' ? 'text-warn' : f.tone === 'ok' ? 'text-ok' : 'text-muted')}>{f.tone === 'warn' ? <ShieldAlert size={16} className="mt-0.5 flex-none" /> : f.tone === 'ok' ? <Check size={16} className="mt-0.5 flex-none" /> : <span className="w-4 flex-none" />}<span>{f.text}</span></li>)}
          </ul>
        </Sec>

        <Sec title="ข้อมูลผู้สมัคร">
          <dl className="m-0 grid gap-x-6 gap-y-1.5 text-[14px] sm:grid-cols-2">
            <Kv k={a.type === 'business' ? 'เลขทะเบียนนิติบุคคล' : 'เลขบัตรประชาชน'}>
              <span className="inline-flex items-center gap-2 font-mono">{showId ? formatId(d.idNumber) : a.idMasked}<button onClick={() => setShowId((v) => !v)} aria-label={showId ? 'ซ่อน' : 'แสดง'} className="border-0 bg-transparent p-0 text-bird">{showId ? <EyeOff size={16} /> : <Eye size={16} />}</button></span>
            </Kv>
            <Kv k="อีเมล">{a.email}</Kv>
            {PL.filter(([k]) => a.profile[k] !== undefined && a.profile[k] !== '').map(([k, l]) => <Kv key={k} k={l}>{k === 'vatRegistered' ? (a.profile[k] ? 'จด VAT' : 'ไม่จด VAT') : String(a.profile[k])}</Kv>)}
          </dl>
        </Sec>

        <Sec title="บริการและโครงสร้างราคาที่เสนอ">
          {a.lines.map((l) => <div key={l.id} className="mb-2 text-[14px] last:mb-0"><b className="text-navy">{lineTitle(l)}</b> {l.pricing.confirmed ? <span className="chip !bg-[rgba(11,122,75,0.1)] !text-ok">ยืนยันแล้ว</span> : <span className="chip !bg-[rgba(163,90,0,0.1)] !text-warn">ยังไม่ยืนยัน</span>}<div className="text-muted">{[l.coverage && `พื้นที่: ${l.coverage}`, l.equipment && `พาหนะ: ${l.equipment}`, `ราคา: ${pricingSummary(l.pricing)}`].filter(Boolean).join(' · ')}</div>{l.customs?.clearance && <div className="text-muted">ศุลกากร: {l.customs.clearance} {l.customs.handling ?? ''} {l.customs.dutyTax ?? ''}</div>}</div>)}
        </Sec>

        <Sec title="เอกสารที่แนบ">
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0 text-[14px]">
            {a.docs.map((s) => <li key={s.key} className="flex flex-wrap items-center gap-2"><span className={cn('font-medium', s.files.length ? 'text-navy' : s.required ? 'text-bad' : 'text-faint')}>{s.label}{s.required ? ' *' : ''}</span>{s.files.length === 0 && <span className="text-[12.5px] text-faint">{s.required ? 'ยังไม่แนบ' : 'ไม่ได้แนบ'}</span>}{d.files.filter((f) => f.key === s.key).map((f) => <a key={f.id} href={`/api/admin/files/${f.id}`} target="_blank" rel="noreferrer" className="chip no-underline">{f.name} · {fmtSize(f.size)} <ExternalLink size={12} /></a>)}</li>)}
            {d.files.filter((f) => !a.docs.some((s) => s.key === f.key)).map((f) => <li key={f.id}><a href={`/api/admin/files/${f.id}`} target="_blank" rel="noreferrer" className="chip no-underline">ไฟล์อื่น: {f.name} <ExternalLink size={12} /></a></li>)}
          </ul>
        </Sec>

        <Sec title="การเชื่อมต่อ Google Sheets">
          <p className="m-0 text-[14px] text-muted">{!d.sheet.configured ? 'ยังไม่ได้ตั้งค่า (ข้อมูลอยู่ในฐานข้อมูลของระบบ)' : d.sheet.error ? `ซิงก์ล้มเหลว: ${d.sheet.error}` : d.sheet.syncedAt ? `ซิงก์ล่าสุด ${fmtDT(d.sheet.syncedAt)}` : 'ยังไม่เคยซิงก์'}</p>
        </Sec>

        <section className="glass rounded-2xl">
          <button onClick={() => setChat((v) => !v)} className="flex w-full items-center gap-2 border-0 bg-transparent p-4 text-left text-[15px] font-bold text-navy"><MessageSquare size={17} /> บทสนทนากับผู้ช่วย ({d.messages.length}) <span className="ml-auto text-[13px] font-medium text-bird">{chat ? 'ซ่อน' : 'แสดง'}</span></button>
          {chat && <div className="scroll-thin flex max-h-[360px] flex-col gap-2 overflow-y-auto px-4 pb-4 text-[13.5px]">{d.messages.map((m) => <div key={m.id} className={cn('rounded-xl px-3 py-2', m.role === 'user' ? 'bg-[rgba(77,141,255,0.1)]' : 'bg-[rgba(17,80,173,0.04)]')}><b className="text-[12px] text-faint">{m.role === 'user' ? 'พาร์ทเนอร์' : m.role === 'assistant' ? 'ผู้ช่วย' : 'ระบบ'}</b><div className="whitespace-pre-wrap">{m.text}</div></div>)}</div>}
        </section>

        <Sec title="ประวัติการดำเนินการ">
          <ul className="m-0 flex list-none flex-col gap-1 p-0 text-[13px] text-muted">{d.audit.map((x, i) => <li key={i}>{fmtDT(x.at)} · {x.actor} · {x.action}{x.detail ? ` · ${x.detail}` : ''}</li>)}</ul>
        </Sec>

        <section className="glass sticky bottom-3 flex flex-col gap-3 rounded-2xl border-[rgba(17,80,173,0.25)] p-4">
          <h2 className="m-0 text-[15px] font-bold text-navy">การตัดสินของเจ้าหน้าที่</h2>
          {decided && <Notice tone="info">ใบสมัครนี้ตัดสินแล้ว ({a.status === 'approved' ? 'อนุมัติ' : 'ไม่ผ่าน'}){a.reviewNote ? `: ${a.reviewNote}` : ''}</Notice>}
          <textarea className="field !min-h-[72px] py-3" placeholder="เหตุผล / รายการที่ต้องการเพิ่มเติม (จำเป็นเมื่อขอข้อมูลเพิ่มหรือไม่ผ่าน)" value={note} onChange={(e) => setNote(e.target.value)} />
          <ErrorLine>{err}</ErrorLine>
          <div className="grid gap-2 sm:grid-cols-3">
            <button disabled={busy || decided} onClick={() => void decide('approved')} className="btn btn-ok btn-sm !min-h-[46px]">อนุมัติ</button>
            <button disabled={busy || decided} onClick={() => void decide('needs_info')} className="btn btn-ghost btn-sm !min-h-[46px]">ขอข้อมูลเพิ่ม</button>
            <button disabled={busy || decided} onClick={() => void decide('rejected')} className="btn btn-danger btn-sm !min-h-[46px]">ไม่ผ่าน</button>
          </div>
        </section>
      </main>
    </Screen>
  )
}

function Sec({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return <section className="glass flex flex-col gap-3 rounded-2xl p-4"><h2 className="m-0 flex items-center gap-2 text-[15px] font-bold text-navy">{icon}{title}</h2>{children}</section>
}
function Kv({ k, children }: { k: string; children: React.ReactNode }) {
  return <div className="flex gap-2"><dt className="w-[120px] flex-none text-faint">{k}</dt><dd className="m-0 min-w-0 font-medium text-navy">{children}</dd></div>
}
