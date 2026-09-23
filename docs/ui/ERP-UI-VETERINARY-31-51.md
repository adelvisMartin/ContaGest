# 31/51 · Portal y comunicación del tutor veterinario

## Objetivo

Ofrecer al tutor un acceso externo **temporal, revocable y de solo lectura** sobre información veterinaria expresamente autorizada, sin duplicar la autoridad de agenda, hospitalización, documentos, ventas ni comunicaciones.

## Grant de acceso

`VeterinaryGuardianPortalGrant` conserva solamente:

- tenant y mascota;
- `tokenSha256`;
- scopes autorizados;
- vencimiento;
- revocación;
- actor que emitió el acceso;
- último uso;
- fecha de creación.

El token plano **no se persiste**. El servidor genera 32 bytes aleatorios y devuelve el secreto sólo al crear el grant.

La vigencia aceptada es de **1 a 168 horas (máximo 7 días)** y el operador selecciona scopes explícitos:

- `appointments`;
- `reminders`;
- `discharge`;
- `documents`;
- `payments`;
- `communications`.

Crear un nuevo grant revoca los grants activos anteriores de la misma mascota. La tabla usa RLS y revoca acceso directo a `anon` y `authenticated`.

## Transporte del secreto

El enlace usa:

`/portal/veterinaria/#access=<token>`

El secreto viaja en el **fragmento**, por lo que no forma parte de la petición HTTP ni del referrer. La aplicación pública lo mueve a `sessionStorage` y elimina inmediatamente el fragmento con `history.replaceState`.

El intercambio se hace mediante:

`POST /api/v1/public/veterinary-portal/session`

con el token en el body. El backend lo convierte a SHA-256 y deriva tenant/mascota desde el grant válido; el cliente público nunca suministra tenantId ni patientId.

## Boundary público

El router público se monta antes del middleware de sesión ERP y después de las protecciones/rate limits globales.

Su única operación funcional es el POST de sesión-token. No ofrece endpoints públicos para modificar citas, clínica, inventario, facturas o comunicaciones.

La única escritura realizada durante lectura es actualizar `lastUsedAt` del grant.

Headers:

- `Cache-Control: no-store`;
- `Pragma: no-cache`;
- `Referrer-Policy: no-referrer`;
- `X-Robots-Tag: noindex, nofollow, noarchive`.

## Minimización del snapshot

El portal devuelve sólo campos allow-listed.

### Citas y recordatorios
Autoridad: `CareAppointment`.

Fecha/hora, estado, motivo, canal y estado del recordatorio.

### Alta / estancia
Autoridad: `CareHospitalization`.

Número de admisión, ingreso/alta, estado y sala. No se exponen diagnóstico, carePlan ni observaciones internas.

### Documentos
Autoridad: `CareDiagnosticStudy`.

Tipo, título, estado, fechas y `externalUrl` únicamente cuando es HTTPS. No se exponen `attachmentPath`, findings ni impression.

### Pagos / facturación
Autoridades: `VeterinaryFinancialCase` + `SalesInvoice`.

Estado del caso, estimación, número/estado/total de factura y fechas. El portal no cobra, emite, postea ni anula.

### Comunicaciones
Autoridad: `CareCommunicationLog`.

Se muestran canal, evento, estado y timestamps. No se expone payload, providerMessageId ni contenido clínico.

## UI administrativa

`VeterinaryGuardianPortalPanel.jsx` es el único owner dentro de Veterinaria:

- vigencia;
- scopes;
- emisión/reemplazo;
- copia del enlace recién creado;
- revocación;
- envío manual por WhatsApp/correo.

Al preparar el envío se registra `CareCommunicationLog` como **queued**. Abrir WhatsApp/mail no se presenta como entrega confirmada por un proveedor.

## UI del tutor

`frontend/portal/veterinaria/index.html` es una entrada Vite independiente del shell privado.

`guardianPortal.jsx` usa `noAuth:true` y presenta cinco secciones:

- Citas y recordatorios;
- Alta y estancia;
- Documentos;
- Facturación y pagos;
- Comunicaciones.

## Autoridades preservadas

31/51 no crea copias operativas de CareAppointment, CareHospitalization, CareDiagnosticStudy, VeterinaryFinancialCase, SalesInvoice ni CareCommunicationLog. La tabla nueva sólo gobierna acceso temporal.

## QA

`tests/erp_ui_veterinary_guardian_portal_31_51.test.mjs` y Wave A bloquean regresiones de:

- token plano o query-string secret;
- TTL mayor a 7 días;
- ausencia de scopes;
- exposición de narrativa clínica/storage/payloads;
- mutaciones públicas fuera de `lastUsedAt`;
- owner UI duplicado;
- pérdida de la entrada pública.

Runtime/PostgreSQL/browser sólo se consideran PASS con steps/logs reales del SHA candidato. Si Actions finaliza antes del runner, el estado es `BLOCKED_INFRASTRUCTURE`.
