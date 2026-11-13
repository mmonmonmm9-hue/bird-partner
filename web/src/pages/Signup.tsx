import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, Check, Eye, EyeOff } from 'lucide-react'
import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { formatId } from '@shared/thai'
import { validJuristic13, validThaiId13 } from '@shared/thai'
import { api, ApiError } from '../lib/api'
import { useSession } from '../lib/session'
import { ErrorLine, Logo, Notice, Screen, Spinner, cn } from '../components/ui'

type Step = 'id' | 'email' | 'code' | 'password'
const STEPS: { key: Step[]; label: string }[] = [
  { key: ['id'], label: 'ยืนยันตัวตน' },
  { key: ['email', 'code'], label: 'อีเมล' },
  { key: ['password'], label: 'ตั้งรหัสผ่าน' },
]

const slide = {
  initial: { opacity: 0, x: 36, filter: 'blur(6px)' },
  animate: { opacity: 1, x: 0, filter: 'blur(0px)' },
  exit: { opacity: 0, x: -36, filter: 'blur(6px)' },
}

export function Signup() {
  const { type: t } = useParams()
  const type = t === 'business' ? 'business' : t === 'individual' ? 'individual' : null
  const nav = useNavigate()
  const { me, refreshMe } = useSession()
  const [step, setStep] = useState<Step>('id')
  const [idRaw, setIdRaw] = useState('')
  const [consent, setConsent] = useState(false)
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [devCode, setDevCode] = useState<string>()
  const [mailSent, setMailSent] = useState(true)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string>()
  const [cool, setCool] = useState(0)

  useEffect(() => {
    if (cool <= 0) return
    const id = setTimeout(() => setCool((c) => c - 1), 1000)
    return () => clearTimeout(id)
  }, [cool])

  if (!type) return <Navigate to="/" replace />
  if (me?.user) return <Navigate to={me.user.role === 'admin' ? '/admin' : '/app/chat'} replace />

  const biz = type === 'business'
  const digits = idRaw.replace(/\D/g, '')
  const idValid = biz ? validJuristic13(digits) : validThaiId13(digits)
  const stepIndex = STEPS.findIndex((s) => s.key.includes(step))

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    setErr(undefined)
    try {
      await fn()
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'เกิดข้อผิดพลาด ลองใหม่อีกครั้ง')
    } finally {
      setBusy(false)
    }
  }

  const submitId = (e: FormEvent) => {
    e.preventDefault()
    void run(async () => {
      await api.post('/auth/signup/start', { type, idNumber: digits, consent })
      setStep('email')
    })
  }
  const sendCode = (e?: FormEvent) => {
    e?.preventDefault()
    void run(async () => {
      const r = await api.post<{ devCode?: string; mailSent?: boolean }>('/auth/signup/email', { email })
      setDevCode(r.devCode)
      setMailSent(r.mailSent !== false)
      setCode('')
      setCool(45)
      setStep('code')
    })
  }
  const verify = (e: FormEvent) => {
    e.preventDefault()
    void run(async () => {
      await api.post('/auth/signup/verify', { code })
      setStep('password')
    })
  }
  const finish = (e: FormEvent) => {
    e.preventDefault()
    void run(async () => {
      await api.post('/auth/signup/password', { password: pw })
      await refreshMe()
      nav('/app/chat', { replace: true })
    })
  }

  const back = () => {
    setErr(undefined)
    if (step === 'id') nav('/')
    else if (step === 'email') setStep('id')
    else if (step === 'code') setStep('email')
    // after the code is verified the account step cannot go back (the code is single use)
  }

  return (
    <Screen>
      <div className="mx-auto flex min-h-dvh w-full max-w-[520px] flex-col gap-6 px-4 pb-10 pt-5">
        <header className="flex items-center justify-between">
          <Logo size={0.9} />
          {step !== 'password' && (
            <button onClick={back} className="btn btn-ghost btn-sm" aria-label="ย้อนกลับ"><ArrowLeft size={16} /> ย้อนกลับ</button>
          )}
        </header>

        <nav aria-label="ขั้นตอน" className="flex flex-col gap-2">
          <div className="flex gap-1.5">
            {STEPS.map((s, i) => (
              <span key={s.label} className="relative h-[5px] flex-1 overflow-hidden rounded-full bg-[rgba(17,80,173,0.12)]">
                <motion.span className="absolute inset-0 rounded-full" style={{ background: 'linear-gradient(90deg,#4d8dff,#6fe3f0)', originX: 0 }} initial={false} animate={{ scaleX: i <= stepIndex ? 1 : 0 }} transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }} />
              </span>
            ))}
          </div>
          <div className="flex justify-between text-[12.5px] text-faint">
            {STEPS.map((s, i) => <span key={s.label} className={cn(i === stepIndex && 'font-semibold text-teal')}>{s.label}</span>)}
          </div>
        </nav>

        <div className="glass rounded-[28px] p-5 sm:p-7">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={step} {...slide} transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}>
              {step === 'id' && (
                <Form onSubmit={submitId} title={biz ? 'เลขทะเบียนนิติบุคคล' : 'เลขบัตรประชาชน'} sub="หน้านี้ขอแค่เลข 13 หลักเท่านั้น รูปบัตรและข้อมูลอื่น ๆ ผู้ช่วยจะขอในแชตภายหลัง">
                  <label className="flex flex-col gap-2">
                    <span className="label">{biz ? 'เลขทะเบียนนิติบุคคล 13 หลัก' : 'เลขบัตรประชาชน 13 หลัก'}</span>
                    <div className="relative">
                      <input className={cn('field pr-12 text-[20px] tracking-[0.06em]', digits.length === 13 && !idValid && 'border-bad')} inputMode="numeric" autoComplete="off" autoFocus placeholder="0-0000-00000-00-0" value={formatId(idRaw)} onChange={(e) => setIdRaw(e.target.value)} aria-invalid={digits.length === 13 && !idValid} />
                      {idValid && <Check size={20} className="absolute right-4 top-1/2 -translate-y-1/2 text-ok" aria-label="เลขถูกต้อง" />}
                    </div>
                    {digits.length > 0 && digits.length < 13 && <span className="text-[13.5px] text-muted">กรอกแล้ว {digits.length} จาก 13 หลัก (ขาดอีก {13 - digits.length} หลัก)</span>}
                    {digits.length === 13 && !idValid && (
                      <span className="text-[13.5px] text-bad">
                        {biz ? 'เลขนี้ใช้ไม่ได้ ต้องไม่ใช่ตัวเลขซ้ำตัวเดียวทั้งหมด' : 'เลข 13 หลักนี้ไม่ถูกต้อง ลองตรวจอีกครั้ง'}
                      </span>
                    )}
                  </label>
                  <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-[rgba(17,80,173,0.16)] bg-white/60 p-3.5">
                    <input type="checkbox" className="mt-1 h-5 w-5 flex-none accent-[#1150ad]" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
                    <span className="text-[14px] leading-relaxed text-muted">
                      ข้าพเจ้ายินยอมให้ Bird Express เก็บ ใช้ และตรวจสอบข้อมูลส่วนบุคคลและเอกสารที่ให้ไว้ เพื่อการพิจารณาและบริหารพาร์ทเนอร์ ตาม พ.ร.บ.คุ้มครองข้อมูลส่วนบุคคล (PDPA) ข้อมูลจะถูกเข้ารหัสและเข้าถึงได้เฉพาะเจ้าหน้าที่ที่ได้รับอนุญาต
                    </span>
                  </label>
                  <ErrorLine>{err}</ErrorLine>
                  <Submit busy={busy} disabled={!idValid || !consent}>ถัดไป</Submit>
                </Form>
              )}

              {step === 'email' && (
                <Form onSubmit={sendCode} title="สร้างบัญชีด้วยอีเมล" sub="เราจะส่งรหัส 6 หลักไปยืนยันอีเมลนี้ ใช้อีเมลนี้เข้าสู่ระบบในครั้งต่อไป">
                  <label className="flex flex-col gap-2">
                    <span className="label">อีเมล</span>
                    <input className="field" type="email" inputMode="email" autoComplete="email" autoFocus placeholder="name@company.com" value={email} onChange={(e) => setEmail(e.target.value)} />
                  </label>
                  <ErrorLine>{err}</ErrorLine>
                  <Submit busy={busy} disabled={!/^\S+@\S+\.\S+$/.test(email)}>ส่งรหัสยืนยัน</Submit>
                </Form>
              )}

              {step === 'code' && (
                <Form onSubmit={verify} title="กรอกรหัสยืนยัน" sub={mailSent || devCode ? `ส่งรหัส 6 หลักไปที่ ${email} แล้ว (ใช้ได้ 10 นาที)` : 'ยังส่งรหัสทางอีเมลไม่ได้ในขณะนี้'}>
                  {!mailSent && !devCode && <Notice tone="bad">ขณะนี้ระบบยังไม่ได้ตั้งค่าการส่งอีเมล รหัสยืนยันจึง <b>ยังไม่ถูกส่งถึงคุณ</b> กรุณาติดต่อผู้ดูแลระบบของ Bird หรือลองใหม่ภายหลัง</Notice>}
                  {devCode && <Notice tone="warn">โหมดทดสอบ: เซิร์ฟเวอร์ยังไม่ได้ตั้งค่าส่งอีเมล รหัสของคุณคือ <b className="tracking-widest">{devCode}</b></Notice>}
                  <label className="flex flex-col gap-2">
                    <span className="label">รหัส 6 หลัก</span>
                    <input className="field text-center text-[26px] font-semibold tracking-[0.5em]" inputMode="numeric" autoComplete="one-time-code" autoFocus maxLength={6} placeholder="••••••" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} />
                  </label>
                  <ErrorLine>{err}</ErrorLine>
                  <Submit busy={busy} disabled={code.length !== 6}>ยืนยันรหัส</Submit>
                  <button type="button" disabled={cool > 0 || busy} onClick={() => sendCode()} className="border-0 bg-transparent p-1 text-[14px] font-semibold text-bird disabled:text-faint">
                    {cool > 0 ? `ขอรหัสใหม่ได้ใน ${cool} วินาที` : 'ส่งรหัสอีกครั้ง'}
                  </button>
                </Form>
              )}

              {step === 'password' && (
                <Form onSubmit={finish} title="ตั้งรหัสผ่าน" sub="อีเมลยืนยันแล้ว ตั้งรหัสผ่านเพื่อสร้างบัญชี แล้วเริ่มคุยกับผู้ช่วยได้เลย">
                  <label className="flex flex-col gap-2">
                    <span className="label">รหัสผ่าน (อย่างน้อย 10 ตัว มีตัวอักษรและตัวเลข)</span>
                    <div className="relative">
                      <input className="field pr-12" type={showPw ? 'text' : 'password'} autoComplete="new-password" autoFocus value={pw} onChange={(e) => setPw(e.target.value)} />
                      <button type="button" onClick={() => setShowPw((v) => !v)} aria-label={showPw ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'} className="absolute right-3 top-1/2 -translate-y-1/2 border-0 bg-transparent p-1 text-faint">{showPw ? <EyeOff size={20} /> : <Eye size={20} />}</button>
                    </div>
                  </label>
                  <label className="flex flex-col gap-2">
                    <span className="label">ยืนยันรหัสผ่าน</span>
                    <input className="field" type={showPw ? 'text' : 'password'} autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} />
                    {pw2 && pw !== pw2 && <span className="text-[13.5px] text-bad">รหัสผ่านไม่ตรงกัน</span>}
                  </label>
                  <ErrorLine>{err}</ErrorLine>
                  <Submit busy={busy} disabled={pw.length < 10 || !/[A-Za-z]/.test(pw) || !/\d/.test(pw) || pw !== pw2}>สร้างบัญชีและเริ่มคุยกับผู้ช่วย</Submit>
                </Form>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        <p className="m-0 text-center text-[13px] text-faint">มีบัญชีแล้ว? <Link to="/login" className="font-semibold text-bird">เข้าสู่ระบบ</Link></p>
      </div>
    </Screen>
  )
}

function Form({ title, sub, onSubmit, children }: { title: string; sub: string; onSubmit: (e: FormEvent) => void; children: ReactNode }) {
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
      <div className="flex flex-col gap-1.5">
        <h2 className="m-0 text-[24px] font-bold text-navy">{title}</h2>
        <p className="m-0 text-[14.5px] leading-relaxed text-muted">{sub}</p>
      </div>
      {children}
    </form>
  )
}

function Submit({ busy, disabled, children }: { busy: boolean; disabled?: boolean; children: ReactNode }) {
  return (
    <button type="submit" className="btn btn-primary w-full" disabled={busy || disabled}>
      {busy ? <Spinner className="h-5 w-5" /> : null}
      {children}
    </button>
  )
}
