# #1011 — Confirmación humana por versión de borrador Messenger

**Cambio:** el Centro Operativo de Control Hípico ya dispone desde PR #1122 de una sugerencia manual, en blanco y editable, con fuente/fecha visibles, confirmación humana y copia explícita. Este incremento corrige una condición de consentimiento obsoleto: anteriormente la casilla de revisión quedaba marcada **después de editar** el texto, lo que permitía copiar una versión distinta de la aprobada.

## Contrato del formulario

- Cualquier evento `input` en `data-ops-manual-text` quita inmediatamente la confirmación previa, deshabilita el botón y restaura el estado visual **Copiar texto**.
- El usuario debe marcar de nuevo la casilla tras la **última** edición; texto vacío, sin contenido o de más de 1200 caracteres nunca activa Copiar.
- Mientras se ejecuta `navigator.clipboard.writeText`, el botón permanece deshabilitado, impidiendo dobles clics concurrentes.
- Si se cambia el texto mientras la promesa del portapapeles está pendiente, el resultado anterior **no** recibe estado visual **Copiado**. Se exige revisión de la versión editada.
- Un error del portapapeles restaura la disponibilidad apropiada para la versión aún revisada y usa la notificación ya existente; no comunica que se copió cuando falló.
- **Cancelar y borrar** limpia el contenido y la casilla; cerrar el panel y `resetOperationalCopyCenter` conservan la limpieza previa.
- No se añade lectura de WhatsApp, envío automático, persistencia de borradores, uso de IA, ledger ni movimientos monetarios. Se mantienen `SOURCE_AUTO_READ_POLICY_NO_GO` y `SOURCE_AUTO_REPLY_POLICY_NO_GO`; WhatsApp Messenger real continúa bloqueado para automatización.

## Pruebas

El archivo `tests/hipico_manual_messenger_reconfirmation_v1011.test.mjs` ejecuta las **funciones reales** de `operational-copy-center.js` con un DOM simulado (no navegador), emite eventos de `input`, `change` y `click`, simula las promesas del clipboard y cubre 12 condiciones, entre ellas edición concurrente, rechazo de copia, reentrada, cierre de sesión y consentimiento.

```sh
node --test tests/hipico_manual_messenger_reconfirmation_v1011.test.mjs
node --test tests/hipico_manual_messenger_suggestion_v1011.test.mjs
node scripts/hipico-root-contracts.mjs
node --check frontend/public/hipico-control/assets/js/operational-copy-center.js
```

La suite raíz Hípico descubre automáticamente este nuevo test porque su nombre sigue el patrón `hipico*.test.mjs`; no se modifica ningún workflow.

Evidencia focal de esta ejecución: **12/12 pruebas ejecutadas con el motor V8** sobre el blob de código real publicado en la rama `52d275507ee630eb256df23335a07c75b2542a64`, utilizando las mismas funciones/eventos del test de Node; JS compilado en V8 correctamente. **No** equivale a navegador real ni a que toda la suite GitHub Actions haya pasado. Full clone, `node --test` directo contra checkout completo, E2E PWA Android, accesibilidad con lectores de pantalla, privacidad/consentimiento oficial y pruebas físicas siguen **NOT_EXECUTED** en este entorno.

## Estado del backlog

Este incremento solo satisface el subcriterio **reconfirmar cada borrador modificado** en una UI manual ya existente. `#1011` permanece ABIERTO para autorización/consentimiento, accesibilidad, privacidad, QA y decisión GO/NO-GO exact-SHA. La automatización real de lectura/escritura a SOURCE permanece NO_GO. Rollback: revertir el cambio del componente y eliminar pruebas/documentación añadidas; no hay esquema de DB ni migración.
