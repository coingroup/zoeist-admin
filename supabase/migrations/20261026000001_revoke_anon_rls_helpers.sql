-- Security cleanup: RLS helper functions are used by policies for signed-in users only.
-- Keep EXECUTE for authenticated (policies call them as the invoking role); remove it from anon/PUBLIC.
-- Side effect to verify: policies without a TO clause also apply to anon, so an anon query on those
-- tables now errors with "permission denied for function" instead of returning zero rows.
-- Undo: GRANT EXECUTE ON FUNCTION public.<name>() TO anon;

REVOKE EXECUTE ON FUNCTION public.get_donor_id_for_auth_user() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_admin_user() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_donor_id_for_auth_user() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_admin_user() TO authenticated, service_role;
