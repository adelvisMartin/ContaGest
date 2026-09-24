# GitHub Actions #134 Recovery · evidence hardening

## Objetivo

Recuperar evidencia ejecutada de GitHub Actions sin debilitar gates ni convertir fallos pre-runner en PASS.

Baseline reconciliado: `main@e663ba2e5890589e0018d8c17f10efdd28b162f1`.

## Estado observado

El issue #134 permanece abierto. La recurrencia histórica y reciente tiene el mismo patrón:

- jobs `ubuntu-latest` terminan antes de ejecutar `Checkout`;
- `runner_id=0` / `runner_name` vacío;
- `steps=null` o `steps=[]`;
- no hay logs de ejecución del job.

Ese patrón se clasifica como **BLOCKED_INFRASTRUCTURE / BLOCKED_EXTERNAL_ACCOUNT_CONFIGURATION**, no como fallo del producto.

## Autoridades existentes

- `.github/workflows/runner-probe-v134.yml`: prueba mínima de adquisición de runner;
- `.github/workflows/actions-recovery-v134.yml`: recovery periódico/manual;
- `scripts/actions-recovery-orchestrator-v134.mjs`: despacha CI + PostgreSQL real sobre `main`;
- `tests/actions_recovery_issue_134.test.mjs`: contrato fail-closed.

No se crea un segundo sistema de recuperación.

## Evidence hardening

El orquestador ya no acepta como evidencia suficiente un `workflow run` con `conclusion=success`.

Cada workflow requerido debe demostrar además, a nivel de job:

1. runner asignado (`runner_id > 0` o `runner_name` no vacío);
2. al menos un step completado;
3. logs del job recuperables y no vacíos;
4. `head_sha` idéntico al SHA actual de `main`;
5. run `completed/success`.

Solo entonces `verifiedExecution=true`. #134 únicamente puede cerrarse cuando **CI y PostgreSQL real** cumplen todos esos puntos.

## Recovery externo requerido

Si el probe sigue terminando sin runner, revisar como owner:

1. **Settings → Billing & licensing → Usage / Metered usage → Actions**;
2. cuota/minutos, método de pago y spending limit;
3. **Repository Settings → Actions → General**;
4. políticas de cuenta/enterprise que limiten GitHub-hosted runners;
5. estado público de GitHub Actions si existe una incidencia.

No editar tests, timeouts, branch protection ni required checks para sortear el incidente.

## Evidencia de cierre

El cierre de #134 requiere:

- Runner Probe con Checkout + comando trivial ejecutados;
- ContaGest CI ejecutado sobre el SHA final;
- PostgreSQL real ejecutando migraciones/tests;
- logs reales recuperables;
- artifacts/evidence asociados al mismo SHA;
- #134 cerrado solamente por el orquestador después de verificar todo lo anterior.

Mientras falte cualquiera de estos puntos, el estado correcto es **BLOCKED**, no DONE.
