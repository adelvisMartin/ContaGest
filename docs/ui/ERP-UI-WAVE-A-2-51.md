# 2/51 · ERP UI Wave A — Odontología, Veterinaria y Gimnasio

## Alcance

Esta implementación extiende #181 sobre las cinco rutas que representan los tres verticales priorizados:

- `odontologia`;
- `veterinaria`;
- `gimnasio`;
- `rutinas`;
- `nutricion`.

No modifica APIs, reglas clínicas, cálculos, persistencia ni permisos.

## Estado de migración

La clasificación se registra en `qa/support/erp-ui-wave-a-v251.mjs`.

`VeterinaryClinicPageV1123.jsx` adoptó `CgProvider`, `CgButton`, `CgTextField`, `CgState` y `CgStatusChip` en 2/51. El follow-up 3/51 eliminó el page lifecycle doble: dossier y workspace clínico ahora se componen declarativamente bajo un único React root, por lo que Veterinaria queda `MIGRATED`.

Odontología fue graduada a `MIGRATED` en 3/51: el renderer imperativo fue sustituido por un único React root con Cg/MUI y estado controlado. Gimnasio/Rutinas/Nutrición también quedan `MIGRATED`: comparten `GymManagementPage.jsx`, un único React root, formularios controlados Cg*/MUI y herramientas de productividad React sin `MutationObserver`.

## Regla anti-regresión

`npm run audit:erp-ui-wave-a`:

- exige clasificación exhaustiva de las cinco rutas;
- valida el renderer contra `pageRegistry.js`;
- exige owner/razón/fecha/follow-up para cada excepción;
- impide que aumente el presupuesto de primitives HTML legacy;
- exige que el dossier veterinario siga consumiendo Cg*;
- verifica que el owner responsive compartido cubra Odontología y Gimnasio.

La reducción del presupuesto legacy está permitida; su aumento falla.

## Responsive

El owner `cg.visual.responsive` mantiene el contrato compartido de #180/#181. Esta ola añade explícitamente touch targets de 44 px para el odontograma y wrapping/containment para listas odontológicas, además de conservar los contratos ya existentes de Gimnasio.

Los viewports de evidencia son 360, 390, 430, 768 y 1366. El source gate no se hace pasar por browser QA: hasta ejecutar el browser real, el manifest mantiene esos estados como `NOT_EXECUTED`.

## Follow-up

**3/51 cerrado en source**: Veterinaria, Odontología, Gimnasio, Rutinas y Nutrición están clasificadas como `MIGRATED`. El siguiente paso es evidencia browser real; mientras #134 impida runners, los viewports permanecen `NOT_EXECUTED` y no se infiere PASS desde source.

## Gates de cierre

- `npm run baseline:verify`;
- `npm run audit:erp-ui-wave-a`;
- `node --test tests/erp_ui_wave_a_2_51.test.mjs`;
- source/typecheck/build del pipeline vigente;
- Chromium: `npm run test:browser:erp-ui-wave-a` sobre 360/390/430/768/1366 cuando exista runner/browser aprobado.

Los estados browser permanecen `NOT_EXECUTED` hasta obtener ejecución real; no se infieren desde el source gate.
