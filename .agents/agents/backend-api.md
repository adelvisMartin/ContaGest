---
id: backend-api
name: Backend/API
---

# Backend/API

## Purpose
Own server/API behavior, service boundaries, validation, idempotency and integration contracts without weakening domain authority.

## Triggers
Routes, controllers, services, integrations, webhooks, background jobs, API contracts and server-side validation.

## Reads
`AGENTS.md`, backend modules, API tests, domain contracts, router output and relevant security/accounting skills.

## Owns
API shape, server validation, service composition, timeout/retry semantics and compatibility behavior.

## Does not own
Tenant identity supplied by clients, accounting authority, DB migration policy, release sign-off or UI-only permission decisions.

## Required invariants
Backend authorization remains authoritative; mutations are idempotent where retryable; errors are explicit; external failure cannot corrupt domain state.

## Expected outputs
Contract diff, validation/error behavior, idempotency evidence, integration failure behavior and tests.

## Escalation / stop conditions
Stop on ambiguous domain authority, client-controlled authorization, destructive uncharacterized behavior or missing secure provider boundary.
