# GitHub Actions Runner Probe — #134

Este workflow existe para separar un fallo de infraestructura de un fallo de producto.

## Resultado válido

`PASS` sólo existe si GitHub asigna un runner y aparecen steps reales:

1. Checkout;
2. `RUNNER_PROBE_EXECUTED=true`;
3. Node version;
4. artifact `runner-probe-v134-<sha>`.

Si la API del job muestra `runner_id=0`, `runner_name=""` y `steps=[]`, la clasificación es **BLOCKED / NOT_EXECUTED**, aunque GitHub pinte el run como `failure`.

## Después de recuperar el runner

#134 no se cierra sólo porque este probe pase. También deben re-ejecutarse:

- `ContaGest CI / validate`;
- al menos un workflow PostgreSQL real;
- evidencia sobre el SHA final relevante.

Entonces se documenta causa raíz/recuperación y se puede promover `ContaGest CI / validate` como required check de #97.
