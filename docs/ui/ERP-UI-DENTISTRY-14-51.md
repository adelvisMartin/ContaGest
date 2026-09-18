# 14/51 · Periodontograma estructurado

## Objetivo

Agregar mediciones periodontales estructuradas y evolución longitudinal sin crear una persistencia paralela al módulo clínico.

## Autoridad

Cada periodontograma se registra como un `CareEncounter` firmado:

- `specialty: periodontics`;
- `type: periodontal-chart`;
- `clinicalData.periodontogram` como payload estructurado;
- misma API canónica `HealthVerticalService.createEncounter`;
- misma tabla `CareEncounter`;
- sin migraciones ni endpoints específicos de periodontograma.

Los periodontogramas previos no se editan. Una nueva medición crea un nuevo encuentro firmado y la UI compara registros de la misma pieza para mostrar evolución.

## Estructura

Cada pieza requiere exactamente seis sitios:

- mesiobuccal;
- midbuccal;
- distobuccal;
- mesiolingual;
- midlingual;
- distolingual.

Por sitio:

- profundidad de sondaje en mm;
- margen gingival en mm;
- sangrado al sondaje;
- supuración;
- placa.

Por pieza:

- dentición permanente/temporal;
- pieza;
- movilidad grado 0–3;
- furcación grado 0–3.

## Validación backend

`periodontalClinicalDataSchema` valida:

- pieza compatible con la dentición;
- seis sitios exactos y sin duplicados;
- profundidad 0–15 mm;
- margen gingival -10–20 mm;
- movilidad 0–3;
- furcación 0–3;
- booleanos explícitos para sangrado, supuración y placa.

## Evolución

La UI deriva, sin mutar los datos fuente:

- máximo sondaje;
- máximo nivel de inserción derivado;
- sitios con sangrado;
- sitios con placa;
- delta frente al registro anterior de la misma pieza.

Esto permite comparar mediciones en el tiempo manteniendo cada toma original firmada.

## UX/A11y

- inputs numéricos con límites explícitos;
- toggles `aria-pressed`;
- targets táctiles de al menos 44 px;
- tabla contenida horizontalmente en móvil;
- estados empty y saving;
- selección explícita de paciente, profesional, dentición y pieza.

## QA

Automatizado:
- contrato fuente `erp_ui_dentistry_periodontogram_14_51.test.mjs`;
- Wave A audit fail-closed;
- validación server-side por Zod.

No verificado automáticamente:
- validación funcional por un profesional odontológico sobre ergonomía/terminología clínica;
- browser/E2E mientras #134 impida ejecución del runner.

Esos puntos permanecen `NOT_VERIFIED` / `BLOCKED_INFRASTRUCTURE`; no se convierten en PASS.
