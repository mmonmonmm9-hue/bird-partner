import { AnimatePresence, motion } from 'framer-motion'
import { FileText, LogOut, MessageCircle, ClipboardCheck } from 'lucide-react'
import { NavLink, useLocation, useOutlet } from 'react-router-dom'
import { AppProvider, useApp, useSession } from '../lib/session'
import { Logo, Orb, ProgressBar, Screen, StatusPill, cn } from '../components/ui'

export function AppLayout() {
  return (
    <AppProvider>
      {(ready) => (ready ? <Shell /> : <Screen className="grid place-items-center"><Orb size={54} /></Screen>)}
    </AppProvider>
  )
}

function Shell() {
  const { app } = useApp()
  const { logout, me } = useSession()
  const loc = useLocation()
  const outlet = useOutlet() // captured per route so the old page stays visible while it animates out
  const tabs = [
    { to: '/app/chat', label: 'สนทนา', icon: MessageCircle, pct: Math.round((app.progress.profile + app.progress.services) / 2) },
    { to: '/app/docs', label: 'เอกสาร', icon: FileText, pct: app.progress.docs },
    { to: '/app/review', label: 'ตรวจสอบและส่ง', icon: ClipboardCheck, pct: app.status === 'draft' || app.status === 'needs_info' ? 0 : 100 },
  ]
  const isChat = loc.pathname.endsWith('/chat')
  return (
    <Screen className={cn(isChat && 'h-dvh overflow-hidden')}>
      <div className={cn('mx-auto flex w-full max-w-[1120px] flex-col', isChat ? 'h-dvh' : 'min-h-dvh')}>
        <header className="sticky top-0 z-20 flex flex-col gap-3 border-b border-[rgba(17,80,173,0.12)] bg-white/80 px-4 pb-3 pt-3 backdrop-blur-xl sm:px-6">
          <div className="flex items-center gap-3">
            <Logo size={0.8} />
            <span className="ml-auto hidden text-[13px] text-faint sm:inline">{me?.user?.email}</span>
            <StatusPill status={app.status} />
            <button onClick={() => void logout()} className="btn btn-ghost btn-sm" aria-label="ออกจากระบบ"><LogOut size={15} /><span className="hidden sm:inline">ออกจากระบบ</span></button>
          </div>
          <nav className="grid grid-cols-3 gap-2" aria-label="ขั้นตอนการสมัคร">
            {tabs.map((t) => (
              <NavLink key={t.to} to={t.to} className={({ isActive }) => cn('flex flex-col gap-1.5 rounded-2xl px-3 py-2 no-underline transition', isActive ? 'bg-[rgba(77,141,255,0.1)]' : 'hover:bg-[rgba(17,80,173,0.05)]')}>
                {({ isActive }) => (
                  <>
                    <span className={cn('flex items-center gap-2 text-[13.5px] font-semibold', isActive ? 'text-bird' : 'text-muted')}><t.icon size={16} /> <span className="truncate">{t.label}</span></span>
                    <ProgressBar value={t.pct} tone={t.pct === 100 ? 'ok' : 'brand'} />
                  </>
                )}
              </NavLink>
            ))}
          </nav>
        </header>
        <div className="relative flex min-h-0 flex-1 flex-col">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={loc.pathname}
              className="flex min-h-0 flex-1 flex-col"
              initial={{ opacity: 0, y: 18, filter: 'blur(8px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, y: -10, filter: 'blur(6px)' }}
              transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
            >
              {outlet}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </Screen>
  )
}
