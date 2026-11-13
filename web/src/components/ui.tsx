import { motion, AnimatePresence } from 'framer-motion'
import { Loader2 } from 'lucide-react'
import clsx from 'clsx'
import type { ReactNode } from 'react'

export const cn = clsx

export function Logo({ className, size = 1 }: { className?: string; size?: number }) {
  return (
    <span className={cn('inline-flex select-none items-center', className)} aria-label="Bird Express">
      <img src="/bird-logo.png" alt="Bird Express" style={{ height: 46 * size }} className="w-auto" draggable={false} />
    </span>
  )
}

/** The assistant's mark: the wings used on the landing page (replaces the old glowing ball). */
export const Orb = ({ size = 40 }: { size?: number }) => (
  <span aria-hidden className="wing-mark relative inline-grid flex-none place-items-center" style={{ width: size * 1.45, height: size }}>
    <span className="absolute inset-[-18%] rounded-full" style={{ background: 'radial-gradient(circle, rgba(111,227,240,.28), rgba(77,141,255,.10) 50%, transparent 70%)' }} />
    <img src="/wings.png" alt="" draggable={false} className="relative h-full w-full object-contain drop-shadow-[0_5px_8px_rgba(40,110,230,0.55)]" />
  </span>
)

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
