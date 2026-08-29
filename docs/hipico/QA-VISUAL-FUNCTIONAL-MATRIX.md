# Control Hípico · Matriz QA visual y funcional #105

## Propósito

Este documento convierte el criterio “se ve bien” en evidencia reproducible por vista, estado, viewport y SHA. Ninguna pantalla hereda el resultado de otra aunque comparta shell, CSS o componentes.

## Superficies productivas

| Vista | ID |
| --- | --- |
| Resumen | `dashboard` |
| Carrera activa | `race` |
| Chat WhatsApp | `whatsapp` |
| Adelantadas | `advanced` |
| Participantes | `participants` |
| Historial | `history` |
| Cierres y saldos | `reports` |
| POLLA | `polla` |
| Configuración | `settings` |

El catálogo ejecutable vive en `qa/support/hipico-visual-catalog-v105.mjs`.

## Viewports obligatorios

- 360 × 800;
- 390 × 844;
- 430 × 932;
- 768 × 1024;
- 1366 × 900;
- 1920 × 1080;
- 844 × 390 para landscape móvil.

La matriz normal contiene 9 vistas × 7 geometrías = 63 iteraciones independientes. Además se ejecutan estados `empty` y `offline` por cada vista en 390 px, más autenticación/permiso y recuperación.

## Estados

- `normal`: fixture representativo con varios grupos, carrera, participantes, apuestas y cifras extremas;
- `empty`: workspace válido con colecciones operativas vacías;
- `offline`: navegador sin red y banner explícito;
- `loading`: splash/boot del shell, cubierto por el contrato de arranque;
- `error`: errores de consola/pageerror convierten la iteración en FAIL;
- `permission`: acceso local no enrolado debe denegarse sin destruir datos;
- `recovery`: `recovery.html` se renderiza como superficie independiente.

Los fixtures fuerzan nombres largos, dos grupos simultáneos, importes grandes positivos/negativos y una jornada representativa. No utilizan teléfonos, IDs de grupos reales ni saldo productivo.

## Detectores automáticos

`qa/support/hipico-layout-detector-v105.mjs` bloquea:

1. overflow horizontal del documento;
2. elementos fuera del viewport cuando no pertenecen a un owner de scroll explícito;
3. icono y texto físicamente solapados dentro del mismo botón;
4. targets táctiles menores de 44 px en geometrías touch;
5. botones visibles sin marcador de workflow (`data-action`, `data-view`, `data-tab` o submit real);
6. IDs DOM duplicados.

El archivo `qa/fixtures/hipico-v105-broken-overflow.html` está roto deliberadamente. El test sólo pasa si el detector encuentra el overflow, target pequeño, solapamiento y botón sin workflow. Así se demuestra que el gate no es un smoke que siempre devuelve verde.

## Ejecución

### Contratos rápidos

```bash
npm run test:hipico:visual-contract
```

### Navegador real Chromium

```bash
npx playwright install chromium
npm run test:browser:hipico
```

### Gate completo #105

```bash
npm run qa:hipico:visual
```

En Pull Request, el workflow `Control Hipico QA Foundation #103` agrega el job `Visual/function matrix #105` y conserva screenshots en:

```text
artifacts/qa/hipico-v105/<candidate-sha>/
```

Los artifacts de CI se retienen 30 días.

## PWA ↔ APK

La APK no mantiene una copia visual independiente como fuente de verdad. `android/hipico-control-v1130/scripts/sync-web.mjs` copia `frontend/public/hipico-control` al wrapper y compara lista de archivos + SHA-256. El job `Android wrapper parity contract` registra esa paridad.

Esto demuestra igualdad del runtime empaquetado, pero **no sustituye** instalación física, WebView, lifecycle ni permisos Android. Esa evidencia pertenece a #118/#119.

## Clasificación de findings

| Severidad | Ejemplo | Acción |
| --- | --- | --- |
| P0 | acción crítica inaccesible, pantalla inutilizable, pérdida de flujo | bloquea release |
| P1 | solapamiento, clipping, control sin workflow, navegación rota, error/offline engañoso | bloquea el scope de #105 |
| P2 | inconsistencia estética sin pérdida operativa | corregir o registrar follow-up con owner |
| P3 | mejora cosmética | backlog |

Cada finding debe registrar: vista, viewport/dispositivo, estado, SHA, pasos, actual, esperado, evidencia y owner.

## Regla de cierre

#105 sólo puede cerrarse cuando el SHA candidato tenga ejecución real. `BLOCKED` por runner/browser no equivale a PASS. Un build correcto tampoco equivale a QA visual.
