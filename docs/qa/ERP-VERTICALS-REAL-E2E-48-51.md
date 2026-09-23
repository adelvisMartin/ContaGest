# 48/51 · QA — E2E real multi-vertical con PostgreSQL efímero

## Objetivo

Demostrar sobre PostgreSQL real, no mocks, que Odontología, Veterinaria y Gimnasio conservan sus contratos críticos después de las implementaciones 10–47.

## Harness

Se reutiliza `qa/support/real-backend-harness.ts`:

- `createApp()` real en puerto aleatorio;
- Prisma real;
- JWT real del administrador QA sembrado;
- sin `ALLOW_DEV_TENANT_HEADER`;
- sin fallback Supabase auth;
- requests HTTP a `/api/v1/*`.

El workflow `erp-verticals-real-e2e-v4851.yml` crea PostgreSQL 17 efímero, ejecuta prerequisitos Supabase, aplica el historial canónico de migraciones, verifica migrate status, ejecuta seed y typecheck.

## Flujos cubiertos

### Odontología

1. crear paciente humano;
2. crear encuentro odontológico firmado;
3. leer historia;
4. enmendar la versión;
5. comprobar nueva versión firmada;
6. comprobar que la versión anterior queda `amended` y mantiene su snapshot clínico.

### Veterinaria

1. crear mascota usando `CarePatient kind=animal`;
2. crear hospitalización;
3. cambiar estado mediante la transición canónica;
4. releer y demostrar persistencia.

### Gimnasio

1. crear miembro;
2. crear evaluación corporal;
3. releer miembro/evaluación;
4. validar BMI derivado;
5. revalidar tenant del miembro/entrenador antes de insertar evaluación.

## Persistencia tras restart

El test detiene el servidor Express y crea un nuevo harness sobre la misma base temporal. Después vuelve a leer:

- versión odontológica nueva;
- hospitalización veterinaria;
- evaluación de gimnasio.

Esto distingue persistencia PostgreSQL de estado en memoria.

## Permisos

Un usuario autenticado sin roles no recibe privilegios durante el test y debe obtener 403 en los tres verticales.

## Tenant isolation

Se crean fixtures exclusivamente en un tenant secundario y se intenta referenciarlos desde el token del tenant QA principal.

Debe fallar:

- encuentro odontológico con paciente externo;
- hospitalización con mascota externa;
- evaluación de gimnasio con miembro externo.

## Error paths

El gate prueba payload inválido o relaciones inexistentes en los tres verticales.

## Cleanup fail-closed

`t.after` elimina los fixtures creados.

El workflow inspecciona después:

- pacientes cuyo nombre empieza `V48-`;
- miembros cuyo código empieza `V48-`.

Ambos conteos deben ser cero. El paso falla si quedan residuos.

## Evidencia

El artifact incluye:

- SHA esperado y SHA real;
- prerequisitos de DB;
- migraciones/status;
- log E2E;
- versión PostgreSQL;
- inventario de cleanup.

El nombre del artifact contiene el SHA candidato.

## Estado de evidencia

El código de QA puede considerarse implementado mediante contratos fuente. El E2E sólo es VERIFIED cuando el workflow del SHA exacto ejecuta steps reales y finaliza satisfactoriamente. Un job sin runner/steps se reporta BLOCKED_INFRASTRUCTURE.
