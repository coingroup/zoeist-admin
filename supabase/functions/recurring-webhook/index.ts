import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// Stripe REST API helper
async function stripeApi(path: string, method = 'GET') {
  const key = Deno.env.get('STRIPE_SECRET_KEY')!;
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    method,
    headers: { 'Authorization': `Bearer ${key}` },
  });
  return res.json();
}

// Verify Stripe webhook signature (manual HMAC, no npm library)
async function verifyStripeSignature(payload: string, sigHeader: string, secret: string): Promise<boolean> {
  const parts = sigHeader.split(',').reduce((acc: Record<string, string>, part: string) => {
    const [k, v] = part.split('=');
    acc[k] = v;
    return acc;
  }, {});

  const timestamp = parts['t'];
  const signature = parts['v1'];
  if (!timestamp || !signature) return false;

  // Check timestamp is within 5 minutes
  const age = Math.floor(Date.now() / 1000) - parseInt(timestamp);
  if (age > 300) return false;

  const signedPayload = `${timestamp}.${payload}`;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signedPayload));
  const expectedSig = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');

  return expectedSig === signature;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const webhookSecret = Deno.env.get('STRIPE_RECURRING_WEBHOOK_SECRET') || Deno.env.get('STRIPE_WEBHOOK_SECRET')!;
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    // Verify Stripe signature
    const rawBody = await req.text();
    const sigHeader = req.headers.get('stripe-signature') || '';
    const valid = await verifyStripeSignature(rawBody, sigHeader, webhookSecret);
    if (!valid) {
      console.error('Invalid Stripe signature');
      return json({ error: 'Invalid signature' }, 400);
    }

    const event = JSON.parse(rawBody);
    console.log(`Recurring webhook received: ${event.type}`);

    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(supabase, event.data.object);
        break;
      case 'invoice.payment_succeeded':
        await handleInvoicePayment(supabase, supabaseUrl, event.data.object);
        break;
      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(supabase, event.data.object);
        break;
      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(supabase, event.data.object);
        break;
      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return json({ received: true });
  } catch (err) {
    console.error('Webhook error:', err);
    return json({ error: err.message }, 500);
  }
});

// ─── checkout.session.completed (subscription mode) ───
async function handleCheckoutCompleted(supabase: any, session: any) {
  if (session.mode !== 'subscription') return; // Only handle subscription sessions

  const subscriptionId = session.subscription;
  const customerId = session.customer;
  const metadata = session.metadata || {};
  const subMetadata = session.subscription_data?.metadata || metadata;

  const email = session.customer_details?.email || subMetadata.donor_email || metadata.donor_email;
  const firstName = subMetadata.donor_first_name || metadata.donor_first_name || session.customer_details?.name?.split(' ')[0] || '';
  const lastName = subMetadata.donor_last_name || metadata.donor_last_name || '';
  const designation = subMetadata.designation || metadata.designation || 'unrestricted';
  const frequency = subMetadata.frequency || metadata.frequency || 'monthly';

  if (!subscriptionId) {
    console.error('No subscription ID in checkout session');
    return;
  }

  // Fetch subscription details from Stripe
  const subscription = await stripeApi(`/subscriptions/${subscriptionId}`);
  const priceId = subscription.items?.data?.[0]?.price?.id;
  const amountCents = subscription.items?.data?.[0]?.price?.unit_amount || 0;
  const currency = subscription.items?.data?.[0]?.price?.currency || 'usd';

  // Upsert donor
  let donorId: string;
  const { data: existingDonor } = await supabase
    .from('donors')
    .select('id')
    .eq('email', email)
    .maybeSingle();

  if (existingDonor) {
    donorId = existingDonor.id;
    await supabase.from('donors').update({
      stripe_customer_id: customerId,
      updated_at: new Date().toISOString(),
    }).eq('id', donorId);
  } else {
    const { data: newDonor, error: donorErr } = await supabase.from('donors').insert({
      email,
      first_name: firstName,
      last_name: lastName,
      stripe_customer_id: customerId,
      country: 'US',
      total_donated_cents: 0,
      donation_count: 0,
    }).select('id').single();
    if (donorErr) { console.error('Error creating donor:', donorErr); return; }
    donorId = newDonor.id;
  }

  // Calculate next billing date
  const nextBilling = subscription.current_period_end
    ? new Date(subscription.current_period_end * 1000).toISOString().split('T')[0]
    : null;

  // Create recurring_donations record
  const { error: recErr } = await supabase.from('recurring_donations').upsert({
    donor_id: donorId,
    stripe_subscription_id: subscriptionId,
    stripe_price_id: priceId,
    amount_cents: amountCents,
    currency,
    frequency,
    designation,
    status: 'active',
    started_at: new Date().toISOString(),
    next_billing_date: nextBilling,
    installment_count: 0,
  }, { onConflict: 'stripe_subscription_id' });

  if (recErr) console.error('Error creating recurring donation:', recErr);
  else console.log(`Recurring donation created for ${email}, sub=${subscriptionId}`);
}

