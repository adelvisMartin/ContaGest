# 15/51 · Plan de tratamiento odontológico

## Objetivo

Modelar un plan clínico completo:

diagnóstico → alternativas → fases → procedimientos → presupuesto estimado → estado → aceptación operativa.

## Persistencia y autoridad

No se crea una tabla paralela. El plan vive en `CareEncounter`:

- `type: dental-treatment-plan`;
- estado inicial `draft`;
- `clinicalData.treatmentPlan.status: proposed`;
- `clinicalData.treatmentPlan.acceptance.status: pending`.

El backend valida la estructura y recalcula el presupuesto estimado antes de persistir.

## Estructura

### Diagnóstico
Texto clínico requerido.

### Alternativas
Una o más opciones con nombre y descripción.

### Fases
Una o más fases ordenadas. Cada fase contiene uno o más procedimientos.

### Procedimientos
Cada procedimiento registra:

- nombre;
- pieza opcional;
- cantidad entera 1–99;
- precio unitario con máximo dos decimales.

### Presupuesto
El plan usa una moneda única `VES` o `USD`.

El cliente muestra una vista previa, pero el servidor ignora cualquier total recibido como autoridad y recalcula:

`cantidad × precio unitario`

en centavos enteros mediante `dentalMoneyCents`, persistiendo `estimatedTotal`.

Este total es **estimativo y no contable**. La integración con cotización/cobranza/analítica ERP corresponde a 20/51.

## Decisión operativa

`POST /health/encounters/:id/treatment-plan-decision`:

- requiere `health.manage`;
- bloquea la fila con `FOR UPDATE`;
- sólo acepta un plan `draft`;
- `accepted` → encuentro `signed`;
- `rejected` → encuentro `cancelled`;
- rechazo exige motivo;
- actor, email y `decidedAt` se derivan del contexto autenticado;
- una segunda decisión es rechazada.

La aceptación de 15/51 **no es una firma ni consentimiento clínico**. La evidencia de consentimiento se implementa en 16/51 con `CareConsent`.

## UI

`TreatmentPlanPanel.jsx` ofrece:

- paciente y profesional explícitos;
- alternativas dinámicas;
- fases dinámicas;
- procedimientos dinámicos;
- pieza opcional;
- cantidad/precio;
- moneda;
- vista previa del presupuesto;
- listado de planes;
- decisión Aceptar/Rechazar con motivo obligatorio al rechazar.

No usa DOM imperativo.

## Seguridad

- tenant deriva del request context;
- `POST /health/encounters` valida que paciente y profesional pertenezcan al tenant activo antes de insertar;
- actor de decisión no es enviado por el cliente;
- plan nuevo sólo puede iniciar como `draft/proposed/pending`;
- aceptación no se promociona a “consentimiento”;
- no se realizan postings contables.

## QA

Automatizado:
- `erp_ui_dentistry_treatment_plan_15_51.test.mjs`;
- Wave A audit fail-closed;
- Zod backend;
- cálculo exacto de presupuesto en servidor.

Browser/E2E/typecheck/build permanecen sujetos a ejecución real del SHA candidato. Si #134 impide el runner, se reporta como infraestructura y no como PASS.
