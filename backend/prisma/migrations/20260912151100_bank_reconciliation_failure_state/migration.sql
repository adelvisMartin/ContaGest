ALTER TABLE "BankReconciliation" DROP CONSTRAINT IF EXISTS "BankReconciliation_status_check";
ALTER TABLE "BankReconciliation"
  ADD CONSTRAINT "BankReconciliation_status_check"
  CHECK ("status" IN ('pending','confirmed','reversed','failed'));

COMMENT ON COLUMN "BankReconciliation"."status" IS
  'pending reserves line balance during write-off execution; failed preserves the attempt without reserving balance; confirmed/reversed are immutable lifecycle outcomes.';
