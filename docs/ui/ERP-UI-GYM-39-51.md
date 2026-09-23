# 39/51 · Gimnasio · Periodización versionada

## Objetivo

Modelar programas de entrenamiento por fases/mesociclos y semanas explícitas de carga/descarga, con plantillas reutilizables y versiones inmutables, sin adelantar la ejecución sesión-a-sesión de 40/51.

## Autoridad

Se agregan dos autoridades persistentes:

- `GymPeriodizationTemplate`: estructura reutilizable por tenant;
- `GymPeriodizationProgram`: programa ligado a una `GymRoutine`.

El programa conserva `programKey` estable y `version` creciente. Una revisión **crea una nueva fila**; no actualiza ni elimina la versión anterior.

## Estructura

Cada programa/template contiene:

- fases o mesociclos ordenados;
- tipo de fase: acumulación, intensificación, realización, descarga o personalizada;
- una o más semanas por fase;
- tipo de semana: `load` o `deload`;
- objetivo relativo de volumen e intensidad;
- notas de fase y semana.

La estructura se valida server-side y se almacena como snapshot JSONB porque cada versión es inmutable y se consume como unidad.

## Plantillas

Las plantillas pertenecen al tenant y pueden cargarse en el constructor como punto de partida. Aplicar una plantilla copia su estructura al borrador; el programa persistido conserva `sourceTemplateId` como provenance.

## Versionado

- programa nuevo: `version = 1`;
- nueva revisión: mismo `programKey`, `version + 1`;
- `supersedesId` enlaza la revisión anterior;
- un advisory lock por tenant/programKey evita dos versiones con el mismo número en concurrencia;
- el historial permanece consultable.

## Seguridad / límites

- la rutina debe pertenecer al tenant activo;
- una plantilla referenciada debe pertenecer al mismo tenant;
- no existen PATCH/DELETE de versiones históricas;
- no se registran series realizadas, RIR/RPE reales, descansos reales, omitidos ni temporizador;
- 38/51 sigue siendo el dueño del motor de progresión por ejercicio;
- 40/51 será el dueño de la ejecución de sesiones.

## QA

- regresión dedicada `erp_ui_gym_periodization_39_51.test.mjs`;
- Wave A exige composición declarativa, versionado inmutable, tenant isolation y separación de 40/51;
- CI/browser/PostgreSQL sólo cuentan como PASS cuando ejecutan steps reales del SHA exacto.
