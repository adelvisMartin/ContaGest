# #648 · Docker build-context confidentiality guard (incremental)

**Authority:** `ops/docker/Dockerfile.api`, `ops/docker/Dockerfile.web` and root `.dockerignore`. Both production Compose builds use `context: ../..`; therefore only the **root** `.dockerignore` controls transmitted build context. Do not put a second competing `.dockerignore` next to a Dockerfile.

## Protection added

The root ignore policy excludes nested/root `.env` files except sanitized `.env.example`, Git history, cached `node_modules`, generated output and common key/credential files. This reduces the likelihood that `COPY backend backend` or `COPY frontend frontend` stores local credentials inside an intermediate builder layer. It also avoids needless transfer of local dependency trees. Do not rely on `.dockerignore` as a secrets manager: runtime credentials must still be supplied through the deployment secret store and must not be echoed in CI or image layers.

## Local verification (required before production use)

```sh
node --test tests/docker_context_security_v648.test.mjs
# From a disposable checkout with synthetic .env and key fixtures only:
docker build -f ops/docker/Dockerfile.api -t contagest-api:context-verify .
docker build -f ops/docker/Dockerfile.web -t contagest-web:context-verify .
# Verify that excluded synthetic sentinel strings cannot be found in resulting layers.
# Inspect builder/intermediate stages separately; runtime-only image inspection is insufficient.
```

The Node suite checks configuration invariants but **does not execute Docker's own pattern matcher**, attest intermediate layers, run services, validate `npm ci`, or prove no secret is in a real build. Never run these checks with real credentials as fixtures. No CI jobs or branch protections are weakened by this increment.

## Outstanding #648 work (not completed here)

- `Dockerfile.api` currently copies full builder `node_modules` into runtime. Replace with verified minimal production dependencies/Prisma artifacts only after actual Docker build + Prisma migration/API smoke; simply adding `--omit=dev` can break generated Prisma native artifacts.
- Prove rootless/minimal-capabilities for Caddy, read-only filesystem compatibility, health, TLS/security headers and log hygiene with container/runtime tests.
- Generate image digests and SBOM/provenance with the existing `scripts/supply-chain-v550.mjs` authority, scan built layers and test rollback.

**Status of this increment:** source-contract tests can be verified locally; Docker build, layer scan, runtime and production security remain `NOT_EXECUTED` until explicitly run and recorded against the same candidate SHA. Keep #648 OPEN until all acceptance criteria pass.
