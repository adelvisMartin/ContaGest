# ContaGest VE — baseline de accesibilidad WCAG 2.2 AA

Issue: #99

## Alcance y afirmación permitida

Este gate produce **evidencia de QA**, no una certificación jurídica ni una declaración de conformidad total. WCAG 2.2 AA requiere combinación de automatización y revisión humana; un resultado automático sin findings no sustituye NVDA/VoiceOver, zoom real del navegador, keyboard-only E2E ni inspección visual del foco.

La fuente canónica de rutas es `qa/support/module-visual-catalog.mjs`. El harness no duplica una lista histórica: recorre `MODULE_VISUAL_CATALOG`, por lo que nuevas rutas entran automáticamente al baseline.

## Arquitectura del gate

```text
MODULE_VISUAL_CATALOG
        ↓
route × viewport × theme
        ↓
route real + sesión QA sintética
        ↓
automated DOM/ARIA semantics
+ keyboard/focus
+ representative component check
+ reduced motion
+ zoom 200% proxy en rutas críticas
+ contraste existente v15
        ↓
PASS | FAIL | BLOCKED | NOT_EXECUTED
        ↓
artifacts/qa/accessibility-v99/report.json
```

### Matriz CI

Por defecto se ejecutan todas las rutas en:

- desktop 1440×900 light;
- mobile 390×844 dark.

La matriz `full` añade:

- desktop 1440×900 dark;
- tablet 768×1024 light.

Los contextos reservados para `full` aparecen como `NOT_EXECUTED` en el artifact de CI normal, en vez de desaparecer silenciosamente.

## Reglas automáticas

El harness `qa/support/accessibility-harness-v99.mjs` comprueba, entre otros:

- nombre accesible de controles interactivos;
- labels/nombre de inputs, selects y textareas;
- asociación de errores mediante `aria-describedby` cuando `aria-invalid=true`;
- referencias ARIA a IDs existentes;
- IDs duplicados;
- `alt` presente en imágenes;
- focusables dentro de `aria-hidden=true`;
- encabezados semánticos de tablas visibles;
- `tabindex` positivo;
- operabilidad básica Tab/Shift+Tab;
- indicios de keyboard trap;
- foco fuera de viewport u oscurecido por overlays;
- target mínimo WCAG 2.2 (24px) y advisory ContaGest (44px táctil);
- `prefers-reduced-motion`;
- proxy automatizado de zoom 200% en rutas críticas;
- presencia del componente crítico representativo en rutas data-heavy.

El contraste continúa validándose con el gate existente `qa/contrast-v15.spec.mjs`, evitando mantener dos implementaciones distintas del mismo cálculo en producción QA.

## Severidad

| Severidad | Política |
|---|---|
| `critical` | falla el gate; no se puede omitir sin waiver válido |
| `serious` | falla el gate; no se puede omitir sin waiver válido |
| `moderate` | se registra para corrección/priorización; no bloquea por sí sola |
| `minor` | informativa |

Un finding `critical`/`serious` **nuevo** falla. No se permite convertir un fallo en PASS borrando el test o relajando la regla sin evidencia.

## Waivers

Archivo: `qa/accessibility-waivers-v99.json`.

El estado inicial es `[]`. No se crean exenciones ficticias.

Un waiver sólo es válido si incluye, como mínimo:

```json
{
  "route": "ruta-exacta",
  "rule": "regla-exacta",
  "selector": "selector-exacto",
  "owner": "responsable",
  "justification": "por qué no puede corregirse ahora",
  "reviewAfter": "2026-09-30T00:00:00Z",
  "issue": 123
}
```

`reviewAfter` debe estar en el futuro. El harness no considera válido un waiver sin owner, justificación o fecha de revisión. Para findings de seguridad, dinero, tenant isolation o bloqueo funcional, la accesibilidad no debe usarse como mecanismo para ocultar el riesgo principal.

## Estados del reporte

- `PASS`: ruta/contexto ejecutado sin finding bloqueante.
- `FAIL`: ejecución real con finding `critical`/`serious` no waived o error de página.
- `BLOCKED`: no pudo obtenerse evidencia fiable (por ejemplo, no montó la ruta o no renderizó el componente representativo requerido).
- `NOT_EXECUTED`: combinación conocida pero deliberadamente fuera de la matriz actual, por ejemplo un contexto `full` durante CI normal.

