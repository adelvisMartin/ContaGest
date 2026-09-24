# Clean Code · Health/Odontología · lote 3

## Alcance

Refactor behavior-preserving del backend Health que concentra los contratos usados por las implementaciones odontológicas 11–15 y 18–20, además de los contratos clínicos compartidos que ya convivían en el mismo route module.

Baseline: `main@25c5f705df0bf6da9f5bdac85ed98bd738469d2a`.

## Problema observado

`backend/src/modules/verticals/health.routes.ts` mezclaba dos responsabilidades:

1. contratos Zod de request/clinical data;
2. orquestación HTTP, RBAC, transacciones, SQL, agenda y analytics financieros.

El archivo superaba 1.300 líneas y cada cambio de contrato obligaba a editar la misma superficie que contiene lógica operacional sensible.

## Cambio

Se crea `backend/src/modules/verticals/health.schemas.ts` como autoridad única de validación para:

- pacientes y profesionales;
- citas y patch de citas;
- odontograma y periodontograma;
- planes de tratamiento y aceptación;
- workflow clínico y enmiendas;
- preventivos veterinarios que viven en Health;
- encuentros;
- mediciones y batch de signos vitales;
- inmunizaciones.

`health.routes.ts` conserva:

- `Router` y rutas públicas;
- `requirePermission('health.manage')`;
- locks/advisory locks;
- validación de conflictos de agenda;
- transacciones Prisma;
- SQL;
- normalización de planes;
- cálculo financiero y analytics;
- persistencia y respuestas HTTP.

## Invariantes

- 20/20 route declarations permanecen;
- no cambia ningún path público;
- no cambia ningún nombre de field;
- no cambia RBAC;
- no cambia tenant scoping;
- no cambia transacción ni persistencia;
- no cambia cálculo monetario;
- `health.schemas.ts` no puede importar Prisma, Router ni middleware de permisos.

## Trazabilidad 1–58

La matriz marca como `CLEAN_CODE_BATCH_3_SCHEMA_AUTHORITY` únicamente las implementaciones directamente cubiertas por estos contratos: **11, 12, 13, 14, 15, 18, 19 y 20**.

No se marcan 10, 16 ni 17 porque sus autoridades principales viven respectivamente en UI/contexto, `health-extended.routes.ts` y media.

## Verificación

Regresión dedicada: `tests/health_schema_authority_batch3.test.mjs`.

La validación remota sólo cuenta como PASS cuando el SHA exacto ejecute runner + steps + logs reales.
