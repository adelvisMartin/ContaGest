# Control Hípico — SOURCE/LAB safety contract (#110)

The Bridge runtime already implements the core safe topology and this ticket turns it into an executable contract:

- SOURCE is read-only: runtime health declares `sourceSendPossible: false` and there is no `send*ToSource` capability.
- LAB writes are opt-in (`HIPICO_LAB_SEND_ENABLED=false` by default).
- Production requires pinned WhatsApp group IDs, HTTPS backend endpoints, audit journal and a strong bridge token.
- SOURCE and LAB IDs must both have `@g.us` format and must be different.
- Before a LAB write the runtime opens the exact LAB title and calls `assertCurrentLabIdentity()`; identity validation compares pinned ID + normalized title and rejects any LAB candidate that points to SOURCE.
- DOM wrappers such as `false_<jid>_ABC` are only discovery inputs. Authorization always reduces to the exact normalized pinned JID.
- Aliases/mojibake repair can help discovery but do not authorize a destination.
- Diagnostics use `redactGroupId()` and must not publish full JIDs, QR/session cookies or browser credentials.

`tests/hipico_whatsapp_safety_issue_110.test.mjs` is the regression gate for these invariants, including wrapped DOM IDs, equal SOURCE/LAB IDs, missing pinning, title mismatch and static proof that the runtime exposes only the LAB mirror write path.

Session/browser-profile isolation remains an operational hardening dimension: a future multi-profile implementation must preserve the same capability contract and cannot weaken the pinned destination checks. Promotion to a real group remains blocked by the broader security/compliance gates (#114/#154).
