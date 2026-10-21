# Ticket #658 · Verificación de políticas de ciclo de vida de datos

## Alcance del incremento

La autoridad existente es **#562** y no se reemplaza: matriz
`entity-retention-matrix.v1.json`, servicio
`backend/src/modules/data-lifecycle/data-lifecycle.service.ts`,
migración PostgreSQL y gate `data-lifecycle-v562.yml`.

Este incremento añade una regresión al test canónico de #562 para que la
matriz y las dos allowlists del runtime (**protected entities** y **purge
adapters**) no diverjan silenciosamente. También cambia la **transacción de
purga** y su coordinación con políticas y legal holds; no cambia categorías,
plazos legales, permisos, proveedores, migraciones ni datos de producción.

## Invariantes comprobables desde el código

| Categoría | Owner runtime | Retención o borrado permitido |
|---|---|---|
| Auditoría, contabilidad, fiscal, evidencia de cierre | `PROTECTED_ENTITIES` | Nunca purga genérica; no inferir duración legal |
| Media clínica y paciente clínico | `PROTECTED_ENTITIES` | No purga genérica; flujo clínico separado #567 |
| Analytics, import, notificaciones, geocoding | `PURGE_ADAPTER_ENTITIES` | Solo policy versionada con `retentionDays` explícito y tenant autorizado |
| Media estándar | Storage lifecycle guard | Borrado mediante política, antigüedad y legal hold; sin adapter genérico |

El test falla si se elimina del catálogo una entidad protegida o purgeable,
si se duplica una clave, si la duración declarada es inválida, si un tipo
protegido se hace purgeable, si un adapter contradice la matriz o si
`MediaObject` se incorpora erróneamente a la allowlist SQL genérica.

## Validación material que sigue pendiente

La prueba estática no demuestra comportamiento de una transacción. El gate
existente `.github/workflows/data-lifecycle-v562.yml` ejecuta PostgreSQL 17
efímero y el test `qa/data-lifecycle-v562.integration.test.ts`; su ejecución
**en el SHA exacto del candidato** es la evidencia requerida. Ejecutar además
negativos con fixtures A/B y legal holds activos, caducidad/cutoff de fecha,
borrado de datos financieros prohibido, crash/retry y concurrencia de workers,
inventario de objetos huérfanos, exportaciones y restauración.

### Riesgos para investigar (no afirmar como explotación probada)

- **Corrección candidata #658:** `executePurgeBatch` ahora exige el lock
  PostgreSQL del job y el advisory lock tenant-scoped dentro de la **misma
  transacción** que elimina, escribe evidencia hash y actualiza cursor/estado.
  `createLegalHold` y `createRetentionPolicyVersion` usan el mismo lock de
  tenant para no cambiar las reglas entre la evaluación y el commit
  destructivo. Los errores del job guardan códigos acotados, no textos crudos
  de PostgreSQL. El catch sólo escribe error si el contador de intentos del
  job sigue igual al observado antes del lote, para no pisar avances nuevos.
- **Regresiones candidatas #658:** test PG17 con dos workers concurrentes,
  inyección de excepción en `DataLifecycleEvidence` después del DELETE (rollback
  atómico), reintento, aislamiento A/B, conflicto de idempotencia y legal hold
  posterior al claim. **No afirmar PASS hasta obtener resultado del workflow
  del SHA exacto**. Aún debe verificarse timing de holds, más de un job en paralelo
  y restart/restore en el entorno operativo real.
- El API tenant-export actual devuelve un **manifiesto de conteos**, no una
  exportación de payload; no presentarlo como portabilidad completa.

Estas brechas pertenecen a #658 para caracterización y hardening posterior;
no se añaden caminos destructivos ni mock productivos en este incremento.

## Evidencia y criterios de cierre

- `node --test tests/data_lifecycle_v562_contract.test.mjs`: contrato estático.
- Gate exact-SHA `data-lifecycle-v562.yml`: PostgreSQL, storage sandbox,
  typecheck y backend build; consultar conclusión y logs de ese SHA.
