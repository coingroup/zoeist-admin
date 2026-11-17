-- Security fix (owner item 3983, 11-17-2026): the two "Service role ..." write policies on the public
-- `website` bucket had no TO clause and checked only the bucket, so anyone with the anon key could
-- upload or overwrite website files. service_role bypasses RLS, so the real writers do not need a
-- policy at all (same reasoning as restrict_public_bucket_listing, 07-22-2026).
-- Undo:
--   CREATE POLICY "Service role can upload website files" ON storage.objects FOR INSERT
--     WITH CHECK (bucket_id = 'website'::text);
--   CREATE POLICY "Service role can update website files" ON storage.objects FOR UPDATE
--     USING (bucket_id = 'website'::text);

DROP POLICY IF EXISTS "Service role can upload website files" ON storage.objects;
DROP POLICY IF EXISTS "Service role can update website files" ON storage.objects;
