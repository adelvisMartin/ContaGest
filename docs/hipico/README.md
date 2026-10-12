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

## WhatsApp SOURCE/LAB · política vigente (#728 / #154)

La fase de respuestas directas a SOURCE que se diseñó históricamente **no está habilitada para producción**. El Bridge conserva partes de ese contrato para compatibilidad, pero su guard canónico en `tools/hipico-whatsapp-web-bridge/src/source-policy-gate.mjs` siempre devuelve `eligible: false` para la revisión vigente; `runtime-config.mjs` rechaza arrancar con `HIPICO_SOURCE_AUTO_REPLY_ENABLED=true`. Ni `.env`, una cuenta personal ni otro transporte pueden usarse para eludir la decisión.

La automatización que sí debe verificarse es **SOURCE de solo lectura (cuando esté permitido) → normalización/dedupe → Conversation Engine + Risk Policy → LAB autorizado**. Los mensajes casuales y consultas seguras pueden responderse autónomamente en LAB. Para ambigüedad, jugadas, resultados, saldos o liquidaciones, las reglas del dominio conservan la autoridad y pueden requerir aclaración o revisión humana. Un proveedor LLM nunca tiene autoridad financiera.

La entrega a LAB está sujeta a identidad exacta de los grupos, control de duplicados, spool durable, kill switch y permisos del adapter. La simulación LAB no acredita soporte oficial de WhatsApp para el grupo real ni permiso para facilitar apuestas monetarias.

## Contrato de configuración Hípico (#665)

Los archivos versionados `backend/.env.example`, `frontend/.env.example` y `tools/hipico-whatsapp-web-bridge/.env.example` deben permanecer sincronizados en sus claves compartidas. Ejecutar:

    npm run test:hipico:config

El gate comprueba los **templates versionados**, sus flags fail-closed, la identidad de canales, la separación SOURCE/LAB, los identificadores y tokens sin rellenar y ausencia de variables privadas `VITE_*`. Nunca lee `.env` ni secretos reales, por lo que **no sustituye** el preflight de runtime, la validación de un despliegue ni el QA E2E sobre un candidate SHA.

## Smoke operacional de solo lectura Hípico (#664)

Después de arrancar el frontend/API del candidate se puede ejecutar:

    npm run smoke:hipico
    npm run smoke:hipico -- --base-url=https://host-autorizado.example/

El smoke exige una URL HTTPS (HTTP sólo en loopback) y consulta **exclusivamente con GET** el estado público `/api/hipico/status` y la ruta servida `/hipico-control/`. Verifica el contrato de modo/identidad, el indicador `sourceSendPossible=false`, la política sin caché del status y la existencia del shell PWA. No utiliza tokens, cookies, escritura al SOURCE, datos reales ni mutations financieras. Sus resultados son `PASS/FAIL/BLOCKED` con códigos estructurados que no incluyen cuerpos de respuesta ni secretos.

Las pruebas con HTTP local efímero corren mediante `npm run test:hipico:smoke` y están incluidas en `npm run test:hipico`. No equivalen a verificar login real, DB, Android ni autonomía LAB; esos gates continúan en #837/#839.
