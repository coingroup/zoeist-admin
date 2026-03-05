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

async function stripeApi(path: string, method = 'GET', body?: string) {
  const key = Deno.env.get('STRIPE_SECRET_KEY')!;
  const opts: RequestInit = {
    method,
    headers: {
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  };
  if (body) opts.body = body;
  const res = await fetch(`https://api.stripe.com/v1${path}`, opts);
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    // Auth check — Supabase JWT from donor (not admin)
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'No auth' }, 401);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) return json({ error: 'Unauthorized' }, 401);

    // Look up donor by auth_user_id
    let { data: donor } = await supabase
      .from('donors')
      .select('*')
      .eq('auth_user_id', user.id)
      .single();

    // Auto-link on first login: match by email
    if (!donor && user.email) {
      const { data: emailMatch } = await supabase
        .from('donors')
        .select('*')
        .eq('email', user.email)
        .is('auth_user_id', null)
        .single();

      if (emailMatch) {
        await supabase
          .from('donors')
          .update({ auth_user_id: user.id })
          .eq('id', emailMatch.id);
        donor = { ...emailMatch, auth_user_id: user.id };
      }
    }

    if (!donor) return json({ error: 'No donor record found for this email' }, 404);

    // Route parsing
    const url = new URL(req.url);
    const pathParts = url.pathname.split('/');
    const fnIndex = pathParts.findIndex(p => p === 'donor-portal-api');
    const action = pathParts[fnIndex + 1] || '';
    const paramId = pathParts[fnIndex + 2] || '';

    // ─── GET /dashboard ───
    if (req.method === 'GET' && action === 'dashboard') {
      const { data: allDonations } = await supabase
        .from('donations')
        .select('amount_cents, tax_year')
        .eq('donor_id', donor.id)
        .eq('status', 'succeeded');

      const currentYear = new Date().getFullYear();
      const totalGiven = (allDonations || []).reduce((s: number, d: any) => s + d.amount_cents, 0);
      const thisYear = (allDonations || [])
        .filter((d: any) => d.tax_year === currentYear)
        .reduce((s: number, d: any) => s + d.amount_cents, 0);

      const { count: activeSubs } = await supabase
        .from('recurring_donations')
        .select('id', { count: 'exact', head: true })
        .eq('donor_id', donor.id)
        .eq('status', 'active');

      return json({
        donor_name: `${donor.first_name || ''} ${donor.last_name || ''}`.trim(),
        total_given_cents: totalGiven,
        this_year_cents: thisYear,
        this_year: currentYear,
        active_subscriptions: activeSubs || 0,
        donation_count: allDonations?.length || 0,
      });
    }

    // ─── GET /profile ───
    if (req.method === 'GET' && action === 'profile') {
      return json({
        first_name: donor.first_name,
        last_name: donor.last_name,
        email: donor.email,
        phone: donor.phone,
        address_line1: donor.address_line1,
        address_line2: donor.address_line2,
        city: donor.city,
        state: donor.state,
        zip: donor.zip,
        country: donor.country,
        employer: donor.employer,
      });
    }

    // ─── PUT /profile ───
    if (req.method === 'PUT' && action === 'profile') {
      const body = await req.json();
      const allowed = ['phone', 'address_line1', 'address_line2', 'city', 'state', 'zip', 'country', 'employer'];
      const updates: Record<string, any> = {};
      for (const key of allowed) {
        if (key in body) updates[key] = body[key];
      }
      if (Object.keys(updates).length === 0) return json({ error: 'No valid fields to update' }, 400);

      updates.updated_at = new Date().toISOString();
      const { error } = await supabase
        .from('donors')
        .update(updates)
        .eq('id', donor.id);

      if (error) return json({ error: error.message }, 500);
      return json({ success: true });
    }

    // ─── GET /donations ───
    if (req.method === 'GET' && action === 'donations') {
      const taxYear = url.searchParams.get('tax_year');
      let query = supabase
        .from('donations')
        .select('id, amount_cents, currency, donation_type, designation, status, receipt_number, donated_at, tax_year, payment_method, card_brand, card_last_four')
        .eq('donor_id', donor.id)
        .eq('status', 'succeeded')
        .order('donated_at', { ascending: false });

      if (taxYear) query = query.eq('tax_year', parseInt(taxYear));

      const { data: donations, error } = await query;
      if (error) return json({ error: error.message }, 500);
      return json({ donations: donations || [] });
    }

    // ─── GET /receipts ───
    if (req.method === 'GET' && action === 'receipts') {
      const { data: receipts, error } = await supabase
        .from('donation_receipts')
        .select('id, receipt_type, tax_year, receipt_number, pdf_storage_path, created_at, sent_at')
        .eq('donor_id', donor.id)
        .is('voided_at', null)
        .order('created_at', { ascending: false });

      if (error) return json({ error: error.message }, 500);
      return json({ receipts: receipts || [] });
    }

    // ─── GET /receipt/:id/download ───
    if (req.method === 'GET' && action === 'receipt' && paramId) {
      const subAction = pathParts[fnIndex + 3] || '';
      if (subAction !== 'download') return json({ error: 'Use /receipt/:id/download' }, 400);

      const { data: receipt, error } = await supabase
        .from('donation_receipts')
        .select('pdf_storage_path, donor_id')
        .eq('id', paramId)
        .eq('donor_id', donor.id)
        .is('voided_at', null)
        .single();

      if (error || !receipt) return json({ error: 'Receipt not found' }, 404);

      const { data: signedUrl } = await supabase
        .storage
        .from('donation-receipts')
        .createSignedUrl(receipt.pdf_storage_path, 300); // 5 min expiry

      if (!signedUrl) return json({ error: 'Could not generate download URL' }, 500);
      return json({ url: signedUrl.signedUrl });
    }

    // ─── GET /subscriptions ───
    if (req.method === 'GET' && action === 'subscriptions') {
      const { data: subs, error } = await supabase
        .from('recurring_donations')
        .select('id, amount_cents, currency, frequency, designation, status, started_at, next_billing_date, cancelled_at, installment_count')
        .eq('donor_id', donor.id)
        .order('created_at', { ascending: false });

      if (error) return json({ error: error.message }, 500);
      return json({ subscriptions: subs || [] });
    }

    // ─── POST /subscription/:id/pause ───
    if (req.method === 'POST' && action === 'subscription' && paramId) {
      const subAction = pathParts[fnIndex + 3] || '';

      const { data: sub } = await supabase
        .from('recurring_donations')
        .select('id, stripe_subscription_id, status')
        .eq('id', paramId)
        .eq('donor_id', donor.id)
        .single();

      if (!sub) return json({ error: 'Subscription not found' }, 404);

      if (subAction === 'pause') {
        if (sub.status !== 'active') return json({ error: 'Can only pause active subscriptions' }, 400);
        await stripeApi(`/subscriptions/${sub.stripe_subscription_id}`, 'POST', 'pause_collection[behavior]=void');
        await supabase.from('recurring_donations').update({
          status: 'paused',
          updated_at: new Date().toISOString(),
        }).eq('id', sub.id);
        return json({ success: true });
      }

      if (subAction === 'resume') {
        if (sub.status !== 'paused') return json({ error: 'Can only resume paused subscriptions' }, 400);
        await stripeApi(`/subscriptions/${sub.stripe_subscription_id}`, 'POST', 'pause_collection=');
        await supabase.from('recurring_donations').update({
          status: 'active',
          updated_at: new Date().toISOString(),
        }).eq('id', sub.id);
        return json({ success: true });
      }

      if (subAction === 'cancel') {
        if (sub.status === 'cancelled') return json({ error: 'Already cancelled' }, 400);
        await stripeApi(`/subscriptions/${sub.stripe_subscription_id}`, 'DELETE');
        await supabase.from('recurring_donations').update({
          status: 'cancelled',
          cancelled_at: new Date().toISOString(),
          cancel_reason: 'donor_self_service',
          updated_at: new Date().toISOString(),
        }).eq('id', sub.id);
        return json({ success: true });
      }

      return json({ error: 'Use /subscription/:id/pause, /resume, or /cancel' }, 400);
    }

    return json({ error: 'Invalid endpoint' }, 400);

  } catch (err) {
    console.error('Error:', err);
    return json({ error: err.message }, 500);
  }
});
