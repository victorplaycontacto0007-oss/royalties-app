import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type {
  Commission, CommissionFilters,
  CreateCommissionPayload, UpdateCommissionPayload, MarkPaidPayload,
} from '../types/referrals'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

const PAGE_SIZE = 20

// ── Query key factory ──────────────────────────────────────
export const commissionKeys = {
  all:    () => ['commissions'] as const,
  list:   (f: CommissionFilters) => ['commissions', 'list', f] as const,
  detail: (id: string)           => ['commissions', 'detail', id] as const,
}

// ── useCommissions ─────────────────────────────────────────
export function useCommissions(filters: CommissionFilters = {}) {
  const { buyerSearch, affiliateSearch, status, page = 1, pageSize = PAGE_SIZE } = filters
  const from = (page - 1) * pageSize
  const to   = from + pageSize - 1

  return useQuery<Commission[]>({
    queryKey: commissionKeys.list(filters),
    queryFn: async () => {
      let q = db
        .from('commissions')
        .select(`
          *,
          affiliate:profiles!commissions_affiliate_id_fkey(id, full_name, email),
          buyer:profiles!commissions_buyer_id_fkey(id, full_name, email)
        `)
        .order('created_at', { ascending: false })
        .range(from, to)

      if (status) q = q.eq('status', status)

      const { data, error } = await q

      if (error) throw new Error(error.message)

      // Client-side search filter (ilike equivalent)
      let result: Commission[] = (data ?? []) as Commission[]

      if (buyerSearch?.trim()) {
        const term = buyerSearch.trim().toLowerCase()
        result = result.filter(c =>
          c.buyer?.full_name?.toLowerCase().includes(term) ||
          c.buyer?.email?.toLowerCase().includes(term)
        )
      }

      if (affiliateSearch?.trim()) {
        const term = affiliateSearch.trim().toLowerCase()
        result = result.filter(c =>
          c.affiliate?.full_name?.toLowerCase().includes(term) ||
          c.affiliate?.email?.toLowerCase().includes(term)
        )
      }

      return result
    },
  })
}

// ── useAffiliateCommissions ────────────────────────────────
// For the affiliate-facing view — only their own commissions
export function useAffiliateCommissions(affiliateId: string | undefined) {
  return useQuery<Commission[]>({
    queryKey: ['commissions', 'affiliate', affiliateId],
    enabled: !!affiliateId,
    queryFn: async () => {
      const { data, error } = await db
        .from('commissions')
        .select('*')
        .eq('affiliate_id', affiliateId)
        .order('created_at', { ascending: false })
      if (error) throw new Error(error.message)
      return (data ?? []) as Commission[]
    },
  })
}

// ── useCreateCommission ────────────────────────────────────
export function useCreateCommission() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: CreateCommissionPayload) => {
      const { data, error } = await db
        .from('commissions')
        .insert({ ...payload, status: 'Pendiente' })
        .select()
        .single()
      if (error) throw new Error(error.message)
      return data as Commission
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: commissionKeys.all() }),
  })
}

// ── useUpdateCommission ────────────────────────────────────
export function useUpdateCommission() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: UpdateCommissionPayload }) => {
      const { data, error } = await db
        .from('commissions')
        .update(payload)
        .eq('id', id)
        .select()
        .single()
      if (error) throw new Error(error.message)
      return data as Commission
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: commissionKeys.all() }),
  })
}

// ── useDeleteCommission ────────────────────────────────────
export function useDeleteCommission() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db
        .from('commissions')
        .delete()
        .eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: commissionKeys.all() }),
  })
}

// ── useApproveCommission ───────────────────────────────────
export function useApproveCommission() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, adminId, ip }: { id: string; adminId: string; ip?: string }) => {
      const { error } = await db.rpc('approve_commission', {
        p_commission_id: id,
        p_admin_id:      adminId,
        p_ip:            ip ?? null,
      })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: commissionKeys.all() }),
  })
}

// ── useRejectCommission ────────────────────────────────────
export function useRejectCommission() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id, adminId, ip, reason,
    }: { id: string; adminId: string; ip?: string; reason?: string }) => {
      const { error } = await db.rpc('reverse_commission_approval', {
        p_commission_id: id,
        p_admin_id:      adminId,
        p_new_status:    'Rechazada',
        p_reason:        reason ?? null,
        p_ip:            ip ?? null,
      })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: commissionKeys.all() }),
  })
}

// ── useCancelCommission ────────────────────────────────────
export function useCancelCommission() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id, adminId, ip, reason,
    }: { id: string; adminId: string; ip?: string; reason?: string }) => {
      const { error } = await db.rpc('reverse_commission_approval', {
        p_commission_id: id,
        p_admin_id:      adminId,
        p_new_status:    'Cancelada',
        p_reason:        reason ?? null,
        p_ip:            ip ?? null,
      })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: commissionKeys.all() }),
  })
}

// ── useMarkCommissionPaid ──────────────────────────────────
export function useMarkCommissionPaid() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: MarkPaidPayload }) => {
      const { data, error } = await db
        .from('commissions')
        .update({ status: 'Pagada', ...payload })
        .eq('id', id)
        .select()
        .single()
      if (error) throw new Error(error.message)
      return data as Commission
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: commissionKeys.all() }),
  })
}
