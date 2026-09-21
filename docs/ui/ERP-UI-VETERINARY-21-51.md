# 21/51 · Veterinaria — un solo owner de renderer/DOM/estado

## Problema

La ruta canónica `VeterinaryClinicPageV1123.jsx` ya montaba un único React root, pero componía `VeterinaryWorkspace` desde `pages/VeterinaryClinicPage.jsx`.

Ese archivo secundario seguía siendo también un page-owner completo:

- importaba `createRoot`;
- poseía su propio `CgProvider`;
- exportaba `VeterinaryClinicPage`;
- mantenía `veterinaryClinicRoot`.

Aunque el registry no lo montaba simultáneamente, el producto conservaba dos autoridades de página capaces de poseer DOM/estado para el mismo módulo.

## Cambio

- se extrae `VeterinaryWorkspace` a `frontend/src/components/veterinary/VeterinaryWorkspace.jsx`;
- el componente queda sin `createRoot`, sin `CgProvider` y sin contrato de página;
- `VeterinaryClinicPageV1123.jsx` permanece como único page-owner;
- se elimina `frontend/src/pages/VeterinaryClinicPage.jsx`;
- el registry permanece apuntando a `VeterinaryClinicPageV1123.jsx`;
- no se cambian endpoints ni contratos de negocio veterinarios.

## Invariantes

- exactamente un `createRoot(` para la ruta veterinaria;
- exactamente un `CgProvider` en el owner canónico;
- `VeterinaryWorkspace` es sólo un componente declarativo;
- no existe un segundo archivo de página supersedido;
- dashboard, pacientes, profesionales, agenda, historia, recetas, laboratorio, estudios, hospitalización, procedimientos y comunicaciones conservan sus servicios canónicos.

## QA

- contrato dedicado `erp_ui_veterinary_single_owner_21_51.test.mjs`;
- Wave A falla si reaparece un segundo root/provider/page-owner;
- no se declara browser/runtime PASS sin ejecución real del SHA.
