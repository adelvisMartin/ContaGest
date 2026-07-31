-- ContaGest v11.8: specialized vertical permissions for existing administrator roles.
INSERT INTO public."Permission" ("id", "key", "description")
VALUES
  (gen_random_uuid()::text, 'health.manage', 'Administrar pacientes, mascotas, historias, citas y controles clínicos.'),
  (gen_random_uuid()::text, 'gym.manage', 'Administrar socios, membresías, asistencia, rutinas, nutrición y clases.'),
  (gen_random_uuid()::text, 'communications.manage', 'Administrar plantillas y comunicaciones por empresa.')
ON CONFLICT ("key") DO UPDATE SET "description" = EXCLUDED."description";

INSERT INTO public."RolePermission" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM public."Role" r
CROSS JOIN public."Permission" p
WHERE r."system" = true
  AND p."key" IN ('health.manage','gym.manage','communications.manage')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
