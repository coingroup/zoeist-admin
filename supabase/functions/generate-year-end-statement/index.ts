import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    // Auth check
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return new Response(JSON.stringify({ error: 'No auth' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Verify admin
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const { data: admin } = await supabase.from('admin_users').select('role').eq('auth_user_id', user.id).eq('is_active', true).single();
    if (!admin) return new Response(JSON.stringify({ error: 'Not admin' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const { donor_id, tax_year } = await req.json();
    if (!donor_id || !tax_year) return new Response(JSON.stringify({ error: 'donor_id and tax_year required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    // Fetch donor
    const { data: donor, error: donorErr } = await supabase.from('donors').select('*').eq('id', donor_id).single();
    if (donorErr || !donor) return new Response(JSON.stringify({ error: 'Donor not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    // Fetch donations for tax year
    const { data: donations, error: donErr } = await supabase
      .from('donations')
      .select('*')
      .eq('donor_id', donor_id)
      .eq('tax_year', tax_year)
      .eq('status', 'succeeded')
      .order('donated_at', { ascending: true });

    if (donErr) return new Response(JSON.stringify({ error: 'Failed to fetch donations' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    if (!donations || donations.length === 0) return new Response(JSON.stringify({ error: 'No donations found for this donor/year' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    // Check if statement already exists
    const { data: existing } = await supabase
      .from('donation_receipts')
      .select('id, pdf_storage_path')
      .eq('donor_id', donor_id)
      .eq('tax_year', tax_year)
      .eq('receipt_type', 'year_end')
      .is('voided_at', null)
      .maybeSingle();

    // Generate PDF
    const pdfBytes = buildYearEndPdf(donor, donations, tax_year);
    const storagePath = `statements/${tax_year}/${donor_id}.pdf`;

    // Upload to storage
    const { error: uploadErr } = await supabase.storage
      .from('receipts')
      .upload(storagePath, pdfBytes, { contentType: 'application/pdf', upsert: true });
    if (uploadErr) {
      console.error('Upload error:', uploadErr);
      return new Response(JSON.stringify({ error: 'Failed to store PDF' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Generate receipt number for year-end statement
    const { data: receiptNum } = await supabase.rpc('generate_receipt_number');
    const receiptNumber = receiptNum || `Z-${tax_year}-YE-${donor_id.substring(0, 8)}`;

    // Record in donation_receipts (update existing or insert new)
    if (existing) {
      await supabase.from('donation_receipts')
        .update({ pdf_storage_path: storagePath, receipt_number: receiptNumber })
        .eq('id', existing.id);
    } else {
      await supabase.from('donation_receipts').insert({
        donor_id,
        receipt_type: 'year_end',
        tax_year,
        receipt_number: receiptNumber,
        pdf_storage_path: storagePath,
      });
    }

    return new Response(JSON.stringify({
      success: true,
      donor_id,
      tax_year,
      storage_path: storagePath,
      receipt_number: receiptNumber,
      donation_count: donations.length,
      total_cents: donations.reduce((sum: number, d: any) => sum + d.amount_cents, 0),
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (err) {
    console.error('Error:', err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});

// ─── Manual PDF builder (Deno: no npm PDF libraries) ───

function buildYearEndPdf(donor: any, donations: any[], taxYear: number): Uint8Array {
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
  const orgStatus = '501(c)(3)';

  const donorName = donor.is_anonymous ? 'Anonymous Donor' : `${donor.first_name || ''} ${donor.last_name || ''}`.trim();
  const donorAddr = [donor.address_line1, donor.address_line2, [donor.city, donor.state, donor.zip].filter(Boolean).join(', ')].filter(Boolean).join(', ') || 'Address on file';

  const totalCents = donations.reduce((sum: number, d: any) => sum + (d.tax_deductible_amount_cents || d.amount_cents), 0);
  const totalStr = `$${(totalCents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
  const donationCount = donations.length;

  // Build donation table lines
  const tableLines: string[] = [];
  donations.forEach((d: any) => {
    const date = d.donated_at ? new Date(d.donated_at).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' }) : '—';
    const amt = `$${(d.amount_cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
    const receipt = d.receipt_number || '—';
    const designation = d.designation || 'Unrestricted';
    const goodsServices = d.goods_services_provided ? `$${((d.goods_services_value_cents || 0) / 100).toFixed(2)}` : 'None';
    tableLines.push(`${date}    ${padRight(receipt, 16)}${padRight(designation, 18)}${padLeft(amt, 12)}    ${goodsServices}`);
  });

  // IRS disclosure text
  const disclosureLines = [
    `${orgName} is a tax-exempt organization under Section ${orgStatus} of the Internal Revenue Code.`,
    `EIN: ${orgEIN}`,
    '',
    'No goods or services were provided in exchange for the contributions listed above,',
    'unless otherwise noted in the Goods/Services column.',
    '',
    'This statement is provided for your tax records. Please retain for your files.',
    'Contributions are tax-deductible to the extent permitted by law.',
    '',
    `Date of Statement: ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`,
  ];

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

  // Build page content stream
  const stream: string[] = [];
  let y = 740;

  // Title
  stream.push('BT');
  stream.push('/F2 18 Tf');
  stream.push(`72 ${y} Td`);
  stream.push(`(${pdfEscape(orgName)}) Tj`);
  stream.push('ET');
  y -= 22;

  stream.push('BT');
  stream.push('/F1 10 Tf');
  stream.push(`72 ${y} Td`);
  stream.push(`(${pdfEscape(orgAddr)} | EIN: ${orgEIN}) Tj`);
  stream.push('ET');
  y -= 16;

  // Gold line
  stream.push('0.784 0.659 0.333 RG');
  stream.push('2 w');
  stream.push(`72 ${y} m 540 ${y} l S`);
  y -= 28;

  // Statement title
  stream.push('BT');
  stream.push('/F2 14 Tf');
  stream.push(`72 ${y} Td`);
  stream.push(`(Year-End Giving Statement \\2014 Tax Year ${taxYear}) Tj`);
  stream.push('ET');
  y -= 24;

  // Donor info
  stream.push('BT');
  stream.push('/F1 10 Tf');
  stream.push(`72 ${y} Td`);
  stream.push(`(Donor: ${pdfEscape(donorName)}) Tj`);
  stream.push('ET');
  y -= 15;

  stream.push('BT');
  stream.push('/F1 10 Tf');
  stream.push(`72 ${y} Td`);
  stream.push(`(Address: ${pdfEscape(donorAddr)}) Tj`);
  stream.push('ET');
  y -= 15;

  if (donor.email) {
    stream.push('BT');
    stream.push('/F1 10 Tf');
    stream.push(`72 ${y} Td`);
    stream.push(`(Email: ${pdfEscape(donor.email)}) Tj`);
    stream.push('ET');
    y -= 15;
  }

  y -= 10;

  // Summary
  stream.push('BT');
  stream.push('/F2 11 Tf');
  stream.push(`72 ${y} Td`);
  stream.push(`(Total Contributions: ${pdfEscape(totalStr)}  \\(${donationCount} donation${donationCount !== 1 ? 's' : ''}\\)) Tj`);
  stream.push('ET');
  y -= 24;

  // Table header
  stream.push('0.784 0.659 0.333 RG');
  stream.push('0.5 w');
  stream.push(`72 ${y} m 540 ${y} l S`);
  y -= 14;

  stream.push('BT');
  stream.push('/F2 9 Tf');
  stream.push(`72 ${y} Td`);
  stream.push(`(Date          Receipt #        Designation       Amount      Goods/Svc) Tj`);
  stream.push('ET');
  y -= 4;

  stream.push(`72 ${y} m 540 ${y} l S`);
  y -= 14;

  // Table rows
  stream.push('/F1 8.5 Tf');
  for (const line of tableLines) {
    if (y < 120) {
      // Stop if running out of page space (for very long lists, a real impl would add pages)
      stream.push('BT');
      stream.push(`72 ${y} Td`);
      stream.push(`(... and ${tableLines.length - tableLines.indexOf(line)} more donations. See full records online.) Tj`);
      stream.push('ET');
      y -= 14;
      break;
    }
    stream.push('BT');
    stream.push(`72 ${y} Td`);
    stream.push(`(${pdfEscape(line)}) Tj`);
    stream.push('ET');
    y -= 13;
  }

  // Total line
  y -= 4;
  stream.push('0.784 0.659 0.333 RG');
  stream.push(`72 ${y} m 540 ${y} l S`);
  y -= 14;

  stream.push('BT');
  stream.push('/F2 10 Tf');
  stream.push(`72 ${y} Td`);
  stream.push(`(TOTAL TAX-DEDUCTIBLE AMOUNT: ${pdfEscape(totalStr)}) Tj`);
  stream.push('ET');
  y -= 26;

  // IRS disclosure
  stream.push('0 0 0 RG');
  stream.push('/F1 8 Tf');
  for (const line of disclosureLines) {
    if (y < 40) break;
    stream.push('BT');
    stream.push(`72 ${y} Td`);
    stream.push(`(${pdfEscape(line)}) Tj`);
    stream.push('ET');
    y -= 12;
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
  const numObjs = offsets.length + 1; // +1 for obj 0
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

  // Concatenate all parts into a single Uint8Array
  const allBytes = encoder.encode(parts.join(''));
  return allBytes;
}

function pdfEscape(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function padRight(s: string, len: number): string {
  return s.length >= len ? s.substring(0, len) : s + ' '.repeat(len - s.length);
}

function padLeft(s: string, len: number): string {
  return s.length >= len ? s : ' '.repeat(len - s.length) + s;
}
