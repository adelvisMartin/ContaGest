# EPIC #102 — handoff final de implementación → QA

## Estado

La implementación técnica de Control Hípico ya tiene foundation, dominio, ledger, parser, shadow evaluation, Bridge durable, observabilidad, seguridad, Offline/PWA, Backup/Restore, release pipeline, Conversation Engine, LAB simulator, handoff, AppSec y Promotion Gate.

Los únicos child issues abiertos del EPIC en el snapshot son **#119 Physical QA** y **#120 Capacity/Soak**.

## Follow-up antes de ejecutar QA final

- PR #207 corrige #119 para que la evidencia sea realmente `device × mode × scenario`. El mínimo deja de ser 16 filas globales y pasa a incluir PWA browser, PWA instalada y APK por separado.
- PR #208 corrige #120 para que 24 h no puedan dar verde sin health, spool y evidencia fechada de restart/reconnect.

## Orden recomendado

```text
merge #207 + #208
→ freeze candidate SHA
→ #119 Physical QA
→ #120 soak >=24h
→ corregir findings reales mediante PRs atómicos
→ repetir gates afectados
→ reevaluar EPIC #102 / Promotion Gate
```

## Invariante WhatsApp

El archivo canónico `products/hipico-control/whatsapp-production-evidence.json` mantiene, con revisión 2026-08-30:

- decisión `NO_GO`;
- SOURCE sólo lectura;
- LAB/local como alternativa segura para QA;
- próxima revisión obligatoria 2026-09-23.

Por tanto, **aunque #119 y #120 lleguen a PASS, eso no habilita escritura automatizada al grupo real**. El transporte productivo permanece fail-closed hasta que evidencia oficial vigente permita el uso/capability exacto y se cumplan las demás autorizaciones aplicables.

## Cierre del EPIC

#102 no se cierra por mergear harnesses. Debe existir evidence real del candidate SHA final, sin P0/P1 abiertos para ese alcance. La decisión de producción de WhatsApp es un gate independiente.
