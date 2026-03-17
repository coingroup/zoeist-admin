-- Donor Portal Phase 2: RLS policies for pledges, matching gifts
-- Donors can read their own pledges
CREATE POLICY pledges_donor_read ON pledges
  FOR SELECT USING (donor_id = get_donor_id_for_auth_user());

-- Donors can read their own matching gift records
CREATE POLICY matching_gifts_donor_read ON matching_gifts
  FOR SELECT USING (donor_id = get_donor_id_for_auth_user());

-- Donors can read matching gift company info (public reference data)
CREATE POLICY matching_gift_companies_donor_read ON matching_gift_companies
  FOR SELECT USING (true);
