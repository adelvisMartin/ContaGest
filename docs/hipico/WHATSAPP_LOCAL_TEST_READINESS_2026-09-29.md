# Control Hípico · WhatsApp — readiness local y posición técnica

Fecha: 2026-09-29

## Estado que sí puede afirmarse desde source

El sistema ya dispone de una arquitectura de autonomía segura para WhatsApp:

- Bridge dedicado de WhatsApp Web con Playwright;
- pinning de SOURCE y LAB por IDs estables `@g.us`;
- SOURCE read-only por defecto;
- switch separado para `HIPICO_SOURCE_AUTO_REPLY_ENABLED`;
- backend como autoridad para generar `source_reply`;
- `actions: []` para impedir que una respuesta conversacional conceda autoridad financiera;
- spool durable, reintentos, dead letters y backoff;
- journal de respuestas SOURCE con estados `prepared`, `sending`, `sent`, `ambiguous`;
- deduplicación de mensajes SOURCE/LAB;
- kill switch local;
- health/readiness sin secretos;
- preflight de producción contra backend/persistencia/modo seguro;
- launchers Windows para observación, LAB y SOURCE autónomo.

Esto demuestra que la **arquitectura está implementada**. No demuestra por sí solo que una sesión real de WhatsApp enlazada hoy pase el E2E físico completo.

## Gate que sigue siendo físico

La promoción a “completamente funcional en tu laptop” requiere una sesión real con tus grupos y debe observar como mínimo:

1. QR/link exitoso y sesión persistente;
2. SOURCE y LAB resueltos a IDs distintos;
3. mensaje nuevo en SOURCE capturado una sola vez;
4. propuesta/respuesta correcta en LAB;
5. reinicio del Bridge sin duplicar la respuesta;
6. pérdida temporal de backend/red con spool y replay seguro;
7. estado `ambiguous` ante crash durante un envío, sin reenvío ciego;
8. health/readiness coherente;
9. kill switch bloqueando SOURCE;
10. sólo después, prueba explícita de SOURCE auto-reply con backend autorizado.

Hasta que esa prueba se ejecute, el estado correcto es `IMPLEMENTED / REAL-WHATSAPP-E2E-PENDING`, no PASS de producción.

## Comando recomendado para hoy

Desde la raíz del repositorio, para probar sin escribir en el grupo oficial:

```powershell
.\PROBAR-HIPICO-LAB-LOCAL.cmd
```

O directamente:

```powershell
cd .\tools\hipico-whatsapp-web-bridge
.\INICIAR-LAB-LOCAL.ps1
```

El launcher ahora ejecuta antes de abrir WhatsApp:

```text
npm ci
npm run qa
captura/verificación de IDs @g.us
npm run readiness -- --lab
```

`readiness -- --lab` falla cerrado si Node no es 22, los grupos no están pinneados/distintos, la configuración no es `shadow-local`, el LAB no está habilitado o SOURCE auto-reply está encendido.

Para inspección manual adicional:

```powershell
npm run readiness
npm run diagnostic:status
npm run healthcheck
npm run report
```

Para SOURCE autónomo **no usar el launcher LAB**. Primero se requiere `.env` de producción, backend sano y:

```powershell
npm run production:check
npm run readiness -- --source
```

El readiness SOURCE sólo queda verde si el runtime está en producción, los grupos están pinneados/distintos, el kill switch está apagado y `health.json` confirma `sourceSendPossible=true`.

## Qué no debes borrar

Durante actualización, crash o rollback no borrar `%LOCALAPPDATA%\ControlHipicoBridge\data` porque contiene perfil/journals/spool/dedupe necesarios para evitar doble entrega.

## Mercado / arquitectura 2026

### Meta Cloud API

Meta mantiene Cloud API como la API oficial para mensajería de negocio y concentra ahí también Flows. Para conversaciones 1:1 compatibles, notificaciones estructuradas, onboarding empresarial y casos donde exista soporte oficial, es el canal preferible por estabilidad contractual y cumplimiento.

No se sustituye hoy el Bridge de grupos por Cloud API porque el flujo operativo actual depende de un grupo real de WhatsApp y la migración no es un reemplazo transparente de ese contrato.

### Baileys y clientes WebSocket

Baileys sigue activo en 2026 y elimina el costo de Chromium al hablar con el protocolo de WhatsApp Web por WebSocket. Puede ser un **transport alternativo futuro** detrás de una interfaz de proveedor porque reduce RAM y ofrece eventos de grupos en tiempo real.

No se migra en este hardening por tres razones:

1. es no oficial y no está afiliado a WhatsApp;
2. su versión 7 introdujo breaking changes relevantes;
3. cambiar el transporte el mismo día de una prueba operacional invalidaría evidencia previa y aumentaría el riesgo.

La mejora recomendada es conservar el contrato de dominio/backend y evaluar en un ticket separado una interfaz `WhatsAppTransport` con dos adaptadores: Playwright actual y un experimento Baileys en LAB. La promoción sólo ocurriría si iguala dedupe, spool, journal, reconnect, pinning y kill switch.

## Criterio de promoción

No promover por “respondió una vez”. El candidate debe demostrar:

- exact-once observable a nivel de efecto;
- recuperación tras restart/reconnect;
- no doble respuesta ante eventos duplicados;
- reconciliación de estados ambiguos;
- kill switch efectivo;
- ausencia de escrituras monetarias por conversación;
- soporte bundle sin secretos/texto sensible por defecto.
