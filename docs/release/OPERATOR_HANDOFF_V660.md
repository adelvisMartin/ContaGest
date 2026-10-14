# #660 — Release notes y operator handoff reproducible

## Autoridad

Este handoff **no equivale** a autorización de producción. El RC final lo gobierna [#647](https://github.com/adelvisMartin/ContaGest/issues/647), el índice de evidencias es [#662](https://github.com/adelvisMartin/ContaGest/issues/662), y el despliegue real es [#840](https://github.com/adelvisMartin/ContaGest/issues/840). Antes de que #647 apruebe un SHA, `releaseDecision` permanece `NOT_READY`.

El contrato versionado reside en `config/release-operator-handoff-v660.json`; el generador en `scripts/release-operator-handoff-v660.mjs`. No ejecuta comandos operativos, migraciones, backups, despliegues ni requests HTTP. Solamente lee planes y evidencias y escribe dos artifacts sanitizados en `artifacts/release/handoff-v660/<sha>/`.

## Uso exact-SHA (Node 22)

```bash
node --test tests/release_operator_handoff_v660.test.mjs
node scripts/release-operator-handoff-v660.mjs --sha "$(git rev-parse HEAD)"
```

En PowerShell:

```powershell
node --test tests/release_operator_handoff_v660.test.mjs
node scripts/release-operator-handoff-v660.mjs --sha (git rev-parse HEAD).Trim()
```

La herramienta rechaza un SHA diferente al HEAD o worktree sucio. Inspecciona los manifests ya generados por #630 en `artifacts/local-verification/<sha>/<profile>/manifest.json`: verifica SHA, hash, perfil, gates requeridos, comandos y existencia de logs. No abre ni copia logs. Una entrada alterada o incompleta es `FAIL`, sin elevarla a `PASS`. Ninguna evidencia de otro SHA se hereda. Evidencia CI/provider, QA física y revisión de código permanecen `NOT_EXECUTED` si no existe una integración explícita del owner correspondiente.

## Operación y handoff

El Markdown generado reúne, en el orden correcto: configuración y preflight, QA aislada, estado de migraciones, backup/restore drill, migraciones forward-only aprobadas por operador, builds y provenance, smoke local y decisión de rollback/forward-fix. Cada paso apunta a un runbook real y clasifica si es `READ_ONLY`, `QA_ISOLATED` u `OPERATOR_APPROVAL`.

Variables requeridas (nombres, nunca valores): `GIT_COMMIT_SHA`, `NODE_ENV`, `DATABASE_RUNTIME_URL`, `DIRECT_DATABASE_URL`, `DATABASE_RUNTIME_EXPECTED_ROLE`, `JWT_SECRET`, `LICENSE_HASH_SECRET`, `APP_URL`, `CORS_ORIGIN`. La matriz vigente y sus diferencias por entorno son propiedad de `ops/release/production-config-v566.json` y `config/environment-manifest-v665.mjs`; no trasladar secretos al handoff.

Readiness no se infiere de un build: exige rutas de `/health/live` y `/health/ready`, `buildCommit` coincidente, tenant sintético autorizado, errores sin leaks, PostgreSQL migrado y smokes reales. Para instalaciones/QA locales nunca apuntar scripts de persistencia a Supabase de producción. Para recuperar datos, restaurar en un destino aislado tras respaldo e integridad; no ejecutar `down.sql` ni borrar registros contables. Si el esquema no admite rollback de aplicación, detener rollback y escalar a forward-fix documentado.

**Limitación actual:** el generador clasifica manifests #630, pero no consume directamente el futuro schema del índice #662 hasta que este se integre en `main`. La aceptación final de #660 depende del RC exact-SHA #647, de documentación de cambios final y de evidencia runtime/provider real; conservar #660 como `PARTIAL` hasta entonces.