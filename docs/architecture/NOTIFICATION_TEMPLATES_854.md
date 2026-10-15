# ContaGest #854 — plantillas seguras y previsualización sin efectos

**Corte:** 2026-10-15 · **Issue:** [#854](https://github.com/adelvisMartin/ContaGest/issues/854) · **Base:** `main@0d93a03ad43dfb81036900b6948a3c5328bdf32c`  
**Responsable:** `ChatGPT-ContaGest-Notification-Truth-20261015-w6` (continuación de PR #1019).  
**Estado:** incremento de `PREVIEW_ONLY`; **no es la entrega completa de #854**.

## Autoridad y alcance

- `backend/src/modules/notifications/notification-template-catalog.ts`: catálogo local de plantillas de texto **versionadas**. Actualmente `operational.notice@1` (slots `title,detail`) y `sales.order-status@1` (slots `orderRef,stateLabel`).
- Variantes `es-VE` y `en-US`; locales ajenos resuelven deterministamente a `es-VE`. No permite contenido de plantilla editable por un request.
- El renderer exige objeto plano, sólo slots explícitos, contenido requerido de hasta 160 caracteres y rechaza caracteres de control. Escapa `& < > " '` al producir texto utilizable en contextos HTML. No sustituye el escape contextual requerido por el frontend que consuma el resultado.
- `evaluateNotificationQuietHours`: evalúa un **instante concreto** contra una ventana `HH:mm` y zona IANA mediante `Intl.DateTimeFormat`. Soporta intervalos que cruzan medianoche, límites y horas repetidas por DST; fecha/horas inválidas son errores. **No calcula runAt ni se convierte en scheduler**: esto pertenece al worker de #853.
- La única ruta añadida es `POST /api/v1/notifications/templates/preview`, protegida por `requireTenant` y `requirePermission('sales.manage')`, con body Zod `strict`. Sólo devuelve vista previa y evaluación temporal opcional, con `queued:false`, `delivered:false`. No crea `NotificationLog`, no envía, no consulta proveedor y no puede convertir un preview en intención aceptada.

## Contrato HTTP (ejemplo con valores sintéticos)

```json
{
  "key": "sales.order-status",
  "locale": "es-VE",
  "values": {"orderRef": "PED-001", "stateLabel": "Preparando"},
  "quietHours": {
    "timeZone": "America/Caracas",
    "start": "22:00",
    "end": "07:00",
    "at": "2026-10-15T02:00:00Z"
  }
}
```

La respuesta `ok.data.preview` lleva `key,version,locale,classification,subject,body,deliveryScheduled:false`, junto a `quietHours: {deferred,localTime,timeZone}` y `queued:false,delivered:false`. El propósito de `quietHours` es **simular una decisión**, no asegurar consentimiento, clasificación de urgencia ni ejecución. Si se omite, el resultado es `null`. El motor falla con HTTP 422 ante slots incompletos, campos extra, zona inválida y horas ambiguas; no incluye datos privados en el mensaje de error.

## Pruebas y entorno

- `node --experimental-strip-types --test tests/notification_template_catalog_v854.test.mjs`: ocho pruebas de catálogo/seguridad, locale, DST, Caracas, inyección y contrato de ruta. Invocado también al final de `npm --workspace backend test`.
- `tsc --noEmit --strict --skipLibCheck --target es2022 --module nodenext --moduleResolution nodenext backend/src/modules/notifications/notification-template-catalog.ts`: comprobación del módulo sin dependencias de backend.
- Playwright opt-in: `CG_NOTIFICATION_E2E_ISOLATED=true CG_NOTIFICATION_E2E_URL=http://127.0.0.1:3000 CG_NOTIFICATION_E2E_TOKEN=<TOKEN_SINTETICO> npx playwright test --config playwright.notifications-v854.config.mjs`. El test hace un PREVIEW válido y una negativa `tenantId` extra, **sólo en instancia local aislada**; no envía mensajes.
- La ejecución del endpoint real, tests de integración con Express/Prisma, build completo y UI responsive requieren un checkout con dependencias y un entorno de QA. No se pueden inferir como PASS de ocho pruebas unitarias.

## Dependencias y siguientes fases

La entrega real de notificaciones sigue bloqueada por:
1. [#853](https://github.com/adelvisMartin/ContaGest/issues/853): outbox transaccional PostgreSQL, lease, reintentos, DLQ e idempotencia. No construir un segundo scheduler aquí.
2. [#772](https://github.com/adelvisMartin/ContaGest/issues/772): contratos y adaptadores externos autorizados, receipts firmados, retry seguro y políticas por canal.
3. #854: consentimiento/preferencias/quiet hours persistidas por usuario, gobierno de plantillas, RBAC administrativo, deduplicación, timeline Cg*, auditoría/tenant/PG17/E2E, catalogo multitenant.
4. Comportamiento observado bajo #1019: `/notifications/send` retorna 503 mientras no exista cola real. No se debe volver a marcar `queued:true` sin haber persistido la intención de manera atómica.

**No habilitar WhatsApp SOURCE de Control Hípico desde notificaciones ERP**. SOURCE continúa `NO_GO` bajo #1011. Ningún marcador de vista previa representa entrega real.

## Rollback

Revertir en conjunto la ruta preview, módulo de catálogo, pruebas y referencia de runner. No modificar datos persistidos: no hay migración ni DDL. Mantener el bugfix previo #1019 (sin falsos ACK).
