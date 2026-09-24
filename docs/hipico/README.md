# CONTROL HÍPICO

**Misma operación hípica. Mejor ingeniería. Mejor experiencia.**

Control Hípico es un producto operacional independiente. ContaGest-VE se utiliza como referencia de madurez técnica; no se trasladan sus reglas contables ni su dominio.

## Contrato funcional

Se preservan Resumen, Captura, Participantes, Chat WhatsApp, Adelantadas, Historial, Cierres y saldos, POLLA y Configuración, junto con persistencia local, operación offline, outbox, deduplicación, recuperación/snapshots y futura integración WhatsApp/Bridge.

## Documentación

- `ARCHITECTURE.md`: límites y dependencias.
- `STYLE_GUIDE.md`: Precision Hípica.
- `SECURITY.md`: amenazas y controles.
- `PWA.md`: manifest, cache, offline y actualización.
- `TESTING.md`: matriz y evidencia.
- `DEPLOYMENT.md`: Preview/Production/rollback.
- `MODERNIZATION_V1.md`: estado de implementación y fases abiertas.
- `LIVE_INGESTION.md` y `SHADOW_VALIDATION.md`: WhatsApp/Bridge.
- `OFFLINE_AND_RECOVERY.md`: continuidad operativa.
- `RELEASE_CHECKLIST.md`: release gate.

## Regla de identidad

La única marca visible y activa es **CONTROL HÍPICO**. Cualquier identidad histórica debe permanecer fuera de build, PWA, metadata, exports, tests visibles y caches activos.

## Orquestación IA · Jev shadow

La primera integración de Jev es deliberadamente no autoritativa. El motor determinista, la política de riesgo, los tool guards y el outbox conservan toda la autoridad operacional. Jev sólo observa evaluaciones y produce evidencia tipada para comparar clasificación, necesidad de revisión humana y acuerdo con el candidato actual.

El provider permanece `OFF` por defecto. Para habilitar llamadas reales se requieren simultáneamente `HIPICO_JEV_MODE=shadow`, una `TYPESAFE_API_KEY` server-side válida y `HIPICO_JEV_DATA_SHARING_APPROVED=true`. Un timeout, error HTTP, respuesta inválida o configuración incompleta degrada a `UNAVAILABLE/SKIPPED` sin modificar `candidate`, `riskPolicy`, `canAct`, herramientas ni envíos.

La promoción futura fuera de shadow requiere métricas propias del corpus real/adversarial, revisión humana y los gates existentes; no se infiere confianza de producción a partir de la probabilidad del proveedor.


## Jev shadow metrics · fase 2

La evidencia Jev se mide en dos ventanas: histórica y reciente de 30 días. Sólo cuentan para accuracy las observaciones `OBSERVED` que ya fueron revisadas por un operador; los `SKIPPED` por provider desactivado no penalizan disponibilidad. La disponibilidad compara únicamente intentos reales `OBSERVED + UNAVAILABLE`.

El gate `jev-shadow-readiness-v1` es estrictamente informativo. Puede declarar `eligibleForAssistedRanking=true` sólo con al menos 200 observaciones revisadas históricas, 75 recientes, accuracy de clase de intención ≥ 98%, disponibilidad ≥ 99% y cero desacuerdos de seguridad. Un desacuerdo de seguridad ocurre cuando la política determinista exige revisión/denegación y Jev asigna probabilidad de revisión humana menor de 0.5.

Superar este gate **no cambia** `canAct`, `riskPolicy`, tools, estados de carrera, dinero ni outbox. Cualquier fase futura de ranking asistido requerirá una implementación separada, revisión explícita y nuevos gates exact-SHA.

Los contadores de uso del proveedor se persisten como `inputUnits/outputUnits`, no como claves que contengan `token`, para mantener compatibilidad con el sanitizer de secretos de la evidencia.


## Fase 3 · respuestas autónomas en el grupo WhatsApp

La fase 3 separa la autonomía conversacional de la autoridad operacional. El bot puede responder por sí solo en el grupo oficial cuando `HIPICO_SOURCE_AUTO_REPLY_ENABLED=true`, pero una respuesta nunca equivale a una mutación de carrera, jugada, saldo, ledger o liquidación.

El flujo es: mensaje SOURCE → persistencia/dedupe → clasificación determinista → response safety → Jev como evidencia downgrade-only → consulta canónica read-only cuando aplique → Risk Policy → comando `source_reply` persistido → journal durable del Bridge → validación del `@g.us` exacto → envío → recibo `sent|ambiguous`.

Jev nunca puede ampliar autoridad. Cuando su readiness está probado sólo puede degradar una respuesta segura a aclaración ante señales fuertes: conflicto de intención con confianza ≥ 0.90, probabilidad de revisión humana ≥ 0.90 o acuerdo con el candidato ≤ 0.10. Una discrepancia débil no crea trabajo humano innecesario. Si Jev está OFF o no disponible, una consulta determinista segura puede continuar usando la fuente canónica. Para consultas ambiguas, el bot solicita contexto; para adjuntos solicita texto; si un subsistema pierde autoridad pero todavía existe una respuesta segura, el bot informa la degradación sin confirmar operaciones. La intervención humana se reserva como último recurso tras tres aclaraciones fallidas o cuando existe un bloqueo real de seguridad/estado.

El Bridge evita loops ignorando mensajes `fromMe`. Antes de pulsar Enter revalida el grupo SOURCE exacto. Si falla antes de enviar, el journal permite reintento; si el proceso cae durante o después del intento y no puede probarse la entrega, el estado queda `ambiguous` y no se reenvía automáticamente.

La autonomía SOURCE exige simultáneamente switch backend + Bridge, owner configurado, grupo `@g.us` pinneado, schema de `source_reply` listo, backend saludable y kill switch local inactivo. El default continúa siendo OFF.
