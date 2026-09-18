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

`VeterinaryClinicPageV1123.jsx` ya usa React/MUI y en esta ola su dossier adopta `CgProvider`, `CgButton`, `CgTextField`, `CgState` y `CgStatusChip`. La ruta completa continúa como `LEGACY_EXCEPTION_APPROVED` porque todavía monta `VeterinaryClinicLegacy`.

Odontología y Gimnasio/Rutinas/Nutrición continúan como `LEGACY_EXCEPTION_APPROVED` porque son renderers HTML/DOM imperativos. Reescribirlos parcialmente aquí dejaría dos arquitecturas dentro de la misma pantalla. La retirada de esas excepciones pertenece explícitamente a **3/51**, donde el objetivo es unificar los tres verticales en React declarativo + Cg/MUI.

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

**3/51** debe retirar estas excepciones mediante la migración de los renderers imperativos y la eliminación del doble renderer veterinario. No se debe ampliar el presupuesto legacy durante esa transición.

## Gates de cierre

- `npm run baseline:verify`;
- `npm run audit:erp-ui-wave-a`;
- `node --test tests/erp_ui_wave_a_2_51.test.mjs`;
- source/typecheck/build del pipeline vigente;
- Chromium: `npm run test:browser:erp-ui-wave-a` sobre 360/390/430/768/1366 cuando exista runner/browser aprobado.

Los estados browser permanecen `NOT_EXECUTED` hasta obtener ejecución real; no se infieren desde el source gate.
