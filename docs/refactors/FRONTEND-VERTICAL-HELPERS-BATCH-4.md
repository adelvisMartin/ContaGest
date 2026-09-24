# Clean Code · frontend verticales · lote 4

## Objetivo

Reducir responsabilidad accidental en los tres shells frontend principales sin mover estado, efectos, callbacks ni ownership de render.

Baseline: `main@606af2adb6d291df8323eef7ef223d6f0f63cefc`.

## Odontología

Se extraen a `dentistryWorkspace.helpers.js`:

- catálogo de procedimientos;
- catálogo de especialidades;
- normalización de respuestas tipo lista;
- resolución de nombre del paciente.

`DentistryPracticePage.jsx` conserva todo el estado, efectos, formularios, callbacks, navegación clínica y composición de panels.

## Veterinaria

Se extraen a `veterinaryWorkspace.helpers.js`:

- tabs;
- tonos de status;
- meses;
- formatters de fecha;
- sanitización de teléfono;
- normalización de errores/respuestas;
- short codes;
- helpers de datetime local.

`VeterinaryWorkspace.jsx` conserva el **renderer único 21/51**, hooks, refs, estado, diálogos, carga, retry, servicios y JSX. `Icon` permanece local por ser componente JSX.

## Gimnasio

Se extraen a `gymWorkspace.helpers.js`:

- normalizadores de respuestas;
- helpers de fecha/hora;
- formateo de montos;
- opciones de miembros, trainers y planes;
- meses.

`GymManagementPage.jsx` conserva state/effects, navegación de tabs, formularios, ejecución de operaciones y composición 33–47.

## Trazabilidad

La matriz 1–58 conserva `reviewStatus` previo y añade `reviewBatches` para permitir varias pasadas Clean Code sin borrar historia.

Batch 4 afecta los shells de:

- 3/51;
- 10–20/51;
- 21–32/51;
- 33–47/51.

No implica que cada feature haya sido reescrita; significa que su shell frontend compartido fue revisado y limpiado.

## Invariantes

- helpers nuevos no contienen JSX/hooks;
- helpers no importan servicios ni hacen red;
- no cambia ninguna API pública;
- no cambia estado React ni callbacks;
- no cambia owner de render;
- no cambia permisos/tenant/CSRF.

## Regresión

`tests/frontend_vertical_helpers_batch4.test.mjs`.
