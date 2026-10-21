# Gym #787 · Aislar por tenant las relaciones del listado de clases — QA PENDIENTE

El GET `/gym/classes` filtraba c.tenantId pero hacía LEFT JOIN del entrenador y la reserva por IDs aislados, sin unir el mismo tenant. El candidato añade `t.tenantId=c.tenantId` y `b.tenantId=c.tenantId` para evitar que los nombres o conteos de otras empresas contaminen el resultado. No modifica reservas, cupos, agenda, creación ni estados de clase.

Las 5 comprobaciones de contrato del SQL de ruta publicadas en tests/gym_class_tenant_joins_v787.test.mjs pasaron con fuente exacta en V8; **NO** se ejecutaron SQL real, PG17 dos tenants, browser ni verificación RBAC. Para merge aún faltan fixtures adversariales que creen colisión de IDs entre tenants y prueben que la lista no filtra datos, incluida comprobación tenant del trainerId al crear GymClass. El reto completo #787 (booking, capacidad, waitlist, cancel/no-show, conflictos) sigue incompleto.

Rollback: revert 3 archivos sin DDL. Mantener issue OPEN; SOURCE_REUSE=NONE.