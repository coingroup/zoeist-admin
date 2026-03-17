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

function csv(content: string, filename: string) {
  return new Response(content, {
    status: 200,
    headers: {
      ...corsHeaders,
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
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
  const marker = '/accounting-api';
  const idx = full.indexOf(marker);
  if (idx === -1) return '';
  return full.substring(idx + marker.length).replace(/^\/+/, '');
}

function fmtDollars(cents: number): string {
  return (cents / 100).toFixed(2);
}

function escCsv(val: unknown): string {
  if (val == null) return '';
  const s = String(val);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

async function getFiscalYear(): Promise<{ start_month: number; start_day: number; end_month: number; end_day: number }> {
  const { data } = await supabase.from('system_config').select('value').eq('key', 'fiscal_year').single();
  if (data?.value) return data.value as any;
  return { start_month: 1, start_day: 1, end_month: 12, end_day: 31 };
}

function fiscalYearDates(year: number, fy: { start_month: number; start_day: number; end_month: number; end_day: number }) {
  const startYear = fy.start_month === 1 ? year : year - 1;
  const endYear = fy.start_month === 1 ? year : year;
  const start = `${startYear}-${String(fy.start_month).padStart(2, '0')}-${String(fy.start_day).padStart(2, '0')}T00:00:00`;
  const end = `${endYear}-${String(fy.end_month).padStart(2, '0')}-${String(fy.end_day).padStart(2, '0')}T23:59:59`;
  return { start, end };
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
    // ============ SYSTEM CONFIG ============

    if (path === 'config' && method === 'GET') {
      const { data, error } = await supabase.from('system_config').select('*');
      if (error) return json({ error: error.message }, 500);
      const config: Record<string, unknown> = {};
      for (const row of (data || [])) config[row.key] = row.value;
      return json({ config });
    }

    if (path.match(/^config\/[^/]+$/) && method === 'PUT') {
      if (admin.role !== 'super_admin' && admin.role !== 'admin') return json({ error: 'Insufficient permissions' }, 403);
      const key = path.replace('config/', '');
      const { value } = await req.json();

      const { data: existing } = await supabase.from('system_config').select('key').eq('key', key).single();
      if (existing) {
        await supabase.from('system_config').update({ value, updated_at: new Date().toISOString(), updated_by: admin.email as string }).eq('key', key);
      } else {
        await supabase.from('system_config').insert({ key, value, updated_at: new Date().toISOString(), updated_by: admin.email as string });
      }

      await supabase.from('admin_audit_log').insert({ admin_user_id: admin.id, action: 'update_config', resource_type: 'system_config', resource_id: key, details: { value } });
      return json({ success: true });
    }

    // ============ QUICKBOOKS IIF EXPORT ============

    if (path === 'export/quickbooks' && method === 'GET') {
      if (admin.role === 'viewer') return json({ error: 'Insufficient permissions' }, 403);
      const year = parseInt(url.searchParams.get('year') || String(new Date().getFullYear()));
      const fy = await getFiscalYear();
      const { start, end } = fiscalYearDates(year, fy);

      const { data: donations } = await supabase.from('donations')
        .select('id, amount_cents, refund_amount_cents, designation, donated_at, receipt_number, payment_method, status, donation_type, goods_services_value_cents, donor:donors(first_name, last_name, email)')
        .in('status', ['succeeded', 'refunded'])
        .gte('donated_at', start).lte('donated_at', end)
        .order('donated_at');

      const { data: mappingConfig } = await supabase.from('system_config').select('value').eq('key', 'account_mappings').single();
      const mappings: Record<string, string> = (mappingConfig?.value as any) || {};
      const defaultIncome = mappings['_default_income'] || '4000 · Contribution Revenue';
      const defaultBank = mappings['_default_bank'] || '1000 · Checking';

      let iif = '!TRNS\tTRNSTYPE\tDATE\tACCNT\tNAME\tAMOUNT\tMEMO\tDOCNUM\n';
      iif += '!SPL\tTRNSTYPE\tDATE\tACCNT\tNAME\tAMOUNT\tMEMO\n';
      iif += '!ENDTRNS\n';

      for (const d of (donations || [])) {
        const donor = d.donor as any;
        const name = donor ? `${donor.first_name || ''} ${donor.last_name || ''}`.trim() : 'Anonymous';
        const date = new Date(d.donated_at).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
        const gross = d.amount_cents / 100;
        const refund = (d.refund_amount_cents || 0) / 100;
        const net = gross - refund;
        const incomeAcct = mappings[d.designation || ''] || defaultIncome;
        const memo = `${d.receipt_number || ''} ${d.designation || 'unrestricted'}`.trim();

        if (d.status === 'succeeded' && net > 0) {
          iif += `TRNS\tDEPOSIT\t${date}\t${defaultBank}\t${name}\t${net.toFixed(2)}\t${memo}\t${d.receipt_number || ''}\n`;
          iif += `SPL\tDEPOSIT\t${date}\t${incomeAcct}\t${name}\t${(-net).toFixed(2)}\t${memo}\n`;
          iif += 'ENDTRNS\n';
        }

        if (d.status === 'refunded' && refund > 0) {
          iif += `TRNS\tCHECK\t${date}\t${defaultBank}\t${name}\t${(-refund).toFixed(2)}\tRefund: ${memo}\t\n`;
          iif += `SPL\tCHECK\t${date}\t${incomeAcct}\t${name}\t${refund.toFixed(2)}\tRefund: ${memo}\n`;
          iif += 'ENDTRNS\n';
        }
      }

      const { data: inkind } = await supabase.from('in_kind_donations')
        .select('id, estimated_value_cents, description, category, received_at, donor:donors(first_name, last_name)')
        .gte('received_at', start).lte('received_at', end);

      const inkindAcct = mappings['_inkind'] || '4100 · In-Kind Contributions';
      for (const ik of (inkind || [])) {
        const donor = ik.donor as any;
        const name = donor ? `${donor.first_name || ''} ${donor.last_name || ''}`.trim() : 'Anonymous';
        const date = new Date(ik.received_at).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
        const val = (ik.estimated_value_cents || 0) / 100;

        iif += `TRNS\tGENJRNL\t${date}\t${inkindAcct}\t${name}\t${val.toFixed(2)}\tIn-kind: ${ik.description || ik.category}\t\n`;
        iif += `SPL\tGENJRNL\t${date}\t4100 · In-Kind Asset\t${name}\t${(-val).toFixed(2)}\tIn-kind: ${ik.description || ik.category}\n`;
        iif += 'ENDTRNS\n';
      }

      await supabase.from('admin_audit_log').insert({ admin_user_id: admin.id, action: 'export_quickbooks', resource_type: 'accounting', details: { year, records: (donations || []).length } });

      return new Response(iif, {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'text/plain', 'Content-Disposition': `attachment; filename="zoeist-quickbooks-${year}.iif"` },
      });
    }

    // ============ XERO CSV EXPORT ============

    if (path === 'export/xero' && method === 'GET') {
      if (admin.role === 'viewer') return json({ error: 'Insufficient permissions' }, 403);
      const year = parseInt(url.searchParams.get('year') || String(new Date().getFullYear()));
      const fy = await getFiscalYear();
      const { start, end } = fiscalYearDates(year, fy);

      const { data: donations } = await supabase.from('donations')
        .select('id, amount_cents, refund_amount_cents, designation, donated_at, receipt_number, payment_method, status, donation_type, goods_services_value_cents, donor:donors(first_name, last_name, email)')
        .in('status', ['succeeded', 'refunded'])
        .gte('donated_at', start).lte('donated_at', end)
        .order('donated_at');

      const { data: mappingConfig } = await supabase.from('system_config').select('value').eq('key', 'account_mappings').single();
      const mappings: Record<string, string> = (mappingConfig?.value as any) || {};
      const defaultIncome = mappings['_default_income_code'] || '200';

      let rows = '*ContactName,EmailAddress,InvoiceNumber,InvoiceDate,DueDate,Total,AccountCode,Description,TaxType\n';

      for (const d of (donations || [])) {
        const donor = d.donor as any;
        const name = donor ? `${donor.first_name || ''} ${donor.last_name || ''}`.trim() : 'Anonymous';
        const email = donor?.email || '';
        const date = new Date(d.donated_at).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
        const net = ((d.amount_cents || 0) - (d.refund_amount_cents || 0)) / 100;
        const acctCode = mappings[`xero_${d.designation || ''}`] || defaultIncome;
        const desc = `Donation ${d.receipt_number || ''} — ${d.designation || 'unrestricted'}`;

        rows += `${escCsv(name)},${escCsv(email)},${escCsv(d.receipt_number)},${date},${date},${net.toFixed(2)},${acctCode},${escCsv(desc)},Tax Exempt\n`;
      }

      await supabase.from('admin_audit_log').insert({ admin_user_id: admin.id, action: 'export_xero', resource_type: 'accounting', details: { year, records: (donations || []).length } });

      return csv(rows, `zoeist-xero-${year}.csv`);
    }

    // ============ GENERIC CSV EXPORT ============

    if (path === 'export/generic' && method === 'GET') {
      if (admin.role === 'viewer') return json({ error: 'Insufficient permissions' }, 403);
      const year = parseInt(url.searchParams.get('year') || String(new Date().getFullYear()));
      const fy = await getFiscalYear();
      const { start, end } = fiscalYearDates(year, fy);

      const { data: donations } = await supabase.from('donations')
        .select('id, amount_cents, refund_amount_cents, designation, donated_at, receipt_number, payment_method, status, donation_type, goods_services_value_cents, tax_deductible_amount_cents, donor:donors(first_name, last_name, email)')
        .in('status', ['succeeded', 'refunded'])
        .gte('donated_at', start).lte('donated_at', end)
        .order('donated_at');

      let rows = 'Date,Receipt Number,Donor Name,Donor Email,Gross Amount,Refund Amount,Net Amount,Designation,Type,Payment Method,Goods/Services Value,Tax Deductible,Status\n';

      for (const d of (donations || [])) {
        const donor = d.donor as any;
        const name = donor ? `${donor.first_name || ''} ${donor.last_name || ''}`.trim() : 'Anonymous';
        const email = donor?.email || '';
        const date = new Date(d.donated_at).toISOString().slice(0, 10);
        const gross = fmtDollars(d.amount_cents || 0);
        const refund = fmtDollars(d.refund_amount_cents || 0);
        const net = fmtDollars((d.amount_cents || 0) - (d.refund_amount_cents || 0));
        const gsv = fmtDollars(d.goods_services_value_cents || 0);
        const taxded = fmtDollars(d.tax_deductible_amount_cents || d.amount_cents || 0);

        rows += `${date},${escCsv(d.receipt_number)},${escCsv(name)},${escCsv(email)},${gross},${refund},${net},${escCsv(d.designation || 'unrestricted')},${escCsv(d.donation_type)},${escCsv(d.payment_method)},${gsv},${taxded},${d.status}\n`;
      }

      const { data: inkind } = await supabase.from('in_kind_donations')
        .select('id, estimated_value_cents, description, category, received_at, valuation_method, donor:donors(first_name, last_name, email)')
        .gte('received_at', start).lte('received_at', end);

      if ((inkind || []).length > 0) {
        rows += '\n--- In-Kind Donations ---\n';
        rows += 'Date,Description,Category,Donor Name,Donor Email,Estimated Value,Valuation Method\n';
        for (const ik of (inkind || [])) {
          const donor = ik.donor as any;
          const name = donor ? `${donor.first_name || ''} ${donor.last_name || ''}`.trim() : 'Anonymous';
          rows += `${new Date(ik.received_at).toISOString().slice(0, 10)},${escCsv(ik.description)},${escCsv(ik.category)},${escCsv(name)},${escCsv(donor?.email)},${fmtDollars(ik.estimated_value_cents || 0)},${escCsv(ik.valuation_method)}\n`;
        }
      }

      const { data: grants } = await supabase.from('grants')
        .select('funder_name, award_amount_cents, spent_to_date_cents, restriction_type, status, purpose')
        .in('status', ['active', 'completed']);

      if ((grants || []).length > 0) {
        rows += '\n--- Grants ---\n';
        rows += 'Funder,Award Amount,Spent,Restriction,Status,Purpose\n';
        for (const g of (grants || [])) {
          rows += `${escCsv(g.funder_name)},${fmtDollars(Number(g.award_amount_cents) || 0)},${fmtDollars(Number(g.spent_to_date_cents) || 0)},${escCsv(g.restriction_type)},${g.status},${escCsv(g.purpose)}\n`;
        }
      }

      await supabase.from('admin_audit_log').insert({ admin_user_id: admin.id, action: 'export_generic_csv', resource_type: 'accounting', details: { year } });

      return csv(rows, `zoeist-accounting-${year}.csv`);
    }

    // ============ ACCOUNT MAPPINGS ============

    if (path === 'mappings' && method === 'GET') {
      const { data } = await supabase.from('system_config').select('value').eq('key', 'account_mappings').single();
      return json({ mappings: (data?.value as any) || {} });
    }

    if (path === 'mappings' && method === 'PUT') {
      if (admin.role !== 'super_admin' && admin.role !== 'admin') return json({ error: 'Insufficient permissions' }, 403);
      const { mappings } = await req.json();

      // Validate account_mappings schema
      if (typeof mappings !== 'object' || mappings === null || Array.isArray(mappings)) {
        return json({ error: 'mappings must be an object' }, 400);
      }
      // Validate required keys
      const requiredKeys = ['_default_income', '_default_bank'];
      const missingKeys = requiredKeys.filter(k => !(k in mappings));
      if (missingKeys.length > 0) {
        return json({ error: `Missing required mapping keys: ${missingKeys.join(', ')}. Required: ${requiredKeys.join(', ')}` }, 400);
      }
      // Validate all values are strings
      for (const [key, val] of Object.entries(mappings)) {
        if (typeof val !== 'string') {
          return json({ error: `Mapping value for '${key}' must be a string, got ${typeof val}` }, 400);
        }
      }

      const { data: existing } = await supabase.from('system_config').select('key').eq('key', 'account_mappings').single();
      if (existing) {
        await supabase.from('system_config').update({ value: mappings, updated_at: new Date().toISOString(), updated_by: admin.email as string }).eq('key', 'account_mappings');
      } else {
        await supabase.from('system_config').insert({ key: 'account_mappings', value: mappings, description: 'Chart of accounts mappings for QuickBooks/Xero export', updated_at: new Date().toISOString(), updated_by: admin.email as string });
      }

      await supabase.from('admin_audit_log').insert({ admin_user_id: admin.id, action: 'update_account_mappings', resource_type: 'system_config', details: { mappings } });
      return json({ success: true });
    }

    // ============ FISCAL YEAR SUMMARY ============

    if (path === 'fiscal-summary' && method === 'GET') {
      const year = parseInt(url.searchParams.get('year') || String(new Date().getFullYear()));
      const fy = await getFiscalYear();
      const { start, end } = fiscalYearDates(year, fy);

      const { data: donations } = await supabase.from('donations')
        .select('amount_cents, refund_amount_cents, designation, status, donation_type')
        .eq('status', 'succeeded')
        .gte('donated_at', start).lte('donated_at', end);

      const totalGross = (donations || []).reduce((s, d) => s + (d.amount_cents || 0), 0);
      const totalRefunds = (donations || []).reduce((s, d) => s + (d.refund_amount_cents || 0), 0);

      const byDesignation: Record<string, { count: number; gross: number; refunds: number }> = {};
      for (const d of (donations || [])) {
        const key = d.designation || 'unrestricted';
        if (!byDesignation[key]) byDesignation[key] = { count: 0, gross: 0, refunds: 0 };
        byDesignation[key].count++;
        byDesignation[key].gross += d.amount_cents || 0;
        byDesignation[key].refunds += d.refund_amount_cents || 0;
      }

      const { data: inkind } = await supabase.from('in_kind_donations')
        .select('estimated_value_cents')
        .gte('received_at', start).lte('received_at', end);
      const inkindTotal = (inkind || []).reduce((s, ik) => s + (ik.estimated_value_cents || 0), 0);

      const { data: grants } = await supabase.from('grants')
        .select('award_amount_cents, spent_to_date_cents, status');
      const activeGrants = (grants || []).filter(g => g.status === 'active');
      const grantAwarded = activeGrants.reduce((s, g) => s + Number(g.award_amount_cents || 0), 0);

      const { data: recurring } = await supabase.from('recurring_donations')
        .select('amount_cents, status');
      const activeSubs = (recurring || []).filter(r => r.status === 'active');
      const mrr = activeSubs.reduce((s, r) => s + (r.amount_cents || 0), 0);

      return json({
        fiscal_year: year,
        fiscal_period: { start, end },
        config: fy,
        cash_donations: { gross_cents: totalGross, refund_cents: totalRefunds, net_cents: totalGross - totalRefunds, count: (donations || []).length },
        by_designation: Object.entries(byDesignation).map(([name, v]) => ({ name, ...v, net: v.gross - v.refunds })).sort((a, b) => b.gross - a.gross),
        in_kind: { total_cents: inkindTotal, count: (inkind || []).length },
        grants: { active: activeGrants.length, total_awarded_cents: grantAwarded },
        recurring: { active: activeSubs.length, mrr_cents: mrr, arr_cents: mrr * 12 },
        total_revenue_cents: totalGross - totalRefunds + inkindTotal,
      });
    }

    return json({ error: 'Not found', path }, 404);
  } catch (err) {
    console.error(`Accounting API error: ${err.message}`);
    return json({ error: err.message }, 500);
  }
});
