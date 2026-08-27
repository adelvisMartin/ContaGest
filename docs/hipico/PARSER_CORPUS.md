# Control Hípico — Parser Corpus (#109)

El corpus versionado vive en `backend/src/modules/hipico-bot/corpus/hipico-parser-corpus.v1.json` y se ejecuta offline con `npm --workspace backend run test:hipico`.

## Contrato

Cada fixture tiene `id`, texto sanitizado y `expected.intent`; puede declarar entidades parciales y `review:true`. El archivo declara `schemaVersion`, `parserVersion` y `sanitized`.

Todo bug de parseo nuevo debe reproducirse primero como fixture. Luego se cambia la gramática. No se corrige una regex sin una regresión que pruebe el caso histórico.

## Cobertura inicial

Incluye `2p`, `1y2`, `1p`, `2n`, `10a8`, K, importes venezolanos con miles/decimales, TERCIOS/Pizarra placeholder, settlement firmado, balances positivos/negativos/cero, llegada, cierre de carrera, cierre de jornada, confirmación corta, conversación y contenido monetario/corrección que debe quedar tras review gate.

## Métricas

`hipico-parser-corpus.test.ts` calcula TP/FP/FN, precision y recall por intención y publica la matriz como salida del test. El gate golden exige 1.0 para este corpus conocido. Añadir casos más difíciles puede introducir thresholds explícitos por intención, pero nunca ocultar mismatch bajo un porcentaje global.

## Versionado

Cambiar la estructura de fixtures exige incrementar `schemaVersion`. Cambiar reglas del classifier que alteren outputs históricos exige nuevo `parserVersion` y revisión del diff expected-vs-actual. Reprocesar con una versión nueva no debe reescribir predicciones históricas ya persistidas; esa inmutabilidad se refuerza en #111.

## Privacidad

No se requieren números telefónicos, IDs `@g.us`, nombres legales ni secretos para probar la gramática. Los nombres operativos del corpus sólo se conservan cuando aportan estructura lingüística; los futuros fixtures deben sanitizar PII innecesaria.
