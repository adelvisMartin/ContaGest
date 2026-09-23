# 49/51 · Matriz visual anti-solapamiento

## Objetivo

Endurecer la campaña visual existente de ContaGest para que ninguna ruta se considere visualmente validada sólo por cargar sin error.

La autoridad sigue siendo la campaña #155, reutilizando además la cobertura móvil #181. No se crea un segundo runner ni una segunda matriz de rutas.

## Viewports canónicos

Portrait:

- 360×800
- 390×844
- 430×932
- 768×1024
- 1366×768
- 1920×1080

La campaña #155 conserva además las variantes landscape móviles.

## Estados y datos

Se siguen recorriendo los estados canónicos:

- baseline
- loading
- empty
- error
- offline
- stale
- role-denied
- boundary

`boundary` usa datos sintéticos largos con Unicode, números grandes y texto repetido; no usa PII real.

## Nuevos gates 49/51

Sobre baseline y boundary:

- teclado/foco observable;
- light;
- dark;
- zoom CSS 200%;
- overflow horizontal del documento;
- overflow de elementos fuera de owners scrollables;
- clipping de texto operacional;
- occlusion de controles interactivos por otros elementos;
- diálogos fuera del viewport;
- overflow horizontal dentro de diálogos;
- touch targets móviles;
- tamaño de fuente móvil que evitaría zoom involuntario en inputs.

## Integración

La rama `test/erp-visual-matrix-*` habilita directamente el workflow `erp-system-qa-campaign-v155.yml`.

El mismo workflow conserva:

- matriz por rol;
- matriz por viewport;
- Chromium;
- Firefox;
- WebKit;
- regression pack;
- WCAG;
- artifacts ligados a `CANDIDATE_SHA`;
- agregación fail-closed.

## Evidencia

Los resultados se escriben en los mismos shards #155. Si aparece cualquier finding visual, el caso queda FAIL y se guarda screenshot.

La existencia del código fuente no equivale a ejecución browser. Mientras el runner no ejecute steps reales sobre el SHA candidato, la evidencia runtime permanece NOT_EXECUTED/BLOCKED_INFRASTRUCTURE.
