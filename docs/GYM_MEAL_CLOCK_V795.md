# #795 — Hora local de comida válida antes de PostgreSQL

El esquema de `nutritionMealSchema.plannedAt` aceptaba cualquier string y el POST del plan pasaba esa cadena a `GymMeal.plannedAt::time`. Una hora de formato local incorrecta (`24:30`, `9 PM`, timestamp con zona, minutos 60, etc.) se rechazaba tardíamente como error SQL. Se añade validación de reloj de 24 horas `HH:mm` o `HH:mm:ss` antes de abrir la transacción de escritura. La cadena vacía sigue representando hora no programada (se persiste NULL) y null/undefined continúan permitidos por Zod.

No introduce zona horaria por usuario, plan clínico ni reglas nutricionales médicas; el reloj representa hora local del plan sin ubicación horaria. El GET y las integraciones de otra ventana permanecen intactos.

Tests: `node --test tests/gym_meal_clock_v795.test.mjs`. PostgreSQL17, Zod real/API/UX y CI siguen sin verificación integral. Parent #795 OPEN/PARTIAL. Rollback revert de 3 archivos sin DDL. SOURCE_REUSE=NONE.
