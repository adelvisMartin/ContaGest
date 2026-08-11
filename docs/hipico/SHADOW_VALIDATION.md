# Hípico Control — Validación sombra contra operación real

## Objetivo
Antes de permitir que Hípico Control responda en el grupo de trabajo, observar una o más jornadas reales en modo lectura, generar en paralelo lo que la automatización **habría hecho** y publicar esas respuestas únicamente en `Control hípico lab`.

El grupo real nunca recibe respuestas del bot durante esta fase.

## Topología

```text
GRUPO REAL (fuente, solo lectura)
          │
          ▼
WhatsApp Business vinculado al Bridge
          │
          ▼
Hípico Control / agentes / ledger / reglas
          │
          ├── registra predicción y tiempo
          │
          └── publica simulación
                    │
                    ▼
            CONTROL HÍPICO LAB

En paralelo:
Administradores/chica responden en el GRUPO REAL
          │
          ▼
Hípico captura su respuesta real
          │
          ▼
Comparador: predicción vs respuesta observada
```

## Regla de seguridad
Con `HIPICO_SHADOW_MODE=true` cualquier acción producida por un mensaje del grupo fuente se enruta exclusivamente al grupo laboratorio. No debe existir una ruta de envío al grupo fuente.

## Qué se compara
No se exige que el texto sea idéntico. Se compara equivalencia operacional:
- misma carrera/hipódromo;
- mismo participante y contraparte;
- mismo tipo de jugada;
- mismo caballo/selección;
- mismo monto aceptado/pendiente;
- mismo estado (espera, confirmada, tardía, cerrada);
- mismo cierre;
- misma llegada/pizarra;
- misma liquidación;
- mismos disponibles y conciliación;
- mismo efecto sobre ledger;
- tiempo de respuesta razonable.

## Matriz de resultado
- `matched`: misma salida operacional y datos.
- `equivalent`: redacción distinta pero misma decisión/efecto.
- `different`: decisión o dato distinto.
- `unsafe`: Hípico habría aceptado/publicado algo que debía bloquearse o revisar.
- `not_applicable`: conversación/ruido sin acción.

## Gates antes de responder en producción
No se habilita envío en el grupo real hasta acumular jornadas representativas con:
1. cero falsos positivos monetarios;
2. cero mensajes posteriores al cierre aceptados automáticamente;
3. cero duplicados de apuestas/ledger;
4. 100 % de cierres y llegadas críticas detectados o escalados;
5. conciliación final sin diferencias no explicadas;
6. ningún `Sf`, `J`, `30k` o respuesta corta resuelto sin contexto suficiente;
7. recuperación probada tras cortes y reconexión;
8. tasa de coincidencia operacional >= 99 % para eventos automatizables;
9. todos los eventos `unsafe` reducidos a cero antes del gate;
10. aprobación manual final de una jornada completa en modo sombra.

## Fases
### Fase 0 — Laboratorio puro
Fuente y respuesta dentro de `Control hípico lab`. Se prueban QR, listener, backend, Supabase, deduplicación y respuesta E2E.

### Fase 1 — Sombra real
El Bridge escucha el grupo real pero cualquier respuesta simulada va únicamente al laboratorio. El bot no escribe en el grupo real.

### Fase 2 — Asistido
En producción solo se habilitan acciones de riesgo muy bajo previamente certificadas; las monetarias siguen con confirmación humana.

### Fase 3 — Automatización graduada
Se habilitan familias de eventos una a una: acuses, correlación inequívoca, cierre, tardías, planos, liquidación, disponibles. Un gate puede volver a `solo lectura` automáticamente si aparece una anomalía.

## Evidencia de jornada
Al terminar, Hípico genera un informe con:
- mensajes fuente;
- decisiones del bot;
- respuestas reales observadas;
- coincidencias/equivalencias/diferencias;
- tiempos;
- intervenciones humanas;
- duplicados;
- tardías;
- cierres;
- diferencias de saldo;
- errores de listener;
- porcentaje de cobertura y precisión.

## Criterio central
La comparación se hace contra **lo que realmente hicieron los administradores**, no contra una respuesta inventada de laboratorio. El laboratorio es solamente el destino seguro donde Hípico muestra lo que habría publicado.
