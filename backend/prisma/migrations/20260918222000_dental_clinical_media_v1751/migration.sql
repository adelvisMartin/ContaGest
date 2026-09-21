-- 17/51 · Odontología: adjuntos clínicos privados y aislados.
-- El bucket multimedia general contagest-media NO se modifica.
-- Los adjuntos dentales usan un bucket dedicado, privado y server-only.
-- El backend accede con service_role; no se crean políticas para authenticated.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'contagest-clinical-media',
  'contagest-clinical-media',
  false,
  15728640,
  ARRAY['image/jpeg','image/png','image/webp','application/pdf']
)
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = 15728640,
    allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp','application/pdf'];

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id='contagest-clinical-media') THEN
    RAISE EXCEPTION 'contagest-clinical-media bucket was not created';
  END IF;
  IF EXISTS (SELECT 1 FROM storage.buckets WHERE id='contagest-clinical-media' AND public = true) THEN
    RAISE EXCEPTION 'contagest-clinical-media must remain private';
  END IF;
END $$;

-- Fail closed: clients authenticated with the anon/user key must not receive
-- direct object access to the clinical bucket. All clinical reads/writes flow
-- through backend authorization + signed URLs generated with service_role.
DROP POLICY IF EXISTS "ContaGest clinical media tenant read" ON storage.objects;
DROP POLICY IF EXISTS "ContaGest clinical media tenant insert" ON storage.objects;
DROP POLICY IF EXISTS "ContaGest clinical media tenant update" ON storage.objects;
DROP POLICY IF EXISTS "ContaGest clinical media tenant delete" ON storage.objects;
