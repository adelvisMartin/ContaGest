# #789 — Serialización de nombres de ejercicios por tenant

El API ya validaba duplicados comparando `lower(name)` antes de crear o renombrar un ejercicio. Dos solicitudes simultáneas con la misma identidad pero distinta capitalización podían superar esa lectura inicial. Este incremento envuelve comprobación y escritura de **ambas operaciones** en la misma transacción Prisma, obteniendo un bloqueo advisory `pg_advisory_xact_lock` por tenant y nombre normalizado. Devuelve 409 cuando el nombre ya existe y conserva las restricciones tenant de consulta, UPDATE e INSERT.

El candado limita escritores **que usan estas mismas rutas**, no sustituye el índice funcional único `tenantId + lower(name)` que debe validarse/aprobarse con migración y PostgreSQL17 multi-sesión; otras importaciones/consolas no participan automáticamente del candado. No cambia ejercicios ni rutinas históricas, ni publica versiones.

Pruebas focalizadas: `node --test tests/gym_exercise_name_race_v789.test.mjs`. PG17 last-name race, QA/API, browser, build y CI remoto NO ejecutados. #789 OPEN/PARTIAL. SOURCE_REUSE=NONE. Rollback revert sin migración.
