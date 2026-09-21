# ERP UI · Odontología · 20/51 Presupuesto, cobranza y analítica

## Objetivo

Conectar el plan de tratamiento odontológico aceptado con el ERP financiero existente sin crear una segunda autoridad comercial ni permitir que Salud contabilice asientos.

## Autoridades

La frontera queda explícita:

- `CareEncounter(type=dental-treatment-plan)` mantiene la autoridad clínica sobre diagnóstico, fases, procedimientos, presupuesto estimado y decisión de aceptación.
- `SalesInvoice` mantiene la autoridad comercial sobre el documento ERP, sus líneas, estado y eventual contabilización.
- `DentalFinancialLink` conserva únicamente provenance auditable entre ambas autoridades. No sustituye ninguna de las dos.

Un plan aceptado puede originar **como máximo un** `SalesInvoice` y ese documento nace siempre en `draft`.

## Flujo real

1. El profesional registra el plan mediante el flujo 15/51.
2. El backend recalcula el presupuesto y conserva el plan como borrador propuesto.
3. La decisión operativa aceptada deja el `CareEncounter` firmado.
4. Un usuario con `health.manage + sales.manage` puede ejecutar `POST /api/v1/verticals/health/encounters/:id/financial-link`.
5. La transacción adquiere advisory lock por tenant + plan y comprueba de nuevo que el plan siga firmado y aceptado.
6. Las líneas comerciales se reconstruyen desde fases/procedimientos y se recalculan con el núcleo Decimal canónico.
7. El total calculado debe coincidir exactamente con el presupuesto aceptado.
8. Se crea `SalesInvoice.status=draft`, sin asiento contable.
9. Se inserta `DentalFinancialLink` y un `AuditLog` server-side.
10. Si el mismo plan se solicita otra vez, se devuelve el vínculo existente; no se duplica la factura.

## Política fiscal del borrador

20/51 no inventa reglas fiscales que el plan clínico no contiene.

Por eso las líneas creadas desde Salud usan `taxRate=0` **sólo para conservar exactamente el presupuesto aceptado dentro del borrador**. El snapshot marca:

- `fiscalReviewRequired=true`;
- `fiscalPolicy=draft-only-no-tax-assumption`.

Antes de emitir el documento, Ventas debe validar como mínimo:

- cliente fiscal;
- IVA/otras reglas aplicables;
- tasa de cambio cuando corresponda;
- período y fecha fiscal;
- datos requeridos por el proceso comercial real.

Mientras el documento siga en `draft`, el flujo de Ventas no crea ni contabiliza `LedgerEntry`.

## Snapshot y privacidad

`DentalFinancialLink.budgetSnapshot` conserva sólo provenance comercial:

- IDs de plan/paciente/profesional;
- nombre visible del paciente y profesional;
- moneda y total aceptado;
- número del borrador ERP;
- fases/procedimientos, pieza opcional, cantidad, precio unitario y total de línea;
- frontera de revisión fiscal.

El snapshot **no copia diagnóstico, subjetivo, assessment ni notas clínicas**. Esos datos permanecen bajo la autoridad clínica.

## Cobranza y analítica

`GET /api/v1/verticals/health/dental/financial` requiere `health.manage + sales.view` y expone:

- planes aceptados, pendientes, rechazados, vinculados y aceptados sin ERP;
- presupuestado;
- borradores;
- por cobrar: `SalesInvoice.status=issued|overdue`;
- cobrado: `SalesInvoice.status=paid`;
- importes de borrador/por cobrar/cobrado tomados de `SalesInvoice.total`, manteniendo el presupuesto aceptado (`quotedTotal`) como referencia separada;
- producción por profesional;
- producción por procedimiento.

Los importes se agrupan **por moneda**. VES y USD nunca se suman entre sí.

20/51 no crea una tabla de pagos paralela: el estado de cobranza mostrado por Odontología proviene de la autoridad `SalesInvoice`.

## Concurrencia e integridad

- advisory lock transaccional por `tenantId + treatmentPlanId`;
- unique `tenantId + treatmentPlanId`;
- unique `tenantId + salesInvoiceId`;
- FK restrictiva hacia plan/paciente/factura;
- RLS habilitado y acceso directo revocado para `anon` / `authenticated`;
- actor del vínculo y auditoría definidos server-side;
- el borrador ERP vinculado no puede eliminarse desde Ventas porque destruiría la provenance.

## Frontend

`DentalFinancialPanel.jsx` es el único owner visual de esta integración dentro de Odontología.

Incluye:

- estado loading/error/empty;
- métricas de planes;
- cobranza separada por moneda;
- producción por profesional;
- producción por procedimiento;
- vínculo de cada plan aceptado con su `SalesInvoice`;
- acción “Crear borrador ERP” sólo para planes todavía no vinculados;
- aviso explícito de que Salud no contabiliza y de que la revisión fiscal pertenece a Ventas.

## Límites de 20/51

Este punto no implementa ni presume:

- códigos odontológicos extranjeros;
- reglas tributarias específicas por procedimiento;
- conversión automática VES/USD;
- creación automática de `Client` desde `CarePatient`;
- pasarela de pago o tabla de cobros paralela;
- contabilización desde Salud;
- eliminación/desvinculación destructiva de provenance.

Esos comportamientos requieren reglas de negocio explícitas y no se infieren del plan clínico.
