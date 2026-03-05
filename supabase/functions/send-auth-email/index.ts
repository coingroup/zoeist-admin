import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

serve(async (req: Request) => {
  try {
    const sendgridKey = Deno.env.get('SENDGRID_API_KEY')!;
    const payload = await req.json();

    // Supabase Auth Hook payload
    const { user, email_data } = payload;
    const recipientEmail = user.email;
    const { token, token_hash, redirect_to, email_action_type } = email_data;

    // Build the confirmation URL
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const confirmUrl = `${supabaseUrl}/auth/v1/verify?token=${token_hash}&type=${email_action_type}&redirect_to=${encodeURIComponent(redirect_to || '')}`;

    // Pick subject + body based on email type
    const { subject, html } = buildEmail(email_action_type, confirmUrl, token);

    const sgPayload = {
      personalizations: [{ to: [{ email: recipientEmail }] }],
      from: { email: 'focus@zoeist.org', name: 'Zoeist' },
      subject,
      content: [{ type: 'text/html', value: html }],
      tracking_settings: {
        click_tracking: { enable: false, enable_text: false },
      },
    };

    const sgRes = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${sendgridKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(sgPayload),
    });

    if (!sgRes.ok && sgRes.status !== 202) {
      const errText = await sgRes.text();
      console.error('SendGrid error:', errText);
      return new Response(JSON.stringify({ error: 'Failed to send email' }), { status: 500 });
    }

    return new Response(JSON.stringify({}), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('Error:', err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
});

function buildEmail(type: string, confirmUrl: string, token: string): { subject: string; html: string } {
  if (type === 'magiclink') {
    return {
      subject: 'Your Zoeist Donor Portal Sign-In Link',
      html: brandedEmail(
        'Zoeist Donor Portal',
        'Secure Sign-In',
        'Click the button below to sign in to your donor portal:',
        'Sign In to Portal',
        confirmUrl,
      ),
    };
  }

  if (type === 'signup' || type === 'confirmation') {
    return {
      subject: 'Confirm Your Zoeist Account',
      html: brandedEmail(
        'Zoeist Donor Portal',
        'Confirm Your Email',
        'Click the button below to confirm your email address:',
        'Confirm Email',
        confirmUrl,
      ),
    };
  }

  if (type === 'recovery') {
    return {
      subject: 'Reset Your Zoeist Password',
      html: brandedEmail(
        'Zoeist Donor Portal',
        'Password Reset',
        'Click the button below to reset your password:',
        'Reset Password',
        confirmUrl,
      ),
    };
  }

  if (type === 'email_change') {
    return {
      subject: 'Confirm Email Change',
      html: brandedEmail(
        'Zoeist Donor Portal',
        'Email Change',
        'Click the button below to confirm your new email address:',
        'Confirm Email Change',
        confirmUrl,
      ),
    };
  }

  if (type === 'reauthentication') {
    return {
      subject: 'Confirm Reauthentication',
      html: brandedEmail(
        'Zoeist Donor Portal',
        'Reauthentication',
        `Enter this code to confirm: <strong style="color:#c8a855;font-size:20px;">${escapeHtml(token)}</strong>`,
        '',
        '',
      ),
    };
  }

  // Fallback
  return {
    subject: 'Zoeist Notification',
    html: brandedEmail('Zoeist', 'Notification', 'You have a notification from Zoeist.', 'View', confirmUrl),
  };
}

function brandedEmail(title: string, subtitle: string, message: string, buttonText: string, buttonUrl: string): string {
  const buttonHtml = buttonText && buttonUrl ? `
  <table cellpadding="0" cellspacing="0" style="margin:0 auto 24px;">
    <tr><td style="background:#c8a855;border-radius:8px;">
      <a href="${escapeHtml(buttonUrl)}" style="display:inline-block;padding:14px 36px;color:#0c0b0f;font-size:15px;font-weight:600;text-decoration:none;">
        ${escapeHtml(buttonText)}
      </a>
    </td></tr>
  </table>` : '';

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#0c0b0f;font-family:'Helvetica Neue',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0c0b0f;padding:40px 20px;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#16151b;border-radius:12px;overflow:hidden;">

<tr><td style="background:linear-gradient(135deg,#1a1922,#16151b);padding:32px 40px;border-bottom:2px solid #c8a855;">
  <h1 style="margin:0;color:#c8a855;font-size:20px;font-weight:600;">${escapeHtml(title)}</h1>
  <p style="margin:8px 0 0;color:#8b8899;font-size:13px;">${escapeHtml(subtitle)}</p>
</td></tr>

<tr><td style="padding:32px 40px;">
  <p style="color:#e8e6f0;font-size:15px;margin:0 0 20px;">${message}</p>
  ${buttonHtml}
  <p style="color:#8b8899;font-size:13px;line-height:1.6;margin:0;">If you didn't request this, you can safely ignore this email.</p>
</td></tr>

<tr><td style="padding:24px 40px;border-top:1px solid #2a2935;background:#0c0b0f;">
  <p style="margin:0;color:#5d5b6a;font-size:11px;text-align:center;">Zoeist, Inc. | Georgia, United States | EIN: 92-0954601</p>
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
