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
  const marker = '/matching-gifts-api';
  const idx = full.indexOf(marker);
  if (idx === -1) return '';
  return full.substring(idx + marker.length).replace(/^\/+/, '');
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
    // -- STATS --
    if (path === 'stats' && method === 'GET') {
      const { data: all } = await supabase.from('matching_gifts').select('status, match_amount_cents');
      const stats = { identified: 0, submitted: 0, approved: 0, received: 0, denied: 0, expired: 0, total_pending_cents: 0, total_received_cents: 0 };
      for (const mg of (all || [])) {
        stats[mg.status as keyof typeof stats] = (stats[mg.status as keyof typeof stats] as number || 0) + 1;
        if (['identified', 'submitted', 'approved'].includes(mg.status)) stats.total_pending_cents += mg.match_amount_cents;
        if (mg.status === 'received') stats.total_received_cents += mg.match_amount_cents;
      }
      const { count: companyCount } = await supabase.from('matching_gift_companies').select('*', { count: 'exact', head: true });
      return json({ ...stats, total: (all || []).length, companies: companyCount || 0 });
    }

    // -- LIST MATCHING GIFTS --
    if (path === 'list' && method === 'GET') {
      const page = parseInt(url.searchParams.get('page') || '1');
      const limit = Math.min(parseInt(url.searchParams.get('limit') || '25'), 100);
      const status = url.searchParams.get('status');
      const search = url.searchParams.get('search');
      const offset = (page - 1) * limit;

      let query = supabase.from('matching_gifts')
        .select('*, donation:donations(receipt_number, donated_at, amount_cents, status), donor:donors(id, first_name, last_name, email, employer)', { count: 'exact' });

      if (status) query = query.eq('status', status);
      if (search) {
        query = query.or(`company_name.ilike.%${search}%`);
      }
      query = query.order('created_at', { ascending: false }).range(offset, offset + limit - 1);

      const { data: matches, count, error: qErr } = await query;
      if (qErr) return json({ error: qErr.message }, 500);
      return json({ matches, total: count, page, limit, totalPages: Math.ceil((count || 0) / limit) });
    }

    // -- ELIGIBLE DONATIONS --
    if (path === 'eligible' && method === 'GET') {
      const { data: donations } = await supabase
        .from('donations')
        .select('id, receipt_number, amount_cents, donated_at, donor_id, donor:donors(id, first_name, last_name, email, employer)')
        .eq('status', 'succeeded')
        .not('donor_id', 'is', null)
        .order('donated_at', { ascending: false })
        .limit(200);

      const { data: existingMatches } = await supabase.from('matching_gifts').select('donation_id');
      const matchedIds = new Set((existingMatches || []).map(m => m.donation_id));

      const eligible = (donations || []).filter((d: any) =>
        d.donor?.employer && d.donor.employer.trim() !== '' && !matchedIds.has(d.id)
      );

      return json({ eligible });
    }

    // -- CREATE MATCHING GIFT --
    if (path === 'create' && method === 'POST') {
      if (admin.role === 'viewer') return json({ error: 'Insufficient permissions' }, 403);
      const body = await req.json();
      const { donation_id, company_name, match_ratio, match_amount_cents, notes } = body;

      if (!donation_id || !company_name) return json({ error: 'donation_id and company_name required' }, 400);

      const { data: donation } = await supabase.from('donations').select('id, donor_id, amount_cents').eq('id', donation_id).single();
      if (!donation) return json({ error: 'Donation not found' }, 404);

      const { data: existing } = await supabase.from('matching_gifts').select('id').eq('donation_id', donation_id).single();
      if (existing) return json({ error: 'Match already exists for this donation' }, 409);

      const { data: company } = await supabase.from('matching_gift_companies').select('id, match_ratio, max_match_cents')
        .ilike('company_name', company_name).single();

      const ratio = match_ratio || company?.match_ratio || 1.0;
      const calculatedMatch = Math.round(donation.amount_cents * ratio);
      const finalMatch = match_amount_cents || (company?.max_match_cents ? Math.min(calculatedMatch, company.max_match_cents) : calculatedMatch);

      const { data: mg, error } = await supabase.from('matching_gifts').insert({
        donation_id,
        donor_id: donation.donor_id,
        company_id: company?.id || null,
        company_name,
        match_ratio: ratio,
        original_amount_cents: donation.amount_cents,
        match_amount_cents: finalMatch,
        status: 'identified',
        notes,
      }).select().single();

      if (error) return json({ error: error.message }, 500);

      await supabase.from('admin_audit_log').insert({
        admin_user_id: admin.id, action: 'create_matching_gift',
        resource_type: 'matching_gift', resource_id: mg.id,
        details: { donation_id, company_name, match_amount_cents: finalMatch },
      });

      return json({ success: true, matching_gift: mg });
    }

    // -- UPDATE MATCHING GIFT STATUS --
    if (path.startsWith('update/') && method === 'PUT') {
      if (admin.role === 'viewer') return json({ error: 'Insufficient permissions' }, 403);
      const id = path.replace('update/', '');
      const body = await req.json();

      // Validate status transitions
      if (body.status) {
        const validStatuses = ['identified', 'submitted', 'approved', 'received', 'denied', 'expired'];
        if (!validStatuses.includes(body.status)) {
          return json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` }, 400);
        }
        // Fetch current status to validate transition
        const { data: current } = await supabase.from('matching_gifts').select('status').eq('id', id).single();
        if (!current) return json({ error: 'Matching gift not found' }, 404);

        const validTransitions: Record<string, string[]> = {
          identified: ['submitted', 'denied', 'expired'],
          submitted: ['approved', 'denied', 'expired'],
          approved: ['received', 'denied'],
          received: [],  // terminal state
          denied: ['identified'],  // allow re-opening
          expired: ['identified'],  // allow re-opening
        };
        const allowed_transitions = validTransitions[current.status] || [];
        if (!allowed_transitions.includes(body.status)) {
          return json({ error: `Cannot transition from '${current.status}' to '${body.status}'. Allowed: ${allowed_transitions.join(', ') || 'none (terminal state)'}` }, 400);
        }
        // Require denial_reason when denying
        if (body.status === 'denied' && !body.denial_reason) {
          return json({ error: 'denial_reason required when setting status to denied' }, 400);
        }
      }

      const allowed = ['status', 'match_amount_cents', 'match_ratio', 'notes', 'denial_reason', 'match_receipt_number', 'company_name'];
      const updates: Record<string, unknown> = {};
      for (const key of allowed) {
        if (key in body) updates[key] = body[key];
      }

      if (body.status === 'submitted') updates.submitted_at = new Date().toISOString();
      if (body.status === 'approved') updates.approved_at = new Date().toISOString();
      if (body.status === 'received') updates.received_at = new Date().toISOString();
      if (body.status === 'denied') updates.denied_at = new Date().toISOString();
      updates.updated_at = new Date().toISOString();

      const { data: mg, error } = await supabase.from('matching_gifts').update(updates).eq('id', id).select().single();
      if (error) return json({ error: error.message }, 500);

      await supabase.from('admin_audit_log').insert({
        admin_user_id: admin.id, action: 'update_matching_gift',
        resource_type: 'matching_gift', resource_id: id, details: updates,
      });

      return json({ success: true, matching_gift: mg });
    }

    // -- DELETE MATCHING GIFT --
    if (path.startsWith('delete/') && method === 'DELETE') {
      if (admin.role !== 'super_admin' && admin.role !== 'admin') return json({ error: 'Insufficient permissions' }, 403);
      const id = path.replace('delete/', '');
      const { error } = await supabase.from('matching_gifts').delete().eq('id', id);
      if (error) return json({ error: error.message }, 500);

      await supabase.from('admin_audit_log').insert({
        admin_user_id: admin.id, action: 'delete_matching_gift',
        resource_type: 'matching_gift', resource_id: id,
      });

      return json({ success: true });
    }

    // -- COMPANIES: LIST --
    if (path === 'companies' && method === 'GET') {
      const search = url.searchParams.get('search');
      let query = supabase.from('matching_gift_companies').select('*').order('company_name');
      if (search) query = query.ilike('company_name', `%${search}%`);
      const { data: companies, error } = await query.limit(100);
      if (error) return json({ error: error.message }, 500);
      return json({ companies });
    }

    // -- COMPANIES: CREATE --
    if (path === 'companies' && method === 'POST') {
      if (admin.role === 'viewer') return json({ error: 'Insufficient permissions' }, 403);
      const body = await req.json();
      const { data: company, error } = await supabase.from('matching_gift_companies').insert(body).select().single();
      if (error) return json({ error: error.message }, 500);

      await supabase.from('admin_audit_log').insert({
        admin_user_id: admin.id, action: 'create_matching_company',
        resource_type: 'matching_gift_company', resource_id: company.id,
        details: { company_name: body.company_name },
      });

      return json({ success: true, company });
    }

    // -- COMPANIES: UPDATE --
    if (path.startsWith('companies/') && method === 'PUT') {
      if (admin.role === 'viewer') return json({ error: 'Insufficient permissions' }, 403);
      const id = path.replace('companies/', '');
      const body = await req.json();
      body.updated_at = new Date().toISOString();
      const { data: company, error } = await supabase.from('matching_gift_companies').update(body).eq('id', id).select().single();
      if (error) return json({ error: error.message }, 500);

      await supabase.from('admin_audit_log').insert({
        admin_user_id: admin.id, action: 'update_matching_company',
        resource_type: 'matching_gift_company', resource_id: id, details: body,
      });

      return json({ success: true, company });
    }

    // -- COMPANIES: DELETE --
    if (path.startsWith('companies/') && method === 'DELETE') {
      if (admin.role !== 'super_admin' && admin.role !== 'admin') return json({ error: 'Insufficient permissions' }, 403);
      const id = path.replace('companies/', '');
      const { error } = await supabase.from('matching_gift_companies').delete().eq('id', id);
      if (error) return json({ error: error.message }, 500);

      await supabase.from('admin_audit_log').insert({
        admin_user_id: admin.id, action: 'delete_matching_company',
        resource_type: 'matching_gift_company', resource_id: id,
      });

      return json({ success: true });
    }

    return json({ error: 'Not found', path }, 404);
  } catch (err) {
    console.error(`Matching gifts API error: ${err.message}`);
    return json({ error: err.message }, 500);
  }
});
