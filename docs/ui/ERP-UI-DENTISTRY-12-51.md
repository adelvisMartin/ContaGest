# 12/51 · Superficies visuales por diente

## Objetivo

Convertir la selección textual de superficies de 11/51 en un control visual por pieza dental sin cambiar el modelo clínico ni la autoridad de persistencia.

## Contrato preservado

La persistencia sigue siendo:

`HealthVerticalService.createEncounter → clinicalData.odontogram.surfaces`

con los mismos valores canónicos validados por backend:

- `vestibular`
- `lingual_palatal`
- `mesial`
- `distal`
- `occlusal_incisal`

No se añade endpoint, migración, tabla ni segundo estado clínico.

## UI

`ToothSurfaceSelector.jsx` representa las cinco superficies en una cuadrícula visual tipo pieza:

- vestibular arriba;
- mesial izquierda;
- oclusal/incisal al centro;
- distal derecha;
- lingual/palatina abajo.

El componente es controlado mediante `selectedSurfaces` + `onChange`, usa `aria-pressed`, targets mínimos de 44 px, foco visible y desactiva transiciones con `prefers-reduced-motion`.

La selección permanece deshabilitada hasta elegir una pieza. Cambiar paciente, dentición o pieza limpia las superficies para impedir asociaciones clínicas cruzadas.

## Regresión

`erp_ui_dentistry_visual_surfaces_12_51.test.mjs` y el auditor Wave A fallan si:

- desaparece una superficie canónica;
- vuelve DOM imperativo;
- la selección deja de ser controlada;
- el componente deja de estar conectado a `selectedSurfaces`;
- los targets bajan de 44 px.

Browser/runtime siguen sujetos a ejecución exact-SHA; un runner ausente se clasifica como infraestructura, no PASS.
