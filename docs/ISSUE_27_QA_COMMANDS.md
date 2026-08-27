# QA reproducible — Issue #27

```bash
node scripts/iam-platform-isolation-audit.mjs
node --test tests/issue_27_platform_iam_isolation.test.mjs
npm --workspace backend run typecheck
```

Para la evidencia completa se requiere PostgreSQL 17 efímero, ejecutar `ops/database/prepare-supabase-ephemeral.sql`, aplicar `npm --workspace backend run prisma:deploy` y después:

```bash
npx tsx qa/iam-platform-real-v27.test.ts
```

El test real no debe apuntar a Supabase compartido ni a producción.
