# 51/51 · ERP exact-SHA release candidate

## Propósito

51/51 no declara producción lista por tener todos los archivos implementados. Su función es producir un candidato de release demostrable y ligado a un único SHA.

## Comando

```bash
CANDIDATE_SHA="$(git rev-parse HEAD)" npm run release:erp:v5151
```

El runner rechaza:

- SHA ausente o que no sea 40-hex;
- `HEAD` distinto al candidate;
- worktree sucio al iniciar;
- cualquier gate requerido con FAIL/BLOCKED.

## Gates requeridos

1. `git diff --check`;
2. agent skills;
3. backend typecheck;
4. suite completa de tests;
5. build frontend/backend;
6. bundle budget;
7. dependency audit de producción;
8. prerequisitos PostgreSQL efímero;
9. historial canónico de migraciones;
10. seed QA;
11. persistencia real;
12. invariantes financieras reales;
13. E2E real de Odontología/Veterinaria/Gimnasio (48/51);
14. browser core 58x5, que incluye 49/51 y 50/51;
15. accessibility/contrast.

## Estados

El manifest usa sólo:

- `PASS`;
- `FAIL`;
- `BLOCKED`.

El verdict `READY_FOR_RELEASE_REVIEW` requiere que todos los gates hayan terminado en PASS. No significa despliegue productivo ni sustituye aprobación humana, protección remota de main, QA física o evidencia externa aplicable.

## Evidencia

Ruta:

```text
artifacts/release/erp-v5151/<candidate-sha>/
```

Incluye:

- `release-candidate.json`;
- `release-candidate.md`;
- un log por gate.

El workflow conserva además reporte Playwright y artefactos con el SHA en el nombre.

## Infraestructura #134

Si GitHub crea el job pero no asigna runner y no ejecuta steps, el run se reporta `BLOCKED_INFRASTRUCTURE` externamente. No se modifica código para fabricar un PASS.

## Regla de cierre del roadmap

51/51 sólo puede considerarse runtime-verified cuando el workflow del SHA candidato ejecuta efectivamente sus steps y el manifest resulta `READY_FOR_RELEASE_REVIEW`. Hasta entonces la implementación puede estar mergeada, pero la evidencia runtime permanece BLOCKED/NOT_EXECUTED.