Nunca convertir `BLOCKED` o `NOT_EXECUTED` en PASS.

## Datos y privacidad

La suite usa tenant/usuario sintéticos (`qa-tenant`, `qa-admin`) y respuestas mock. Está prohibido capturar PII/PHI de clientes reales en screenshots, traces o artifacts. Los fixtures de un tenant no se reutilizan para simular otro tenant.

## QA manual obligatorio

Para una release candidata, registrar al menos una muestra crítica en Windows + NVDA (o lector aprobado equivalente) y una muestra móvil táctil.

### Keyboard-only

- Tab y Shift+Tab mantienen un orden comprensible.
- Enter/Space activan el control esperado.
- Escape cierra dialog/drawer cuando corresponde.
- ningún flujo deja al usuario atrapado;
- al cerrar modal/drawer, el foco vuelve al trigger lógico;
- el foco visible no queda debajo de header/footer/sticky UI.

### Formularios

- label visible y nombre accesible coinciden razonablemente;
- required/invalid no dependen sólo de color;
- errores se anuncian y se asocian al campo;
- mensajes de éxito/error importantes usan semántica anunciable (`role=status`, `role=alert` o equivalente cuando aplica).

### Dialogs/drawers

- nombre accesible;
- foco inicial razonable;
- trap sólo dentro del modal mientras está abierto;
- Escape según contrato;
- restore focus al trigger.

### Tables/grids

- headers y relaciones fila/columna comprensibles;
- sorting/filtering accesibles por teclado;
- estado de orden se comunica (`aria-sort` o equivalente);
- acciones por fila tienen nombre único/contextual.

### Zoom / reflow

- navegador al 200%: no se pierde contenido ni función;
- 320 CSS px cuando aplique: no aparece scroll bidimensional para contenido que debe reflow;
- text spacing: no se recortan labels/botones/errores.

### Mobile/touch

- targets críticos cómodos; contrato ContaGest 44px salvo excepción documentada;
- no existe operación esencial sólo por hover;
- orientación/reflow no ocultan acciones.

### Motion

- con `prefers-reduced-motion: reduce` no hay movimiento esencial prolongado ni animaciones que impidan operar.

## Rutas prioritarias

La matriz completa siempre se recorre. Para revisión manual y defectos críticos se prioriza:

1. login y shell/navigation;
2. ventas/compras;
3. contabilidad, libro mayor, estados y cierre;
4. bancos;
5. inventario/kardex/importación;
6. formularios y dialogs CRUD;
7. tablas/grids;
8. verticales sensibles.

## Casos negativos del harness

`qa/accessibility-wcag22-v99.spec.mjs` contiene fixtures deliberadamente rotos para demostrar que el gate detecta:

- botón sin nombre accesible;
- input sin label;
- ID duplicado;
- focusable dentro de `aria-hidden`;
- keyboard trap;
- foco oscurecido por overlay;
- contraste AA insuficiente.

## Ejecución

```bash
npm ci
npx playwright install --with-deps chromium
npm run test:browser:a11y
npm run test:browser:contrast
```

Para matriz ampliada en Linux/CI:

```bash
CG_A11Y_MATRIX=full npm run test:browser:a11y
```

Artifacts:

```text
artifacts/qa/accessibility-v99/report.json
artifacts/qa/accessibility-v99/summary.md
playwright-report/
test-results/
```

## Criterio para convertirlo en required check

#97 puede convertir `Accessibility WCAG22 / wcag22-aa` en required únicamente después de observar estabilidad suficiente del runner y del propio gate. Un outage de infraestructura se registra como `BLOCKED`; no se elimina permanentemente la regla para acelerar un merge.

## Limitaciones conocidas

- el proxy automatizado de zoom usa CSS zoom para detectar clipping/reflow obvio; el zoom real 200% sigue siendo manual;
- no se afirma compatibilidad con todos los lectores de pantalla;
- las respuestas API genéricas son sintéticas; para rutas donde un componente crítico no llega a renderizar el estado es `BLOCKED`, no PASS;
- el gate automático no sustituye revisión cognitiva de textos, orden lógico complejo ni calidad de anuncios del lector de pantalla.
