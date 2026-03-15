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
  await supabase.from("admin_users").update({ last_login_at: new Date().toISOString() }).eq("id", admin.id);
  return { admin };
}

function extractPath(url: URL): string {
  const full = url.pathname;
  const marker = '/admin-api';
  const idx = full.indexOf(marker);
  if (idx === -1) return '';
  return full.substring(idx + marker.length).replace(/^\/+/, '');
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const url = new URL(req.url);
  const path = extractPath(url);
  const method = req.method;

  console.log(`Admin API: ${method} path="${path}"`);

  const authResult = await requireAdmin(req);
  if (authResult instanceof Response) return authResult;
  const { admin } = authResult;

  try {
    // ── OVERVIEW ──
    if (path === 'overview' || path === '') {
      const { data: summary } = await supabase.from("v_donation_summary").select("*").single();
      const { data: monthly } = await supabase.from("v_monthly_totals").select("*").limit(13);
      const { data: recentDonations } = await supabase.from("v_recent_donations").select("*").limit(10);
      const { data: topDonors } = await supabase.from("donors").select("id, first_name, last_name, email, total_donated_cents, donation_count, last_donated_at").order("total_donated_cents", { ascending: false }).limit(10);
      const { data: rawDesignations } = await supabase.from("donations").select("designation, amount_cents").eq("status", "succeeded");
      let designationData: unknown[] = [];
      if (rawDesignations) {
        const grouped: Record<string, { count: number; total: number }> = {};
        for (const d of rawDesignations) { const key = d.designation || "unrestricted"; if (!grouped[key]) grouped[key] = { count: 0, total: 0 }; grouped[key].count++; grouped[key].total += d.amount_cents; }
        designationData = Object.entries(grouped).map(([name, v]) => ({ designation: name, count: v.count, total_cents: v.total }));
      }
      return json({ summary, monthly, recentDonations, topDonors, designations: designationData, admin: { name: admin.display_name, role: admin.role } });
    }

    // ── DONATIONS ──
    if (path === 'donations' && method === 'GET') {
      const page = parseInt(url.searchParams.get("page") || "1");
      const limit = Math.min(parseInt(url.searchParams.get("limit") || "25"), 100);
      const status = url.searchParams.get("status");
      const search = url.searchParams.get("search");
      const sortBy = url.searchParams.get("sort_by") || "donated_at";
      const sortOrder = url.searchParams.get("sort_order") === "asc";
      const offset = (page - 1) * limit;
      let query = supabase.from("donations").select(`*, donor:donors(id, first_name, last_name, email)`, { count: "exact" });
      if (status) query = query.eq("status", status);
      if (search) {
        const { data: matchingDonors } = await supabase.from("donors").select("id").or(`email.ilike.%${search}%,first_name.ilike.%${search}%,last_name.ilike.%${search}%`);
        const donorIds = matchingDonors?.map((d: { id: string }) => d.id) || [];
        if (donorIds.length > 0) { query = query.or(`receipt_number.ilike.%${search}%,donor_id.in.(${donorIds.join(",")})`); }
        else { query = query.ilike("receipt_number", `%${search}%`); }
      }
      query = query.order(sortBy, { ascending: sortOrder }).range(offset, offset + limit - 1);
      const { data: donations, count, error: qErr } = await query;
      if (qErr) return json({ error: qErr.message }, 500);
      return json({ donations, total: count, page, limit, totalPages: Math.ceil((count || 0) / limit) });
    }

    // ── DONORS LIST ──
    if (path === 'donors' && method === 'GET') {
      const page = parseInt(url.searchParams.get("page") || "1");
      const limit = Math.min(parseInt(url.searchParams.get("limit") || "25"), 100);
      const search = url.searchParams.get("search");
      const sortBy = url.searchParams.get("sort_by") || "total_donated_cents";
      const sortOrder = url.searchParams.get("sort_order") === "asc";
      const offset = (page - 1) * limit;
      let query = supabase.from("donors").select("*", { count: "exact" });
      if (search) query = query.or(`email.ilike.%${search}%,first_name.ilike.%${search}%,last_name.ilike.%${search}%`);
      query = query.order(sortBy, { ascending: sortOrder }).range(offset, offset + limit - 1);
      const { data: donors, count, error: qErr } = await query;
      if (qErr) return json({ error: qErr.message }, 500);
      return json({ donors, total: count, page, limit, totalPages: Math.ceil((count || 0) / limit) });
    }

    // ── SINGLE DONOR (GET) ──
    if (path.startsWith('donor/') && method === 'GET') {
      const donorId = path.replace('donor/', '');
      const { data: donor } = await supabase.from("donors").select("*").eq("id", donorId).single();
      if (!donor) return json({ error: "Donor not found" }, 404);
      const { data: donations } = await supabase.from("donations").select("*").eq("donor_id", donorId).order("donated_at", { ascending: false });
      return json({ donor, donations });
    }

    // ── UPDATE DONOR (PUT) ──
    if (path.startsWith('donor/') && method === 'PUT') {
      if (admin.role === 'viewer') return json({ error: "Insufficient permissions" }, 403);
      const donorId = path.replace('donor/', '');
      const body = await req.json();
      const allowed = ['first_name', 'last_name', 'email', 'phone', 'address_line1', 'address_line2', 'city', 'state', 'zip', 'country', 'employer', 'is_anonymous'];
      const updates: Record<string, unknown> = {};
      for (const key of allowed) {
        if (key in body) updates[key] = body[key];
      }
      updates.updated_at = new Date().toISOString();
      const { data: donor, error } = await supabase.from("donors").update(updates).eq("id", donorId).select().single();
      if (error) return json({ error: error.message }, 500);
      await supabase.from("admin_audit_log").insert({ admin_user_id: admin.id, action: "update_donor", resource_type: "donor", resource_id: donorId, details: updates });
      return json({ success: true, donor });
    }

    // ── COMPLIANCE ──
    if (path === 'compliance' && method === 'GET') {
      const { data: pendingReceipts, count: pendingCount } = await supabase.from("donations")
        .select(`id, receipt_number, amount_cents, donated_at, donor:donors(first_name, last_name, email)`, { count: "exact" })
        .eq("status", "succeeded").is("thank_you_sent_at", null).order("donated_at", { ascending: true }).limit(50);
      const { data: filings } = await supabase.from("compliance_filings").select("*").order("due_date", { ascending: true }).limit(20);
      const { data: deadlines } = await supabase.from("compliance_deadlines").select("*").order("deadline_date", { ascending: true }).limit(20);
      const { data: stateRegs } = await supabase.from("state_registrations").select("*").order("expiration_date", { ascending: true });
      const { data: largeUnreceipted, count: largeCount } = await supabase.from("donations")
        .select(`id, receipt_number, amount_cents, donated_at, donor:donors(first_name, last_name, email)`, { count: "exact" })
        .eq("status", "succeeded").is("receipt_issued_at", null).gte("amount_cents", 25000).order("donated_at", { ascending: true }).limit(50);
      return json({ pendingReceipts, pendingCount, largeUnreceipted, largeUnreceiptedCount: largeCount, filings, deadlines, stateRegistrations: stateRegs });
    }

    // ── RESEND RECEIPT ──
    if (path === 'resend-receipt' && method === 'POST') {
      if (admin.role === 'viewer') return json({ error: "Insufficient permissions" }, 403);
      const { donation_id } = await req.json();
      await supabase.from("donations").update({ thank_you_sent_at: null }).eq("id", donation_id);
      await supabase.from("donation_receipts").update({ sent_at: null }).eq("donation_id", donation_id).eq("receipt_type", "instant");
      const { error } = await supabase.functions.invoke("send-donation-receipt", { body: { donation_id } });
      await supabase.from("admin_audit_log").insert({ admin_user_id: admin.id, action: "resend_receipt", resource_type: "donation", resource_id: donation_id });
      if (error) return json({ error: error.message }, 500);
      return json({ success: true });
    }

    // ── DEADLINE CRUD ──
    if (path.startsWith('deadline/') && method === 'PUT') {
      if (admin.role === 'viewer') return json({ error: "Insufficient permissions" }, 403);
      const id = path.replace('deadline/', '');
      const body = await req.json();
      const { data, error } = await supabase.from("compliance_deadlines").update(body).eq("id", id).select().single();
      if (error) return json({ error: error.message }, 500);
      await supabase.from("admin_audit_log").insert({ admin_user_id: admin.id, action: "update_deadline", resource_type: "compliance_deadline", resource_id: id, details: body });
      return json({ success: true, deadline: data });
    }
    if (path === 'deadline' && method === 'POST') {
      if (admin.role === 'viewer') return json({ error: "Insufficient permissions" }, 403);
      const body = await req.json();
      const { data, error } = await supabase.from("compliance_deadlines").insert(body).select().single();
      if (error) return json({ error: error.message }, 500);
      await supabase.from("admin_audit_log").insert({ admin_user_id: admin.id, action: "create_deadline", resource_type: "compliance_deadline", resource_id: data.id, details: body });
      return json({ success: true, deadline: data });
    }
    if (path.startsWith('deadline/') && method === 'DELETE') {
      if (admin.role !== 'super_admin' && admin.role !== 'admin') return json({ error: "Insufficient permissions" }, 403);
      const id = path.replace('deadline/', '');
      const { error } = await supabase.from("compliance_deadlines").delete().eq("id", id);
      if (error) return json({ error: error.message }, 500);
      await supabase.from("admin_audit_log").insert({ admin_user_id: admin.id, action: "delete_deadline", resource_type: "compliance_deadline", resource_id: id });
      return json({ success: true });
    }

    // ── STATE REGISTRATION CRUD ──
    if (path.startsWith('state-registration/') && method === 'PUT') {
      if (admin.role === 'viewer') return json({ error: "Insufficient permissions" }, 403);
      const id = path.replace('state-registration/', '');
      const body = await req.json();
      const { data, error } = await supabase.from("state_registrations").update(body).eq("id", id).select().single();
      if (error) return json({ error: error.message }, 500);
      await supabase.from("admin_audit_log").insert({ admin_user_id: admin.id, action: "update_state_registration", resource_type: "state_registration", resource_id: id, details: body });
      return json({ success: true, registration: data });
    }
    if (path === 'state-registration' && method === 'POST') {
      if (admin.role === 'viewer') return json({ error: "Insufficient permissions" }, 403);
      const body = await req.json();
      const { data, error } = await supabase.from("state_registrations").insert(body).select().single();
      if (error) return json({ error: error.message }, 500);
      await supabase.from("admin_audit_log").insert({ admin_user_id: admin.id, action: "create_state_registration", resource_type: "state_registration", resource_id: data.id, details: body });
      return json({ success: true, registration: data });
    }
    if (path.startsWith('state-registration/') && method === 'DELETE') {
      if (admin.role !== 'super_admin' && admin.role !== 'admin') return json({ error: "Insufficient permissions" }, 403);
      const id = path.replace('state-registration/', '');
      const { error } = await supabase.from("state_registrations").delete().eq("id", id);
      if (error) return json({ error: error.message }, 500);
      await supabase.from("admin_audit_log").insert({ admin_user_id: admin.id, action: "delete_state_registration", resource_type: "state_registration", resource_id: id });
      return json({ success: true });
    }

    // ── FILING UPDATE ──
    if (path.startsWith('filing/') && method === 'PUT') {
      if (admin.role === 'viewer') return json({ error: "Insufficient permissions" }, 403);
      const id = path.replace('filing/', '');
      const body = await req.json();
      const { data, error } = await supabase.from("compliance_filings").update(body).eq("id", id).select().single();
      if (error) return json({ error: error.message }, 500);
      await supabase.from("admin_audit_log").insert({ admin_user_id: admin.id, action: "update_filing", resource_type: "compliance_filing", resource_id: id, details: body });
      return json({ success: true, filing: data });
    }

    // ── EXPORTS ──
    if (path === 'export/donations') {
      if (admin.role === 'viewer') return json({ error: "Insufficient permissions" }, 403);
      const { data: donations } = await supabase.from("v_recent_donations").select("*").limit(10000);
      if (!donations || donations.length === 0) return json({ error: "No donations found" }, 404);
      const headers = ["Receipt Number","Date","Donor Name","Email","Amount","Status","Type","Designation","Payment Method","Thank You Sent"];
      const rows = donations.map((d: Record<string, unknown>) => [
        d.receipt_number || "", (d.donated_at as string)?.split("T")[0] || "",
        `${d.first_name} ${d.last_name}`, d.email,
        ((d.amount_cents as number) / 100).toFixed(2), d.status, d.donation_type || "one_time",
        d.designation || "unrestricted", `${d.card_brand || ""} ${d.card_last_four || ""}`.trim(),
        d.thank_you_sent_at ? "Yes" : "No"
      ]);
      const csv = [headers.join(","), ...rows.map((r: string[]) => r.map(v => `"${v}"`).join(","))].join("\n");
      await supabase.from("admin_audit_log").insert({ admin_user_id: admin.id, action: "export_donations_csv", details: { count: donations.length } });
      return new Response(csv, { headers: { ...corsHeaders, "Content-Type": "text/csv", "Content-Disposition": `attachment; filename="donations-export.csv"` } });
    }
    if (path === 'export/donors') {
      if (admin.role === 'viewer') return json({ error: "Insufficient permissions" }, 403);
      const { data: donors } = await supabase.from("donors").select("*").order("total_donated_cents", { ascending: false }).limit(10000);
      if (!donors || donors.length === 0) return json({ error: "No donors found" }, 404);
      const headers = ["Name","Email","Phone","Address","City","State","ZIP","Country","Total Donated","Donation Count","First Donation","Last Donation"];
      const rows = donors.map((d: Record<string, unknown>) => [
        `${d.first_name} ${d.last_name}`, d.email, d.phone || "",
        [d.address_line1, d.address_line2].filter(Boolean).join(', '),
        d.city || "", d.state || "", d.zip || "", d.country || "US",
        (((d.total_donated_cents as number) || 0) / 100).toFixed(2), d.donation_count || 0,
        (d.first_donated_at as string)?.split("T")[0] || "", (d.last_donated_at as string)?.split("T")[0] || ""
      ]);
      const csv = [headers.join(","), ...rows.map((r: (string|number)[]) => r.map(v => `"${v}"`).join(","))].join("\n");
      await supabase.from("admin_audit_log").insert({ admin_user_id: admin.id, action: "export_donors_csv", details: { count: donors.length } });
      return new Response(csv, { headers: { ...corsHeaders, "Content-Type": "text/csv", "Content-Disposition": `attachment; filename="donors-export.csv"` } });
    }

    return json({ error: "Not found", path }, 404);
  } catch (err) {
    console.error(`Admin API error: ${err.message}`);
    return json({ error: err.message }, 500);
  }
});
