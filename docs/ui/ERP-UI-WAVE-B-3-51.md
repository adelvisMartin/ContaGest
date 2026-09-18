# 3/51 · Frontend vertical unificado — fase Veterinaria

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

Esta fase elimina el doble renderer veterinario. El ticket/roadmap 3/51 permanece abierto hasta retirar también las excepciones imperativas de Odontología y Gimnasio/Rutinas/Nutrición.
