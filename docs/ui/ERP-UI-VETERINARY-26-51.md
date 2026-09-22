# 26/51 · Veterinaria — laboratorio completo

## Objetivo

Completar el lifecycle de laboratorio para que las pruebas ordenadas, resultados, rangos, flags y estado de la orden representen el trabajo real sin duplicar filas ni cerrar órdenes antes de tiempo.

## Problema corregido

Al crear una orden, ContaGest ya insertaba una fila `CareLabResult` placeholder por prueba. Sin embargo, capturar un resultado insertaba una segunda fila y marcaba la orden `completed` con el primer resultado.

Esto producía:

- duplicación de pruebas;
- conteos/resultados inconsistentes;
- órdenes completas con pruebas aún pendientes;
- verificador editable libremente desde cliente.

## Backend

### Captura sobre prueba ordenada

`POST /lab-results` acepta `resultId` opcional.

Con `resultId`:

- bloquea la orden con `FOR UPDATE`;
- rechaza órdenes `cancelled` o `completed`;
- bloquea también la fila placeholder pendiente;
- actualiza sólo valor/flag/fecha/verificador/notas/adjunto;
- **no reescribe** nombre, código, categoría, unidad ni rangos ordenados desde el cliente;
- rechaza IDs fuera de la orden y un segundo write concurrente sobre la misma prueba.

Sin `resultId`, conserva compatibilidad para resultados ad hoc mediante INSERT.

### Validación

El resultado exige al menos uno de:

- `valueNumeric`;
- `valueText`.

Si existen mínimo y máximo de referencia, se valida `min <= max`.

### Flags

Para resultados numéricos con rango:

- menor al mínimo → `low`;
- mayor al máximo → `high`;
- dentro del rango → `normal`.

Un resultado puramente textual no se marca automáticamente como anormal: sin una regla tipada de referencia eso sería una inferencia clínica no sustentada, por lo que permanece `normal`.

El cliente no expone un selector de bandera normal/high/low.

### Lifecycle de orden

Después de guardar:

- cuenta pruebas con `valueNumeric IS NULL` y `valueText` vacío;
- si quedan pendientes → `processing`;
- si no quedan → `completed`.

La tabla ya soporta estos estados.

### Autoridad y tenant

Al crear orden:

- mascota debe pertenecer al tenant;
- profesional debe pertenecer al tenant;
- encuentro, si se vincula, debe pertenecer al mismo tenant y paciente.

`verifiedBy` se deriva de `ctx(req).email || ctx(req).userId`; no existe como campo aceptado por el schema del resultado. `flag` tampoco se acepta desde cliente: se deriva del valor/rango en servidor.

La orden y sus filas placeholder se crean dentro de una única transacción: no puede persistir una orden incompleta si falla la creación de una prueba.

## UI

La captura selecciona una **Prueba ordenada** del pedido y presenta:

- testCode;
- nombre;
- categoría;
- unidad;
- referencia mínima;
- referencia máxima;
- referencia textual.

Esos metadatos son sólo lectura en UI y vuelven a validarse desde la fila ordenada en servidor; no son autoridad del request.

Los placeholders aún no informados muestran estado **Pendiente** en vez de aparentar una bandera clínica `normal`.

La acción cambia a **Completa** cuando el pedido ya está finalizado.

## QA

- `erp_ui_veterinary_lab_lifecycle_26_51.test.mjs`;
- Wave A exige `availableLabTests`, `resultId`, referencias y selección de prueba ordenada;
- el cliente no puede reintroducir un override visual de flag;
- el gate verifica además estados terminales, metadata server-authoritative, joins tenant-safe y ausencia de override de verificador/flag;
- browser/runtime sólo cuentan con ejecución real del SHA.
