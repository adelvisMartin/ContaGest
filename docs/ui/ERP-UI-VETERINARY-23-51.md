# 23/51 · Veterinaria — ficha clínica longitudinal

## Objetivo

Convertir la ficha veterinaria en una historia clínica longitudinal capaz de resumir problemas activos, alergias, diagnósticos, tratamientos y tendencias objetivas de peso/signos vitales.

## Autoridad de datos

No se crea un segundo almacén clínico.

- problemas activos y alergias: `CarePatient`;
- diagnósticos y plan: `CareEncounter`;
- tratamientos: `CarePrescription`;
- peso y signos vitales: `CareMeasurement`.

## Backend

Se añade lectura canónica:

`GET /health/measurements?patientId=...`

con:

- `health.manage`;
- filtro por `tenantId + patientId`;
- orden descendente por `measuredAt`;
- máximo 1000 mediciones.

El POST existente de mediciones ahora valida que el paciente pertenezca al tenant activo antes de insertar.

## UI

`VeterinaryLongitudinalRecord.jsx` muestra:

- Problemas activos;
- Alergias;
- Diagnósticos recientes;
- Tratamientos activos/no cancelados;
- Peso;
- Temperatura;
- Frecuencia cardíaca;
- Frecuencia respiratoria;
- última medición y tendencia frente a la anterior.

También permite registrar una nueva toma de uno o varios signos vitales. Cada valor se persiste como un `CareMeasurement` independiente y conserva la fuente `veterinary-longitudinal-record` en metadata.

## Evolución

La tendencia se deriva de las dos mediciones más recientes por tipo; no modifica ni normaliza el historial original.

Los eventos de medición también se incorporan a la cronología médica de la ficha.

## UX

- formulario controlado;
- estados empty y error;
- datos previos permanecen visibles;
- tabla responsive para diagnósticos/tratamientos;
- sin DOM imperativo.

## QA

- `erp_ui_veterinary_longitudinal_record_23_51.test.mjs`;
- Wave A exige una sola composición del panel;
- gate exige uso de `HealthVerticalService.measurements(patientId)`;
- no se declara runtime/browser PASS sin ejecución real del SHA.
