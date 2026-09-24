# Clean Code · cliente vertical frontend · lote 5

## Objetivo

Reducir boilerplate transversal del cliente frontend de Health, Veterinaria y Gimnasio sin cambiar su API pública ni los endpoints consumidos.

Baseline: `main@0eabeca86592a129ba1adc4b94d655571b5e1fef`.

## Hallazgo

`frontend/src/services/verticalService.js` repetía responsabilidades utilitarias junto a las superficies públicas:

- construcción de query strings;
- encoding seguro de IDs de path;
- flujo create + upload de foto.

El archivo además contiene las cuatro autoridades públicas que consumen las workspaces, por lo que el refactor debía conservar literalmente sus firmas y endpoints.

## Cambio

Se crea `verticalService.helpers.js` con:

- `query(params)`;
- `pathId(value)`;
- `createWithPhoto(...)`.

`verticalService.js` conserva:

- `HealthVerticalService`;
- `VeterinaryService`;
- `GymVerticalService`;
- `CommunicationTemplateService`;
- todos los literales de endpoints;
- toda llamada a `BackendApi`;
- firma y comportamiento de cada método público.

`MediaService` sigue siendo la autoridad real de upload/signing; el helper sólo encapsula el flujo ya existente.

## Invariantes

- no se cambia ningún nombre público;
- no se cambia GET/POST/PATCH/DELETE;
- no se cambia CSRF/auth/idempotencia de `BackendApi`;
- no se cambia encoding: se centraliza en `pathId`;
- query params vacíos/null/undefined siguen omitiéndose;
- creación con foto conserva primero persistencia, luego upload.

## Trazabilidad

La matriz 1–58 añade `CLEAN_CODE_BATCH_5_VERTICAL_CLIENT` a las implementaciones **10–47**, que comparten este cliente vertical, preservando los review statuses/batches previos.

## Regresión

`tests/vertical_service_clean_code_batch5.test.mjs`.

La validación runtime remota sólo se considera PASS con ejecución real del SHA exacto.
