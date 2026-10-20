# #769 — Protección del mapa de transiciones contra herencia de prototipos

**Hallazgo:** El lookup de `preparePostedDocumentTransition` accedía `transitions[from]?.[action]` sobre objetos JavaScript ordinarios. Para claves como `from="__proto__"`, `action="constructor"`, propiedades heredadas devolvían funciones truthy y el control interpretaba falsamente la combinación como una transición, aunque nunca existió en la máquina de estados.

**Corrección:** exigir `Object.hasOwn(transitions, from)` y `Object.hasOwn(state, action)` después de confirmar tipos string. Las transiciones originales permanecen idénticas; la modificación no altera la fuente fiscal, secuencia #762, posting #637, documentos ni migraciones. El test negativo recorre prototipos heredados y comprueba flujo permitido.

**Validación pendiente:** suite exact-SHA, Node.js, TypeScript JSDoc, API/PG17 E2E, concurrencia; este fix no satisface el DoD general #769. Rollback: revert del PR; no hay datos creados. No desactivar CI.