- Verificación de las brechas de concurrencia/crash e integridad de evidencia:
  **NOT VERIFIED** hasta haber ejecutado negativos concretos.
- QA manual del propietario: fase final; no sustituye gates anteriores.

**Estado del issue: OPEN / PARTIAL.** No cambiar a DONE antes de satisfacer
los criterios y comprobar que las operaciones destructivas son seguras.

## Verificación local sin minutos de GitHub Actions (para el propietario)

El repositorio usa npm workspaces. Ejecutar **solo en checkout limpio del SHA
del candidato**, con Node 22, Docker y PostgreSQL 17 efímero, nunca sobre la
DB real ni sobre Supabase de producción. Esta es la misma secuencia funcional
de la gate existente `.github/workflows/data-lifecycle-v562.yml`.

1. Guardar el SHA: `git rev-parse HEAD`, `git status --porcelain` (sin
   cambios). `CANDIDATE_SHA` debe coincidir con ese commit.
2. `npm ci`
3. `node --test tests/data_lifecycle_v562_contract.test.mjs`
4. Crear **solo una DB disposable** local llamada
   `contagest_lifecycle_v658_e2e` en PostgreSQL 17 (`_e2e` es la
   protección del entorno). No usar credenciales reales, producción,
   almacenamiento compartido ni datos privados.
5. Exportar `NODE_ENV=test`, `DATABASE_URL` y `DIRECT_DATABASE_URL`
   apuntando **exclusivamente** a la DB efímera y `JWT_SECRET` sintético.
6. `npm run migration:test:from-zero` (procedimiento canónico: bootstrap SQL-first + compatibilidad + cadena de migraciones sobre DB `_e2e`).
7. `npm --workspace backend run prisma:generate`
8. `npm run seed`
9. `npm --workspace backend exec -- tsx --test ../qa/data-lifecycle-v562.integration.test.ts`
10. `npm run typecheck` y `npm run build:backend`
11. Capturar comando, entorno (sin secretos), SHA, exit code y
    resultado de cada gate; destruir el contenedor/DB disposable después.

Los tests PG17 ejecutan triggers sintéticos para simular el fallo de
persistencia de evidencia, por lo que **está prohibido** apuntarlos a una DB
con datos reales. La etapa manual de UI/Android/WhatsApp del propietario
sigue diferida; esta validación automática de persistencia no se omite.

**Estado de cuota/proveedor:** workflows GitHub Actions `queued/pending`
no equivalen a PASS ni prueban por sí solos si la causa es cuota, capacidad
del runner o configuración. La revisión y eventual reducción del costo CI
pertenecen a #654/#655 y a la configuración de la organización, **no** a
cambiar en este PR los checks de todas las ventanas. Registrar
`BLOCKED_PROVIDER` si no corren y conservar las pruebas locales pendientes
en vez de fabricar checks verdes.

### Entrada destructiva fail-closed
`normalizePurgeBatchSize` rechaza antes de crear/ejecutar jobs los valores
fraccionarios, negativos, cero, `NaN`, infinitos y enteros inseguros.
Conserva el límite operativo de 1000 filas por lote y el default 250.
La integración PG17 requiere error `PURGE_BATCH_SIZE_INVALID` sin alterar
el estado o contador de intentos de un job.

### Compatibilidad Prisma/PostgreSQL 17 de locks de ciclo de vida

El retorno de `pg_advisory_xact_lock(bigint)` es `void`. En el candidato
anterior los cuatro locks se consultaban con `SELECT pg_advisory_xact_lock(...)`,
lo que expone el tipo void al deserializador de `$queryRaw`. Ahora se
adquieren dentro de la misma transacción con
`SELECT 1::integer AS "lockAcquired" FROM pg_advisory_xact_lock(...)`,
cuyo resultado es un entero soportado. El control de fuente exige cuatro
usos seguros y prohíbe seleccionar directamente el retorno void.

La corrección **no está verificada aún contra Prisma y PostgreSQL real**.
La regresión de integración PG17 de policy/legal hold/purge sigue siendo
gate material pendiente para fusionar este PR destructivo.
