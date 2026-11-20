-- Year-end giving statements (owner item 3987, answer B, 11-20-2026): generate-year-end-statement
-- uploads to, and send-year-end-statements and the admin app download from, a storage bucket named
-- "receipts" that did not exist. This creates it with the same settings and policy as
-- donation-receipts: private, 10 MB, PDF only, read by admins and managers. Writes come from the
-- Edge Functions with service_role, which bypasses RLS, so no write policy is added.
-- Undo (only while the bucket is empty):
--   DROP POLICY IF EXISTS "Admins can read receipts" ON storage.objects;
--   DELETE FROM storage.buckets WHERE id = 'receipts';

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('receipts', 'receipts', false, 10485760, ARRAY['application/pdf'])
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Admins can read receipts" ON storage.objects;
CREATE POLICY "Admins can read receipts" ON storage.objects FOR SELECT
  USING ((bucket_id = 'receipts'::text) AND (EXISTS (SELECT 1 FROM public.employee_profiles
    WHERE employee_profiles.id = auth.uid()
      AND employee_profiles.role = ANY (ARRAY['admin'::public.employee_role, 'manager'::public.employee_role]))));
