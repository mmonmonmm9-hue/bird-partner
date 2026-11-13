import { motion, AnimatePresence } from 'framer-motion'
import { Loader2 } from 'lucide-react'
import clsx from 'clsx'
import type { ReactNode } from 'react'

export const cn = clsx

export function Logo({ className, size = 1 }: { className?: string; size?: number }) {
  return (
    <span className={cn('inline-flex select-none items-center gap-2.5', className)} aria-label="Bird Partner">
      <img src="/bird-mark.png" alt="" style={{ height: 38 * size }} className="w-auto" draggable={false} />
      <span className="flex flex-col leading-[0.88] text-bird" style={{ fontFamily: '"Exo 2", "IBM Plex Sans Thai", sans-serif', fontStyle: 'italic', fontWeight: 800 }}>
        <span style={{ fontSize: 26 * size }} className="tracking-tight">BIRD</span>
        <span style={{ fontSize: 15 * size }} className="tracking-[0.14em]">PARTNER</span>
      </span>
    </span>
  )
}

export const Orb = ({ size = 40 }: { size?: number }) => <span aria-hidden className="orb inline-block flex-none" style={{ width: size, height: size }} />

export const Spinner = ({ className }: { className?: string }) => <Loader2 className={cn('animate-spin', className)} aria-hidden />

export function Screen({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('page-bg', className)}>{children}</div>
}

export function Notice({ tone = 'info', children }: { tone?: 'info' | 'warn' | 'bad' | 'ok'; children: ReactNode }) {
  const t = {
    info: 'border-[rgba(11,111,142,0.3)] bg-[rgba(11,111,142,0.07)] text-teal',
    warn: 'border-[rgba(163,90,0,0.3)] bg-[rgba(163,90,0,0.07)] text-warn',
    bad: 'border-[rgba(180,35,58,0.3)] bg-[rgba(180,35,58,0.06)] text-bad',
    ok: 'border-[rgba(11,122,75,0.3)] bg-[rgba(11,122,75,0.07)] text-ok',
  }[tone]
  return <div role={tone === 'bad' ? 'alert' : 'status'} className={cn('rounded-2xl border px-4 py-3 text-[14px] leading-relaxed', t)}>{children}</div>
}

export function ErrorLine({ children }: { children?: ReactNode }) {
  return (
    <AnimatePresence initial={false}>
      {children ? (
        <motion.p key="e" role="alert" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden text-[14px] font-medium text-bad">
          {children}
        </motion.p>
      ) : null}
    </AnimatePresence>
  )
}

export function ProgressBar({ value, tone = 'brand' }: { value: number; tone?: 'brand' | 'ok' }) {
  return (
    <div className="h-[6px] w-full overflow-hidden rounded-full bg-[rgba(17,80,173,0.1)]" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
      <motion.div
        className="h-full rounded-full"
        style={{ background: tone === 'ok' ? 'linear-gradient(90deg,#17a36a,#6fe3c0)' : 'linear-gradient(90deg,#4d8dff,#6fe3f0)' }}
        initial={false}
        animate={{ width: `${Math.max(0, Math.min(100, value))}%` }}
        transition={{ type: 'spring', stiffness: 120, damping: 20 }}
      />
    </div>
  )
}

export const STATUS_LABEL: Record<string, { text: string; cls: string }> = {
  draft: { text: 'กำลังกรอก', cls: 'bg-[rgba(17,80,173,0.08)] text-bird' },
  submitted: { text: 'รอตรวจสอบ', cls: 'bg-[rgba(163,90,0,0.1)] text-warn' },
  needs_info: { text: 'ขอข้อมูลเพิ่ม', cls: 'bg-[rgba(11,111,142,0.1)] text-teal' },
  approved: { text: 'อนุมัติแล้ว', cls: 'bg-[rgba(11,122,75,0.1)] text-ok' },
  rejected: { text: 'ไม่ผ่านการพิจารณา', cls: 'bg-[rgba(180,35,58,0.1)] text-bad' },
}
export const StatusPill = ({ status }: { status: string }) => {
  const s = STATUS_LABEL[status] ?? STATUS_LABEL.draft
  return <span className={cn('inline-flex items-center rounded-full px-3 py-1 text-[13px] font-semibold', s.cls)}>{s.text}</span>
}

export const fmtDT = (iso?: string) =>
  iso ? new Date(iso).toLocaleString('th-TH', { day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'
export const fmtSize = (n: number) => (n > 1_000_000 ? `${(n / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1000))} KB`)
