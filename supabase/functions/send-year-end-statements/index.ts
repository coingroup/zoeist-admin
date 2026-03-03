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
    const sendgridKey = Deno.env.get('SENDGRID_API_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Verify admin
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) return json({ error: 'Unauthorized' }, 401);
    const { data: admin } = await supabase.from('admin_users').select('role').eq('auth_user_id', user.id).eq('is_active', true).single();
    if (!admin) return json({ error: 'Not admin' }, 403);

    // Parse request
    const url = new URL(req.url);
    const pathParts = url.pathname.split('/');
    const action = pathParts[pathParts.length - 1] || '';

    // GET /status?tax_year=XXXX — return progress
    if (req.method === 'GET' && action === 'status') {
      const taxYear = parseInt(url.searchParams.get('tax_year') || '');
      if (!taxYear) return json({ error: 'tax_year required' }, 400);

      // Count donors with donations in this year
      const { data: donorIds } = await supabase
        .from('donations')
        .select('donor_id')
        .eq('tax_year', taxYear)
        .eq('status', 'succeeded');

      const uniqueDonorIds = [...new Set((donorIds || []).map((d: any) => d.donor_id))];

      // Count statements already generated
      const { data: generated } = await supabase
        .from('donation_receipts')
        .select('donor_id, sent_at')
        .eq('tax_year', taxYear)
        .eq('receipt_type', 'year_end')
        .is('voided_at', null);

      const generatedMap = new Map((generated || []).map((g: any) => [g.donor_id, g]));
      const generatedCount = generatedMap.size;
      const sentCount = (generated || []).filter((g: any) => g.sent_at).length;

      // Build per-donor status
      const { data: donors } = await supabase
        .from('donors')
        .select('id, first_name, last_name, email')
        .in('id', uniqueDonorIds);

      const donorStatuses = (donors || []).map((d: any) => {
        const stmt = generatedMap.get(d.id);
        return {
          donor_id: d.id,
          name: `${d.first_name || ''} ${d.last_name || ''}`.trim(),
          email: d.email,
          generated: !!stmt,
          sent: stmt?.sent_at ? true : false,
        };
      });

      return json({
        tax_year: taxYear,
        total_donors: uniqueDonorIds.length,
        generated: generatedCount,
        sent: sentCount,
        donors: donorStatuses,
      });
    }

    // POST /generate — generate all statements for a tax year
    if (req.method === 'POST' && action === 'generate') {
      const { tax_year } = await req.json();
      if (!tax_year) return json({ error: 'tax_year required' }, 400);

      // Get all donors with donations in this year
      const { data: donorIds } = await supabase
        .from('donations')
        .select('donor_id')
        .eq('tax_year', tax_year)
        .eq('status', 'succeeded');

      const uniqueDonorIds = [...new Set((donorIds || []).map((d: any) => d.donor_id))];
      if (uniqueDonorIds.length === 0) return json({ error: 'No donations found for this tax year' }, 404);

      const results: any[] = [];
      for (const donorId of uniqueDonorIds) {
        try {
          // Call generate-year-end-statement for each donor
          const genRes = await fetch(`${supabaseUrl}/functions/v1/generate-year-end-statement`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': authHeader,
            },
            body: JSON.stringify({ donor_id: donorId, tax_year }),
          });
          const genData = await genRes.json();
          results.push({ donor_id: donorId, success: genRes.ok, ...genData });
        } catch (err) {
          results.push({ donor_id: donorId, success: false, error: err.message });
        }
      }

      const successCount = results.filter(r => r.success).length;
      return json({
        tax_year,
        total: uniqueDonorIds.length,
        generated: successCount,
        failed: uniqueDonorIds.length - successCount,
        results,
      });
    }

    // POST /send — send emails for all generated statements
    if (req.method === 'POST' && action === 'send') {
      const { tax_year } = await req.json();
      if (!tax_year) return json({ error: 'tax_year required' }, 400);

      // Get all year-end statements that haven't been sent
      const { data: statements } = await supabase
        .from('donation_receipts')
        .select('id, donor_id, pdf_storage_path, receipt_number')
        .eq('tax_year', tax_year)
        .eq('receipt_type', 'year_end')
        .is('voided_at', null)
        .is('sent_at', null);

      if (!statements || statements.length === 0) return json({ message: 'No unsent statements', sent: 0 });

      const results: any[] = [];
      for (const stmt of statements) {
        try {
          // Fetch donor
          const { data: donor } = await supabase.from('donors').select('*').eq('id', stmt.donor_id).single();
          if (!donor || !donor.email) {
            results.push({ donor_id: stmt.donor_id, success: false, error: 'No email' });
            continue;
          }

          // Fetch donations for summary
          const { data: donations } = await supabase
            .from('donations')
            .select('amount_cents, tax_deductible_amount_cents')
            .eq('donor_id', stmt.donor_id)
            .eq('tax_year', tax_year)
            .eq('status', 'succeeded');

          const totalCents = (donations || []).reduce((sum: number, d: any) => sum + (d.tax_deductible_amount_cents || d.amount_cents), 0);
          const donationCount = (donations || []).length;

          // Download PDF from storage
          const { data: pdfData, error: dlErr } = await supabase.storage
            .from('receipts')
            .download(stmt.pdf_storage_path);

          let pdfBase64 = '';
          if (pdfData && !dlErr) {
            const arrayBuf = await pdfData.arrayBuffer();
            pdfBase64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuf)));
          }

          // Send email via SendGrid
          const emailHtml = buildEmailHtml(donor, tax_year, totalCents, donationCount);
          const sgPayload: any = {
            personalizations: [{ to: [{ email: donor.email, name: `${donor.first_name || ''} ${donor.last_name || ''}`.trim() }] }],
            from: { email: 'focus@zoeist.org', name: 'Zoeist, Inc.' },
            subject: `Your ${tax_year} Year-End Giving Statement — Zoeist, Inc.`,
            content: [{ type: 'text/html', value: emailHtml }],
            mail_settings: { bypass_list_management: { enable: true } },
          };

          if (pdfBase64) {
            sgPayload.attachments = [{
              content: pdfBase64,
              filename: `Zoeist-Year-End-Statement-${tax_year}.pdf`,
              type: 'application/pdf',
              disposition: 'attachment',
            }];
          }

          const sgRes = await fetch('https://api.sendgrid.com/v3/mail/send', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${sendgridKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(sgPayload),
          });

          if (sgRes.ok || sgRes.status === 202) {
            await supabase.from('donation_receipts')
              .update({ sent_at: new Date().toISOString(), sent_via: 'email' })
              .eq('id', stmt.id);
            results.push({ donor_id: stmt.donor_id, success: true, email: donor.email });
          } else {
            const sgErr = await sgRes.text();
            results.push({ donor_id: stmt.donor_id, success: false, error: `SendGrid ${sgRes.status}: ${sgErr}` });
          }
        } catch (err) {
          results.push({ donor_id: stmt.donor_id, success: false, error: err.message });
        }
      }

      const sentCount = results.filter(r => r.success).length;
      return json({
        tax_year,
        total: statements.length,
        sent: sentCount,
        failed: statements.length - sentCount,
        results,
      });
    }

    // POST /send-single — send statement for one donor
    if (req.method === 'POST' && action === 'send-single') {
      const { donor_id, tax_year } = await req.json();
      if (!donor_id || !tax_year) return json({ error: 'donor_id and tax_year required' }, 400);

      // First generate (will upsert)
      const genRes = await fetch(`${supabaseUrl}/functions/v1/generate-year-end-statement`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': authHeader },
        body: JSON.stringify({ donor_id, tax_year }),
      });
      if (!genRes.ok) {
        const err = await genRes.json();
        return json({ error: err.error || 'Failed to generate statement' }, 500);
      }

      // Fetch statement record
      const { data: stmt } = await supabase
        .from('donation_receipts')
        .select('id, pdf_storage_path, receipt_number')
        .eq('donor_id', donor_id)
        .eq('tax_year', tax_year)
        .eq('receipt_type', 'year_end')
        .is('voided_at', null)
        .single();

      if (!stmt) return json({ error: 'Statement not found after generation' }, 500);

      // Fetch donor
      const { data: donor } = await supabase.from('donors').select('*').eq('id', donor_id).single();
      if (!donor || !donor.email) return json({ error: 'Donor has no email' }, 400);

      // Fetch donations summary
      const { data: donations } = await supabase
        .from('donations')
        .select('amount_cents, tax_deductible_amount_cents')
        .eq('donor_id', donor_id)
        .eq('tax_year', tax_year)
        .eq('status', 'succeeded');

      const totalCents = (donations || []).reduce((sum: number, d: any) => sum + (d.tax_deductible_amount_cents || d.amount_cents), 0);
      const donationCount = (donations || []).length;

      // Download PDF
      const { data: pdfData } = await supabase.storage.from('receipts').download(stmt.pdf_storage_path);
      let pdfBase64 = '';
      if (pdfData) {
        const arrayBuf = await pdfData.arrayBuffer();
        pdfBase64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuf)));
      }

      // Send via SendGrid
      const emailHtml = buildEmailHtml(donor, tax_year, totalCents, donationCount);
      const sgPayload: any = {
        personalizations: [{ to: [{ email: donor.email, name: `${donor.first_name || ''} ${donor.last_name || ''}`.trim() }] }],
        from: { email: 'focus@zoeist.org', name: 'Zoeist, Inc.' },
        subject: `Your ${tax_year} Year-End Giving Statement — Zoeist, Inc.`,
        content: [{ type: 'text/html', value: emailHtml }],
        mail_settings: { bypass_list_management: { enable: true } },
      };
      if (pdfBase64) {
        sgPayload.attachments = [{
          content: pdfBase64,
          filename: `Zoeist-Year-End-Statement-${tax_year}.pdf`,
          type: 'application/pdf',
          disposition: 'attachment',
        }];
      }

      const sendgridKey = Deno.env.get('SENDGRID_API_KEY')!;
      const sgRes = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${sendgridKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(sgPayload),
      });

      if (sgRes.ok || sgRes.status === 202) {
        await supabase.from('donation_receipts')
          .update({ sent_at: new Date().toISOString(), sent_via: 'email' })
          .eq('id', stmt.id);
        return json({ success: true, donor_id, email: donor.email });
      } else {
        const sgErr = await sgRes.text();
        return json({ error: `SendGrid error: ${sgErr}` }, 500);
      }
    }

    return json({ error: 'Invalid endpoint. Use /status, /generate, /send, or /send-single' }, 400);

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

