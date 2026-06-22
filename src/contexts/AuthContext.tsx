import React, { createContext, useContext, useEffect, useRef, useState } from 'react'
import type { User, Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { Profile, Subscription } from '../types/database'
import { INACTIVITY_TIMEOUT_MS } from '../lib/utils'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

interface AuthContextType {
  user: User | null
  session: Session | null
  profile: Profile | null
  subscription: Subscription | null
  hasActiveSubscription: boolean
  loading: boolean
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  resetPassword: (email: string) => Promise<void>
  refreshSubscription: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser]               = useState<User | null>(null)
  const [session, setSession]         = useState<Session | null>(null)
  const [profile, setProfile]         = useState<Profile | null>(null)
  const [subscription, setSubscription] = useState<Subscription | null>(null)
  const [loading, setLoading]         = useState(true)
  const inactivityTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const resetInactivityTimer = () => {
    if (inactivityTimer.current) clearTimeout(inactivityTimer.current)
    inactivityTimer.current = setTimeout(() => {
      supabase.auth.signOut()
    }, INACTIVITY_TIMEOUT_MS)
  }

  const fetchProfile = async (userId: string) => {
    try {
      const { data, error } = await db
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single()
      if (error) {
        if (error.code === 'PGRST116') {
          const { data: userData } = await supabase.auth.getUser()
          if (userData.user) {
            const newProfile = {
              id: userId,
              email: userData.user.email ?? '',
              full_name: userData.user.user_metadata?.full_name ?? null,
              role: 'user' as const,
              is_active: true,
            }
            const { data: created } = await db.from('profiles').insert(newProfile).select().single()
            if (created) setProfile(created as Profile)
          }
        }
        return
      }
      if (data) setProfile(data as Profile)
    } catch (e) {
      console.error('fetchProfile exception:', e)
    }
  }

  const fetchSubscription = async (userId: string) => {
    try {
      const { data } = await db
        .from('subscriptions')
        .select('*')
        .eq('user_id', userId)
        .eq('status', 'active')
        .gt('expires_at', new Date().toISOString())
        .order('expires_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      setSubscription(data as Subscription | null)
    } catch (e) {
      console.error('fetchSubscription exception:', e)
      setSubscription(null)
    }
  }

  const refreshSubscription = async () => {
    if (user) await fetchSubscription(user.id)
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)
      if (session?.user) {
        Promise.all([
          fetchProfile(session.user.id),
          fetchSubscription(session.user.id),
        ]).finally(() => setLoading(false))
      } else {
        setLoading(false)
      }
    })

    const { data: { subscription: authSub } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      setUser(session?.user ?? null)
      if (session?.user) {
        Promise.all([
          fetchProfile(session.user.id),
          fetchSubscription(session.user.id),
        ]).finally(() => setLoading(false))
        resetInactivityTimer()
      } else {
        setProfile(null)
        setSubscription(null)
        if (inactivityTimer.current) clearTimeout(inactivityTimer.current)
        setLoading(false)
      }
    })

    return () => authSub.unsubscribe()
  }, [])

  useEffect(() => {
    if (!user) return
    const events = ['mousedown', 'keydown', 'scroll', 'touchstart']
    events.forEach(e => window.addEventListener(e, resetInactivityTimer))
    resetInactivityTimer()
    return () => {
      events.forEach(e => window.removeEventListener(e, resetInactivityTimer))
      if (inactivityTimer.current) clearTimeout(inactivityTimer.current)
    }
  }, [user])

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
  }

  const signOut = async () => {
    await supabase.auth.signOut()
  }

  const resetPassword = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    if (error) throw error
  }

  const hasActiveSubscription = !!subscription

  return (
    <AuthContext.Provider value={{
      user, session, profile, subscription, hasActiveSubscription,
      loading, signIn, signOut, resetPassword, refreshSubscription,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
