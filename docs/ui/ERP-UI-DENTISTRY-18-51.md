# 18/51 · Lifecycle clínico odontológico explícito

## Objetivo

Separar captura, revisión y firma de un tratamiento odontológico para que crear o enmendar datos no equivalga automáticamente a firmar autoridad clínica.

## Máquina de estados

`draft → review → signed`

Estados terminales/históricos existentes:

- `amended`: versión firmada sustituida por una enmienda firmada posterior;
- `cancelled`: permanece disponible para flujos que ya lo usan.

La migración amplía `CareEncounter_status_check` con `review`; no elimina estados históricos.

## Nuevos tratamientos

Un `dental-treatment` nuevo debe llegar como `draft`. El backend vuelve a validar esa regla y normaliza `clinicalData.lifecycle` server-side con:

- `state: draft`;
- `purpose: treatment`;
- actor creador;
- fecha de creación.

El navegador no puede crear directamente un tratamiento firmado.

## Revisión y firma

`POST /health/encounters/:id/workflow` admite sólo:

- `submit-review`: exige estado `draft`, registra actor/fecha de revisión y pasa a `review`;
- `sign`: exige estado `review`, registra actor/fecha de firma y pasa a `signed`.

Ambas transiciones son tenant-scoped y se ejecutan con lock `FOR UPDATE` dentro de transacción.

## Enmiendas

Una enmienda sólo puede partir de una versión `signed`. Al crearla:

- la versión firmada anterior **permanece signed y vigente**;
- se crea una nueva versión `draft` enlazada por `previousEncounterId`;
- se conserva reason, before/after, changedFields, revision y actor de creación;
- la UI la presenta como borrador de enmienda, no como firma.

Al firmar esa nueva versión, en una sola transacción:

1. se bloquea la versión nueva;
2. se bloquea la versión firmada anterior;
3. se verifica que la anterior siga siendo `signed`;
4. anterior → `amended`;
5. nueva → `signed`.

Así no existe una ventana donde la historia pierda su autoridad firmada vigente.

## UI

`DentalLifecycleActions.jsx` muestra estado y acciones permitidas:

- Borrador → Enviar a revisión;
- En revisión → Firmar versión;
- Firmado → Enmendar;
- Enmendado/Cancelado → sin acciones de firma.

Las transiciones requieren diálogo explícito y muestran que actor/fechas los registra el servidor.

## Compatibilidad

El lifecycle aplica a `dental-treatment`. Planes de tratamiento mantienen su decisión propia de 15/51; periodontogramas, consentimientos y adjuntos clínicos conservan sus autoridades específicas.

## QA

- `tests/erp_ui_dentistry_clinical_lifecycle_18_51.test.mjs` cubre estados, draft obligatorio, workflow, enmienda pendiente y supersesión atómica;
- Wave A bloquea pérdida del componente/servicio/backend/migración;
- browser/typecheck/PostgreSQL real se reportan únicamente si el runner ejecuta steps; un pre-runner failure sigue siendo `BLOCKED_INFRASTRUCTURE`.