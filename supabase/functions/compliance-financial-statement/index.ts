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

    if (req.method !== 'POST') return json({ error: 'POST required' }, 405);

    const { tax_year } = await req.json();
    if (!tax_year) return json({ error: 'tax_year required' }, 400);

    // Fetch all succeeded donations for the tax year
    const { data: donations, error: donErr } = await supabase
      .from('donations')
      .select('amount_cents, designation, donated_at')
      .eq('tax_year', tax_year)
      .eq('status', 'succeeded')
      .order('donated_at', { ascending: true });

    if (donErr) return json({ error: 'Failed to fetch donations' }, 500);

    // Calculate revenue by designation
    const revenueByDesignation: Record<string, number> = {};
    let totalRevenueCents = 0;
    for (const d of (donations || [])) {
      const key = d.designation || 'unrestricted';
      revenueByDesignation[key] = (revenueByDesignation[key] || 0) + d.amount_cents;
      totalRevenueCents += d.amount_cents;
    }

    // Generate the PDF
    const pdfBytes = buildFinancialStatementPdf(tax_year, revenueByDesignation, totalRevenueCents, (donations || []).length);

    // Store in Supabase Storage
    const storagePath = `compliance/${tax_year}/financial-statement.pdf`;
    const { error: uploadErr } = await supabase.storage
      .from('receipts')
      .upload(storagePath, pdfBytes, { contentType: 'application/pdf', upsert: true });

    if (uploadErr) {
      console.error('Upload error:', uploadErr);
      return json({ error: 'Failed to store PDF' }, 500);
    }

    return json({
      success: true,
      tax_year,
      storage_path: storagePath,
      total_revenue_cents: totalRevenueCents,
      donation_count: (donations || []).length,
      designations: revenueByDesignation,
    });

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

