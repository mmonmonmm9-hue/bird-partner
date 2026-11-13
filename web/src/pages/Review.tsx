import { motion } from 'framer-motion'
import { AlertTriangle, CheckCircle2, Clock, MailCheck, Send, XCircle } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { Profile } from '@shared/types'
import { lineTitle } from '@shared/requirements'
import { pricingSummary } from '@shared/pricing'
import { api, ApiError, type AppState } from '../lib/api'
import { useApp } from '../lib/session'
import { ErrorLine, Notice, Spinner, StatusPill, fmtDT } from '../components/ui'

const LABELS: [keyof Profile, string][] = [
  ['fullName', 'ชื่อ-นามสกุล'], ['companyNameTh', 'ชื่อบริษัท'], ['phone', 'เบอร์โทร'], ['contactName', 'ผู้ติดต่อ'], ['contactPhone', 'เบอร์ผู้ติดต่อ'],
  ['birthDate', 'วันเกิด'], ['address', 'ที่อยู่'], ['registeredAddress', 'ที่อยู่จดทะเบียน'], ['province', 'จังหวัด'], ['postalCode', 'รหัสไปรษณีย์'],
  ['directorName', 'กรรมการ'], ['uboName', 'เจ้าของผู้รับผลประโยชน์'], ['uboPercent', 'สัดส่วนถือหุ้น (%)'], ['vatRegistered', 'จด VAT'],
  ['bankName', 'ธนาคาร'], ['bankAccountNo', 'เลขบัญชี'], ['bankAccountName', 'ชื่อบัญชี'],
]

