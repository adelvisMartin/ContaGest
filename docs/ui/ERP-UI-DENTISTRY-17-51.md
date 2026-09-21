# 17/51 · Media y documentos clínicos odontológicos

## Objetivo

Agregar radiografías, fotos clínicas, estudios, informes y documentos al contexto odontológico sin exponer objetos clínicos por las políticas de Storage genéricas ni convertir el sistema multimedia común en una autoridad clínica.

## Autoridad clínica

Cada archivo subido genera un `CareEncounter` inmutable:

- `type: dental-attachment`;
- `specialty: dentistry`;
- `confidential: true`;
- `status: signed`;
- `clinicalData.dentalAttachment` contiene metadata, relaciones e integridad.

El binario no se guarda en PostgreSQL. Se conserva en Storage privado y la fila clínica guarda su referencia e integridad.

## Aislamiento de Storage

Los adjuntos clínicos usan el bucket dedicado:

`contagest-clinical-media`

Configuración:

- privado;
- 15 MiB;
- JPEG, PNG, WebP y PDF;
- sin políticas directas para `authenticated`;
- lectura/escritura únicamente desde backend autorizado con service role;
- URLs firmadas temporales.

El bucket general `contagest-media` no se modifica. Sus límites y políticas permanecen independientes del contenido clínico.

## Upload

`POST /media/dental-attachments`:

- requiere usuario autenticado y `health.manage`;
- valida paciente humano activo en tenant;
- valida pieza dental;
- valida encuentro relacionado en mismo paciente/tenant;
- valida que el plan relacionado sea `dental-treatment-plan`;
- límite 15 MiB;
- MIME permitido explícito;
- magic bytes JPEG/PNG/WebP/PDF;
- filename saneado;
- SHA-256 server-side;
- path generado server-side;
- `uploadedBy` y `uploadedAt` server-side;
- upload sin overwrite.

Si el insert de `CareEncounter` falla después de guardar el objeto, el backend elimina el objeto recién creado para evitar huérfanos.

## Lectura

`GET /media/dental-attachments?patientId=...`:

- exige `health.manage`;
- exige paciente del tenant;
- sólo recupera `CareEncounter.type=dental-attachment`;
- sólo firma rutas del tenant dentro del namespace clínico;
- URL expira en 1 hora.

## Inmutabilidad

El endpoint genérico de firma no firma rutas clínicas y el endpoint genérico de borrado no elimina adjuntos clínicos firmados.

No se expone borrado clínico en 17/51. Cualquier futura política de retención/supresión deberá mantener trazabilidad clínica y autorización específica.

## Frontend

`DentalMediaPanel.jsx`:

- una sola instancia dentro del contexto del paciente;
- tipos: Radiografía, Foto clínica, Estudio / informe, Documento;
- pieza opcional;
- encuentro relacionado opcional;
- plan relacionado opcional;
- notas;
- carga binaria directa al backend;
- previews para imágenes;
- apertura mediante URL temporal;
- SHA-256 visible;
- estados empty/saving;
- sin DOM imperativo.

`BackendApi` preserva `Blob`, `ArrayBuffer` y vistas binarias sin convertirlas a JSON.

## QA

Automatizado:

- `tests/erp_ui_dentistry_media_documents_17_51.test.mjs`;
- auditor Wave A;
- aislamiento de bucket;
- límite/MIME/magic bytes;
- autoridad tenant/patient;
- relaciones clínicas;
- protección contra firma/borrado genérico;
- transporte binario;
- panel único.

Browser/E2E/typecheck/build deben acreditarse por ejecución real del SHA candidato. Ausencia de runner se clasifica como infraestructura, nunca como PASS.
