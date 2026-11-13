import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { ChatMessageDto } from '@shared/types'
import { api, type AppState, type Me } from './api'

interface SessionCtx {
  me: Me | null
  loading: boolean
  refreshMe: () => Promise<Me | null>
  logout: () => Promise<void>
}
const Ctx = createContext<SessionCtx>(null as unknown as SessionCtx)
export const useSession = () => useContext(Ctx)

export function SessionProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null)
  const [loading, setLoading] = useState(true)
  const refreshMe = useCallback(async () => {
    try {
      const m = await api.get<Me>('/auth/me')
      setMe(m)
      return m
    } catch {
      setMe({ user: null, ai: { configured: false, model: '' } })
      return null
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => void refreshMe(), [refreshMe])
  const logout = useCallback(async () => {
    await api.post('/auth/logout').catch(() => undefined)
    await refreshMe()
  }, [refreshMe])
  const v = useMemo(() => ({ me, loading, refreshMe, logout }), [me, loading, refreshMe, logout])
  return <Ctx.Provider value={v}>{children}</Ctx.Provider>
}

/** The signed-in partner's application (profile, services, documents, chat). */
interface AppCtx extends AppState {
  messages: ChatMessageDto[]
  apply: (r: Partial<AppState>) => void
  reload: () => Promise<void>
}
const AppContext = createContext<AppCtx>(null as unknown as AppCtx)
export const useApp = () => useContext(AppContext)

export function AppProvider({ children }: { children: (ready: boolean) => ReactNode }) {
  const [state, setState] = useState<AppState & { messages: ChatMessageDto[] } | null>(null)
  const reload = useCallback(async () => {
    const r = await api.get<AppState>('/app')
    setState({ app: r.app, messages: r.messages ?? [], blockers: r.blockers })
  }, [])
  const apply = useCallback((r: Partial<AppState>) => {
    setState((s) => (s ? { app: r.app ?? s.app, messages: r.messages ?? s.messages, blockers: r.blockers ?? s.blockers } : s))
  }, [])
  useEffect(() => void reload().catch(() => undefined), [reload])
  if (!state) return <>{children(false)}</>
  return <AppContext.Provider value={{ ...state, apply, reload }}>{children(true)}</AppContext.Provider>
}
