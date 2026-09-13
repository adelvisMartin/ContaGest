CREATE OR REPLACE FUNCTION public.prevent_bank_statement_evidence_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."tenantId" IS DISTINCT FROM OLD."tenantId"
     OR NEW."accountId" IS DISTINCT FROM OLD."accountId"
     OR NEW."fileName" IS DISTINCT FROM OLD."fileName"
     OR NEW."format" IS DISTINCT FROM OLD."format"
     OR NEW."parserName" IS DISTINCT FROM OLD."parserName"
     OR NEW."parserVersion" IS DISTINCT FROM OLD."parserVersion"
     OR NEW."sourceHash" IS DISTINCT FROM OLD."sourceHash"
     OR NEW."rawContent" IS DISTINCT FROM OLD."rawContent"
     OR NEW."openingBalance" IS DISTINCT FROM OLD."openingBalance"
     OR NEW."closingBalance" IS DISTINCT FROM OLD."closingBalance"
     OR NEW."currency" IS DISTINCT FROM OLD."currency"
     OR NEW."sourceMetadata" IS DISTINCT FROM OLD."sourceMetadata"
     OR NEW."uploadedBy" IS DISTINCT FROM OLD."uploadedBy"
     OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
  THEN
    RAISE EXCEPTION 'BankStatementImport evidence is immutable' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "BankStatementImport_immutable_evidence" ON "BankStatementImport";
CREATE TRIGGER "BankStatementImport_immutable_evidence"
BEFORE UPDATE ON "BankStatementImport"
FOR EACH ROW EXECUTE FUNCTION public.prevent_bank_statement_evidence_mutation();

CREATE OR REPLACE FUNCTION public.prevent_bank_statement_line_evidence_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."tenantId" IS DISTINCT FROM OLD."tenantId"
     OR NEW."importId" IS DISTINCT FROM OLD."importId"
     OR NEW."accountId" IS DISTINCT FROM OLD."accountId"
     OR NEW."bankLineId" IS DISTINCT FROM OLD."bankLineId"
     OR NEW."lineHash" IS DISTINCT FROM OLD."lineHash"
     OR NEW."bookedAt" IS DISTINCT FROM OLD."bookedAt"
     OR NEW."valueDate" IS DISTINCT FROM OLD."valueDate"
     OR NEW."amount" IS DISTINCT FROM OLD."amount"
     OR NEW."currency" IS DISTINCT FROM OLD."currency"
     OR NEW."reference" IS DISTINCT FROM OLD."reference"
     OR NEW."memo" IS DISTINCT FROM OLD."memo"
     OR NEW."counterparty" IS DISTINCT FROM OLD."counterparty"
     OR NEW."raw" IS DISTINCT FROM OLD."raw"
     OR NEW."normalized" IS DISTINCT FROM OLD."normalized"
     OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
  THEN
    RAISE EXCEPTION 'BankStatementLine evidence is immutable' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "BankStatementLine_immutable_evidence" ON "BankStatementLine";
CREATE TRIGGER "BankStatementLine_immutable_evidence"
BEFORE UPDATE ON "BankStatementLine"
FOR EACH ROW EXECUTE FUNCTION public.prevent_bank_statement_line_evidence_mutation();
