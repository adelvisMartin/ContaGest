-- Issue #96: explicit fiscal permissions. Existing role grants are intentionally not inferred.
-- Fresh seeded environments grant all permissions to the QA/admin role after migrations.

INSERT INTO "Permission" ("id", "key", "description") VALUES
  (gen_random_uuid()::text, 'fiscal.read', 'Consultar períodos y documentos fiscales'),
  (gen_random_uuid()::text, 'fiscal.manage_documents', 'Registrar documentos fiscales'),
  (gen_random_uuid()::text, 'fiscal.close', 'Cerrar períodos fiscales'),
  (gen_random_uuid()::text, 'fiscal.reopen', 'Reabrir períodos fiscales con motivo auditable')
ON CONFLICT ("key") DO UPDATE SET "description" = EXCLUDED."description";
