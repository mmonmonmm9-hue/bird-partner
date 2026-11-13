import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { api, ApiError } from '../lib/api'
import { useSession } from '../lib/session'
import { ErrorLine, Logo, Screen, Spinner } from '../components/ui'

export function Login() {
  const nav = useNavigate()
  const { me, refreshMe } = useSession()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string>()

  if (me?.user) return <Navigate to={me.user.role === 'admin' ? '/admin' : '/app/chat'} replace />

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setErr(undefined)
    try {
      const r = await api.post<{ role: 'partner' | 'admin' }>('/auth/login', { email, password })
      await refreshMe()
      nav(r.role === 'admin' ? '/admin' : '/app/chat', { replace: true })
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'เข้าสู่ระบบไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen>
      <div className="mx-auto flex min-h-dvh w-full max-w-[460px] flex-col justify-center gap-6 px-4 py-10">
        <Link to="/" className="self-start no-underline"><Logo /></Link>
        <form onSubmit={submit} className="glass flex flex-col gap-5 rounded-[28px] p-6 sm:p-7" noValidate>
          <div className="flex flex-col gap-1.5">
            <h1 className="m-0 text-[26px] font-bold text-navy">เข้าสู่ระบบ</h1>
            <p className="m-0 text-[14.5px] text-muted">สำหรับพาร์ทเนอร์ที่สมัครแล้ว และเจ้าหน้าที่ Bird</p>
          </div>
          <label className="flex flex-col gap-2"><span className="label">อีเมล</span>
            <input className="field" type="email" autoComplete="username" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} /></label>
          <label className="flex flex-col gap-2"><span className="label">รหัสผ่าน</span>
            <input className="field" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
          <ErrorLine>{err}</ErrorLine>
          <button className="btn btn-primary w-full" disabled={busy || !email || !password}>{busy && <Spinner className="h-5 w-5" />}เข้าสู่ระบบ</button>
          <Link to="/forgot" className="text-center text-[14px] font-semibold text-bird no-underline">ลืมรหัสผ่าน?</Link>
        </form>
        <p className="m-0 text-center text-[13.5px] text-faint">ยังไม่มีบัญชี? <Link to="/" className="font-semibold text-bird">เริ่มสมัครพาร์ทเนอร์</Link></p>
      </div>
    </Screen>
  )
}
