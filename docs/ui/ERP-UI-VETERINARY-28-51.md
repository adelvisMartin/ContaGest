# 28/51 · Veterinaria — medicación integrada

## Objetivo

Unificar la medicación veterinaria sobre la autoridad clínica existente, `CarePrescription`, y añadir etiqueta + provenance opcional hacia el producto de inventario sin crear una segunda prescripción ni consumir stock antes de que exista la autoridad de inventario clínico/lotes.

## Autoridades

- `CarePrescription`: prescripción clínica.
- `Product`: producto canónico de inventario.
- `VeterinaryMedicationPanel`: owner visual de la prescripción veterinaria.
- 28/51 **no** crea lotes ni `InventoryMovement`.

La migración extiende `CarePrescription` con:

- `productId` opcional;
- `labelSnapshot`;
- `veterinaryMeta`.

El producto enlazado es provenance, no una autorización implícita para descontar stock.

## Flujo

`POST /api/v1/verticals/veterinary/medications/prescriptions` exige:

- mascota;
- medicamento;
- dosis;
- frecuencia;
- duración.

Admite opcionalmente:

- profesional;
- encuentro;
- instrucciones;
- `productId`.

El servidor valida:

1. mascota activa y `kind=animal` del tenant;
2. profesional del mismo tenant;
3. encuentro del mismo tenant y mascota;
4. producto activo del mismo tenant, cuando se envía.

Luego crea una única fila `CarePrescription`.

## Etiqueta

El servidor genera `labelSnapshot` con:

- fecha de prescripción;
- mascota/especie/tutor;
- profesional y licencia, cuando existe;
- medicamento;
- dosis;
- frecuencia;
- duración;
- indicaciones;
- producto/SKU canónico, cuando se vinculó.

La UI presenta esa evidencia como **Etiqueta clínica**. La etiqueta no sustituye requisitos regulatorios externos ni inventa información que no exista en la prescripción.

## Provenance

`veterinaryMeta` conserva:

- versión de schema;
- `prescribedAt`;
- `actorUserId`;
- `actorEmail`;
- `inventoryProductId`;
- `inventoryConsumption='not-performed'`.

El actor procede de la sesión y no del body.

## Inventario

`GET /verticals/veterinary/medication-products` requiere además `inventory.manage`.

Si el usuario no dispone de esa autorización:

- la UI informa que el inventario no está disponible;
- la prescripción clínica continúa funcionando sin `productId`.

El vínculo de producto **no**:

- decrementa stock;
- crea `InventoryMovement`;
- reserva existencia;
- elige lote;
- crea una autoridad paralela de lotes.

La trazabilidad por lote, vencimiento y consumo corresponde al siguiente bloque de inventario clínico, que debe reutilizar el core de inventario.

## UI

`VeterinaryMedicationPanel.jsx` sustituye el formulario genérico de prescripción dentro de Veterinaria.

Incluye:

- estados error/success;
- formulario responsive;
- profesional;
- producto de inventario opcional;
- medicamento;
- dosis manual;
- frecuencia;
- duración;
- indicaciones;
- historial de prescripciones;
- etiqueta clínica;
- señal visual del producto/SKU enlazado.

No existe cálculo o recomendación automática de dosis.

## Seguridad y aislamiento

- todos los IDs se validan server-side;
- joins de prescripción ↔ profesional ↔ producto son tenant-safe;
- el endpoint de catálogo de productos tiene permiso adicional de inventario;
- el endpoint de prescripción no acepta actor desde cliente;
- la lectura existente de `/health/prescriptions` conserva `CarePrescription` como fuente única.

## QA

- `tests/erp_ui_veterinary_medication_integration_28_51.test.mjs`;
- Wave A falla si reaparece un segundo owner de prescripción;
- Wave A falla si 28/51 empieza a consumir inventario;
- build/browser/PostgreSQL/CI sólo son PASS con ejecución real sobre el SHA candidato.
