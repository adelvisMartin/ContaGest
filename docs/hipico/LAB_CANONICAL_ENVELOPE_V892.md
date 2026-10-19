# Hípico #892 — LAB canónico: identificador y pregunta íntegros, sin truncamientos

## Contexto

La autoridad conversacional de LAB ya utiliza el backend `/api/v1/hipico-bot/bridge/lab/query` y la política de estados read-only. **No se crea otro parser, motor, cliente ni transporte.** El adaptador `lab-canonical-query.mjs` enviaba `externalMessageId:String(messageId).slice(0,320)` y `text:String(text||'').slice(0,1200)`, incluso si el evento original tenía más caracteres. Esto permitía colisiones de identificador al recortar dos eventos con el mismo prefijo, o consultar una pregunta diferente al texto íntegro recibido (por ejemplo, cuando los últimos caracteres contienen una aclaración de riesgo).

## Nueva autoridad fail-closed en el cliente

Se añade una validación estricta **antes del fetch**. El transporte read-only solo admite:
- identificador de mensaje real como cadena no vacía de máximo **320 caracteres**, sin truncamiento ni coerción; `senderId`, `labGroupId` y `labChannelKey` acotados y sin controles;
- pregunta original no vacía de hasta **1200 caracteres** en su totalidad; se preserva literalmente incluyendo saltos de línea de un mensaje legítimo. Longitudes mayores generan `LAB_CANONICAL_DISABLED` y **cero** llamadas al backend;
- timestamp original ISO UTC canónico con milisegundos y validación real del calendario, acorde a `parseWhatsAppPre(...).timestamp` del Bridge;
- `race` opcional con **exactamente** `raceNumber`, `racetrack` y `raceDate`: carrera 1–99, hipódromo de 2–80 caracteres seguros y fecha gregoriana real. Nada de claves monetarias u objetos con propiedades adicionales;
- `quotedMessageId` opcional hasta 320, sin truncamiento y `timeoutMs` finito y acotado.

Las consultas existentes con valores válidos no cambian. Se conserva método POST, mismo origen, token de servicio del backend, redirect `manual`, `shadowMode:true`, canal `lab`, retry de lectura y catálogo cerrado de statuses informativos. Los errores de entrada son **denegaciones**, nunca autorizaciones de respuesta.

Este cambio NO toca `src/index.mjs`, persistencia WAL, receipts, políticas SOURCE o módulos financieros. **La lectura y escritura automáticas del WhatsApp Messenger real continúan en NO_GO bajo #1011**. Las pruebas LAB son sintéticas offline.

## Evidencia y QA

Los nuevos tests `tools/hipico-whatsapp-web-bridge/tests/lab-canonical-envelope-v892.test.mjs` ejercen consulta válida y rechazo sin petición HTTP: ID de 321+ caracteres, texto >1200, ID no textual, campos de control, timestamps no canónicos, carrera fuera de rango, fecha imposible, hipódromo inseguro, cita inválida, timeouts y propósito no admitido. Prueban que un mensaje multilínea admisible se conserva **idéntico** y la cita no pierde identidad.

La primera evaluación sobre la fuente exacta detectó un error adicional (hipódromo de un solo carácter); se corrigió y la batería volvió a **16/16 PASS** ejecutando el código publicado de la rama mediante V8 con transportes inyectados, sin acceder al backend. El test se incorpora a `npm run check` y a `npm test` por el glob existente. El helper no depende de configuración, archivos o datos del grupo.

Para completar el QA en checkout con Node 22 y dependencias del repositorio:

```sh
cd tools/hipico-whatsapp-web-bridge
npm run check
node --test tests/lab-canonical-query.test.mjs tests/lab-canonical-envelope-v892.test.mjs
npm test
```

**Pendiente/no ejecutado en esta sesión:** suite real desde checkout completo, PostgreSQL 17, Chromium/Windows LAB, recuperación de WAL, lifecycle, QA física de mensajería y GitHub Actions exact-SHA. La validación V8 con dependencias simuladas no equivale a esas verificaciones ni habilita Messenger SOURCE.

## Rollback y backlog

Se revierte esta validación y sus tests/docs solo mediante revisión de seguridad, no para retomar truncamientos. No hay migración ni datos persistidos. El ticket **#892 permanece abierto** hasta integrar toda su evidencia canónica, pruebas de dos contextos/identidades en entornos reales y #839 GO/NO-GO. No desactivar checks requeridos ni marcar CI en cola como PASS.
