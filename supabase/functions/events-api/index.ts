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
  const marker = '/events-api';
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
      const { data: events } = await supabase.from('events').select('id, ticket_price_cents, fair_market_value_cents, tax_deductible_cents, tickets_sold, is_active, event_date, total_revenue_cents');
      const now = new Date().toISOString();
      let activeCount = 0, pastCount = 0, totalRevenue = 0, totalAttendees = 0;
      for (const e of (events || [])) {
        if (e.is_active && e.event_date >= now) activeCount++;
        else pastCount++;
        totalRevenue += e.total_revenue_cents || 0;
        totalAttendees += e.tickets_sold || 0;
      }
      return json({ active: activeCount, past: pastCount, total_events: (events || []).length, total_revenue_cents: totalRevenue, total_attendees: totalAttendees });
    }

    // -- LIST EVENTS --
    if (path === 'list' && method === 'GET') {
      const page = parseInt(url.searchParams.get('page') || '1');
      const limit = Math.min(parseInt(url.searchParams.get('limit') || '25'), 100);
      const status = url.searchParams.get('status');
      const offset = (page - 1) * limit;

      let query = supabase.from('events').select('*', { count: 'exact' });
      if (status === 'active') query = query.eq('is_active', true);
      if (status === 'past') query = query.eq('is_active', false);
      query = query.order('event_date', { ascending: false }).range(offset, offset + limit - 1);

      const { data: events, count, error: qErr } = await query;
      if (qErr) return json({ error: qErr.message }, 500);
      return json({ events, total: count, page, limit, totalPages: Math.ceil((count || 0) / limit) });
    }

    // -- GET EVENT DETAIL --
    if (path.match(/^event\/[^/]+$/) && method === 'GET') {
      const id = path.replace('event/', '');
      const { data: event } = await supabase.from('events').select('*').eq('id', id).single();
      if (!event) return json({ error: 'Event not found' }, 404);

      const { data: attendees } = await supabase.from('event_attendees').select('*, donor:donors(first_name, last_name, email)').eq('event_id', id).order('created_at');
      const { data: donations } = await supabase.from('donations').select('id, receipt_number, amount_cents, tax_deductible_amount_cents, goods_services_value_cents, status, donated_at, donor:donors(first_name, last_name, email)').eq('event_id', id).order('donated_at', { ascending: false });

      return json({ event, attendees: attendees || [], donations: donations || [] });
    }

    // -- CREATE EVENT --
    if (path === 'event' && method === 'POST') {
      if (admin.role === 'viewer') return json({ error: 'Insufficient permissions' }, 403);
      const body = await req.json();

      const insert = {
        name: body.name,
        description: body.description || null,
        event_date: body.event_date,
        venue: body.venue || null,
        ticket_price_cents: body.ticket_price_cents || 0,
        fair_market_value_cents: body.fair_market_value_cents || 0,
        capacity: body.capacity || null,
        campaign_id: body.campaign_id || null,
        is_active: body.is_active !== false,
      };

      const { data: event, error } = await supabase.from('events').insert(insert).select().single();
      if (error) return json({ error: error.message }, 500);

      await supabase.from('admin_audit_log').insert({
        admin_user_id: admin.id, action: 'create_event',
        resource_type: 'event', resource_id: event.id,
        details: { name: body.name },
      });

      return json({ success: true, event });
    }

    // -- UPDATE EVENT --
    if (path.match(/^event\/[^/]+$/) && method === 'PUT') {
      if (admin.role === 'viewer') return json({ error: 'Insufficient permissions' }, 403);
      const id = path.replace('event/', '');
      const body = await req.json();

      const allowed = ['name', 'description', 'event_date', 'venue', 'ticket_price_cents', 'fair_market_value_cents', 'capacity', 'campaign_id', 'is_active'];
      const updates: Record<string, unknown> = {};
      for (const key of allowed) {
        if (key in body) updates[key] = body[key];
      }

      updates.updated_at = new Date().toISOString();

      const { data: event, error } = await supabase.from('events').update(updates).eq('id', id).select().single();
      if (error) return json({ error: error.message }, 500);

      await supabase.from('admin_audit_log').insert({
        admin_user_id: admin.id, action: 'update_event',
        resource_type: 'event', resource_id: id, details: updates,
      });

      return json({ success: true, event });
    }

    // -- DELETE EVENT --
    if (path.match(/^event\/[^/]+$/) && method === 'DELETE') {
      if (admin.role !== 'super_admin' && admin.role !== 'admin') return json({ error: 'Insufficient permissions' }, 403);
      const id = path.replace('event/', '');

      await supabase.from('donations').update({ event_id: null }).eq('event_id', id);
      const { error } = await supabase.from('events').delete().eq('id', id);
      if (error) return json({ error: error.message }, 500);

      await supabase.from('admin_audit_log').insert({
        admin_user_id: admin.id, action: 'delete_event',
        resource_type: 'event', resource_id: id,
      });

      return json({ success: true });
    }

    // -- ADD ATTENDEE --
    if (path === 'attendee' && method === 'POST') {
      if (admin.role === 'viewer') return json({ error: 'Insufficient permissions' }, 403);
      const body = await req.json();

      const { data: attendee, error } = await supabase.from('event_attendees').insert({
        event_id: body.event_id,
        donor_id: body.donor_id || null,
        donation_id: body.donation_id || null,
        name: body.name,
        email: body.email || null,
        ticket_type: body.ticket_type || 'general',
        ticket_price_cents: body.ticket_price_cents || 0,
        notes: body.notes || null,
      }).select().single();

      if (error) return json({ error: error.message }, 500);

      // Update tickets_sold count
      const { count } = await supabase.from('event_attendees').select('id', { count: 'exact', head: true }).eq('event_id', body.event_id);
      await supabase.from('events').update({ tickets_sold: count || 0 }).eq('id', body.event_id);

      return json({ success: true, attendee });
    }

    // -- CHECK IN ATTENDEE --
    if (path.match(/^attendee\/[^/]+\/checkin$/) && method === 'PUT') {
      if (admin.role === 'viewer') return json({ error: 'Insufficient permissions' }, 403);
      const id = path.replace('attendee/', '').replace('/checkin', '');

      const { data: attendee, error } = await supabase.from('event_attendees').update({
        checked_in: true,
        checked_in_at: new Date().toISOString(),
      }).eq('id', id).select().single();

      if (error) return json({ error: error.message }, 500);
      return json({ success: true, attendee });
    }

    // -- DELETE ATTENDEE --
    if (path.match(/^attendee\/[^/]+$/) && method === 'DELETE') {
      if (admin.role === 'viewer') return json({ error: 'Insufficient permissions' }, 403);
      const id = path.replace('attendee/', '');

      const { data: att } = await supabase.from('event_attendees').select('event_id').eq('id', id).single();
      const { error } = await supabase.from('event_attendees').delete().eq('id', id);
      if (error) return json({ error: error.message }, 500);

      if (att) {
        const { count } = await supabase.from('event_attendees').select('id', { count: 'exact', head: true }).eq('event_id', att.event_id);
        await supabase.from('events').update({ tickets_sold: count || 0 }).eq('id', att.event_id);
      }

      return json({ success: true });
    }

    // -- LINK DONATION TO EVENT --
    if (path === 'link-donation' && method === 'POST') {
      if (admin.role === 'viewer') return json({ error: 'Insufficient permissions' }, 403);
      const { event_id, donation_id } = await req.json();

      const { data: event } = await supabase.from('events').select('fair_market_value_cents, ticket_price_cents, tax_deductible_cents, name').eq('id', event_id).single();
      if (!event) return json({ error: 'Event not found' }, 404);

      const { data: donation } = await supabase.from('donations').select('id, amount_cents').eq('id', donation_id).single();
      if (!donation) return json({ error: 'Donation not found' }, 404);

      const fmv = event.fair_market_value_cents || 0;
      const qpqRequired = donation.amount_cents >= 7500 && fmv > 0;
      const taxDeductible = qpqRequired ? Math.max(0, donation.amount_cents - fmv) : donation.amount_cents;

      const updates: Record<string, unknown> = {
        event_id,
        updated_at: new Date().toISOString(),
      };

      if (qpqRequired) {
        updates.goods_services_provided = true;
        updates.goods_services_description = `Event: ${event.name} — goods/services provided`;
        updates.goods_services_value_cents = fmv;
        updates.tax_deductible_amount_cents = taxDeductible;
      }

      const { error } = await supabase.from('donations').update(updates).eq('id', donation_id);
      if (error) return json({ error: error.message }, 500);

      const { data: eventDonations } = await supabase.from('donations').select('amount_cents').eq('event_id', event_id).eq('status', 'succeeded');
      const totalRev = (eventDonations || []).reduce((s: number, d: any) => s + d.amount_cents, 0);
      await supabase.from('events').update({ total_revenue_cents: totalRev }).eq('id', event_id);

      await supabase.from('admin_audit_log').insert({
        admin_user_id: admin.id, action: 'link_donation_event',
        resource_type: 'donation', resource_id: donation_id,
        details: { event_id, qpq_required: qpqRequired, fmv, tax_deductible: taxDeductible },
      });

      return json({ success: true, qpq_applied: qpqRequired, tax_deductible_cents: taxDeductible });
    }

    // -- UNLINK DONATION FROM EVENT --
    if (path === 'unlink-donation' && method === 'POST') {
      if (admin.role === 'viewer') return json({ error: 'Insufficient permissions' }, 403);
      const { donation_id } = await req.json();

      const { data: donation } = await supabase.from('donations').select('event_id').eq('id', donation_id).single();
      if (!donation) return json({ error: 'Donation not found' }, 404);
      const oldEventId = donation.event_id;

      await supabase.from('donations').update({
        event_id: null,
        goods_services_provided: false,
        goods_services_description: null,
        goods_services_value_cents: 0,
        tax_deductible_amount_cents: null,
        updated_at: new Date().toISOString(),
      }).eq('id', donation_id);

      if (oldEventId) {
        const { data: eventDonations } = await supabase.from('donations').select('amount_cents').eq('event_id', oldEventId).eq('status', 'succeeded');
        const totalRev = (eventDonations || []).reduce((s: number, d: any) => s + d.amount_cents, 0);
        await supabase.from('events').update({ total_revenue_cents: totalRev }).eq('id', oldEventId);
      }

      return json({ success: true });
    }

    return json({ error: 'Not found', path }, 404);
  } catch (err) {
    console.error(`Events API error: ${err.message}`);
    return json({ error: err.message }, 500);
  }
});
