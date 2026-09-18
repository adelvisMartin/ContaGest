# 13/51 · Historial versionado del odontograma

## Objetivo

Registrar y mostrar la evolución clínica por superficie sin convertir la UI en una segunda autoridad ni reescribir encuentros previos.

## Modelo

Cada `dental-treatment` continúa siendo un encuentro append-only en `CareEncounter`. Para cada combinación `dentition + tooth + surface`, la UI deriva:

- versión `vN`;
- condición previa;
- cambio `previa → nueva`;
- actor autenticado;
- profesional asociado cuando exista;
- motivo del cambio.

Los encuentros se ordenan cronológicamente y la versión se calcula por superficie. No existe `updateEncounter`, borrado ni tabla paralela de historia.

## Provenance

El cliente envía `odontogram.changeReason`, validado por backend. El backend añade `odontogram.actorUserId` desde `ctx(req).userId`, por lo que el navegador no puede elegir quién figura como actor.

`professionalName` continúa viniendo del JOIN de `CareProfessional` al leer encuentros y se presenta como contexto clínico adicional.

## Compatibilidad

Los tratamientos previos a 13/51 siguen visibles. Si carecen de motivo/actor se muestran explícitamente como `Motivo no registrado (legado)` / autor no disponible; no se inventa provenance.

## Persistencia

Se mantiene `CareEncounter.clinicalData` JSONB. No hay migración ni reescritura de historia. 11/51 sigue siendo autoridad del odontograma estructurado y 12/51 del selector visual controlado.

## QA

- regresión 13/51 valida versión, condición previa, cambio, autor y motivo;
- regresión 11/51 se actualiza para aceptar la copia JSONB enriquecida server-side;
- Wave A falla si desaparecen los contratos de historial/provenance;
- browser 360/390/430/768/1366 permanece `NOT_EXECUTED` mientras #134 bloquee runners.