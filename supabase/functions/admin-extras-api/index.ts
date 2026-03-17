import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

async function stripeApi(path: string, method = 'GET', body?: string) {
  const key = Deno.env.get('STRIPE_SECRET_KEY')!;
  const opts: RequestInit = { method, headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/x-www-form-urlencoded' } };
  if (body) opts.body = body;
  const res = await fetch(`https://api.stripe.com/v1${path}`, opts);
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data;
}

async function requireAdmin(req: Request): Promise<{ admin: Record<string, unknown> } | Response> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "No authorization header" }, 401);
  const token = authHeader.replace("Bearer ", "");
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return json({ error: "Invalid token" }, 401);
  const { data: admin } = await supabase.from("admin_users").select("*").eq("auth_user_id", user.id).eq("is_active", true).single();
  if (!admin) return json({ error: "Not an admin" }, 403);
  return { admin };
}

function extractPath(url: URL): string {
  const full = url.pathname;
  const marker = '/admin-extras-api';
  const idx = full.indexOf(marker);
  if (idx === -1) return '';
  return full.substring(idx + marker.length).replace(/^\/+/, '');
}

// Acknowledgment tier based on total donated
function getTier(totalCents: number): string {
  if (totalCents >= 10000000) return 'platinum';  // $100K+
  if (totalCents >= 2500000) return 'gold';        // $25K+
  if (totalCents >= 500000) return 'silver';       // $5K+
  if (totalCents >= 100000) return 'bronze';       // $1K+
  return 'standard';
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const url = new URL(req.url);
  const path = extractPath(url);
  const method = req.method;

  const authResult = await requireAdmin(req);
  if (authResult instanceof Response) return authResult;
  const { admin } = authResult;

  try {
    // ============ ACKNOWLEDGMENT LETTERS ============

    if (path === 'letters' && method === 'GET') {
      const page = parseInt(url.searchParams.get('page') || '1');
      const limit = Math.min(parseInt(url.searchParams.get('limit') || '25'), 100);
      const offset = (page - 1) * limit;

      const { data, count, error: qErr } = await supabase.from('acknowledgment_letters')
        .select('*, donor:donors(first_name, last_name, email, total_donated_cents), donation:donations(receipt_number, amount_cents, donated_at)', { count: 'exact' })
        .order('created_at', { ascending: false }).range(offset, offset + limit - 1);
      if (qErr) return json({ error: qErr.message }, 500);
      return json({ letters: data, total: count, page, limit, totalPages: Math.ceil((count || 0) / limit) });
    }

    if (path === 'letter' && method === 'POST') {
      if (admin.role === 'viewer') return json({ error: 'Insufficient permissions' }, 403);
      const body = await req.json();

      // Auto-determine tier from donor's total
      let tier = body.template_tier;
      if (!tier && body.donor_id) {
        const { data: donor } = await supabase.from('donors').select('total_donated_cents').eq('id', body.donor_id).single();
        tier = getTier(Number(donor?.total_donated_cents || 0));
      }

      const { data, error } = await supabase.from('acknowledgment_letters').insert({
        donor_id: body.donor_id,
        donation_id: body.donation_id || null,
        template_tier: tier || 'standard',
        sent_via: body.sent_via || null,
        sent_at: body.sent_via ? new Date().toISOString() : null,
        signed_by: body.signed_by || null,
      }).select().single();
      if (error) return json({ error: error.message }, 500);
      await supabase.from('admin_audit_log').insert({ admin_user_id: admin.id, action: 'create_letter', resource_type: 'acknowledgment_letter', resource_id: data.id });
      return json({ success: true, letter: data });
    }

    if (path.match(/^letter\/[^/]+$/) && method === 'PUT') {
      if (admin.role === 'viewer') return json({ error: 'Insufficient permissions' }, 403);
      const id = path.replace('letter/', '');
      const body = await req.json();
      const allowed = ['template_tier', 'sent_via', 'sent_at', 'signed_by'];
      const updates: Record<string, unknown> = {};
      for (const key of allowed) { if (key in body) updates[key] = body[key]; }
      if (body.mark_sent && !updates.sent_at) updates.sent_at = new Date().toISOString();
      const { data, error } = await supabase.from('acknowledgment_letters').update(updates).eq('id', id).select().single();
      if (error) return json({ error: error.message }, 500);
      return json({ success: true, letter: data });
    }

    if (path.match(/^letter\/[^/]+$/) && method === 'DELETE') {
      if (admin.role !== 'super_admin' && admin.role !== 'admin') return json({ error: 'Insufficient permissions' }, 403);
      const id = path.replace('letter/', '');
      const { error } = await supabase.from('acknowledgment_letters').delete().eq('id', id);
      if (error) return json({ error: error.message }, 500);
      return json({ success: true });
    }

    // Batch: generate letters for all donors who donated since a date and don't have one yet
    if (path === 'letters/batch' && method === 'POST') {
      if (admin.role === 'viewer') return json({ error: 'Insufficient permissions' }, 403);
      const { since, signed_by } = await req.json();

      // Get donations since date
      const { data: donations } = await supabase.from('donations')
        .select('id, donor_id, amount_cents')
        .eq('status', 'succeeded')
        .gte('donated_at', since || '2020-01-01');

      // Get existing letters
      const { data: existing } = await supabase.from('acknowledgment_letters').select('donation_id');
      const existingSet = new Set((existing || []).map(l => l.donation_id));

      // Get donor totals for tier calculation
      const donorIds = [...new Set((donations || []).filter(d => !existingSet.has(d.id)).map(d => d.donor_id))];
      const { data: donorTotals } = await supabase.from('donors').select('id, total_donated_cents').in('id', donorIds);
      const totalMap: Record<string, number> = {};
      for (const d of (donorTotals || [])) totalMap[d.id] = Number(d.total_donated_cents) || 0;

      const toInsert = (donations || [])
        .filter(d => !existingSet.has(d.id))
        .map(d => ({
          donor_id: d.donor_id,
          donation_id: d.id,
          template_tier: getTier(totalMap[d.donor_id] || 0),
          signed_by: signed_by || null,
        }));

      if (toInsert.length === 0) return json({ success: true, created: 0 });

      const { error } = await supabase.from('acknowledgment_letters').insert(toInsert);
      if (error) return json({ error: error.message }, 500);

      await supabase.from('admin_audit_log').insert({ admin_user_id: admin.id, action: 'batch_create_letters', resource_type: 'acknowledgment_letter', details: { count: toInsert.length } });
      return json({ success: true, created: toInsert.length });
    }

    // ============ COMMUNICATION PREFERENCES ============

    if (path === 'communications' && method === 'GET') {
      const donorId = url.searchParams.get('donor_id');
      let query = supabase.from('donor_communications').select('*, donor:donors(first_name, last_name, email)');
      if (donorId) query = query.eq('donor_id', donorId);
      query = query.order('created_at', { ascending: false }).limit(200);
      const { data, error } = await query;
      if (error) return json({ error: error.message }, 500);
      return json({ preferences: data });
    }

    if (path === 'communication' && method === 'POST') {
      if (admin.role === 'viewer') return json({ error: 'Insufficient permissions' }, 403);
      const body = await req.json();
      const validChannels = ['email', 'mail', 'phone', 'sms'];
      const validCategories = ['receipts', 'statements', 'marketing', 'compliance', 'events', 'newsletters', 'fundraising'];
      if (!body.channel || !validChannels.includes(body.channel)) {
        return json({ error: `Invalid channel. Must be one of: ${validChannels.join(', ')}` }, 400);
      }
      if (!body.category || !validCategories.includes(body.category)) {
        return json({ error: `Invalid category. Must be one of: ${validCategories.join(', ')}` }, 400);
      }
      const { data, error } = await supabase.from('donor_communications').insert({
        donor_id: body.donor_id,
        channel: body.channel,
        category: body.category,
        opted_in: body.opted_in !== false,
        opted_in_at: body.opted_in !== false ? new Date().toISOString() : null,
        opted_out_at: body.opted_in === false ? new Date().toISOString() : null,
      }).select().single();
      if (error) return json({ error: error.message }, 500);
      return json({ success: true, preference: data });
    }

    if (path.match(/^communication\/[^/]+$/) && method === 'PUT') {
      if (admin.role === 'viewer') return json({ error: 'Insufficient permissions' }, 403);
      const id = path.replace('communication/', '');
      const body = await req.json();
      const updates: Record<string, unknown> = {};
      if ('opted_in' in body) {
        updates.opted_in = body.opted_in;
        if (body.opted_in) updates.opted_in_at = new Date().toISOString();
        else updates.opted_out_at = new Date().toISOString();
      }
      const { data, error } = await supabase.from('donor_communications').update(updates).eq('id', id).select().single();
      if (error) return json({ error: error.message }, 500);
      return json({ success: true, preference: data });
    }

    // ============ COMMUNICATION PREFERENCE CHECK ============

    // Check if a donor has opted out of a specific channel/category
    if (path === 'check-preferences' && method === 'POST') {
      const { donor_id, channel, category } = await req.json();
      if (!donor_id) return json({ error: 'donor_id required' }, 400);

      let query = supabase.from('donor_communications').select('channel, category, opted_in')
        .eq('donor_id', donor_id).eq('opted_in', false);
      if (channel) query = query.eq('channel', channel);
      if (category) query = query.eq('category', category);

      const { data: optOuts } = await query;
      const isOptedOut = (optOuts || []).length > 0;

      return json({
        donor_id,
        opted_out: isOptedOut,
        opt_outs: optOuts || [],
        can_send: !isOptedOut,
      });
    }

    // Bulk check preferences for multiple donors
    if (path === 'check-preferences-bulk' && method === 'POST') {
      const { donor_ids, channel, category } = await req.json();
      if (!donor_ids || !Array.isArray(donor_ids)) return json({ error: 'donor_ids array required' }, 400);

      let query = supabase.from('donor_communications').select('donor_id, channel, category, opted_in')
        .in('donor_id', donor_ids).eq('opted_in', false);
      if (channel) query = query.eq('channel', channel);
      if (category) query = query.eq('category', category);

      const { data: optOuts } = await query;
      const optedOutIds = new Set((optOuts || []).map(o => o.donor_id));

      return json({
        total: donor_ids.length,
        can_send: donor_ids.filter(id => !optedOutIds.has(id)),
        opted_out: donor_ids.filter(id => optedOutIds.has(id)),
      });
    }

    // ============ ACKNOWLEDGMENT LETTER CONTENT GENERATION ============

    if (path.match(/^letter\/[^/]+\/generate$/) && method === 'POST') {
      if (admin.role === 'viewer') return json({ error: 'Insufficient permissions' }, 403);
      const letterId = path.replace('letter/', '').replace('/generate', '');

      const { data: letter } = await supabase.from('acknowledgment_letters')
        .select('*, donor:donors(first_name, last_name, email, address_line1, address_line2, city, state, zip, total_donated_cents), donation:donations(receipt_number, amount_cents, donated_at, designation, goods_services_provided, goods_services_description, goods_services_value_cents)')
        .eq('id', letterId).single();
      if (!letter) return json({ error: 'Letter not found' }, 404);

      const donor = letter.donor as any;
      const donation = letter.donation as any;
      const tier = letter.template_tier || 'standard';
      const donorName = `${donor?.first_name || ''} ${donor?.last_name || ''}`.trim() || 'Valued Donor';

      const tierMessages: Record<string, string> = {
        platinum: 'Your extraordinary generosity at the Platinum level has made you one of our most impactful supporters. Your transformational giving is shaping the future of our mission.',
        gold: 'Your remarkable Gold-level commitment demonstrates exceptional dedication to our cause. Your sustained generosity creates lasting impact in our community.',
        silver: 'Your Silver-level support is truly making a difference. Your consistent giving helps sustain and grow our programs throughout the year.',
        bronze: 'Your Bronze-level contribution is deeply valued. Every gift, regardless of size, helps advance our mission and serves those who need it most.',
        standard: 'Your generous contribution is sincerely appreciated. Your support helps make our work possible.',
      };

      const amountStr = donation ? `$${(donation.amount_cents / 100).toFixed(2)}` : '';
      const dateStr = donation ? new Date(donation.donated_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '';
      const designation = donation?.designation || 'unrestricted';

      let qpqDisclosure = '';
      if (donation?.goods_services_provided && donation?.goods_services_value_cents > 0) {
        qpqDisclosure = `\n\nIn connection with this contribution, goods or services with an estimated fair market value of $${(donation.goods_services_value_cents / 100).toFixed(2)} were provided to you (${donation.goods_services_description || 'goods/services'}). The tax-deductible portion of your contribution is $${((donation.amount_cents - donation.goods_services_value_cents) / 100).toFixed(2)}.`;
      }

      const letterContent = `Dear ${donorName},

On behalf of Zoeist, Inc., thank you for your generous ${amountStr ? `gift of ${amountStr}` : 'contribution'}${dateStr ? ` on ${dateStr}` : ''}${designation !== 'unrestricted' ? ` designated for ${designation}` : ''}.

${tierMessages[tier] || tierMessages.standard}${qpqDisclosure}

${!donation?.goods_services_provided ? 'No goods or services were provided in exchange for this contribution. ' : ''}This letter serves as your official acknowledgment for tax purposes. Zoeist, Inc. is a 501(c)(3) tax-exempt organization. Our EIN is 92-0954601.${donation?.receipt_number ? ` Receipt #${donation.receipt_number}.` : ''}

Please retain this letter for your tax records. We are grateful for your partnership in our mission.

With sincere appreciation,

${letter.signed_by || 'The Zoeist Team'}
Zoeist, Inc.
Georgia, United States
EIN: 92-0954601`;

      const letterHtml = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
body{font-family:Georgia,serif;color:#1a1a1a;max-width:700px;margin:40px auto;padding:0 20px;line-height:1.6}
.header{border-bottom:2px solid #c8a855;padding-bottom:16px;margin-bottom:24px}
.header h1{font-size:18px;color:#c8a855;margin:0}
.header p{font-size:12px;color:#666;margin:4px 0 0}
.footer{border-top:1px solid #ddd;padding-top:16px;margin-top:32px;font-size:11px;color:#888}
</style></head><body>
<div class="header"><h1>Zoeist, Inc.</h1><p>501(c)(3) Tax-Exempt Organization | EIN: 92-0954601</p></div>
${letterContent.split('\n\n').map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('\n')}
<div class="footer">
<p>This acknowledgment is provided in accordance with IRS requirements for charitable contributions.</p>
<p>Zoeist, Inc. | Georgia, United States | EIN: 92-0954601</p>
</div></body></html>`;

      return json({
        success: true,
        letter_id: letterId,
        tier,
        content_text: letterContent,
        content_html: letterHtml,
        donor_name: donorName,
        donor_address: donor?.address_line1 ? {
          line1: donor.address_line1,
          line2: donor.address_line2,
          city: donor.city,
          state: donor.state,
          zip: donor.zip,
        } : null,
      });
    }

    // ============ REFUND / VOID ============

    if (path === 'refund' && method === 'POST') {
      if (admin.role === 'viewer') return json({ error: 'Insufficient permissions' }, 403);
      const { donation_id, amount_cents, reason } = await req.json();

      const { data: donation } = await supabase.from('donations')
        .select('id, stripe_payment_intent_id, stripe_charge_id, amount_cents, status, donor_id')
        .eq('id', donation_id).single();
      if (!donation) return json({ error: 'Donation not found' }, 404);
      if (donation.status === 'refunded') return json({ error: 'Already refunded' }, 400);

      const refundAmount = amount_cents || donation.amount_cents;
      const isPartial = refundAmount < donation.amount_cents;

      // Process Stripe refund
      if (donation.stripe_payment_intent_id) {
        const params = [`payment_intent=${donation.stripe_payment_intent_id}`];
        if (isPartial) params.push(`amount=${refundAmount}`);
        if (reason) params.push(`reason=requested_by_customer`);
        await stripeApi('/refunds', 'POST', params.join('&'));
      }

      // Update donation record
      await supabase.from('donations').update({
        status: isPartial ? 'succeeded' : 'refunded',
        refunded_at: new Date().toISOString(),
        refund_amount_cents: refundAmount,
        refund_reason: reason || 'Admin refund',
      }).eq('id', donation_id);

      // Void receipt
      await supabase.from('donation_receipts').update({
        voided_at: new Date().toISOString(),
        voided_reason: `Refund: ${reason || 'Admin refund'}${isPartial ? ` (partial: ${refundAmount} cents)` : ''}`,
      }).eq('donation_id', donation_id).is('voided_at', null);

      // Update donor totals
      if (donation.donor_id) {
        const { data: donorDonations } = await supabase.from('donations')
          .select('amount_cents, refund_amount_cents')
          .eq('donor_id', donation.donor_id)
          .eq('status', 'succeeded');
        const total = (donorDonations || []).reduce((s, d) => s + d.amount_cents - (d.refund_amount_cents || 0), 0);
        const count = (donorDonations || []).length;
        await supabase.from('donors').update({
          total_donated_cents: Math.max(0, total),
          donation_count: count,
          updated_at: new Date().toISOString(),
        }).eq('id', donation.donor_id);
      }

      await supabase.from('admin_audit_log').insert({
        admin_user_id: admin.id, action: isPartial ? 'partial_refund' : 'full_refund',
        resource_type: 'donation', resource_id: donation_id,
        details: { amount_cents: refundAmount, reason },
      });

      return json({ success: true, refunded_cents: refundAmount, partial: isPartial });
    }

    // Void a receipt without refunding
    if (path === 'void-receipt' && method === 'POST') {
      if (admin.role === 'viewer') return json({ error: 'Insufficient permissions' }, 403);
      const { receipt_id, reason } = await req.json();

      const { error } = await supabase.from('donation_receipts').update({
        voided_at: new Date().toISOString(),
        voided_reason: reason || 'Voided by admin',
      }).eq('id', receipt_id);
      if (error) return json({ error: error.message }, 500);

      await supabase.from('admin_audit_log').insert({
        admin_user_id: admin.id, action: 'void_receipt',
        resource_type: 'donation_receipt', resource_id: receipt_id,
        details: { reason },
      });

      return json({ success: true });
    }

    // ============ BOARD REPORT ============

    if (path === 'board-report' && method === 'GET') {
      const year = parseInt(url.searchParams.get('year') || String(new Date().getFullYear()));
      const startDate = `${year}-01-01`;
      const endDate = `${year}-12-31`;

      // Donation summary
      const { data: donations } = await supabase.from('donations')
        .select('amount_cents, donation_type, designation, status, refund_amount_cents, donated_at')
        .eq('status', 'succeeded')
        .gte('donated_at', startDate).lte('donated_at', endDate + 'T23:59:59');

      const totalDonations = (donations || []).reduce((s, d) => s + d.amount_cents, 0);
      const totalRefunds = (donations || []).reduce((s, d) => s + (d.refund_amount_cents || 0), 0);
      const donationCount = (donations || []).length;

      // By designation
      const byDesignation: Record<string, { count: number; total: number }> = {};
      for (const d of (donations || [])) {
        const key = d.designation || 'unrestricted';
        if (!byDesignation[key]) byDesignation[key] = { count: 0, total: 0 };
        byDesignation[key].count++;
        byDesignation[key].total += d.amount_cents;
      }

      // By month
      const byMonth: Record<string, number> = {};
      for (const d of (donations || [])) {
        const m = d.donated_at?.slice(0, 7);
        if (m) byMonth[m] = (byMonth[m] || 0) + d.amount_cents;
      }

      // Donor counts
      const { count: totalDonors } = await supabase.from('donors').select('id', { count: 'exact', head: true });
      const { count: newDonors } = await supabase.from('donors').select('id', { count: 'exact', head: true })
        .gte('first_donated_at', startDate).lte('first_donated_at', endDate + 'T23:59:59');

      // Recurring
      const { data: recurring } = await supabase.from('recurring_donations').select('amount_cents, status');
      const activeRecurring = (recurring || []).filter(r => r.status === 'active');
      const mrr = activeRecurring.reduce((s, r) => s + r.amount_cents, 0);

      // Grants
      const { data: grants } = await supabase.from('grants').select('award_amount_cents, spent_to_date_cents, status');
      const activeGrants = (grants || []).filter(g => g.status === 'active');
      const totalGranted = activeGrants.reduce((s, g) => s + Number(g.award_amount_cents), 0);

      // Pledges
      const { data: pledges } = await supabase.from('pledges').select('total_pledge_cents, paid_to_date_cents, status');
      const activePledges = (pledges || []).filter(p => p.status === 'active');
      const totalPledged = activePledges.reduce((s, p) => s + Number(p.total_pledge_cents), 0);
      const totalPledgePaid = activePledges.reduce((s, p) => s + Number(p.paid_to_date_cents), 0);

      return json({
        year,
        donations: {
          total_cents: totalDonations,
          net_cents: totalDonations - totalRefunds,
          refund_cents: totalRefunds,
          count: donationCount,
          by_designation: Object.entries(byDesignation).map(([name, v]) => ({ name, ...v })).sort((a, b) => b.total - a.total),
          by_month: Object.entries(byMonth).map(([month, total]) => ({ month, total })).sort((a, b) => a.month.localeCompare(b.month)),
        },
        donors: { total: totalDonors || 0, new_this_year: newDonors || 0 },
        recurring: { active_count: activeRecurring.length, mrr_cents: mrr, arr_cents: mrr * 12 },
        grants: { active_count: activeGrants.length, total_awarded_cents: totalGranted },
        pledges: { active_count: activePledges.length, total_pledged_cents: totalPledged, total_paid_cents: totalPledgePaid },
      });
    }

    return json({ error: 'Not found', path }, 404);
  } catch (err) {
    console.error(`Admin extras API error: ${err.message}`);
    return json({ error: err.message }, 500);
  }
});
