// ── Domain types for the Referral System ──────────────────

export type CommissionStatus = 'Pendiente' | 'Aprobada' | 'Pagada' | 'Rechazada' | 'Cancelada'
export type PaymentMethod    = 'PayPal' | 'Bold' | 'Transferencia' | 'Otro'

export interface ProfileSnippet {
  id:        string
  full_name: string | null
  email:     string
}

export interface Commission {
  id:                    string
  affiliate_id:          string
  buyer_id:              string
  purchase_amount_usd:   number
  commission_percentage: number
  commission_amount:     number
  status:                CommissionStatus
  payment_method:        PaymentMethod
  paypal_order_id:       string | null
  admin_id:              string | null
  notes:                 string | null
  paid_at:               string | null
  payment_proof:         string | null
  payment_notes:         string | null
  created_at:            string
  updated_at:            string
  // optional joins
  affiliate?: ProfileSnippet
  buyer?:     ProfileSnippet
}

export interface CommissionHistory {
  id:            string
  commission_id: string
  admin_id:      string
  changed_at:    string
  ip_address:    string | null   // never exposed to non-admins
  action:        string
  field_changed: string | null
  old_value:     string | null
  new_value:     string | null
  reason:        string | null
  // optional join
  admin?: ProfileSnippet
}

export interface AffiliateBalance {
  affiliate_id:     string
  available_balance: number
  updated_at:       string
}

export interface ReferralLink {
  id:            string
  affiliate_id:  string
  referral_code: string
  created_at:    string
  is_active:     boolean
}

export interface CommissionFilters {
  buyerSearch?:    string
  affiliateSearch?: string
  status?:         CommissionStatus | ''
  page?:           number
  pageSize?:       number
}

// Form payload for manual commission creation
export interface CreateCommissionPayload {
  affiliate_id:          string
  buyer_id:              string
  purchase_amount_usd:   number
  commission_percentage: number
  commission_amount:     number
  payment_method:        PaymentMethod
  notes?:                string
}

// Form payload for editing a commission
export interface UpdateCommissionPayload {
  purchase_amount_usd?:   number
  commission_percentage?: number
  commission_amount?:     number
  status?:               CommissionStatus
  notes?:                string
  paid_at?:              string
  payment_proof?:        string
  payment_notes?:        string
}

// Payload for marking a commission as paid
export interface MarkPaidPayload {
  paid_at:       string
  payment_method: PaymentMethod
  payment_proof?: string
  payment_notes?: string
}
