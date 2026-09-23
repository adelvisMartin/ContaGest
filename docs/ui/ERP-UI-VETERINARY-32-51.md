# 32/51 · Veterinaria · Boarding / recursos opcionales

## Alcance

Este bloque implementa jaulas/espacios, disponibilidad y estancia como módulo opcional para clínicas que realmente lo necesiten.

No convierte boarding en hospitalización ni crea una segunda autoridad clínica.

## Fronteras de autoridad

- CareHospitalization continúa siendo la autoridad clínica para hospitalización, diagnóstico, tratamiento y alta.
- VeterinaryBoardingResource modela únicamente recursos operativos: jaula, canil, habitación, aislamiento u otro espacio.
- VeterinaryBoardingStay modela reserva/ocupación temporal del recurso.
- VeterinaryBoardingSetting habilita o deshabilita el módulo por tenant y nace desactivado.
- No se crean facturas, movimientos de inventario, prescripciones ni CareEncounter desde este flujo.

## Opcional por tenant

GET /api/v1/verticals/veterinary/boarding/settings expone el estado.
PATCH /api/v1/verticals/veterinary/boarding/settings requiere admin.manage. Desactivar el módulo se rechaza mientras existan reservas o ingresos activos, para no dejar estancias sin posibilidad de cierre.

## Disponibilidad

La disponibilidad se deriva del estado del recurso y de estancias reserved/checked_in que solapen la ventana solicitada. No existe un contador de disponibilidad paralelo.

## Concurrencia

Crear una reserva adquiere advisory locks por tenant+resource y tenant+patient y vuelve a comprobar solapamientos antes de persistir. El check-in rechaza reservas vencidas y vuelve a verificar que no exista otra estancia solapada en el mismo recurso.

## Estados

- Recurso: active, maintenance, inactive.
- Estancia: reserved → checked_in | cancelled.
- checked_in → completed | cancelled.
- completed/cancelled son terminales.
- Un recurso con estancia activa/reservada no puede pasar a mantenimiento/inactivo.

## UI

VeterinaryBoardingPanel.jsx es el único owner visual. Incluye activación opcional, ventana de disponibilidad, recursos, reserva para la mascota seleccionada, ingreso/finalización/cancelación, retry/error y layout responsive.

## Seguridad e integridad

- health.manage en el router veterinario.
- admin.manage para habilitar/deshabilitar el módulo.
- mascota animal activa validada server-side.
- FKs restrictivas y checks temporales.
- RLS habilitado y acceso directo revocado a anon/authenticated.
- AuditLog en configuración, recursos y transiciones.
- sin autoasignación ni recomendación automática de recursos.

## Fuera de alcance

No se implementan recomendación automática de jaula, capacidad inferida por especie/peso, facturación automática de noches, hospitalización clínica, calendario de personal ni sensores/IoT.