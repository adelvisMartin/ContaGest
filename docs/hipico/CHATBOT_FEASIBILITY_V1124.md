# Control Hípico · Factibilidad de chatbot WhatsApp v1.12.4

## Conclusión

El proyecto ya tiene los componentes necesarios para probar un asistente operativo sobre un grupo de WhatsApp **sin concederle autoridad monetaria**: bridge de dispositivo vinculado, spool local antes de red, ingest autenticado, deduplicación, clasificación semántica, agentes especializados, persistencia, shadow mode y grupo laboratorio.

El siguiente estado correcto no es “bot autónomo en producción”, sino **shadow mode medible**.

## Ruta técnica actual

`WhatsApp grupo → whatsapp-web.js/LocalAuth → spool local → /api/hipico/group-bridge-ingest → Supabase → clasificador/agentes → evaluación shadow → respuesta sugerida → grupo laboratorio`.

Cuando `HIPICO_SHADOW_MODE=true`, un mensaje del grupo fuente nunca recibe la sugerencia generada: `tools/hipico-whatsapp-bridge` redirige las acciones al grupo laboratorio. El backend mantiene `auto_send:false` y registra la predicción para auditoría.

## Agentes aplicados

La arquitectura existente distribuye trabajo entre Intake Sentinel, Identity Resolver, Race Context, Horse Offer, Parlay Reader, Reply Correlator, Closure Guard, Result Reader, Settlement Auditor, Balance Reconciler, Conversation Filter, Risk Guard, Publication Composer, Semantic Escalation y Operations Supervisor.

En v1.12.4 el endpoint del bridge añade sugerencias shadow para: ofertas, respuestas citadas, cierre de carrera, cierre de jornada, resultado/pizarra, plano, liquidación y snapshot de disponibles. La política fija `monetary_auto_apply:false`.

## Acciones que pueden automatizarse primero

- clasificar mensajes y descartar conversación no operativa;
- detectar duplicados;
- identificar cierre, resultado, plano y snapshot de saldo;
- pedir aclaratoria cuando falte contexto;
- generar una propuesta de respuesta en laboratorio;
- registrar trazabilidad y estado del pipeline;
- responder comandos diagnósticos sin efecto económico.

## Acciones que requieren aprobación humana

- emparejar definitivamente Juega/Consigue cuando exista ambigüedad;
- interpretar respuesta citada sin contexto suficiente;
- confirmar monto, caballo, jugada, hipódromo o carrera;
- aplicar llegada al motor definitivo;
- liquidar una pareja;
- modificar saldo, disponible, aval o comisión;
- publicar cierre/plano/liquidación en el grupo fuente.

## Gate para promoción

No pasar a respuesta automática en el grupo fuente hasta cumplir todos los puntos:

1. dataset shadow representativo de carreras reales;
2. precisión y recall por clase documentados;
3. cero duplicados monetarios aplicados;
4. cero respuestas a conversación social/no operativa en la muestra de aceptación;
5. casos de respuestas citadas y cierres segmentados verificados;
6. idempotencia y replay probados;
7. kill switch operativo;
8. feature flag por canal/grupo;
9. allowlist explícita de clases que pueden responder;
10. rollback ensayado;
11. auditoría de cada decisión;
12. aprobación del operador para toda mutación económica.

## Fases de promoción

- **S0 Manual:** solo pegar/importar texto en la PWA.
- **S1 Observación:** bridge recibe y persiste, sin respuestas.
- **S2 Shadow:** genera respuestas únicamente en grupo laboratorio. Estado actual preparado.
- **S3 Assist:** operador aprueba la respuesta propuesta antes del envío al grupo fuente.
- **S4 Auto limitado:** solo clases no monetarias y de alta confianza pasan automáticamente.
- **S5 Auto ampliado:** únicamente después de evidencia prolongada; las mutaciones económicas continúan detrás de controles explícitos.

## Seguridad

Tokens de bridge, Service Role y secretos de Meta permanecen server-side. El service worker de la PWA no cachea rutas sensibles. Los eventos se persisten con huella/idempotencia y el bridge guarda spool local antes de cualquier llamada de red.
