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
    // Auth check
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'No auth' }, 401);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Verify admin
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) return json({ error: 'Unauthorized' }, 401);
    const { data: admin } = await supabase
      .from('admin_users')
      .select('role')
      .eq('auth_user_id', user.id)
      .eq('is_active', true)
      .single();
    if (!admin) return json({ error: 'Not admin' }, 403);

    // Route parsing
    const url = new URL(req.url);
    const pathParts = url.pathname.split('/');
    // Path: /recurring-api/<action>[/<id>]
    const fnIndex = pathParts.findIndex(p => p === 'recurring-api');
    const action = pathParts[fnIndex + 1] || '';
    const paramId = pathParts[fnIndex + 2] || '';

    // ─── GET /stats ───
    if (req.method === 'GET' && action === 'stats') {
      const { data: active } = await supabase
        .from('recurring_donations')
        .select('amount_cents', { count: 'exact' })
        .eq('status', 'active');

      const activeCount = active?.length || 0;
      const mrr = (active || []).reduce((sum: number, r: any) => {
        // Normalize to monthly
        return sum + r.amount_cents; // This is approximate; quarterly/annual need division
      }, 0);

      const { count: totalCount } = await supabase
        .from('recurring_donations')
        .select('id', { count: 'exact', head: true });

      const { count: cancelledCount } = await supabase
        .from('recurring_donations')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'cancelled');

      const { count: pausedCount } = await supabase
        .from('recurring_donations')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'paused');

      // Fetch with frequency for accurate MRR
      const { data: activeWithFreq } = await supabase
        .from('recurring_donations')
        .select('amount_cents, frequency')
        .eq('status', 'active');

      let monthlyRevenue = 0;
      for (const r of (activeWithFreq || [])) {
        if (r.frequency === 'monthly') monthlyRevenue += r.amount_cents;
        else if (r.frequency === 'quarterly') monthlyRevenue += Math.round(r.amount_cents / 3);
        else if (r.frequency === 'annual') monthlyRevenue += Math.round(r.amount_cents / 12);
      }

      return json({
        active: activeCount,
        paused: pausedCount || 0,
        cancelled: cancelledCount || 0,
        total: totalCount || 0,
        mrr_cents: monthlyRevenue,
      });
    }

    // ─── GET /list ───
    if (req.method === 'GET' && action === 'list') {
      const page = parseInt(url.searchParams.get('page') || '1');
      const limit = parseInt(url.searchParams.get('limit') || '25');
      const status = url.searchParams.get('status') || '';
      const search = url.searchParams.get('search') || '';
      const offset = (page - 1) * limit;

      let query = supabase
        .from('recurring_donations')
        .select('*, donors!inner(id, first_name, last_name, email)', { count: 'exact' });

      if (status) query = query.eq('status', status);
      if (search) {
        query = query.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,email.ilike.%${search}%`, { referencedTable: 'donors' });
      }

      const { data: recurring, count, error } = await query
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) return json({ error: error.message }, 500);

      return json({
        recurring: (recurring || []).map((r: any) => ({
          ...r,
          donor_name: `${r.donors?.first_name || ''} ${r.donors?.last_name || ''}`.trim(),
          donor_email: r.donors?.email,
        })),
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit),
        page,
      });
    }

    // ─── GET /detail/:id ───
    if (req.method === 'GET' && action === 'detail' && paramId) {
      const { data: recurring, error } = await supabase
        .from('recurring_donations')
        .select('*, donors(*)')
        .eq('id', paramId)
        .single();

      if (error || !recurring) return json({ error: 'Not found' }, 404);

      // Fetch related donations (by stripe_subscription_id or donor_id + type)
      const { data: donations } = await supabase
        .from('donations')
        .select('*')
        .eq('donor_id', recurring.donor_id)
        .eq('donation_type', 'recurring')
        .order('donated_at', { ascending: false })
        .limit(50);

      return json({
        recurring: {
          ...recurring,
          donor_name: `${recurring.donors?.first_name || ''} ${recurring.donors?.last_name || ''}`.trim(),
          donor_email: recurring.donors?.email,
        },
        donations: donations || [],
      });
    }

    // ─── POST /cancel ───
    if (req.method === 'POST' && action === 'cancel') {
      const { recurring_id } = await req.json();
      if (!recurring_id) return json({ error: 'recurring_id required' }, 400);

      const { data: rec } = await supabase
        .from('recurring_donations')
        .select('stripe_subscription_id')
        .eq('id', recurring_id)
        .single();

      if (!rec) return json({ error: 'Not found' }, 404);

      // Cancel in Stripe
      await stripeApi(`/subscriptions/${rec.stripe_subscription_id}`, 'DELETE');

      // Update DB
      await supabase.from('recurring_donations').update({
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
        cancel_reason: 'admin_cancelled',
        updated_at: new Date().toISOString(),
      }).eq('id', recurring_id);

      return json({ success: true });
    }

    // ─── POST /pause ───
    if (req.method === 'POST' && action === 'pause') {
      const { recurring_id } = await req.json();
      if (!recurring_id) return json({ error: 'recurring_id required' }, 400);

      const { data: rec } = await supabase
        .from('recurring_donations')
        .select('stripe_subscription_id')
        .eq('id', recurring_id)
        .single();

      if (!rec) return json({ error: 'Not found' }, 404);

      // Pause in Stripe
      await stripeApi(
        `/subscriptions/${rec.stripe_subscription_id}`,
        'POST',
        'pause_collection[behavior]=void'
      );

      await supabase.from('recurring_donations').update({
        status: 'paused',
        updated_at: new Date().toISOString(),
      }).eq('id', recurring_id);

      return json({ success: true });
    }

    // ─── POST /resume ───
    if (req.method === 'POST' && action === 'resume') {
      const { recurring_id } = await req.json();
      if (!recurring_id) return json({ error: 'recurring_id required' }, 400);

      const { data: rec } = await supabase
        .from('recurring_donations')
        .select('stripe_subscription_id')
        .eq('id', recurring_id)
        .single();

      if (!rec) return json({ error: 'Not found' }, 404);

      // Resume in Stripe (clear pause_collection)
      await stripeApi(
        `/subscriptions/${rec.stripe_subscription_id}`,
        'POST',
        'pause_collection='
      );

      await supabase.from('recurring_donations').update({
        status: 'active',
        updated_at: new Date().toISOString(),
      }).eq('id', recurring_id);

      return json({ success: true });
    }

    // ─── POST /portal ───
    if (req.method === 'POST' && action === 'portal') {
      const { donor_id, return_url } = await req.json();
      if (!donor_id) return json({ error: 'donor_id required' }, 400);

      const { data: donor } = await supabase
        .from('donors')
        .select('stripe_customer_id')
        .eq('id', donor_id)
        .single();

      if (!donor?.stripe_customer_id) return json({ error: 'No Stripe customer for this donor' }, 400);

      const portal = await stripeApi('/billing_portal/sessions', 'POST',
        `customer=${donor.stripe_customer_id}&return_url=${encodeURIComponent(return_url || 'https://zoeist.org')}`
      );

      return json({ url: portal.url });
    }

    return json({ error: 'Invalid endpoint. Use /stats, /list, /detail/:id, /cancel, /pause, /resume, or /portal' }, 400);

  } catch (err) {
    console.error('Error:', err);
    return json({ error: err.message }, 500);
  }
});
