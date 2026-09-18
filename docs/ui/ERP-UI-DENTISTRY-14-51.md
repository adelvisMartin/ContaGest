# 14/51 · Periodontograma estructurado, mediciones y evolución

## Objetivo

Agregar periodoncia estructurada al módulo odontológico sin convertir la UI en autoridad diagnóstica ni crear persistencia paralela.

## Modelo y persistencia

Se reutiliza `CareMeasurement`. Cada examen periodontal crea, en una sola transacción, exactamente seis filas `kind=periodontal-site` para una pieza y una fecha, unidas por `metadata.examId`.

Los seis sitios canónicos son:

- mesiobuccal (MV);
- buccal (V);
- distobuccal (DV);
- mesiolingual (ML/P);
- lingual (L/P);
- distolingual (DL/P).

Por sitio se persiste profundidad de sondaje, margen gingival, nivel de inserción clínica, sangrado, supuración y placa. Movilidad y furcación son datos del diente/examen y se replican en metadata para reconstrucción auditada.

## Seguridad y tenancy

- paciente humano activo y profesional deben pertenecer al tenant;
- `actorUserId` se toma del contexto autenticado del servidor;
- el cliente no elige el actor;
- el batch de seis sitios se confirma o revierte como una sola transacción;
- no se añade migración DB.

## API

- `GET /health/periodontal-exams?patientId=...` reconstruye los exámenes desde `CareMeasurement`;
- `POST /health/periodontal-exams` valida dentición/pieza, los seis sitios y guarda el examen completo.

## UI

El periodontograma captura los seis sitios con controles responsive, movilidad/furcación, responsable, fecha y motivo. La evolución compara cada pieza/sitio con la medición previa y muestra deltas de sondaje e inserción.

Los deltas son descriptivos. ContaGest no calcula diagnóstico, estadio o grado periodontal en 14/51.

## Referencia funcional

El contrato de seis sitios y campos periodontales se definió contra referencias ADA/AAP consultadas durante la implementación. La validación clínica final del flujo y terminología sigue siendo responsabilidad de un profesional dental.

## QA

- `erp_ui_dentistry_periodontal_exam_14_51.test.mjs` bloquea pérdida de estructura/tenancy/evolución;
- Wave A bloquea pérdida de contratos periodontales y cualquier auto-diagnóstico agregado al renderer;
- browser 360/390/430/768/1366 queda `NOT_EXECUTED` si #134 impide ejecutar el runner.