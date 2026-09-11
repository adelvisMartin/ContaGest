# ADR — Racing Provider Registry (#286)

## Status
Accepted for stacked implementation. Provider data is enrichment evidence only and never financial authority.

## Decision
External racing feeds are behind the framework-free `RacingDataProvider` contract. The domain consumes normalized Meeting/Race/Runner/Result records plus explicit provenance; it never consumes provider XML/JSON directly.

Required provider operations are `listMeetings`, `getMeeting`, `getRace`, `getEntries`, `getScratches`, and `getResult`. A provider must advertise its implemented capabilities and reject unsupported operations with `PROVIDER_CAPABILITY_UNSUPPORTED` instead of fabricating data.

The current Sportradar UOF integration is wrapped as `sportradar-uof`. The licensed UOF Summary endpoint documents `sr:stage:<id>` for race results, so this adapter exposes only `getRace` and `getResult` until additional licensed coverage is demonstrated. No capability is inferred from marketing pages or undocumented endpoints.

## Provenance and freshness
Every response carries `provider`, `source`, `sourceTimestamp`, `fetchedAt`, `freshness`, `officiality`, and `financialAuthority:false`. Freshness is deterministic: LIVE <=30s, FRESH <=5m, STALE <=1h, otherwise OFFLINE.

`verified` means the authorized provider supplied the observation. It is deliberately different from `official` and from financial authority. Provider data cannot settle bets or balances by itself.

## Conflict policy
Different result signatures for the same race throw `DATA_CONFLICT`. The caller must preserve both evidence records and require reconciliation/operator review; last-write-wins is forbidden.

Fallback priority is fixed:
1. official API;
2. authorized provider;
3. official feed/document;
4. uploaded official PDF;
5. operator;
6. group evidence;
7. never an AI guess.

## Security
The existing Sportradar transport keeps HTTPS-only vendor allowlisting, no credentials in URL, no redirects, bounded timeout, bounded response size and rejection of DTD/non-XML content. The registry does not expose provider tokens or raw XML through canonical endpoints.

## Public API
- `GET /api/v1/hipico/providers`
- `GET /api/v1/hipico/providers/:providerId`
- `GET /api/v1/hipico/providers/:providerId/capabilities`
- `GET /api/v1/hipico/providers/:providerId/health`
- `GET /api/v1/hipico/live/:providerId/meetings`
- `GET /api/v1/hipico/live/:providerId/races/:externalId`
- `GET /api/v1/hipico/live/:providerId/races/:externalId/entries`
- `GET /api/v1/hipico/live/:providerId/races/:externalId/scratches`
- `GET /api/v1/hipico/live/:providerId/races/:externalId/result`

All routes require the existing Hípico operator token while this product boundary remains independent from browser-session authorization.
