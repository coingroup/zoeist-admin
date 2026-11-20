-- Admin downloads of receipts and year-end statements (owner item 4451, answer A, 11-20-2026).
--
-- 1. "Admins can manage all profiles" on employee_profiles queried employee_profiles inside its own
--    policy. Every signed-in query that touched employee_profiles (including the storage read rules
--    below) failed with "infinite recursion detected in policy for relation employee_profiles".
--    The role lookup moves into a SECURITY DEFINER function in schema private. That schema is not
--    exposed through the API, so the function is not callable over REST (no new lint 0029 entry).
-- 2. The two receipt read rules let in only employee_profiles admins and managers, but Zoeist's
--    admins are in admin_users. They now also accept public.is_admin_user(), and they apply to
--    signed-in users only (anon has no EXECUTE on is_admin_user and never needed these rules).
--
-- Undo:
--   DROP POLICY "Admins can manage all profiles" ON public.employee_profiles;
--   CREATE POLICY "Admins can manage all profiles" ON public.employee_profiles USING (EXISTS (
--     SELECT 1 FROM public.employee_profiles employee_profiles_1
--     WHERE employee_profiles_1.id = auth.uid() AND employee_profiles_1.role = 'admin'::public.employee_role));
--   For each of the two storage policies, recreate it as in 20260301000001_baseline_storage.sql and
--   20261120000000_receipts_bucket.sql. Then DROP FUNCTION private.current_employee_role(); DROP SCHEMA private;

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.current_employee_role()
RETURNS public.employee_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT ep.role FROM public.employee_profiles ep WHERE ep.id = auth.uid();
$$;

REVOKE ALL ON FUNCTION private.current_employee_role() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.current_employee_role() TO authenticated, service_role;

DROP POLICY IF EXISTS "Admins can manage all profiles" ON public.employee_profiles;
CREATE POLICY "Admins can manage all profiles" ON public.employee_profiles
  TO authenticated
  USING ((SELECT private.current_employee_role()) = 'admin'::public.employee_role);

DROP POLICY IF EXISTS "Admins can read donation receipts" ON storage.objects;
CREATE POLICY "Admins can read donation receipts" ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'donation-receipts'::text AND (
    (SELECT public.is_admin_user())
    OR (SELECT private.current_employee_role()) = ANY (ARRAY['admin'::public.employee_role, 'manager'::public.employee_role])));

DROP POLICY IF EXISTS "Admins can read receipts" ON storage.objects;
CREATE POLICY "Admins can read receipts" ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'receipts'::text AND (
    (SELECT public.is_admin_user())
    OR (SELECT private.current_employee_role()) = ANY (ARRAY['admin'::public.employee_role, 'manager'::public.employee_role])));
