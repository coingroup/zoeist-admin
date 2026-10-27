-- Security cleanup: SECURITY DEFINER functions that must not be callable through the API.
-- Trigger functions run from triggers (EXECUTE is checked at CREATE TRIGGER, not at fire time),
-- and generate_receipt_number is only called by Edge Functions with service_role.
-- Undo: GRANT EXECUTE ON FUNCTION public.<name>() TO anon, authenticated, PUBLIC;

REVOKE EXECUTE ON FUNCTION public.generate_receipt_number() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_donation_tax_year() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_inkind_tax_year() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_campaign_totals() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_donor_totals() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_donors_updated_at() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.generate_receipt_number() TO service_role;
