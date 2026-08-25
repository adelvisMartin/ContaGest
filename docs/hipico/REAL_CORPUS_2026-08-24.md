# Control Hípico · corpus real de QA del 24/08/2026

## Objetivo

Este corpus se deriva de mensajes reales suministrados por el propietario para mejorar la **clasificación shadow** y la comparación `CLUB HIPICO TRIPLE CROWN (solo lectura) -> Control hípico lab`.

No es un seed de saldos vigentes y no debe aplicarse como estado monetario actual. Los importes, planos, resultados y disponibles del 24/08/2026 se usan como **evidencia histórica de QA**.

## Gramática incorporada

Se cubren explícitamente, entre otras, estas formas operativas:

- `Juego 2p del 1 50k`
- `Juego 1y2 1 con 100k`
- `Juego 1p 1 con 100k`
- `Juego 2n del 1 50k`
- `Juego 10a8 el 1 40k`
- `Juega Gaceta 3/3 (3) con 60.000,00 da Roca`
- encabezados `TERCIOS` con `Pizarra: .....`
- llegada/pizarra `2.4.10`
- liquidaciones `Juega <tercio> Bs. -...` / `Consigue <tercio> Bs. +...`
- tabla `TERCIO DISPONIBLE` con formato venezolano `1.234,56`
- cierres visuales con `CERRADO`, `NO MAS JUGADAS`, `CARRERA CERRADA`
- cierre de jornada `ESTO ES TODO POR EL DÍA DE HOY`
- confirmación corta `Se fue`, sin confundirla con conversación como `La gente se fue a dormir`.

Los teléfonos del chat original **no se versionan** en el corpus de pruebas.

## Correcciones de clasificación

1. Los montos `60.000,00`, `57.000,00`, `50k`, `100k` se convierten de forma consistente a números (`60000`, `57000`, `50000`, `100000`).
2. Se reconoce caballo con `del 1`, `el 1`, `(3)` y la forma abreviada `1p 1 con 100k`.
3. `1y2` se normaliza como `1/2` y `10a8` se conserva como `10A8` para no perder el vocabulario del grupo.
4. Un encabezado `Pizarra: .....` ya no se trata falsamente como resultado.
5. Un mensaje con `TERCIOS` y filas firmadas `Juega/Consigue Bs.` se clasifica como liquidación aunque también incluya una pizarra numérica.
6. Los planos preservan `participant`, `counterparty`, `play`, `horse` y `amount` cuando el texto lo permite.
7. Las tablas de disponibles se parsean como snapshot de conciliación; nunca actualizan saldos automáticamente.

## Mapeo a las tablas existentes

No se requiere una migración destructiva ni columnas nuevas para este corpus. La arquitectura actual ya dispone de campos JSONB adecuados:

| Evidencia | Persistencia | Uso |
| --- | --- | --- |
| Mensaje original + clasificación | `hipico_messages` | `raw_text`, `classification`, `confidence`, `normalized` |
| Evento operativo derivado | `hipico_operation_events` | `event_state='pending'`, `product_type`, `amount`, `payload.entities` |
| Predicción para comparar con LAB | `hipico_shadow_evaluations` | `predicted_payload`, `match_status='pending'` |
| Transporte/auditoría | `HipicoWebhookEvent` / `HipicoBotOutbox` | idempotencia y trazabilidad del Bridge |

`normalized` y `predicted_payload` reciben ahora entidades más ricas sin cambiar el esquema SQL. Esto evita convertir datos históricos del corpus en saldo, apuesta, resultado o liquidación real.

## Regla de seguridad del laboratorio

- `CLUB HIPICO TRIPLE CROWN`: **lectura únicamente**.
- `Control hípico lab`: único destino permitido para mensajes automáticos de QA.
- El runner local exige IDs estables `@g.us` diferentes para FUENTE y LAB.
- No hay ruta de envío al grupo fuente.
- Ninguna clasificación del corpus es `autoEligible` para efectos monetarios.

## Cómo probar

1. Ejecutar `PROBAR-HIPICO-LAB-LOCAL.cmd` desde la raíz del repositorio.
2. Si aún no existen bindings, el asistente pedirá abrir manualmente FUENTE y LAB y guardará sus IDs `@g.us` localmente.
3. El runner ejecuta los tests antes de abrir el listener.
4. Los mensajes **nuevos** del grupo fuente producen una salida shadow únicamente en LAB.
5. También se pueden escribir ejemplos directamente en LAB para comprobar la respuesta del clasificador.
6. Revisar `%LOCALAPPDATA%\ControlHipicoBridge\data\bridge.log`, `health.json` y el journal `training/` para comparar clasificación, cola y errores.

Si se detecta una cola pendiente generada por v1.3.3, el nuevo runner la preserva fuera de la cola activa por defecto para no inundar LAB con predicciones antiguas. No borra los archivos.
