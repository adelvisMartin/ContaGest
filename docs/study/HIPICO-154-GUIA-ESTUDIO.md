# Guía de estudio — Hípico #154: WhatsApp Production Compliance Gate

## 1. Compatibilidad técnica ≠ autorización

Que Playwright pueda hacer click en “Enviar” no significa que el uso esté permitido por WhatsApp ni por la ley aplicable.

```text
works technically ≠ authorized product capability
```

## 2. Tres preguntas separadas

Antes de producción hay que responder:

1. ¿La plataforma soporta/autorizó el conector y capability exactos?
2. ¿La política permite el uso concreto, aquí apuestas con dinero real?
3. ¿La jurisdicción y licencias/approvals externos están resueltos?

Fallar una sola mantiene NO-GO.

## 3. Evidencia fechada

Las políticas cambian. El evidence JSON registra `reviewedAt` y el gate rechaza evidence con más de 30 días. Esto es especialmente relevante porque WhatsApp anunció cambios de Business terms para 2026-09-23.

## 4. Política vigente revisada

Al 2026-08-29 la Business Messaging Policy oficial incluye gambling entre categorías prohibidas para los WhatsApp Business Services y señala que la prohibición aplica aunque existan licencias/aprobaciones locales o globales.

Eso basta para mantener NO-GO en este momento; no es necesario inventar que Cloud API “sí/no” soporta técnicamente grupos si no existe evidencia oficial suficiente para el caso exacto.

## 5. Adapter pattern

El dominio depende de `WhatsAppTransport`, no de Playwright/DOM/Cloud API directamente. Esto permite sustituir un conector futuro sin tocar las reglas del bot.

## 6. Fail closed

El transport productivo actual es `DisabledProductionTransport`: siempre rechaza. Un futuro transport debe declarar capability autorizada y pasar el compliance gate.

## 7. Alternativa segura

SOURCE puede seguir read-only mientras LAB recibe predicciones/sugerencias. No hace falta detener el desarrollo del parser, QA o handoff por no poder escribir productivamente.

## 8. Por qué #154 puede seguir abierto

Código del gate y decisión NO-GO pueden estar terminados, pero faltan hechos externos: jurisdicción confirmada y cualquier futura autorización/cambio de política. Un issue externo abierto representa esa dependencia; no es deuda técnica ficticia.

## Preguntas de repaso

1. ¿Por qué browser automation no prueba autorización?
2. ¿Qué pasa si todos los tests técnicos pasan pero policy dice NO-GO?
3. ¿Por qué la evidence debe caducar?
4. ¿Qué beneficio da `WhatsAppTransport`?
5. ¿Por qué no conviene codificar un `production=true` sin evidence?
