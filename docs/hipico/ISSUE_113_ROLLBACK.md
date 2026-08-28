# #113 rollback

This change adds diagnostic helpers and updates the Bridge health/support CLI only. It does not migrate the database, alter monetary state or enable WhatsApp SOURCE writes.

Rollback is a normal Git revert of the PR. Generated support-bundle directories are local artifacts and are not consumed by runtime state.
