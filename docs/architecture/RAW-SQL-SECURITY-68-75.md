# Raw SQL Security Audit — 68/75

## Scope

This gate covers runtime backend source under `backend/src`. It does not replace Prisma migrations or the database-authority contract from 67/75.

## Security contract

- Values in `$queryRawUnsafe` / `$executeRawUnsafe` must be passed as bound parameters, not interpolated into SQL text.
- String concatenation at the SQL boundary is rejected.
- Non-literal SQL expressions are fail-closed unless explicitly classified in `config/raw-sql-security-68-75.json` with a concrete reason.
- Request-derived SQL text is rejected.
- Dynamic `Prisma.raw(...)` is rejected.
- Inline skip/ignore directives are forbidden.

The preferred shape is static SQL plus positional parameters:

```ts
await prisma.$queryRawUnsafe(
  'SELECT * FROM public."Example" WHERE "tenantId"=$1 AND "id"=$2',
  tenantId,
  id
);
```

## Exceptions

An exception belongs in `approvedDynamicSql`, not in source comments. It must identify the exact file and expression and include a concrete reason. Exceptions are reviewable debt, not a general bypass mechanism.

## CI

`npm run audit:raw-sql-security` runs before characterization/contracts in the primary CI workflow. `tests/raw_sql_security_68_75.test.mjs` is part of the authoritative contract suite.
