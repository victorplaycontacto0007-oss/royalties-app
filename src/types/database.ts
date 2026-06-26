export type Json = string | number | boolean | null | { [key: string]: Json } | Json[]

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          email: string
          full_name: string | null
          role: 'admin' | 'user'
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          email: string
          full_name?: string | null
          role?: 'admin' | 'user'
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          email?: string
          full_name?: string | null
          role?: 'admin' | 'user'
          is_active?: boolean
          updated_at?: string
        }
      }
      reports: {
        Row: {
          id: string
          user_id: string
          file_name: string
          file_path: string
          file_size: number
          file_type: string
          status: 'pending' | 'processing' | 'completed' | 'error'
          error_message: string | null
          created_at: string
          processed_at: string | null
        }
        Insert: {
          id?: string
          user_id: string
          file_name: string
          file_path: string
          file_size: number
          file_type: string
          status?: 'pending' | 'processing' | 'completed' | 'error'
          error_message?: string | null
          created_at?: string
          processed_at?: string | null
        }
        Update: {
          status?: 'pending' | 'processing' | 'completed' | 'error'
          error_message?: string | null
          processed_at?: string | null
        }
      }
      royalty_records: {
        Row: {
          id: string
          report_id: string
          user_id: string
          sale_period: string
          store: string
          country: string
          artist_name: string
          song_title: string
          album_name: string | null
          quantity: number
          earnings_usd: number
          created_at: string
        }
        Insert: {
          id?: string
          report_id: string
          user_id: string
          sale_period: string
          store: string
          country: string
          artist_name: string
          song_title: string
          album_name?: string | null
          quantity: number
          earnings_usd: number
          created_at?: string
        }
        Update: never
      }
      activity_logs: {
        Row: {
          id: string
          user_id: string
          action: string
          details: Json | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          action: string
          details?: Json | null
          created_at?: string
        }
        Update: never
      }
      currency_records: {
        Row: {
          id: string
          report_id: string
          user_id: string
          provider: string
          currency: string
          payment_column_used: string
          total: string
          record_count: number
          import_date: string
        }
        Insert: {
          id?: string
          report_id: string
          user_id: string
          provider: string
          currency: string
          payment_column_used: string
          total: string
          record_count: number
          import_date?: string
        }
        Update: never
      }
    }
  }
}

export type Profile = Database['public']['Tables']['profiles']['Row']
export type Report = Database['public']['Tables']['reports']['Row']
export type RoyaltyRecord = Database['public']['Tables']['royalty_records']['Row']
export type ActivityLog = Database['public']['Tables']['activity_logs']['Row']
export type CurrencyRecord = Database['public']['Tables']['currency_records']['Row']

// V2 — extends Report with audit/financial fields added by royalty-engine-v2
// The base Report type is left unchanged for backward compatibility.
export interface ReportV2 extends Report {
  provider:         string | null
  currency:         string
  net_total:        number
  gross_total:      number
  taxes:            number
  channel_costs:    number
  other_costs:      number
  audit_status:     'pending' | 'valid' | 'discrepancy' | 'error'
  discrepancy_note: string | null
  processing_ms:    number
  reported_month:   string | null
  total_columns:    number
  error_rows:       number
}

// Subscription
export type SubscriptionPlan = 'daily' | 'monthly' | 'quarterly' | 'annual'
export type SubscriptionStatus = 'active' | 'expired' | 'cancelled'

export interface Subscription {
  id: string
  user_id: string
  plan: SubscriptionPlan
  status: SubscriptionStatus
  started_at: string
  expires_at: string
  paypal_order_id: string | null
  amount_usd: number
  created_at: string
}

// Splits module
export interface Contract {
  id: string
  user_id: string
  artist_name: string
  label: string
  notes: string | null
  start_date: string | null
  end_date: string | null
  is_active: boolean
  created_at: string
  updated_at: string
  splits?: ContractSplit[]
}

export interface ContractSplit {
  id: string
  contract_id: string
  participant: string
  role: 'artist' | 'label' | 'producer' | 'other'
  percentage: number
  created_at: string
}

export interface SplitResult {
  participant: string
  role: string
  percentage: number
  amount: number
}