export function Review() {
  const { app, blockers, apply } = useApp()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string>()
  const [list, setList] = useState<string[]>()
  const editable = app.status === 'draft' || app.status === 'needs_info'
  const shown = list ?? blockers

  const submit = async () => {
    setBusy(true)
    setErr(undefined)
    try {
      apply(await api.post<AppState>('/app/submit'))
      setList(undefined)
    } catch (e) {
      if (e instanceof ApiError) {
        setErr(e.message)
        if (Array.isArray(e.data.blockers)) setList(e.data.blockers as string[])
      } else setErr('ส่งไม่สำเร็จ ลองใหม่อีกครั้ง')
    } finally {
      setBusy(false)
    }
  }

  if (!editable) return <StatusView />

  return (
    <div className="scroll-thin flex-1 overflow-y-auto px-4 pb-10 pt-5 sm:px-6">
      <div className="mx-auto flex max-w-[720px] flex-col gap-5">
        <div className="flex flex-col gap-1.5">
          <h1 className="m-0 text-[26px] font-bold text-navy">ตรวจสอบก่อนส่ง</h1>
          <p className="m-0 text-[14.5px] leading-relaxed text-muted">ดูสรุปทุกอย่างที่ผู้ช่วยจดไว้ ถ้ามีจุดไหนไม่ถูกต้อง กลับไปแก้ในแชตหรือหน้าเอกสารได้ ก่อนกดส่งให้เจ้าหน้าที่</p>
        </div>

        {app.status === 'needs_info' && app.reviewNote && <Notice tone="info"><b>เจ้าหน้าที่ขอข้อมูลเพิ่มเติม:</b> {app.reviewNote}</Notice>}

        <Card title="ผู้สมัคร">
          <Dl rows={[['ประเภท', app.type === 'business' ? 'นิติบุคคล' : 'บุคคลธรรมดา'], ['เลขประจำตัว', app.idMasked], ['อีเมล', app.email], ...LABELS.filter(([k]) => app.profile[k] !== undefined && app.profile[k] !== '').map(([k, l]) => [l, k === 'vatRegistered' ? (app.profile[k] ? 'จด VAT' : 'ไม่จด VAT') : String(app.profile[k])] as [string, string])]} />
        </Card>

        <Card title="บริการและราคาที่เสนอ">
          {app.lines.length === 0 ? <p className="m-0 text-[14px] text-faint">ยังไม่มีบริการ กลับไปคุยกับผู้ช่วยเพื่อเพิ่มบริการ</p> : (
            <ul className="m-0 flex list-none flex-col gap-3 p-0">
              {app.lines.map((l) => (
                <li key={l.id} className="flex flex-col gap-0.5 text-[14px]">
                  <span className="flex items-center gap-2 font-semibold text-navy">{lineTitle(l)} {l.pricing.confirmed ? <span className="chip !bg-[rgba(11,122,75,0.1)] !text-ok">ยืนยันราคาแล้ว</span> : <span className="chip !bg-[rgba(163,90,0,0.1)] !text-warn">ยังไม่ยืนยันราคา</span>}</span>
                  {l.coverage && <span className="text-muted">พื้นที่: {l.coverage}</span>}
                  <span className="text-muted">ราคา: {pricingSummary(l.pricing)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="เอกสาร">
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0 text-[14px]">
            {app.docs.map((d) => (
              <li key={d.key} className="flex items-center gap-2">
                {d.files.length ? <CheckCircle2 size={17} className="flex-none text-ok" /> : d.required ? <XCircle size={17} className="flex-none text-bad" /> : <Clock size={17} className="flex-none text-faint" />}
                <span className="text-navy">{d.label}</span>
                <span className="ml-auto text-[12.5px] text-faint">{d.files.length ? `${d.files.length} ไฟล์` : d.required ? 'ยังไม่แนบ (บังคับ)' : 'ไม่ได้แนบ'}</span>
              </li>
            ))}
          </ul>
        </Card>

        {shown.length > 0 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <Notice tone="warn">
              <div className="mb-1.5 flex items-center gap-2 font-semibold"><AlertTriangle size={17} /> ยังส่งไม่ได้ ต้องแก้รายการต่อไปนี้ก่อน</div>
              <ul className="m-0 list-disc pl-5">{shown.map((b) => <li key={b}>{b}</li>)}</ul>
              <div className="mt-2 flex gap-3 text-[13.5px]"><Link to="/app/chat" className="font-semibold text-bird">ไปที่แชต</Link><Link to="/app/docs" className="font-semibold text-bird">ไปที่เอกสาร</Link></div>
            </Notice>
          </motion.div>
        )}
        <ErrorLine>{err && shown.length === 0 ? err : undefined}</ErrorLine>

        <p className="m-0 text-[13px] leading-relaxed text-faint">เมื่อกดส่ง เจ้าหน้าที่ Bird จะตรวจสอบเอกสารและข้อมูลด้วยตนเอง ผู้ช่วย AI ไม่ได้อนุมัติหรือปฏิเสธ ราคาที่เสนอต้องผ่านการอนุมัติเชิงพาณิชย์ก่อนใช้งานจริง</p>
        <button className="btn btn-primary w-full" disabled={busy || blockers.length > 0} onClick={() => void submit()}>{busy ? <Spinner className="h-5 w-5" /> : <Send size={18} />} ส่งใบสมัครให้เจ้าหน้าที่ตรวจสอบ</button>
      </div>
    </div>
  )
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="glass flex flex-col gap-3 rounded-2xl p-4"><h2 className="m-0 text-[15px] font-bold text-navy">{title}</h2>{children}</section>
}
function Dl({ rows }: { rows: [string, string][] }) {
  return <dl className="m-0 flex flex-col gap-1.5 text-[14px]">{rows.map(([k, v]) => <div key={k} className="grid grid-cols-[130px_1fr] gap-3"><dt className="text-faint">{k}</dt><dd className="m-0 font-medium text-navy">{v}</dd></div>)}</dl>
}

function StatusView() {
  const { app } = useApp()
  const map = {
    submitted: { icon: <Clock size={34} />, tone: 'from-[#f6b24a] to-[#d98412]', title: 'ส่งใบสมัครแล้ว รอเจ้าหน้าที่ตรวจสอบ', body: 'เจ้าหน้าที่ Bird จะตรวจสอบข้อมูลและเอกสารของคุณ และแจ้งผลกลับ ระหว่างนี้แก้ไขใบสมัครไม่ได้' },
    approved: { icon: <MailCheck size={34} />, tone: 'from-[#17a36a] to-[#0b7a4b]', title: 'ใบสมัครได้รับการอนุมัติแล้ว', body: 'ยินดีต้อนรับสู่ Bird Partner ทีมงานจะติดต่อเรื่องขั้นตอนถัดไป' },
    rejected: { icon: <XCircle size={34} />, tone: 'from-[#d94a62] to-[#b4233a]', title: 'ใบสมัครไม่ผ่านการพิจารณา', body: 'ดูเหตุผลจากเจ้าหน้าที่ด้านล่าง หากมีข้อสงสัยกรุณาติดต่อทีมงาน Bird' },
  } as const
  const s = map[app.status as keyof typeof map] ?? map.submitted
  return (
    <div className="flex flex-1 items-center justify-center px-4 py-10">
      <motion.div initial={{ opacity: 0, y: 24, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }} className="glass flex w-full max-w-[520px] flex-col items-center gap-4 rounded-[28px] p-8 text-center">
        <span className={`grid h-[72px] w-[72px] place-items-center rounded-full bg-gradient-to-br text-white shadow-lg ${s.tone}`}>{s.icon}</span>
        <h1 className="m-0 text-[22px] font-bold text-navy">{s.title}</h1>
        <p className="m-0 text-[14.5px] leading-relaxed text-muted">{s.body}</p>
        {app.reviewNote && <Notice tone={app.status === 'rejected' ? 'bad' : 'info'}>{app.reviewNote}</Notice>}
        <div className="grid w-full grid-cols-2 gap-3 rounded-2xl bg-[rgba(17,80,173,0.05)] p-4 text-left text-[13.5px]">
          <span className="text-faint">เลขอ้างอิง</span><b className="text-navy">{app.ref ?? '—'}</b>
          <span className="text-faint">ส่งเมื่อ</span><b className="text-navy">{fmtDT(app.submittedAt)}</b>
          <span className="text-faint">สถานะ</span><span><StatusPill status={app.status} /></span>
        </div>
      </motion.div>
    </div>
  )
}
