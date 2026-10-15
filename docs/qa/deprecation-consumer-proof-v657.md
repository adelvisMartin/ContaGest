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
