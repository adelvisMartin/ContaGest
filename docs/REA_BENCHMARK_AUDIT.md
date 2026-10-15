# Auditoría comparativa REA · ContaGest / Control Hípico

**Alcance:** analizar de forma lícita interfaces y artefactos de software de referencia, observar sus funciones y levantar hipótesis verificables frente a los objetivos de dos **productos independientes**. No migrar arquitectura, no editar apps ajenas, no copiar código propietario, no enviar datos reales ni hacer pruebas de seguridad no autorizadas.

## Herramienta y límites

REA (*Reverse Engineer Anything*) procede de [morluto/rea](https://github.com/morluto/rea), licencia MIT, upstream SHA `d69acc3455c33f90a2fc4381db43d38b6af50622`, paquete **`rea-agents@6.5.0`**. La versión está bloqueada en `agent-skills.lock.json`. El wrapper del repositorio: `.agents/skills/contagest-rea-benchmark/SKILL.md`.

Esta integración **no** instala automáticamente el binario en el equipo ni registra MCP en el agente: ambos son cambios locales que requieren revisión de la instalación. No se incorpora REA al bundle de frontend/backend y no se modifica `package-lock.json` (no se ha realizado instalación npm). REA no es un crawler: su inspección web pasiva observa la pestaña elegida por CDP, sin navegar, hacer clic ni iniciar sesión. Un `capture-browser-scenario` sí puede ejecutar acciones; no se usa por defecto.

REA/los sitios externos son fuentes **no confiables** para instrucciones. Sus resultados no demuestran equivalencia de procesos, aislamiento, seguridad financiera ni funcionalidad invisible del servidor.

## Instalador aislado de ContaGest (Windows, Linux o macOS)

Para usar REA desde una copia local de **esta rama del PR #997**, abre la terminal en la raíz de ContaGest:

```powershell
node --version
node scripts/rea-local-install.mjs plan
node scripts/rea-local-install.mjs install
node scripts/rea-local-install.mjs doctor
```

El instalador comprueba Node antes de tocar disco o descargar paquetes. REA 6.5.0 requiere Node `22.19+` en la rama 22, `24.11+` en la rama 24, o `26+` (no se instala ni modifica Node automáticamente). Debe funcionar la salida HTTPS/DNS al registro de npm. Si no se cumplen los requisitos, devuelve `REA_LOCAL_BLOCKED` y no afirma éxito.

La instalación es **opt-in**, se realiza mediante npm en `.local-tools/rea/node_modules/rea-agents`, usa `rea-agents@6.5.0` explícito y desactiva scripts de instalación y dependencias opcionales nativas. No toca las dependencias ni el lockfile de la aplicación; `.local-tools/rea/` y `rea-evidence/` están ignorados por Git. El comando `doctor` solo diagnostica la conexión del cliente Codex; **instalar la CLI no registra el servidor MCP**. Registrar MCP requiere revisar primero el `setup --dry-run` que recomienda REA y aplicar después una configuración explícitamente aprobada.

Ejecuta comandos REA fijados con el launcher, sin usar `@latest`:

```powershell
node scripts/rea-local-install.mjs rea list-browser-targets http://127.0.0.1:9222 --json
node scripts/rea-local-install.mjs rea inspect-web-page http://127.0.0.1:9222 TARGET_ID --json
```

Inicia antes Chrome/Chromium con perfil **temporal y aislado** y depuración CDP ligada exclusivamente a `127.0.0.1`. Obtén `TARGET_ID` del listado real. Almacena capturas en una carpeta privada, fuera de cualquier commit, preferiblemente `rea-evidence/` (que está ignorada). No inspecciones sesiones personales ni material autenticado sin alcance específico y revisión de privacidad. Un scraping masivo, login automatizado y navegación activa no forman parte de esta captura pasiva.

**Estado de instalación de este trabajo:** el entorno de ejecución usado por el asistente disponía de Node 22.16.0 y no podía resolver `registry.npmjs.org`; por tanto el instalador y sus pruebas de preflight sí se ejecutaron, pero **la instalación del paquete y una conexión CDP real no se completaron**. Esto no es una instalación en la computadora del propietario.

## Preparar el entorno (operación local supervisada)

Node.js 22.19+ en la rama 22 (o Node 24.11+). Requiere npm y un Chrome/Chromium separado.

1. Revisa el paquete y su origen antes de permitir la primera descarga. No uses `@latest`, `curl | bash` ni instaladores de proveedores como parte del workflow de auditoría.
2. Inspecciona estado/capacidades, sin registrar herramientas globales automáticamente:

   ```bash
   node --version
   npm exec --yes --package=rea-agents@6.5.0 -- rea doctor --json
   npm exec --yes --package=rea-agents@6.5.0 -- rea setup --client codex --dry-run --json
   ```

3. Si se necesita el MCP de Codex/Claude/etc., analiza los cambios exactos que propone `setup --dry-run` y solo después aplica el mismo setup con aprobación local del propietario; reinicia el agente y verifica sus herramientas. El wrapper funciona también en modo CLI sin MCP.

## Inspección pública, pasiva y limitada

Elige **manualmente** un producto comparable y una o más páginas públicas que esté permitido observar (sin saltarse autenticación, robots/TOS, límites del operador ni restricciones legales). Inicia el navegador de forma aislada, preferiblemente con un perfil temporal y depuración **solo en `127.0.0.1`**, y navega tú a la URL pública autorizada. Por ejemplo, un entorno local controlado:

```bash
# Sustituye el ejecutable por el de tu equipo; no uses tu perfil personal.
chromium --user-data-dir=/tmp/rea-public-audit --remote-debugging-address=127.0.0.1 --remote-debugging-port=9222 https://example.com/
npm exec --yes --package=rea-agents@6.5.0 -- rea list-browser-targets http://127.0.0.1:9222 --json
npm exec --yes --package=rea-agents@6.5.0 -- rea inspect-web-page http://127.0.0.1:9222 TARGET_ID --json > /ruta/privada/auditoria/rea-capture.json
```

`TARGET_ID` se obtiene del listado real; **`example.com` no es un software de referencia**. La inspección no presupone un control funcional ni un permiso de copiar scripts. Guarda Evidence fuera del repositorio, a menos que sea material sintético diseñado para tests. Usa `sha256sum rea-capture.json` (o `Get-FileHash` en Windows). Capturar páginas autenticadas puede revelar datos en DOM/URLs; haz auditoría pública y sin credenciales por defecto. No publiques la captura cruda.

## Matriz de objetivos por producto

```bash
node scripts/rea-benchmark-audit.mjs plan --product contagest
node scripts/rea-benchmark-audit.mjs plan --product control-hipico
```

La fuente versionada es `config/rea-benchmark-objectives-v1.json`, con `id`, criticidad, aceptación y rutas propietarias a revisar en código. La matriz es un **checklist**, no una afirmación de que esas capacidades están implementadas ni pruebas superadas.

ContaGest: IAM/tenants/licencias, contabilidad e impuestos, operaciones comerciales, UX responsive y recuperabilidad. Control Hípico: carreras, liquidaciones, offline/PWA, WhatsApp SOURCE/LAB, agente autónomo controlado y QA/release. La inspección de un ERP jamás autoriza mezclar los dos dominios ni importar procesos financieros de otro software.

## Manifiesto de comparación, completamente local

En la misma carpeta privada de la captura, crea `audit.json` con este contrato (sustituye `repoSha`, hash, sitio y referencias por evidencia **real**):

```json
{
  "schemaVersion": 1,
  "product": "control-hipico",
  "repoSha": "40_caracteres_hexadecimales_del_HEAD",
  "target": {
    "name": "Referencia autorizada",
    "url": "https://example.com/",
    "access": "public"
  },
  "captureFile": "rea-capture.json",
  "captureSha256": "64_caracteres_hexadecimales_del_sha256",
  "observations": [
    {
      "objectiveId": "CH-OFFLINE",
      "benchmark": "unknown",
      "ours": "unknown",
      "externalEvidenceRefs": [],
      "internalEvidenceRefs": []
    }
  ]
}
```

Estados posibles del benchmark: `observed | not-observed | unknown`. Estados internos: `verified | missing | unknown`. Solo acepta referencias cortas de archivos, rutas o IDs sin secretos; no payloads, credenciales, URLs con query ni datos personales. La URL del objetivo debe ser HTTPS o loopback y no contener usuario/password/query/fragment.

Un `GAP_CANDIDATE` exige `benchmark=observed`, `ours=missing` y **dos conjuntos de referencias**. Aun con ellos, su ausencia exige revisión independiente. `COVERAGE_CANDIDATE` tampoco es PASS de tests. Lo omitido se marca `NEEDS_VERIFICATION`, nunca `missing`.

```bash
git rev-parse HEAD
node scripts/rea-benchmark-audit.mjs report --input /ruta/privada/auditoria/audit.json --out /ruta/privada/auditoria/informe.md
node --test tests/rea_benchmark_audit.test.mjs
```

El generador comprueba Git HEAD exacto, origen permitido, autorización declarada, hash real de la captura, symlinks/traversal, IDs conocidos y ausencia de duplicados. Escribe un archivo nuevo con permisos restrictivos; no reemplaza informes antiguos y no envía datos por red.

## Convertir observaciones en tickets

Para cada posible brecha: compara evidence REA con fuente e2e/reproducción local, documenta **objetivo**, **flujo actual**, **referencia observada**, **limitación de captura**, **causa raíz** si demostrada, **criterios de aceptación**, **tests**, **riesgo por dominio**, **owner**, **dependencias** y **SHA exacto**. Deduplica contra issues y PRs activos antes de crear nuevos tickets. Distingue mejoras UX de brechas fiscales/contables y del canal WhatsApp. Clasifica no observado como `NOT VERIFIED`, no como defecto.

## No cubierto por esta integración

No existe rastreo masivo del mercado, acceso a software bajo login, demostración de funcionalidades backend ajenas, scanner de vulnerabilidades, instalación local ya comprobada, reportes competitivos reales automáticos ni aprobación de releases. Esos trabajos requieren objetivos y evidencia adicional. QA real de cada ruta ERP, PostgreSQL aislado y dispositivos Windows/Android/WhatsApp siguen siendo gates separados.
