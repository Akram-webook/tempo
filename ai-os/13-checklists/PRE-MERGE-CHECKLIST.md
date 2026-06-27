# Pre-merge checklist (Definition of Done)
- [ ] Builds clean (`npm run build`, 0 un-inlined) · all tests green (`npm test`), 0 console errors
- [ ] New/updated `test/verify-*.js` if behavior changed
- [ ] All UI states handled (empty/loading/error-offline/success)
- [ ] EN + AR strings · RTL + dark mode OK · no emojis as icons
- [ ] No secrets committed · verified sign-in not regressed
- [ ] Edited `src/**` only (never `dist/`) · branch + PR · clear description
- [ ] Product Health Score recorded (`14-scorecards`) · follow-up risks/ideas noted