// ─── invoice.payment_succeeded (each installment) ───
async function handleInvoicePayment(supabase: any, supabaseUrl: string, invoice: any) {
  // Only process subscription invoices
  if (!invoice.subscription) return;
  // Skip $0 invoices (e.g. trials)
  if (invoice.amount_paid === 0) return;

  const subscriptionId = invoice.subscription;
  const customerId = invoice.customer;
  const amountCents = invoice.amount_paid;
  const chargeId = invoice.charge;

  // Look up recurring donation
  const { data: recurring } = await supabase
    .from('recurring_donations')
    .select('*, donors(*)')
    .eq('stripe_subscription_id', subscriptionId)
    .maybeSingle();

  let donorId: string;
  let donor: any;

  if (recurring) {
    donorId = recurring.donor_id;
    donor = recurring.donors;
  } else {
    // Recurring record not found yet — look up by Stripe customer
    const { data: d } = await supabase
      .from('donors')
      .select('*')
      .eq('stripe_customer_id', customerId)
      .maybeSingle();

    if (!d) {
      // Create donor from invoice data
      const email = invoice.customer_email || '';
      const name = invoice.customer_name || '';
      const parts = name.split(' ');
      const { data: newDonor } = await supabase.from('donors').insert({
        email,
        first_name: parts[0] || '',
        last_name: parts.slice(1).join(' ') || '',
        stripe_customer_id: customerId,
        country: 'US',
        total_donated_cents: 0,
        donation_count: 0,
      }).select('*').single();
      donor = newDonor;
      donorId = newDonor.id;
    } else {
      donor = d;
      donorId = d.id;
    }
  }

  // Check if donation already exists for this invoice
  const invoiceId = invoice.id;
  const { data: existingDonation } = await supabase
    .from('donations')
    .select('id')
    .eq('stripe_charge_id', chargeId || invoiceId)
    .maybeSingle();

  if (existingDonation) {
    console.log(`Donation already exists for charge ${chargeId || invoiceId}`);
    return;
  }

  // Generate receipt number
  const taxYear = new Date().getFullYear();
  const { data: receiptNum } = await supabase.rpc('generate_receipt_number');
  const receiptNumber = receiptNum || `Z-${taxYear}-${Date.now().toString().slice(-5)}`;

  // Get payment method details from charge
  let cardLast4 = null, cardBrand = null, paymentMethod = 'card';
  if (chargeId) {
    try {
      const charge = await stripeApi(`/charges/${chargeId}`);
      cardLast4 = charge.payment_method_details?.card?.last4;
      cardBrand = charge.payment_method_details?.card?.brand;
      paymentMethod = charge.payment_method_details?.type || 'card';
    } catch (e) { console.error('Could not fetch charge details:', e); }
  }

  // Create donation record
  const now = new Date().toISOString();
  const { data: donation, error: donErr } = await supabase.from('donations').insert({
    donor_id: donorId,
    stripe_charge_id: chargeId || invoiceId,
    stripe_payment_intent_id: invoice.payment_intent,
    amount_cents: amountCents,
    currency: invoice.currency || 'usd',
    donation_type: 'recurring',
    designation: recurring?.designation || 'unrestricted',
    status: 'succeeded',
    receipt_number: receiptNumber,
    receipt_issued_at: now,
    payment_method: paymentMethod,
    card_last_four: cardLast4,
    card_brand: cardBrand,
    tax_deductible_amount_cents: amountCents,
    tax_year: taxYear,
    donated_at: now,
  }).select('id').single();

  if (donErr) {
    console.error('Error creating donation:', donErr);
    return;
  }

  console.log(`Donation ${receiptNumber} created for subscription ${subscriptionId}`);

  // Update donor aggregates
  await supabase.from('donors').update({
    total_donated_cents: (donor?.total_donated_cents || 0) + amountCents,
    donation_count: (donor?.donation_count || 0) + 1,
    last_donated_at: now,
    first_donated_at: donor?.first_donated_at || now,
    updated_at: now,
  }).eq('id', donorId);

  // Update recurring donation installment count
  if (recurring) {
    const subscription = await stripeApi(`/subscriptions/${subscriptionId}`);
    const nextBilling = subscription.current_period_end
      ? new Date(subscription.current_period_end * 1000).toISOString().split('T')[0]
      : null;

    await supabase.from('recurring_donations').update({
      installment_count: (recurring.installment_count || 0) + 1,
      next_billing_date: nextBilling,
      updated_at: now,
    }).eq('id', recurring.id);
  }

  // Trigger receipt generation + email (reuse existing pipeline)
  try {
    await fetch(`${supabaseUrl}/functions/v1/generate-receipt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ donation_id: donation.id }),
    });
  } catch (e) { console.error('Receipt generation error:', e); }

  try {
    await fetch(`${supabaseUrl}/functions/v1/send-donation-receipt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ donation_id: donation.id }),
    });
  } catch (e) { console.error('Receipt email error:', e); }
}

