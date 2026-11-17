-- Baseline: production storage buckets and storage.objects policies (project qesjmvgihxhfbieivuvd)
-- as of 11-17-2026, read from storage.buckets and pg_policies. Production already has all of this;
-- its migration ledger is repaired separately, so this file never runs there.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES
  ('company-files', 'company-files', false, 52428800, ARRAY[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'image/png', 'image/jpeg', 'image/gif', 'text/plain', 'text/csv', 'application/zip']),
  ('application-attachments', 'application-attachments', false, 26214400, NULL),
  ('donation-receipts', 'donation-receipts', false, 10485760, ARRAY['application/pdf']),
  ('website', 'website', true, 5242880, ARRAY[
    'text/html', 'text/css', 'application/javascript', 'image/png', 'image/jpeg',
    'image/svg+xml', 'image/x-icon'])
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Admins can delete company files" ON storage.objects;
CREATE POLICY "Admins can delete company files" ON storage.objects FOR DELETE
  USING ((bucket_id = 'company-files'::text) AND (EXISTS (SELECT 1 FROM public.employee_profiles
    WHERE employee_profiles.id = auth.uid() AND employee_profiles.role = 'admin'::public.employee_role)));

DROP POLICY IF EXISTS "Admins can read all attachments" ON storage.objects;
CREATE POLICY "Admins can read all attachments" ON storage.objects FOR SELECT
  USING ((bucket_id = 'application-attachments'::text) AND (EXISTS (SELECT 1 FROM public.employee_profiles
    WHERE employee_profiles.id = auth.uid()
      AND employee_profiles.role = ANY (ARRAY['admin'::public.employee_role, 'manager'::public.employee_role]))));

DROP POLICY IF EXISTS "Admins can read donation receipts" ON storage.objects;
CREATE POLICY "Admins can read donation receipts" ON storage.objects FOR SELECT
  USING ((bucket_id = 'donation-receipts'::text) AND (EXISTS (SELECT 1 FROM public.employee_profiles
    WHERE employee_profiles.id = auth.uid()
      AND employee_profiles.role = ANY (ARRAY['admin'::public.employee_role, 'manager'::public.employee_role]))));

DROP POLICY IF EXISTS "Employees can read company files" ON storage.objects;
CREATE POLICY "Employees can read company files" ON storage.objects FOR SELECT
  USING ((bucket_id = 'company-files'::text) AND (auth.uid() IS NOT NULL) AND (EXISTS (SELECT 1 FROM public.employee_profiles
    WHERE employee_profiles.id = auth.uid() AND employee_profiles.status = 'active'::public.employee_status)));

DROP POLICY IF EXISTS "Employees can upload to company-files" ON storage.objects;
CREATE POLICY "Employees can upload to company-files" ON storage.objects FOR INSERT
  WITH CHECK ((bucket_id = 'company-files'::text) AND (auth.uid() IS NOT NULL) AND (EXISTS (SELECT 1 FROM public.employee_profiles
    WHERE employee_profiles.id = auth.uid() AND employee_profiles.status = 'active'::public.employee_status)));

-- KNOWN ISSUE, mirrored from production on purpose: despite their names, these two policies have no
-- TO clause and check only the bucket, so any caller with the anon key can upload or update files in
-- the public `website` bucket. The fix is a separate migration (owner item), not this baseline.
DROP POLICY IF EXISTS "Service role can update website files" ON storage.objects;
CREATE POLICY "Service role can update website files" ON storage.objects FOR UPDATE
  USING (bucket_id = 'website'::text);

DROP POLICY IF EXISTS "Service role can upload website files" ON storage.objects;
CREATE POLICY "Service role can upload website files" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'website'::text);

DROP POLICY IF EXISTS "Users can read own attachments" ON storage.objects;
CREATE POLICY "Users can read own attachments" ON storage.objects FOR SELECT
  USING ((bucket_id = 'application-attachments'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text));

DROP POLICY IF EXISTS "Users can upload application attachments" ON storage.objects;
CREATE POLICY "Users can upload application attachments" ON storage.objects FOR INSERT
  WITH CHECK ((bucket_id = 'application-attachments'::text) AND (auth.uid() IS NOT NULL)
    AND ((storage.foldername(name))[1] = (auth.uid())::text));
