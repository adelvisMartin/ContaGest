# Guía de estudio — ERP #182

## Source SHA vs served SHA

El commit que ves en GitHub no demuestra qué versión está sirviendo producción. El deploy necesita exponer una identidad verificable y el QA debe compararla con el candidate exacto.

## Service worker stale

Una PWA puede conservar recursos antiguos. Si build-info también se cacheara, podría decir que todo está actualizado cuando en realidad el navegador usa una mezcla de versiones. Por eso build-info es network-only.

## local-unbound

Es útil para desarrollo local, pero no prueba procedencia. Release debe rechazarlo.

## Install/upgrade

No basta con abrir una pestaña nueva. Deben probarse instalación limpia, actualización desde una versión anterior, activación del service worker nuevo y eliminación controlada de caches viejas.

## QA servido

La suite productiva no mockea APIs. Usa una sesión QA explícita y visita las 58 rutas a 360/390/430 contra el URL real.

## Truth states

- PASS: candidate exacto y matriz ejecutada.
- FAIL: mismatch, stale comprobado o defecto reproducible.
- BLOCKED: infraestructura/dispositivo impide ejecutar.
- NOT_EXECUTED: todavía no se intentó/completó.

## Preguntas

1. ¿Por qué `main` no prueba qué está desplegado?
2. ¿Por qué build-info no debe cachearse?
3. ¿Qué diferencia existe entre una instalación limpia y un upgrade PWA?
4. ¿Por qué production QA no debe mockear backend?
5. ¿Qué riesgo tiene declarar PASS con `local-unbound`?
