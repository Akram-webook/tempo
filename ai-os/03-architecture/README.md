# 03 — Architecture
For any change to data shape, modules, or cross-cutting behavior, write a short ADR
(`12-templates/ADR-TEMPLATE.md`) and review against:
- Fits the `window.WP` model (data→core→ui→app load order; state via setState/render).
- No duplicate logic; clear module boundaries; reversible.
- Data access only through an abstraction (e.g. `WP.db`), never scattered calls.
- Failure modes + fallback defined. Scales per `16-best-practices/FUTURE-SCALE-REVIEW.md`.
