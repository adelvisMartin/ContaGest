# 24/51 · Veterinaria — preventivos y estándares de cuidado

## Objetivo

Unificar vacunas, desparasitación, controles preventivos y próximos vencimientos con recordatorios configurables usando autoridades clínicas existentes.

## Autoridades

No se crea una tabla preventiva paralela:

- **Vacunas** → `CareImmunization`;
- **Desparasitación / controles** → `CareEncounter` firmado, `type: veterinary-preventive`;
- **Recordatorios** → `CareCommunicationLog` mediante `VeterinaryService.createCommunication`.

## Backend

### Inmunizaciones

Se añade `GET /health/immunizations?patientId=...`:

- requiere `health.manage`;
- filtra por `tenantId + patientId`;
- incluye profesional;
- ordena por administración descendente.

El POST de inmunización ahora valida:

- mascota perteneciente al tenant activo;
- profesional, si se informa, perteneciente al mismo tenant.

### Preventivos no vacunales

`clinicalData.preventiveCare` valida:

- `kind: deworming | checkup`;
- nombre;
- `performedAt`;
- `nextDueAt`;
- notas.

El encuentro debe usar `type: veterinary-preventive` y quedar `signed`.

## UI

`VeterinaryPreventiveCarePanel.jsx` permite registrar:

- Vacunas;
- Desparasitación;
- Control preventivo;
- fecha realizada;
- Próximo vencimiento;
- dosis/lote cuando aplica;
- notas.

Estados derivados por vencimiento:

- **Vencido**;
- **Próximo** (≤30 días);
- **Al día**.

## Recordatorios configurables

Opcionalmente se configura:

- Canal: WhatsApp o correo;
- Anticipación: 1, 3, 7, 14 o 30 días.

El recordatorio se persiste como `CareCommunicationLog`:

- `event: preventive_due_reminder`;
- `status: queued`;
- `scheduledAt` calculado desde `nextDueAt - anticipación`;
- payload con tipo/nombre preventivo y fecha de vencimiento.

No usa `setTimeout`/`setInterval` del navegador como autoridad temporal.

## Dossier longitudinal

El expediente carga inmunizaciones junto con encuentros, mediciones, prescripciones y otros eventos. Las vacunas también aparecen en la cronología médica.

## QA

- `erp_ui_veterinary_preventive_care_24_51.test.mjs`;
- Wave A exige una sola composición del panel;
- gate exige inmunizaciones canónicas y contratos de reminder;
- no se declara browser/runtime PASS sin ejecución real del SHA.
