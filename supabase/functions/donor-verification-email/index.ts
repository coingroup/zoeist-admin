import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const sendgridKey = Deno.env.get('SENDGRID_API_KEY')!;
    const cronSecret = Deno.env.get('CRON_SECRET') || '';
    const portalUrl = Deno.env.get('DONOR_PORTAL_URL') || 'https://portal.zoeist.org';
    const supabase = createClient(supabaseUrl, serviceKey);

    // Auth: either cron secret or admin JWT
    const reqCronSecret = req.headers.get('x-cron-secret');
    const authHeader = req.headers.get('Authorization');

    if (reqCronSecret && reqCronSecret === cronSecret) {
      // Cron auth OK
    } else if (authHeader) {
      const token = authHeader.replace('Bearer ', '');
      const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
      if (authErr || !user) return json({ error: 'Unauthorized' }, 401);
      const { data: admin } = await supabase.from('admin_users').select('role').eq('auth_user_id', user.id).eq('is_active', true).single();
      if (!admin) return json({ error: 'Not admin' }, 403);
    } else {
      return json({ error: 'No auth' }, 401);
    }

    // Determine tax year (default: current year)
    const url = new URL(req.url);
    const taxYear = parseInt(url.searchParams.get('tax_year') || String(new Date().getFullYear()));

    // Fetch all donors with donations in this tax year who haven't been sent a verification email yet
    const { data: donors, error: dErr } = await supabase
      .from('donors')
      .select('id, first_name, last_name, email, address_line1, city, state, zip')
      .not('email', 'is', null);

    if (dErr) return json({ error: 'Failed to fetch donors' }, 500);
    if (!donors || donors.length === 0) return json({ message: 'No donors found', sent: 0 });

    // Filter to donors who donated this tax year
    const { data: donorIdsWithDonations } = await supabase
      .from('donations')
      .select('donor_id')
      .eq('tax_year', taxYear)
      .eq('status', 'succeeded');

    const eligibleDonorIds = new Set((donorIdsWithDonations || []).map((d: any) => d.donor_id));

    // Filter to donors not already sent
    const { data: alreadySent } = await supabase
      .from('donor_verification_log')
      .select('donor_id')
      .eq('tax_year', taxYear);

    const sentIds = new Set((alreadySent || []).map((d: any) => d.donor_id));

    const toSend = (donors || []).filter((d: any) => eligibleDonorIds.has(d.id) && !sentIds.has(d.id) && d.email);
    const results: any[] = [];

    for (const donor of toSend) {
      const emailHtml = buildVerificationEmail(donor, taxYear, portalUrl);
      const sgPayload = {
        personalizations: [{ to: [{ email: donor.email }] }],
        from: { email: 'focus@zoeist.org', name: 'Zoeist' },
        subject: `Please verify your address for your ${taxYear} giving statement`,
        content: [{ type: 'text/html', value: emailHtml }],
      };

      const sgRes = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${sendgridKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(sgPayload),
      });

      const sgStatus = sgRes.ok || sgRes.status === 202 ? 'sent' : `error_${sgRes.status}`;

      // Log to verification table
      await supabase.from('donor_verification_log').insert({
        donor_id: donor.id,
        tax_year: taxYear,
      });

      results.push({
        donor_id: donor.id,
        email: donor.email,
        status: sgStatus,
      });
    }

    return json({
      message: `Sent ${results.length} verification emails for tax year ${taxYear}`,
      sent: results.length,
      skipped: donors.length - toSend.length,
      details: results,
    });

  } catch (err) {
    console.error('Error:', err);
    return json({ error: err.message }, 500);
  }
});

function buildVerificationEmail(donor: any, taxYear: number, portalUrl: string): string {
  const name = escapeHtml(`${donor.first_name || ''} ${donor.last_name || ''}`.trim() || 'Donor');
  const address = [donor.address_line1, donor.city, donor.state, donor.zip].filter(Boolean).map(escapeHtml).join(', ') || 'No address on file';

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#0c0b0f;font-family:'Helvetica Neue',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0c0b0f;padding:40px 20px;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#16151b;border-radius:12px;overflow:hidden;">

<!-- Header -->
<tr><td style="background:linear-gradient(135deg,#1a1922,#16151b);padding:32px 40px;border-bottom:2px solid #c8a855;">
  <h1 style="margin:0;color:#c8a855;font-size:20px;font-weight:600;">Address Verification</h1>
  <p style="margin:8px 0 0;color:#8b8899;font-size:13px;">Zoeist, Inc. \u2022 ${taxYear} Giving Statement</p>
</td></tr>

<!-- Body -->
<tr><td style="padding:32px 40px;">
  <p style="color:#e8e6f0;font-size:15px;margin:0 0 20px;">Dear ${name},</p>
  <p style="color:#8b8899;font-size:14px;line-height:1.6;margin:0 0 24px;">
    We are preparing your ${taxYear} year-end giving statement for tax purposes. Please verify that the mailing address below is correct.
  </p>

  <div style="background:#1e1d25;border-radius:8px;padding:20px 24px;margin-bottom:24px;">
    <p style="margin:0 0 4px;color:#8b8899;font-size:12px;text-transform:uppercase;">Address on File</p>
    <p style="margin:0;color:#e8e6f0;font-size:15px;font-weight:500;">${address}</p>
  </div>

  <p style="color:#8b8899;font-size:14px;line-height:1.6;margin:0 0 24px;">
    If this is correct, no action is needed. If you need to update your address, please use the donor portal:
  </p>

  <table cellpadding="0" cellspacing="0" style="margin:0 auto;">
    <tr><td style="background:#c8a855;border-radius:8px;">
      <a href="${escapeHtml(portalUrl)}" style="display:inline-block;padding:12px 32px;color:#0c0b0f;font-size:14px;font-weight:600;text-decoration:none;">
        Update My Address
      </a>
    </td></tr>
  </table>
</td></tr>

<!-- Footer -->
<tr><td style="padding:24px 40px;border-top:1px solid #2a2935;background:#0c0b0f;">
  <p style="margin:0;color:#5d5b6a;font-size:11px;text-align:center;">
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
