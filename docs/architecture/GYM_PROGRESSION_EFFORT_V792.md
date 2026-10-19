# Gym #792 — validación de esfuerzo realmente registrado

La ruta existente POST /gym/progression/evaluate valida la coherencia RIR/RPE de los objetivos configurados, pero hasta este incremento no comprobaba los valores **realmente registrados** dentro de performance. Esto permitía que pares físicamente contradictorios alimentaran recomendaciones de progresión.

La misma autoridad `isRirRpePairCoherent` ya existente ahora valida `value.performance.rir` y `value.performance.rpe` dentro del schema antes de llamar al motor; en caso de contradicción produce error de validación referido a `performance.rpe`. No se introduce otro algoritmo ni mutación de rutinas.

Evidencia ejecutada sobre la función exacta de GitHub: 8/8 pares de esfuerzo correctos/incorrectos comprobados en V8 y verificado el enlace de schema. El nuevo archivo de pruebas se incorpora al repositorio; suite backend PostgreSQL, navegador y flujo completo de entrenamientos aún sin ejecutar. #792 OPEN hasta integración/QA completa. Rollback del test y del guard; no migraciones ni check bypass.