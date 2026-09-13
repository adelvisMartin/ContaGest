CREATE OR REPLACE FUNCTION public.bank_reconciliation_model_before_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW."tenantId" || ':bank-reconciliation-model:' || NEW."name", 0));

  SELECT COALESCE(MAX("version"), 0) + 1
    INTO NEW."version"
  FROM public."BankReconciliationModel"
  WHERE "tenantId" = NEW."tenantId"
    AND "name" = NEW."name";

  UPDATE public."BankReconciliationModel"
  SET "active" = false
  WHERE "tenantId" = NEW."tenantId"
    AND "name" = NEW."name"
    AND "active" = true;

  NEW."active" := true;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bank_reconciliation_model_version_guard ON public."BankReconciliationModel";
CREATE TRIGGER bank_reconciliation_model_version_guard
BEFORE INSERT ON public."BankReconciliationModel"
FOR EACH ROW EXECUTE FUNCTION public.bank_reconciliation_model_before_insert();

CREATE OR REPLACE FUNCTION public.bank_reconciliation_model_after_insert_audit()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO public."AuditLog" (
    "id", "tenantId", "userId", "action", "entity", "entityId", "before", "after", "createdAt"
  ) VALUES (
    gen_random_uuid()::text,
    NEW."tenantId",
    NEW."createdBy",
    'bank-reconciliation.model.version-created',
    'BankReconciliationModel',
    NEW."id",
    NULL,
    jsonb_build_object(
      'name', NEW."name",
      'version', NEW."version",
      'memoPattern', NEW."memoPattern",
      'accountCode', NEW."accountCode",
      'accountName', NEW."accountName",
      'reasonCode', NEW."reasonCode",
      'autoApply', NEW."autoApply",
      'minConfidence', NEW."minConfidence"
    ),
    now()
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bank_reconciliation_model_version_audit ON public."BankReconciliationModel";
CREATE TRIGGER bank_reconciliation_model_version_audit
AFTER INSERT ON public."BankReconciliationModel"
FOR EACH ROW EXECUTE FUNCTION public.bank_reconciliation_model_after_insert_audit();

COMMENT ON FUNCTION public.bank_reconciliation_model_before_insert() IS
  'Serializes recurring reconciliation model versions per tenant/name and leaves exactly one active version.';
COMMENT ON FUNCTION public.bank_reconciliation_model_after_insert_audit() IS
  'Creates immutable AuditLog evidence for every recurring reconciliation model version.';
