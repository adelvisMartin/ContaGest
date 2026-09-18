# 3/51 · Frontend vertical unificado

Baseline de fase: `main@3bbb7d776cc2245fb893760c276b90357071ae95`.

## Objetivo

Eliminar el doble lifecycle de la ruta `veterinaria` sin perder ninguna capacidad clínica. El dossier rápido y el workspace completo deben pertenecer al mismo árbol React, compartir la autoridad de theme de `CgProvider` y mantener los contratos de servicio existentes.

## Cambio

- `VeterinaryWorkspace` pasa a ser un componente React exportado y provider-neutral.
- Consume `useTheme()` en lugar de crear un segundo theme.
- El wrapper `VeterinaryClinicPageV1123.jsx` deja de importar/montar `VeterinaryClinicLegacy`.
- La ruta crea exactamente un `createRoot()`.
- Bajo ese root se montan `VeterinaryDossier` y `VeterinaryWorkspace` dentro de un único `CgProvider`.
- El page object de compatibilidad de `VeterinaryClinicPage.jsx` sigue disponible para consumidores directos, pero también usa `CgProvider`; el registry productivo continúa apuntando a V1123.
- El manifest Wave A cambia Veterinaria de `LEGACY_EXCEPTION_APPROVED` a `MIGRATED` y su presupuesto `legacyVetImport` pasa a cero.

## Invariantes preservadas

No cambian endpoints, servicios, payloads, RBAC, tenant isolation, CRUD clínico, agenda, laboratorio, estudios, hospitalización, procedimientos, comunicaciones, URL state ni persistencia.

## Gate

El auditor Wave A falla si una ruta `MIGRATED` conserva exception metadata. Para Veterinaria además falla si reaparece `VeterinaryClinicLegacy`, un lifecycle `.render/.mount` anidado o más de un React root en V1123.

La evidencia browser sigue siendo independiente: SOURCE PASS no implica Chromium PASS.

## Estado del 3/51

### Fase Odontología\n\nOdontología deja de usar HTML strings, `mountSubmit`, listeners DOM y el kit `components/ui/index.js`. `DentistryPracticePage.jsx` conserva los service contracts de pacientes, profesionales, citas y encuentros; el odontograma usa estado React controlado y botones Cg accesibles. El registry apunta al renderer JSX y el archivo imperativo anterior se elimina.\n\nEl ticket/roadmap 3/51 permanece abierto únicamente por la superficie compartida Gimnasio/Rutinas/Nutrición.


### Fase Fitness — Gimnasio / Rutinas / Nutrición

Las tres rutas comparten ahora `GymManagementPage.jsx` como renderer declarativo. El page object crea un único React root con `CgProvider`; tabs, formularios, métricas, listas, estados y acciones se gestionan con estado React y Cg*/MUI.

Las capacidades productivas existentes se preservan: summary, miembros, instructores, planes, membresías, check-in, evaluaciones, rutinas, nutrición y clases. Las herramientas rápidas de rutina/nutrición, CSV y FoodData Central pasan a `FitnessProductivityTools.jsx` y dejan de inyectarse mediante `MutationObserver`.

Se retiran `GymManagementPage.js` y `fitnessProductivityEnhancer.js`. El auditor Wave A bloquea la reintroducción de lifecycle DOM imperativo, enhancer por mutación o múltiples React roots.

## Cierre de 3/51

Las cinco rutas de Wave A quedan `MIGRATED` en source. La evidencia browser 360/390/430/768/1366 sigue separada y permanece `NOT_EXECUTED` mientras no exista runner aprobado.
