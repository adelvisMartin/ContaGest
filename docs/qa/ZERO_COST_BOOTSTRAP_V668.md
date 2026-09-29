# Zero-Cost Bootstrap v668

ContaGest must be developable and verifiable with **mandatory infrastructure cost USD 0** while the product is not generating revenue. Supabase remains optional for local development/QA and is never used as the fallback target for destructive verification.

## Canonical entrypoints

Node (portable):

```text
node scripts/zero-cost-bootstrap-v668.mjs --expected-sha <HEAD>
```

Windows / PowerShell / VS Code terminal:

```powershell
.\scripts\zero-cost-bootstrap-v668.ps1 --expected-sha <HEAD>
```

Optional heavier financial verification:

```powershell
.\scripts\zero-cost-bootstrap-v668.ps1 --financial --expected-sha <HEAD>
```

Optional local build smoke after the DB profiles:

```powershell
.\scripts\zero-cost-bootstrap-v668.ps1 --smoke --expected-sha <HEAD>
```

## Runtime selection

The bootstrap never installs system software silently. It selects, in order:

1. an explicitly configured loopback **PostgreSQL 17** admin connection in `LOCAL_VERIFY_DATABASE_ADMIN_URL` when the local `psql` major is exactly 17 and the server itself reports PostgreSQL 17;
2. Docker using an ephemeral `postgres:17` container bound only to `127.0.0.1` with a dynamic local port;
3. Podman using the same `postgres:17` contract;
4. otherwise it returns `BLOCKED` with `POSTGRES17_OR_CONTAINER_RUNTIME_REQUIRED`.

A missing local runtime is not PASS and does not justify using production/Supabase for QA.

## Native PostgreSQL 17

Provide a local admin URL only. Example shape (use your own local synthetic credentials):

```text
LOCAL_VERIFY_DATABASE_ADMIN_URL=postgresql://local_user:local_password@127.0.0.1:5432/postgres
```

The bootstrap rejects non-loopback hosts before invoking any executable probe or destructive database lifecycle. A generic/provider `DATABASE_URL` is ignored for runtime selection; native reuse must be explicitly opted into with `LOCAL_VERIFY_DATABASE_ADMIN_URL`. The bootstrap checks `SHOW server_version_num` before delegation, then the existing #630 runner creates its own per-run database and #632 remains the canonical migration/drift/tenant gate.

## Docker / Podman

No DB URL is required. The bootstrap starts `postgres:17` with generated synthetic credentials, publishes `5432` to a dynamic **loopback-only** host port, waits with bounded `pg_isready` polling, delegates verification, and removes the owned container in `finally` even when delegated verification fails.

The container path does not mount production dumps or provider volumes.

## What is delegated

The bootstrap does not reimplement #630 or #632. It injects only a safe local `LOCAL_VERIFY_DATABASE_ADMIN_URL` and runs:

```text
npm run verify:local -- --profile database --expected-sha <HEAD>
```

With `--financial`, it then runs the existing `financial` profile on the same isolated PostgreSQL 17 runtime. With `--smoke`, it runs the existing backend/frontend local build smoke after DB verification. Provider-specific checks remain separate evidence.

## Safety

- remote/provider DB URLs are rejected as explicit native admin targets;
- generic remote `DATABASE_URL` values remain optional and are not used for destructive bootstrap runtime selection;
- PostgreSQL client and server major must both be 17 for the native path;
- Docker/Podman publish must resolve to `127.0.0.1`/`::1` only;
- generated DB passwords are redacted from summaries;
- no production PII/fixtures/dumps;
- no paid Supabase/Vercel/GitHub Actions capability is required;
- changing the candidate SHA invalidates material evidence.

## Troubleshooting

`BLOCKED: POSTGRES17_OR_CONTAINER_RUNTIME_REQUIRED` means the machine has neither an acceptable native PostgreSQL 17 path nor Docker/Podman. Install/configure one of those free local options explicitly; the script will never install it silently and will never switch to a remote production/provider database.

If native PostgreSQL is detected as 16 or 18, the bootstrap does not treat it as the canonical DB gate runtime. Configure PG17 or use Docker/Podman.

If a container publishes `0.0.0.0` or a LAN address, the bootstrap fails closed with `ZERO_COST_UNSAFE_CONTAINER_BINDING`.

GitHub Actions/Vercel quota failures remain `BLOCKED_INFRASTRUCTURE`/`NOT_EXECUTED`, separate from local material verification.
