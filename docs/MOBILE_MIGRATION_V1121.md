# ContaGest-VE · Migración móvil, formularios y seguridad v11.21

## Motivo del lote

Este lote parte del merge de PR #49 y de QA móvil real compartido por el propietario. Los defectos observados no se tratan como excepciones de Psicología o Veterinaria: se corrigen en los contratos compartidos para impedir que reaparezcan al navegar entre módulos.

Hallazgos de entrada:

- header móvil funcional pero desalineado; logo y búsqueda ocultos y tasa BCV con demasiado peso visual;
- formularios promovidos por el runtime MUI mostrando dos etiquetas (label ERP + label flotante MUI), con texto atravesando el borde en Fecha, Hora, Modalidad y Motivo de agenda;
- riesgo de overflow/solapamiento por anchos mínimos heredados en formularios, acciones y componentes MUI;
- CSS contextual de verticales podía redefinir geometría de shell después del sistema canónico;
- la API ya tenía rate limit global, autenticación y CSP, pero faltaba separar límites de mutaciones y operaciones de alto costo.

## Decisiones de migración

### 1. Un solo dueño de geometría compartida

`frontend/src/styles/erp-system.css` continúa como contrato canónico para shell, formularios, responsive, tablas y utilidades. `vertical-contexts.css` se carga mediante `layer(cg.context)` con menor prioridad. El contexto puede cambiar colores semánticos de Veterinaria, Psicología, Salud, Fitness o Comercio, pero no volver a ocultar el logo, agrandar el BCV o redefinir el grid del header.

### 2. Header móvil

En 760px o menos se conserva una sola fila centrada verticalmente:

- menú 34px;
- logo ContaGest visible 28px;
- búsqueda visible como botón compacto de 34px;
- tasa BCV reducida a un indicador máximo de 76px, sin leyenda/fuente secundaria en la fila móvil;
- actualizar BCV como icono de 30px;
- tema 34px;
- usuario 42px con avatar y chevron.

Bajo 380px se reduce otra vez la densidad y se oculta únicamente el botón manual de refresco BCV para preservar menú, logo, búsqueda, tasa, tema y cuenta.

### 3. Formularios sin etiquetas duplicadas

Los campos del kit mantienen una etiqueta ERP estática arriba. Cuando el runtime los promueve a MUI:

- el input/select fallback continúa oculto y enviando el valor al formulario;
- la etiqueta ERP vuelve a ser la única etiqueta visual;
- la etiqueta MUI queda disponible para accesibilidad pero fuera del layout visual;
- el notch/legend flotante se colapsa;
- el control conserva un solo borde.

Esto aplica globalmente a `Field`, `Textarea` y `Select`; no se añadió un parche exclusivo para Psicología.

### 4. Contrato anti-solapamiento

El sistema canónico fuerza `min-width:0`/`max-width:100%` en shells de módulo, tarjetas, formularios, controles y raíces MUI. Tablas conservan scroll horizontal propio. En móvil, page actions, section actions y row actions pueden envolver; grids de formulario pasan a una columna; textos auxiliares pueden cortar palabras largas sin empujar el documento.

### 5. Rate limits por costo

La seguridad existente se conserva: CORS allowlist, Helmet, request IDs, CSRF para cookie sessions, secret enforcement, suspicious request guard, no-store en API y rate limit de autenticación.

Se agregan dos capas:

- `mutationRateLimit`: 45 escrituras/minuto en producción (180 en desarrollo), saltando GET/HEAD/OPTIONS;
- `expensiveOperationRateLimit`: 12 solicitudes/minuto en producción (60 en desarrollo) para AI, exports, imports y reports.

Ambas se suman al `globalRateLimit`; no sustituyen RBAC, tenant isolation, validación ni límites/costos del proveedor externo. El store actual de `express-rate-limit` sigue siendo el predeterminado del proceso; para enforcement distribuido multi-instancia se requiere un store compartido o una regla equivalente en la plataforma antes de tratarlo como límite global fuerte entre todas las instancias.

## QA agregado

`qa/responsive-all-routes.spec.mjs` ahora incluye Psicología y audita 360, 390 y 430px para:

- overflow de documento;
- elementos fuera del viewport;
- intersección entre campos hermanos;
- intersección entre acciones hermanas;
- presencia/alineación del header móvil;
- BCV <= 80px, logo <= 30px y búsqueda <= 36px;
- menú de cuenta y tema;
- un solo label visual en formularios migrados de Psicología.

`tests/mobile_overlap_security_v1121.test.mjs` fija los contratos de fuente para cascade, labels, anti-overlap y rate limiting.

## Frontera de riesgo

Este lote no modifica fórmulas contables/fiscales, cálculo de inventario, cierres, RIF/tenant isolation, licencias ni permisos de módulos. El mensaje “módulo no habilitado” sigue siendo un control de acceso; no se elimina para solucionar una captura visual.

## Gate de salida

No declarar v11.21 completa hasta tener, como mínimo:

1. build de producción;
2. pruebas Node/static ejecutadas;
3. Playwright all-routes ejecutado cuando el runner esté disponible;
4. revisión de Psicología, Veterinaria, Dashboard y Configuración en 360/390/430;
5. revisión desktop 1366/1440 para confirmar que la compactación móvil no alteró la jerarquía de escritorio;
6. revisión de errores de runtime/network del preview.
