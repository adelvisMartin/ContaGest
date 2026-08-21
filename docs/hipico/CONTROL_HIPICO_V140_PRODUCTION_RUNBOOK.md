# Control Hípico Bridge v1.4.1 · Production-readiness runbook

## Objetivo

Conectar el grupo oficial `CLUB HIPICO TRIPLE COWN/CROWN` con la persistencia shadow de Control Hípico y, durante QA explícito, con `Control hípico lab`.

Invariantes:

- fuente oficial: solo lectura;
- `sourceSendPossible=false`;
- backend devuelve `actions: []` en este gate;
- ninguna clasificación crea/confirma/anula jugadas ni modifica dinero;
- LAB send/input apagados por defecto;
- producción exige IDs estables `@g.us` pinneados y distintos;
- todo evento se persiste/spoolea antes de considerarse entregado.

## Flujo

```text
WhatsApp Web
  → captura idempotente
  → spool durable
  → API autenticada
  → transporte/canónico shadow
  → evaluación
  → mirror LAB opcional
```

Un fallo de backend/LAB nunca habilita escritura en la fuente.

## Componentes

| Componente | Responsabilidad | Gate |
| --- | --- | --- |
| `runtime-config.mjs` | configuración estricta | HTTPS, token, journal, pinning IDs |
| `group-identity.mjs` | normaliza/verifica `@g.us` | no adivina IDs ambiguos |
| `capture-group-ids.mjs` | binding inicial | solo lectura, guarda fuera de Git |
| `runtime-utils.mjs` | parser/backoff/helpers | funciones puras testeables |
| `health-state.mjs` | readiness | spool/dead letters degradan |
| `preflight.mjs` | backend gate | persistencia y source read-only |
| `index.mjs` | browser/capture/delivery | fuente sin sender genérico |
| `server-runner.mjs` | proceso hosted | logs JSON / shutdown |
| `healthcheck.mjs` | liveness/readiness | health stale/guard inválido falla |
| Windows launcher | setup/DPAPI/profile | no admin, preserva data |
| `deploy/linux` | systemd hardened | no-root / resource limits |
| `deploy/docker` | container hardened | read-only/cap-drop/no-new-privileges |

## Evidencia automatizada esperada

El gate local unificado es:

```bash
npm ci
npm run qa:production:full
```

Genera `artifacts/qa/production-readiness.json` y `.md` distinguiendo `PASS`, `FAIL`, `BLOCKED` y `NOT_EXECUTED`.

Para Bridge:

```bash
cd tools/hipico-whatsapp-web-bridge
npm ci --no-audit --no-fund
npm run qa
npm audit --omit=dev --audit-level=high
npm run selftest
```

Para Android:

```bash
cd android/hipico-control-v1130
npm ci --no-audit --no-fund
npm run verify:web
npm run android:qa
```

No se debe convertir un workflow que no arrancó, un preview HTTP 200 o un build aislado en evidencia funcional.

## Binding fuente/LAB

Windows:

```powershell
.\tools\hipico-whatsapp-web-bridge\INICIAR.ps1 -CaptureGroupIds
```

El usuario abre fuente y LAB cuando el asistente lo solicita. Los IDs se guardan bajo `%LOCALAPPDATA%\ControlHipicoBridge\data` y no se versionan.

QA LAB solo después del binding:

```powershell
.\tools\hipico-whatsapp-web-bridge\INICIAR.ps1 -EnableLabSend -EnableLabInput
```

Al terminar ejecutar sin flags para volver a observación.

## Backend/Supabase

Las migraciones v1.13 continúan separadas del release de código. Antes de aplicarlas usar `HIPICO_V13_MIGRATION_RUNBOOK.md`, backup/PITR, dry run, dos usuarios A/B, introspección RLS/grants/functions y rollback preparado.

No aplicar migraciones productivas como efecto lateral del deploy web.

## Criterios QA

- corpus de parser/clasificador sin side effects monetarios;
- evento repetido no duplica persistencia/mirror;
- caída backend conserva spool y reintenta;
- reinicio conserva sesión/IDs/colas;
- fuente y LAB binding distinto;
- LAB emite como máximo una simulación marcada por evento cuando está autorizado;
- health sin secretos y source send siempre falso;
- PWA desktop/mobile/offline/actualización;
- APK debug real en dispositivo físico;
- backup/restore practicado;
- host Linux/Docker real estable.

## Release Android

`1.13.0-rc2` continúa siendo release candidate hasta instalar el APK construido desde la fuente canónica y completar dispositivo físico. La firma release usa secretos/keystore fuera de Git y no se activa antes del QA debug.

## Rollback

- detener Bridge;
- mantener LAB flags en false;
- volver código/imagen al SHA anterior;
- conservar `data/` y colas;
- no borrar tablas Hípico;
- si una migración ya fue aplicada, seguir su rollback/PITR específico.

## Estado

Este documento define el camino de producción; no declara automáticamente `PRODUCTION READY`. El veredicto se decide con evidencia del SHA final + QA manual/host/device. Sin esas ejecuciones: `READY FOR QA`.
