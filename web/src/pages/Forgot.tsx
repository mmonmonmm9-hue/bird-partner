import { AnimatePresence, motion } from 'framer-motion'
import { CheckCircle2 } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { api, ApiError } from '../lib/api'
import { ErrorLine, Logo, Notice, Screen, Spinner } from '../components/ui'

type Step = 'email' | 'reset' | 'done'
const slide = { initial: { opacity: 0, x: 36, filter: 'blur(6px)' }, animate: { opacity: 1, x: 0, filter: 'blur(0px)' }, exit: { opacity: 0, x: -36, filter: 'blur(6px)' } }

export function Forgot() {
  const [step, setStep] = useState<Step>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [devCode, setDevCode] = useState<string>()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string>()
  const [cool, setCool] = useState(0)

  useEffect(() => {
    if (cool <= 0) return
    const id = setTimeout(() => setCool((c) => c - 1), 1000)
    return () => clearTimeout(id)
  }, [cool])

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
  const send = (e?: FormEvent) => {
    e?.preventDefault()
    void run(async () => {
      const r = await api.post<{ devCode?: string }>('/auth/forgot', { email })
      setDevCode(r.devCode)
      setCool(45)
      setStep('reset')
    })
  }
  const reset = (e: FormEvent) => {
    e.preventDefault()
    void run(async () => {
      await api.post('/auth/reset', { email, code, password: pw })
      setStep('done')
    })
  }

  return (
    <Screen>
      <div className="mx-auto flex min-h-dvh w-full max-w-[460px] flex-col justify-center gap-6 px-4 py-10">
        <Link to="/" className="self-start no-underline"><Logo /></Link>
        <div className="glass rounded-[28px] p-6 sm:p-7">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={step} {...slide} transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}>
              {step === 'email' && (
                <form onSubmit={send} className="flex flex-col gap-5" noValidate>
                  <div className="flex flex-col gap-1.5">
                    <h1 className="m-0 text-[24px] font-bold text-navy">ลืมรหัสผ่าน</h1>
                    <p className="m-0 text-[14.5px] leading-relaxed text-muted">กรอกอีเมลที่ใช้สมัคร เราจะส่งรหัส 6 หลักไปให้เพื่อตั้งรหัสผ่านใหม่</p>
                  </div>
                  <label className="flex flex-col gap-2"><span className="label">อีเมล</span>
                    <input className="field" type="email" autoComplete="username" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} /></label>
                  <ErrorLine>{err}</ErrorLine>
                  <button className="btn btn-primary w-full" disabled={busy || !/^\S+@\S+\.\S+$/.test(email)}>{busy && <Spinner className="h-5 w-5" />}ส่งรหัส</button>
                </form>
              )}
              {step === 'reset' && (
                <form onSubmit={reset} className="flex flex-col gap-5" noValidate>
                  <div className="flex flex-col gap-1.5">
                    <h1 className="m-0 text-[24px] font-bold text-navy">ตั้งรหัสผ่านใหม่</h1>
                    <p className="m-0 text-[14.5px] leading-relaxed text-muted">ถ้าอีเมล {email} มีบัญชีอยู่ จะได้รับรหัส 6 หลัก (ใช้ได้ 10 นาที)</p>
                  </div>
                  {devCode && <Notice tone="warn">โหมดทดสอบ: เซิร์ฟเวอร์ยังไม่ได้ตั้งค่าส่งอีเมล รหัสของคุณคือ <b className="tracking-widest">{devCode}</b></Notice>}
                  <label className="flex flex-col gap-2"><span className="label">รหัส 6 หลัก</span>
                    <input className="field text-center text-[24px] font-semibold tracking-[0.5em]" inputMode="numeric" autoComplete="one-time-code" autoFocus maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} /></label>
                  <label className="flex flex-col gap-2"><span className="label">รหัสผ่านใหม่ (อย่างน้อย 10 ตัว มีตัวอักษรและตัวเลข)</span>
                    <input className="field" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} /></label>
                  <label className="flex flex-col gap-2"><span className="label">ยืนยันรหัสผ่านใหม่</span>
                    <input className="field" type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} />
                    {pw2 && pw !== pw2 && <span className="text-[13.5px] text-bad">รหัสผ่านไม่ตรงกัน</span>}</label>
                  <ErrorLine>{err}</ErrorLine>
                  <button className="btn btn-primary w-full" disabled={busy || code.length !== 6 || pw.length < 10 || !/[A-Za-z]/.test(pw) || !/\d/.test(pw) || pw !== pw2}>{busy && <Spinner className="h-5 w-5" />}บันทึกรหัสผ่านใหม่</button>
                  <button type="button" disabled={cool > 0 || busy} onClick={() => send()} className="border-0 bg-transparent p-1 text-[14px] font-semibold text-bird disabled:text-faint">{cool > 0 ? `ขอรหัสใหม่ได้ใน ${cool} วินาที` : 'ส่งรหัสอีกครั้ง'}</button>
                </form>
              )}
              {step === 'done' && (
                <div className="flex flex-col items-center gap-4 py-2 text-center">
                  <CheckCircle2 size={52} className="text-ok" />
                  <h1 className="m-0 text-[22px] font-bold text-navy">ตั้งรหัสผ่านใหม่แล้ว</h1>
                  <p className="m-0 text-[14.5px] text-muted">ทุกอุปกรณ์ที่เคยเข้าสู่ระบบถูกออกจากระบบแล้ว เข้าสู่ระบบด้วยรหัสผ่านใหม่ได้เลย</p>
                  <Link to="/login" className="btn btn-primary w-full no-underline">ไปหน้าเข้าสู่ระบบ</Link>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
        {step !== 'done' && <p className="m-0 text-center text-[13.5px] text-faint"><Link to="/login" className="font-semibold text-bird">กลับไปเข้าสู่ระบบ</Link></p>}
      </div>
    </Screen>
  )
}
