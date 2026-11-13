import { AnimatePresence, motion } from 'framer-motion'
import { Navigate, Route, Routes, useLocation, type Location } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useSession } from './lib/session'
import { Orb, Screen } from './components/ui'
import { Gate } from './pages/Gate'
import { Signup } from './pages/Signup'
import { Login } from './pages/Login'
import { Forgot } from './pages/Forgot'
import { AppLayout } from './pages/AppLayout'
import { Chat } from './pages/Chat'
import { Docs } from './pages/Docs'
import { Review } from './pages/Review'
import { AdminList, AdminDetail } from './pages/Admin'

/** Smooth, slightly blurred slide between pages (disabled automatically for reduced-motion users). */
export function Fx({ children, k }: { children: ReactNode; k: string }) {
  return (
    <motion.div
      key={k}
      initial={{ opacity: 0, y: 18, filter: 'blur(8px)' }}
      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      exit={{ opacity: 0, y: -12, filter: 'blur(6px)' }}
      transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  )
}

function Splash() {
  return (
    <Screen className="grid place-items-center">
      <Orb size={54} />
    </Screen>
  )
}

function RequireRole({ role, children }: { role: 'partner' | 'admin'; children: ReactNode }) {
  const { me, loading } = useSession()
  if (loading) return <Splash />
  if (!me?.user) return <Navigate to="/login" replace />
  if (me.user.role !== role) return <Navigate to={me.user.role === 'admin' ? '/admin' : '/app/chat'} replace />
  return <>{children}</>
}

function Routed({ location }: { location: Location }) {
  return (
    <Routes location={location}>
      <Route path="/" element={<Fx k="gate"><Gate /></Fx>} />
      <Route path="/start/:type" element={<Fx k="signup"><Signup /></Fx>} />
      <Route path="/login" element={<Fx k="login"><Login /></Fx>} />
      <Route path="/forgot" element={<Fx k="forgot"><Forgot /></Fx>} />
      <Route path="/app/*" element={<RequireRole role="partner"><AppLayout /></RequireRole>}>
        <Route path="chat" element={<Chat />} />
        <Route path="docs" element={<Docs />} />
        <Route path="review" element={<Review />} />
        <Route path="*" element={<Navigate to="/app/chat" replace />} />
      </Route>
      <Route path="/admin" element={<RequireRole role="admin"><Fx k="admin"><AdminList /></Fx></RequireRole>} />
      <Route path="/admin/:id" element={<RequireRole role="admin"><Fx k="admin-detail"><AdminDetail /></Fx></RequireRole>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export function App() {
  const location = useLocation()
  const { loading } = useSession()
  if (loading) return <Splash />
  // /app/* keeps its own header and animates only the inner page, so the top-level key is the first path segment
  const top = location.pathname.split('/')[1] || 'home'
  const key = top === 'admin' ? location.pathname : top
  return (
    <AnimatePresence mode="wait" initial={false}>
      <Routed key={key} location={location} />
    </AnimatePresence>
  )
}
