# 13/51 · Historial versionado del odontograma

## Problema

Los tratamientos firmados conservaban fecha y contenido clínico, pero no existía un flujo de enmienda que pudiera responder de forma explícita:

- qué condición tenía la pieza antes;
- qué cambió;
- quién hizo el cambio;
- por qué se hizo.

Editar en sitio una fila firmada habría destruido esa evidencia.

## Autoridad

Se conserva `CareEncounter` como única persistencia clínica. No se crea una tabla paralela ni un segundo backend.

La enmienda usa `POST /health/encounters/:id/amend` bajo `health.manage` y una transacción PostgreSQL:

1. bloquea la versión objetivo con `FOR UPDATE`;
2. exige que sea `dental-treatment` y estado `signed`;
3. valida el odontograma estructurado;
4. valida que el profesional pertenezca al tenant;
5. calcula actor, revisión, timestamp y diff en servidor;
6. marca la versión anterior `amended` sin modificar su `clinicalData`;
7. inserta una nueva versión `signed`.

## Metadata de versión

La nueva versión agrega `clinicalData.versioning`:

- `revision`;
- `rootEncounterId`;
- `previousEncounterId`;
- `reason`;
- `actor.userId` / `actor.email`;
- `amendedAt`;
- `changedFields`;
- snapshots `before` y `after`.

Los snapshots cubren dentición, pieza, superficies, condición, procedimiento, hallazgo, diagnóstico resumido y plan.

El cliente no puede enviar actor, revisión ni ID de versión previa como autoridad; se derivan server-side.

## UI

La historia muestra cada versión, su estado, actor, motivo y cambios como `anterior → nuevo`. Sólo una versión `signed` ofrece la acción **Enmendar**. Las versiones `amended` permanecen visibles e inmutables clínicamente.

## Seguridad y concurrencia

- tenant del encuentro validado en el SELECT inicial;
- profesional validado en el mismo tenant;
- `FOR UPDATE` evita dos enmiendas concurrentes sobre la misma versión firmada;
- una versión ya `amended` no puede volver a enmendarse;
- el cambio no introduce migraciones ni reescribe historia previa.

## Regresión

`tests/erp_ui_dentistry_odontogram_history_13_51.test.mjs` y Wave A bloquean regresiones de versionado, actor, motivo, before/after y uso del servicio canónico.
