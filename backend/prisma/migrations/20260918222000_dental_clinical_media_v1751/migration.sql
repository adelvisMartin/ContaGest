-- 17/51 · Odontología: adjuntos clínicos privados.
-- Amplía el bucket existente a 15 MB/PDF, pero mantiene uploads genéricos de la app
-- limitados a 3 MB. La subcarpeta dental-attachments es server-only: las políticas
-- authenticated históricas se recrean excluyéndola; el backend usa service_role.

UPDATE storage.buckets
SET public = false,
    file_size_limit = 15728640,
    allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp','application/pdf']
WHERE id = 'contagest-media';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id='contagest-media') THEN
    RAISE EXCEPTION 'contagest-media bucket is required before dental clinical media migration';
  END IF;
  IF EXISTS (SELECT 1 FROM storage.buckets WHERE id='contagest-media' AND public = true) THEN
    RAISE EXCEPTION 'contagest-media must remain private';
  END IF;
END $$;

DROP POLICY IF EXISTS "ContaGest media tenant read" ON storage.objects;
CREATE POLICY "ContaGest media tenant read"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id='contagest-media'
  AND (storage.foldername(name))[1]=private.current_tenant_id()
  AND COALESCE((storage.foldername(name))[2],'') <> 'dental-attachments'
);

DROP POLICY IF EXISTS "ContaGest media tenant insert" ON storage.objects;
CREATE POLICY "ContaGest media tenant insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id='contagest-media'
  AND (storage.foldername(name))[1]=private.current_tenant_id()
  AND COALESCE((storage.foldername(name))[2],'') <> 'dental-attachments'
);

DROP POLICY IF EXISTS "ContaGest media tenant update" ON storage.objects;
CREATE POLICY "ContaGest media tenant update"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id='contagest-media'
  AND (storage.foldername(name))[1]=private.current_tenant_id()
  AND COALESCE((storage.foldername(name))[2],'') <> 'dental-attachments'
)
WITH CHECK (
  bucket_id='contagest-media'
  AND (storage.foldername(name))[1]=private.current_tenant_id()
  AND COALESCE((storage.foldername(name))[2],'') <> 'dental-attachments'
);

DROP POLICY IF EXISTS "ContaGest media tenant delete" ON storage.objects;
CREATE POLICY "ContaGest media tenant delete"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id='contagest-media'
  AND (storage.foldername(name))[1]=private.current_tenant_id()
  AND COALESCE((storage.foldername(name))[2],'') <> 'dental-attachments'
);