// ─── customer.subscription.updated ───
async function handleSubscriptionUpdated(supabase: any, subscription: any) {
  const subscriptionId = subscription.id;
  const stripeStatus = subscription.status; // active, past_due, canceled, unpaid, paused

  let status = 'active';
  if (stripeStatus === 'canceled') status = 'cancelled';
  else if (stripeStatus === 'paused' || subscription.pause_collection) status = 'paused';
  else if (stripeStatus === 'past_due' || stripeStatus === 'unpaid') status = 'active'; // still considered active, just past due

  const nextBilling = subscription.current_period_end
    ? new Date(subscription.current_period_end * 1000).toISOString().split('T')[0]
    : null;

  const update: Record<string, any> = {
    status,
    next_billing_date: nextBilling,
    updated_at: new Date().toISOString(),
  };

  // Update amount if changed
  const newAmount = subscription.items?.data?.[0]?.price?.unit_amount;
  if (newAmount) update.amount_cents = newAmount;

  const { error } = await supabase
    .from('recurring_donations')
    .update(update)
    .eq('stripe_subscription_id', subscriptionId);

  if (error) console.error('Error updating subscription:', error);
  else console.log(`Subscription ${subscriptionId} updated to ${status}`);
}

// ─── customer.subscription.deleted ───
async function handleSubscriptionDeleted(supabase: any, subscription: any) {
  const subscriptionId = subscription.id;
  const cancelReason = subscription.cancellation_details?.reason || 'cancelled';

  const { error } = await supabase
    .from('recurring_donations')
    .update({
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
      cancel_reason: cancelReason,
      updated_at: new Date().toISOString(),
    })
    .eq('stripe_subscription_id', subscriptionId);

  if (error) console.error('Error cancelling subscription:', error);
  else console.log(`Subscription ${subscriptionId} cancelled`);
}
