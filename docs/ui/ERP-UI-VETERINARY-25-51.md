# 25/51 · Veterinaria — plantillas SOAP por especie/consulta

## Objetivo

Acelerar documentación clínica veterinaria con plantillas SOAP editables según especie y tipo de consulta, sin generar diagnósticos automáticos ni cambiar la autoridad de `CareEncounter`.

## Catálogo

`veterinarySoapTemplates.js` define `SOAP_TEMPLATE_VERSION` y plantillas versionadas para:

- canino · control preventivo;
- felino · control preventivo;
- consulta por problema;
- seguimiento;
- urgencia/emergencia.

La resolución usa especie normalizada (`canine | feline | general`) + tipo de consulta y cae de forma segura al template general cuando no existe una combinación específica.

## Flujo UI

En **Nueva consulta**:

1. se selecciona Tipo de consulta;
2. **Aplicar plantilla** resuelve especie de la mascota;
3. prellena:
   - S · Motivo / subjetivo;
   - O · Hallazgos / objetivo;
   - A · Evaluación / diagnóstico;
   - P · Plan / seguimiento;
4. todos los campos siguen siendo normales, controlados y editables antes de guardar.

La UI avisa que la plantilla no constituye diagnóstico automático.

## Provenance

El encuentro se sigue creando mediante `HealthVerticalService.createEncounter`.

`clinicalData.soapTemplate` conserva:

- `templateId`;
- `version`;
- especie;
- tipo de consulta.

El texto clínico final permanece en los campos canónicos `subjective/objective/assessment/plan`.

## Seguridad clínica

- no auto-firma;
- no autodiagnóstico;
- no reemplaza criterio profesional;
- ninguna plantilla cambia estado del encounter por sí misma;
- el usuario puede modificar completamente el texto antes de persistir.

## QA

- `erp_ui_veterinary_soap_templates_25_51.test.mjs`;
- Wave A exige catálogo/version/provenance y controles de aplicación;
- no se declara browser/runtime PASS sin ejecución exacta del SHA.
