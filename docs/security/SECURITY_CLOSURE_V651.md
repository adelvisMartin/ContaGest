# #651 — Verificación local de cierre de hallazgos de seguridad

**Estado:** incremento de la autoridad de *verificación* #651; no implementa ninguna corrección de autenticación, RLS, BOLA, pagos ni webhook. No declara el proyecto seguro ni cierra el ticket.

## Responsabilidades y fronteras

- `config/security-closure-v651.json` enumera **10 dominios obligatorios** y sus issues propietarios: autorización media #569, divulgación salud #570, tenant/RLS #739/#843–846, sesiones #636/#851/#844, API adversarial #641, infraestructura #648, telemetría #650/#979, jobs #853/#854, webhooks #772 y revisión global #651. Los IDs y los issues no se pueden sustituir arbitrariamente.
- `scripts/security-closure-v651.mjs` recopila **evidencia entregada por el operador**, sin conexiones externas. Si no se aporta evidencia: `NOT_EXECUTED`, `SECURITY_EVIDENCE_INCOMPLETE` y salida 2.
- Para declarar `PASS` de un control, cada prueba negativa requerida debe aportar un fichero real bajo `artifacts/`, su `gateId` exacto, `candidateSha` de 40 caracteres hexadecimal y el SHA-256 auténtico de sus bytes. La herramienta rechaza ficheros repetidos, alterados, fuera del árbol real del repositorio y enlaces simbólicos que escapen.
- La evaluación también necesita un inventario de blockers de seguridad del mismo SHA con prueba propia, etiqueta `security-backlog:current-issues`. Un blocker abierto, ausencia de inventario, estados `BLOCKED/NOT_EXECUTED/FAIL` o un `NOT_APPLICABLE` aun justificado impiden `ready:true`.
- El digest del informe `reportSha256` permite detectar cambios en la proyección, pero **no autentica el origen** de los artefactos. Es necesario comprobar la ejecución real, los sistemas origen y la aprobación independiente del reviewer.

Esta herramienta no sustituye los reportes existentes de #647 ni los test runners de cada issue; es un índice transversal de verificaciones con *fail-closed*, no un generador de evidencia falsa.

## Comandos

```sh
npm run test:security:closure
npm run audit:security:closure -- --sha "$(git rev-parse HEAD)"
# Sin evidence input => estado incompleto y exit code 2 por diseño
npm run audit:security:closure -- --sha "$(git rev-parse HEAD)" --input artifacts/security/v651-input.json
```

El JSON de entrada tiene esquema:

```json
{
  "schemaVersion": 651,
  "candidateSha": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "controls": {
    "media-bola": {
      "status": "PASS",
      "proofs": {
        "object-authorization": {
          "path": "artifacts/security/651/media-object-authorization.json",
          "gateId": "media-bola:object-authorization",
          "candidateSha": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          "sha256": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
        }
      }
    }
  },
  "backlog": {
    "openBlockers": [569],
    "proof": {
      "path": "artifacts/security/651/current-issues.json",
      "gateId": "security-backlog:current-issues",
      "candidateSha": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "sha256": "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
    }
  }
}
```

Este ejemplo **debe fallar** porque contiene placeholders, comprobaciones ausentes y un blocker. No usar `PASS` sin ejecutables, logs/capturas/artefactos auténticos ligados al commit. El catálogo define todos los nombres exactos de checks.

## Pruebas, riesgo residual y rollback

- Node v22.16 local `node --test tests/security_closure_v651.test.mjs`: **16/16 PASS** tras fijar la matriz control→issue; `node --check scripts/security-closure-v651.mjs`: PASS.
- Tests negativos: SHA obsoleto, prueba ausente/cambiada/reutilizada, ruta traversal, inventario blocker, control fuera del catálogo, falta de owner, exclusión no aprobada, issue falsificado y ausencia de evidencia. La fixture sintética que produce `ready:true` comprueba **solo el protocolo**, no una auditoría real.
- PostgreSQL17/RLS, HTTP/tenant A↔B, navegador, sesión real, physical QA, CI remoto y auditoría AppSec independiente: **NOT_EXECUTED** para este candidato; son responsabilidad de los issues hijos y del release gate.
- Se agrega únicamente el script local `test:security:closure` y `audit:security:closure` a `package.json`; no se modifican dependencias, infraestructura, workflows, permisos ni secretos. No se cierran los findings de #651 por fusionar este incremento.

Rollback: revertir los cuatro archivos nuevos y dos comandos npm, sin cambios a datos ni migraciones. `SOURCE_REUSE=NONE` (contrato específico sobre los runbooks existentes).

## Guard exact-HEAD incorporado en el incremento #651 del 21-10-2026

El CLI `npm run audit:security:closure -- --sha <candidate-sha>` contrasta ahora el SHA solicitado con `git rev-parse --verify HEAD` en el **checkout real de la raíz del repositorio** antes de evaluar evidencias. Si Git está ausente, el checkout no existe, el directorio no es la raíz, el SHA difiere o hay archivos **versionados** modificados/staged, falla cerrado (`SEC651_CHECKOUT_UNAVAILABLE`, `SEC651_CHECKOUT_ROOT_MISMATCH`, `SEC651_CANDIDATE_HEAD_MISMATCH` o `SEC651_TRACKED_CHECKOUT_DIRTY`). Se permiten evidencias *untracked* bajo `artifacts/` para su comprobación de hashes; esto no certifica la autenticidad de su procedencia.

`npm run test:security:closure` agrega la regresión `tests/security_closure_checkout_v651.test.mjs`, que construye repositorios Git sintéticos efímeros y cubre HEAD correcto, SHA obsoleto, archivos modificados o staged, ejecución fuera de la raíz y Git no disponible. El nuevo guard afecta solo el CLI del auditor #651; las APIs de autenticación, BOLA, tenant/RLS, trabajos y webhooks no cambian.

**Restricción:** un `HEAD` correcto y hashes válidos no prueban que los tests de seguridad se hayan ejecutado; la verificación de procedencia de cada evidencia y la aprobación independiente siguen siendo obligatorias. Los pendientes #772, #854 y #979 y los tests de PG17/HTTP/browser exact-SHA no se cierran con este incremento.
