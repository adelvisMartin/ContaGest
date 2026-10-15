# Contrato de configuración #665 — inventario centralizado (fase 1)

Catálogo tipado `config/environment-manifest-v665.mjs`, compatible con el
código ya fusionado de #946 (auditor frontend) y #955 (startup backend).
Registra **90 variables backend, 41 del Bridge y 6 del frontend** actualmente
versionadas en `.env.example`, además de 1 secreto opcional del backend y
5 metadatos de build/proveedor sin plantilla. Ningún valor real de secreto
está incluido.

Cada entrada identifica owner, tipo, exposición, sensibilidad, requiredness y
política del ejemplo. El test `npm run test:config:manifest` comprueba:
claves agregadas/quitadas sin registrar, defaults inseguros en SOURCE/LAB,
diferencias de alias y clasificación de credenciales públicas. Forma parte
del comando existente `npm run test:hipico:config`; **no** reemplaza los
validadores de configuración runtime del backend/Bridge.

## Plan de retirada de alias

| Propietario | Legado | Canónico | Criterio |
|---|---|---|---|
| backend | `HIPICO_SOURCE_CHANNEL_KEY` | `HIPICO_OFFICIAL_SOURCE_CHANNEL_KEY` | Inventario de usos + rollout |
| backend | `WHATSAPP_GRAPH_VERSION` | `WHATSAPP_GRAPH_API_VERSION` | Paridad en proveedores |
| backend | `HIPICO_BOT_OPERATOR_TOKEN` | `HIPICO_OPERATOR_CONTROL_TOKEN` | Sin consumidores legacy |

No usar `DATABASE_URL` como alias de `DATABASE_RUNTIME_URL` ni
`DIRECT_DATABASE_URL`: roles DML, migraciones y backup siguen aislados.

## Entornos

- **Local/Windows:** tres plantillas independientes; valores sensibles
  exclusivamente fuera de Git.
- **Vercel/Netlify:** `VITE_*` es público; SHA y metadatos de build nunca
  sirven como semilla privada JWT.
- **Supabase:** conservar las conexiones DML pooler runtime, DDL directa y
  backup como autoridades diferentes; sin migraciones automáticas.
- **Docker/self-host:** nombres iguales a estas plantillas; no existe un
  compose raíz en el snapshot auditado. El mapeo real y su smoke permanecen
  como criterio pendiente y NO se presentan como PASS.

**Pendientes:** integrar progresivamente el catálogo con validación runtime
de todos los entrypoints, QA Node/TS exact-SHA, bundle de frontend, secretos
del proveedor y smoke Docker. No cerrar #665 antes de esas evidencias.


## URL schemes con autoridad por variable

Las 14 variables declaradas `type:'url'` incluyen `allowedSchemes`.
Los endpoints del frontend, backend y Bridge solo admiten HTTP(S) en sus
plantillas; las conexiones `DATABASE_RUNTIME_URL`, `DATABASE_URL` y
`DIRECT_DATABASE_URL` solamente admiten `postgres:` o `postgresql:`.
`VITE_MARKETING_DEMO_URL` es la única entrada que permite una ruta
relativa del frontend, mediante `allowRelative:true`.

Este control evita confundir una URL de base de datos con un endpoint público
o aceptar `/api` como URL absoluta de Supabase. No lee credenciales reales,
no migrará PostgreSQL y no sustituye el auditor de secretos del frontend.

## Reconciliación de guards apilados (#964 → #665)

Una aprobación o merge de un PR apilado sobre otra rama no implica que su
diff se encuentre en `main`. Este incremento reinstala en `main` tres
protecciones de contrato pendientes de incorporar:

- `loadVersionedSamples()` lee únicamente las tres rutas fijadas por código
  en `REQUIRED_SURFACES`, ignorando rutas alteradas del manifiesto.
  No lee `.env` privados.
- Si algún catálogo obligatorio de backend, frontend, Bridge o build queda
  vacío, `MANIFEST_SURFACE_CATALOG_MISSING` impide un falso PASS.
- Los ejemplos de URL HTTP(S) rechazan `userinfo` (usuario/contraseña
  embebidos), y devuelven `MANIFEST_SAMPLE_TYPE_INVALID` sin registrar URL,
  usuario o contraseña. Las credenciales en URL PostgreSQL siguen permitidas
  **únicamente** para las variables de base de datos del servidor.

Las regresiones usan valores sintéticos y cubren redirección del loader,
catálogos vacíos, URLs HTTP(S) credencializadas y compatibilidad PostgreSQL.
Comprobar con `npm run test:config:manifest` sobre el SHA final.

**No demostrado aquí:** los validadores de todos los procesos en ejecución,
bundles reales de proveedores, Docker y E2E. Esos criterios de #665 continúan
abiertos hasta verificarse materialmente.

## Estructura de entradas de configuración (#665, hardening)

Cada entrada de `variables[owner][key]` debe ser un objeto. Una alteración
a `null`, boolean, número, cadena o array debe producir
`MANIFEST_INVALID_ENTRY` sin lanzar excepciones ni imprimir el valor
proporcionado, incluso en el catálogo `build`. Este incremento cubre 20
mutaciones sintéticas (4 owners × 5 tipos), además de los tests previos.
La política de protección de secretos frontend y rutas fijas se conserva.

El test nativo `npm run test:config:manifest`, startup con proveedores,
Docker y bundle de producción todavía deben ejecutarse en checkout
exact-SHA; un PASS de comprobación V8 no sustituye Node 22.

### URLs públicas: parámetros con secretos (#665)

El catálogo rechaza URLs absolutas y rutas de marketing relativas que
incluyan claves sensibles en query o hash: `access_token`, `api_key`,
`client_secret`, `service_role_key`, `jwt`, `password` y alias
normalizados. El resultado emite únicamente el código de error y la
variable de entorno, **nunca el valor de la URL**. Enlaces seguros como
`/?module=login&utm_source=home#screen?tab=sales` siguen funcionando;
`DATABASE_RUNTIME_URL` conserva conexión PostgreSQL con credenciales
exclusivamente del servidor.

Esta protección revisa plantillas versionadas, **no sustituye un escaneo
de bundles compilados**, despliegues reales ni pruebas de navegación.
