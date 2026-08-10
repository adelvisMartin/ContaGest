# Hípico Control — Product Spec v1.12

## Objetivo
Hípico Control es una herramienta operacional para administrar jornadas hípicas y otros productos de apuesta, con foco en velocidad, trazabilidad y continuidad cuando el operador pierde conectividad. Web/PWA y Android deben compartir el mismo núcleo funcional.

## Principios de producto
1. **Offline-first, cloud-assisted:** captura, saldos, riesgo, cierre y consulta deben funcionar sin cobertura. La sincronización y el bot se reanudan al volver la conexión.
2. **Chat como evidencia, sistema como fuente operativa:** cada decisión debe rastrearse al mensaje, cierre, plano, pizarra y validación correspondiente.
3. **Excepciones primero:** el operador no debe releer miles de mensajes; la interfaz prioriza ambigüedades, conflictos, tardías y diferencias.
4. **Idempotencia:** reimportar un chat o repetir un webhook no crea operaciones financieras duplicadas.
5. **Ledger por participante:** el saldo pertenece al participante; caballo, parlay, POLLA y otros productos son dimensiones del movimiento.
6. **Automatización progresiva:** primero reglas determinísticas; la interpretación probabilística solo propone y no altera dinero sin gates.
7. **Una sola aplicación:** nada de etiquetas de QA, demo o “versión local” en la experiencia de uso normal.
8. **Escucha en vivo como requisito de operación:** al comenzar una jornada, Hípico Control debe poder mantener activo un conector de ingreso que reciba cada mensaje nuevo del canal configurado en tiempo real o casi real. Los chats que el usuario suministra durante desarrollo son corpus de entrenamiento/regresión; no sustituyen la captura de producción.

## Casos principales
- Abrir jornada/carrera, capturar ofertas Juega/Consigue, emparejar por monto disponible y cerrar recepción.
- Escuchar el canal operativo durante la jornada, persistir cada mensaje recibido antes de interpretarlo y reflejar inmediatamente su estado en Operations Inbox.
- Importar/compartir bloques de WhatsApp como respaldo, entrenamiento, recuperación o reconciliación; nunca como única vía prevista de operación normal.
- Separar respuestas citadas, cierres, resultados, planos, balances, mensajes administrativos y conversación no operacional.
- Generar plano previo, liquidación y disponibles con la misma lógica heredada del Archivo GC.
- Operar sin Internet y sincronizar al recuperar cobertura.
- Bot cloud para canales oficialmente soportados por WhatsApp Business Platform; conectores alternativos permitidos solo cuando su alcance, riesgos y continuidad estén expresamente validados.
- Reconciliar liquidación y tabla de disponibles publicadas contra el estado interno.

## Contrato de ingestión en vivo
Todo conector de mensajería debe entregar al núcleo, como mínimo: `channelId`, `messageId`, `senderId`, `timestamp`, `text/type`, referencia al mensaje citado cuando exista, y copia cruda suficiente para auditoría. El núcleo debe persistir primero y procesar después.

Estados mínimos del listener:
- `CONNECTED`: recibiendo eventos normalmente.
- `DEGRADED`: recibe parcialmente o con retraso; advertir al operador.
- `OFFLINE`: no existe conexión con el origen; mantener operación local y cola de sincronización.
- `CATCHING_UP`: recuperando mensajes posteriores al último cursor/ID conocido.
- `SYNCED`: recuperación finalizada sin huecos conocidos.

## Gates obligatorios de escucha
- Un mensaje nuevo del canal configurado aparece en `hipico_messages` una sola vez.
- Repetir el mismo evento, webhook o lote no duplica el mensaje ni la apuesta.
- Una respuesta citada conserva el vínculo con su mensaje padre.
- Un cierre recibido por un administrador autorizado cambia el estado de la carrera antes de aceptar mensajes posteriores.
- Tras una interrupción, el conector recupera desde el último cursor/ID verificable o marca explícitamente cualquier hueco; nunca finge continuidad.
- El panel muestra salud del listener, última recepción, retraso estimado, backlog y último evento sincronizado.
- La automatización no se declara lista para producción mientras el canal real del grupo no haya demostrado captura continua en una jornada controlada.

## No negociables
- Ningún mensaje posterior al cierre entra a la carrera cerrada sin autorización explícita.
- Ninguna respuesta corta (`Sf`, `J`, `30k`) crea por sí sola una apuesta.
- Ningún saldo se corrige borrando historia; se revierte o ajusta con auditoría.
- Ninguna clave de Meta o Supabase Service Role llega al frontend.
- Los corpus históricos sirven para entrenar, probar y reproducir jornadas; la jornada real exige listener activo o un modo de contingencia claramente señalado.
