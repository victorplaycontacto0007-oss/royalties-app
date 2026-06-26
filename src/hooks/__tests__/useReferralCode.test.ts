// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useReferralCode, clearReferralCode, captureReferralCodeFromURL } from '../useReferralCode'

// Mock supabase
vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: { referral_code: 'VALID123', is_active: true },
              error: null,
            }),
          }),
        }),
      }),
    }),
  },
}))

const STORAGE_KEY = 'referral_code'

describe('useReferralCode', () => {
  beforeEach(() => {
    sessionStorage.clear()
    // Reset URL
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { search: '', href: 'http://localhost/' },
    })
  })

  it('returns null when no code in sessionStorage', () => {
    expect(useReferralCode()).toBeNull()
  })

  it('returns stored code when present', () => {
    sessionStorage.setItem(STORAGE_KEY, 'ABC123')
    expect(useReferralCode()).toBe('ABC123')
  })

  it('clearReferralCode removes the code', () => {
    sessionStorage.setItem(STORAGE_KEY, 'ABC123')
    clearReferralCode()
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it('captureReferralCodeFromURL stores valid code from ?ref= param', async () => {
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { search: '?ref=VALID123', href: 'http://localhost/?ref=VALID123' },
    })
    await captureReferralCodeFromURL()
    expect(sessionStorage.getItem(STORAGE_KEY)).toBe('VALID123')
  })

  it('captureReferralCodeFromURL does nothing when no ?ref= param', async () => {
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { search: '', href: 'http://localhost/' },
    })
    await captureReferralCodeFromURL()
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull()
  })
})
