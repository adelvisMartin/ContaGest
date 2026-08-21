# QA REPORT — Bridge v1.4.0

## Defectos corregidos

- El runtime instalado v1.3.3 funcionaba en `local-only` y no enviaba eventos al backend.
- El nombre LAB quedó serializado como `Control hÃ­pico lab`, por lo que WhatsApp no encontraba el chat.
- Se acumularon mirrors LAB sin entregar mientras el spool cloud permanecía en cero.
- El launcher raíz seguía invocando el puente anterior/deprecado.
- La consola repetía el mismo health cada 15 segundos.

## Controles v1.4.0

- modo producción estricto y separado de `shadow-local`;
- token DPAPI reutilizable sin portapapeles ni impresión;
- UTF-8 sin BOM y reparación compatible de mojibake;
- preflight autenticado contra persistencia;
- health local con razones de degradación;
- circuit breaker, retry/backoff, spool y dead-letter;
- fuente oficial sin ruta de envío;
- LAB exacto con tags anti-duplicado/anti-loop;
- journal pseudonimizado y reporte sin muestras por defecto;
- diagnósticos DOM sin texto de chats y screenshots desactivados por defecto.

## Gate

`npm run check`, `npm test`, `npm run selftest`, el conjunto Hipico del
monorepo y el smoke browser deben pasar. El Bridge solo puede informarse listo
cuando `/api/v1/hipico-bot/bridge/health` responde `ready=true`, el grupo
fuente está activo y las tres colas reportan cero pendientes.
