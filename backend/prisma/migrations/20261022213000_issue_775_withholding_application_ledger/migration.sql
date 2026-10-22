-- #775: append-only, tenant-scoped application of IVA withholding to already
-- posted purchase/AP. This is not a statutory retention voucher/certificate.
CREATE TABLE public."FiscalWithholdingApplication" (
  "id" uuid PRIMARY KEY,
  "tenantId" text NOT NULL REFERENCES public."Tenant"("id") ON DELETE RESTRICT,
  "purchaseInvoiceId" text NOT NULL REFERENCES public."PurchaseInvoice"("id") ON DELETE RESTRICT,
  "sourceLedgerEntryId" text NOT NULL REFERENCES public."LedgerEntry"("id") ON DELETE RESTRICT,
  "ledgerEntryId" text NOT NULL REFERENCES public."LedgerEntry"("id") ON DELETE RESTRICT,
  "kind" text NOT NULL CHECK ("kind"='RET_IVA'),
  "recognizedAt" timestamptz NOT NULL,
  "period" char(7) NOT NULL CHECK ("period" ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$'),
  "taxableMinor" bigint NOT NULL CHECK ("taxableMinor">0),
  "vatMinor" bigint NOT NULL CHECK ("vatMinor">0),
  "withheldMinor" bigint NOT NULL CHECK ("withheldMinor">0 AND "withheldMinor"<="vatMinor"),
  "evidence" jsonb NOT NULL CHECK (jsonb_typeof("evidence")='object'),
  "evidenceSha256" char(64) NOT NULL CHECK ("evidenceSha256" ~ '^[0-9a-f]{64}$'),
  "createdBy" text NOT NULL CHECK (length(btrim("createdBy"))>0),
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "status" text NOT NULL DEFAULT 'POSTED' CHECK ("status" IN ('POSTED','REVERSED')),
  "reversalLedgerEntryId" text REFERENCES public."LedgerEntry"("id") ON DELETE RESTRICT,
  "reversedBy" text,
  "reversedAt" timestamptz,
  "reversalReason" text,
  CONSTRAINT "FiscalWithholdingApplication_once" UNIQUE ("tenantId","purchaseInvoiceId","kind"),
  CONSTRAINT "FiscalWithholdingApplication_tenant_id" UNIQUE ("tenantId","id"),
  CONSTRAINT "FiscalWithholdingApplication_reversal_state" CHECK (
    ("status"='POSTED' AND "reversalLedgerEntryId" IS NULL AND "reversedBy" IS NULL
      AND "reversedAt" IS NULL AND "reversalReason" IS NULL)
    OR ("status"='REVERSED' AND "reversalLedgerEntryId" IS NOT NULL
      AND "reversedBy" IS NOT NULL AND "reversedAt" IS NOT NULL
      AND length(btrim("reversalReason"))>=15)
  )
);
CREATE INDEX "FiscalWithholdingApplication_period_idx"
 ON public."FiscalWithholdingApplication"("tenantId","period","kind","status");
ALTER TABLE public."FiscalWithholdingApplication" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."FiscalWithholdingApplication" FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public."FiscalWithholdingApplication" FROM PUBLIC;
DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon','authenticated','service_role','contagest_backup','contagest_monitor'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=r) THEN
      EXECUTE format('REVOKE ALL ON public."FiscalWithholdingApplication" FROM %I',r);
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='contagest_runtime') THEN
    GRANT SELECT,INSERT ON public."FiscalWithholdingApplication" TO contagest_runtime;
    GRANT UPDATE ("status","reversalLedgerEntryId","reversedBy","reversedAt","reversalReason")
      ON public."FiscalWithholdingApplication" TO contagest_runtime;
  END IF;
END $$;

-- Prevent direct SQL from mutating historical taxes, invoice/ledger references,
-- rate/version, subject identity, amount, or replacing a reversal after posting.
CREATE FUNCTION public.contagest_775_guard_withholding_application()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE purchase_tenant text; source_tenant text; ledger_tenant text; reverse_tenant text;
  source_valid boolean; ledger_valid boolean; reversal_valid boolean;
  line_count integer; distinct_accounts integer; debit_total numeric; credit_total numeric;
