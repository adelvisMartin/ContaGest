# #113 security boundary

Observability must never become a new exfiltration path. The support exporter is explicit allow-list, recursively redacts secret-like keys and identifiers, hashes exported files, and rejects accidental session/profile exports. Diagnostics are read-only and do not enable LAB or SOURCE sending.