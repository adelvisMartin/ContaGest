ALTER TABLE "BankReconciliation" DROP CONSTRAINT IF EXISTS "BankReconciliation_status_check";
ALTER TABLE "BankReconciliation"
  ADD CONSTRAINT "BankReconciliation_status_check"
  CHECK ("status" IN ('pending','confirmed','reversed'));
