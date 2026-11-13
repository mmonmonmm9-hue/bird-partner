import { motion } from 'framer-motion'
import { ArrowRight, Check, FileText, Trash2, Upload } from 'lucide-react'
import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import type { DocSlotDto } from '@shared/types'
import { api, ApiError, type AppState } from '../lib/api'
import { useApp } from '../lib/session'
import { ErrorLine, Notice, Spinner, cn, fmtSize } from '../components/ui'

export function Docs() {
  const { app, apply } = useApp()
  const [busyKey, setBusyKey] = useState<string>()
  const [err, setErr] = useState<string>()
  const editable = app.status === 'draft' || app.status === 'needs_info'
  const required = app.docs.filter((d) => d.required)
  const done = required.filter((d) => d.files.length).length
  const optional = app.docs.filter((d) => !d.required)

  const upload = async (key: string, f?: File | null) => {
    if (!f) return
    setBusyKey(key)
    setErr(undefined)
    try {
      apply(await api.upload<AppState>(`/app/docs/${key}`, f))
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'อัปโหลดไม่สำเร็จ')
    } finally {
      setBusyKey(undefined)
    }
  }
  const remove = async (id: string) => {
    setErr(undefined)
    try {
      apply(await api.del<AppState>(`/app/files/${id}`))
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'ลบไม่สำเร็จ')
    }
  }

  return (
    <div className="scroll-thin flex-1 overflow-y-auto px-4 pb-10 pt-5 sm:px-6">
      <div className="mx-auto flex max-w-[720px] flex-col gap-5">
        <div className="flex flex-col gap-1.5">
          <h1 className="m-0 text-[26px] font-bold text-navy">เอกสารประกอบการสมัคร</h1>
          <p className="m-0 text-[14.5px] leading-relaxed text-muted">รายการเอกสารปรับตามประเภทผู้สมัครและบริการที่คุณเลือก เอกสารที่มีป้าย "บังคับ" ต้องแนบก่อนส่งใบสมัคร รองรับ JPG, PNG, WEBP, HEIC และ PDF ไม่เกิน 8 MB ต่อไฟล์</p>
        </div>

        <div className="glass flex items-center gap-4 rounded-2xl p-4">
          <div className="grid h-12 w-12 flex-none place-items-center rounded-2xl text-[15px] font-bold text-white" style={{ background: done === required.length ? 'linear-gradient(135deg,#17a36a,#0b7a4b)' : 'var(--grad)' }}>{done}/{required.length}</div>
          <div className="text-[14.5px] text-muted"><b className="text-navy">เอกสารบังคับ</b> แนบแล้ว {done} จาก {required.length} รายการ{app.lines.length === 0 && ' · เมื่อเลือกบริการในแชต รายการเอกสารอาจเพิ่มขึ้น'}</div>
        </div>

        {!editable && <Notice tone="info">ใบสมัครอยู่ระหว่างการตรวจสอบ จึงแก้ไขเอกสารไม่ได้ในขณะนี้</Notice>}
        <ErrorLine>{err}</ErrorLine>

        <ul className="m-0 flex list-none flex-col gap-3 p-0">
          {[...required, ...optional].map((d, i) => (
            <motion.li key={d.key} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}>
              <Slot d={d} editable={editable} busy={busyKey === d.key} onUpload={(f) => void upload(d.key, f)} onRemove={(id) => void remove(id)} />
            </motion.li>
          ))}
        </ul>

        <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
          <Link to="/app/chat" className="btn btn-ghost">กลับไปคุยกับผู้ช่วย</Link>
          <Link to="/app/review" className="btn btn-primary">ตรวจสอบและส่งใบสมัคร <ArrowRight size={18} /></Link>
        </div>
      </div>
    </div>
  )
}

function Slot({ d, editable, busy, onUpload, onRemove }: { d: DocSlotDto; editable: boolean; busy: boolean; onUpload: (f?: File | null) => void; onRemove: (id: string) => void }) {
  const ref = useRef<HTMLInputElement>(null)
  const ok = d.files.length > 0
  return (
    <div className={cn('glass flex flex-col gap-3 rounded-2xl p-4 transition', ok && 'border-[rgba(11,122,75,0.35)]')}>
      <div className="flex items-start gap-3">
        <span className={cn('mt-0.5 grid h-8 w-8 flex-none place-items-center rounded-full', ok ? 'bg-[rgba(11,122,75,0.12)] text-ok' : 'bg-[rgba(17,80,173,0.08)] text-bird')}>{ok ? <Check size={18} /> : <FileText size={17} />}</span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[15.5px] font-semibold text-navy">{d.label}</span>
            <span className={cn('rounded-full px-2.5 py-0.5 text-[11.5px] font-bold', d.required ? 'bg-[rgba(180,35,58,0.09)] text-bad' : 'bg-[rgba(17,80,173,0.08)] text-faint')}>{d.required ? 'บังคับ' : 'ถ้ามี'}</span>
          </div>
          <span className="text-[13.5px] leading-relaxed text-muted">{d.hint}</span>
          {d.reason && <span className="text-[12.5px] text-teal">{d.reason}</span>}
        </div>
        {editable && (
          <>
            <input ref={ref} type="file" hidden accept="image/*,application/pdf" onChange={(e) => { onUpload(e.target.files?.[0]); e.target.value = '' }} />
            <button onClick={() => ref.current?.click()} disabled={busy} className="btn btn-ghost btn-sm flex-none" aria-label={`แนบ ${d.label}`}>{busy ? <Spinner className="h-4 w-4" /> : <Upload size={15} />}<span className="hidden sm:inline">{ok ? 'เพิ่มไฟล์' : 'แนบไฟล์'}</span></button>
          </>
        )}
      </div>
      {ok && (
        <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
          {d.files.map((f) => (
            <li key={f.id} className="flex items-center gap-2 rounded-xl bg-[rgba(17,80,173,0.05)] px-3 py-2 text-[13.5px]">
              <a href={`/api/app/files/${f.id}`} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate font-medium text-bird no-underline">{f.name}</a>
              <span className="flex-none text-faint">{fmtSize(f.size)}{f.source === 'chat' ? ' · จากแชต' : ''}</span>
              {editable && <button onClick={() => onRemove(f.id)} aria-label={`ลบ ${f.name}`} className="grid h-8 w-8 flex-none place-items-center rounded-full border-0 bg-transparent text-faint hover:bg-[rgba(180,35,58,0.08)] hover:text-bad"><Trash2 size={16} /></button>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
