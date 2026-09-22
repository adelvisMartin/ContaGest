# 27/51 · Veterinaria — Hospitalización / Treatment Sheet

## Objetivo

Convertir la hospitalización existente en un flujo de cuidados trazable sin crear una segunda autoridad clínica ni una tabla paralela.

La autoridad permanece en:

- `CareHospitalization`: estancia, paciente, profesional, área, jaula, diagnóstico y estado.
- `CareHospitalObservation`: eventos inmutables/append-only ocurridos durante la estancia.
- `VeterinaryTreatmentSheet`: owner visual para registrar y consultar esos eventos.

## Hoja de tratamiento

La hoja admite:

- **Medicacion**: nombre, dosis manual y vía.
- **Observacion**: texto clínico.
- **Alimentacion**: alimento, cantidad y unidad.
- **Fluidos**: fluido, cantidad, unidad, velocidad y vía.
- **Signos vitales**: temperatura, frecuencia cardíaca, frecuencia respiratoria y peso.
- **Tarea**: actividad operacional de cuidado.

Cada evento conserva:

- categoría y título;
- estado `scheduled | completed | skipped | cancelled`;
- `scheduledAt`;
- `performedAt`;
- `responsibleProfessionalId`;
- actor de sesión (`actorUserId` / `actorEmail`);
- detalles estructurados y nota.

## Integridad y concurrencia

`POST /hospitalizations/:id/treatment-sheet`:

1. valida el payload;
2. abre una transacción;
3. bloquea la hospitalización con `FOR UPDATE`;
4. comprueba que siga `admitted | observed`;
5. valida que el profesional responsable pertenezca al tenant;
6. deriva actor y timestamps server-side;
7. agrega un nuevo `CareHospitalObservation`.

No existe UPDATE/DELETE para eventos de la hoja de tratamiento. Una corrección clínica posterior debe registrarse como un nuevo evento, preservando la evidencia histórica.

El bloqueo evita que una alta concurrente y un nuevo cuidado se acepten como si ambos hubieran ocurrido sobre el mismo estado de estancia.

## Validación del contenido

El backend exige:

- `scheduledAt` cuando el estado es Programado;
- medicamento + dosis manual para medicación;
- alimento para alimentación;
- fluido para fluidoterapia;
- nota para observación;
- al menos un signo en un registro de vitales.

No hay cálculo ni recomendación automática de dosis. El sistema registra lo indicado por el profesional; no infiere una pauta terapéutica.

## UX

`VeterinaryTreatmentSheet.jsx` es el único owner visible de cuidados durante hospitalización:

- selecciona únicamente hospitalizaciones activas;
- muestra loading / error con Reintentar / empty / success;
- deshabilita submit hasta completar el mínimo requerido;
- presenta formulario responsive;
- lista responsable, estado, timestamps y detalles;
- explica que la dosis es manual;
- muestra eventos anteriores sin permitir edición destructiva.

El antiguo formulario genérico “Registrar control” se retira de `VeterinaryWorkspace` para evitar dos caminos de escritura sobre el mismo concepto de cuidados hospitalarios.

## Fronteras con los siguientes puntos

27/51 registra medicaciones y cuidados como eventos hospitalarios, pero **no** implementa todavía:

- integración prescripción → etiqueta → dispensación;
- selección de lote;
- descuento de inventario;
- reorden o stock mínimo por acto clínico.

Esas responsabilidades corresponden a 28/51 y 29/51; no se anticipan aquí.

## QA

- `tests/erp_ui_veterinary_treatment_sheet_27_51.test.mjs`;
- Wave A exige una sola composición, servicios canónicos, provenance server-side, timestamps y append-only;
- la migración sólo amplía el constraint de `CareHospitalObservation.type` con `task`;
- browser/runtime/build/CI sólo se consideran PASS cuando se ejecuten realmente sobre el SHA candidato.
