-- 17/51 · Odontología: adjuntos clínicos privados.
-- Amplía la capacidad del bucket existente para radiografías/fotos/estudios/PDF.
-- El bucket permanece privado; uploads genéricos continúan limitados a 3 MB en aplicación.
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
