-- Phase 10: Donor Self-Service Portal
-- Link donors to Supabase auth users, add RLS policies, verification tracking

-- Link donors to Supabase auth users
ALTER TABLE donors ADD COLUMN auth_user_id uuid REFERENCES auth.users(id);
CREATE UNIQUE INDEX idx_donors_auth_user_id ON donors(auth_user_id) WHERE auth_user_id IS NOT NULL;

-- Helper for RLS policies
CREATE OR REPLACE FUNCTION get_donor_id_for_auth_user()
RETURNS uuid AS $$
  SELECT id FROM donors WHERE auth_user_id = auth.uid() LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- RLS policies (service_role bypasses these, so admin functions unaffected)
CREATE POLICY donors_self_read ON donors FOR SELECT USING (auth_user_id = auth.uid());
CREATE POLICY donors_self_update ON donors FOR UPDATE USING (auth_user_id = auth.uid());
CREATE POLICY donations_donor_read ON donations FOR SELECT USING (donor_id = get_donor_id_for_auth_user());
CREATE POLICY receipts_donor_read ON donation_receipts FOR SELECT USING (donor_id = get_donor_id_for_auth_user());
CREATE POLICY recurring_donor_read ON recurring_donations FOR SELECT USING (donor_id = get_donor_id_for_auth_user());

-- Verification tracking
CREATE TABLE donor_verification_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  donor_id uuid REFERENCES donors(id) ON DELETE CASCADE,
  tax_year int NOT NULL,
  sent_at timestamptz DEFAULT now(),
  verified_at timestamptz,
  UNIQUE(donor_id, tax_year)
);
ALTER TABLE donor_verification_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY dvl_donor_read ON donor_verification_log FOR SELECT USING (donor_id = get_donor_id_for_auth_user());
