# Operación sin conexión y recuperación

## Escenario objetivo
Un operador puede perder totalmente la cobertura durante horas y aun así necesita revisar saldos, capturar manualmente, cargar llegada, liquidar y cerrar. Esas acciones viven primero en IndexedDB y no esperan a Supabase.

## Qué sigue funcionando sin Internet
- Apertura y selección de jornada/carrera previamente disponible.
- Participantes, saldos, aval y riesgo presentes en el dispositivo.
- Captura manual y análisis de bloques ya copiados/exportados.
- Motor de reglas, pizarra, liquidación, plano, disponibles y respaldos locales.
- Cola de operaciones pendientes de sincronización.

## Qué requiere Internet
- Recibir nuevos mensajes desde un webhook cloud.
- Sincronizar con otros dispositivos.
- Enviar automáticamente por WhatsApp Cloud API.

El bot cloud, si está configurado, puede seguir trabajando aunque el teléfono del operador esté sin cobertura porque corre fuera del teléfono.

## Reconexión
1. El dispositivo detecta cobertura.
2. Envía cambios locales en orden.
3. Cada cambio usa identidad/idempotencia.
4. Si el servidor avanzó mientras el teléfono estaba offline, se genera conflicto para revisión en vez de sobrescribir a ciegas.
5. La UI muestra únicamente conflictos pendientes.
