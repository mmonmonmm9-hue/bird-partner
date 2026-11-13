import { motion } from 'framer-motion'
import { ArrowRight } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { Logo, Screen } from '../components/ui'
import { useSession } from '../lib/session'

const ease = [0.22, 1, 0.36, 1] as const
const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.12, delayChildren: 0.1 } } }
const rise = { hidden: { opacity: 0, y: 26 }, show: { opacity: 1, y: 0, transition: { duration: 0.8, ease } } }

function PersonIcon() {
  return (
    <svg viewBox="0 0 48 48" className="h-[52px] w-[52px] sm:h-[68px] sm:w-[68px]" fill="none" aria-hidden>
      <defs><linearGradient id="gp" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fff" /><stop offset="1" stopColor="#c3e2ff" /></linearGradient></defs>
      <circle cx="24" cy="17" r="7.6" fill="url(#gp)" />
      <path d="M9.5 41c0-8.2 6.4-14 14.5-14s14.5 5.8 14.5 14" fill="url(#gp)" />
      <path d="M5.5 24A19.5 19.5 0 0 1 14 8.5" stroke="#9ff1ff" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M42.5 24a19.5 19.5 0 0 1-8 15.5" stroke="#9ff1ff" strokeWidth="2.4" strokeLinecap="round" opacity=".55" />
      <path d="M39 6.5l1.4 3.1 3.1 1.4-3.1 1.4L39 15.5l-1.4-3.1-3.1-1.4 3.1-1.4z" fill="#d6fbff" />
      <circle cx="24" cy="17" r="2.2" fill="#4d8dff" opacity=".35" />
    </svg>
  )
}

function BuildingIcon() {
  return (
    <svg viewBox="0 0 48 48" className="h-[52px] w-[52px] sm:h-[68px] sm:w-[68px]" fill="none" aria-hidden>
      <defs><linearGradient id="gb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fff" /><stop offset="1" stopColor="#c3e2ff" /></linearGradient></defs>
      <rect x="8.5" y="8" width="19" height="32" rx="3.2" fill="url(#gb)" />
      <rect x="27.5" y="19" width="12.5" height="21" rx="3" fill="url(#gb)" opacity=".88" />
      <g fill="#4d8dff">
        <rect x="13" y="13" width="4" height="4" rx="1" /><rect x="19.5" y="13" width="4" height="4" rx="1" fill="#6fe3f0" />
        <rect x="13" y="20" width="4" height="4" rx="1" fill="#6fe3f0" /><rect x="19.5" y="20" width="4" height="4" rx="1" />
        <rect x="13" y="27" width="4" height="4" rx="1" /><rect x="19.5" y="27" width="4" height="4" rx="1" fill="#6fe3f0" />
        <rect x="31.5" y="24" width="3.6" height="3.6" rx="1" fill="#6fe3f0" /><rect x="31.5" y="31" width="3.6" height="3.6" rx="1" />
      </g>
      <path d="M5 42.5h38" stroke="#9ff1ff" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M39.5 5.5l1.3 2.9 2.9 1.3-2.9 1.3-1.3 2.9-1.3-2.9-2.9-1.3 2.9-1.3z" fill="#d6fbff" />
    </svg>
  )
}

function ChoiceCard({ to, icon, title, sub }: { to: string; icon: React.ReactNode; title: string; sub: string }) {
  return (
    <motion.div variants={rise} whileHover={{ y: -6 }} transition={{ type: 'spring', stiffness: 300, damping: 22 }} className="w-full sm:w-[410px]">
      <Link
        to={to}
        className="group block rounded-[34px] bg-gradient-to-br from-[#4d8dff]/90 via-[#6fe3f0]/90 to-[#1150ad]/50 p-[1.5px] no-underline shadow-[0_34px_60px_-34px_rgba(17,80,173,0.55),0_0_0_6px_rgba(255,255,255,0.45)] transition-shadow duration-300 hover:shadow-[0_44px_70px_-30px_rgba(17,80,173,0.7),0_0_0_6px_rgba(255,255,255,0.55)]"
      >
        <span className="flex items-center gap-5 rounded-[32.5px] bg-white p-5 sm:gap-6 sm:p-[30px]">
          <span className="ic-tile group-hover:scale-105">{icon}</span>
          <span className="flex min-w-0 flex-1 flex-col text-left leading-tight">
            <span className="text-[22px] font-bold text-navy sm:text-[27px]">{title}</span>
            <span className="mt-1.5 text-[14px] text-muted sm:text-[15px]">{sub}</span>
          </span>
          <span className="grid h-10 w-10 flex-none place-items-center rounded-full bg-[rgba(17,80,173,0.07)] text-bird transition group-hover:bg-bird group-hover:text-white"><ArrowRight size={19} /></span>
        </span>
      </Link>
    </motion.div>
  )
}

