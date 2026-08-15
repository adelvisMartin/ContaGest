# ADR — Límites de producto: ContaGest ERP y Control Hípico

**Estado:** obligatorio mientras ambos productos compartan monorepo e infraestructura.  
**Fecha:** 2026-08-15.

## Decisión

**ContaGest ERP y Control Hípico son productos independientes.** Actualmente comparten el repositorio y pueden compartir infraestructura de base de datos/backend, pero no comparten objetivo de producto, navegación, release, PWA, estado de interfaz ni contrato de permisos.

Control Hípico es una herramienta personal/operativa fuera del ERP. La convivencia en este repositorio es transitoria; una futura migración de ContaGest a su propio proyecto no debe exigir rediseñar el dominio de Control Hípico.

## Fronteras obligatorias

### ContaGest ERP

- SPA principal y módulos empresariales en `frontend/src/`.
- Su navegación vive en `MODULE_CATALOG` y usa la URL canónica `/?module=<ruta>`.
- Su autenticación, RBAC, licencia, tenant y operaciones empresariales pertenecen al ERP.
- Su PWA raíz usa scope `/`.
- Sus releases/versiones no deben depender de una entrega Hípico.

### Control Hípico

- Runtime web/PWA propio bajo `frontend/public/hipico-control/`.
- URL canónica `/hipico-control/`.
- La URL heredada `/control-hipico` solo puede redirigir a `/hipico-control/`; nunca debe introducir `?module=` ni entregar una vista ERP.
- Control Hípico **no debe aparecer en `MODULE_CATALOG`**, quick-tabs, command palette, breadcrumbs ni business modes de ContaGest.
- Tiene manifest, service worker, caches, IndexedDB/outbox, UI y release propios.
- La APK/Capacitor, el bot/Bridge y las reglas de carreras, POLLA, saldos, cierres y liquidación pertenecen exclusivamente a Control Hípico.

## Base de datos compartida

La **base de datos compartida es infraestructura, no acoplamiento de producto**.

- Las tablas/colecciones Hípico deben tener ownership explícito y nombres/entidades propios.
- Una ruta o permiso ERP no concede automáticamente acceso a datos Hípico.
- Un cambio de esquema Hípico no debe modificar reglas contables/fiscales del ERP salvo una integración futura diseñada y aprobada expresamente.
- Los backups, observabilidad y conexión física pueden compartirse, pero las migraciones deben indicar qué producto poseen y conservar rollback.
- Nunca usar estado de frontend de ContaGest como autorización para Hípico ni viceversa.

## Backend compartido

Mientras exista un backend común:

- endpoints Hípico usan un namespace dedicado (`/api/v1/hipico-bot/...` o equivalente);
- endpoints ERP continúan bajo sus módulos actuales;
- middlewares comunes de seguridad pueden reutilizarse, pero no se reutilizan permisos de negocio sin una política explícita;
- webhooks/automatización Hípico tienen HMAC, deduplicación, idempotencia y promoción shadow/assist propias.

## Releases y QA

Los releases son independientes:

- `ContaGest vX.Y` no certifica Control Hípico;
- `Control Hípico vX.Y` no certifica ContaGest;
- un PR de shell/CRUD/RBAC del ERP no debe reemplazar el runtime Hípico;
- un PR de paridad APK/PWA Hípico no debe modificar `MODULE_CATALOG`, layout, temas ni formularios ERP;
- Vercel puede desplegar ambos desde el mismo artefacto mientras dure el monorepo, pero el gate QA se reporta por producto.

## PWA y caché

- ContaGest: manifest/service-worker de scope raíz.
- Hípico: `/hipico-control/manifest.webmanifest` + `/hipico-control/sw.js`, scope `/hipico-control/`.
- Ningún service worker debe apropiarse de rutas del otro producto.
- Una recuperación de cache Hípico no puede borrar IndexedDB/estado de ContaGest y viceversa.

## Regla de migración futura

Cuando ContaGest salga de este repositorio:

1. mover su frontend/backend/migraciones propias;
2. mantener namespace/tablas Hípico estable;
3. sustituir únicamente la conexión/infraestructura compartida que corresponda;
4. conservar `/hipico-control/` y su contrato operativo sin introducir dependencias del nuevo proyecto ERP.

## Criterio de revisión

Un cambio viola esta ADR si hace cualquiera de estas cosas:

- agrega Control Hípico a `MODULE_CATALOG`;
- genera una URL como `/control-hipico?module=psicologia`;
- reutiliza breadcrumbs/sidebar/theme del ERP como shell Hípico;
- mezcla versión/release de ambos productos;
- concede privilegios Hípico a partir de un rol ERP sin política dedicada;
- hace que una PWA/service worker intercepte el scope del otro producto.
