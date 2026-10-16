# #688 · Restauración de contrato Prisma AsyncJobIntent

## Causa raíz reproducible

La compilación de Vercel `dpl_6RwRPZXMtZSy4X6YgtfyuKariMrY`, asociada a `main@d59382c8d62e767fae6e1e11098c37eee4ff03cd`, falló el 2026-10-16 durante `npm ci --no-audit --no-fund` → `npm run prisma:generate` → `prisma generate` con **P1012**: `Type "AsyncJobIntent" is neither a built-in type, nor refers to another model` en `backend/prisma/schema.prisma:102`.

El Tenant conserva `asyncJobIntents AsyncJobIntent[]`. El modelo `AsyncJobIntent` existía exactamente en commit histórico `84f85aba059442f98601c3fb0bd96421fafa13ff` (blob de Prisma `e8c31d74c4fd903535fdcc2aab150808a5088846`) y la migración **ya aplicada/reconocida** `20261015114500_issue_853_job_intent_foundation` define la tabla y el índice único `async_job_intent_effect`. El esquema actual omitía el bloque, aunque mantenía la relación. El error es de fuente/Prisma, no prueba de un problema de cuota o de PostgreSQL.

## Reparación

Restaurar el **mismo bloque del modelo histórico** dentro del esquema canónico, sin tocar `Tenant`, tablas, DDL, índices migrados, SQL/RLS, jobs runtime, permisos, workflows, secretos ni otros productos. No generar una segunda migration: el objetivo es recobrar paridad Prisma ↔ migración existente. El servicio de sincronización de Employee/PriceBook no es el dueño de esta relación y permanece inalterado.

Se añade `tests/prisma_async_job_intent_schema_v688.test.mjs`: presencia única del modelo, FK tenant RESTRICT, pares de campos con la migración, unique index y conservación del cierre RLS. La prueba es útil como alerta de regresión, pero **no sustituye ejecutar `prisma validate` ni `prisma generate`** en un checkout real.

## Gates y riesgos

- Verificar: `node --test tests/prisma_async_job_intent_schema_v688.test.mjs`.
- Verificar en el repo con deps: `npm --workspace backend run prisma:generate`, `npm --workspace backend run typecheck`, `npm run lint`, `npm run build`.
- El deployment Vercel exact-SHA y CI deben aportar evidencia de que el error P1012 desapareció; otros errores posteriores serán clasificados independientemente. Ningún éxito de deployment se supone por editar el archivo.
- Reversión: revertir el cambio de esquema + test/guía. No hay migración nueva ni datos que revertir. Revertir el modelo sin ajustar la relación del Tenant volvería a introducir P1012, por lo que rollback técnico debe considerarse junto al schema.

**Cierre:** #688 requiere build/deploy válido o bloqueo externo concreto con evidencia. No marcar DONE antes de ello ni reinterpretar PR MERGED como despliegue READY.
