# ERP End-to-End QA Campaign #155

La campaña usa como autoridad el catálogo canónico de 58 rutas en `qa/support/module-visual-catalog.mjs`.

## Matriz mínima

Cada ruta se cruza con 7 estados (`baseline`, `loading`, `empty`, `error`, `offline`, `role-denied`, `boundary`) y 3 perfiles (`admin`, `operator`, `read-only`). El contrato produce 1.218 casos lógicos y cada ejecución visual relevante debe cubrir 390×844, 768×1024 y 1440×900.

## Evidencia

El recorder `scripts/erp-e2e-evidence-v155.mjs` exige un SHA Git de 40 caracteres y guarda evidencia bajo:

`artifacts/qa/erp-v155/<candidate-sha>/`

Estados válidos: `PASS`, `FAIL`, `BLOCKED`, `NOT_EXECUTED`. Un solo `FAIL` hace fallar el gate; `BLOCKED` o `NOT_EXECUTED` impiden declarar PASS.

## Aserciones obligatorias

- ruta renderizada y observable;
- cero excepciones no capturadas;
- cero overflow horizontal del documento;
- cero mutaciones ocultas;
- límites de rol aplicados;
- acciones críticas observables;
- offline/loading/empty/error con estados explícitos y recuperables.

## Integración con pruebas existentes

La campaña no reemplaza `qa/exhaustive-route-v164.spec.mjs`, `qa/fine-composition-v166.spec.mjs` ni `qa/route-transition-v164.spec.mjs`: las convierte en evidencia trazable por candidate SHA.

## Ejecución

1. `CANDIDATE_SHA=<sha> node scripts/erp-e2e-evidence-v155.mjs init`
2. ejecutar suites/browser/device QA y completar `evidence.json` con evidencia real;
3. `CANDIDATE_SHA=<sha> node scripts/erp-e2e-evidence-v155.mjs check`

Un template recién creado queda `NOT_EXECUTED`; nunca constituye un PASS.
