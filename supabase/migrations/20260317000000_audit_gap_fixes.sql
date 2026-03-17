-- Audit gap fixes: RLS policies, constraints, pledge installment tracking

-- 1. Fix compliance_alert_log: RLS enabled but no policies
-- Only admin users can read (admin dashboard uses anon key + JWT)
-- Service_role (Edge Functions) bypasses RLS, so INSERT works without a policy
CREATE OR REPLACE FUNCTION is_admin_user()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM admin_users
    WHERE auth_user_id = auth.uid() AND is_active = true
  );
$$;

CREATE POLICY compliance_alert_log_admin_read ON compliance_alert_log
  FOR SELECT TO authenticated USING (is_admin_user());

CREATE POLICY compliance_alert_log_service_insert ON compliance_alert_log
  FOR INSERT TO authenticated WITH CHECK (is_admin_user());

-- 2. Add valid channel/category constraints to donor_communications
DO $$ BEGIN
  ALTER TABLE donor_communications
    ADD CONSTRAINT valid_channel
    CHECK (channel IN ('email', 'mail', 'phone', 'sms'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE donor_communications
    ADD CONSTRAINT valid_category
    CHECK (category IN ('receipts', 'statements', 'marketing', 'compliance', 'events', 'newsletters', 'fundraising'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 3. Add installments_total to pledges if not exists (alias for installment_count for clarity)
-- installment_count already exists, ensure installments_paid defaults to 0
DO $$ BEGIN
  ALTER TABLE pledges ADD COLUMN IF NOT EXISTS installments_paid int DEFAULT 0;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- 4. Add form_1098c auto-tracking fields to in_kind_donations
DO $$ BEGIN
  ALTER TABLE in_kind_donations ADD COLUMN IF NOT EXISTS vehicle_vin text;
  ALTER TABLE in_kind_donations ADD COLUMN IF NOT EXISTS vehicle_year int;
  ALTER TABLE in_kind_donations ADD COLUMN IF NOT EXISTS vehicle_make text;
  ALTER TABLE in_kind_donations ADD COLUMN IF NOT EXISTS vehicle_model text;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- 5. Add grant_reports table for tracking reporting deadlines
CREATE TABLE IF NOT EXISTS grant_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grant_id uuid NOT NULL REFERENCES grants(id) ON DELETE CASCADE,
  report_name text NOT NULL,
  due_date date NOT NULL,
  submitted_at timestamptz,
  submitted_by text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'submitted', 'approved', 'revision_requested')),
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_grant_reports_grant ON grant_reports(grant_id);
CREATE INDEX IF NOT EXISTS idx_grant_reports_due ON grant_reports(due_date, status);
ALTER TABLE grant_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY grant_reports_admin_read ON grant_reports
  FOR SELECT TO authenticated USING (is_admin_user());
CREATE POLICY grant_reports_admin_insert ON grant_reports
  FOR INSERT TO authenticated WITH CHECK (is_admin_user());
CREATE POLICY grant_reports_admin_update ON grant_reports
  FOR UPDATE TO authenticated USING (is_admin_user());
CREATE POLICY grant_reports_admin_delete ON grant_reports
  FOR DELETE TO authenticated USING (is_admin_user());

-- 6. Add receipt_url_expiry_seconds to system_config defaults
INSERT INTO system_config (key, value, description)
VALUES (
  'receipt_url_expiry',
  '{"single_seconds": 300, "bulk_seconds": 600}'::jsonb,
  'Signed URL expiry times for receipt downloads'
)
ON CONFLICT (key) DO NOTHING;

-- 7. Add account_mappings schema documentation to system_config
INSERT INTO system_config (key, value, description)
VALUES (
  'account_mappings_schema',
  '{"required_keys": ["_default_income", "_default_bank"], "optional_keys": ["_inkind", "_default_income_code"], "designation_prefix": "", "xero_prefix": "xero_", "description": "Map designation names to account names/codes. Prefix xero_ keys for Xero-specific codes."}'::jsonb,
  'Schema documentation for account_mappings config'
)
ON CONFLICT (key) DO NOTHING;
