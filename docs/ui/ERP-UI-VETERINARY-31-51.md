# 31/51 · Portal y comunicación del tutor veterinario

## Objetivo

Entregar al tutor un acceso externo temporal y revocable para consultar información veterinaria ya autorizada, sin convertir el portal en una segunda autoridad clínica, comercial o de agenda.

El alcance cubre:

- citas y estado de recordatorios;
- hospitalización y alta;
- estudios/documentos clínicos publicados;
- estimaciones, facturas y estado comercial;
- comunicaciones marcadas explícitamente para el tutor.

El portal es **read-only**.

## Seguridad del acceso

El personal autorizado crea un grant temporal desde la pestaña **Portal tutor**.

El servidor:

1. genera un token aleatorio de 32 bytes;
2. devuelve el token únicamente en la respuesta de creación;
3. persiste sólo `tokenSha256`;
4. revoca grants activos anteriores de la misma mascota al crear uno nuevo;
5. admite vigencia de 1 a 90 días;
6. permite revocación explícita;
7. registra creación/revocación en auditoría;
8. registra `lastUsedAt` al consumir el enlace.

El token no se almacena en texto plano.

La tabla `VeterinaryGuardianPortalGrant` tiene RLS activado y acceso directo revocado a `anon` y `authenticated`.

## Boundary público

El GET público se monta en:

`/api/v1/public/veterinary-portal/:token`

antes del middleware de sesión privada, pero después de los controles globales de seguridad/rate limit.

No existen POST/PUT/PATCH/DELETE públicos para el portal en 31/51.

Las respuestas usan:

- `Cache-Control: no-store`;
- `Referrer-Policy: no-referrer`;
- `X-Robots-Tag: noindex, nofollow, noarchive`.

## Allow-list de datos

El snapshot público no serializa entidades completas.

### Mascota

Se exponen nombre, especie, raza, sexo, fecha de nacimiento y nombre del tutor.

No se exponen notas internas, alergias, antecedentes, tenantId ni IDs internos.

### Citas y recordatorios

Autoridad: `CareAppointment`.

Se exponen únicamente fecha/hora, estado, motivo, canal y `reminderStatus`.

### Alta y hospitalización

Autoridad: `CareHospitalization`.

Se exponen número de admisión, fechas de ingreso/alta, estado, diagnóstico registrado y sala.

No se expone `carePlan` ni observaciones internas.

### Documentos clínicos

Autoridad: `CareDiagnosticStudy`.

Se exponen metadatos clínicos seleccionados y `externalUrl` sólo cuando es HTTPS.

`attachmentPath` no se consulta ni se devuelve.

### Facturación y pagos

Autoridades: `VeterinaryFinancialCase` + `SalesInvoice`.

Se muestran estado del caso, estimación, número/estado/total de factura y fechas.

El portal no emite, paga, postea ni anula facturas.

### Comunicaciones

Autoridad: `CareCommunicationLog`.

Sólo se muestra `payload.guardianText`; el payload completo nunca forma parte de la respuesta pública.

Registrar una comunicación desde el panel admin crea un log `queued`. Esto **no se presenta como envío confirmado**: el estado sólo cambia cuando el proveedor/canal correspondiente lo confirma.

## Frontend

### Admin

`VeterinaryGuardianPortalPanel.jsx` es el único owner del flujo:

- seleccionar vigencia;
- crear enlace;
- copiar el token recién emitido;
- revisar uso/vigencia;
- revocar;
- registrar comunicación visible al tutor.

### Tutor

`frontend/portal/veterinaria/index.html` es una entrada Vite independiente del shell ERP privado.

`guardianPortal.jsx` consume el snapshot con `noAuth:true` y muestra:

- Citas y recordatorios;
- Alta y hospitalización;
- Documentos clínicos;
- Facturación y pagos;
- Comunicaciones.

## Autoridades preservadas

31/51 no crea duplicados de:

- agenda;
- hospitalización;
- estudios;
- facturación;
- comunicaciones;
- historia clínica.

`VeterinaryGuardianPortalGrant` sólo gobierna acceso temporal.

## QA

`tests/erp_ui_veterinary_guardian_portal_31_51.test.mjs` bloquea:

- tokens persistidos en plano;
- portal público con mutaciones;
- exposición de `attachmentPath` o payload crudo;
- pérdida de headers anti-cache/referrer;
- pérdida del owner admin único;
- pérdida de la entrada Vite pública.

Wave A replica los mismos contratos de forma fail-closed.

Runtime/PostgreSQL/browser sólo se clasifican PASS cuando existan steps/logs reales del SHA candidato. Si Actions termina antes del runner, el estado es `BLOCKED_INFRASTRUCTURE`.
