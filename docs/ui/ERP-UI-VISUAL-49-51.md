# 49/51 · QA — Matriz visual anti-solapamiento

## Objetivo

Añadir un gate visual explícito contra overflow, clipping, oclusión y controles inutilizables en las superficies Wave A de Odontología, Veterinaria y Gimnasio.

## Matriz

El spec `qa/erp-visual-overlap-v4951.spec.mjs` ejecuta:

- viewports 360, 390, 430, 768, 1366 y 1920 px;
- light y dark;
- contenido largo;
- navegación por teclado y foco;
- diálogos cuando la superficie ofrece un disparador de alta;
- pasada equivalente a zoom 200%;
- verificación de touch targets en móvil.

## Defectos que bloquean

- overflow horizontal del documento;
- contenido fuera del viewport fuera de contenedores de scroll intencionales;
- oclusión del centro de elementos por capas positioned;
- touch targets menores de 44 px en móvil;
- foco visible recortado;
- diálogo fuera del viewport.

## Integración

El gate se ejecuta desde el runner canónico 58x5 y su workflow. No es una suite paralela huérfana.

## Evidencia

El workflow conserva screenshots, trace, video y reporte Playwright en fallos mediante la configuración global existente.
