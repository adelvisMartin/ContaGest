-- ContaGest v11.15 - covering indexes for SaaS/legal foreign keys reported by the DB advisor.
-- Intentionally excludes shared Budget Wallet and Hipico objects.

CREATE INDEX IF NOT EXISTS "Commission_paymentId_idx"
  ON public."Commission" ("paymentId");
CREATE INDEX IF NOT EXISTS "Commission_subscriptionId_idx"
  ON public."Commission" ("subscriptionId");
CREATE INDEX IF NOT EXISTS "CookiePreference_userId_idx"
  ON public."CookiePreference" ("userId");
CREATE INDEX IF NOT EXISTS "LegalAcceptance_accountUserId_idx"
  ON public."LegalAcceptance" ("accountUserId")
  WHERE "accountUserId" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "LicenseKey_issuedForMembershipId_idx"
  ON public."LicenseKey" ("issuedForMembershipId")
  WHERE "issuedForMembershipId" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "TenantMembership_tenantId_idx"
  ON public."TenantMembership" ("tenantId");
CREATE INDEX IF NOT EXISTS "UserSession_tenantId_idx"
  ON public."UserSession" ("tenantId");
