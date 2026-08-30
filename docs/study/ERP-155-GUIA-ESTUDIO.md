# Guía de estudio — ERP #155

## Idea central

Una ruta no está validada sólo porque abre. QA E2E comprueba ruta + estado + rol + viewport y conserva evidencia ligada al commit exacto.

## Términos

**E2E**: prueba el flujo de extremo a extremo como lo ve el usuario.

**Boundary**: valores límite como textos largos, cantidades grandes o listas extensas.

**Hidden mutation**: un GET, render o transición visual que cambia datos sin una acción explícita del usuario.

**Truth state**: `PASS`, `FAIL`, `BLOCKED`, `NOT_EXECUTED`.

## Matriz

58 rutas × 7 estados × 3 roles = 1.218 combinaciones lógicas. Los viewports principales son mobile 390, tablet 768 y desktop 1440.

## Qué debe observarse

Una ruta crítica debe renderizar, no lanzar errores, no crear overflow horizontal, respetar roles, mostrar estados de carga/error/offline y no ejecutar mutaciones escondidas.

## Por qué se liga a SHA

Una captura de otro commit no demuestra el estado del candidate actual. La evidencia debe identificar exactamente qué código fue probado.

## Regla de cierre

`IMPLEMENTED` significa que existe el harness. `VERIFIED` sólo existe después de ejecutar la matriz requerida y obtener evidencia real. Si Actions no obtiene runner, el estado es `BLOCKED/NOT_EXECUTED`.

## Preguntas

1. ¿Por qué abrir 58 rutas no equivale a E2E completo?
2. ¿Qué diferencia existe entre FAIL y BLOCKED?
3. ¿Por qué el rol forma parte de la matriz?
4. ¿Qué riesgo tiene un hidden mutation?
5. ¿Por qué la evidencia debe estar ligada a SHA?
