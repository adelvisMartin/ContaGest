# 49/51 · QA — Matriz visual anti-solapamiento

## Cobertura

Rutas:
- odontologia
- veterinaria
- gimnasio
- rutinas
- nutricion

Viewports:
- 360×800
- 390×844
- 430×932
- 768×1024
- 1366×768

Temas:
- light
- dark

Total: 50 escenarios renderizados en Chromium.

## Detector fail-closed

La auditoría ejecuta geometría sobre el DOM realmente renderizado y falla por:

- overflow horizontal del documento;
- elementos fuera del viewport salvo owners explícitos de scroll;
- IDs duplicados;
- controles interactivos que se solapan entre sí;
- icono y label solapados;
- texto operacional recortado;
- targets táctiles menores a 44 px en contextos touch.

No usa HTML estático ni screenshots simulados.

## Datos

Las APIs se stubbean únicamente para obtener estados vacíos deterministas. El frontend completo se carga por la aplicación real y la geometría se mide con `getBoundingClientRect()`.

## Evidencia

Cada escenario adjunta:
- screenshot full-page PNG;
- JSON con ruta, viewport, tema y findings.

Playwright conserva además traces/screenshots/videos de fallo según la configuración global.

El workflow verifica que `git rev-parse HEAD` coincida con `CANDIDATE_SHA` y publica artefactos con el SHA en el nombre.

## Regla de cierre

49/51 sólo obtiene PASS visual cuando el workflow del SHA exacto ejecuta Chromium y los 50 escenarios terminan sin findings. La presencia del spec/workflow por sí sola es implementación, no evidencia runtime.