function buildEmailHtml(donor: any, taxYear: number, totalCents: number, donationCount: number): string {
  const name = donor.first_name || 'Valued Donor';
  const total = `$${(totalCents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#0c0b0f;font-family:'Helvetica Neue',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0c0b0f;padding:40px 20px;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#16151b;border-radius:12px;overflow:hidden;">

<!-- Header -->
<tr><td style="background:linear-gradient(135deg,#1a1922,#16151b);padding:32px 40px;border-bottom:2px solid #c8a855;">
  <h1 style="margin:0;color:#c8a855;font-size:24px;font-weight:600;">Zoeist, Inc.</h1>
  <p style="margin:8px 0 0;color:#8b8899;font-size:13px;">Year-End Giving Statement</p>
</td></tr>

<!-- Body -->
<tr><td style="padding:32px 40px;">
  <p style="color:#e8e6f0;font-size:16px;margin:0 0 20px;">Dear ${escapeHtml(name)},</p>

  <p style="color:#e8e6f0;font-size:15px;line-height:1.6;margin:0 0 20px;">
    Thank you for your generous support of Zoeist, Inc. during ${taxYear}. Attached is your
    Year-End Giving Statement summarizing all contributions for your tax records.
  </p>

  <!-- Summary Card -->
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#1e1d25;border-radius:8px;margin:24px 0;">
  <tr>
    <td style="padding:20px 24px;text-align:center;border-right:1px solid #2a2935;">
      <p style="margin:0;color:#8b8899;font-size:12px;text-transform:uppercase;">Total Given</p>
      <p style="margin:8px 0 0;color:#c8a855;font-size:24px;font-weight:700;">${total}</p>
    </td>
    <td style="padding:20px 24px;text-align:center;">
      <p style="margin:0;color:#8b8899;font-size:12px;text-transform:uppercase;">Donations</p>
      <p style="margin:8px 0 0;color:#c8a855;font-size:24px;font-weight:700;">${donationCount}</p>
    </td>
  </tr>
  </table>

  <p style="color:#e8e6f0;font-size:15px;line-height:1.6;margin:0 0 12px;">
    Your PDF statement is attached to this email. Please retain it for your tax filing records.
  </p>

  <!-- IRS Notice -->
  <div style="background:#1a1922;border-left:3px solid #c8a855;padding:16px 20px;border-radius:4px;margin:20px 0;">
    <p style="color:#8b8899;font-size:12px;line-height:1.5;margin:0;">
      Zoeist, Inc. is a 501(c)(3) tax-exempt organization (EIN: 92-0954601).
      No goods or services were provided in exchange for contributions unless otherwise noted on the attached statement.
      Contributions are tax-deductible to the extent permitted by law.
    </p>
  </div>

  <p style="color:#e8e6f0;font-size:15px;line-height:1.6;margin:20px 0 0;">
    With gratitude,<br>
    <strong style="color:#c8a855;">Zoeist, Inc.</strong>
  </p>
</td></tr>

<!-- Footer -->
<tr><td style="padding:24px 40px;border-top:1px solid #2a2935;background:#0c0b0f;">
  <p style="margin:0;color:#5d5b6a;font-size:11px;text-align:center;">
    This is an official tax document. Please retain for your records.<br>
    Zoeist, Inc. | Georgia, United States | EIN: 92-0954601
  </p>
</td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
