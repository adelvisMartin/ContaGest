# 29/51 · Veterinaria — inventario clínico canónico

## Objetivo

Incorporar lote, vencimiento, mínimos, reorden y consumo derivado del acto clínico **sin crear un segundo inventario**.

La autoridad permanece en el core:

- `Product.stock` / `Product.reserved` / `Product.minStock`;
- `InventoryMovement` como ledger operacional de existencias;
- `InventoryLot` únicamente como metadata canónica de lote/vencimiento;
- `CarePrescription` como evidencia clínica que origina un consumo.

## Refactor de autoridad

El cálculo de efecto de inventario ya existía dentro de `inventory.routes.ts`.

29/51 lo extrae a:

`backend/src/shared/services/inventory-movement.service.ts`

El router de inventario y Veterinaria comparten ahora:

- `lockInventoryProduct`;
- `applyInventoryStandardEffect`;
- `lockInventoryLot`;
- `inventoryLotBalance`.

Así, una salida clínica no implementa una segunda fórmula de stock.

## Lotes

`InventoryLot` contiene:

- tenant;
- producto;
- número de lote;
- vencimiento;
- fecha de recepción;
- notas;
- estado activo.

**No contiene stock.**

El saldo de lote se deriva de `InventoryMovement`:

- `in` suma;
- `out` resta;
- `adjustment` aplica su delta;
- reserva/liberación no alteran el saldo físico de lote.

La migración añade `lotId` opcional a `InventoryMovement`.

## Recepción inicial

`POST /clinical-inventory/lots` requiere `inventory.manage`.

La operación:

1. bloquea el producto canónico;
2. crea metadata del lote;
3. cuando existe cantidad inicial, aplica el mismo efecto `in` del core;
4. crea `InventoryMovement(type=in, lotId=...)`.

Un reintento del alta del mismo tenant/producto/número de lote no repite la recepción inicial.

## Mínimos y reorden

No se crea un mínimo clínico paralelo.

La UI utiliza:

- `Product.minStock`;
- `Product.stock - Product.reserved`.

`reorder=true` cuando el disponible es menor o igual al mínimo canónico.

## Consumo derivado del acto clínico

`POST /clinical-inventory/consume` exige:

- prescripción activa;
- prescripción vinculada a `Product`;
- lote explícito del mismo producto;
- cantidad positiva;
- `clinicalActId` UUID.

El servidor:

1. toma advisory lock por tenant + acto;
2. devuelve el movimiento existente si el acto ya fue registrado;
3. valida la prescripción y mascota;
4. bloquea producto y lote;
5. rechaza lote vencido;
6. calcula saldo del lote desde movimientos;
7. rechaza saldo insuficiente de lote;
8. aplica `out` mediante el servicio canónico;
9. crea `InventoryMovement` con:
   - `source='veterinary-prescription'`;
   - `sourceId='<prescriptionId>:<clinicalActId>'`;
   - `lotId`.

No se selecciona automáticamente dosis ni lote.

## Reversos

El reverso del core conserva `lotId`.

Antes de reversar un movimiento que reduciría un lote, el core comprueba el saldo derivado del lote. No se permite un reverso que deje el lote negativo.

## Vencimiento

Un lote con `expiresAt < CURRENT_DAY` no puede consumirse.

La UI:

- identifica lotes vencidos;
- los deshabilita para consumo;
- muestra fecha de vencimiento y saldo derivado.

## Trazabilidad

`GET /clinical-inventory/consumptions?patientId=...` enlaza:

`InventoryMovement → CarePrescription → CarePatient → Product → InventoryLot`.

La historia muestra:

- medicamento;
- producto;
- lote;
- cantidad;
- timestamp.

La traza no duplica el movimiento; se reconstruye desde la autoridad canónica.

## Seguridad

Todos los endpoints de inventario clínico requieren:

- `health.manage` por el router veterinario;
- `inventory.manage` por endpoint.

Además:

- tenant en producto/lote/prescripción/paciente;
- RLS habilitado para `InventoryLot`;
- acceso directo revocado a roles cliente;
- consumo idempotente por índice parcial `InventoryMovement_vet_clinical_act_unique`.

## UI

`VeterinaryClinicalInventoryPanel.jsx` es el único owner visual.

Incluye:

- loading / error / retry / empty / success;
- mínimos y estado de reorden;
- alta de lote y recepción inicial;
- vencimiento;
- selector explícito prescripción → lote;
- consumo;
- historial de consumos.

Si falta `inventory.manage`, la superficie informa el bloqueo sin afectar historia/prescripción clínica.

## Límites

29/51 no:

- recomienda una dosis;
- selecciona automáticamente lote;
- crea otro campo de stock por lote;
- sustituye `InventoryMovement`;
- altera reglas contables/fiscales.

## QA

- `tests/erp_ui_veterinary_clinical_inventory_29_51.test.mjs`;
- Wave A comprueba owner único, frontera de inventario, lotes, reversos y ausencia de automatismos clínicos;
- build, Prisma validate, PostgreSQL y browser sólo se consideran PASS con ejecución real del SHA candidato.
