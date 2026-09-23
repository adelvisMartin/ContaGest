# 34/51 · GYM — Biblioteca avanzada de ejercicios

## Objetivo

Convertir `GymExercise` en la biblioteca persistente y reutilizable del tenant para que las rutinas dejen de depender sólo del catálogo estático del frontend.

## Autoridad

No se crea una segunda entidad de ejercicios.

La autoridad sigue siendo:

`GymExercise`

con los campos ya existentes:

- nombre;
- categoría;
- grupo muscular;
- equipo;
- instrucciones;
- media URL;
- series por defecto;
- repeticiones por defecto;
- activo/archivado.

El catálogo `FITNESS_EXERCISES` permanece como fallback integrado para tenants que todavía no tienen biblioteca persistida.

## Backend

### GET /gym/exercises

Tenant-scoped y con filtros:

- `q`;
- `muscleGroup`;
- `equipment`;
- `category`;
- `active`.

### POST /gym/exercises

Crea un ejercicio en el tenant activo.

Evita nombres duplicados dentro del tenant y devuelve conflicto explícito.

### PATCH /gym/exercises/:id

Actualiza sólo un ejercicio perteneciente al tenant activo.

Permite:

- edición de metadatos;
- archivo lógico con `active=false`;
- reactivación.

No elimina ejercicios que puedan estar referenciados por rutinas históricas.

## Frontend

`ExerciseLibraryPanel.jsx` añade:

- búsqueda;
- filtro por grupo muscular;
- filtro por equipo;
- filtro por categoría;
- filtro por estado;
- alta;
- edición;
- archivar;
- reactivar;
- loading;
- error;
- retry;
- empty state.

No usa lifecycle DOM imperativo.

## Integración con RoutineBuilder

`RoutineBuilder` recibe `catalog`.

Cuando el ejercicio proviene de `GymExercise`:

- conserva `exerciseId`;
- aplica nombre/grupo/equipo/instrucciones;
- aplica `defaultSets`;
- aplica `defaultReps`.

Los ejercicios persistidos tienen prioridad sobre un ejercicio estático con el mismo nombre.

### Hardening posterior al merge

Los filtros de la biblioteca son únicamente una **vista administrativa**. No reemplazan el catálogo activo que consume `RoutineBuilder`: después de crear, editar, archivar o reactivar se ejecuta una sincronización canónica separada con `active=true`.

El alta también cierra la carrera entre la comprobación previa y el INSERT mediante `ON CONFLICT ("tenantId","name") DO NOTHING`; un conflicto concurrente conserva la semántica HTTP 409.

Los ejercicios estáticos siguen disponibles como fallback y, al guardarse en una rutina sin `exerciseId`, el backend reutiliza/crea `GymExercise` mediante la autoridad existente.

## Límites

34/51 no implementa todavía:

- calendario semanal (35);
- modos de entrenamiento (36);
- técnicas de intensidad (37);
- progresión (38);
- periodización (39);
- sesiones ejecutadas (40).

## QA

- contrato dedicado `erp_ui_gym_exercise_library_34_51.test.mjs`;
- Wave A exige un único owner de biblioteca;
- prohíbe DOM imperativo;
- exige endpoints tenant-scoped;
- exige que RoutineBuilder conserve IDs y defaults persistidos.

Build/browser/typecheck se acreditan sólo mediante ejecución real del SHA exacto.
