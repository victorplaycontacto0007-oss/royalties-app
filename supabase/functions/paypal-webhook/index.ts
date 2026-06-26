// Supabase Edge Function — PayPal Webhook Handler
// Deploy: supabase functions deploy paypal-webhook

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL        = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const PAYPAL_WEBHOOK_ID   = Deno.env.get('PAYPAL_WEBHOOK_ID')!
const PAYPAL_API_BASE     = Deno.env.get('PAYPAL_ENV') === 'live'
  ? 'https://api-m.paypal.com'
  : 'https://api-m.sandbox.paypal.com'
const PAYPAL_CLIENT_ID    = Deno.env.get('PAYPAL_CLIENT_ID')!
const PAYPAL_CLIENT_SECRET = Deno.env.get('PAYPAL_CLIENT_SECRET')!

// ── Helpers ────────────────────────────────────────────────

/** Get a PayPal access token via client_credentials */
async function getPayPalToken(): Promise<string> {
  const res = await fetch(`${PAYPAL_API_BASE}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${btoa(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`)}`,
    },
    body: 'grant_type=client_credentials',
  })
  const data = await res.json()
  return data.access_token
}

/** Verify the PayPal webhook signature */
async function verifySignature(req: Request, rawBody: string): Promise<boolean> {
  try {
    const token = await getPayPalToken()
    const payload = {
      auth_algo:         req.headers.get('paypal-auth-algo'),
      cert_url:          req.headers.get('paypal-cert-url'),
      transmission_id:   req.headers.get('paypal-transmission-id'),
      transmission_sig:  req.headers.get('paypal-transmission-sig'),
      transmission_time: req.headers.get('paypal-transmission-time'),
      webhook_id:        PAYPAL_WEBHOOK_ID,
      webhook_event:     JSON.parse(rawBody),
    }
    const res = await fetch(
      `${PAYPAL_API_BASE}/v1/notifications/verify-webhook-signature`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      },
    )
    const result = await res.json()
    return result.verification_status === 'SUCCESS'
  } catch {
    return false
  }
}

/** Commission calculator — same formula as frontend */
function calculateCommission(purchaseAmountUsd: number, pct: number): number {
  return Math.round(purchaseAmountUsd * (pct / 100) * 100) / 100
}

// ── Main handler ───────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const rawBody = await req.text()

  // 1. Verify PayPal signature
  const valid = await verifySignature(req, rawBody)
  if (!valid) {
    return new Response('Unauthorized', { status: 401 })
  }

  const event = JSON.parse(rawBody)

  // 2. Only handle PAYMENT.CAPTURE.COMPLETED
  if (event.event_type !== 'PAYMENT.CAPTURE.COMPLETED') {
    return new Response('OK', { status: 200 })
  }

  const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

  const paypalOrderId  = event.resource?.supplementary_data?.related_ids?.order_id
                      ?? event.resource?.id
  const buyerEmail     = event.resource?.payer?.email_address
                      ?? event.resource?.payment_source?.paypal?.email_address

  if (!paypalOrderId) {
    return new Response('OK', { status: 200 })
  }

  // 3. Idempotency check
  const { data: existing } = await db
    .from('commissions')
    .select('id')
    .eq('paypal_order_id', paypalOrderId)
    .maybeSingle()

  if (existing) {
    return new Response('OK', { status: 200 })
  }

  // 4. Look up subscription
  const { data: subscription } = await db
    .from('subscriptions')
    .select('user_id, amount_usd, referral_code')
    .eq('paypal_order_id', paypalOrderId)
    .maybeSingle()

  if (!subscription) {
    await db.from('activity_logs').insert({
      action: 'webhook_no_subscription',
      details: { paypal_order_id: paypalOrderId, buyer_email: buyerEmail },
    })
    return new Response('OK', { status: 200 })
  }

  // 5. Look up referral link
  if (!subscription.referral_code) {
    await db.from('activity_logs').insert({
      action: 'webhook_no_affiliate',
      details: { paypal_order_id: paypalOrderId },
    })
    return new Response('OK', { status: 200 })
  }

  const { data: referralLink } = await db
    .from('referral_links')
    .select('affiliate_id')
    .eq('referral_code', subscription.referral_code)
    .eq('is_active', true)
    .maybeSingle()

  if (!referralLink) {
    await db.from('activity_logs').insert({
      action: 'webhook_no_affiliate',
      details: { paypal_order_id: paypalOrderId, referral_code: subscription.referral_code },
    })
    return new Response('OK', { status: 200 })
  }

  // 6. Calculate commission (default 20% — configurable)
  const DEFAULT_COMMISSION_PCT = 20
  const commissionAmount = calculateCommission(subscription.amount_usd, DEFAULT_COMMISSION_PCT)

  // 7. Insert commission
  const { error: insErr } = await db.from('commissions').insert({
    affiliate_id:          referralLink.affiliate_id,
    buyer_id:              subscription.user_id,
    purchase_amount_usd:   subscription.amount_usd,
    commission_percentage: DEFAULT_COMMISSION_PCT,
    commission_amount:     commissionAmount,
    status:                'Pendiente',
    payment_method:        'PayPal',
    paypal_order_id:       paypalOrderId,
  })

  if (insErr) {
    console.error('Error inserting commission:', insErr.message)
    return new Response('Internal Server Error', { status: 500 })
  }

  await db.from('activity_logs').insert({
    action: 'webhook_commission_created',
    details: {
      paypal_order_id: paypalOrderId,
      affiliate_id: referralLink.affiliate_id,
      commission_amount: commissionAmount,
    },
  })

  return new Response('OK', { status: 200 })
})
