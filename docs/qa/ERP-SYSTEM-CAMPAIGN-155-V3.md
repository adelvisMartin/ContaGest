# ContaGest — QA System Campaign #155 · v3

## Propósito

Esta campaña prueba ContaGest como sistema y no como una colección de pantallas aisladas. El gate no hereda PASS entre rutas, roles, estados, geometrías ni flujos críticos.

`IMPLEMENTED != VERIFIED`. Un caso sólo es PASS cuando fue ejecutado sobre el candidate SHA exacto.

## Matriz canónica

La identidad de evidencia es:

`route × role × state × viewport × criticalFlow`

### Rutas

Se usa exclusivamente el catálogo canónico de 58 rutas de `qa/support/module-visual-catalog.mjs`. No existe un segundo inventario paralelo.

### Roles

- `admin` → RBAC `role-admin`;
- `operator` → RBAC real `role-gerente`;
- `read-only` → RBAC real `role-lectura`.

Cuando el contrato RBAC no permite una ruta, el resultado correcto es denegación controlada. Renderizar el módulo o filtrar datos en esa combinación es un finding de autorización.

### Estados

- baseline;
- loading;
- empty;
- error 5xx;
- offline;
- stale;
- role-denied 403;
- boundary.

`offline` y `stale` son estados distintos. Stale utiliza datos sintéticos con `updatedAt/lastSyncedAt` antiguos; no se considera equivalente a una caída de red.

### Viewports

- 360×800 portrait;
- 390×844 portrait;
- 430×932 portrait;
- 768×1024 portrait;
- 1366×768 landscape;
- 1920×1080 landscape;
- 800×360 (phone 360 landscape);
- 844×390 (phone 390 landscape);
- 932×430 (phone 430 landscape).

### Flujos críticos

Los módulos P0/P1 poseen flujos explícitos: create/read/refresh, retry/idempotency, reversos, conciliación, cierre, permisos, navegación cruzada, etc. Las superficies no críticas conservan al menos un `primary-workflow` y los módulos P1 tienen un segundo flow de boundary/recovery cuando aplica.

## Ejecución browser

El workflow `.github/workflows/erp-system-qa-campaign-v155.yml` crea 27 shards:

`3 roles × 9 viewports`

Cada shard recorre **todas las rutas, todos los estados y todos los critical flows** correspondientes a su rol/viewport. Chromium se usa como motor del five-dimensional campaign para mantener el costo controlado, mientras el regression pack existente añade WebKit/Safari y iPhone donde ya existe cobertura canónica.

Cada shard conserva:

- `results.jsonl`;
- metadata de SHA/rol/viewport;
- screenshots de cada FAIL;
- Playwright `test-results` con trace/video cuando Playwright los produzca.

## Qué se usa de verdad en cada módulo

La campaña no se limita a `goto()`:

- scroll completo y retorno;
- navegación por teclado/focus;
- details/tabs;
- formularios visibles con datos sintéticos;
- submit contra APIs mockeadas y stateful;
- cancel/reversal cuando el critical flow lo declara;
- navegación cross-module + back;
- recovery después de error/offline;
- zoom 125%;
- auditoría de overflow, clipping, IDs duplicados, labels, touch targets e inputs móviles.

Nunca se escriben datos productivos: toda API de la campaña browser es interceptada y responde fixtures `SYNTHETIC_TEST_ONLY`.

## Reliability pack

`qa/erp-system-reliability-v155.spec.mjs` prueba además:

1. dos pestañas/sesiones simultáneas con navegación independiente;
2. refresh y back navigation;
3. tenant switch A→B mediante el switcher real;
4. logout → CAPTCHA → login;
5. recreación de browser context conservando storage compatible;
6. manifest PWA y Service Worker con exclusión explícita de `/api/`, auth y build identity de cache stale.

Esto se suma a las suites existentes:

- `qa/exhaustive-route-v164.spec.mjs`;
- `qa/fine-composition-v166.spec.mjs`;
- `qa/route-transition-v164.spec.mjs`;
- `qa/erp-functional-smoke-v14.spec.mjs`;
- WCAG 2.2 + contrast;
- source visual contracts.

## Fixtures y privacidad

Los datos son sintéticos y usan dominios `.test`. La evidencia v3 declara:

```json
{
  "classification": "SYNTHETIC_TEST_ONLY",
  "containsRealPII": false
}
```

El recorder rechaza evidencia que declare PII real.

## Evidence y verdad

La evidencia final se agrega en:

`artifacts/qa/erp-v155/<candidate-sha>/`

con:

- `evidence.json`;
- `summary.json`;
- `defect-candidates.json`;
- `report.md`;
- `SHA256SUMS`.

Estados válidos: `PASS | FAIL | BLOCKED | NOT_EXECUTED`. Ninguno de los dos últimos se convierte en PASS.

## Defect harvesting

El agregador deduplica por:

`route + criticalFlow + finding kind`

Cada candidato incluye severidad P0–P3, ruta, roles, viewports, estados, evidencia, pasos, resultado esperado y rollback. Antes de abrir un issue se busca duplicado.

El incidente conocido del login se enlaza a **#221** en vez de crear un duplicado.

## Gate deliberadamente roto

`tests/erp_e2e_campaign_v3_issue_155.test.mjs` demuestra que el validador rechaza:

- un caso faltante;
- un caso duplicado;
- geometría alterada;
- critical flow inventado.

Así se demuestra que el gate puede fallar y no sólo producir reportes verdes.

## Primera campaña

La primera corrida de este PR se ejecuta sobre el `main` candidato que contiene el defecto conocido #221 mientras PR #222 siga sin merge. Si el login falla, el resultado correcto es FAIL vinculado a #221. Después de corregir un finding se repite la misma campaña sobre el nuevo SHA.

## Criterio de cierre de #155

#155 sólo puede cerrarse cuando:

- la matriz completa está observada;
- ningún P0/P1 queda sin issue o referencia;
- los correctivos fueron rerun sobre su SHA;
- el regression pack está verde;
- evidencia y hashes están publicados;
- no existe NOT_EXECUTED oculto como PASS.
