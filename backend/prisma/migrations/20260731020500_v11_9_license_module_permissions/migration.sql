-- ContaGest v11.9: grant role permissions from the enabled modules of each license.
CREATE OR REPLACE FUNCTION private.sync_license_permissions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  module_values jsonb;
  permission_key text;
  role_record record;
BEGIN
  IF NEW."userId" IS NULL THEN RETURN NEW; END IF;
  module_values := CASE WHEN jsonb_typeof(NEW."modules") = 'array' THEN NEW."modules" WHEN jsonb_typeof(NEW."modules"->'enabled') = 'array' THEN NEW."modules"->'enabled' ELSE '[]'::jsonb END;
  FOR role_record IN SELECT r."id" FROM public."UserRole" ur JOIN public."Role" r ON r."id"=ur."roleId" WHERE ur."userId"=NEW."userId" AND r."tenantId"=NEW."tenantId" LOOP
    FOR permission_key IN SELECT DISTINCT key FROM (
      SELECT 'clients.manage'::text AS key WHERE module_values ? 'clientes'
      UNION ALL SELECT 'inventory.manage' WHERE module_values ?| ARRAY['inventario','inventario-scan','kardex','qr','veterinaria','gimnasio']
      UNION ALL SELECT 'sales.manage' WHERE module_values ?| ARRAY['ventas','cotizacion','pos-sede','pedidos']
      UNION ALL SELECT 'sales.view' WHERE module_values ?| ARRAY['dashboard','ventas','cotizacion','reportes']
      UNION ALL SELECT 'purchases.manage' WHERE module_values ?| ARRAY['compras','proveedores']
      UNION ALL SELECT 'reports.view' WHERE module_values ?| ARRAY['dashboard','reportes','analytics','asistente-ia','pretesting','salud','veterinaria','gimnasio','rutinas','nutricion']
      UNION ALL SELECT 'payroll.manage' WHERE module_values ?| ARRAY['nomina','rrhh']
      UNION ALL SELECT 'banking.manage' WHERE module_values ? 'bancos'
      UNION ALL SELECT 'taxes.export' WHERE module_values ?| ARRAY['tributos','libro-ventas','normativa']
      UNION ALL SELECT 'health.manage' WHERE module_values ?| ARRAY['salud','veterinaria']
      UNION ALL SELECT 'gym.manage' WHERE module_values ?| ARRAY['gimnasio','rutinas','nutricion']
      UNION ALL SELECT 'communications.manage' WHERE module_values ? 'mensajes'
    ) permissions LOOP
      INSERT INTO public."RolePermission" ("roleId","permissionId") SELECT role_record."id",p."id" FROM public."Permission" p WHERE p."key"=permission_key ON CONFLICT ("roleId","permissionId") DO NOTHING;
    END LOOP;
  END LOOP;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.sync_license_permissions() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.sync_license_permissions() TO service_role;
DROP TRIGGER IF EXISTS "sync_license_permissions_after_write" ON public."LicenseKey";
CREATE TRIGGER "sync_license_permissions_after_write" AFTER INSERT OR UPDATE OF "modules", "userId", "status" ON public."LicenseKey" FOR EACH ROW WHEN (NEW."status"='active') EXECUTE FUNCTION private.sync_license_permissions();
UPDATE public."LicenseKey" SET "updatedAt"=now() WHERE "status"='active' AND "userId" IS NOT NULL;
