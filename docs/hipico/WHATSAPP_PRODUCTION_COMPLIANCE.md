# Control Hípico — WhatsApp Production Compliance Gate (#154)

> **Aclaración vigente del propietario (2026-10-15):** el caso actualmente solicitado es un grupo privado de amigos, con actividad hípica recreativa sin dinero real, depósitos, pagos, retiros, premios canjeables ni efecto económico, usando WhatsApp Messenger normal. WhatsApp Business no se utilizará. Las conclusiones históricas de abajo sobre apuestas monetarias aplicaban a un alcance Business anterior; no describen este grupo ni son el motivo actual del bloqueo. Las [Condiciones de Messenger](https://www.whatsapp.com/legal/terms-of-service?lang=es) restringen mensajería automática/uso no personal salvo autorización; hasta verificar permiso expreso, no conectar el grupo para lectura ni envío automatizados. Avanzar solo con harness LAB sintético y sugerencias manuales. No volver a pedir al propietario que clasifique el dinero.

**Revisión:** 2026-09-29  
**Decisión actual:** **NO-GO para escritura automatizada al grupo real SOURCE**.

> **Revalidación 2026-10-15 (#1011):** [matriz oficial por caso de uso y estado de verificación](WHATSAPP_ELIGIBILITY_REVIEW_2026-10-15.md). El owner confirmó grupo privado de amigos, actividad recreativa sin dinero real y WhatsApp Messenger normal; WhatsApp Business queda excluido. El NO-GO actual aplica porque los términos de Messenger restringen mensajería automática/uso no personal salvo autorización y no se ha documentado una autorización para este caso. El texto histórico inferior describía un perfil monetario/Business anterior; no se atribuye al grupo recreativo.

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

- SOURCE conserva contratos de lectura para compatibilidad, pero no se debe conectar a Messenger real hasta verificar autorización;
- el código todavía permite iniciar algunas rutas de lectura SOURCE; el bloqueo técnico independiente aún no está integrado y debe preceder a cualquier prueba conectada;
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
