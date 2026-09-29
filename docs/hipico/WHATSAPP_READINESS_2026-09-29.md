# Control Hípico — WhatsApp readiness y revisión de mercado

**Fecha de revisión:** 2026-09-29  
**Bridge:** `hipico-whatsapp-web-bridge` v1.6.0  
**Objetivo inmediato:** prueba física/local en Windows con SOURCE read-only y autonomía conversacional en LAB.

## Resumen

El Bridge mantiene identidad pinneada por `@g.us`, deduplicación, anti-loop, spool durable, idempotencia, backoff/rate limit, health/readiness, journal de respuestas, estado `ambiguous` para entregas inciertas, kill switch y recuperación supervisada.

Flujo autorizado para la prueba actual:

```text
SOURCE (solo lectura)
  -> capturar / deduplicar
  -> persistir / spool durable
  -> backend / clasificar / arbitrar
  -> propuesta + auditoría
  -> LAB (respuesta automática de QA)
```

La escritura automática al SOURCE real permanece **NO-GO por política**, no por falta de código.

## Política oficial revisada

La Política de mensajes de WhatsApp Business consultada el 2026-09-29 incluye **“Apuestas con dinero real”** entre los bienes/servicios cuyo intercambio, promoción u operación no puede facilitarse con los Servicios de WhatsApp Business y aclara que la prohibición aplica independientemente de licencias/registros/aprobaciones locales.

Referencia canónica: `https://business.whatsapp.com/policy/`.

Consecuencias para este proyecto:

- no se implementa un bypass por `.env`, licencia o país;
- `HIPICO_SOURCE_AUTO_REPLY_ENABLED=true` continúa fallando cerrado;
- los campos de evidencia v1.6 son metadatos para futuras reevaluaciones, no permisos;
- un transporte oficial como Cloud API no convierte este caso en permitido mientras la política conserve esa prohibición;
- LAB sigue siendo el entorno correcto para probar conversación/autonomía sin escribir en SOURCE.

## Mercado / transporte

### Playwright Web — adapter actual

Ventajas: controla la misma UI que un operador, permite verificar chat/destino visualmente y ya está integrado con spool, identity guard, recovery y observabilidad. Costes: Chromium consume más recursos y el DOM de WhatsApp puede cambiar.

Estado v1.6: `implemented=true`, `official=false`, `sourceRead=true`, `labSend=true`, `groupSend=true` técnicamente. La capacidad técnica **no** otorga permiso de política.

### Cloud API — boundary futuro, no implementación actual

La Plataforma de WhatsApp Business/Cloud API es el transporte oficial de Meta, pero v1.6 sólo registra su contrato como adapter futuro (`official=true`, `implemented=false`). Configurarlo hoy falla validación para impedir que el runtime aparente usar un transporte que todavía no existe en el Bridge.

Además, la política de apuestas con dinero real sigue siendo bloqueante para el caso SOURCE aun si en el futuro existe un adapter oficial.

### Baileys / WebSocket

Baileys y forks actuales ofrecen automatización WhatsApp Web por WebSocket, grupos y multi-device sin Chromium. Continúan siendo integraciones no oficiales. Migrar justo antes de QA físico introduciría otra superficie de sesión/reconnect/idempotencia y no resolvería el gate de política.

Decisión: **no migrar ahora**. La nueva interfaz de capacidades permite evaluar un adapter separado más adelante sin acoplar reglas de dominio al navegador.

## Nuevo contrato v1.6

`src/transport-capabilities.mjs` declara las capacidades del transporte y evita confundir “técnicamente posible” con “oficial/autorizado”.

`src/source-policy-gate.mjs` es la autoridad del estado SOURCE:

- snapshot de política;
- código `SOURCE_AUTO_REPLY_POLICY_NO_GO`;
- reasons estructurados;
- transporte actual;
- evidencia de revisión como metadata;
- `eligible=false` mientras el snapshot oficial permanezca NO-GO.

Comando de diagnóstico:

```powershell
cd tools\hipico-whatsapp-web-bridge
npm run source:policy
```

No imprime token ni texto de chats.

## VERIFIED en source

- `fromMe`/anti-loop;
- SOURCE/LAB separados por nombre + ID estable;
- spool persistente + dead-letter;
- `prepared -> sending -> sent/ambiguous`;
- crash en `sending` => `ambiguous`, no retry ciego;
- idempotencia/fingerprint;
- retry sólo cuando es seguro;
- backoff con jitter/Retry-After y límites de RPS/lote;
- kill switch;
- observabilidad/health;
- envío LAB protegido por identidad;
- adapter capability contract v1.6;
- gate de política SOURCE no anulable por variables de entorno.

## NOT VERIFIED físicamente aquí

- sesión WhatsApp Web real de la laptop;
- selectores DOM contra la versión que cargue hoy;
- QR/link de ese dispositivo;
- IDs reales `@g.us`;
- backend real desde esa red;
- soak 24–72h;
- comportamiento después de cambios posteriores de WhatsApp Web.

Esos puntos deben ejecutarse en tu equipo; no se convierten en PASS por revisión estática.

## Prueba de hoy

1. `git switch main && git pull --ff-only && git rev-parse HEAD`.
2. `QA-PRODUCCION.ps1` y conservar la evidencia real.
3. `CONFIGURAR-GRUPOS-HIPICO.cmd` y vincular WhatsApp si solicita QR.
4. Confirmar SOURCE/LAB con IDs `@g.us` distintos.
5. Ejecutar `PROBAR-HIPICO-LAB.cmd` o `INICIAR-HIPICO-AUTONOMO.cmd`.
6. Ejecutar `npm run source:policy` dentro del bridge: SOURCE debe mostrar `NO_GO`/`DISABLED`, nunca GO.
7. En LAB probar saludo, ayuda, cierre, llegada, JUEGA y CONSIGUE.
8. Repetir eventos: no debe existir doble efecto/respuesta indebida.
9. Cortar y recuperar red/backend; los spools deben converger.
10. Reiniciar Bridge/Windows; mensajes ya confirmados no deben duplicarse.
11. Cambiar de chat antes de un envío LAB: identity guard debe cancelar el destino incorrecto.
12. Confirmar visualmente **cero mensajes automáticos en SOURCE**.

## Criterio de aceptación local

- SOURCE zero-send;
- LAB responde sin duplicados;
- dead letters en cero o explicadas;
- reconnect/restart no produce doble efecto;
- health identifica SOURCE/LAB y no filtra secretos;
- entrega incierta permanece `ambiguous`;
- kill switch detiene promoción/envío cuando corresponde;
- sesión se recupera tras reconnect/restart.

Un LAB verde demuestra capacidad técnica del entorno de prueba; **no autoriza automatización de apuestas reales en SOURCE**.
