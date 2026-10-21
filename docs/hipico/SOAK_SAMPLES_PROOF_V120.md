# Hípico #120 — Evidencia del archivo real de muestras de soak

## Problema y corrección

El verificador de release v290 exigía que `evidenceIntegrity.samplesSha256` pareciera un SHA-256, pero nunca calculaba el hash del archivo `samples.jsonl` realmente producido por el runner. Bastaba declarar un resumen `PASS` y un hash sintácticamente válido sin adjuntar las muestras.

El nuevo `scripts/hipico-soak-samples-proof-v120.mjs` se conecta a `findDescriptor('soak')` **antes de devolver PASS**, usando el archivo fijo `samples.jsonl` junto a `soak-evidence.json`. Este cambio no altera el backend ni el formato del productor ya fusionado.

El verificador rechaza:

- archivo ausente, symlink, archivo no regular o mayor a **32 MiB**;
- SHA-256 real distinto al `samplesSha256` declarado;
- cantidad de líneas JSONL distinta de `summaryInput.samples`, JSON inválido o truncado;
- marcas `at` que no sean UTC canónicas, orden temporal duplicado/regresivo, o instantes fuera de `startedAt` y `completedAt`;
- campo `elapsedMs` ausente, regresivo o incoherente con tiempo real de observación;
- muestras con memoria RSS no positiva o V8 heapUsed mayor que RSS;
- saltos entre muestras y extremos del periodo incompatibles con el intervalo de política (tolerancia limitada a 2.5 veces el intervalo o 60 segundos).

Un rechazo devuelve `SOAK_SAMPLES_NOT_VERIFIED` y estado `FAIL`; **nunca promueve un resumen a PASS por ausencia de archivos**.

## Pruebas realmente ejecutadas

Node.js 22.16.0, con el helper y pruebas **idénticos byte por byte** a los blobs remotos:

```sh
node --test tests/hipico_soak_samples_proof_v120.test.mjs
node --check scripts/hipico-soak-samples-proof-v120.mjs
```

- **13/13 PASS** con un corpus sintético de 2880 muestras a cadencia de 30 segundos durante 24 horas, además de 12 alteraciones negativas: contenido/timestamp/contador, hash erróneo, archivo ausente, symlink, pérdida de continuidad, datos falsos de memoria y JSONL truncado.
- Mutación negativa eliminando la comparación criptográfica: **1 test FALLÓ como debía**, restauración del archivo exacto: **13/13 PASS**.
- El `findDescriptor` del verificador real (blob GitHub `e21341f45984e08630462af0ab29b6a329c7a1f7`) se extrajo y evaluó en V8 con dependencias simuladas: archivo no verificado => `FAIL`; archivo válido => `PASS`. Al quitar su llamada a la nueva prueba, una simulación de ausencia pasa incorrectamente, confirmando que la integración protege la decisión.
- Blobs exactos: helper `e9778636dcb335203cb2a4aa10104fa1eaf6479b` y pruebas `90a3824f980e54851036a6277d4c24e96b63406e`.

**NO EJECUTADO:** repo completo con todas las dependencias, `hipico-verify-evidence-v290.mjs` end-to-end desde filesystem de release, soak de 24–72 h con equipos reales, reinicios y medición física, SOURCE Messenger, GitHub Actions. No afirmar que un corpus sintético demuestra operación real o autenticidad externa: SHA-256 comprueba consistencia de los archivos suministrados, no que se hayan medido durante 24 horas.

## Despliegue, compatibilidad y rollback

Los resultados históricos sin `samples.jsonl` verificable deberán seguir como `FAIL/NOT_EXECUTED`, incluso si antes decían `PASS`. El runner actual crea `samples.jsonl` en el **mismo directorio** que `soak-evidence.json`, lo que permite una transición sin nueva migración. No hay cambios en DB, WhatsApp, dinero, políticas SOURCE o workflows.

**#120 permanece ABIERTO**, **#839 NO_GO** hasta campaña real y evidencia exact-SHA. No deshabilitar checks obligatorios ni convertir workflows en cola en PASS. Rollback del cambio: revertir helper/tests/docs y la importación/comprobación en verificador, sujeto a revisión de seguridad (no volver a aceptar hash autodeclarado).

## Conciliación de telemetría #120

El verificador de release coteja además cada fila de `samples.jsonl` con los acumulados del resumen. Los contadores de decisiones, pérdidas, duplicados y context leaks deben ser enteros monotónicos; las comprobaciones de health y disponibilidad de spool, el máximo tamaño y la mayor antigüedad observada deben coincidir con las muestras. Un hash SHA-256 actualizado junto con un resumen falsamente favorable ya no produce `PASS`. Esto es integridad interna de telemetría; no demuestra que una jornada física de 24 horas se haya ejecutado. #120 sigue pendiente de esas observaciones exact-SHA, reinicios y validación del operador.
