# 31/51 · Portal y comunicación del tutor veterinario

## Objetivo

Dar al tutor un acceso externo **temporal, revocable y de solo lectura** a información ya autorizada de su mascota, sin crear una segunda autoridad clínica, de agenda, comunicaciones o facturación.

El portal cubre:

- citas;
- estado de recordatorios;
- alta/estancia hospitalaria;
- documentos publicados;
- estimaciones/facturas;
- trazabilidad de comunicaciones.

## Autoridades preservadas

El portal sólo agrega lecturas de:

- `CareAppointment`;
- `CareCommunicationLog`;
- `CareHospitalization`;
- `CareDiagnosticStudy`;
- `VeterinaryFinancialCase` + `SalesInvoice`.

`VeterinaryGuardianPortalGrant` controla únicamente **acceso**. No almacena historia clínica ni datos comerciales duplicados.

## Grant autorizado

El personal con permisos de salud + comunicaciones administra la pestaña **Portal tutor**.

Al emitir un grant:

1. se valida una mascota activa del tenant;
2. se genera `randomBytes(32)` (256 bits);
3. se persiste sólo `tokenSha256`;
4. se revoca cualquier grant activo anterior de la misma mascota;
5. se elige vigencia de 1 a 168 horas;
6. se eligen scopes explícitos:
   - `appointments`;
   - `reminders`;
   - `discharge`;
   - `documents`;
   - `payments`;
   - `communications`;
7. creación/revocación se auditan sin token ni hash en el payload de auditoría.

El token en claro se devuelve únicamente en la respuesta de creación.

## Transporte del secreto

El enlace generado usa:

`/portal/veterinaria/#access=<token>`

El fragmento no forma parte de la solicitud HTTP. La vista pública:

1. lee `#access`;
2. mueve el token a `sessionStorage`;
3. elimina inmediatamente el fragmento con `history.replaceState`;
4. envía el token mediante `POST /api/v1/public/veterinary-portal/session`;
5. elimina el token de sessionStorage si la sesión resulta inválida/revocada/vencida.

No se usa query string, path token, localStorage ni tenant header.

## Boundary público

Se monta antes de CSRF/requestContext privado, pero después de controles globales de seguridad, secretos y rate limit.

La frontera pública expone únicamente:

`POST /api/v1/public/veterinary-portal/session`

El token se hashea y el servidor deriva `tenantId + patientId` exclusivamente del grant activo.

La única escritura pública permitida es:

`VeterinaryGuardianPortalGrant.lastUsedAt = now()`

No existen operaciones públicas para editar citas, clínica, documentos, facturas o comunicaciones.

## Allow-list pública

### Identidad

Sólo datos básicos de mascota/tutor necesarios para la vista.

### Citas / recordatorios

Fecha/hora, estado, motivo, canal y `reminderStatus`.

### Alta / estancia

Número de admisión, fechas, estado y sala.

**No** se expone diagnóstico, care plan ni hoja de tratamiento.

### Documentos

Título/tipo/estado/fecha y `externalUrl` únicamente cuando es HTTPS.

**No** se exponen `attachmentPath`, findings, impression ni rutas internas.

### Pagos / facturación

Estado de caso, estimación, número/estado/total de factura.

El portal no cobra, emite, anula ni contabiliza.

### Comunicaciones

Sólo canal, evento, estado y timestamps.

No se exponen payload, error, providerMessageId ni texto interno.

## Comunicación del enlace

El panel interno puede copiar el enlace o preparar WhatsApp/correo. Antes de abrir el canal registra un `CareCommunicationLog` sin persistir el secreto:

- grantId;
- expiresAt;
- scopes;
- `portalSecretPersisted:false`.

El enlace real sólo existe en memoria del navegador durante esa acción.

## Persistencia y RLS

La migración `20260923134500_veterinary_guardian_portal_v3151` crea `VeterinaryGuardianPortalGrant` con:

- token SHA-256 único;
- scopes JSONB;
- expiración;
- revocación;
- actor creador;
- último uso;
- índices;
- RLS;
- `REVOKE ALL` para anon/authenticated.

## UX

### Staff

`VeterinaryGuardianPortalPanel.jsx` es el único owner:

- TTL 24/48/72/168 h;
- scopes configurables;
- creación/reemplazo de acceso;
- enlace visible una sola vez;
- copiar;
- preparar WhatsApp/correo;
- estado activo/vencido/revocado;
- último uso;
- revocación;
- loading/error/retry/disabled.

### Tutor

`frontend/portal/veterinaria/index.html` es una entrada Vite independiente del ERP privado.

`guardianPortal.jsx` presenta:

- citas y recordatorios;
- alta/estancia;
- documentos;
- facturación/pagos;
- comunicaciones.

Sin controles de mutación.

## QA

`tests/erp_ui_veterinary_guardian_portal_31_51.test.mjs` y Wave A bloquean regresiones de:

- token en texto plano;
- token en query/path;
- TTL > 7 días;
- pérdida de scopes;
- exposición de clinicalData, diagnóstico, findings/impression, payloads o storage paths;
- mutaciones públicas distintas de lastUsedAt;
- owner UI duplicado;
- pérdida de la entrada pública Vite.

Browser/PostgreSQL/runtime sólo se consideran PASS con ejecución real del SHA exacto. Un job sin runner/steps/logs se clasifica `BLOCKED_INFRASTRUCTURE`.
