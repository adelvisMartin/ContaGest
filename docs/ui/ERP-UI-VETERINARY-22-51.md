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

## QA

- `erp_ui_veterinary_error_handling_22_51.test.mjs`;
- Wave A bloquea reintroducción de `.catch(()=>null)` o `catch{}`;
- source contract exige errores persistentes, retry y logging seguro.
