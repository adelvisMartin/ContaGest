# Control Hípico — WhatsApp readiness y revisión de mercado

> **Nota de vigencia (2026-10-15):** este runbook es histórico y sus secciones inferiores describen una evaluación anterior de WhatsApp Business y apuestas monetarias. El owner confirmó que el caso actual es un grupo privado de amigos, recreativo y sin dinero real, en WhatsApp Messenger normal; WhatsApp Business queda excluido. Para Messenger, los términos oficiales restringen mensajería automática/uso no personal salvo autorización expresa, por lo que no se debe enviar automáticamente a SOURCE ni usar WhatsApp Web/Playwright como workaround. LAB debe ejecutarse con harness local y fixtures sintéticos, sin conectarse a un grupo real. Véase la [revisión #1011](WHATSAPP_ELIGIBILITY_REVIEW_2026-10-15.md).

**Fecha de revisión:** 2026-09-29  
**Bridge:** `hipico-whatsapp-web-bridge` v1.6.0  
**Objetivo histórico (supersedido):** prueba física/local en Windows con SOURCE read-only y autonomía conversacional en LAB. No ejecutar como plan vigente: el canal aprobado ahora es WhatsApp Messenger normal para un grupo recreativo, y no hay autorización comprobada para lectura ni escritura automáticas.

## Resumen

El Bridge mantiene identidad pinneada por `@g.us`, deduplicación, anti-loop, spool durable, idempotencia, backoff/rate limit, health/readiness, journal de respuestas, estado `ambiguous` para entregas inciertas, kill switch y recuperación supervisada.

Flujo del plan histórico (no habilitado para el alcance actual):

```text
SOURCE (solo lectura)
  -> capturar / deduplicar
  -> persistir / spool durable
  -> backend / clasificar / arbitrar
  -> propuesta + auditoría
  -> LAB (respuesta automática de QA)
```

La escritura automática al SOURCE real permanece **NO-GO**, no por falta de código: no se ha comprobado autorización para automatizar Messenger.

## Política oficial — evaluación histórica y decisión vigente

El texto de 2026-09-29 sobre la Política de mensajes Business y apuestas monetarias queda como antecedente histórico; no describe el grupo recreativo que definió el owner. La fuente aplicable hoy es [Condiciones del servicio de WhatsApp Messenger](https://www.whatsapp.com/legal/terms-of-service?lang=es), que restringe mensajería automática y uso no personal salvo autorización expresa. El carácter recreativo/no monetario se da por confirmado y no habilita autoenvíos.

Consecuencias vigentes:

- no se implementa bypass por `.env`, licencia, país, DOM/RPA, Playwright, sesión web, APIs privadas o cliente no oficial;
- `HIPICO_SOURCE_AUTO_REPLY_ENABLED=true` continúa fallando cerrado;
- WhatsApp Business, Cloud API, Business Platform y Groups API no forman parte del canal elegido;
- los campos de evidencia son metadatos para reevaluaciones futuras, no permisos;
- LAB se ejecuta con harness local y fixtures sintéticos, sin conexión a un grupo real ni envío por WhatsApp.

## Mercado / transporte

### Playwright Web — adapter histórico, fuera del canal autorizado

Ventajas: controla la misma UI que un operador, permite verificar chat/destino visualmente y ya está integrado con spool, identity guard, recovery y observabilidad. Costes: Chromium consume más recursos y el DOM de WhatsApp puede cambiar.

Estado v1.6: `implemented=true`, `official=false`, `sourceRead=true`, `labSend=true`, `groupSend=true` técnicamente. Estos flags describen capacidad heredada; **no usarla para conectar Messenger ni como autorización**. El target del proyecto ahora es harness local/sintético y asistencia manual.

### Cloud API — boundary futuro, no implementación actual

La Plataforma de WhatsApp Business/Cloud API no es el canal solicitado y no debe implementarse como sustituto. La nota histórica de este runbook no constituye aprobación para usarla.

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
