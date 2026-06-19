-- ContaGest-VE v8.7 Auth Patch
-- Ejecutar en Supabase SQL Editor si ya creaste la base con v8.5.
-- Agrega passwordHash para login/registro backend.

ALTER TABLE public."UserProfile"
  ADD COLUMN IF NOT EXISTS "passwordHash" text;

CREATE INDEX IF NOT EXISTS "UserProfile_tenantId_status_idx"
  ON public."UserProfile"("tenantId", "status");

-- Mantiene el usuario demo sin hash; en desarrollo el backend acepta demo1234
-- únicamente para usuarios legacy sin passwordHash. Registra un usuario real
-- desde la pantalla de Registro para producción/testing serio.
