# Control Hípico #119 — traspaso para campaña física final

> **Estado de este documento:** preparación operativa; NO es ejecución física ni evidencia de PASS. Dueño del gate: issue #119. Consumidores: #837 y #839. La matriz y el contrato de validación siguen siendo `products/hipico-control/physical-qa-v119.json` y `scripts/hipico-physical-qa-v119.mjs`. No modificar estos contratos para acomodar resultados.

## Límites antes de usar dispositivos

- Se requiere un **candidate SHA de 40 caracteres** que identifique el código realmente instalado/servido y un APK con hash SHA-256 de los bytes instalados. La versión está en `products/hipico-control/release-policy.json`.
- **SOURCE AUTO_READ y AUTO_WRITE son NO_GO para WhatsApp Messenger real** mientras #1011 no documente una autorización aplicable. No abrir el Bridge, history, captura de grupo, Browser/RPA ni perfiles reales de SOURCE para sortear esa restricción. La única vía disponible es el harness sintético LAB o una respuesta sugerida enviada manualmente por una persona; ninguna reemplaza la jornada real exigida.
- **No registrar PASS** en `source-lab-two-sessions`, `qr-session-recovery`, `group-identity-change` ni `source-to-lab-e2e-day-1/2` sin una prueba real, autorizada, observada y fechada. Ante NO_GO, marcar `BLOCKED` y anotar #1011, sin simular identidades/evidencia.
- No incluir QR, números de teléfono, identificadores de grupo, cookies, sesiones, chats completos, JWT, contraseñas, firmas APK, tokens ni material de clientes en repositorio, logs o artifacts.

## Preparación reproducible

1. En un **checkout Git** limpio de `main`, capturar `git rev-parse HEAD` (SHA completo), `git status --short`, hora UTC, sistema operativo y persona operadora. No mezclar fuentes ni artefactos de SHAs distintos. Si `main` avanza, mantener el candidato fijado para las dos jornadas o empezar de nuevo el gate.
2. Construir/obtener PWA y APK de **ese candidato** usando el flujo de release #118. Registrar archivo, versión, huella SHA-256 y dispositivo donde se instaló. No interpretar una versión declarada en la matriz como comprobación de que ese APK fue instalado.
3. Desde `tools/hipico-whatsapp-web-bridge`, consultar `npm run source:policy` **sin navegar a WhatsApp**. Un código de salida 2 con `NO_GO` es un bloqueo de la integración SOURCE, **no un test de integración exitoso**.
4. Crear evidencia sin `--force` salvo reinicio deliberado que se registre en el ticket:

```sh
SHA="$(git rev-parse HEAD)"
GIT_SHA="$SHA" node scripts/hipico-physical-qa-v119.mjs init --operator="QA responsable"
node scripts/hipico-physical-qa-v119.mjs add-env --id=chrome-desktop --mode=pwa-browser --device="Desktop Chrome" --browser="Chrome"
node scripts/hipico-physical-qa-v119.mjs add-env --id=android-pwa --mode=pwa-standalone --device="Modelo Android real" --android="VERSION" --oem="FABRICANTE"
node scripts/hipico-physical-qa-v119.mjs add-env --id=android-apk --mode=android-apk --device="Modelo Android real" --android="VERSION" --oem="FABRICANTE" --apk-version="VERSION_RELEASE" --apk-sha256="SHA256_APK_REAL"
```

Los datos en mayúsculas son **campos por completar antes de ejecutar**, nunca valores de prueba aceptados. Las identidades hash SOURCE/LAB se añaden solo después de que el canal esté autorizado y verificado, mediante `--source-session-hash` y `--lab-session-hash`. No introducir IDs reales en esos flags.

## Matriz mínima de ejecución manual

Cada entorno contiene **todos** los escenarios del catálogo; conservar `NOT_EXECUTED` o `BLOCKED` hasta observarlos, aunque no sean operables con los permisos actuales. No cambiar automáticamente a `PASS`.