BEGIN
  IF TG_OP='DELETE' THEN
    RAISE EXCEPTION 'FISCAL_WITHHOLDING_IMMUTABLE' USING ERRCODE='55000';
  ELSIF TG_OP='UPDATE' THEN
    IF OLD."status"<>'POSTED' OR NEW."status"<>'REVERSED' OR
       (to_jsonb(NEW)-ARRAY['status','reversalLedgerEntryId','reversedBy','reversedAt','reversalReason'])
       IS DISTINCT FROM
       (to_jsonb(OLD)-ARRAY['status','reversalLedgerEntryId','reversedBy','reversedAt','reversalReason']) THEN
       RAISE EXCEPTION 'FISCAL_WITHHOLDING_IMMUTABLE' USING ERRCODE='55000';
    END IF;
  END IF;
  SELECT p."tenantId" INTO purchase_tenant FROM public."PurchaseInvoice" p WHERE p."id"=NEW."purchaseInvoiceId";
  SELECT l."tenantId" INTO source_tenant FROM public."LedgerEntry" l WHERE l."id"=NEW."sourceLedgerEntryId";
  SELECT l."tenantId" INTO ledger_tenant FROM public."LedgerEntry" l WHERE l."id"=NEW."ledgerEntryId";
  IF purchase_tenant IS DISTINCT FROM NEW."tenantId" OR
     source_tenant IS DISTINCT FROM NEW."tenantId" OR
     ledger_tenant IS DISTINCT FROM NEW."tenantId" OR
     NEW."ledgerEntryId"=NEW."sourceLedgerEntryId" THEN
     RAISE EXCEPTION 'FISCAL_WITHHOLDING_TENANT_MISMATCH' USING ERRCODE='23514';
  END IF;
  SELECT EXISTS(
    SELECT 1 FROM public."LedgerEntry" l
    WHERE l."id"=NEW."sourceLedgerEntryId" AND l."source"='purchase'
      AND l."sourceId"=NEW."purchaseInvoiceId" AND l."posted"=true
      AND l."reversalOfId" IS NULL
  ) INTO source_valid;
  SELECT EXISTS(
    SELECT 1 FROM public."LedgerEntry" l
    WHERE l."id"=NEW."ledgerEntryId" AND l."source"='tax'
      AND l."sourceId"=NEW."id"::text AND l."posted"=true
      AND l."reversalOfId" IS NULL
  ) INTO ledger_valid;
  SELECT COUNT(*)::integer,COUNT(DISTINCT ll."accountCode")::integer,
         COALESCE(SUM(ll."debit"),0),COALESCE(SUM(ll."credit"),0)
    INTO line_count,distinct_accounts,debit_total,credit_total
    FROM public."LedgerLine" ll WHERE ll."entryId"=NEW."ledgerEntryId";
  IF NOT source_valid OR NOT ledger_valid OR line_count<>2 OR distinct_accounts<>2 OR
     debit_total<>(NEW."withheldMinor"::numeric/100) OR
     credit_total<>(NEW."withheldMinor"::numeric/100) THEN
    RAISE EXCEPTION 'FISCAL_WITHHOLDING_LEDGER_NOT_RECONCILED' USING ERRCODE='23514';
  END IF;
  IF NEW."status"='REVERSED' THEN
    SELECT l."tenantId",l."posted" INTO reverse_tenant,reversal_valid
    FROM public."LedgerEntry" l
       WHERE l."id"=NEW."reversalLedgerEntryId" AND l."reversalOfId"=NEW."ledgerEntryId";
    IF reverse_tenant IS DISTINCT FROM NEW."tenantId" OR reversal_valid IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'FISCAL_WITHHOLDING_REVERSAL_INVALID' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER contagest_775_guard_withholding_application
  BEFORE INSERT OR UPDATE OR DELETE ON public."FiscalWithholdingApplication"
  FOR EACH ROW EXECUTE FUNCTION public.contagest_775_guard_withholding_application();
