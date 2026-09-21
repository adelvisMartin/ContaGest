# 18/51 · Lifecycle clínico odontológico

## Objetivo

Evitar que un tratamiento recién capturado quede firmado automáticamente. El lifecycle canónico pasa a ser:

`Borrador → En revisión → Firmado → Enmienda`

La firma es una transición explícita e irreversible sobre esa versión; cualquier corrección posterior se realiza mediante una nueva versión de enmienda.

## Estados

`CareEncounter.status` admite:

- `draft`;
- `review`;
- `signed`;
- `amended`;
- `cancelled`.

La migración 18/51 amplía únicamente el check constraint; no crea una tabla paralela.

## Alta de tratamiento

Un `dental-treatment` nuevo:

- debe llegar como `draft`;
- el backend rechaza creación directa como `signed` o `review`;
- el backend vuelve a fijar `draft` como defensa adicional;
- `clinicalData.workflow` guarda `state=draft`, propósito, actor y fecha server-side.

## Transiciones

`POST /health/encounters/:id/workflow`

Acciones:

### submit-review
- sólo desde `draft`;
- bloquea la fila con `FOR UPDATE`;
- cambia estado a `review`;
- registra `reviewRequestedAt` y `reviewRequestedBy`.

### sign
- sólo desde `review`;
- registra `signedAt` y `signedBy` server-side;
- cambia estado a `signed`;
- la UI exige confirmación explícita antes de ejecutar.

No existe transición directa `draft → signed`.

## Enmiendas

18/51 endurece el flujo introducido en 13/51.

Al solicitar una enmienda de una versión `signed`:

1. se bloquea la versión vigente;
2. se rechaza si ya existe otra enmienda `draft/review` pendiente;
3. se calcula diff/versionado;
4. se crea una nueva versión `draft`;
5. la versión anterior permanece `signed`.

La nueva versión debe pasar por revisión y firma.

Al firmar la enmienda, dentro de la misma transacción:

1. se bloquea la versión anterior;
2. se verifica que todavía sea la autoridad `signed`;
3. se marca como `amended`;
4. se firma la nueva versión.

Así no existe una ventana donde el paciente quede sin versión clínica firmada vigente.

## UI

`DentalLifecycleActions.jsx` centraliza:

- Borrador → **Enviar a revisión**;
- En revisión → **Firmar versión**;
- Firmado → **Enmendar**;
- Enmendado → sólo lectura.

Las transiciones de revisión y firma usan `CgDialog` para evitar acciones accidentales.

## Seguridad y concurrencia

- permiso `health.manage`;
- tenant derivado del contexto;
- actor y fechas server-side;
- `FOR UPDATE` en cada transición;
- no se puede firmar una versión fuera de `review`;
- no se puede enmendar una versión que ya no sea `signed`;
- no se puede abrir una segunda enmienda pendiente sobre la misma versión.

## Compatibilidad

- periodontogramas siguen siendo encuentros firmados independientes;
- planes de tratamiento conservan su lifecycle operativo propio de 15/51;
- consentimientos siguen bajo `CareConsent`;
- adjuntos clínicos siguen siendo `dental-attachment` firmados al crearse.

18/51 aplica específicamente a `dental-treatment`.

## QA

- `tests/erp_ui_dentistry_clinical_lifecycle_18_51.test.mjs`;
- contrato 13/51 actualizado a supersession diferida;
- Wave A fail-closed;
- migración del check constraint.

Browser/E2E/typecheck/build sólo se consideran PASS con ejecución real del SHA exacto.
