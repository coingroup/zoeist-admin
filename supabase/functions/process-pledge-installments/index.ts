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

function advanceDate(dateStr: string, frequency: string): string {
  const d = new Date(dateStr);
  switch (frequency) {
    case 'weekly': d.setDate(d.getDate() + 7); break;
    case 'biweekly': d.setDate(d.getDate() + 14); break;
    case 'monthly': d.setMonth(d.getMonth() + 1); break;
    case 'quarterly': d.setMonth(d.getMonth() + 3); break;
    case 'semi-annual': d.setMonth(d.getMonth() + 6); break;
    case 'annual': d.setFullYear(d.getFullYear() + 1); break;
    default: d.setMonth(d.getMonth() + 1); break;
  }
  return d.toISOString().split('T')[0];
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const cronSecret = Deno.env.get('CRON_SECRET') || '';
    const supabase = createClient(supabaseUrl, serviceKey);

    // Auth: cron secret or admin JWT
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

    const today = new Date().toISOString().split('T')[0];

    // Find all active pledges with next_payment_date <= today
    const { data: duePledges, error: fetchErr } = await supabase
      .from('pledges')
      .select('id, donor_id, total_pledge_cents, paid_to_date_cents, installment_amount_cents, installment_count, installments_paid, frequency, next_payment_date, designation')
      .eq('status', 'active')
      .not('next_payment_date', 'is', null)
      .lte('next_payment_date', today);

    if (fetchErr) return json({ error: fetchErr.message }, 500);
    if (!duePledges || duePledges.length === 0) {
      return json({ message: 'No pledges due for processing', processed: 0 });
    }

    const results: any[] = [];

    for (const pledge of duePledges) {
      const installmentAmount = pledge.installment_amount_cents || 0;
      if (installmentAmount <= 0) continue;

      const newPaid = (pledge.paid_to_date_cents || 0) + installmentAmount;
      const newInstallmentsPaid = (pledge.installments_paid || 0) + 1;
      const totalPledge = pledge.total_pledge_cents || 0;

      // Check if pledge is now fully paid
      const isCompleted = newPaid >= totalPledge;

      const updates: Record<string, any> = {
        paid_to_date_cents: Math.min(newPaid, totalPledge),
        installments_paid: newInstallmentsPaid,
        updated_at: new Date().toISOString(),
      };

      if (isCompleted) {
        updates.status = 'completed';
        updates.next_payment_date = null;
      } else {
        // Advance next_payment_date based on frequency
        updates.next_payment_date = advanceDate(
          pledge.next_payment_date,
          pledge.frequency || 'monthly'
        );
      }

      // Check if max installments reached
      if (pledge.installment_count && newInstallmentsPaid >= pledge.installment_count) {
        updates.status = 'completed';
        updates.next_payment_date = null;
      }

      const { error: updateErr } = await supabase
        .from('pledges')
        .update(updates)
        .eq('id', pledge.id);

      if (updateErr) {
        results.push({ pledge_id: pledge.id, status: 'error', error: updateErr.message });
        continue;
      }

      // Log the installment processing
      await supabase.from('admin_audit_log').insert({
        action: 'process_pledge_installment',
        resource_type: 'pledge',
        resource_id: pledge.id,
        details: {
          installment_amount_cents: installmentAmount,
          new_paid_total_cents: updates.paid_to_date_cents,
          installment_number: newInstallmentsPaid,
          completed: updates.status === 'completed',
          next_payment_date: updates.next_payment_date,
        },
      });

      results.push({
        pledge_id: pledge.id,
        donor_id: pledge.donor_id,
        installment_cents: installmentAmount,
        total_paid_cents: updates.paid_to_date_cents,
        installment_number: newInstallmentsPaid,
        completed: updates.status === 'completed',
        next_payment_date: updates.next_payment_date,
        status: 'processed',
      });
    }

    return json({
      message: `Processed ${results.filter(r => r.status === 'processed').length} of ${duePledges.length} due pledges`,
      processed: results.filter(r => r.status === 'processed').length,
      errors: results.filter(r => r.status === 'error').length,
      details: results,
    });
  } catch (err) {
    console.error('Error:', err);
    return json({ error: err.message }, 500);
  }
});
