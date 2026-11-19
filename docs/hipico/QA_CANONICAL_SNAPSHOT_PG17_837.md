# Control Hípico #837 — verificación de snapshot canónico en PostgreSQL 17

**Autoridad:** `AGENTS.md`, `docs/hipico/AGENTS.md` y AC de #837. Esta guía no declara PASS ni habilita SOURCE de WhatsApp. **No conecta bases existentes de desarrollo/producción.**

## Qué se comprueba

- La lectura de un agregado y sus eventos conserva el mismo snapshot con un escritor real concurrente.
- La siguiente lectura ve el nuevo estado y sus dos eventos.
- Grupo A/B y owner A/B permanecen aislados, incluso con el mismo `aggregateKey`.
- Una consulta ausente no obtiene eventos de otra identidad; el scope vacío falla cerrado.
- Se exige PostgreSQL **17**, un nombre efímero `hipico_e2e_*` y servidor `localhost`.

La ruta bajo prueba es `backend/src/modules/hipico-bot/hipico-domain-query.pg17.integration.ts`; no forma parte del glob unitario y **no usa skip**. El workflow `.github/workflows/hipico-domain-snapshot-pg17.yml` ejecuta este mismo caso y elimina la base aun cuando falla.

## Docker Desktop en Windows — ejecución local segura

Prerequisitos: Docker Desktop con contenedores Linux, Node 22, npm, Git y acceso al repositorio. En PowerShell, desde la raíz de una copia de trabajo limpia de `fix/837-hipico-consistent-canonical-read-20261119`:

```powershell
npm ci --workspace backend --include-workspace-root --no-audit --no-fund
npm --workspace backend run typecheck

# El puerto del host es aleatorio y solo escucha en 127.0.0.1.
$container = 'hipico-pg17-837-' + [guid]::NewGuid().ToString('N').Substring(0, 8)
docker run --rm -d --name $container -p '127.0.0.1::5432' `
  -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=hipico_qa_only `
  -e POSTGRES_DB=postgres --health-cmd 'pg_isready -U postgres -d postgres' `
  --health-interval 1s --health-retries 20 postgres:17-alpine

# Comprueba salud antes de seguir: docker inspect --format '{{.State.Health.Status}}' $container
$binding = docker port $container 5432/tcp | Select-Object -First 1
$port = [int](($binding -split ':')[-1])
$env:HIPICO_E2E_ADMIN_URL = "postgresql://postgres:hipico_qa_only@127.0.0.1:$port/postgres"
$env:HIPICO_E2E_RUN_ID = 'local837'
$env:HIPICO_E2E_STATE_FILE = 'artifacts/qa/hipico-v290/database-state-local837.json'

node scripts/hipico-ephemeral-db-v290.mjs create
$state = Get-Content $env:HIPICO_E2E_STATE_FILE -Raw | ConvertFrom-Json
$database = $state.databaseName
$env:HIPICO_E2E_DATABASE_NAME = $database
$env:DATABASE_URL = "postgresql://postgres:hipico_qa_only@127.0.0.1:$port/$database"
$env:DIRECT_DATABASE_URL = $env:DATABASE_URL

@'
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
END
$$;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;
'@ | docker exec -i $container psql -v ON_ERROR_STOP=1 -U postgres -d $database

$files = @(
  'supabase/sql/hipico_v14_canonical_domain.sql',
  'supabase/sql/hipico_v16_operator_confirmation_audit.sql',
  'backend/prisma/migrations/20260911211500_hipico_domain_source_identity/migration.sql'
)
foreach ($file in $files) {
  Get-Content $file -Raw | docker exec -i $container psql -v ON_ERROR_STOP=1 -U postgres -d $database
  if ($LASTEXITCODE -ne 0) { throw "Migration failed: $file" }
}

npm --workspace backend exec -- tsx --test src/modules/hipico-bot/hipico-domain-query.pg17.integration.ts
```

**Limpieza obligatoria, incluso si la prueba falla:** ejecutar los siguientes comandos dentro de un bloque `finally` si se automatiza la secuencia; si se hace manualmente, ejecutarlos antes de terminar la sesión.

```powershell
node scripts/hipico-ephemeral-db-v290.mjs drop
docker rm -f $container
Remove-Item Env:DATABASE_URL,Env:DIRECT_DATABASE_URL,Env:HIPICO_E2E_DATABASE_NAME,Env:HIPICO_E2E_ADMIN_URL,Env:HIPICO_E2E_RUN_ID,Env:HIPICO_E2E_STATE_FILE -ErrorAction SilentlyContinue
```

**Advertencia:** el procedimiento manual no gestiona errores anteriores a `drop` por sí solo; el flujo automatizado en GitHub Actions sí lleva `if: always()` y es la evidencia preferida para CI. No reusar nombres/URLs fuera del prefijo efímero ni conectar bases compartidas. Si alguna variable ya existía en la sesión, respaldar su valor y restaurarlo en vez de eliminarla. Los datos y las credenciales anteriores son exclusivamente sintéticos de QA.

## Evidencia y criterio de cierre

Un test PG17 positivo no acredita por sí mismo versión final de informe diario, interfaz PWA, PDF/XLSX, WhatsApp SOURCE, QA físico #119, soak #120, DR #842 ni Go/No-Go #839. Registrar commit exacto, PostgreSQL major, comando, log y estado de la base destruida. **Un check queued, skipped o que no corrió es NOT_EXECUTED y jamás PASS.**
