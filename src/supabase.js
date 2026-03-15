import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://qesjmvgihxhfbieivuvd.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFlc2ptdmdpaHhoZmJpZWl2dXZkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIzOTQzOTQsImV4cCI6MjA4Nzk3MDM5NH0.DL0CVj-Y9CZAql9vtmwomD2kwX7eKPh0Vp2wIKQ6qIg';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export const ADMIN_API_URL = `${supabaseUrl}/functions/v1/admin-api`;
export const YEAR_END_API_URL = `${supabaseUrl}/functions/v1/send-year-end-statements`;
export const RECURRING_API_URL = `${supabaseUrl}/functions/v1/recurring-api`;
export const COMPLIANCE_REPORTS_URL = `${supabaseUrl}/functions/v1/compliance-reports`;
export const COMPLIANCE_ALERTS_URL = `${supabaseUrl}/functions/v1/compliance-alerts`;
export const COMPLIANCE_FIN_STMT_URL = `${supabaseUrl}/functions/v1/compliance-financial-statement`;
export const MATCHING_GIFTS_API_URL = `${supabaseUrl}/functions/v1/matching-gifts-api`;
export const EVENTS_API_URL = `${supabaseUrl}/functions/v1/events-api`;
export const FUNDRAISING_API_URL = `${supabaseUrl}/functions/v1/fundraising-api`;
export const ADMIN_EXTRAS_API_URL = `${supabaseUrl}/functions/v1/admin-extras-api`;

export async function adminFetch(path, options = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const url = path.startsWith('http') ? path : `${ADMIN_API_URL}/${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
      ...options.headers,
    },
  });

  if (res.headers.get('Content-Type')?.includes('text/csv')) {
    return res;
  }

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}
