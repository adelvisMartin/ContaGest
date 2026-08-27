# Issue #28 — checklist de verificación

- [x] Workflow dedicado con PostgreSQL 17 efímero.
- [x] Prerequisitos Supabase mínimos sin acceso remoto.
- [x] Migración canónica mediante `prisma migrate deploy`.
- [x] `prisma migrate status` registrado.
- [x] Test real de RIF inmutable.
- [x] Test real de `maxTenants` con segundo RIF.
- [x] Test real de `maxUsers` con segundo usuario distinto.
- [x] Test real de binding `SubscriptionTenant` / `LicenseKey`.
- [x] Test de RLS/grants de tablas legales.
- [x] Test de aceptación legal versionada y duplicado exacto.
- [x] Fixtures dentro de transacción con `ROLLBACK` verificado.
- [x] Runner rechaza bases que no terminen en `_e2e`.
- [x] Gate no referencia tablas de Hípico ni Budget Wallet.
- [x] Artefactos de migración, reglas e inventario configurados.
- [ ] Workflow ejecutado realmente sobre el SHA final del PR.
- [ ] Job configurado como required check de `main` en Branch Protection/Ruleset.

No marcar los dos últimos puntos como completados sin evidencia de GitHub. Un job creado pero sin runner no constituye PASS.
