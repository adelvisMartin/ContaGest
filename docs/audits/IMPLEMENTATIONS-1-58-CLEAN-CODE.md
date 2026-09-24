# Auditoría Clean Code · Implementaciones 1–58

## Fuente de verdad

Esta auditoría no reconstruye el roadmap por memoria. La matriz canónica `config/implementation-roadmap-1-58.json` enlaza cada número con:

- PR o PRs mergeados que establecieron la autoridad;
- archivos propietarios vigentes;
- regresiones que deben seguir existiendo;
- estado de revisión Clean Code.

PRs concurrentes/superseded que **no deben restaurarse**: #417, #427, #466, #480, #488 y #499.

## Resultado de inventario

Se reconciliaron **58/58 implementaciones** sin huecos. La auditoría de PRs eliminó de la autoridad #417, #427 y #466 porque fueron cerrados sin merge; sus reemplazos mergeados son #418, #425 y #468 respectivamente. El roadmap histórico 1–51 continúa en 52–58/75; #501 es hardening de infraestructura #134 y no ocupa un número funcional.

## Hotspots detectados

| Superficie | Tamaño observado | Riesgo | Acción |
|---|---:|---|---|
| `health.routes.ts` | ~1.300 líneas | medio/alto | extraer contratos/lógica dental por dominio sin cambiar rutas |
| `veterinary.routes.ts` | ~2.038 líneas | alto | separar lab/hospitalización/finanzas/boarding en módulos internos |
| `gym.routes.ts` | ~1.980 líneas | alto | extraer schemas y servicios de entrenamiento/nutrición por lotes |
| `DentistryPracticePage.jsx` | ~541 líneas | medio | separar composición/state orchestration de panels |
| `VeterinaryWorkspace.jsx` | gran concentración de callbacks/UI | alto | dividir hooks/controladores manteniendo renderer único 21/51 |
| `GymManagementPage.jsx` | múltiples dominios 33–47 | alto | separar composición de training/nutrition sin crear segundo owner |
| `verticalService.js` | cliente común de tres verticales | medio | reducir boilerplate sin alterar rutas/Auth/CSRF |

## Hallazgos ya corregidos en lote 1

### Veterinaria 26–32
`veterinary.routes.ts` duplicaba helpers `ctx` y `one` ya canónicos en `verticals.shared.ts`. Se reutiliza la autoridad compartida. No se unificaron `optionalText`/`optionalDate` porque sus límites veterinarios difieren y hacerlo cambiaría contratos.

### Gimnasio 37–40
La validación de progresión 38/51 estaba copiada en evaluación y rutina, y la relación RIR/RPE se repetía en workout sets. Se movió a funciones puras de `gym.progression.ts` y los schemas sólo traducen issues al path correspondiente.

## Hallazgos concurrentes observados, fuera de este lote

Durante la recuperación real de CI aparecieron defectos adicionales en AppSec, checkout exact-SHA y contratos Hípico/PWA. Se documentan como **follow-up** y no se consideran corregidos por este PR salvo que su diff los contenga. La política es no mezclar esas superficies con el refactor behavior-preserving de verticales.

## Política para próximos lotes

1. Una sola autoridad por regla/dato.
2. No cambiar endpoints ni nombres públicos durante refactors behavior-preserving.
3. Extraer primero lógica pura; luego adapters/rutas.
4. Mantener tenant/RBAC/transacción en el boundary existente.
5. Añadir regresión antes de eliminar duplicación.
6. Cada lote debe pasar typecheck, tests, build, AppSec, PostgreSQL y browser cuando aplique.
7. Ningún job de un SHA anterior valida un head nuevo.

## Lote 2 · mergeado

- `gym.schemas.ts` centraliza los contratos de request de 33–47;
- `veterinary.schemas.ts` centraliza los contratos de request de 26–32;
- rutas conservan RBAC, tenant context, transacciones, SQL y respuestas;
- límites veterinarios específicos se preservan sin forzar reutilización incompatible;
- regresión: `tests/verticals_schema_authority_batch2.test.mjs`.

## Lote 3 · Health/Odontología

- `health.schemas.ts` centraliza 22 contratos Zod antes incrustados en `health.routes.ts`;
- `health.routes.ts` conserva 20/20 rutas, RBAC, transacciones, SQL, locks, normalización y analytics financieros;
- el módulo de schemas no importa Prisma, Router ni middleware de permisos;
- trazabilidad directa: 11, 12, 13, 14, 15, 18, 19 y 20;
- regresión: `tests/health_schema_authority_batch3.test.mjs`.

## Lote 4 · shells frontend

- helpers puros extraídos para Odontología, Veterinaria y Gimnasio;
- estado, effects, callbacks y render ownership permanecen en sus workspaces;
- la matriz conserva historial multi-lote mediante `reviewBatches`;
- regresión: `tests/frontend_vertical_helpers_batch4.test.mjs`.

## Lote 5 · cliente vertical frontend

- `query`, `pathId` y `createWithPhoto` centralizados en `verticalService.helpers.js`;
- las cuatro autoridades públicas de servicio conservan firmas y endpoints;
- `BackendApi` sigue siendo owner de auth/CSRF/idempotencia;
- trazabilidad añadida a 10–47 sin borrar revisiones previas;
- regresión: `tests/vertical_service_clean_code_batch5.test.mjs`.

## Pendiente priorizado

- lote 6: acceso/licensing 52–57;
- cierre: reejecutar 48–51/58 sobre el SHA final y actualizar esta matriz a `CLEAN_CODE_REVIEWED` por bloque.