| Bloque | IDs del catálogo | Observación física necesaria |
| --- | --- | --- |
| Instalación y actualización | `fresh-install`, `upgrade-install` | Instalar/actualizar, comprobar versión y datos preservados, registrar instalación visible |
| Lifecycle | `foreground-background`, `process-kill`, `reboot`, `handoff-restart` | Cambiar foco, terminar proceso, reiniciar equipo y confirmar estado, control de handoff y destino tras reanudar |
| Permisos y conectividad | `permissions`, `offline-reconnect`, `backup-restore-device` | Denegar/conceder almacenamiento/permisos, cortar/restaurar red, restaurar en perfil limpio sin duplicación |
| Sesiones e identidad | `source-lab-two-sessions`, `qr-session-recovery`, `group-identity-change` | Solo con autorización oficial aplicable, perfiles separados, login/expiración, identidad y recuperación sin fallback |
| Dos jornadas | `source-to-lab-e2e-day-1`, `source-to-lab-e2e-day-2` | Dos observaciones reales en días distintos, >=24 h de separación y evidencia de contenido diferente; bloqueadas con SOURCE NO_GO |
| Pantalla y recursos | `screen-scroll-overlap`, `battery-memory-basic` | Touch, scroll, modal, orientación/responsive, batería/memoria durante un periodo registrado |

Por **cada** combinación dispositivo×escenario guardar precondición, pasos, observado vs. esperado, estado `PASS|FAIL|BLOCKED|NOT_EXECUTED`, severidad si falla y un archivo sanitizado (video/screenshot/log) dentro del directorio de evidencia de ese candidate SHA. Verificar accesibilidad visual y ausencia de crash/bloqueos P0 en cada modo. No inventar medidas de batería/memoria: anotar herramienta, intervalo y valores realmente observados.

## Registro y cierre de evidencia

Conectar `--file=artifacts/qa/hipico-v119/<SHA>/physical-qa.json` en cada comando (o usar la ubicación predeterminada bajo el SHA del checkout). Ejemplos de **sintaxis**, no resultados:

```sh
node scripts/hipico-physical-qa-v119.mjs record --env=android-pwa --scenario=foreground-background --status=BLOCKED --notes="Precondición aún no realizada"
node scripts/hipico-physical-qa-v119.mjs invariant --name=sourceReadOnly --status=BLOCKED
node scripts/hipico-physical-qa-v119.mjs status
node scripts/hipico-physical-qa-v119.mjs check
```

- `status` puede terminar con código 0 mientras `releasePhysicalGate` es `NOT_READY`; **el código de salida no es aprobación**. `check` bloquea si falta cualquier escenario, identidad hash de las dos sesiones, evidencia material, invariantes, APK o coincidencia del SHA.
- Cuando el acceso real resulte legítimo, registrar `--observed-at=YYYY-MM-DDTHH:mm:ss.sssZ` para ambas jornadas, con dos archivos independientes y distinto hash. El verificador exige separación >=24 h; una prueba sintética LAB nunca acredita SOURCE real.
- Conservar `physical-qa.json`, `manifest.json`, `SHA256SUMS.txt`, `physical-qa-evidence.json` (solo si `check` permite generarlo), ruta del APK probado, hash del APK y referencia de los artifacts fuera de Git. Sanitizar **antes** de subir.
- Si falta política/autorización, dispositivo, segunda jornada, evidencia, se detecta P0, o el artifact pertenece a otro SHA: mantener **#119 OPEN / BLOCKED**. Registrar la causa y seguir con otras implementaciones del backlog; no alterar `releaseRule`, fixtures ni el verificador para forzar verde.

## Separación de estados

**Ingeniería del registrador** ya está integrada por PRs anteriores, entre otros #1121 y #1133. **Ejecución física** sigue pendiente y no se puede certificar desde un conector GitHub o una sesión de ChatGPT sin los dispositivos, la autorización y las dos jornadas observadas. El gate #839 sigue siendo NO_GO hasta que sus propias dependencias estén verificadas. **Fusionar un PR de documentación no cierra #119 ni equivale a prueba física PASS.**
