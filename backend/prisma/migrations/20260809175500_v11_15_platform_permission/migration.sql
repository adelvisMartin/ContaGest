-- Platform-only permission for ContaGest owner/backoffice.
-- It is intentionally NOT added to the normal tenant Administrador bootstrap role.
INSERT INTO public."Permission" ("id", "key", "description")
VALUES (gen_random_uuid()::text, 'platform.manage', 'Administración comercial global de ContaGest SaaS')
ON CONFLICT ("key") DO UPDATE SET "description" = EXCLUDED."description";

INSERT INTO public."RolePermission" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM public."Role" r
JOIN public."Tenant" t ON t."id" = r."tenantId"
JOIN public."Permission" p ON p."key" = 'platform.manage'
WHERE t."rif" = '00000000'
  AND r."name" = 'Administrador Global'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
