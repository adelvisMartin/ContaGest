# 22/51 · Veterinaria — error handling real

## Objetivo

Eliminar silencios como `.catch(()=>null)` y `catch{}` en la experiencia veterinaria. Un fallo remoto debe ser visible, reintentable y no destruir la última información válida ya cargada.

## Comportamiento

### Expediente rápido

`VeterinaryClinicPageV1123.jsx` mantiene estados independientes para:

- error de lista/base de mascotas;
- error de historia reciente;
- error de guardado de ficha.

Cada error se muestra con `CgState` y, para lecturas, ofrece **Reintentar**. Si una recarga falla, los arrays previos no se reemplazan por datos vacíos.

### Workspace clínico

`VeterinaryWorkspace.jsx` mantiene:

- `baseError`;
- `patientDataError`;
- `actionError`.

Las recargas base/historia retornan éxito explícito. `refreshAll` sólo muestra “Información actualizada” si ambas lecturas terminan correctamente.

Acciones de guardado, archivo, cita, comunicación y actualización de estado ya no tienen `catch{}` silencioso.

## Logging

Se usa logging frontend local y seguro con:

- scope;
- nombre de error;
- mensaje;
- status/statusCode.

No se serializan formularios, pacientes ni `clinicalData` en consola.

## Conservación de estado

La regla es fail-soft:

- lectura exitosa → reemplaza por nueva respuesta;
- lectura fallida → conserva el último estado válido;
- ausencia explícita de paciente → sí limpia el contexto dependiente.

## Hardening posterior

Tras 24/51–29/51 aparecieron nuevas superficies veterinarias hijas. 22/51 se reaplica sobre ellas para que el contrato de error handling siga siendo transversal:

- `VeterinaryLongitudinalRecord`;
- `VeterinaryPreventiveCarePanel`;
- `VeterinaryTreatmentSheet`;
- `VeterinaryMedicationPanel`;
- `VeterinaryClinicalInventoryPanel`.

Todas reportan errores mediante `veterinaryError.js`, que limita el logging a `scope/name/message/status` y no serializa formularios ni payloads clínicos.

La lectura opcional de productos en `VeterinaryMedicationPanel` ahora:

- conserva el último catálogo válido ante errores transitorios;
- limpia el catálogo sólo ante pérdida explícita de permiso;
- expone **Reintentar**;
- no bloquea la prescripción clínica cuando `inventory.manage` no está disponible.

## QA

- `erp_ui_veterinary_error_handling_22_51.test.mjs`;
- Wave A bloquea reintroducción de `.catch(()=>null)` o `catch{}`;
- source contract exige errores persistentes, retry y logging seguro.


## Hardening posterior 30/51–32/51

Las superficies añadidas después del primer hardening también quedan bajo el mismo contrato:

- `VeterinaryFinancialPanel`;
- `VeterinaryGuardianPortalPanel`;
- `VeterinaryBoardingPanel`.

Todas usan `reportVeterinaryError`, conservan error persistente en UI y ofrecen **Reintentar** en lecturas.

En el portal del tutor se cerraron dos huecos concretos:

- un fallo de `navigator.clipboard` ya no usa `catch{}`: se registra de forma segura y permanece visible;
- si falla el registro de `CareCommunicationLog`, el canal externo aún puede abrirse, pero la UI informa que la comunicación no quedó auditada en el ERP.

El reporter sigue sin serializar el enlace secreto del portal, formularios ni payloads clínicos.
