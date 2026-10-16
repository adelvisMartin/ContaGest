# #756 — Identidad única por producto en candidatos de reposición

El catálogo de reposición se pagina por producto activo. Si dos filas de la misma página declaran el mismo `productId`, no debe emitirse dos veces la misma recomendación ni repetirse un identificador para consultar agregados comerciales. Aunque la consulta canónica por productos debería devolver identidades únicas, los proyectores puros también deben rechazar entradas anómalas.

## Contrato

`inspectReorderStockRows` mantiene un conjunto de identificaciones por página. Si `productId` está ausente o son inválidos otros campos, mantiene `REORDER_INVALID_PRODUCT`. Cuando encuentra una segunda instancia de la misma identidad, lanza `TypeError('REORDER_DUPLICATE_PRODUCT')` para abortar la página completa; no se retorna una lista parcial de candidatos ni identificadores de evidencia comercial. Aplica aunque las dos filas tengan saldos distintos y una de ellas estuviera segregada como `stockExceptions`. No compara por SKU (SKU puede variar de formato): se valida la identificación canónica.

`prepareReorderStockPage` utiliza este mismo validador, y el router actual convierte los errores de preflight a conflicto `HTTP 409 REORDER_STOCK_PROJECTION_CONFLICT` dentro de la transacción y antes de consultar las ventas opcionales. Se conservan los campos de respuesta, permisos `reports.view`, tenant de contexto, paginación y `RepeatableRead`. No hay SQL adicional, cambios del modelo, migraciones, mutaciones, compras ni cálculos de costos.

## QA y limitaciones

Se incorporan cinco pruebas al archivo `tests/reorder_duplicate_product_v756.test.mjs` y al comando `backend/package.json > test:reports`. Verifican identidades duplicadas normales y con excepción, distintos productos válidos, la visibilidad de una única excepción y catálogo vacío.

Esta edición se realizó directamente mediante archivos GitHub. **NOT_EXECUTED**: test runner completo y las cinco pruebas nuevas en el checkout original, `npm ci`, backend build/typecheck integral, HTTP tenant A/B, PostgreSQL17, navegador/E2E y checks de GitHub que no hayan terminado. No se declara PASS para estas pruebas pendientes. Se verifica el código por lectura y comparación de blobs; esto no sustituye un test de runtime.

## Backlog y reversión

Incremento parcial de #756; siguen pendientes policies persistentes por ubicación, FEFO físico #755, outbox y QA. Mantener #756 abierto. Revertir el squash del PR restaura el comportamiento anterior, sin migración o datos a recuperar. No desactivar workflows ni required checks.
