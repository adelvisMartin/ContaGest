-- ContaGest v11.7: private media bucket for patient, pet, member and profile photos.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('contagest-media', 'contagest-media', false, 3145728, ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = EXCLUDED.file_size_limit, allowed_mime_types = EXCLUDED.allowed_mime_types;
DROP POLICY IF EXISTS "ContaGest media tenant read" ON storage.objects;
CREATE POLICY "ContaGest media tenant read" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'contagest-media' AND (storage.foldername(name))[1] = private.current_tenant_id());
DROP POLICY IF EXISTS "ContaGest media tenant insert" ON storage.objects;
CREATE POLICY "ContaGest media tenant insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'contagest-media' AND (storage.foldername(name))[1] = private.current_tenant_id());
DROP POLICY IF EXISTS "ContaGest media tenant update" ON storage.objects;
CREATE POLICY "ContaGest media tenant update" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'contagest-media' AND (storage.foldername(name))[1] = private.current_tenant_id()) WITH CHECK (bucket_id = 'contagest-media' AND (storage.foldername(name))[1] = private.current_tenant_id());
DROP POLICY IF EXISTS "ContaGest media tenant delete" ON storage.objects;
CREATE POLICY "ContaGest media tenant delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'contagest-media' AND (storage.foldername(name))[1] = private.current_tenant_id());
