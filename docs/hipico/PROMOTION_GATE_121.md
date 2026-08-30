# Promotion Gate #121

## Regla principal

Control Hípico inicia y vuelve siempre a `shadow` ante duda, configuración incompleta, evidencia ausente o kill switch local activo.

## Modos

| Modo | SOURCE read | LAB write | SOURCE write | Monetario |
| --- | --- | --- | --- | --- |
| shadow | sí | sí | no | no |
| assisted | sí | sí | no | no |
| production | sí | sí | sólo si todos los gates autorizan | no en v121 |

`production` no significa automáticamente operación monetaria. La capability monetaria permanece deshabilitada en esta política.

## Gates de producción

El candidate SHA debe estar ligado a evidencia y requiere:

- Physical QA #119 = PASS;
- soak #120 = PASS;
- security #114 = PASS;
- conversational AppSec #153 = PASS;
- WhatsApp compliance #154 = GO;
- aprobación explícita con actor y motivo.

Un porcentaje de accuracy nunca sustituye estos gates.

## Estado actual

La evidencia `products/hipico-control/whatsapp-production-evidence.json` está en `NO_GO`. Por ello la escritura automatizada productiva al grupo real permanece bloqueada aunque el resto del sistema compile o pase suites locales.

## Kill switch local

Crear `.hipico-kill-switch` en el directorio operativo del Bridge, o definir `HIPICO_KILL_SWITCH_FILE` apuntando a un archivo local. El preflight aborta `assisted/production` antes de depender de Internet.

Recuperación:

1. investigar el incidente;
2. mantener SOURCE read-only;
3. conservar spool/evidence/history;
4. retirar el archivo sólo con decisión explícita;
5. repetir gates del candidate antes de cualquier nueva promoción.

## Rollback

La democión objetivo es `shadow`. No borra historial, receipts, spool ni evidence. Un rollback de modo operativo no es un rollback destructivo de datos.

## Canary

La primera eventual promoción autorizada debe limitarse a un sitio y revisarse en <=24 h antes de ampliar alcance.

## Truth states

`IMPLEMENTED` no equivale a `VERIFIED`. `BLOCKED` y `NOT_EXECUTED` nunca se convierten en PASS.