// ─── Manual PDF builder ───
function buildFinancialStatementPdf(
  taxYear: number,
  revenueByDesignation: Record<string, number>,
  totalRevenueCents: number,
  donationCount: number,
): Uint8Array {
  const encoder = new TextEncoder();
  const parts: string[] = [];
  const offsets: number[] = [];
  let byteLen = 0;

  function add(s: string) {
    parts.push(s);
    byteLen += encoder.encode(s).byteLength;
  }

  function markObj() {
    offsets.push(byteLen);
  }

  const orgName = 'Zoeist, Inc.';
  const orgAddr = 'Georgia, United States';
  const orgEIN = '92-0954601';
  const fmtDollars = (cents: number) => `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
  const generatedDate = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  // ─── PDF structure ───
  add('%PDF-1.4\n');

  // Obj 1: Catalog
  markObj();
  add('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');

  // Obj 2: Pages
  markObj();
  add('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n');

  // Obj 3: Page
  markObj();
  add('3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>\nendobj\n');

  // Obj 5: Font (Helvetica)
  markObj();
  add('5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n');

  // Obj 6: Font Bold
  markObj();
  add('6 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n');

  // Build content stream
  const stream: string[] = [];
  let y = 740;

  // Title
  stream.push('BT /F2 18 Tf');
  stream.push(`72 ${y} Td`);
  stream.push(`(${pdfEscape(orgName)}) Tj ET`);
  y -= 22;

  stream.push('BT /F1 10 Tf');
  stream.push(`72 ${y} Td`);
  stream.push(`(${pdfEscape(orgAddr)} | EIN: ${orgEIN}) Tj ET`);
  y -= 16;

  // Gold line
  stream.push('0.784 0.659 0.333 RG 2 w');
  stream.push(`72 ${y} m 540 ${y} l S`);
  y -= 28;

  // Document title
  stream.push('BT /F2 14 Tf');
  stream.push(`72 ${y} Td`);
  stream.push(`(Financial Statement \\2014 Fiscal Year ${taxYear}) Tj ET`);
  y -= 18;

  stream.push('BT /F1 9 Tf');
  stream.push(`72 ${y} Td`);
  stream.push(`(For Georgia Secretary of State C-200 Annual Registration) Tj ET`);
  y -= 14;

  stream.push('BT /F1 9 Tf');
  stream.push(`72 ${y} Td`);
  stream.push(`(Generated: ${generatedDate}) Tj ET`);
  y -= 28;

  // ── Statement of Activities ──
  stream.push('0.784 0.659 0.333 RG 1 w');
  stream.push(`72 ${y} m 540 ${y} l S`);
  y -= 18;

  stream.push('BT /F2 12 Tf');
  stream.push(`72 ${y} Td`);
  stream.push(`(STATEMENT OF ACTIVITIES) Tj ET`);
  y -= 18;

  stream.push('BT /F1 9 Tf');
  stream.push(`72 ${y} Td`);
  stream.push(`(For the Year Ended December 31, ${taxYear}) Tj ET`);
  y -= 22;

  // Revenue section
  stream.push('BT /F2 10 Tf');
  stream.push(`72 ${y} Td`);
  stream.push(`(REVENUE) Tj ET`);
  y -= 16;

  // Revenue by designation
  const designations = Object.entries(revenueByDesignation).sort(([, a], [, b]) => b - a);
  for (const [designation, cents] of designations) {
    const label = designation.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    stream.push('BT /F1 9 Tf');
    stream.push(`90 ${y} Td`);
    stream.push(`(Contributions \\2014 ${pdfEscape(label)}) Tj ET`);

    stream.push('BT /F1 9 Tf');
    stream.push(`440 ${y} Td`);
    stream.push(`(${pdfEscape(fmtDollars(cents))}) Tj ET`);
    y -= 14;
  }

  // Total revenue
  y -= 4;
  stream.push(`90 ${y} m 540 ${y} l S`);
  y -= 14;

  stream.push('BT /F2 10 Tf');
  stream.push(`90 ${y} Td`);
  stream.push(`(Total Revenue) Tj ET`);
  stream.push('BT /F2 10 Tf');
  stream.push(`440 ${y} Td`);
  stream.push(`(${pdfEscape(fmtDollars(totalRevenueCents))}) Tj ET`);
  y -= 22;

  // Expenses section
  stream.push('BT /F2 10 Tf');
  stream.push(`72 ${y} Td`);
  stream.push(`(EXPENSES) Tj ET`);
  y -= 16;

  stream.push('BT /F1 9 Tf 0.5 0.5 0.5 rg');
  stream.push(`90 ${y} Td`);
  stream.push(`([To be completed manually]) Tj 0 0 0 rg ET`);
  y -= 14;

  const expenseItems = [
    'Program Services',
    'Management and General',
    'Fundraising',
  ];
  for (const item of expenseItems) {
    stream.push('BT /F1 9 Tf');
    stream.push(`90 ${y} Td`);
    stream.push(`(${item}) Tj ET`);
    stream.push('BT /F1 9 Tf 0.5 0.5 0.5 rg');
    stream.push(`440 ${y} Td`);
    stream.push(`($__________) Tj 0 0 0 rg ET`);
    y -= 14;
  }

  y -= 4;
  stream.push(`90 ${y} m 540 ${y} l S`);
  y -= 14;

  stream.push('BT /F2 10 Tf');
  stream.push(`90 ${y} Td`);
  stream.push(`(Total Expenses) Tj ET`);
  stream.push('BT /F1 10 Tf 0.5 0.5 0.5 rg');
  stream.push(`440 ${y} Td`);
  stream.push(`($__________) Tj 0 0 0 rg ET`);
  y -= 22;

  // Change in net assets
  stream.push('BT /F2 10 Tf');
  stream.push(`90 ${y} Td`);
  stream.push(`(Change in Net Assets) Tj ET`);
  stream.push('BT /F1 10 Tf 0.5 0.5 0.5 rg');
  stream.push(`440 ${y} Td`);
  stream.push(`($__________) Tj 0 0 0 rg ET`);
  y -= 32;

  // ── Statement of Financial Position ──
  stream.push('0.784 0.659 0.333 RG 1 w');
  stream.push(`72 ${y} m 540 ${y} l S`);
  y -= 18;

  stream.push('BT /F2 12 Tf');
  stream.push(`72 ${y} Td`);
  stream.push(`(STATEMENT OF FINANCIAL POSITION) Tj ET`);
  y -= 18;

  stream.push('BT /F1 9 Tf');
  stream.push(`72 ${y} Td`);
  stream.push(`(As of December 31, ${taxYear}) Tj ET`);
  y -= 22;

  // Assets
  stream.push('BT /F2 10 Tf');
  stream.push(`72 ${y} Td`);
  stream.push(`(ASSETS) Tj ET`);
  y -= 16;

  stream.push('BT /F1 9 Tf');
  stream.push(`90 ${y} Td`);
  stream.push(`(Cash and Cash Equivalents) Tj ET`);
  stream.push('BT /F1 9 Tf 0.5 0.5 0.5 rg');
  stream.push(`440 ${y} Td`);
  stream.push(`($__________) Tj 0 0 0 rg ET`);
  y -= 14;

  stream.push('BT /F1 9 Tf');
  stream.push(`90 ${y} Td`);
  stream.push(`(Total Contributions Received) Tj ET`);
  stream.push('BT /F1 9 Tf');
  stream.push(`440 ${y} Td`);
  stream.push(`(${pdfEscape(fmtDollars(totalRevenueCents))}) Tj ET`);
  y -= 14;

  y -= 4;
  stream.push(`90 ${y} m 540 ${y} l S`);
  y -= 14;

  stream.push('BT /F2 10 Tf');
  stream.push(`90 ${y} Td`);
  stream.push(`(Total Assets) Tj ET`);
  stream.push('BT /F1 10 Tf 0.5 0.5 0.5 rg');
  stream.push(`440 ${y} Td`);
  stream.push(`($__________) Tj 0 0 0 rg ET`);
  y -= 22;

  // Liabilities & Net Assets
  stream.push('BT /F2 10 Tf');
  stream.push(`72 ${y} Td`);
  stream.push(`(LIABILITIES AND NET ASSETS) Tj ET`);
  y -= 16;

  stream.push('BT /F1 9 Tf 0.5 0.5 0.5 rg');
  stream.push(`90 ${y} Td`);
  stream.push(`([To be completed manually]) Tj 0 0 0 rg ET`);
  y -= 22;

  // Notes
  if (y > 100) {
    stream.push('0 0 0 RG 0.5 w');
    stream.push(`72 ${y} m 540 ${y} l S`);
    y -= 16;
    stream.push('BT /F2 9 Tf');
    stream.push(`72 ${y} Td`);
    stream.push(`(NOTES) Tj ET`);
    y -= 14;

    const notes = [
      `Total donations received in ${taxYear}: ${donationCount} contributions totaling ${fmtDollars(totalRevenueCents)}.`,
      `Revenue figures are pre-filled from Zoeist donation records.`,
      `Expense and balance sheet figures must be completed manually before filing.`,
      `This statement is prepared for Georgia Secretary of State C-200 registration renewal.`,
    ];

    stream.push('/F1 8 Tf');
    for (const note of notes) {
      if (y < 50) break;
      stream.push('BT');
      stream.push(`72 ${y} Td`);
      stream.push(`(${pdfEscape(note)}) Tj`);
      stream.push('ET');
      y -= 12;
    }
  }

  const streamContent = stream.join('\n');

  // Obj 4: Content stream
  markObj();
  const streamBytes = encoder.encode(streamContent);
  add(`4 0 obj\n<< /Length ${streamBytes.byteLength} >>\nstream\n`);
  add(streamContent);
  add('\nendstream\nendobj\n');

  // xref
  const xrefOffset = byteLen;
  const numObjs = offsets.length + 1;
  add(`xref\n0 ${numObjs}\n`);
  add('0000000000 65535 f \n');
  for (const off of offsets) {
    add(off.toString().padStart(10, '0') + ' 00000 n \n');
  }

  add('trailer\n');
  add(`<< /Size ${numObjs} /Root 1 0 R >>\n`);
  add('startxref\n');
  add(`${xrefOffset}\n`);
  add('%%EOF\n');

  return encoder.encode(parts.join(''));
}

function pdfEscape(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}
