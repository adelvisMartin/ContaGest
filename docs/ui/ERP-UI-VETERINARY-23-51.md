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

## Hardening de la toma de signos vitales

La primera versión persistía cada signo con llamadas independientes. Eso dejaba una ventana de fallo parcial: por ejemplo, peso podía quedar guardado y temperatura fallar; un reintento podía duplicar el primer dato.

El flujo actual usa:

`POST /health/measurements/veterinary-vitals`

con un `batchId` UUID estable durante el reintento.

El servidor:

1. valida mascota activa del tenant;
2. valida opcionalmente que el encuentro pertenezca a la misma mascota;
3. toma un advisory lock por tenant + mascota + batch;
4. acepta sólo `weight | temperature | heart_rate | respiratory_rate`;
5. valida la unidad canónica de cada signo;
6. impide signos duplicados dentro de una misma toma;
7. persiste toda la toma dentro de una transacción;
8. devuelve el batch existente si el mismo request se reintenta;
9. rechaza reutilizar el mismo `batchId` con valores distintos.

La migración `CareMeasurement_vet_batch_kind_unique` refuerza en PostgreSQL una sola medición por `tenant + patient + batchId + kind` para el origen longitudinal veterinario.

La UI conserva formulario y `batchId` cuando hay error, por lo que **Reintentar Guardar** no duplica los valores ya confirmados por el servidor. Sólo rota el `batchId` después de éxito completo.

## QA

- `erp_ui_veterinary_longitudinal_record_23_51.test.mjs`;
- Wave A exige una sola composición del panel;
- gate exige lectura canónica `HealthVerticalService.measurements(patientId)` y escritura batch `createVeterinaryVitalMeasurements`;
- gate bloquea la reintroducción de writes parciales `createMeasurement` desde el panel longitudinal;
- no se declara runtime/browser PASS sin ejecución real del SHA.
