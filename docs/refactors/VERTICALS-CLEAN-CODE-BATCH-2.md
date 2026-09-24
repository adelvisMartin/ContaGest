# Verticales · Clean Code batch 2

## Alcance

Refactor behavior-preserving de las implementaciones ya integradas:

- Veterinaria 26–32;
- Gimnasio 33–47.

No agrega endpoints ni cambia contratos HTTP, RBAC, tenant isolation, transacciones, queries o persistencia.

## Causa

Los módulos de rutas habían crecido hasta aproximadamente:

- `veterinary.routes.ts`: ~2.000 líneas;
- `gym.routes.ts`: ~2.000 líneas.

Además de handlers y persistencia, ambos eran propietarios de decenas de schemas Zod. Esa mezcla elevaba acoplamiento y hacía más riesgoso modificar una regla sin afectar otras implementaciones.

## Cambio

### Gimnasio

Se crea `gym.schemas.ts` como autoridad única de validación de requests para miembros, rutinas, progresión, periodización, sesiones, nutrición y clases.

`gym.routes.ts` conserva:

- Express/router;
- RBAC;
- tenant context;
- Prisma/SQL;
- transacciones;
- analytics y snapshots;
- respuesta HTTP.

### Veterinaria

Se crea `veterinary.schemas.ts` para laboratorio, hospitalización, treatment sheet, medicación, inventario clínico, finanzas, portal y boarding.

Se preservan deliberadamente los límites veterinarios `optionalText max(4000)` y `optionalDate max(50)`; no se sustituyen por los helpers compartidos con límites diferentes.

## Invariantes

- no cambia ningún path público;
- no cambia ningún nombre de request field;
- no cambia autorización;
- no cambia SQL;
- no cambia atomicidad;
- los archivos de schemas no importan Prisma ni Express;
- los route modules importan sólo schemas usados por handlers.

## Validación

Regresión dedicada: `tests/verticals_schema_authority_batch2.test.mjs`.

Runtime/typecheck/build/DB/browser se acreditan sólo cuando el SHA exacto ejecute los comandos correspondientes.
