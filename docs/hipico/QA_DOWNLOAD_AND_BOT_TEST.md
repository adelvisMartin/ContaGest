# Control Hípico · qué descargar, instalar y probar

**Actualizado:** 2026-09-29  
**Código de prueba:** rama `main`, registrando el SHA exacto antes de ejecutar QA.  
**UI:** v4.1.2 hardening.  
**WhatsApp Bridge:** `1.5.0`.

Este es el procedimiento manual cuando GitHub-hosted runners no ejecutan los jobs. Un comando local sólo cuenta como PASS si realmente termina correctamente en tu equipo; cualquier dependencia ausente se registra `BLOCKED`/`NOT_EXECUTED`.

## 1. Código que debes usar

Descarga/actualiza `main`. No pruebes una carpeta vieja ni mezcles archivos de otro branch.

Antes de comenzar guarda el SHA:

```powershell
git switch main
git pull --ff-only
git rev-parse HEAD
```

Ese SHA identifica toda la evidencia de la jornada.

## 2. Gate local del repositorio

En la raíz de ContaGest:

```powershell
.\QA-PRODUCCION.ps1
```

El gate instala/valida las dependencias que corresponden y genera evidencia local. No debe inventar PASS para Android, browser, PostgreSQL u otra herramienta que no exista en la máquina.

Revisa:

```text
artifacts\qa\production-readiness.md
artifacts\qa\production-readiness.json
```

## 3. PWA / frontend de Control Hípico

Prueba desde el checkout o desde el SHA publicado, pero no mezcles ambos durante una misma comparación.

Verifica como mínimo:

- UI System v4.1.2 y paleta light/dark/system;
- header global y menú de opciones;
- sidebar 224px / 66px, persistencia después de recargar;
- todas las vistas principales full-width;
- controles compactos en desktop y touch targets >=44px;
- modales/dialogs sin clipping ni overlap;
- toasts success/warning/error/info con estilos v4;
- Centro Operativo de WhatsApp con iconos SVG canónicos;
- Ayuda y launcher de WhatsApp sin solaparse;
- offline -> online sin perder el workspace;
- service worker `r33-ui-v4-1-2-hardening` o una revisión posterior equivalente.

## 4. Android físico, si vas a probar APK

Requisitos de build:

- Node.js 22 LTS;
- JDK 21;
- Android SDK con API/Build Tools que exija el proyecto.

Construye el APK desde **el mismo SHA** que la PWA. No uses un APK antiguo de Descargas como evidencia del candidato actual.

En el teléfono prueba:

1. instalación limpia;
2. abrir/cerrar/reabrir;
3. sesión si aplica;
4. navegación y Atrás;
5. teclado/formularios;
6. vertical/horizontal/safe areas;
7. Wi‑Fi -> sin red -> red recuperada;
8. persistencia y recuperación;
9. exportaciones;
10. feed shadow WhatsApp;
11. ausencia de fixtures/demo no autorizados;
12. comparación funcional/visual contra PWA del mismo SHA.

Si el equipo no dispone de JDK/Android SDK, registra ese bloque como `BLOCKED`; no lo conviertas en PASS.

## 5. Configurar WhatsApp Bridge v1.5.0

Primera vez o después de limpiar el runtime:

```text
CONFIGURAR-GRUPOS-HIPICO.cmd
```

El helper:

1. prepara el runtime bajo `%LOCALAPPDATA%\ControlHipicoBridge`;
2. abre WhatsApp Web con perfil dedicado;
3. muestra QR si el dispositivo aún no está vinculado;
4. pide abrir el SOURCE oficial;
5. pide abrir `Control hípico lab`;
6. obtiene IDs `@g.us` y comprueba que sean distintos;
7. guarda bindings sólo en el equipo local.

Este proceso no debe enviar mensajes.

Archivos sensibles:

```text
%LOCALAPPDATA%\ControlHipicoBridge\data\group-bindings.json
%LOCALAPPDATA%\ControlHipicoBridge\data\group-bindings.env
```

No los subas a Git ni los compartas.

## 6. Probar el bot automático hoy

Después del binding usa:

```text
PROBAR-HIPICO-LAB.cmd
```

También puedes usar:

```text
INICIAR-HIPICO-AUTONOMO.cmd
```

En el hardening actual ese launcher significa **autonomía segura en LAB**. No habilita escritura al grupo real SOURCE.

El modo QA puede:

- leer SOURCE;
- ignorar mensajes propios para evitar loops;
- deduplicar;
- persistir/spoolear;
- clasificar;
- producir propuestas;
- responder automáticamente en LAB;
- leer entradas escritas directamente en LAB y contestarlas;
- conservar estado de delivery/receipt para evitar retries inseguros.

Antes de cualquier envío LAB el bridge debe verificar nombre + ID `@g.us` del chat.

### Corpus mínimo

```text
hola
ayuda
CERRADO
LLEGADA 4-2-1
JUEGA 30K AL 5
CONSIGUE 20K 2N AL 3
```

Las respuestas de QA deben llevar la identificación LAB/shadow correspondiente. Repetir un mismo evento no debe producir un segundo efecto indebido.

## 7. Estado y observabilidad

Archivo principal:

```text
%LOCALAPPDATA%\ControlHipicoBridge\data\health.json
```

Para la prueba actual confirma:

- `sourceSendPossible` = `false`;
- SOURCE correcto;
- bindings presentes;
- backend `online` cuando corresponde;
- `deadLetters` = 0 o con causa explícita investigada;
- colas/spools convergen de nuevo después de recuperar red/backend;
- no aparecen tokens/secretos en health/logs.

Revisa también:

```text
%LOCALAPPDATA%\ControlHipicoBridge\data\bridge.log
%LOCALAPPDATA%\ControlHipicoBridge\data\spool-v2\
%LOCALAPPDATA%\ControlHipicoBridge\data\source-replies\
%LOCALAPPDATA%\ControlHipicoBridge\data\dead-letter\
```

La distribución exacta de subdirectorios puede evolucionar; `health.json` es la autoridad de estado del runtime actual.

## 8. Resiliencia obligatoria

Durante QA:

- desconecta Internet y vuelve a conectarlo;
- deja backend inaccesible temporalmente;
- cierra/reabre el bridge;
- reinicia Windows;
- repite un mensaje/evento;
- prueba texto y, cuando corresponda, imagen/audio/video/PDF como contexto;
- cambia del LAB a otro chat justo antes de un envío: debe cancelarse por identity guard;
- verifica que una entrega incierta quede `ambiguous` y no se repita a ciegas;
- confirma visualmente que **nunca aparece un mensaje automático en SOURCE**.

## 9. ¿Puede trabajar solo?

Sí, para el alcance permitido:

```text
SOURCE read-only
  -> deduplicar
  -> persistir/spoolear
  -> clasificar
  -> sugerir/auditar
  -> responder automáticamente en LAB durante QA
```

No está autorizado para escribir automáticamente apuestas de dinero real al SOURCE. `HIPICO_SOURCE_AUTO_REPLY_ENABLED=true` falla cerrado por `SOURCE_AUTO_REPLY_POLICY_NO_GO` mientras la evidencia de plataforma/compliance siga en NO-GO.

Tampoco obtiene autoridad automática para:

```text
crear/confirmar apuestas reales
modificar saldos
escribir ledger
aplicar liquidaciones/premios
publicar resultados definitivos
```

## 10. Host permanente

Después de aprobar la jornada Windows/LAB puedes evaluar los despliegues existentes bajo:

```text
tools\hipico-whatsapp-web-bridge\deploy\linux\
tools\hipico-whatsapp-web-bridge\deploy\docker\
```

Un host permanente necesita sesión vinculada propia, almacenamiento persistente, bindings exactos y secretos fuera del repo.

## 11. Gates antes de cualquier promoción

- PWA/browser QA del SHA exacto;
- Android físico si forma parte del release;
- LAB + source-zero-send aprobados;
- reconnect/restart/replay aprobados;
- soak prolongado;
- backup/restore;
- backend/DB gates que correspondan;
- verificación del SHA desplegado;
- reevaluación fresca de política/plataforma antes de cualquier cambio en SOURCE writing.

La investigación y el estado técnico del bot están documentados en `docs/hipico/WHATSAPP_READINESS_2026-09-29.md`.
