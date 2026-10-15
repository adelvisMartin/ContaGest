# ContaGest #765 — Ventas: fallar sin crear facturas ficticias

## Hallazgo y corrección

El formulario `Ventas` tenía un camino offline opcional (development o flag) que, ante rechazo o timeout de `SupabaseSyncService.createSale`, insertaba una venta `source:local` y una auditoría local sintética, incluso si el servidor ya hubiese confirmado y solo se hubiera perdido la respuesta. Una copia local **no** prueba factura, secuencia, diario ni asiento contable y puede duplicar una venta real tras un reintento.

El formulario ahora:
- exige que `createSale` resuelva una respuesta de servidor con `id` no vacío antes de actualizar Store o lista y de reiniciar el formulario;
- ante error/timeout/ID desconocido conserva el formulario y muestra advertencia visible para consultar/sincronizar Ventas antes de reintentar;
- jamás genera una factura/registro de auditoría falsos, tampoco con el fallback habilitado en desarrollo;
- tiene control `useRef` single-flight contra dos envíos simultáneos antes de que React reactive el estado `saving`;
- ya no llama `contabilizada` a un borrador; distingue confirmación del servidor de contabilización efectivamente comprobada.

## Verificación

En entorno de tests:

```sh
node --test tests/sales_no_ghost_invoice_v765.test.mjs
npm test
```

El contrato de fuente ejecuta seis regresiones estáticas: no shadow local, bloqueo de concurrencia, precedencia servidor→Store, mensaje ambiguo seguro y semántica de borrador. Además se probaron cinco casos del manejador `submit` extraído del **archivo GitHub real** con dependencias simuladas: confirmación, timeout, ID ausente, Store fallido y doble submit; **5/5 PASS**. Regresiones source sobre el blob exacto remoto: 6/6 PASS. Ninguna prueba estática o simulada se considera PG17, HTTP real, autorización, build Vite ni browser E2E.

`npm test` incorpora el test de fuente. La ejecución del monorepo completo queda **NOT_EXECUTED** mientras no se disponga de checkout/dependencias. Este incremento tiene cero cambios DB/servicios fiscales y no modifica las reglas de cálculo ni los movimientos de inventario.

## Pendientes y reversión

La respuesta de cliente con `id` no basta para probar que una venta esté cobrada, que el pago exista o que las tasas/retenciones sean correctas; validar eso con las autoridades server y QA multi-tenant, PostgreSQL17 y browser. Cuando una escritura remota pudiera haberse completado antes de timeout, la única acción segura es **reconciliar** antes de reintentar.

Rollback por revertir `SalesPage.jsx` y el test/script de regresión. No hay migración. Issue #765 permanece abierto por el POS real (caja, multi-pago, stock, fiscal/ledger, UI completa). `SOURCE_REUSE=NONE`.
