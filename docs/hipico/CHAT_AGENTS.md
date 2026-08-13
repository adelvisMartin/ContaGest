# Equipo especializado para mensajes — Hípico Control v1.12

## Principio
No se usan quince modelos de IA leyendo cada mensaje. Con miles de mensajes diarios eso sería más lento, costoso y menos determinístico. El sistema usa un router barato y reglas especializadas; cada tipo de evento pasa al especialista correspondiente. El agente semántico solo interviene cuando las reglas no alcanzan. Las operaciones monetarias pasan además por un supervisor/gate.

## Equipo

| Agente | Lee / resuelve | Salida principal | Puede actuar solo |
|---|---|---|---|
| Centinela de Ingreso | Cada mensaje entrante | Persistencia, ID, timestamp, hash, deduplicación | Sí; nunca crea apuestas |
| Identidad y Participantes | Remitente, teléfono, alias, código | Participante/rol probable | Sí si coincide de forma inequívoca |
| Contexto de Carrera | Hipódromo, carrera, segmento, estado | Carrera y ventana OPEN/CLOSED | Sí con contexto confirmado |
| Tercios y Caballos | Juega/Consigue, 1/2, 2N, 3P, PP, caballo y monto | Oferta estructurada | No mueve dinero; propone/actualiza ticket |
| Parleys | Tickets con varias selecciones | Ticket + legs | No hasta tener motor/reglas completas |
| Respuestas y Correlación | Citas, 30k, J, Jugando, Sf, Se fue | Enlace con oferta origen | Solo con una única relación de alta confianza |
| Cierres | CERRADO, NO MÁS JUGADAS, cierre de jornada | Estado cerrado y tardías | Sí si emisor/estado autorizados |
| Llegadas y Pizarra | LLEGADA/PIZARRA | Orden oficial candidato | Puede cargar candidato; liquidación monetaria exige gate |
| Liquidación | Plano con importes Juega/Consigue | Comparación motor vs publicado | No sobrescribe ledger |
| Disponibles y Conciliación | TERCIO/DISPONIBLE | Diferencias por participante | No sobrescribe saldo |
| Conversación y Ruido | Saludos, comentarios, emojis, charla | Archivo silencioso | Sí |
| Riesgo y Cobertura | Disponible, aval, exposición | OK / excede / requiere autorización | Bloquea, no concede excepciones |
| Publicación | Acuse, plano, liquidación, disponibles, cierre | Mensaje preparado/outbox | Solo si gates están aprobados |
| Escalamiento Semántico | Casos ambiguos/no reconocidos | Hipótesis + confianza + evidencia | Nunca altera dinero por sí solo |
| Supervisor Operacional | Resultados de especialistas | AUTO / REVISAR / BLOQUEAR | Gate final de automatización |

## Flujo por mensaje
1. Centinela persiste primero.
2. Identidad y Contexto enriquecen el mensaje.
3. Router asigna un especialista principal.
4. El especialista produce un evento estructurado y evidencia.
5. Riesgo/Cobertura interviene si existe exposición monetaria.
6. Supervisor decide AUTO, REVISAR o BLOQUEAR.
7. Publicación escribe al outbox; el sender es el único componente autorizado para enviar.

## Regla de precisión
- No se acepta una apuesta por similitud textual solamente.
- `Sf`, `J`, `30k` y equivalentes requieren contexto enlazable.
- Tras cierre, toda oferta posterior queda tardía salvo autorización explícita.
- Un plano repetido es evidencia/snapshot, no nuevas apuestas.
- Un snapshot de disponibles sirve para reconciliar; no reemplaza el ledger.
- Una inferencia semántica de baja confianza se convierte en tarea de revisión, no en respuesta inventada.

## Intervención del operador
La intervención no ocurre únicamente al final de la jornada. Durante la operación, la pantalla debe interrumpir al operador solo por excepciones P0/P1: ambigüedad que afecta dinero, conflicto de pareja, saldo/cobertura insuficiente, fuente de resultado dudosa, hueco del listener o intento posterior al cierre. Al cierre de cada carrera se hace una revisión breve del estado; al final de la jornada se hace la conciliación global y publicación final.
