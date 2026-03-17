import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

const ALERT_THRESHOLDS = [90, 60, 30, 14, 7];

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const sendgridKey = Deno.env.get('SENDGRID_API_KEY')!;
    const cronSecret = Deno.env.get('CRON_SECRET') || '';
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

    // Query all non-completed deadlines
    const { data: deadlines, error: dlErr } = await supabase
      .from('compliance_deadlines')
      .select('*')
      .neq('status', 'completed');

    if (dlErr) return json({ error: 'Failed to fetch deadlines' }, 500);
    if (!deadlines || deadlines.length === 0) return json({ message: 'No upcoming deadlines', alerts_sent: 0 });

    const now = new Date();
    const alertsSent: any[] = [];

    for (const deadline of deadlines) {
      const dueDate = new Date(deadline.deadline_date);
      const daysRemaining = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

      // Find which thresholds apply (days remaining <= threshold)
      for (const threshold of ALERT_THRESHOLDS) {
        if (daysRemaining > threshold || daysRemaining < 0) continue;

        // Check if alert already sent for this deadline + threshold
        const { data: existing } = await supabase
          .from('compliance_alert_log')
          .select('id')
          .eq('deadline_id', deadline.id)
          .eq('alert_days', threshold)
          .maybeSingle();

        if (existing) continue;

        // Determine recipient
        const sendTo = deadline.assigned_to || 'focus@zoeist.org';

        // Check communication preferences — respect opt-outs for compliance category
        if (sendTo !== 'focus@zoeist.org') {
          const { data: donor } = await supabase.from('donors').select('id').eq('email', sendTo).single();
          if (donor) {
            const { data: optOut } = await supabase.from('donor_communications')
              .select('id')
              .eq('donor_id', donor.id)
              .eq('channel', 'email')
              .eq('category', 'compliance')
              .eq('opted_in', false)
              .maybeSingle();
            if (optOut) {
              // Log skipped alert
              await supabase.from('compliance_alert_log').insert({
                deadline_id: deadline.id,
                alert_days: threshold,
                sent_to: sendTo,
                sendgrid_status: 'skipped_opt_out',
              });
              alertsSent.push({
                deadline_id: deadline.id,
                filing_name: deadline.filing_name,
                days_remaining: daysRemaining,
                threshold,
                sent_to: sendTo,
                status: 'skipped_opt_out',
              });
              break;
            }
          }
        }

        // Send email via SendGrid
        const emailHtml = buildAlertEmail(deadline, daysRemaining, threshold);
        const sgPayload = {
          personalizations: [{ to: [{ email: sendTo }] }],
          from: { email: 'focus@zoeist.org', name: 'Zoeist Compliance' },
          subject: `Compliance Alert: ${deadline.filing_name || 'Deadline'} due in ${daysRemaining} days`,
          content: [{ type: 'text/html', value: emailHtml }],
        };

        const sgRes = await fetch('https://api.sendgrid.com/v3/mail/send', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${sendgridKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(sgPayload),
        });

        const sgStatus = sgRes.ok || sgRes.status === 202 ? 'sent' : `error_${sgRes.status}`;

        // Log the alert
        await supabase.from('compliance_alert_log').insert({
          deadline_id: deadline.id,
          alert_days: threshold,
          sent_to: sendTo,
          sendgrid_status: sgStatus,
        });

        alertsSent.push({
          deadline_id: deadline.id,
          filing_name: deadline.filing_name,
          days_remaining: daysRemaining,
          threshold,
          sent_to: sendTo,
          status: sgStatus,
        });

        // Only send one alert per deadline per run (the most urgent threshold)
        break;
      }
    }

    return json({
      message: `Checked ${deadlines.length} deadlines`,
      alerts_sent: alertsSent.length,
      details: alertsSent,
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

function buildAlertEmail(deadline: any, daysRemaining: number, threshold: number): string {
  const filingName = escapeHtml(deadline.filing_name || 'Unknown Filing');
  const description = escapeHtml(deadline.description || '');
  const dueDate = new Date(deadline.deadline_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const urgencyColor = daysRemaining <= 7 ? '#f87171' : daysRemaining <= 14 ? '#fb923c' : '#c8a855';

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#0c0b0f;font-family:'Helvetica Neue',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0c0b0f;padding:40px 20px;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#16151b;border-radius:12px;overflow:hidden;">

<!-- Header -->
<tr><td style="background:linear-gradient(135deg,#1a1922,#16151b);padding:32px 40px;border-bottom:2px solid ${urgencyColor};">
  <h1 style="margin:0;color:${urgencyColor};font-size:20px;font-weight:600;">Compliance Alert</h1>
  <p style="margin:8px 0 0;color:#8b8899;font-size:13px;">Zoeist, Inc.</p>
</td></tr>

<!-- Body -->
<tr><td style="padding:32px 40px;">
  <div style="background:#1e1d25;border-radius:8px;padding:20px 24px;margin-bottom:24px;text-align:center;">
    <p style="margin:0;color:#8b8899;font-size:12px;text-transform:uppercase;">Days Remaining</p>
    <p style="margin:8px 0 0;color:${urgencyColor};font-size:36px;font-weight:700;">${daysRemaining}</p>
  </div>

  <p style="color:#e8e6f0;font-size:16px;font-weight:600;margin:0 0 8px;">${filingName}</p>
  ${description ? `<p style="color:#8b8899;font-size:14px;margin:0 0 16px;">${description}</p>` : ''}

  <table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;">
    <tr>
      <td style="padding:8px 0;color:#8b8899;font-size:13px;">Due Date</td>
      <td style="padding:8px 0;color:#e8e6f0;font-size:13px;text-align:right;font-weight:600;">${dueDate}</td>
    </tr>
    <tr>
      <td style="padding:8px 0;color:#8b8899;font-size:13px;">Status</td>
      <td style="padding:8px 0;color:#e8e6f0;font-size:13px;text-align:right;">${deadline.status || 'upcoming'}</td>
    </tr>
  </table>

  <p style="color:#8b8899;font-size:13px;margin:20px 0 0;">
    This is an automated compliance reminder from Zoeist Admin.
  </p>
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
