# 07 — Performance
- Budget: fast first paint; keep the bundle lean; lazy-load heavy/rare views.
- Core Web Vitals as the target (LCP/INP/CLS). Avoid layout thrash; batch DOM writes via render loop.
- Measure before optimizing; note any regression in the PR.
