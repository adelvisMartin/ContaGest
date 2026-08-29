# Guía de estudio — Hípico #153: Conversational AppSec

## 1. El mensaje no es una instrucción privilegiada

Aunque un texto diga `ADMIN`, `SYSTEM` o “ignora las reglas”, sigue siendo input del usuario. Autenticación y autorización ocurren fuera del texto libre.

## 2. Sanitizar para analizar, no para reescribir la evidencia

Conviene conservar raw evidence según la política de privacidad, pero el parser recibe una representación normalizada. Así podemos investigar lo recibido sin dejar que bidi/HTML/control chars alteren el análisis.

## 3. Unicode hostil

Caracteres bidi y zero-width pueden cambiar cómo un humano ve el texto o esconder separadores. NFKC + removal de controles reduce ambigüedad, aunque no resuelve todos los homoglyphs.

## 4. Prompt/social injection

Si en el futuro existe un LLM, frases como “ignora instrucciones” no deben mezclarse con system/policy. En el diseño actual se detectan y fuerzan `review` antes de una decisión automática.

## 5. Aislamiento

El rate limiter usa `group + participant`. Esto evita que el participante A haga DoS lógico de toda la conversación.

## 6. Repetition limit

Un flood idéntico suele indicar retry defectuoso o abuso. Limitar repetición reduce respuestas duplicadas y consumo de recursos sin bloquear mensajes legítimos distintos.

## 7. Cross-participant privacy

Un participante no debe obtener saldo/historial de otro sólo por mencionarlo. Las solicitudes sospechosas se escalan; la autorización real debe ocurrir en backend.

## 8. Media y replies

Si audio/documento no está soportado explícitamente, no se “adivina” su contenido. Quote depth excesivo también se manda a review para evitar cadenas descontextualizadas.

## 9. Qué estudiar

- `hipico-conversation-appsec.ts`: trust boundary + sanitizer + rate limiter.
- `hipico-conversation-appsec.corpus.ts`: corpus adversarial.
- `hipico-bridge.routes.ts`: integración antes del parser/engine.
- #152: comandos autenticados fuera del chat.

## Preguntas de repaso

1. ¿Por qué conservar raw y analizar sanitized son objetivos distintos?
2. ¿Qué riesgo introducen bidi/zero-width?
3. ¿Por qué un fake admin no debe llegar al command handler?
4. ¿Cómo evitar que el flood de un usuario bloquee a todos?
5. ¿Qué significa `autoEligible=false` en un abuse signal?
6. ¿Por qué media no soportada debe fallar hacia revisión?
