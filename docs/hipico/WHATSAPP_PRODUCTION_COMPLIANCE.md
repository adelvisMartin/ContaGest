# Control Hípico — WhatsApp Production Compliance Gate (#154)

**Revisión:** 2026-09-29  
**Decisión actual:** **NO-GO para escritura automatizada al grupo real SOURCE**.

## Qué está demostrado

La revisión fue renovada después de la entrada en vigencia de los términos anunciados para el 2026-09-23. Las fuentes oficiales vigentes de WhatsApp/Meta continúan tratando los servicios de apuestas/juegos de azar con dinero real como una categoría restringida/prohibida para el uso comercial automatizado aplicable a este caso.

Que una automatización por navegador, WebSocket u otro transporte pueda escribir técnicamente en WhatsApp **no constituye autorización de plataforma**. La capacidad técnica y la autorización productiva son gates distintos.

## Lo que NO está demostrado

- una capability oficial/autorizada para este flujo exacto de grupo + apuestas con dinero real;
- permiso de la política vigente para automatizar mensajes del caso de negocio de Control Hípico;
- autorización específica de Meta/WhatsApp que levante ese NO-GO;
- una combinación jurisdicción/licencias/aprobaciones que modifique la restricción de plataforma.

La ausencia de cualquiera de esas evidencias mantiene `NO_GO`; no se sustituye por inferencias ni por el hecho de que el bridge funcione técnicamente.

## Fuentes oficiales revisadas

- `https://business.whatsapp.com/policy/` — WhatsApp Business Messaging Policy.
- `https://www.whatsapp.com/legal/business-solution-terms` — WhatsApp Business Solution Terms / términos vigentes.
- `https://www.whatsapp.com/legal/terms-of-service` — WhatsApp Terms of Service.
- `https://www.whatsapp.com/legal/` — legal hub y documentos vigentes.
- documentación oficial de uso no autorizado/automatización disponible desde el Help Center de WhatsApp.

Una promoción futura exige evidencia fresca (<30 días) y una decisión explícita GO; una copia antigua de política no sirve como excepción permanente.

## Arquitectura y enforcement

El dominio/bot permanece separado del transporte. La política productiva se aplica en más de una capa:

- SOURCE se mantiene read-only para QA/operación actual;
- LAB puede responder automáticamente con identidad de grupo pinneada;
- el Bridge valida nombre + ID `@g.us`, backend y readiness;
- `HIPICO_SOURCE_AUTO_REPLY_ENABLED=true` falla cerrado en `runtime-config.mjs` con `SOURCE_AUTO_REPLY_POLICY_NO_GO`;
- `INICIAR-HIPICO-AUTONOMO.cmd` ejecuta autonomía segura en LAB y no activa escritura SOURCE;
- el kill switch local continúa siendo una protección adicional, no un sustituto del gate de política.

Un transporte futuro sólo puede habilitar SOURCE writing si existe una capability de plataforma permitida y la evidencia de compliance cambia formalmente a GO.

## Qué sí puede automatizarse hoy

Con SOURCE read-only:

```text
leer -> deduplicar -> persistir/spoolear -> clasificar -> sugerir -> auditar
```

En LAB de QA también se permite respuesta automática, replay controlado, pruebas de reconnect/restart, idempotencia, ambiguous delivery y recuperación de spools.

## Qué permanece bloqueado

El software no habilita automáticamente en SOURCE:

- mensajes de apuestas con dinero real;
- confirmaciones financieras;
- cambios de saldo/ledger;
- liquidaciones/premios;
- resultados definitivos con efectos de negocio.

Las protecciones de dominio/dinero siguen siendo independientes de la capa WhatsApp.

## Relación con QA

Accuracy, Playwright, physical QA, soak o una sesión estable de WhatsApp Web **no anulan** este NO-GO. Esos gates prueban calidad técnica; no convierten una capability no autorizada en permitida.

El procedimiento físico vigente está en `docs/hipico/QA_DOWNLOAD_AND_BOT_TEST.md` y el análisis técnico/mercado en `docs/hipico/WHATSAPP_READINESS_2026-09-29.md`.

## Reconsideración futura

Para reconsiderar SOURCE writing deben actualizarse en un PR separado:

1. fuente oficial y fecha;
2. connector/capability exacta;
3. uso permitido para el caso exacto;
4. jurisdicción/aprobaciones requeridas;
5. decisión `GO` explícita y revisada;
6. tests que demuestren que el gate no puede activarse por un simple booleano local.

Hasta entonces, el estado correcto es **NO-GO**.
