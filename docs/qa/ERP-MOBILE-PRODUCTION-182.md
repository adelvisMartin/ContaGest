# ERP Production Mobile QA #182

## Problema

Source local y deploy servido pueden divergir por build equivocado, deployment viejo, caché del navegador o service worker stale. #182 exige comprobar el artefacto que realmente recibe el dispositivo.

## Identidad del build

`frontend/scripts/write-build-info.mjs` genera `/build-info.json` antes de Vite. En Vercel usa `VERCEL_GIT_COMMIT_SHA`; fuera de un SHA real queda `local-unbound`, estado que el release gate rechaza.

El service worker no cachea `/build-info.json`: siempre intenta red con `cache:no-store`. Offline devuelve una identidad no ligada y 503, nunca una confirmación stale.

## Gate

`products/erp/mobile-release-policy-v182.json` exige:

- served SHA = candidate SHA;
- identidad ligada;
- service worker freshness PASS;
- instalación/upgrade PWA PASS;
- 58 rutas verificadas;
- 360/390/430 sin overflow horizontal de documento;
- acciones críticas alcanzables.

## Uso

`CANDIDATE_SHA=<sha> ERP_PRODUCTION_URL=<url> node scripts/erp-mobile-production-gate-v182.mjs init`

`... node scripts/erp-mobile-production-gate-v182.mjs probe`

La prueba browser `qa/erp-mobile-production-v182.spec.mjs` requiere además `ERP_QA_SESSION_JSON` y visita el deploy real sin mocks de API.

## Verdad de evidencia

Un template recién creado es `NOT_EXECUTED`. Un mismatch de SHA o build no ligado es `FAIL`. Un device/browser no disponible puede quedar `BLOCKED`. Sólo una matriz ejecutada sobre el candidate exacto puede ser PASS.

## PWA

La cache rotó a `contagest-ve-v11-16-2`; activate elimina caches ContaGest anteriores. JS/CSS continúan network-first, navegación es network-first y build-info es network-only para impedir identidad stale.
