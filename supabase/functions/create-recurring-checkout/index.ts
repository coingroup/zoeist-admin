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

// Stripe REST API helper (no npm library in Deno)
async function stripe(path: string, method = 'GET', body?: Record<string, any>) {
  const key = Deno.env.get('STRIPE_SECRET_KEY')!;
  const opts: RequestInit = {
    method,
    headers: {
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  };
  if (body) {
    opts.body = new URLSearchParams(flattenParams(body)).toString();
  }
  const res = await fetch(`https://api.stripe.com/v1${path}`, opts);
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data;
}

// Flatten nested objects for Stripe form-encoded params
function flattenParams(obj: Record<string, any>, prefix = ''): [string, string][] {
  const params: [string, string][] = [];
  for (const [key, val] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}[${key}]` : key;
    if (val !== null && val !== undefined) {
      if (typeof val === 'object' && !Array.isArray(val)) {
        params.push(...flattenParams(val, fullKey));
      } else if (Array.isArray(val)) {
        val.forEach((v, i) => {
          if (typeof v === 'object') {
            params.push(...flattenParams(v, `${fullKey}[${i}]`));
          } else {
            params.push([`${fullKey}[${i}]`, String(v)]);
          }
        });
      } else {
        params.push([fullKey, String(val)]);
      }
    }
  }
  return params;
}

const FREQUENCY_TO_INTERVAL: Record<string, string> = {
  monthly: 'month',
  quarterly: 'month',  // 3-month interval count
  annual: 'year',
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const {
      amount,           // in dollars (e.g. 50)
      frequency,        // 'monthly' | 'quarterly' | 'annual'
      donor_email,
      donor_first_name,
      donor_last_name,
      designation,      // 'unrestricted' default
      success_url,
      cancel_url,
    } = await req.json();

    if (!amount || !frequency || !donor_email) {
      return json({ error: 'amount, frequency, and donor_email are required' }, 400);
    }

    const amountCents = Math.round(parseFloat(amount) * 100);
    if (amountCents < 100) return json({ error: 'Minimum donation is $1.00' }, 400);

    const interval = FREQUENCY_TO_INTERVAL[frequency];
    if (!interval) return json({ error: 'Invalid frequency. Use monthly, quarterly, or annual' }, 400);

    const intervalCount = frequency === 'quarterly' ? 3 : 1;
    const donorName = `${donor_first_name || ''} ${donor_last_name || ''}`.trim() || 'Donor';

    // Check if Stripe customer exists in our DB
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const { data: existingDonor } = await supabase
      .from('donors')
      .select('stripe_customer_id')
      .eq('email', donor_email)
      .maybeSingle();

    let customerId = existingDonor?.stripe_customer_id;

    // Create or retrieve Stripe customer
    if (!customerId) {
      // Search Stripe for existing customer by email
      const search = await stripe(`/customers?email=${encodeURIComponent(donor_email)}&limit=1`);
      if (search.data && search.data.length > 0) {
        customerId = search.data[0].id;
      } else {
        const customer = await stripe('/customers', 'POST', {
          email: donor_email,
          name: donorName,
          metadata: {
            source: 'zoeist_recurring_checkout',
          },
        });
        customerId = customer.id;
      }
    }

    // Create a Stripe Price for this recurring amount
    const price = await stripe('/prices', 'POST', {
      unit_amount: String(amountCents),
      currency: 'usd',
      recurring: {
        interval,
        interval_count: String(intervalCount),
      },
      product_data: {
        name: `Zoeist Recurring Donation - ${designation || 'Unrestricted'}`,
      },
    });

    // Build Stripe Checkout Session
    const sessionParams: Record<string, any> = {
      mode: 'subscription',
      customer: customerId,
      'line_items[0][price]': price.id,
      'line_items[0][quantity]': '1',
      success_url: success_url || 'https://zoeist.org/thank-you?session_id={CHECKOUT_SESSION_ID}',
      cancel_url: cancel_url || 'https://zoeist.org/donate',
      'subscription_data[metadata][designation]': designation || 'unrestricted',
      'subscription_data[metadata][frequency]': frequency,
      'subscription_data[metadata][donor_email]': donor_email,
      'subscription_data[metadata][donor_first_name]': donor_first_name || '',
      'subscription_data[metadata][donor_last_name]': donor_last_name || '',
      'metadata[donation_type]': 'recurring',
      'metadata[designation]': designation || 'unrestricted',
      'metadata[frequency]': frequency,
    };

    const key = Deno.env.get('STRIPE_SECRET_KEY')!;
    const sessionRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(sessionParams).toString(),
    });

    const session = await sessionRes.json();
    if (session.error) throw new Error(session.error.message);

    return json({ url: session.url, session_id: session.id });

  } catch (err) {
    console.error('Error:', err);
    return json({ error: err.message }, 500);
  }
});
