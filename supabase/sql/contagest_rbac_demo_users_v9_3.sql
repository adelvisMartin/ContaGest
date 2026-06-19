-- ContaGest-VE v9.3 RBAC/demo users patch
-- Ejecutar en Supabase SQL Editor si quieres crear roles, permisos,
-- usuarios de prueba y tiempo de demo sin pasar por el endpoint /api/v1/rbac/bootstrap.

DO $$
DECLARE
  v_tenant_id text;
  v_role_id text;
  v_perm_id text;
  v_user_id text;
  perm_key text;
  role_name text;
  user_email text;
  user_fullname text;
  user_role text;
BEGIN
  SELECT id INTO v_tenant_id FROM public."Tenant" WHERE rif = 'J123456789' LIMIT 1;

  IF v_tenant_id IS NULL THEN
    INSERT INTO public."Tenant" (id, rif, name, "legalName", plan, status, settings, "createdAt", "updatedAt")
    VALUES (gen_random_uuid()::text, 'J123456789', 'ContaGest Demo', 'ContaGest Demo C.A.', 'enterprise', 'active', '{}'::jsonb, now(), now())
    RETURNING id INTO v_tenant_id;
  END IF;

  FOREACH perm_key IN ARRAY ARRAY[
    'dashboard.view','clients.manage','sales.manage','sales.view','inventory.manage','purchases.manage','accounting.manage','banking.manage',
    'taxes.export','payroll.manage','reports.view','audit.view','orders.manage','orders.view','modules.manage','licenses.manage','demos.manage','admin.manage'
  ] LOOP
    INSERT INTO public."Permission" (id, key, description)
    VALUES (gen_random_uuid()::text, perm_key, 'Permiso ' || perm_key)
    ON CONFLICT (key) DO UPDATE SET description = excluded.description;
  END LOOP;

  FOREACH role_name IN ARRAY ARRAY['Administrador','Contador','Vendedor / Caja','Inventario','RRHH','Demo limitado'] LOOP
    INSERT INTO public."Role" (id, "tenantId", name, description, system, "createdAt", "updatedAt")
    VALUES (gen_random_uuid()::text, v_tenant_id, role_name, 'Rol demo ' || role_name, true, now(), now())
    ON CONFLICT ("tenantId", name) DO UPDATE SET description = excluded.description, system = true, "updatedAt" = now();
  END LOOP;

  -- Limpia permisos demo para recrearlos
  DELETE FROM public."RolePermission"
  WHERE "roleId" IN (SELECT id FROM public."Role" WHERE "tenantId" = v_tenant_id AND name IN ('Administrador','Contador','Vendedor / Caja','Inventario','RRHH','Demo limitado'));

  -- Administrador: todos
  SELECT id INTO v_role_id FROM public."Role" WHERE "tenantId" = v_tenant_id AND name = 'Administrador';
  INSERT INTO public."RolePermission" ("roleId", "permissionId")
  SELECT v_role_id, id FROM public."Permission"
  ON CONFLICT DO NOTHING;

  -- Contador
  SELECT id INTO v_role_id FROM public."Role" WHERE "tenantId" = v_tenant_id AND name = 'Contador';
  FOREACH perm_key IN ARRAY ARRAY['dashboard.view','clients.manage','sales.view','purchases.manage','accounting.manage','banking.manage','taxes.export','reports.view','audit.view'] LOOP
    SELECT id INTO v_perm_id FROM public."Permission" WHERE key = perm_key;
    INSERT INTO public."RolePermission" ("roleId", "permissionId") VALUES (v_role_id, v_perm_id) ON CONFLICT DO NOTHING;
  END LOOP;

  -- Vendedor / Caja
  SELECT id INTO v_role_id FROM public."Role" WHERE "tenantId" = v_tenant_id AND name = 'Vendedor / Caja';
  FOREACH perm_key IN ARRAY ARRAY['dashboard.view','clients.manage','sales.manage','sales.view','orders.manage','orders.view'] LOOP
    SELECT id INTO v_perm_id FROM public."Permission" WHERE key = perm_key;
    INSERT INTO public."RolePermission" ("roleId", "permissionId") VALUES (v_role_id, v_perm_id) ON CONFLICT DO NOTHING;
  END LOOP;

  -- Inventario
  SELECT id INTO v_role_id FROM public."Role" WHERE "tenantId" = v_tenant_id AND name = 'Inventario';
  FOREACH perm_key IN ARRAY ARRAY['dashboard.view','inventory.manage','reports.view'] LOOP
    SELECT id INTO v_perm_id FROM public."Permission" WHERE key = perm_key;
    INSERT INTO public."RolePermission" ("roleId", "permissionId") VALUES (v_role_id, v_perm_id) ON CONFLICT DO NOTHING;
  END LOOP;

  -- RRHH
  SELECT id INTO v_role_id FROM public."Role" WHERE "tenantId" = v_tenant_id AND name = 'RRHH';
  FOREACH perm_key IN ARRAY ARRAY['dashboard.view','payroll.manage','reports.view'] LOOP
    SELECT id INTO v_perm_id FROM public."Permission" WHERE key = perm_key;
    INSERT INTO public."RolePermission" ("roleId", "permissionId") VALUES (v_role_id, v_perm_id) ON CONFLICT DO NOTHING;
  END LOOP;

  -- Demo limitado
  SELECT id INTO v_role_id FROM public."Role" WHERE "tenantId" = v_tenant_id AND name = 'Demo limitado';
  FOREACH perm_key IN ARRAY ARRAY['dashboard.view','clients.manage','sales.view','orders.view','reports.view'] LOOP
    SELECT id INTO v_perm_id FROM public."Permission" WHERE key = perm_key;
    INSERT INTO public."RolePermission" ("roleId", "permissionId") VALUES (v_role_id, v_perm_id) ON CONFLICT DO NOTHING;
  END LOOP;

  FOR user_email, user_fullname, user_role IN
    SELECT * FROM (VALUES
      ('admin@empresa.com','Admin Principal','Administrador'),
      ('contador@empresa.com','María Contador','Contador'),
      ('ventas@empresa.com','Carlos Ventas','Vendedor / Caja'),
      ('inventario@empresa.com','Ana Inventario','Inventario'),
      ('rrhh@empresa.com','Laura RRHH','RRHH'),
      ('demo@empresa.com','Usuario Demo Comercial','Demo limitado')
    ) AS u(email, fullname, role_name)
  LOOP
    INSERT INTO public."UserProfile" (id, "tenantId", email, "fullName", status, "createdAt", "updatedAt")
    VALUES (gen_random_uuid()::text, v_tenant_id, user_email, user_fullname, 'active', now(), now())
    ON CONFLICT ("tenantId", email) DO UPDATE SET "fullName" = excluded."fullName", status = 'active', "updatedAt" = now()
    RETURNING id INTO v_user_id;

    SELECT id INTO v_role_id FROM public."Role" WHERE "tenantId" = v_tenant_id AND name = user_role;
    INSERT INTO public."UserRole" ("userId", "roleId") VALUES (v_user_id, v_role_id) ON CONFLICT DO NOTHING;
  END LOOP;

  INSERT INTO public."DemoAccess" (id, "tenantId", prospect, email, phone, "enabledModules", "expiresAt", "maxUsers", status, notes, "createdAt", "updatedAt")
  VALUES ('demo-access-' || v_tenant_id, v_tenant_id, 'Usuario Demo Comercial', 'demo@empresa.com', '+584120000000',
    '["dashboard","clientes","ventas","pedidos","tracking-pedidos","analytics","soporte"]'::jsonb,
    now() + interval '14 days', 3, 'active', 'Demo comercial v9.3 con vencimiento y módulos controlados', now(), now())
  ON CONFLICT (id) DO UPDATE SET "enabledModules" = excluded."enabledModules", "expiresAt" = excluded."expiresAt", "maxUsers" = excluded."maxUsers", status = 'active', "updatedAt" = now();
END $$;

SELECT 'RBAC demo v9.3 listo' AS status;
