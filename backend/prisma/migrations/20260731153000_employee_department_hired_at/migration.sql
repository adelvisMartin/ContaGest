ALTER TABLE "Employee"
  ADD COLUMN IF NOT EXISTS "department" TEXT,
  ADD COLUMN IF NOT EXISTS "hiredAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "Employee_tenantId_department_idx"
  ON "Employee"("tenantId", "department");

CREATE INDEX IF NOT EXISTS "Employee_tenantId_hiredAt_idx"
  ON "Employee"("tenantId", "hiredAt");
