-- #785: additive role -> existing ChartAccount binding. No journal data migration.
CREATE TABLE public."SemanticAccountRoleMapping" (
  "tenantId" text NOT NULL REFERENCES public."Tenant"("id") ON DELETE RESTRICT,
  "role" varchar(60) NOT NULL CHECK ("role" IN ('ar','ap','vat_output','vat_input','withholding_payable','payroll_payable','tax_payable','cash','bank','revenue','expense','inventory','asset','cost_of_sales')),
  "accountCode" text NOT NULL,
  "createdBy" text NOT NULL CHECK (length(btrim("createdBy")) > 0),
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "SemanticAccountRoleMapping_pk" PRIMARY KEY ("tenantId", "role"),
  CONSTRAINT "SemanticAccountRoleMapping_account_fk" FOREIGN KEY ("tenantId","accountCode") REFERENCES public."ChartAccount"("tenantId","code") ON UPDATE RESTRICT ON DELETE RESTRICT
);
CREATE INDEX "SemanticAccountRoleMapping_account_idx" ON public."SemanticAccountRoleMapping"("tenantId","accountCode");
ALTER TABLE public."SemanticAccountRoleMapping" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."SemanticAccountRoleMapping" FORCE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON public."SemanticAccountRoleMapping" FROM PUBLIC;
DO $$
DECLARE role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role','contagest_backup','contagest_monitor'] LOOP
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname=role_name) THEN
      EXECUTE pg_catalog.format('REVOKE ALL ON public."SemanticAccountRoleMapping" FROM %I',role_name);
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='contagest_runtime') THEN
    GRANT SELECT,INSERT ON public."SemanticAccountRoleMapping" TO contagest_runtime;
  END IF;
END $$;

-- Enforce append-only at the database boundary even if the canonical runtime
-- sidecar later grants UPDATE/DELETE on all tenant tables.
CREATE FUNCTION public.contagest_785_role_mapping_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  RAISE EXCEPTION 'ACCOUNT_ROLE_MAPPING_IMMUTABLE' USING ERRCODE = '55000';
END;
$$;
CREATE TRIGGER contagest_785_role_mapping_immutable
  BEFORE UPDATE OR DELETE ON public."SemanticAccountRoleMapping"
  FOR EACH ROW EXECUTE FUNCTION public.contagest_785_role_mapping_immutable();
