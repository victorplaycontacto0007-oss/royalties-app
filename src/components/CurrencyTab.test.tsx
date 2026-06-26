/**
 * CurrencyTab.test.tsx
 *
 * Unit tests for the CurrencyTab component.
 * Uses @testing-library/react with vi.fn() for handlers.
 *
 * Requirements: 7.1, 7.2, 7.4, 7.5, 8.7, 8.8
 */
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import CurrencyTab from './CurrencyTab'
import type { CurrencyGroup } from '../royalty-engine/CurrencyGrouper'
import type { ConversionResult } from '../royalty-engine/CurrencyConverter'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeGroup(currency: string, total: number, percentage: number, recordCount = 10): CurrencyGroup {
  return {
    currency,
    total,
    totalFixed8: total.toFixed(8),
    recordCount,
    percentage,
  }
}

const DEFAULT_PROPS = {
  groups: [] as CurrencyGroup[],
  onConvert: vi.fn(() => Promise.resolve()),
  converting: false,
  conversionResult: null,
  conversionError: null,
}

// Cleanup the DOM after each test to prevent element accumulation
afterEach(() => {
  cleanup()
})

// ---------------------------------------------------------------------------
// Test 1: empty state — Requirement 7.4
// ---------------------------------------------------------------------------

describe('CurrencyTab — empty state', () => {
  it('renders the empty-state message when groups is an empty array', () => {
    render(<CurrencyTab {...DEFAULT_PROPS} groups={[]} />)

    expect(
      screen.getByText('No se encontraron datos de monedas para este reporte.'),
    ).toBeInTheDocument()
  })

  it('does NOT render any currency cards when groups is empty', () => {
    const { container } = render(<CurrencyTab {...DEFAULT_PROPS} groups={[]} />)

    // No badge-primary badges should be present
    expect(container.querySelectorAll('.badge-primary')).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Test 2: card rendering — Requirement 7.2
// ---------------------------------------------------------------------------

describe('CurrencyTab — card rendering with valid groups', () => {
  it('renders one card per currency group', () => {
    const groups = [
      makeGroup('USD', 1000.5, 75.5, 300),
      makeGroup('EUR', 324.25, 24.5, 120),
    ]

    const { container } = render(<CurrencyTab {...DEFAULT_PROPS} groups={groups} />)

    // Both currency codes appear as badges in the card grid
    const badges = container.querySelectorAll('.badge-primary')
    const badgeTexts = Array.from(badges).map(b => b.textContent?.trim())
    expect(badgeTexts).toContain('USD')
    expect(badgeTexts).toContain('EUR')
  })

  it('displays total formatted to 2 decimal places for each group', () => {
    const groups = [
      makeGroup('USD', 1000.5, 100, 50),
    ]

    render(<CurrencyTab {...DEFAULT_PROPS} groups={groups} />)

    // 1000.5 → "1000.50"
    expect(screen.getByText('1000.50')).toBeInTheDocument()
  })

  it('displays percentage formatted to 2 decimal places', () => {
    const groups = [
      makeGroup('USD', 1000, 75.5, 50),
      makeGroup('EUR', 333.33, 24.5, 20),
    ]

    render(<CurrencyTab {...DEFAULT_PROPS} groups={groups} />)

    expect(screen.getByText('75.50%')).toBeInTheDocument()
    expect(screen.getByText('24.50%')).toBeInTheDocument()
  })

  it('displays record count for each group', () => {
    const groups = [
      makeGroup('USD', 500, 100, 42),
    ]

    render(<CurrencyTab {...DEFAULT_PROPS} groups={groups} />)

    expect(screen.getByText(/42/)).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Test 3: conversionError display — Requirement 8.7
// ---------------------------------------------------------------------------

describe('CurrencyTab — conversionError', () => {
  it('shows the error message when conversionError is set', () => {
    const errorMsg = 'Error al obtener tasas de cambio (HTTP 429). Intenta de nuevo.'
    const groups = [makeGroup('USD', 500, 100, 10)]

    render(
      <CurrencyTab
        {...DEFAULT_PROPS}
        groups={groups}
        conversionError={errorMsg}
      />,
    )

    expect(screen.getByText(errorMsg)).toBeInTheDocument()
  })

  it('still renders the original currency cards when conversionError is set', () => {
    const errorMsg = 'Error de red al obtener tasas de cambio. Verifica tu conexión.'
    const groups = [
      makeGroup('USD', 1000, 60, 30),
      makeGroup('COP', 666.67, 40, 20),
    ]

    const { container } = render(
      <CurrencyTab
        {...DEFAULT_PROPS}
        groups={groups}
        conversionError={errorMsg}
      />,
    )

    // Error message is visible
    expect(screen.getByText(errorMsg)).toBeInTheDocument()

    // Original cards are still visible — check badges inside the card grid
    const badges = container.querySelectorAll('.badge-primary')
    const badgeTexts = Array.from(badges).map(b => b.textContent?.trim())
    expect(badgeTexts).toContain('USD')
    expect(badgeTexts).toContain('COP')
  })
})

// ---------------------------------------------------------------------------
// Test 4: converting = true disables the button — Requirement 8.8
// ---------------------------------------------------------------------------

describe('CurrencyTab — loading/converting state', () => {
  it('disables the "Convertir Totales" button when converting is true', () => {
    const groups = [makeGroup('USD', 100, 100, 5)]

    render(
      <CurrencyTab
        {...DEFAULT_PROPS}
        groups={groups}
        converting={true}
      />,
    )

    // The button shows "Convirtiendo..." text when loading
    const button = screen.getByRole('button', { name: /convirtiendo/i })
    expect(button).toBeDisabled()
  })

  it('enables the button when converting is false', () => {
    const groups = [makeGroup('USD', 100, 100, 5)]

    render(
      <CurrencyTab
        {...DEFAULT_PROPS}
        groups={groups}
        converting={false}
      />,
    )

    // Use getAllByRole to handle any potential multiple renders, take the first
    const buttons = screen.getAllByRole('button', { name: /convertir totales/i })
    expect(buttons.length).toBeGreaterThan(0)
    expect(buttons[0]).not.toBeDisabled()
  })
})

// ---------------------------------------------------------------------------
// Test 5: successful conversion — converted total and rate — Requirement 7.5
// ---------------------------------------------------------------------------

describe('CurrencyTab — post-conversion display', () => {
  it('displays convertedTotal and exchange rate on cards after a successful conversion', () => {
    const groups = [
      makeGroup('USD', 1000, 100, 50),
    ]

    const conversionResult: ConversionResult = {
      targetCurrency: 'EUR',
      groups: [
        {
          currency: 'USD',
          originalTotal: 1000,
          convertedTotal: 920,
          rate: 0.92,
        },
      ],
    }

    render(
      <CurrencyTab
        {...DEFAULT_PROPS}
        groups={groups}
        conversionResult={conversionResult}
      />,
    )

    // Converted total should be shown (920 → "920.00")
    expect(screen.getByText('920.00')).toBeInTheDocument()

    // Rate should be shown (0.92 → "×0.9200")
    expect(screen.getByText(/×0\.9200/)).toBeInTheDocument()

    // Target currency label shown in the "Convertido a EUR" span
    // Use getAllByText to avoid ambiguity with the select option, then check that
    // at least one of them is inside the "Convertido a" label (not a select option)
    const eurElements = screen.getAllByText('EUR')
    const inConvertedLabel = eurElements.some(el =>
      el.tagName === 'STRONG' && el.className === 'text-text-secondary'
    )
    expect(inConvertedLabel).toBe(true)
  })

  it('shows "Moneda base — tasa 1.0" when the group currency matches the target currency', () => {
    const groups = [
      makeGroup('EUR', 500, 100, 25),
    ]

    const conversionResult: ConversionResult = {
      targetCurrency: 'EUR',
      groups: [
        {
          currency: 'EUR',
          originalTotal: 500,
          convertedTotal: 500,
          rate: 1,
        },
      ],
    }

    render(
      <CurrencyTab
        {...DEFAULT_PROPS}
        groups={groups}
        conversionResult={conversionResult}
      />,
    )

    expect(screen.getByText('Moneda base — tasa 1.0')).toBeInTheDocument()
  })
})
