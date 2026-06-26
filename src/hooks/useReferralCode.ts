import { supabase } from '../lib/supabase'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

const STORAGE_KEY = 'referral_code'

/**
 * Returns the referral code currently stored in sessionStorage, or null.
 */
export function useReferralCode(): string | null {
  return sessionStorage.getItem(STORAGE_KEY)
}

/**
 * Reads `?ref=CODE` from the current URL, validates it against the
 * `referral_links` table in Supabase, and stores it in sessionStorage
 * if valid and active. Invalid or expired codes are silently ignored.
 */
export async function captureReferralCodeFromURL(): Promise<void> {
  const params = new URLSearchParams(window.location.search)
  const code = params.get('ref')
  if (!code) return

  try {
    const { data, error } = await db
      .from('referral_links')
      .select('referral_code, is_active')
      .eq('referral_code', code)
      .eq('is_active', true)
      .maybeSingle()

    if (error || !data) return

    sessionStorage.setItem(STORAGE_KEY, data.referral_code as string)
  } catch {
    // Silently ignore network / unexpected errors
  }
}

/**
 * Removes the referral code from sessionStorage.
 */
export function clearReferralCode(): void {
  sessionStorage.removeItem(STORAGE_KEY)
}
