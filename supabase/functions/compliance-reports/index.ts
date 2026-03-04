import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'No auth' }, 401);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Verify admin
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) return json({ error: 'Unauthorized' }, 401);
    const { data: admin } = await supabase.from('admin_users').select('role').eq('auth_user_id', user.id).eq('is_active', true).single();
    if (!admin) return json({ error: 'Not admin' }, 403);

    const url = new URL(req.url);
    const pathParts = url.pathname.split('/');
    const action = pathParts[pathParts.length - 1] || '';
    const taxYear = parseInt(url.searchParams.get('tax_year') || '');

    if (!taxYear) return json({ error: 'tax_year query parameter required' }, 400);

    // ── GET /form990-csv ──
    if (req.method === 'GET' && action === 'form990-csv') {
      return await handleForm990Csv(supabase, taxYear);
    }

    // ── GET /schedule-b ──
    if (req.method === 'GET' && action === 'schedule-b') {
      return await handleScheduleB(supabase, taxYear);
    }

    // ── GET /ga-c200-check ──
    if (req.method === 'GET' && action === 'ga-c200-check') {
      return await handleGaC200Check(supabase, taxYear);
    }

    // ── GET /readiness ──
    if (req.method === 'GET' && action === 'readiness') {
      return await handleReadiness(supabase, taxYear);
    }

    return json({ error: 'Invalid endpoint. Use /form990-csv, /schedule-b, /ga-c200-check, or /readiness' }, 400);

  } catch (err) {
    console.error('Error:', err);
    return json({ error: err.message }, 500);
  }
});

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function csvResponse(csvContent: string, filename: string) {
  return new Response(csvContent, {
    headers: {
      ...corsHeaders,
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}

// ── Form 990 CSV Export ──
async function handleForm990Csv(supabase: any, taxYear: number) {
  // Fetch all succeeded donations for the tax year with donor info
  const { data: donations, error } = await supabase
    .from('donations')
    .select('*, donor:donors(*)')
    .eq('tax_year', taxYear)
    .eq('status', 'succeeded')
    .order('donated_at', { ascending: true });

  if (error) return json({ error: 'Failed to fetch donations' }, 500);

  const rows = (donations || []);
  const totalCents = rows.reduce((sum: number, d: any) => sum + d.amount_cents, 0);
  const totalDeductibleCents = rows.reduce((sum: number, d: any) => sum + (d.tax_deductible_amount_cents || d.amount_cents), 0);

  // 990-EZ field mappings as header comments
  const headers = [
    'Receipt Number',
    'Donor Name',
    'Donor Email',
    'Donor Address',
    'Donation Date',
    'Amount',
    'Tax Deductible Amount',
    'Designation',
    'Donation Type',
    'Goods/Services Provided',
    'Goods/Services Value',
    'Payment Method',
  ];

  let csv = headers.map(escapeCsvField).join(',') + '\n';

  for (const d of rows) {
    const donor = d.donor || {};
    const donorName = `${donor.first_name || ''} ${donor.last_name || ''}`.trim();
    const donorAddr = [donor.address_line1, donor.city, donor.state, donor.zip].filter(Boolean).join(', ');
    const date = d.donated_at ? new Date(d.donated_at).toLocaleDateString('en-US') : '';
    const amt = (d.amount_cents / 100).toFixed(2);
    const deductible = ((d.tax_deductible_amount_cents || d.amount_cents) / 100).toFixed(2);
    const goodsValue = d.goods_services_provided ? ((d.goods_services_value_cents || 0) / 100).toFixed(2) : '0.00';

    csv += [
      d.receipt_number || '',
      donorName,
      donor.email || '',
      donorAddr,
      date,
      amt,
      deductible,
      d.designation || 'unrestricted',
      d.donation_type || 'one_time',
      d.goods_services_provided ? 'Yes' : 'No',
      goodsValue,
      d.payment_method || 'stripe',
    ].map(String).map(escapeCsvField).join(',') + '\n';
  }

  // Summary row
  csv += '\n';
  csv += `"TOTALS","","","","","${(totalCents / 100).toFixed(2)}","${(totalDeductibleCents / 100).toFixed(2)}","","","","",""\n`;
  csv += `"Total Donations","${rows.length}","","","","","","","","","",""\n`;
  csv += `"Tax Year","${taxYear}","","","","","","","","","",""\n`;
  csv += '\n';
  csv += `"990-EZ Part I Line 1: Contributions/gifts/grants","${(totalCents / 100).toFixed(2)}","","","","","","","","","",""\n`;

  // Group by designation
  const byDesignation: Record<string, number> = {};
  for (const d of rows) {
    const key = d.designation || 'unrestricted';
    byDesignation[key] = (byDesignation[key] || 0) + d.amount_cents;
  }
  csv += '\n"Revenue by Designation"\n';
  for (const [des, cents] of Object.entries(byDesignation)) {
    csv += `"${des}","${(cents / 100).toFixed(2)}"\n`;
  }

  return csvResponse(csv, `form990-data-${taxYear}.csv`);
}

// ── Schedule B CSV ──
async function handleScheduleB(supabase: any, taxYear: number) {
  // Get all donors with aggregate donations >= $5,000
  const { data: donations, error } = await supabase
    .from('donations')
    .select('donor_id, amount_cents, donor:donors(first_name, last_name, address_line1, address_line2, city, state, zip)')
    .eq('tax_year', taxYear)
    .eq('status', 'succeeded');

  if (error) return json({ error: 'Failed to fetch donations' }, 500);

  // Aggregate by donor
  const donorTotals: Record<string, { total: number; donor: any }> = {};
  for (const d of (donations || [])) {
    if (!donorTotals[d.donor_id]) {
      donorTotals[d.donor_id] = { total: 0, donor: d.donor };
    }
    donorTotals[d.donor_id].total += d.amount_cents;
  }

  // Filter >= $5,000 (500000 cents)
  const scheduleBDonors = Object.entries(donorTotals)
    .filter(([_, v]) => v.total >= 500000)
    .sort(([, a], [, b]) => b.total - a.total);

  const headers = ['Donor Name', 'Address', 'City', 'State', 'ZIP', 'Total Contributions'];
  let csv = headers.map(escapeCsvField).join(',') + '\n';

  for (const [_, { total, donor }] of scheduleBDonors) {
    const name = `${donor?.first_name || ''} ${donor?.last_name || ''}`.trim();
    const addr = [donor?.address_line1, donor?.address_line2].filter(Boolean).join(', ');
    csv += [
      name,
      addr,
      donor?.city || '',
      donor?.state || '',
      donor?.zip || '',
      (total / 100).toFixed(2),
    ].map(String).map(escapeCsvField).join(',') + '\n';
  }

  csv += `\n"Total Schedule B Donors","${scheduleBDonors.length}"\n`;
  const schedBTotal = scheduleBDonors.reduce((sum, [_, v]) => sum + v.total, 0);
  csv += `"Total from Schedule B Donors","${(schedBTotal / 100).toFixed(2)}"\n`;

  return csvResponse(csv, `schedule-b-${taxYear}.csv`);
}

// ── GA C-200 Check ──
async function handleGaC200Check(supabase: any, taxYear: number) {
  // Check Georgia registration
  const { data: gaReg } = await supabase
    .from('state_registrations')
    .select('*')
    .ilike('state', '%georgia%')
    .maybeSingle();

  // Check if 990-N filing is present in deadlines
  const { data: filings } = await supabase
    .from('compliance_deadlines')
    .select('*')
    .or('filing_name.ilike.%990-N%,filing_name.ilike.%990-n%,filing_name.ilike.%e-postcard%');

  // Gross receipts (total donations for the year)
  const { data: donations } = await supabase
    .from('donations')
    .select('amount_cents')
    .eq('tax_year', taxYear)
    .eq('status', 'succeeded');

  const grossReceipts = (donations || []).reduce((sum: number, d: any) => sum + d.amount_cents, 0);
  const grossReceiptsDollars = grossReceipts / 100;

  const flags: any[] = [];

  // GA registration status
  if (!gaReg) {
    flags.push({ severity: 'critical', message: 'No Georgia state registration found. C-200 renewal requires active registration.' });
  } else if (gaReg.status === 'expired') {
    flags.push({ severity: 'critical', message: `Georgia registration expired on ${gaReg.expiration_date}. Renewal required.` });
  } else if (gaReg.expiration_date && new Date(gaReg.expiration_date) < new Date(new Date().setMonth(new Date().getMonth() + 3))) {
    flags.push({ severity: 'warning', message: `Georgia registration expires on ${gaReg.expiration_date}. Consider renewing soon.` });
  } else {
    flags.push({ severity: 'info', message: `Georgia registration active (${gaReg.registration_number || 'no number on file'}).` });
  }

  // 990-N detection
  if (!filings || filings.length === 0) {
    flags.push({ severity: 'warning', message: 'No IRS Form 990-N (e-Postcard) deadline found. Add one to track filing.' });
  } else {
    const completed = filings.filter((f: any) => f.status === 'completed');
    if (completed.length > 0) {
      flags.push({ severity: 'info', message: `990-N filing tracked: ${completed.length} completed.` });
    } else {
      flags.push({ severity: 'warning', message: '990-N filing tracked but not yet marked as completed.' });
    }
  }

  // Gross receipts thresholds
  if (grossReceiptsDollars <= 50000) {
    flags.push({ severity: 'info', message: `Gross receipts $${grossReceiptsDollars.toLocaleString()} — eligible for 990-N (e-Postcard).` });
  } else if (grossReceiptsDollars <= 200000) {
    flags.push({ severity: 'warning', message: `Gross receipts $${grossReceiptsDollars.toLocaleString()} — must file 990-EZ (not eligible for 990-N).` });
  } else {
    flags.push({ severity: 'critical', message: `Gross receipts $${grossReceiptsDollars.toLocaleString()} — must file full Form 990.` });
  }

  return json({
    tax_year: taxYear,
    georgia_registration: gaReg || null,
    gross_receipts_cents: grossReceipts,
    gross_receipts_dollars: grossReceiptsDollars,
    form_990_filings: filings || [],
    flags,
  });
}

// ── Filing Readiness Report ──
async function handleReadiness(supabase: any, taxYear: number) {
  const checks: any[] = [];

  // 1. Unissued receipts
  const { data: unreceipted } = await supabase
    .from('donations')
    .select('id')
    .eq('tax_year', taxYear)
    .eq('status', 'succeeded')
    .is('thank_you_sent_at', null);

  const unreceiptedCount = (unreceipted || []).length;
  if (unreceiptedCount > 0) {
    checks.push({
      id: 'unissued_receipts',
      title: 'Unissued Donation Receipts',
      severity: 'critical',
      message: `${unreceiptedCount} donation${unreceiptedCount > 1 ? 's' : ''} from ${taxYear} have not been receipted.`,
      action: 'Go to Compliance > Pending Receipt Emails to send them.',
    });
  } else {
    checks.push({
      id: 'unissued_receipts',
      title: 'Donation Receipts',
      severity: 'pass',
      message: `All ${taxYear} donations have been receipted.`,
    });
  }

  // 2. Missing donor addresses (for Schedule B / IRS reporting)
  const { data: donations } = await supabase
    .from('donations')
    .select('donor_id, amount_cents, donor:donors(address_line1, city, state, zip)')
    .eq('tax_year', taxYear)
    .eq('status', 'succeeded');

  const donorTotals: Record<string, { total: number; hasAddress: boolean }> = {};
  for (const d of (donations || [])) {
    if (!donorTotals[d.donor_id]) {
      donorTotals[d.donor_id] = { total: 0, hasAddress: !!(d.donor?.address_line1 && d.donor?.city && d.donor?.state && d.donor?.zip) };
    }
    donorTotals[d.donor_id].total += d.amount_cents;
  }

  const missingAddress = Object.entries(donorTotals).filter(([_, v]) => !v.hasAddress && v.total >= 25000); // >= $250
  if (missingAddress.length > 0) {
    checks.push({
      id: 'missing_addresses',
      title: 'Missing Donor Addresses',
      severity: 'warning',
      message: `${missingAddress.length} donor${missingAddress.length > 1 ? 's' : ''} with donations >= $250 are missing complete addresses.`,
      action: 'Update donor profiles in the Donors tab.',
    });
  } else {
    checks.push({
      id: 'missing_addresses',
      title: 'Donor Addresses',
      severity: 'pass',
      message: 'All donors with significant donations have addresses on file.',
    });
  }

  // 3. Schedule B donors
  const scheduleBDonors = Object.entries(donorTotals).filter(([_, v]) => v.total >= 500000);
  if (scheduleBDonors.length > 0) {
    checks.push({
      id: 'schedule_b',
      title: 'Schedule B Required',
      severity: 'info',
      message: `${scheduleBDonors.length} donor${scheduleBDonors.length > 1 ? 's' : ''} contributed >= $5,000. Schedule B filing required.`,
      action: 'Download Schedule B CSV from the Form 990 Data Export section.',
    });
  } else {
    checks.push({
      id: 'schedule_b',
      title: 'Schedule B',
      severity: 'pass',
      message: 'No donors contributed >= $5,000. Schedule B may not be required.',
    });
  }

  // 4. Overdue deadlines
  const { data: deadlines } = await supabase
    .from('compliance_deadlines')
    .select('*')
    .neq('status', 'completed');

  const now = new Date();
  const overdue = (deadlines || []).filter((d: any) => new Date(d.deadline_date) < now);
  if (overdue.length > 0) {
    checks.push({
      id: 'overdue_deadlines',
      title: 'Overdue Deadlines',
      severity: 'critical',
      message: `${overdue.length} compliance deadline${overdue.length > 1 ? 's are' : ' is'} overdue: ${overdue.map((d: any) => d.filing_name).join(', ')}.`,
      action: 'Review deadlines in the Compliance Deadlines section.',
    });
  } else {
    checks.push({
      id: 'overdue_deadlines',
      title: 'Compliance Deadlines',
      severity: 'pass',
      message: 'No overdue deadlines.',
    });
  }

  // 5. Missing year-end statements
  const donorIds = [...new Set((donations || []).map((d: any) => d.donor_id))];
  const { data: stmts } = await supabase
    .from('donation_receipts')
    .select('donor_id')
    .eq('tax_year', taxYear)
    .eq('receipt_type', 'year_end')
    .is('voided_at', null);

  const stmtDonorIds = new Set((stmts || []).map((s: any) => s.donor_id));
  const missingStmts = donorIds.filter(id => !stmtDonorIds.has(id));
  if (missingStmts.length > 0) {
    checks.push({
      id: 'year_end_statements',
      title: 'Year-End Statements',
      severity: 'warning',
      message: `${missingStmts.length} of ${donorIds.length} donors are missing year-end giving statements.`,
      action: 'Generate statements in the Year-End Giving Statements section.',
    });
  } else if (donorIds.length > 0) {
    checks.push({
      id: 'year_end_statements',
      title: 'Year-End Statements',
      severity: 'pass',
      message: `All ${donorIds.length} donors have year-end statements generated.`,
    });
  }

  // 6. Goods/services gaps
  const { data: goodsDonations } = await supabase
    .from('donations')
    .select('id, amount_cents, goods_services_provided')
    .eq('tax_year', taxYear)
    .eq('status', 'succeeded')
    .gte('amount_cents', 25000); // >= $250

  const needsGoodsCheck = (goodsDonations || []).filter((d: any) => d.goods_services_provided === null);
  if (needsGoodsCheck.length > 0) {
    checks.push({
      id: 'goods_services',
      title: 'Goods/Services Disclosure',
      severity: 'warning',
      message: `${needsGoodsCheck.length} donation${needsGoodsCheck.length > 1 ? 's' : ''} >= $250 have no goods/services disclosure recorded.`,
      action: 'IRS requires disclosure for donations >= $250. Update donation records.',
    });
  } else {
    checks.push({
      id: 'goods_services',
      title: 'Goods/Services Disclosure',
      severity: 'pass',
      message: 'All significant donations have goods/services disclosure recorded.',
    });
  }

  // Overall status
  const hasCritical = checks.some(c => c.severity === 'critical');
  const hasWarning = checks.some(c => c.severity === 'warning');
  const overallStatus = hasCritical ? 'not_ready' : hasWarning ? 'needs_attention' : 'ready';

  return json({
    tax_year: taxYear,
    overall_status: overallStatus,
    checks,
  });
}

function escapeCsvField(field: string): string {
  if (field.includes(',') || field.includes('"') || field.includes('\n')) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}
