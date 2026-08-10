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

## Casos principales
- Abrir jornada/carrera, capturar ofertas Juega/Consigue, emparejar por monto disponible y cerrar recepción.
- Importar/compartir bloques de WhatsApp, separar respuestas citadas, cierres y resultados.
- Generar plano previo, liquidación y disponibles con la misma lógica heredada del Archivo GC.
- Operar sin Internet y sincronizar al recuperar cobertura.
- Bot cloud opcional para canales oficialmente soportados por WhatsApp Business Platform.
- Reconciliar liquidación y tabla de disponibles publicadas contra el estado interno.

## No negociables
- Ningún mensaje posterior al cierre entra a la carrera cerrada sin autorización explícita.
- Ninguna respuesta corta (`Sf`, `J`, `30k`) crea por sí sola una apuesta.
- Ningún saldo se corrige borrando historia; se revierte o ajusta con auditoría.
- Ninguna clave de Meta o Supabase Service Role llega al frontend.
