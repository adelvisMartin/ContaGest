# Guía de estudio — Hípico #121 Promotion Gate

## Qué problema resuelve

Evita que una mejora de parser, un porcentaje alto o un build verde habiliten automáticamente acciones reales.

## Conceptos clave

### Capability
Permiso técnico concreto. Ejemplos: leer SOURCE, escribir LAB, escribir SOURCE, modificar estado monetario.

### Fail-closed
Si falta evidencia o configuración, el sistema elige el estado más seguro: `shadow` y sin escritura SOURCE.

### Promotion
Cambio deliberado de modo después de verificar gates y registrar aprobación.

### Demotion
Retorno inmediato a modo seguro. Debe conservar historial y evidence.

### Kill switch
Mecanismo local que corta capabilities riesgosas incluso si Internet/backend no están disponibles.

## Matriz mental

`shadow` = observar/aprender.

`assisted` = ayudar a un operador, pero SOURCE sigue read-only.

`production` = sólo puede considerarse si todos los gates están verdes y la plataforma/uso está autorizado. En v121, además, la escritura monetaria sigue deshabilitada.

## Gates

1. candidate SHA exacto;
2. Physical QA #119;
3. soak #120;
4. security #114/#153;
5. compliance #154;
6. aprobación humana auditable.

## Ejemplos

- Accuracy 99.9% + #154 NO_GO → `shadow`.
- Todo PASS pero sin aprobación con actor/motivo → `shadow`.
- Todo PASS y aparece `.hipico-kill-switch` → `shadow`.
- #120 `NOT_EXECUTED` → no promotion.

## Qué no debe ocurrir

- activar producción desde frontend;
- confundir `IMPLEMENTED` con `VERIFIED`;
- borrar historial para hacer rollback;
- depender de red para el kill switch;
- habilitar dinero porque se habilitó una respuesta de texto.

## Preguntas de repaso

1. ¿Por qué un porcentaje alto no es suficiente para producción?
2. ¿Cuál es la diferencia entre mode y capability?
3. ¿Qué debe ocurrir si #154 sigue NO_GO?
4. ¿Por qué el kill switch debe funcionar offline?
5. ¿Qué datos deben conservarse durante una demotion?
