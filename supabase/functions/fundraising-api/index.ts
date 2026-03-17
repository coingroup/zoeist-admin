import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
const supabaseUrl = Deno.env.get("SUPABASE_URL");
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const supabase = createClient(supabaseUrl, supabaseServiceKey);
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS"
};
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json"
    }
  });
}
async function requireAdmin(req) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({
    error: "No authorization header"
  }, 401);
  const token = authHeader.replace("Bearer ", "");
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return json({
    error: "Invalid token"
  }, 401);
  const { data: admin } = await supabase.from("admin_users").select("*").eq("auth_user_id", user.id).eq("is_active", true).single();
  if (!admin) return json({
    error: "Not an admin"
  }, 403);
  return {
    admin
  };
}
function extractPath(url) {
  const full = url.pathname;
  const marker = '/fundraising-api';
  const idx = full.indexOf(marker);
  if (idx === -1) return '';
  return full.substring(idx + marker.length).replace(/^\/+/, '');
}
Deno.serve(async (req)=>{
  if (req.method === "OPTIONS") return new Response(null, {
    headers: corsHeaders
  });
  const url = new URL(req.url);
  const path = extractPath(url);
  const method = req.method;
  const authResult = await requireAdmin(req);
  if (authResult instanceof Response) return authResult;
  const { admin } = authResult;
  try {
    // ============ STATS ============
    if (path === 'stats' && method === 'GET') {
      const { data: pledges } = await supabase.from('pledges').select('status, total_pledge_cents, paid_to_date_cents');
      const { data: inkind } = await supabase.from('in_kind_donations').select('estimated_value_cents, form_8283_required, form_8283_signed');
      const { data: grants } = await supabase.from('grants').select('status, award_amount_cents, spent_to_date_cents, next_report_due');
      const pledgeStats = {
        active: 0,
        completed: 0,
        cancelled: 0,
        total_pledged: 0,
        total_paid: 0
      };
      for (const p of pledges || []){
        if (p.status === 'active') pledgeStats.active++;
        else if (p.status === 'completed') pledgeStats.completed++;
        else pledgeStats.cancelled++;
        pledgeStats.total_pledged += Number(p.total_pledge_cents) || 0;
        pledgeStats.total_paid += Number(p.paid_to_date_cents) || 0;
      }
      const inkindStats = {
        count: (inkind || []).length,
        total_value: 0,
        pending_8283: 0
      };
      for (const ik of inkind || []){
        inkindStats.total_value += Number(ik.estimated_value_cents) || 0;
        if (ik.form_8283_required && !ik.form_8283_signed) inkindStats.pending_8283++;
      }
      const now = new Date().toISOString().split('T')[0];
      const grantStats = {
        active: 0,
        completed: 0,
        total_awarded: 0,
        total_spent: 0,
        reports_due_soon: 0
      };
      for (const g of grants || []){
        if (g.status === 'active') grantStats.active++;
        else grantStats.completed++;
        grantStats.total_awarded += Number(g.award_amount_cents) || 0;
        grantStats.total_spent += Number(g.spent_to_date_cents) || 0;
        if (g.next_report_due && g.next_report_due <= now) grantStats.reports_due_soon++;
      }
      return json({
        pledges: pledgeStats,
        in_kind: inkindStats,
        grants: grantStats
      });
    }
    // ============ PLEDGES ============
    if (path === 'pledges' && method === 'GET') {
      const page = parseInt(url.searchParams.get('page') || '1');
      const limit = Math.min(parseInt(url.searchParams.get('limit') || '25'), 100);
      const status = url.searchParams.get('status');
      const offset = (page - 1) * limit;
      let query = supabase.from('pledges').select('*, donor:donors(id, first_name, last_name, email)', {
        count: 'exact'
      });
      if (status) query = query.eq('status', status);
      query = query.order('created_at', {
        ascending: false
      }).range(offset, offset + limit - 1);
      const { data, count, error: qErr } = await query;
      if (qErr) return json({
        error: qErr.message
      }, 500);
      return json({
        pledges: data,
        total: count,
        page,
        limit,
        totalPages: Math.ceil((count || 0) / limit)
      });
    }
    if (path === 'pledge' && method === 'POST') {
      if (admin.role === 'viewer') return json({
        error: 'Insufficient permissions'
      }, 403);
      const body = await req.json();
      const { data, error } = await supabase.from('pledges').insert({
        donor_id: body.donor_id,
        total_pledge_cents: body.total_pledge_cents,
        installment_count: body.installment_count || null,
        installment_amount_cents: body.installment_amount_cents || null,
        frequency: body.frequency || null,
        designation: body.designation || 'unrestricted',
        start_date: body.start_date,
        next_payment_date: body.next_payment_date || body.start_date,
        end_date: body.end_date || null,
        status: 'active',
        notes: body.notes || null
      }).select().single();
      if (error) return json({
        error: error.message
      }, 500);
      await supabase.from('admin_audit_log').insert({
        admin_user_id: admin.id,
        action: 'create_pledge',
        resource_type: 'pledge',
        resource_id: data.id
      });
      return json({
        success: true,
        pledge: data
      });
    }
    if (path.match(/^pledge\/[^/]+$/) && method === 'PUT') {
      if (admin.role === 'viewer') return json({
        error: 'Insufficient permissions'
      }, 403);
      const id = path.replace('pledge/', '');
      const body = await req.json();
      const allowed = [
        'total_pledge_cents',
        'paid_to_date_cents',
        'installment_count',
        'installment_amount_cents',
        'frequency',
        'designation',
        'start_date',
        'next_payment_date',
        'end_date',
        'status',
        'notes'
      ];
      const updates = {};
      for (const key of allowed){
        if (key in body) updates[key] = body[key];
      }
      updates.updated_at = new Date().toISOString();
      const { data, error } = await supabase.from('pledges').update(updates).eq('id', id).select().single();
      if (error) return json({
        error: error.message
      }, 500);
      await supabase.from('admin_audit_log').insert({
        admin_user_id: admin.id,
        action: 'update_pledge',
        resource_type: 'pledge',
        resource_id: id,
        details: updates
      });
      return json({
        success: true,
        pledge: data
      });
    }
    if (path.match(/^pledge\/[^/]+$/) && method === 'DELETE') {
      if (admin.role !== 'super_admin' && admin.role !== 'admin') return json({
        error: 'Insufficient permissions'
      }, 403);
      const id = path.replace('pledge/', '');
      const { error } = await supabase.from('pledges').delete().eq('id', id);
      if (error) return json({
        error: error.message
      }, 500);
      await supabase.from('admin_audit_log').insert({
        admin_user_id: admin.id,
        action: 'delete_pledge',
        resource_type: 'pledge',
        resource_id: id
      });
      return json({
        success: true
      });
    }
    // ============ IN-KIND DONATIONS ============
    if (path === 'in-kind' && method === 'GET') {
      const page = parseInt(url.searchParams.get('page') || '1');
      const limit = Math.min(parseInt(url.searchParams.get('limit') || '25'), 100);
      const offset = (page - 1) * limit;
      const { data, count, error: qErr } = await supabase.from('in_kind_donations').select('*, donor:donors(id, first_name, last_name, email)', {
        count: 'exact'
      }).order('donated_at', {
        ascending: false
      }).range(offset, offset + limit - 1);
      if (qErr) return json({
        error: qErr.message
      }, 500);
      return json({
        donations: data,
        total: count,
        page,
        limit,
        totalPages: Math.ceil((count || 0) / limit)
      });
    }
    if (path === 'in-kind' && method === 'POST') {
      if (admin.role === 'viewer') return json({
        error: 'Insufficient permissions'
      }, 403);
      const body = await req.json();
      const value = body.estimated_value_cents || 0;
      const validMethods = [
        'fair_market_value',
        'appraisal',
        'comparable_sales',
        'replacement_cost',
        'donor_estimate',
        'other'
      ];
      if (body.valuation_method && !validMethods.includes(body.valuation_method)) {
        return json({
          error: `Invalid valuation_method. Must be one of: ${validMethods.join(', ')}`
        }, 400);
      }
      const isVehicle = body.category === 'vehicle';
      const form1098cRequired = isVehicle && value >= 50000;
      const insert = {
        donor_id: body.donor_id,
        description: body.description,
        category: body.category || 'other',
        estimated_value_cents: value,
        valuation_method: body.valuation_method || null,
        appraiser_name: body.appraiser_name || null,
        form_8283_required: value >= 50000,
        form_1098c_required: form1098cRequired,
        donated_at: body.donated_at || new Date().toISOString(),
        tax_year: body.tax_year || new Date().getFullYear(),
        notes: body.notes || null
      };
      // Vehicle-specific fields for Form 1098-C
      if (isVehicle) {
        if (body.vehicle_vin) insert.vehicle_vin = body.vehicle_vin;
        if (body.vehicle_year) insert.vehicle_year = body.vehicle_year;
        if (body.vehicle_make) insert.vehicle_make = body.vehicle_make;
        if (body.vehicle_model) insert.vehicle_model = body.vehicle_model;
      }
      const { data, error } = await supabase.from('in_kind_donations').insert(insert).select().single();
      if (error) return json({
        error: error.message
      }, 500);
      await supabase.from('admin_audit_log').insert({
        admin_user_id: admin.id,
        action: 'create_in_kind',
        resource_type: 'in_kind_donation',
        resource_id: data.id
      });
      return json({
        success: true,
        donation: data
      });
    }
    if (path.match(/^in-kind\/[^/]+$/) && method === 'PUT') {
      if (admin.role === 'viewer') return json({
        error: 'Insufficient permissions'
      }, 403);
      const id = path.replace('in-kind/', '');
      const body = await req.json();
      const validMethods = [
        'fair_market_value',
        'appraisal',
        'comparable_sales',
        'replacement_cost',
        'donor_estimate',
        'other'
      ];
      if (body.valuation_method && !validMethods.includes(body.valuation_method)) {
        return json({
          error: `Invalid valuation_method. Must be one of: ${validMethods.join(', ')}`
        }, 400);
      }
      const allowed = [
        'description',
        'category',
        'estimated_value_cents',
        'valuation_method',
        'appraiser_name',
        'form_8283_required',
        'form_8283_signed',
        'form_1098c_required',
        'receipt_number',
        'donated_at',
        'tax_year',
        'notes',
        'vehicle_vin',
        'vehicle_year',
        'vehicle_make',
        'vehicle_model'
      ];
      const updates = {};
      for (const key of allowed){
        if (key in body) updates[key] = body[key];
      }
      if ('estimated_value_cents' in updates) {
        updates.form_8283_required = updates.estimated_value_cents >= 50000;
      }
      // Auto-calculate form_1098c_required for vehicles
      const category = updates.category || body.category;
      const value = updates.estimated_value_cents ?? body.estimated_value_cents;
      if (category === 'vehicle' && value !== undefined) {
        updates.form_1098c_required = value >= 50000;
      }
      const { data, error } = await supabase.from('in_kind_donations').update(updates).eq('id', id).select().single();
      if (error) return json({
        error: error.message
      }, 500);
      await supabase.from('admin_audit_log').insert({
        admin_user_id: admin.id,
        action: 'update_in_kind',
        resource_type: 'in_kind_donation',
        resource_id: id,
        details: updates
      });
      return json({
        success: true,
        donation: data
      });
    }
    if (path.match(/^in-kind\/[^/]+$/) && method === 'DELETE') {
      if (admin.role !== 'super_admin' && admin.role !== 'admin') return json({
        error: 'Insufficient permissions'
      }, 403);
      const id = path.replace('in-kind/', '');
      const { error } = await supabase.from('in_kind_donations').delete().eq('id', id);
      if (error) return json({
        error: error.message
      }, 500);
      await supabase.from('admin_audit_log').insert({
        admin_user_id: admin.id,
        action: 'delete_in_kind',
        resource_type: 'in_kind_donation',
        resource_id: id
      });
      return json({
        success: true
      });
    }
    // ============ GRANT REPORTS ============
    if (path.match(/^grant\/[^/]+\/reports$/) && method === 'GET') {
      const grantId = path.replace('grant/', '').replace('/reports', '');
      const { data, error } = await supabase.from('grant_reports').select('*').eq('grant_id', grantId).order('due_date', {
        ascending: true
      });
      if (error) return json({
        error: error.message
      }, 500);
      return json({
        reports: data || []
      });
    }
    if (path.match(/^grant\/[^/]+\/report$/) && method === 'POST') {
      if (admin.role === 'viewer') return json({
        error: 'Insufficient permissions'
      }, 403);
      const grantId = path.replace('grant/', '').replace('/report', '');
      const body = await req.json();
      if (!body.report_name || !body.due_date) return json({
        error: 'report_name and due_date required'
      }, 400);
      const { data, error } = await supabase.from('grant_reports').insert({
        grant_id: grantId,
        report_name: body.report_name,
        due_date: body.due_date,
        notes: body.notes || null
      }).select().single();
      if (error) return json({
        error: error.message
      }, 500);
      await supabase.from('admin_audit_log').insert({
        admin_user_id: admin.id,
        action: 'create_grant_report',
        resource_type: 'grant_report',
        resource_id: data.id
      });
      return json({
        success: true,
        report: data
      });
    }
    if (path.match(/^grant-report\/[^/]+$/) && method === 'PUT') {
      if (admin.role === 'viewer') return json({
        error: 'Insufficient permissions'
      }, 403);
      const reportId = path.replace('grant-report/', '');
      const body = await req.json();
      const allowed = [
        'report_name',
        'due_date',
        'status',
        'submitted_by',
        'notes'
      ];
      const updates = {};
      for (const key of allowed){
        if (key in body) updates[key] = body[key];
      }
      if (body.status === 'submitted' && !updates.submitted_at) updates.submitted_at = new Date().toISOString();
      updates.updated_at = new Date().toISOString();
      const { data, error } = await supabase.from('grant_reports').update(updates).eq('id', reportId).select().single();
      if (error) return json({
        error: error.message
      }, 500);
      // Auto-advance next_report_due on the parent grant if this was the next report
      if (body.status === 'submitted' || body.status === 'approved') {
        const { data: report } = await supabase.from('grant_reports').select('grant_id').eq('id', reportId).single();
        if (report) {
          const { data: nextReport } = await supabase.from('grant_reports').select('due_date').eq('grant_id', report.grant_id).eq('status', 'pending').order('due_date', {
            ascending: true
          }).limit(1).single();
          await supabase.from('grants').update({
            next_report_due: nextReport?.due_date || null,
            updated_at: new Date().toISOString()
          }).eq('id', report.grant_id);
        }
      }
      await supabase.from('admin_audit_log').insert({
        admin_user_id: admin.id,
        action: 'update_grant_report',
        resource_type: 'grant_report',
        resource_id: reportId,
        details: updates
      });
      return json({
        success: true,
        report: data
      });
    }
    if (path.match(/^grant-report\/[^/]+$/) && method === 'DELETE') {
      if (admin.role !== 'super_admin' && admin.role !== 'admin') return json({
        error: 'Insufficient permissions'
      }, 403);
      const reportId = path.replace('grant-report/', '');
      const { error } = await supabase.from('grant_reports').delete().eq('id', reportId);
      if (error) return json({
        error: error.message
      }, 500);
      await supabase.from('admin_audit_log').insert({
        admin_user_id: admin.id,
        action: 'delete_grant_report',
        resource_type: 'grant_report',
        resource_id: reportId
      });
      return json({
        success: true
      });
    }
    // -- Auto-generate grant report schedule --
    if (path.match(/^grant\/[^/]+\/generate-reports$/) && method === 'POST') {
      if (admin.role === 'viewer') return json({
        error: 'Insufficient permissions'
      }, 403);
      const grantId = path.replace('grant/', '').replace('/generate-reports', '');
      const { data: grant } = await supabase.from('grants').select('reporting_frequency, grant_period_start, grant_period_end, funder_name').eq('id', grantId).single();
      if (!grant) return json({
        error: 'Grant not found'
      }, 404);
      if (!grant.reporting_frequency || !grant.grant_period_start || !grant.grant_period_end) {
        return json({
          error: 'Grant must have reporting_frequency, grant_period_start, and grant_period_end set'
        }, 400);
      }
      // Idempotency: check if reports already exist for this grant
      const { count: existingCount } = await supabase.from('grant_reports').select('id', {
        count: 'exact',
        head: true
      }).eq('grant_id', grantId);
      if ((existingCount || 0) > 0) {
        return json({
          error: 'Grant report schedule already exists. Delete existing reports first to regenerate.'
        }, 409);
      }
      // Generate report due dates based on frequency
      const reports = [];
      const start = new Date(grant.grant_period_start);
      const end = new Date(grant.grant_period_end);
      let current = new Date(start);
      let num = 1;
      const freq = grant.reporting_frequency;
      while(current <= end){
        if (freq === 'monthly') current.setMonth(current.getMonth() + 1);
        else if (freq === 'quarterly') current.setMonth(current.getMonth() + 3);
        else if (freq === 'semi-annual') current.setMonth(current.getMonth() + 6);
        else if (freq === 'annual') current.setFullYear(current.getFullYear() + 1);
        else break;
        if (current <= end) {
          reports.push({
            grant_id: grantId,
            report_name: `${grant.funder_name} Report #${num}`,
            due_date: current.toISOString().split('T')[0]
          });
          num++;
        }
      }
      // Always add final report at grant end
      reports.push({
        grant_id: grantId,
        report_name: `${grant.funder_name} Final Report`,
        due_date: grant.grant_period_end
      });
      if (reports.length > 0) {
        const { error } = await supabase.from('grant_reports').insert(reports);
        if (error) return json({
          error: error.message
        }, 500);
        // Set next_report_due on the grant
        await supabase.from('grants').update({
          next_report_due: reports[0].due_date,
          updated_at: new Date().toISOString()
        }).eq('id', grantId);
      }
      await supabase.from('admin_audit_log').insert({
        admin_user_id: admin.id,
        action: 'generate_grant_reports',
        resource_type: 'grant',
        resource_id: grantId,
        details: {
          count: reports.length
        }
      });
      return json({
        success: true,
        reports_created: reports.length,
        reports
      });
    }
    // ============ GRANTS ============
    if (path === 'grants' && method === 'GET') {
      const page = parseInt(url.searchParams.get('page') || '1');
      const limit = Math.min(parseInt(url.searchParams.get('limit') || '25'), 100);
      const status = url.searchParams.get('status');
      const offset = (page - 1) * limit;
      let query = supabase.from('grants').select('*', {
        count: 'exact'
      });
      if (status) query = query.eq('status', status);
      query = query.order('created_at', {
        ascending: false
      }).range(offset, offset + limit - 1);
      const { data, count, error: qErr } = await query;
      if (qErr) return json({
        error: qErr.message
      }, 500);
      return json({
        grants: data,
        total: count,
        page,
        limit,
        totalPages: Math.ceil((count || 0) / limit)
      });
    }
    if (path === 'grant' && method === 'POST') {
      if (admin.role === 'viewer') return json({
        error: 'Insufficient permissions'
      }, 403);
      const body = await req.json();
      const { data, error } = await supabase.from('grants').insert({
        funder_name: body.funder_name,
        funder_contact_email: body.funder_contact_email || null,
        award_amount_cents: body.award_amount_cents,
        restriction_type: body.restriction_type || 'unrestricted',
        purpose: body.purpose || null,
        program: body.program || null,
        grant_period_start: body.grant_period_start || null,
        grant_period_end: body.grant_period_end || null,
        reporting_frequency: body.reporting_frequency || null,
        next_report_due: body.next_report_due || null,
        deliverables: body.deliverables || null,
        status: 'active',
        notes: body.notes || null
      }).select().single();
      if (error) return json({
        error: error.message
      }, 500);
      await supabase.from('admin_audit_log').insert({
        admin_user_id: admin.id,
        action: 'create_grant',
        resource_type: 'grant',
        resource_id: data.id
      });
      return json({
        success: true,
        grant: data
      });
    }
    if (path.match(/^grant\/[^/]+$/) && method === 'PUT') {
      if (admin.role === 'viewer') return json({
        error: 'Insufficient permissions'
      }, 403);
      const id = path.replace('grant/', '');
      const body = await req.json();
      const allowed = [
        'funder_name',
        'funder_contact_email',
        'award_amount_cents',
        'spent_to_date_cents',
        'restriction_type',
        'purpose',
        'program',
        'grant_period_start',
        'grant_period_end',
        'reporting_frequency',
        'next_report_due',
        'deliverables',
        'status',
        'notes'
      ];
      const updates = {};
      for (const key of allowed){
        if (key in body) updates[key] = body[key];
      }
      updates.updated_at = new Date().toISOString();
      const { data, error } = await supabase.from('grants').update(updates).eq('id', id).select().single();
      if (error) return json({
        error: error.message
      }, 500);
      await supabase.from('admin_audit_log').insert({
        admin_user_id: admin.id,
        action: 'update_grant',
        resource_type: 'grant',
        resource_id: id,
        details: updates
      });
      return json({
        success: true,
        grant: data
      });
    }
    if (path.match(/^grant\/[^/]+$/) && method === 'DELETE') {
      if (admin.role !== 'super_admin' && admin.role !== 'admin') return json({
        error: 'Insufficient permissions'
      }, 403);
      const id = path.replace('grant/', '');
      const { error } = await supabase.from('grants').delete().eq('id', id);
      if (error) return json({
        error: error.message
      }, 500);
      await supabase.from('admin_audit_log').insert({
        admin_user_id: admin.id,
        action: 'delete_grant',
        resource_type: 'grant',
        resource_id: id
      });
      return json({
        success: true
      });
    }
    // ============ UTM TRACKING ============
    // -- SET/UPDATE UTM fields on a donation --
    if (path.match(/^utm\/[^/]+$/) && method === 'PUT') {
      if (admin.role === 'viewer') return json({
        error: 'Insufficient permissions'
      }, 403);
      const donationId = path.replace('utm/', '');
      const body = await req.json();
      const allowed = [
        'utm_source',
        'utm_medium',
        'utm_campaign',
        'utm_content',
        'referrer_url'
      ];
      const updates = {};
      for (const key of allowed){
        if (key in body) updates[key] = body[key];
      }
      if (Object.keys(updates).length === 0) return json({
        error: 'No valid UTM fields provided'
      }, 400);
      const { data, error } = await supabase.from('donations').update(updates).eq('id', donationId).select('id, utm_source, utm_medium, utm_campaign, utm_content, referrer_url').single();
      if (error) return json({
        error: error.message
      }, 500);
      await supabase.from('admin_audit_log').insert({
        admin_user_id: admin.id,
        action: 'update_utm',
        resource_type: 'donation',
        resource_id: donationId,
        details: updates
      });
      return json({
        success: true,
        donation: data
      });
    }
    // -- BATCH SET UTM fields --
    if (path === 'utm-batch' && method === 'POST') {
      if (admin.role === 'viewer') return json({
        error: 'Insufficient permissions'
      }, 403);
      const { donation_ids, utm_source, utm_medium, utm_campaign, utm_content, referrer_url } = await req.json();
      if (!donation_ids || !Array.isArray(donation_ids) || donation_ids.length === 0) return json({
        error: 'donation_ids array required'
      }, 400);
      const updates = {};
      if (utm_source !== undefined) updates.utm_source = utm_source;
      if (utm_medium !== undefined) updates.utm_medium = utm_medium;
      if (utm_campaign !== undefined) updates.utm_campaign = utm_campaign;
      if (utm_content !== undefined) updates.utm_content = utm_content;
      if (referrer_url !== undefined) updates.referrer_url = referrer_url;
      const { error } = await supabase.from('donations').update(updates).in('id', donation_ids);
      if (error) return json({
        error: error.message
      }, 500);
      await supabase.from('admin_audit_log').insert({
        admin_user_id: admin.id,
        action: 'batch_update_utm',
        resource_type: 'donation',
        details: {
          count: donation_ids.length,
          ...updates
        }
      });
      return json({
        success: true,
        updated: donation_ids.length
      });
    }
    if (path === 'utm-report' && method === 'GET') {
      const { data: donations } = await supabase.from('donations').select('utm_source, utm_medium, utm_campaign, utm_content, referrer_url, amount_cents').eq('status', 'succeeded').not('utm_source', 'is', null);
      const bySource = {};
      const byCampaign = {};
      const byMedium = {};
      for (const d of donations || []){
        const src = d.utm_source || 'direct';
        if (!bySource[src]) bySource[src] = {
          count: 0,
          total: 0
        };
        bySource[src].count++;
        bySource[src].total += d.amount_cents;
        if (d.utm_campaign) {
          if (!byCampaign[d.utm_campaign]) byCampaign[d.utm_campaign] = {
            count: 0,
            total: 0
          };
          byCampaign[d.utm_campaign].count++;
          byCampaign[d.utm_campaign].total += d.amount_cents;
        }
        const med = d.utm_medium || 'none';
        if (!byMedium[med]) byMedium[med] = {
          count: 0,
          total: 0
        };
        byMedium[med].count++;
        byMedium[med].total += d.amount_cents;
      }
      const toArr = (obj)=>Object.entries(obj).map(([name, v])=>({
            name,
            ...v
          })).sort((a, b)=>b.total - a.total);
      return json({
        total_tracked: (donations || []).length,
        by_source: toArr(bySource),
        by_campaign: toArr(byCampaign),
        by_medium: toArr(byMedium)
      });
    }
    // ============ DONORS LIST (for dropdowns) ============
    if (path === 'donors-list' && method === 'GET') {
      const { data: donors } = await supabase.from('donors').select('id, first_name, last_name, email').order('last_name').limit(500);
      return json({
        donors: donors || []
      });
    }
    return json({
      error: 'Not found',
      path
    }, 404);
  } catch (err) {
    console.error(`Fundraising API error: ${err.message}`);
    return json({
      error: err.message
    }, 500);
  }
});
