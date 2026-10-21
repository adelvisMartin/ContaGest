# #794 · Gym member PWA read projection (increment)

Introduces an allowlisted **read-only** member view model, requiring a server-verified identity+member mapping, matching tenant/user ownership, scoped rows and explicit freshness age. The helper drops email/phone/tokens/clinical metadata and presents stale membership as informational only; online revalidation is still required before any access/booking. It implements no persisted cache, no member route, no API authorization, no workouts, and no offline write queue. #797 remains sole prospective writer.

**Next integration:** protected member API with self-service RBAC (current Gym surface requires gym.manage), session/cache purge/logout/tenant switch via existing pwaOfflineService, Cg* responsive member UI, install/update, offline/read and browser QA. A client-supplied `serverVerified` boolean must not be mistaken for backend authorization: only the service assembling trusted data can set it. `SOURCE_REUSE=NONE`.

**Test:** `node --test tests/gym_member_cache_boundary_v794.test.mjs`. Roll back by removing utility/test/docs.