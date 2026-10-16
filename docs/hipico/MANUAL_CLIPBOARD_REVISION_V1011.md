# #1011 · Privacidad del portapapeles vinculada a la revisión exacta del borrador

## Hallazgo sobre PR #1123

El formulario de ayuda **manual** para Messenger invalidaba el checkbox cuando cambiaba un texto. Sin embargo, un `navigator.clipboard.writeText()` pendiente podía resolver **después** de que el operador borrara el borrador, volviera a escribir el mismo contenido y lo confirmara otra vez. La comparación exclusiva de cadenas (`draft.value.trim() === reviewedText`) podía marcar falsamente **Copiado** para una aprobación anterior.

Otra carrera: los handlers `input/change` llamaban `updateManualSuggestionControls` durante un `writeText()` pendiente y podían reactivar el botón, permitiendo una segunda copia en paralelo aunque el primer handler lo hubiera deshabilitado.

## Corrección de código

- `manualDraftRevisions` (**WeakMap por diálogo**) registra una revisión monotónica que avanza al editar, borrar, alternar checkbox y cerrar el panel. En cada copia se retiene la revisión de aprobación, no únicamente la cadena. Sólo se muestra **Copiado** si sigue coincidiendo la revisión exacta, la cadena, el checkbox, el DOM y la autorización del panel.
- `pendingManualClipboardWrites` (**WeakSet por botón**) preserva el bloqueo de copia mientras la promesa esté activa, aunque lleguen eventos `input` o `change`. El `finally` libera el bloqueo y recalcula controles incluso si falla el portapapeles.
- **Cancelar y borrar** restablece contenido, checkbox y también la etiqueta **Copiar texto**. El `close` del diálogo invalida cualquier respuesta tardía de copia.
- Sin `localStorage`, registros de texto, mensajes salientes, WhatsApp Web, backend, base de datos ni transmisión de datos. Los bloqueos de `SOURCE_AUTO_READ_POLICY_NO_GO` y `SOURCE_AUTO_REPLY_POLICY_NO_GO` permanecen intactos.

## Pruebas ejecutadas

Con el contenido real de GitHub `frontend/public/hipico-control/assets/js/operational-copy-center.js` (Git blob `261e05d0addd663cf7b6109b1e6397756aeb55da`), se evaluaron los handlers originales en V8 con DOM y portapapeles simulados:

- **10/10 PASS** nuevos casos de concurrencia y privacidad del portapapeles (`tests/hipico_manual_clipboard_revision_v1011.test.mjs`, blob `f2c5e0a4cad94dc621cb822fcb2bd64b0af88828`).
- **12/12 PASS** pruebas anteriores de reconfirmación (`tests/hipico_manual_messenger_reconfirmation_v1011.test.mjs`, blob `e7ea6e2d860518d34803557adea79eb43f284a62`).
- Mutación negativa sin comparación de revisión: **4 casos fallaron**, como debía.
- Mutación negativa sin bloqueo `WeakSet`: **2 casos fallaron**, como debía.

Estos **22/22 PASS** son pruebas reales de lógica en el motor V8 con sustitutos de DOM/clipboard; **NO** son Playwright/Chromium, Android, un `node --test` ejecutado dentro del checkout completo ni prueba de interacción física. Ejecutar luego:

```sh
node --check frontend/public/hipico-control/assets/js/operational-copy-center.js
node --test tests/hipico_manual_clipboard_revision_v1011.test.mjs tests/hipico_manual_messenger_reconfirmation_v1011.test.mjs tests/hipico_manual_messenger_suggestion_v1011.test.mjs
node scripts/hipico-root-contracts.mjs
```

La suite raíz descubre automáticamente `hipico*.test.mjs`; **no se modifican los workflows**. Accesibilidad de teclado/lector de pantalla, PWA Android, Clipboard API del navegador real, consentimiento y policy oficial **NOT_EXECUTED**. No se modificó dinero, identidad de usuarios, sesiones SOURCE, esquema ni migraciones.

## Estado de entrega

Incremento de seguridad UX de bajo impacto, **no cierra #1011**: sigue pendiente el QA físico/consentimiento/plataforma y GO/NO-GO de Control Hípico. Rollback del incremento: revertir los cambios del archivo de UI y quitar la nueva prueba y documento. No reducir checks obligatorios ni equiparar GitHub Actions `QUEUED` con PASS.
