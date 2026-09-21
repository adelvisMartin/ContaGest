# ERP UI · Odontología · 19/51 Agenda avanzada

## Objetivo

Extender la agenda odontológica existente sin crear una segunda autoridad de citas.

## Autoridad

Se reutiliza `CareAppointment` como única fuente de verdad:

- `startsAt` / `endsAt`: franja y duración.
- `professionalId`: profesional asignado.
- `room`: sillón o recurso clínico.
- `status=waitlisted`: lista de espera sin reservar capacidad.
- `status=scheduled|confirmed|checked_in|in_progress`: estados que sí reservan la franja.
- `recallDueAt`: próxima fecha de recall.
- `schedulingMeta`: actor/fecha de creación, confirmación, conversión de espera y actualización de recall.

## Concurrencia y conflictos

Las altas y modificaciones:

1. adquieren un advisory lock transaccional por tenant;
2. bloquean la fila cuando existe;
3. verifican solapamiento por paciente, profesional y sillón/recurso;
4. excluyen estados terminales y lista de espera;
5. responden 409 cuando la franja está ocupada.

La condición de solapamiento es semiabierta: una cita puede comenzar exactamente cuando termina otra.

## Lista de espera

Una fila `waitlisted` conserva fecha/hora/duración preferidas, pero no bloquea profesional ni sillón. La acción **Intentar programar** convierte la fila a `scheduled` sólo si la verificación transaccional encuentra la franja libre.

## Confirmación

La transición `scheduled → confirmed` queda registrada server-side dentro de `schedulingMeta.confirmation`, incluyendo actor y timestamp.

## Recall

Una cita completada puede almacenar `recallDueAt`. El GET de agenda incluye filas cuyo recall cae dentro del rango consultado aunque la cita original sea anterior al rango.

## Frontend

`DentalSchedulePanel.jsx` es el único owner de la agenda odontológica visible:

- paciente;
- profesional;
- sillón/recurso;
- fecha/hora;
- duración 30/45/60/90/120 min;
- motivo;
- lista de espera;
- confirmación;
- conversión de espera;
- recall.

Se elimina el formulario legacy de cita y la lista duplicada de “Próximas citas” de `DentistryPracticePage.jsx`.

## Límites

Este punto no implementa:

- recordatorios externos por WhatsApp/email;
- disponibilidad recurrente del profesional;
- múltiples sedes;
- facturación de la cita;
- optimización automática de agenda.

Esos comportamientos requieren reglas de negocio adicionales y no se infieren automáticamente de 19/51.
