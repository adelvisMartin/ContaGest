# ADR — Racing Provider Registry (#286)

## Status
Accepted and integrated. Provider observations are enrichment evidence only and never financial authority.

## Decision
External racing feeds are behind the framework-free `RacingDataProvider` contract. The domain consumes normalized meeting/race/runner/result records plus explicit provenance; it never consumes provider XML/JSON as business authority.

Required provider operations are `listMeetings`, `getMeeting`, `getRace`, `getEntries`, `getScratches` and `getResult`. Providers advertise capabilities and reject unsupported operations with `PROVIDER_CAPABILITY_UNSUPPORTED`; missing data is never fabricated.

The Sportradar UOF adapter exposes only the capabilities actually implemented by the hardened transport. The registry/API must not infer licensed coverage from marketing pages or undocumented endpoints.

## Provenance and authority
Every provider response carries provider/source identity, source timestamp, fetched time, freshness and officiality metadata while preserving `financialAuthority:false`.

`verified` means an authorized provider supplied the observation. It is deliberately different from `official` and from financial authority. Provider data alone cannot settle bets, balances or operator-confirmed race state.

## Conflict policy
Conflicting result signatures for the same race require reconciliation/operator review. Last-write-wins is forbidden for authoritative race/result evidence.

## Security
The transport keeps HTTPS-only vendor allowlisting, no credentials in URL, no arbitrary query/hash/base paths, bounded timeout/response size, circuit breaking/cache bounds and hostile XML/DOCTYPE rejection. Canonical provider endpoints never expose provider credentials or raw XML.

## Canonical API
Provider reads live under `/api/v1/hipico/providers*` and `/api/v1/hipico/live/*`, behind the Hípico operator boundary. `/api/v1/hipico-bot/*` remains an integration adapter namespace, not provider-domain authority.

## Rollback
Disable provider registration or remove the adapter before removing shared contracts. Never replace an unavailable provider with guessed data or silently promote another source's authority.