export function Gate() {
  const nav = useNavigate()
  const { me } = useSession()
  const go = () => (me?.user ? nav(me.user.role === 'admin' ? '/admin' : '/app/chat') : nav('/login'))
  const loginLabel = me?.user ? 'กลับไปที่ใบสมัคร' : 'เข้าสู่ระบบ'

  return (
    <Screen className="relative overflow-hidden">
      {/* background: soft mesh + fading dot grid */}
      <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(60% 55% at 78% 6%, rgba(77,141,255,.30), transparent 65%), radial-gradient(55% 55% at 10% 96%, rgba(111,227,240,.34), transparent 65%), radial-gradient(45% 45% at 50% 34%, rgba(180,205,255,.30), transparent 70%)' }} />
      <div aria-hidden className="pointer-events-none absolute inset-0" style={{ backgroundImage: 'radial-gradient(rgba(17,80,173,.22) 1px, transparent 1.4px)', backgroundSize: '28px 28px', WebkitMaskImage: 'radial-gradient(ellipse 60% 55% at 50% 40%, #000, transparent 75%)', maskImage: 'radial-gradient(ellipse 60% 55% at 50% 40%, #000, transparent 75%)' }} />

      <div className="relative z-10 mx-auto flex min-h-dvh max-w-[1240px] flex-col px-5 sm:px-10">
        <header className="flex items-center justify-between py-5 sm:py-7">
          <Link to="/" aria-label="Bird Partner" className="no-underline">
            <span className="sm:hidden"><Logo size={1.2} /></span>
            <span className="hidden sm:inline-flex"><Logo size={1.75} /></span>
          </Link>
          <button onClick={go} className="rounded-full border border-[rgba(17,80,173,0.14)] bg-white/75 px-6 py-3 text-[16px] font-semibold text-navy shadow-[0_14px_30px_-22px_rgba(16,45,116,0.4)] backdrop-blur-xl transition hover:-translate-y-0.5 hover:bg-white sm:px-9 sm:py-4 sm:text-[19px]">
            {loginLabel}
          </button>
        </header>

        <motion.main variants={stagger} initial="hidden" animate="show" className="flex flex-1 flex-col items-center justify-center pb-12 text-center">
          <motion.div variants={rise} className="relative grid h-[150px] w-[260px] place-items-center sm:h-[190px] sm:w-[320px]" aria-hidden>
            <div className="absolute h-[330px] w-[330px] rounded-full sm:h-[410px] sm:w-[410px]" style={{ background: 'radial-gradient(circle, rgba(111,227,240,.34), rgba(77,141,255,.14) 45%, transparent 68%)' }} />
            <img src="/wings.png" alt="" draggable={false} className="float-y relative w-[230px] drop-shadow-[0_26px_34px_rgba(77,141,255,0.35)] sm:w-[290px]" />
            <span className="twinkle absolute left-[58%] top-0 h-2.5 w-2.5 rounded-full bg-[#6fe3f0] shadow-[0_0_16px_#6fe3f0]" />
            <span className="twinkle absolute -right-3 top-[42%] h-1.5 w-1.5 rounded-full bg-[#4d8dff] shadow-[0_0_12px_#4d8dff]" style={{ animationDelay: '.9s' }} />
            <span className="twinkle absolute -left-4 bottom-[10%] h-1.5 w-1.5 rounded-full bg-[#4d8dff] shadow-[0_0_12px_#4d8dff]" style={{ animationDelay: '1.7s' }} />
          </motion.div>

          <motion.h1 variants={rise} className="m-0 mt-4 bg-gradient-to-r from-[#0f2a63] via-[#1d63e0] to-[#0b8fae] bg-clip-text text-[26px] font-bold leading-[1.25] min-[420px]:text-[30px] tracking-tight text-transparent sm:mt-5 sm:text-[48px]">
            สมัครเป็นพาร์ทเนอร์กับ Bird<br />ด้วยการคุยเพียงครั้งเดียว
          </motion.h1>
          <motion.p variants={rise} className="m-0 mb-8 mt-3 text-[16px] text-muted sm:mb-10 sm:text-[18px]">เลือกประเภทผู้สมัครเพื่อเริ่มต้น</motion.p>

          <div className="flex w-full flex-col items-center gap-5 sm:w-auto sm:flex-row sm:gap-7">
            <ChoiceCard to="/start/individual" icon={<PersonIcon />} title="บุคคลธรรมดา" sub="ใช้เลขบัตรประชาชน" />
            <ChoiceCard to="/start/business" icon={<BuildingIcon />} title="นิติบุคคล" sub="ใช้เลขทะเบียนนิติบุคคล" />
          </div>

          <motion.p variants={rise} className="m-0 mt-8 text-[16px] text-faint sm:text-[17px]">
            มีบัญชีแล้ว? <Link to="/login" className="font-semibold text-bird">เข้าสู่ระบบ</Link>
          </motion.p>
        </motion.main>
      </div>
    </Screen>
  )
}
