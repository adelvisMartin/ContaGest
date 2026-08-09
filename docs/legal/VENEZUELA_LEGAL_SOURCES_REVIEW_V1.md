# ContaGest-VE — Fuentes jurídicas venezolanas de referencia v1

**Revisión técnica de fuentes: 2026-08-09.** Este archivo no sustituye dictamen jurídico. Su función es indicarle al abogado qué fuentes se usaron para diseñar controles y qué afirmaciones deben validarse antes de clientes reales.

## Constitución de la República Bolivariana de Venezuela

### Artículo 28 — información y datos personales

Reconoce el derecho de la persona a acceder a información/datos sobre sí o sus bienes que consten en registros oficiales o privados, conocer su uso/finalidad y solicitar actualización, rectificación o destrucción cuando sean erróneos o afecten ilegítimamente derechos.

**Traducción de producto:** inventario de datos, finalidad clara, canal de privacidad, corrección controlada, minimización y trazabilidad. No significa que todo dato empresarial pueda borrarse de inmediato: deben revisarse obligaciones legales de conservación, derechos de terceros, auditoría y legal hold.

### Artículo 60 — vida privada, intimidad y confidencialidad

Protege honor, vida privada, intimidad, imagen, confidencialidad y reputación; además ordena limitar el uso de la informática para proteger esos derechos.

**Traducción de producto:** aislamiento tenant/RIF, RBAC, least privilege, sesiones seguras, logs minimizados, privacidad por defecto y evaluación reforzada para datos clínicos.

### Artículo 117 — información adecuada y no engañosa / trato digno

Reconoce el derecho a servicios de calidad, información adecuada y no engañosa, libertad de elección y trato equitativo/digno.

**Traducción de producto:** precios, límites, renovación, soporte, módulos, suspensión y claims deben ser comprensibles y verificables. No utilizar “100% seguro”, “cumplimiento total”, “todos los bancos” u otras afirmaciones absolutas sin evidencia.

## Decreto-Ley sobre Mensajes de Datos y Firmas Electrónicas (2001)

### Artículos 1, 4 y 5

Reconocen valor jurídico/probatorio de mensajes de datos y mantienen sometimiento a garantías constitucionales sobre privacidad y acceso a información personal.

### Artículos 7 y 8

Tratan integridad y conservación/accesibilidad del mensaje de datos, incluyendo datos que permitan determinar origen/destino y fecha/hora cuando aplique.

**Traducción de producto:** la aceptación electrónica debe ser reconstruible: documento, versión, hash, usuario, tenant, fecha/hora y método. Esto es evidencia de aceptación electrónica; **no debe publicitarse automáticamente como una firma electrónica certificada**.

### Artículo 15

Permite que las partes acuerden que oferta y aceptación contractual se expresen por mensajes de datos.

**Traducción de producto:** el flujo web de aceptación puede formar parte del contrato electrónico, sujeto a que el abogado valide el contrato concreto, capacidad/representación y cualquier formalidad especial aplicable.

## Ley Especial contra los Delitos Informáticos (2001)

### Artículos 6–12

Tipifica, entre otras conductas, acceso indebido, sabotaje/daño a sistemas, acceso o sabotaje sobre sistemas protegidos, espionaje informático y falsificación de documentos informáticos.

### Artículos 20–22

Contempla conductas contra privacidad de data/información personal, privacidad de comunicaciones y revelación indebida.

### Artículo 26

Contempla la oferta engañosa mediante tecnologías de información cuando se atribuyen características falsas o inciertas que puedan perjudicar al consumidor.

**Traducción de producto:** la Política de Uso Aceptable puede prohibir tenant escape, acceso no autorizado, malware, manipulación, falsificación y abuso; el equipo de marketing debe evitar claims técnicos falsos o inciertos. La política contractual no sustituye la ley penal ni autoriza al proveedor a atribuir delitos sin investigación suficiente.

## Fuentes que el abogado debe validar en su versión vigente antes de producción

- régimen de protección al consumidor/usuario aplicable al modelo SaaS y a la naturaleza B2B/B2C de cada cliente;
- Código de Comercio y obligaciones de libros/documentos;
- Código Orgánico Tributario y normativa SENIAT aplicable a conservación, facturación y documentos fiscales;
- reglas sobre moneda, facturación, impuestos, comisiones y servicios digitales;
- normativa sanitaria, historia clínica, confidencialidad y ética profesional para cada rama de salud humana;
- normativa aplicable a veterinaria y a datos personales de propietarios;
- cualquier exigencia sectorial del cliente (colegios profesionales, aseguradoras, contratos, autoridades, etc.).

## Regla de release

Las fuentes anteriores justifican **preguntas y controles de ingeniería**, no un sello de “cumplimiento legal”. Antes del primer cliente real, `docs/legal/PRODUCTION_LEGAL_CHECKLIST.md` debe cerrarse con evidencia de revisión de un abogado competente en Venezuela y con la identidad real del prestador configurada.
