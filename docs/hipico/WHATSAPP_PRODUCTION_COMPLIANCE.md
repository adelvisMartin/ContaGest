# Control Hípico — WhatsApp Production Compliance Gate (#154)

**Revisión:** 2026-08-29  
**Decisión actual:** **NO-GO para escritura automatizada al grupo real**.

## Qué está demostrado

La revisión usa fuentes oficiales vigentes al 2026-08-29. La WhatsApp Business Messaging Policy prohíbe usar WhatsApp Business Services para comprar, vender, promover o facilitar determinados bienes/servicios regulados o restringidos, incluyendo **gambling**; la propia política indica que esas prohibiciones aplican incluso cuando el negocio posee licencias/aprobaciones locales o globales.

WhatsApp Business Solution Terms obliga además a cumplir la Business Messaging Policy y la documentación técnica/productiva. Los Terms/Help Center generales mantienen restricciones frente a auto-messaging/non-personal use no autorizado.

Por tanto, que browser automation pueda escribir técnicamente en un grupo **no demuestra autorización productiva**.

## Lo que NO está demostrado

- jurisdicción exacta del grupo/operación;
- una capability oficial/autorizada para el caso exacto de escritura grupal automatizada;
- permiso de la política vigente para este flujo de apuestas con dinero real;
- approvals/licencias externas suficientes para levantar la prohibición de plataforma;
- autorización específica de Meta/WhatsApp para el conector pretendido.

La falta de esos datos se representa explícitamente como NO-GO; no se rellena por inferencia.

## Fuentes oficiales revisadas

- `https://business.whatsapp.com/policy/` — WhatsApp Business Messaging Policy.
- `https://www.whatsapp.com/legal/business-solution-terms` — WhatsApp Business Solution Terms.
- `https://www.whatsapp.com/legal/terms-of-service` — WhatsApp Terms of Service.
- `https://faq.whatsapp.com/5957850900902049` — Unauthorized use of automated or bulk messaging.
- `https://www.whatsapp.com/legal/` — legal hub; anuncia cambios de Business terms con vigencia 2026-09-23.

Debido a ese cambio anunciado para septiembre de 2026, este gate exige evidencia de política reciente (<30 días) antes de reconsiderar una promoción.

## Arquitectura

`WhatsAppTransport` separa dominio/bot del conector:

- `LabMemoryTransport`: sólo `mode=lab`;
- `DisabledProductionTransport`: siempre rechaza;
- cualquier futuro adapter productivo debe declarar `capability=authorized-production` y pasar el gate.

No existe adapter productivo habilitado en este cambio.

## Gate

`evaluateWhatsAppProductionCompliance()` exige simultáneamente:

- evidence decision GO;
- connector exacto identificado;
- capability de plataforma autorizada;
- policy que permita el uso pretendido;
- jurisdicción confirmada;
- approvals requeridos obtenidos;
- evidence fechada y fresca.

Falta de cualquiera => `NO_GO`.

## Alternativa segura actual

Mantener SOURCE read-only y ejecutar análisis, replay y respuestas sugeridas únicamente en LAB/local. El operador humano puede usar un workflow independiente que sea legal y permitido por la plataforma; el software no habilita escritura productiva directa mientras este gate sea NO-GO.

## Relación con #121

#121 debe tratar este resultado como bloqueo de capability productiva. Superar accuracy, physical QA o soak **no anula** este NO-GO de plataforma/compliance.

## Estado del issue

La parte técnica del gate queda implementada, pero #154 no debe cerrarse como “GO” mientras jurisdicción/capability/autorizaciones sigan sin evidencia. Una futura reevaluación debe actualizar el JSON de evidence, fuentes y fecha; nunca sólo un booleano en frontend.
