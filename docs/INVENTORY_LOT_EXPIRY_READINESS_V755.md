# #755 — Lotes próximos a vencer (consulta integrada, sin asignar stock)

Se agrega `GET /inventory/lots/expiry?asOf=AAAA-MM-DD&days=30&take=50&skip=0` en el router canónico protegido por `requireTenant` e `inventory.manage`, con `productId` opcional y `includeExpired` opcional. Lee **InventoryLot** existente de PostgreSQL con predicado `tenantId`, solo `active=true`, `expiresAt` no nulo y menor/igual que el horizonte UTC; paginación y orden por `expiresAt/receivedAt/id`. No lee ni modifica costo/stock/movements.

Clasificador puro informa `EXPIRED/EXPIRING/OUTSIDE_WINDOW/UNKNOWN_EXPIRY`, pero la ruta trae solo lotes fechados dentro del intervalo requerido. La disponibilidad, almacén, lote utilizable, FEFO de #1174, movimiento y autorización de allocation **no se infieren**: no existe InventoryLocation canónica ni balance por lote+ubicación.

Limitaciones: para una consulta con `includeExpired`, lotes muy antiguos pueden ocupar la primera página; usar filtros posteriores y paginar; no confundir esta lista con propuesta FEFO final. Faltan materializar warehouse/bin, transferencias, balances derivados, FK multi-tenant, reservas por lote e integración #754, QA PostgreSQL17 A/B y E2E. No deshabilitar checks; #755 continúa OPEN/PARTIAL.
