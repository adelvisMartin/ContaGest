# 10/51 · Odontología — contexto clínico de paciente

## Causa raíz

La migración React de 3/51 retiró el renderer imperativo, pero todavía derivaba el contexto clínico inicial desde el primer elemento de la lista de pacientes. Tras un refresh también podía reasignar automáticamente el primer paciente. Ese comportamiento podía cargar historia y tratamiento sin una selección clínica explícita.

## Solución

- `selectedPatientId` es la única autoridad de paciente para odontograma, tratamiento e historia;
- no existe fallback a `patients[0]`, `rows(initial.patients)[0]` ni `nextPatients[0]`;
- un refresh conserva la selección únicamente si ese paciente sigue disponible;
- cambiar paciente limpia `selectedTooth` antes de cargar su historia;
- `createEncounter` recibe `patientId:selectedPatientId`;
- el paciente de una cita continúa siendo un campo independiente del contexto clínico.

Crear un paciente nuevo puede seleccionarlo cuando todavía no había contexto porque esa acción es explícita del usuario; no es un fallback por orden de colección.

## Contratos preservados

No cambian endpoints, RBAC, tenant isolation, payload clínico, profesionales, citas, procedimientos, firma del encuentro ni servicios `HealthVerticalService`.

## Regresión

`tests/erp_ui_dentistry_patient_context_10_51.test.mjs` y el auditor Wave A fallan si reaparece cualquier dependencia del primer paciente para determinar contexto clínico.
