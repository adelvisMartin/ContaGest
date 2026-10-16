# #787 — Protección del último cupo en reservas Gym

La ruta existente `POST /gym/classes/bookings` deja de hacer `count` y `INSERT` por separado. Obtiene la clase del **tenant autenticado** con `SELECT ... FOR UPDATE` dentro de la misma transacción Prisma, comprueba propiedad de miembro, recupera reserva previa por tenant+clase+miembro y verifica membresía activa antes de contar reservas ocupadas (`booked` + `attended`). Un registro idéntico en estado `booked` devuelve su identidad previa (HTTP 200), sin consumir otra plaza; la reserva nueva/actualizada devuelve 201.

Las solicitudes sin reserva existente no pueden inventar `attended/cancelled/no_show`; una reserva en estado final `attended/no_show` no vuelve a `booked`; una `cancelled` requiere un puesto libre antes de volver a reservar. El UPDATE por ON CONFLICT exige que el tenant del registro existente coincida con el tenant del servidor. El candado de fila de clase serializa esta ruta de escritura de último cupo (PostgreSQL READ COMMITTED); otras rutas/procesos deben respetar esta misma autoridad.

**Todavía NO implementa** una waitlist real (el enum actual no tiene `waiting`), promoción, clases recurrentes, reglas late-cancel ni idempotency key persistida para transiciones complejas. Tampoco existen pruebas reales con dos sesiones simultáneas: **#787 queda OPEN/PARTIAL** hasta PostgreSQL17 last-seat race, tenant A/B, calendario trainer/room, membership eligibility y UI browser/E2E.

Pruebas: `node --test tests/gym_class_last_seat_v787.test.mjs` (manejado real con mock de Prisma, no prueba del motor PostgreSQL). Rollback: revert 3 archivos sin migración, sin cambios financieros. SOURCE_REUSE=NONE.
