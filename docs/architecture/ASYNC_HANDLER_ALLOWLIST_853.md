# #853 · Allowlist de handlers asíncronos (incremento aislado)

**Scope:** registro tipado y sin efectos secundarios de las políticas de handlers. No existe un worker, dispatcher, productor habilitado ni llamada a proveedor en este incremento. La infraestructura de PostgreSQL/outbox sigue aislada y pendiente de verificación en PR #1047.

## Contrato

- Sólo el código de aplicación puede crear un registro con `createAsyncJobHandlerRegistry()`; un objeto similar inyectado desde HTTP/DB no es una autoridad aceptada (`WeakSet`).
- Cada handler requiere una clave versionada como `reports.refresh.v1`, un esquema revisado `validatePayload` y una estrategia explícita `provider-idempotency | effect-ledger | compare-and-set`. La etiqueta identifica una estrategia **declarada**, no constituye prueba de que un proveedor o handler implemente efectivamente idempotencia.
- La fábrica rechaza claves inválidas, duplicados, validadores ausentes y más de 32 descriptores. El registro y el índice de nombres devuelto son inmutables; no hay API de ejecución, carga dinámica ni descubrimiento de código almacenado.
- `assertApprovedAsyncJobHandler(registry, handlerKey, payload)` comprueba pertenencia, allowlist y aceptación exacta del esquema. Antes de ejecutar un validador, construye una **copia JSON independiente, profunda e inmutable**, con un máximo de 16 KiB UTF-8 y 12 niveles; rechaza getters/setters, ciclos, fechas/instancias, funciones, datos no JSON y arreglos dispersos. Por tanto, un validador defectuoso no modifica el objeto original del llamador. Los fallos producen un código seguro sin propagar datos o excepciones sensibles.
- Antes de conectar productores, ejecutar `prepareAsyncJobIntent()` y validar una **copia JSON canónica** del payload; así un validador no puede alterar el objeto usado para el hash o la fila persistida. Las implementaciones de handlers de efectos reales todavía requieren una prueba independiente de idempotencia y tenant/RBAC.
- No se instala un registro por defecto que habilite envíos. Un registro vacío es válido y niega todo intento de handler desconocido.

## Verificación y límites

Regresión nativa sin paquetes externos:

```bash
node --experimental-strip-types --test tests/async_handler_registry_v853.test.mjs
node --experimental-strip-types --check backend/src/modules/jobs/async-handler-registry.ts
tsc --noEmit --strict --skipLibCheck --target ES2022 --module NodeNext --moduleResolution NodeNext backend/src/modules/jobs/async-handler-registry.ts
```

Estos controles verifican un módulo **puro**. No prueban el backend completo, PostgreSQL 17, el runtime HTTP, workers ni side effects. El ticket padre #853 permanece ABIERTO; el código no debe utilizarse como autorización para el release de la cola transaccional sin cerrar los gates del PR #1047. No hay migración, configuración global, workflows, redes ni variables secretas en este cambio.

**Rollback:** revertir sólo los tres archivos nuevos de este incremento; no se requiere restaurar datos y la cola transaccional no depende todavía de ellos.
