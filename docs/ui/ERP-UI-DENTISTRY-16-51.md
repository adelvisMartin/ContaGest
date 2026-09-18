# 16/51 · Consentimiento odontológico versionado con evidencia

## Objetivo

Separar de forma explícita la **aceptación operativa del plan** (15/51) del **consentimiento clínico documentado**, reutilizando `CareConsent` como única autoridad persistente.

## Prerrequisito

Sólo puede registrarse consentimiento para un `CareEncounter`:

- `type: dental-treatment-plan`;
- mismo tenant y paciente;
- `status: signed`;
- `clinicalData.treatmentPlan.status: accepted`;
- `acceptance.status: accepted`.

La aceptación del plan no se transforma automáticamente en consentimiento.

## Firma declarativa

`POST /health/consents/dental-treatment` registra una atestación tipada:

- nombre del firmante;
- rol: paciente, tutor/representante o representante autorizado;
- texto exacto aceptado;
- `attestation: true`;
- plan aceptado vinculado;
- actor/email del usuario autenticado;
- fecha server-side;
- método `typed-attestation`;
- URL opcional de documento externo, validada como URL.

La evidencia es declarativa. **No es un certificado criptográfico, firma electrónica cualificada ni implica por sí sola validez jurídica verificada.** La clínica debe validar identidad, normativa y requisitos documentales aplicables.

## Integridad y versionado

La versión de plantilla es controlada por servidor mediante `DENTAL_CONSENT_TEMPLATE_VERSION`; el cliente no puede escogerla.

El servidor congela un snapshot del plan aceptado y calcula:

- `treatmentPlanFingerprint` SHA-256;
- `consentSha256` sobre evidencia canónica;
- `revision`;
- `previousConsentId`.

La serialización para hash usa claves ordenadas mediante `stableJson`.

Para evitar dos primeras firmas concurrentes cuando todavía no existe una fila que bloquear, la transacción adquiere `pg_advisory_xact_lock(hashtextextended(...))` por tenant + plan + tipo de consentimiento. Luego, cualquier revisión previa se bloquea con `FOR UPDATE`.

Si existe una revisión `signed` activa para el mismo plan no se permite otra firma. Una revisión revocada puede ser sucedida por N+1, conservando la cadena.

## Revocación

`POST /health/consents/:id/revoke`:

- requiere `health.manage`;
- bloquea la fila con `FOR UPDATE`;
- sólo acepta consentimiento dental `signed`;
- conserva nombre, fecha, texto, snapshot y hashes de la firma;
- cambia estado a `revoked`;
- añade motivo, actor y `revokedAt` server-side;
- calcula `revocationSha256` a partir del hash firmado + motivo + actor + fecha.

La revocación no elimina ni sustituye la revisión firmada.

## Compatibilidad y seguridad

El endpoint genérico `POST /health/consents` permanece para otros tipos de consentimiento, pero rechaza `DENTAL_CONSENT_KIND` para impedir saltarse el flujo especializado.

No se añade migración: se reutilizan `CareConsent.metadata`, `documentUrl`, `signedAt` y estados existentes.

Autoridad server-side:

- tenant;
- actor;
- email del actor;
- fecha de firma;
- revisión;
- `previousConsentId`;
- versión de plantilla;
- fingerprint del plan;
- hashes de firma/revocación.

## UI

`DentalConsentPanel.jsx`:

- selecciona paciente y plan aceptado;
- muestra el plan que el servidor revalidará;
- captura nombre y rol del firmante;
- captura texto y atestación explícita;
- permite URL documental externa opcional;
- lista revisión, firmante, plan, SHA-256 y estado;
- permite revocación con motivo;
- usa estados empty/saving y layout responsive;
- no usa canvas, signature-pad ni DOM imperativo.

## QA

Automatizado:

- `tests/erp_ui_dentistry_consent_evidence_16_51.test.mjs`;
- Wave A fail-closed;
- plan/tenant/paciente;
- append-only de revisiones;
- bloqueo concurrente;
- actor/fecha/revisión/versionado no controlados por cliente;
- hashes de firma y revocación;
- wiring único del panel.

No verificado automáticamente:

- validez jurídica en una jurisdicción concreta;
- ergonomía clínica validada por odontólogo;
- browser/E2E/typecheck/build mientras el runner no ejecute steps reales.

Esos puntos se reportan como `NOT_VERIFIED` o `BLOCKED_INFRASTRUCTURE`, nunca como PASS inferido.
