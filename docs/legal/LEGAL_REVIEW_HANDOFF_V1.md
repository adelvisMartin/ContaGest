# ContaGest-VE — Handoff para revisión jurídica profesional v1

**Propósito:** entregar al profesional venezolano la información mínima necesaria para revisar la versión contractual vigente antes del primer cliente real.  
**Versión técnica objetivo:** `LEGAL_DOCUMENT_VERSION = 2026-08-09.v1`.  
**Estado:** pendiente de revisión profesional.  
**Este documento no es una opinión jurídica.**

## 1. Documentos que deben revisarse como un conjunto

Fuente canónica runtime: `backend/src/shared/legal/legalCatalog.ts`.

- Términos y Condiciones (`terms`).
- Aviso de Privacidad (`privacy`).
- Política de Cookies (`cookies`).
- Uso Aceptable (`acceptable-use`).
- Suspensión y Terminación (`suspension-termination`).
- `docs/legal/LEGAL_BASIS_MATRIX_V1.md`.
- `docs/legal/VENEZUELA_LEGAL_SOURCES_REVIEW_V1.md`.
- `docs/legal/PRODUCTION_LEGAL_CHECKLIST.md`.

La revisión debe referirse expresamente a la misma versión que se desplegará. Si el profesional exige cambios materiales, debe incrementarse `LEGAL_DOCUMENT_VERSION`, regenerarse el hash runtime y repetirse la aprobación sobre la nueva versión.

## 2. Identidad contractual que debe suministrar el propietario

| Dato | Valor aprobado |
| --- | --- |
| Nombre/razón social del prestador | PENDIENTE |
| RIF | PENDIENTE |
| Domicilio contractual | PENDIENTE |
| Correo legal/privacidad | PENDIENTE |
| Correo de soporte | PENDIENTE |
| Persona con facultad para contratar/facturar | PENDIENTE |

Los cinco primeros valores se materializan en `LEGAL_PROVIDER_NAME`, `LEGAL_PROVIDER_RIF`, `LEGAL_PROVIDER_ADDRESS`, `LEGAL_CONTACT_EMAIL` y `LEGAL_SUPPORT_EMAIL` únicamente después de su confirmación.

## 3. Decisiones que el profesional debe resolver expresamente

### 3.1 Modelo contractual y usuarios

- Definir si el servicio se comercializará B2B, B2C o ambos y las consecuencias para contratos de adhesión/protección al usuario/consumidor.
- Confirmar capacidad y representación de quien acepta por una empresa.
- Determinar ley aplicable, domicilio contractual, jurisdicción, mediación/arbitraje y mecanismo de disputas.

### 3.2 Precio, facturación e impuestos

- Documento fiscal/comercial que debe emitirse.
- Moneda contractual y tratamiento de referencias en USD/USDT/bolívares si se utilizan.
- Impuestos aplicables al modelo comercial real.
- Condiciones de renovación, mora, período de gracia, suspensión, reactivación, cancelación y reembolso.
- Qué cargos son recurrentes, únicos o por servicios adicionales.

### 3.3 Retención y ciclo de vida de datos

Definir plazo y fundamento por categoría, incluyendo al menos:

- cuenta e identidad de usuario;
- evidencia de aceptación contractual;
- facturación/pagos/contabilidad;
- auditoría y seguridad;
- backups;
- tickets/soporte;
- importaciones/exportaciones;
- datos de salud humana cuando aplique.

También debe definirse el tratamiento ante terminación, exportación, borrado, obligación legal de conservación y `legal hold`.

### 3.4 Evidencia técnica de aceptación

El control técnico de #29 adopta provisionalmente `authenticated-context-no-network-identifiers.v1`:

- se conserva usuario autenticado, tenant, documento, versión, SHA-256, timestamp, locale y método de aceptación;
- las nuevas filas de `LegalAcceptance`, `CookiePreference` y el `AuditLog` específico de aceptación no conservan IP ni user-agent crudos;
- no se borran automáticamente registros históricos;
- los logs HTTP/seguridad generales tienen una política separada pendiente de definición.

El profesional debe **confirmar esta minimización o exigir una alternativa concreta**, indicando finalidad y plazo de retención si considera necesaria evidencia adicional.

### 3.5 Privacidad, hosting y subprocesadores

Antes de aprobar deben anexarse los proveedores reales elegidos para producción, incluyendo cuando corresponda:

- hosting/frontend;
- backend/serverless;
- PostgreSQL/Supabase;
- almacenamiento y backups;
- correo/transaccionales;
- observabilidad/logging;
- IA/proveedores externos;
- pagos;
- soporte/comunicaciones.

Para cada proveedor: finalidad, categoría de datos, ubicación/región, acceso, subprocesadores relevantes, retención disponible y mecanismo contractual. El profesional debe determinar el tratamiento de transferencias internacionales según la arquitectura definitiva.

### 3.6 Salud humana

No autorizar datos reales de salud humana hasta que exista un addendum específico revisado por profesional competente que cubra, como mínimo:

- confidencialidad;
- roles y acceso mínimo;
- finalidad y minimización;
- historia/expediente y retención;
- exportación/corrección/eliminación cuando proceda;
- incidentes;
- backups;
- proveedores/subprocesadores;
- responsabilidades entre ContaGest y el cliente profesional/institución.

## 4. Evidencia que debe devolver el profesional

La revisión final debe quedar identificada, fechada y vinculada al release. Como mínimo:

1. nombre del profesional revisor;
2. jurisdicción declarada `VE`/`Venezuela`;
3. fecha de revisión;
4. versión exacta de `LEGAL_DOCUMENT_VERSION`;
5. documento/memo/carta de revisión con referencia estable;
6. SHA-256 del archivo de evidencia;
7. lista de aprobaciones y condiciones/observaciones;
8. confirmación expresa o corrección de la política de IP/evidencia;
9. confirmación del addendum de salud humana o prohibición de habilitarlo.

No se debe guardar una mera casilla `approved=true` sin conservar la evidencia profesional referenciada.

## 5. Materialización técnica después de la aprobación

1. Aplicar al texto cualquier corrección exigida.
2. Incrementar `LEGAL_DOCUMENT_VERSION` si hubo cambio material.
3. Obtener aprobación final sobre esa versión exacta.
4. Calcular SHA-256 del archivo profesional.
5. Crear `docs/legal/LEGAL_RELEASE_ATTESTATION.json` usando el esquema de `LEGAL_RELEASE_ATTESTATION.example.json`.
6. Configurar en producción la identidad `LEGAL_PROVIDER_*`.
7. Configurar:
   - `LEGAL_REVIEW_APPROVED_VERSION=<versión aprobada>`
   - `LEGAL_REVIEW_EVIDENCE_SHA256=<SHA-256 de la evidencia>`
8. Ejecutar `npm run qa:legal:production`.
9. Ejecutar E2E de primer acceso, rechazo y reaceptación sobre el SHA candidato.
10. Adjuntar reportes/evidencia al release antes de habilitar el primer tenant real.

## 6. Criterio de no aprobación

Si falta una decisión obligatoria, la revisión contiene reservas no resueltas, la versión aprobada no coincide con el runtime o no existe evidencia verificable, el estado correcto es **BLOCKED**. No completar la atestación con valores ficticios para obtener un gate verde.
