# Control Hípico · benchmark de agentes WhatsApp y política de promoción

Fecha: 2026-08-17

## Objetivo

Tomar patrones públicos útiles de productos de atención con IA sin copiar código ni asumir que un chatbot comercial resuelve por sí solo una operativa hípica monetaria.

## Patrones observados

### Verzay

Su página pública de Agente IA describe atención con audio e imágenes, secuencias, disparadores con texto/imágenes/audio/documentos y un “modo espera” que concatena mensajes.

Aplicación a Control Hípico:

- admitir contexto multimodal;
- mantener secuencias/seguimientos separados de la decisión monetaria;
- usar espera/debounce solo para conversación, nunca para fusionar automáticamente dos instrucciones de apuesta que tengan IDs distintos.

Fuente pública: https://verzay.com/agente-ia/

### WhatChimp

Su documentación pública separa campañas de entrenamiento con FAQ/URL/archivos, memoria contextual, AI para todas las consultas o como fallback, detección de intención, restricciones temáticas y handoff/assign a humanos.

Aplicación a Control Hípico:

- conocimiento versionado, no entrenamiento silencioso con cada mensaje;
- intent routing antes de generar una respuesta;
- fallback humano/fail-closed para incertidumbre;
- restricciones duras para cierres, resultados, liquidaciones, saldos y apuestas;
- registrar qué campaña/reglas/modelo produjo cada predicción.

Fuentes públicas:
- https://help.whatchimp.com/docs/ai-integration/enable-ai-agent-for-whatsapp
- https://help.whatchimp.com/docs/ai-integration/set-up-intent-detection
- https://help.whatchimp.com/docs/ai-integration/train-ai-assistant-for-chatbot-with-faq-url-file?lang=es-MX

### EazyChat

Su sitio público describe entrenamiento desde website/PDF/archivos, memoria configurable, helpdesk humano y ejecución de tareas mediante integraciones.

Aplicación a Control Hípico:

- archivos y PDFs alimentan una base de conocimiento/contexto, no una transacción;
- la IA puede proponer una acción pero la ejecución usa herramientas/reglas separadas;
- si falta certeza o la fuente entra en conflicto, se deriva a revisión.

Fuentes públicas:
- https://eazychat.io/
- https://eazychat.io/contact

### Hipócrates Salud

La información pública encontrada describe el problema de operaciones fragmentadas entre agenda, pagos, documentos y conversaciones de WhatsApp, y la intención de centralizar la operación. No se encontró documentación pública suficiente para atribuirle de forma verificable una arquitectura específica de agente WhatsApp o una API de grupos.

Fuente pública consultada: publicaciones públicas de Hipocrates Salud en LinkedIn.

## Lo que NO se adopta

Control Hípico no usará una política de “AI responde todo” para operaciones monetarias. Tampoco se permitirá que una imagen, PDF, mensaje ambiguo o similitud semántica creen una apuesta.

## Jerarquía de autoridad propuesta

1. **Mensaje explícito del participante**: única fuente candidata para una instrucción de jugada.
2. **Estado determinista**: carrera, segmento, cierre, tipo de jugada, caballo, monto y reglas deben validar.
3. **Contexto documental**: PDF/imagen/tabla puede aportar programa, pizarra o información auxiliar, pero no autoriza la transacción.
4. **IA**: clasifica, extrae, propone y explica; durante shadow no ejecuta.
5. **Ambigüedad o conflicto**: fail-closed y revisión humana.

## Aprendizaje

Los mensajes del grupo oficial se almacenan como dataset shadow:

```text
mensaje original
→ identidad/rol pseudonimizable
→ clasificación
→ entidades extraídas
→ predicción
→ contexto de carrera
→ resultado observado
→ revisión/corrección humana
```

No se cambian pesos ni reglas automáticamente por observar el chat. La promoción debe ser explícita y versionada.

## Etapas de promoción

- **Shadow source**: lee oficial, no responde allí, compara predicciones.
- **Lab mirror**: simula respuesta únicamente en `Control hípico lab`.
- **Assist**: operador aprueba sugerencias; sigue sin autonomía monetaria.
- **Limited automation**: solo intents y acciones con métricas de precisión suficientes y rollback/idempotencia demostrados.
- **Official autonomous**: etapa futura; requiere gates separados por cada operación. Nunca se promueve todo el bot de una sola vez.

## Métricas mínimas antes de promover una acción

- precisión y recall por intent;
- exactitud de caballo, tipo de jugada, monto y carrera;
- cero auto-match consigo mismo;
- cero aceptación después del cierre salvo regla explícita;
- deduplicación por ID;
- recuperación tras caída/red/reinicio;
- tasa de ambigüedad y handoff;
- discrepancias entre predicción y resultado observado;
- auditoría completa de cada decisión.

No se promete error cero. El objetivo técnico es que un caso no validado falle cerrado en lugar de convertirse en una operación incorrecta.
