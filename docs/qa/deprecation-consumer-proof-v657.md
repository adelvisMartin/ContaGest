# #657 — Deprecation consumer proof · fase inicial

## Brecha detectada
El catálogo `config/architecture-clean-code-authority-v1.json` conservaba `frontend/src/components/enterprise.js` como candidato de refactor aunque #622 ya lo retiró. Su regresión exige ausencia y preservación de los owners canónicos. Ahora su estado explícito es **RETIRED**, con owner y fuente de caracterización.

`scripts/architecture-clean-code-audit-v622.mjs` consulta el contrato en lugar de tener una segunda lista hardcodeada. No convierte un contador de imports estáticos igual a cero en permiso de borrar. `scripts/deprecation-consumer-proof-v657.mjs` valida ausencia, referencias conocidas en fuentes, owners, documentación/tests de retiro y advierte sobre imports computados.

## Skills, agentes y ejecución
Agentes: `orchestrator` y `qa-release`. Skills: `contagest-erp-orchestrator`, `contagest-systematic-debugging`, `contagest-release-evidence`; revisión de seguridad `contagest-secure-verification`.

En un checkout completo de la rama y sobre SHA actual:

```bash
node scripts/agent-ticket-router.mjs gates --base main --type refactor
node --test tests/deprecation_consumer_proof_issue_657.test.mjs
node scripts/deprecation-consumer-proof-v657.mjs
node --test tests/clean_code_refactor_authority_issue_622.test.mjs
node scripts/architecture-clean-code-audit-v622.mjs --check
```

La sesión remota no ha ejecutado el router local por falta de clon completo. El workflow dedicado sí ejecutará el gate y las regresiones sobre el SHA del PR; `sourceStatus=PASS` únicamente confirma **contratos de código fuente**, no despliegue o UX.

## Seguridad, reversibilidad y límites
- `automaticallyDeletable=false` y `releaseVerified=false` son constantes: el gate no borra nada.
- No tocar contabilidad, tenant, schemas, rutas ni PWA por esta corrección.
- Las coincidencias dinámicas exigen inspección de runtime, route registries y contratos consumidores. El escaneo textual no prueba la ausencia de todo consumidor posible.
- El issue #657 permanece abierto mientras falte cubrir todo el inventario de código deprecado y pruebas de consumidores/browser/build. #654 posee retiro de workflows; #655 el catálogo de suites y #653 ownership de arquitectura.


## Incremento 2026-10-21 · verificación conservadora de consumidores (NO equivale al cierre #657)

**Base al crear la rama:** `main@9c3afa4d0bc6aa2a723e302326260e8df25e7941`. El inventario #622 sólo caracteriza la eliminación ya realizada de `frontend/src/components/enterprise.js`; ninguna otra eliminación debe deducirse de ese caso.

El gate #657 amplía su búsqueda de consumidores a `frontend/public`, `*.webmanifest`, entrypoints HTML y configuraciones conocidas de build. Además, una llamada `import('./' + name)` o una ruta interpolada no puede clasificarse como ausencia definitiva de consumidores: `sourceStatus=REVIEW_REQUIRED`, `automaticallyDeletable=false` y `releaseVerified=false`. El resultado `PASS` continúa significando sólo la parte estática del contrato y nunca autoriza una eliminación automática.

### Inventario de decisión de este incremento

| Artefacto | Prueba observable de consumidor / dependencia | Decisión |
| --- | --- | --- |
| `frontend/src/components/enterprise.js` | Previamente RETIRED en #622; `config/architecture-clean-code-authority-v1.json`, test #622 y gate #657 conservan evidencia de ausencia y regresión | Mantener ausente; endurecer detección de reaparición y consumidores |
| `frontend/src/components/vnext/legacyBridge.js` | `docs/architecture/component-library-vnext-v1.json` declara el bridge; `tests/component_library_vnext_issue_619.test.mjs` exige su contrato de transición | NO DELETE; falta evidencia de migración completa y caracterización de consumidores |
| `frontend/public/login-hotfix-v162.css` y `login-mobile-a11y-v163.css` | Ambas hojas están enlazadas directamente desde `frontend/index.html` | NO DELETE; CSS activo del login |
| `.github/workflows/temp-typecheck-repair.yml` | Workflow de reparación que restringe ejecución a `fix/toolchain-lock-v26-finalize`; la rama todavía existe y el inventario #654 lo clasifica TEMPORARY/REVIEW_REQUIRED. La lectura de required status checks de `main` devolvió 403 | NO DELETE; transferir decisión a #654 con evidencia de protección/consumidores y comprobación de workflow |
| `frontend/src/components/vnext/dataLegacyBridge.js` | Sin proof de consumidores dinámicos ni caracterización browser completa en este incremento | NO DELETE hasta análisis por import/route/deep-link |

### Evidencia y riesgos

- Se ejecutaron los tests de la versión aislada del gate con Node 22.16.0 en un árbol reducido: 11/11 PASS; esto **no** certifica build/typecheck/browser ni el monorepo completo.
- La rama de GitHub ejecutará `node --test tests/deprecation_consumer_proof_issue_657.test.mjs` y los gates originales del workflow #657 sobre el **SHA final del PR**. Una ejecución pendiente, fallida o no disponible no es PASS.
- El escaneo de source no equivale a trazado de ejecución. Los imports computed, CSS renderizado, rutas registradas, service workers, manifests, alias de bundler, tests contractuales y consumidores externos requieren revisión para cualquier otra eliminación.
- No se cambian API, RBAC, contabilidad, reglas fiscales, PostgreSQL, contratos de rutas, componentes visuales ni datos; no hay cambios de paquete/bundle esperados por ser un gate de QA.
- Eliminar módulos adicionales y revalidar full build/runtime/Chromium siguen pendientes dentro del mismo #657 (y los workflow gates dentro de #654). Esta entrega es **PARTIAL**; el backlog conserva #657 abierto.

Rollback seguro: revertir únicamente los commits del gate/tests/documentación, sin restaurar el adaptador eliminado en #622.
