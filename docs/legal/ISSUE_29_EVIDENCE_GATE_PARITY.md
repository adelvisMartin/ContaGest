# Issue #29 — paridad entre evidencia profesional y gate productivo

## Hallazgo corregido

`legal-production-gate.mjs` ya exigía todas las decisiones jurídicas de la atestación, pero `legal-review-evidence-v29.mjs` sólo bloqueaba de forma explícita por revisión profesional e identidad del proveedor. Eso permitía que el artifact de evidencia pareciera PASS aunque quedaran aprobaciones temáticas en `false`.

## Contrato unificado

El generador de evidencia ahora exige, igual que producción:

- professionalReview;
- providerIdentity;
- terms;
- privacy;
- cookies;
- acceptableUse;
- suspensionTermination;
- jurisdictionDisputes;
- billingTaxCurrency;
- accountingTaxRetention;
- subprocessorsTransfers;
- cancellationRefundDelinquency;
- ipEvidencePolicy;
- humanHealthAddendum.

Además exige `reviewedAt` válido, reviewer identificado, jurisdicción Venezuela/VE, identidad completa del proveedor y evidence reference + SHA-256.

## Límite

Este cambio **no aporta ni inventa** la identidad jurídica real, datos del abogado, criterio profesional ni documento de revisión. Esos datos siguen siendo externos al código y sólo pueden completarse con información real y revisión profesional.

Un PR mergeado no convierte #29 en aprobación jurídica. El ticket sólo puede cerrarse cuando la atestación real y el E2E de primer acceso/rechazo/reaceptación estén respaldados por evidencia.
