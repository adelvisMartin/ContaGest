# Control Hípico — WhatsApp readiness y revisión de mercado

**Fecha:** 2026-09-29  
**Bridge actual:** `hipico-whatsapp-web-bridge` v1.5.0  
**Objetivo inmediato:** QA físico/local en Windows con SOURCE read-only y automatización autónoma en LAB.

## Resumen ejecutivo

El bot ya posee la mayoría de primitives de resiliencia que se esperan en un bridge moderno: identidad pinneada por `@g.us`, deduplicación, anti-loop para mensajes propios, spool durable, idempotencia, backoff, rate limiting, health/readiness, journal de respuestas, estado `ambiguous` para entregas inciertas, receipts, kill switch y pruebas de resiliencia.

Para las pruebas de hoy, el flujo soportado es:

```text
SOURCE (solo lectura)
  -> capturar / deduplicar
  -> backend / spool durable
  -> clasificar / arbitrar
  -> propuesta y auditoría
  -> LAB (respuesta automática autorizada para QA)
```

La escritura autónoma al grupo real SOURCE queda **fail-closed**. La razón no es una carencia técnica: es el gate de plataforma/compliance para un flujo de apuestas con dinero real.

## Estado por capacidad

### VERIFIED en source

- detección `fromMe` y exclusión de mensajes propios antes del ingest: evita loop de auto-respuestas;
- group binding por nombre + ID `@g.us` y revalidación antes de enviar;
- spool persistente para eventos y mirrors;
- reply journal con estados `prepared -> sending -> sent` y `ambiguous`;
- reinicio durante `sending` se recupera como entrega ambigua, no como retry ciego;
- fingerprint/idempotencia por command id y payload para rechazar replay divergente;
- retry sólo cuando el error declara que es seguro repetir;
- sincronización de receipts pendientes;
- verificación de texto saliente visible después de `Enter`;
- exponential backoff con jitter y soporte de `Retry-After`;
- límites de RPS y de lote;
- health/readiness, counters, dead-letter/spool y diagnostics;
- kill switch local;
- LAB separado del SOURCE y envío protegido por identidad.

### NOT VERIFIED físicamente en esta revisión

- sesión de WhatsApp Web real de la laptop que se usará hoy;
- estabilidad de los selectores DOM con la versión exacta de WhatsApp Web que cargue hoy;
- QR/link del dispositivo de esa máquina;
- IDs `@g.us` reales de tus dos grupos;
- backend real accesible desde esa red;
- soak 24–72h sobre esa máquina/sesión;
- comportamiento ante un cambio de UI de WhatsApp posterior a este commit.

Estos puntos se prueban con `CONFIGURAR-GRUPOS-HIPICO.cmd` + `PROBAR-HIPICO-LAB.cmd`, no se declaran PASS por inspección estática.

## Revisión de mercado 2026-09-29

### Baileys / WebSocket

Baileys sigue siendo una referencia del ecosistema no oficial: usa WebSocket/multi-device y evita mantener Chromium, por lo que puede reducir consumo de memoria y CPU frente a browser automation. Su línea reciente también mueve responsabilidades importantes al integrador; por ejemplo, reconexión y lifecycle deben resolverse correctamente por la aplicación, y las versiones mayores recientes introducen cambios incompatibles.

**Decisión:** no migrar el Bridge de hoy a Baileys. El bridge Playwright actual ya tiene journal durable, identity guards, observabilidad, backoff y un corpus de QA. Cambiar transporte justo antes de pruebas físicas crearía una segunda superficie de riesgo y otra autoridad no oficial.

Baileys queda como candidato futuro detrás de una interfaz de transporte, sujeto a una ADR separada y a las mismas políticas/compliance. No se usa como atajo para eludir reglas de WhatsApp.

### Playwright / browser bridge

La ventaja actual es que controla la misma interfaz de WhatsApp Web que usa un operador y permite comprobaciones visuales de chat, destino y mensaje saliente. El costo es mayor consumo de recursos y fragilidad frente a cambios DOM; por eso son obligatorios diagnostics, selectores defensivos, identity guards, recovery y physical QA.

### Plataforma oficial y compliance

La revisión vigente de WhatsApp Business mantiene restricciones para bienes/servicios regulados y real-money gambling. El repositorio ya tenía un `NO-GO` documentado; la revisión del 2026-09-29 no aporta una autorización nueva que permita convertir este caso en producción automática.

Por eso `HIPICO_SOURCE_AUTO_REPLY_ENABLED=true` falla cerrado con `SOURCE_AUTO_REPLY_POLICY_NO_GO`. LAB permanece disponible para validar conversación, intents, resiliencia y ergonomía sin escribir en el grupo real.

## Mejoras incorporadas en este hardening

1. **Gate de política en runtime-config**: no basta con que el backend diga “safe-auto”; SOURCE writing requiere un GO de plataforma que hoy no existe.
2. **Launcher autónomo seguro**: `INICIAR-HIPICO-AUTONOMO.cmd` ejecuta el modo LAB en vez de intentar enviar al SOURCE.
3. **Runbook actualizado**: elimina referencias a Bridge 1.4.1/branch antiguo y usa `main` + Bridge 1.5.0.
4. **Contratos preventivos**: config y documentación deben mantener source zero-send mientras el gate sea NO-GO.
5. **Sin regresión de resiliencia**: idempotencia, ambiguous delivery, receipts, backoff, dead-letter, spool y anti-loop siguen siendo requisitos.

## Prueba mínima de hoy

1. Descargar/actualizar `main` y registrar el SHA.
2. Ejecutar `QA-PRODUCCION.ps1`; registrar PASS/FAIL/BLOCKED real.
3. Ejecutar `CONFIGURAR-GRUPOS-HIPICO.cmd` y enlazar WhatsApp Web si pide QR.
4. Confirmar SOURCE y LAB con IDs diferentes `@g.us`.
5. Ejecutar `PROBAR-HIPICO-LAB.cmd` o `INICIAR-HIPICO-AUTONOMO.cmd`.
6. En LAB probar saludo, ayuda, cierre, llegada, JUEGA y CONSIGUE.
7. Repetir mensajes para comprobar deduplicación.
8. Cortar red/backend y recuperar; verificar que los spools vuelven a cero.
9. Reiniciar bridge y Windows; comprobar que no se duplica un envío ya confirmado.
10. Cambiar deliberadamente de chat antes de una acción LAB; el identity guard debe impedir envío al destino equivocado.
11. Confirmar que en SOURCE no aparece ningún mensaje saliente del bridge.
12. Revisar `health.json`, `bridge.log`, spool y dead-letter.

## Criterio de aceptación para QA local

Se acepta la jornada de prueba sólo cuando:

- SOURCE recibe **cero** mensajes automáticos;
- LAB responde y no duplica eventos;
- no hay dead letters sin explicación;
- reinicio/red/backend no generan doble efecto;
- health identifica correctamente SOURCE/LAB;
- no se filtran secretos;
- las respuestas ambiguas quedan `ambiguous` y requieren reconciliación, no retry automático;
- la sesión se recupera después de reconnect/restart.

## Lo que NO significa “listo”

Un LAB verde no convierte la automatización de apuestas reales en un flujo autorizado. Para habilitar escritura SOURCE en el futuro harían falta, como mínimo, evidencia fresca de plataforma/política/jurisdicción con decisión GO, un transporte/capability permitido para el caso exacto y una revisión de riesgo separada.

Hasta entonces, el producto puede automatizar lectura, clasificación, sugerencias, auditoría y pruebas LAB; no debe automatizar mensajes de apuestas con dinero real al grupo SOURCE.
