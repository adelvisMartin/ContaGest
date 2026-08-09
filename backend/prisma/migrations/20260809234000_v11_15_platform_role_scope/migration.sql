-- ContaGest v11.15 - distinguish tenant roles from platform roles at the database boundary.
-- Does not reference shared Hipico or Budget Wallet objects.

ALTER TABLE public."Role"
  ADD COLUMN IF NOT EXISTS "scope" text NOT NULL DEFAULT 'tenant';

ALTER TABLE public."Role"
  DROP CONSTRAINT IF EXISTS "Role_scope_check";
ALTER TABLE public."Role"
  ADD CONSTRAINT "Role_scope_check" CHECK ("scope" IN ('tenant','platform'));

-- Migrate only roles that already carry an explicit platform.* permission.
UPDATE public."Role" r
SET "scope"='platform', "updatedAt"=now()
WHERE EXISTS (
  SELECT 1
  FROM public."RolePermission" rp
  JOIN public."Permission" p ON p."id"=rp."permissionId"
  WHERE rp."roleId"=r."id" AND p."key" LIKE 'platform.%'
);

CREATE OR REPLACE FUNCTION private.contagest_guard_platform_role_permission()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  permission_key text;
  role_scope text;
BEGIN
  SELECT p."key" INTO permission_key
  FROM public."Permission" p
  WHERE p."id"=NEW."permissionId";

  IF permission_key LIKE 'platform.%' THEN
    SELECT r."scope" INTO role_scope
    FROM public."Role" r
    WHERE r."id"=NEW."roleId";

    IF COALESCE(role_scope,'tenant') <> 'platform' THEN
      RAISE EXCEPTION 'platform_permission_requires_platform_role'
        USING ERRCODE='42501',
              DETAIL='A platform.* permission cannot be granted to a tenant-scoped role.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "RolePermission_platform_scope_guard" ON public."RolePermission";
CREATE TRIGGER "RolePermission_platform_scope_guard"
BEFORE INSERT OR UPDATE OF "roleId","permissionId" ON public."RolePermission"
FOR EACH ROW EXECUTE FUNCTION private.contagest_guard_platform_role_permission();

CREATE OR REPLACE FUNCTION private.contagest_guard_role_scope_downgrade()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, private
AS $$
BEGIN
  IF OLD."scope"='platform' AND NEW."scope"<>'platform' AND EXISTS (
    SELECT 1
    FROM public."RolePermission" rp
    JOIN public."Permission" p ON p."id"=rp."permissionId"
    WHERE rp."roleId"=OLD."id" AND p."key" LIKE 'platform.%'
  ) THEN
    RAISE EXCEPTION 'platform_role_scope_in_use'
      USING ERRCODE='42501',
            DETAIL='Remove platform permissions before changing the role scope.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "Role_platform_scope_downgrade_guard" ON public."Role";
CREATE TRIGGER "Role_platform_scope_downgrade_guard"
BEFORE UPDATE OF "scope" ON public."Role"
FOR EACH ROW EXECUTE FUNCTION private.contagest_guard_role_scope_downgrade();

CREATE INDEX IF NOT EXISTS "Role_tenant_scope_idx" ON public."Role" ("tenantId","scope");
