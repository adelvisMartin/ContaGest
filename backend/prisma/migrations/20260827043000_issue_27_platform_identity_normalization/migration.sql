-- Issue #27 - fail-closed separation between tenant roles and platform authority.
-- `Role.system` remains lifecycle metadata; it grants no authorization.
-- This migration REVOKES invalid historical platform bindings and never grants a new permission.

CREATE SCHEMA IF NOT EXISTS private;

-- 1) Revoke any historical platform.* binding outside ContaGest's internal tenant.
DELETE FROM public."RolePermission" rp
USING public."Role" r, public."Tenant" t, public."Permission" p
WHERE rp."roleId" = r."id"
  AND r."tenantId" = t."id"
  AND rp."permissionId" = p."id"
  AND p."key" LIKE 'platform.%'
  AND t."rif" <> '00000000';

-- 2) A role outside the internal tenant is always tenant-scoped, even when system=true.
UPDATE public."Role" r
SET "scope" = 'tenant', "updatedAt" = now()
FROM public."Tenant" t
WHERE r."tenantId" = t."id"
  AND t."rif" <> '00000000'
  AND r."scope" <> 'tenant';

-- 3) Inside the internal tenant, preserve platform scope only for roles that already
--    carry an explicit platform.* permission. This changes classification, not authority.
UPDATE public."Role" r
SET "scope" = CASE
  WHEN EXISTS (
    SELECT 1
    FROM public."RolePermission" rp
    JOIN public."Permission" p ON p."id" = rp."permissionId"
    WHERE rp."roleId" = r."id" AND p."key" LIKE 'platform.%'
  ) THEN 'platform'
  ELSE 'tenant'
END,
"updatedAt" = now()
FROM public."Tenant" t
WHERE r."tenantId" = t."id"
  AND t."rif" = '00000000';

CREATE OR REPLACE FUNCTION private.contagest_guard_platform_role_location()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  tenant_rif text;
BEGIN
  IF NEW."scope" = 'platform' THEN
    SELECT t."rif" INTO tenant_rif
    FROM public."Tenant" t
    WHERE t."id" = NEW."tenantId";

    IF COALESCE(tenant_rif, '') <> '00000000' THEN
      RAISE EXCEPTION 'platform_role_requires_internal_tenant'
        USING ERRCODE = '42501',
              DETAIL = 'Only the internal ContaGest tenant may own platform-scoped roles.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "Role_platform_location_guard" ON public."Role";
CREATE TRIGGER "Role_platform_location_guard"
BEFORE INSERT OR UPDATE OF "scope", "tenantId" ON public."Role"
FOR EACH ROW EXECUTE FUNCTION private.contagest_guard_platform_role_location();

-- Replace the previous scope-only guard. The new invariant requires both an
-- internal tenant and platform scope. For bootstrap/seed compatibility, assigning
-- an explicit platform.* permission to an internal role atomically promotes only
-- the role scope; it does not create any permission or UserRole assignment.
CREATE OR REPLACE FUNCTION private.contagest_guard_platform_role_permission()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  permission_key text;
  role_scope text;
  role_tenant_id text;
  tenant_rif text;
BEGIN
  SELECT p."key" INTO permission_key
  FROM public."Permission" p
  WHERE p."id" = NEW."permissionId";

  IF permission_key LIKE 'platform.%' THEN
    SELECT r."scope", r."tenantId", t."rif"
      INTO role_scope, role_tenant_id, tenant_rif
    FROM public."Role" r
    JOIN public."Tenant" t ON t."id" = r."tenantId"
    WHERE r."id" = NEW."roleId";

    IF COALESCE(tenant_rif, '') <> '00000000' THEN
      RAISE EXCEPTION 'platform_permission_requires_internal_tenant'
        USING ERRCODE = '42501',
              DETAIL = 'A platform.* permission cannot be granted to a customer tenant role.';
    END IF;

    IF COALESCE(role_scope, 'tenant') <> 'platform' THEN
      UPDATE public."Role"
      SET "scope" = 'platform', "updatedAt" = now()
      WHERE "id" = NEW."roleId" AND "tenantId" = role_tenant_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "RolePermission_platform_scope_guard" ON public."RolePermission";
CREATE TRIGGER "RolePermission_platform_scope_guard"
BEFORE INSERT OR UPDATE OF "roleId", "permissionId" ON public."RolePermission"
FOR EACH ROW EXECUTE FUNCTION private.contagest_guard_platform_role_permission();

-- A platform role cannot be moved to a customer tenant while it retains global permissions.
CREATE OR REPLACE FUNCTION private.contagest_guard_platform_role_move()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, private
AS $$
BEGIN
  IF NEW."tenantId" <> OLD."tenantId" AND EXISTS (
    SELECT 1
    FROM public."RolePermission" rp
    JOIN public."Permission" p ON p."id" = rp."permissionId"
    WHERE rp."roleId" = OLD."id" AND p."key" LIKE 'platform.%'
  ) THEN
    RAISE EXCEPTION 'platform_role_tenant_move_forbidden'
      USING ERRCODE = '42501',
            DETAIL = 'Remove platform permissions before moving a role between tenants.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "Role_platform_tenant_move_guard" ON public."Role";
CREATE TRIGGER "Role_platform_tenant_move_guard"
BEFORE UPDATE OF "tenantId" ON public."Role"
FOR EACH ROW EXECUTE FUNCTION private.contagest_guard_platform_role_move();

-- Migration invariant: no customer role may retain platform.* after normalization.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public."RolePermission" rp
    JOIN public."Role" r ON r."id" = rp."roleId"
    JOIN public."Tenant" t ON t."id" = r."tenantId"
    JOIN public."Permission" p ON p."id" = rp."permissionId"
    WHERE p."key" LIKE 'platform.%'
      AND (r."scope" <> 'platform' OR t."rif" <> '00000000')
  ) THEN
    RAISE EXCEPTION 'issue_27_platform_normalization_failed';
  END IF;
END;
$$;
