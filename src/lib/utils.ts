import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

export function formatNumber(num: number): string {
  return new Intl.NumberFormat('en-US').format(num)
}

export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat('es-ES', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(date))
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

export function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str
  return str.slice(0, maxLen) + '…'
}

/** Pay per 1000 streams (RPMY-style) */
export function ratePerK(earnings: number, streams: number): number {
  if (!streams || streams === 0) return 0
  return (earnings / streams) * 1000
}

/** Pay per 100 streams */
export function ratePer100(earnings: number, streams: number): number {
  if (!streams || streams === 0) return 0
  return (earnings / streams) * 100
}

export function formatRate(rate: number): string {
  if (rate === 0) return '—'
  return `$${rate.toFixed(4)}`
}

export const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000 // 30 minutes
