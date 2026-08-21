# Control Hípico · qué descargar, instalar y probar

Este documento es el procedimiento manual del release candidate `1.13.0-rc2` + Bridge `1.4.1` cuando CI/GitHub Actions no puede ejecutar los runners.

## 1. Código que debes usar

Rama de QA:

```text
feat/production-finalization-v150
```

Actualiza tu checkout local y confirma esa rama antes de probar. No pruebes una carpeta antigua mezclada con otro branch.

## 2. Prueba completa del repositorio

En la raíz `ContaGest-main`:

```powershell
.\QA-PRODUCCION.ps1
```

Ese comando instala dependencias y ejecuta el gate local de ContaGest + Control Hípico. No hace merge, deploy, migraciones ni firma release.

Reportes:

```text
artifacts\qa\production-readiness.md
artifacts\qa\production-readiness.json
```

Si el equipo no tiene JDK/Android SDK, el reporte marcará el APK como `BLOCKED` en lugar de fingir un PASS.

## 3. APK que debes instalar en el teléfono

Requisitos para construirlo localmente:

- Node.js 22 LTS;
- JDK 21;
- Android SDK con API 35 / Build Tools 35.0.0.

Desde:

```powershell
cd android\hipico-control-v1130
npm ci --no-audit --no-fund
npm run android:qa
```

Instala **este** archivo:

```text
android\hipico-control-v1130\artifacts\Hipico-Control-v1.13.0-rc2-debug.apk
```

Comprueba también:

```text
android\hipico-control-v1130\artifacts\SHA256SUMS.txt
android\hipico-control-v1130\artifacts\QA_APK_METADATA.json
```

No uses un APK antiguo de Descargas para decidir si RC2 funciona.

## 4. QA del APK

En un Android físico prueba, como mínimo:

1. instalar desde cero;
2. abrir/cerrar/volver a abrir;
3. login/sesión cloud si aplica;
4. navegación completa y botón Atrás;
5. teclado y formularios;
6. vertical/horizontal y safe areas;
7. Wi‑Fi activo → sin red → red recuperada;
8. persistencia y recuperación;
9. exportaciones/archivos;
10. feed shadow de WhatsApp;
11. confirmar que no reaparezcan datos/demo ficticios;
12. comparar visual y funcionalmente con la PWA del mismo commit.

## 5. Configurar el bot por primera vez

En la raíz del repositorio ejecuta:

```text
CONFIGURAR-GRUPOS-HIPICO.cmd
```

Qué ocurre:

1. prepara el runtime Bridge v1.4.1 bajo `%LOCALAPPDATA%`;
2. abre WhatsApp Web con un perfil dedicado;
3. si aparece QR, vinculas el dispositivo;
4. cuando lo solicite, abres manualmente el grupo oficial `CLUB HIPICO TRIPLE COWN/CROWN` y presionas ENTER en la consola;
5. luego abres `Control hípico lab` y presionas ENTER;
6. el helper obtiene los IDs estables `@g.us` y verifica que sean diferentes;
7. guarda los bindings únicamente en el equipo local.

Este proceso **no envía mensajes**.

Archivos locales sensibles:

```text
%LOCALAPPDATA%\ControlHipicoBridge\data\group-bindings.json
%LOCALAPPDATA%\ControlHipicoBridge\data\group-bindings.env
```

No los subas a Git ni los publiques.

## 6. Probar al bot automático sin riesgo sobre el grupo real

Después del binding ejecuta:

```text
PROBAR-HIPICO-LAB.cmd
```

El modo QA puede:

- leer mensajes de la fuente;
- clasificarlos;
- persistir/spoolear;
- producir propuestas shadow;
- responder automáticamente en `Control hípico lab`;
- leer mensajes de prueba escritos directamente en LAB y contestarlos.

Antes de cada envío verifica **nombre + ID `@g.us`** del LAB. Si el chat cambió, no presiona Enter.

### Corpus manual mínimo en LAB

Prueba ejemplos no monetarios y de clasificación controlada, por ejemplo:

```text
hola
ayuda
CERRADO
LLEGADA 4-2-1
JUEGA 30K AL 5
CONSIGUE 20K 2N AL 3
```

Las respuestas deben llevar marca `[LABTEST:...]` o `[SHADOW:...]`. Repetir el mismo evento no debe generar duplicados indebidos.

## 7. Lo que debes observar mientras corre

Archivo:

```text
%LOCALAPPDATA%\ControlHipicoBridge\data\health.json
```

Comprueba:

- `sourceSendPossible` = `false`;
- fuente correcta;
- bindings presentes cuando LAB está habilitado;
- backend `online` cuando corresponde;
- `deadLetters` = 0;
- spools regresan a 0 después de recuperar red/backend;
- no aparecen secretos en health/logs.

También revisa:

```text
%LOCALAPPDATA%\ControlHipicoBridge\data\bridge.log
%LOCALAPPDATA%\ControlHipicoBridge\data\spool-events\
%LOCALAPPDATA%\ControlHipicoBridge\data\spool-lab-mirror\
%LOCALAPPDATA%\ControlHipicoBridge\data\dead-letter\
```

## 8. Pruebas de resiliencia del bot

Durante QA:

- desconecta Internet y vuelve a conectarlo;
- cierra/reabre el Bridge;
- reinicia Windows;
- repite un mensaje/evento;
- prueba imagen, video, audio y PDF como contexto;
- deja backend temporalmente inaccesible y verifica spool/retry;
- cambia deliberadamente del LAB a otro chat justo antes de una prueba: el guard debe cancelar el envío;
- confirma visualmente que **nunca aparece un mensaje saliente en el grupo fuente**.

## 9. ¿Puede quedar trabajando solo?

Sí, dentro del alcance shadow actual. Después del binding y de que el backend/host estén configurados, el worker puede quedar ejecutándose de forma permanente para:

```text
leer → deduplicar → persistir/spoolear → clasificar → sugerir → auditar
```

Y durante QA autorizado puede además responder automáticamente **solo en LAB**.

Todavía NO puede actuar solo sobre dinero real. Se mantienen bloqueados:

```text
crear/confirmar apuestas reales
modificar saldos
escribir ledger
aplicar liquidaciones/premios
publicar resultados definitivos
enviar al grupo fuente
```

Esos gates se habilitan progresivamente únicamente después de medir precisión y ejecutar pruebas de seguridad/negocio.

## 10. Para dejar de depender de la laptop

Después de aprobar Windows/LAB, instala el Bridge en un servidor Linux usando una de estas dos opciones:

```text
tools/hipico-whatsapp-web-bridge/deploy/linux/
tools/hipico-whatsapp-web-bridge/deploy/docker/
```

El host necesita una vinculación QR propia/controlada, los dos IDs `@g.us`, el token backend y almacenamiento persistente. El teléfono puede quedar sin señal después de la vinculación siempre que la sesión de WhatsApp Web siga válida y el servidor tenga Internet.

## 11. Gates que no debes saltar antes de producción real

- APK físico aprobado;
- PWA instalada/offline aprobada;
- pruebas de bot LAB y source zero-send aprobadas;
- soak test del worker alojado;
- backup/restore probado;
- migraciones v1.13 probadas en entorno aislado con usuario A/B;
- migraciones productivas autorizadas;
- firma release con keystore privado;
- verificación del SHA desplegado.
