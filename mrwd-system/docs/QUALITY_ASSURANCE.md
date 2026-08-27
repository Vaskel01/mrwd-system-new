# Quality assurance

The project includes local and GitHub checks intended to catch common deployment regressions before a release reaches Vercel or Supabase.

## One-command verification

After installing both dependency sets, run:

```bash
npm run verify
```

This runs:

1. `npm run check:source` — checks the release structure, rejects accidental local `.env` files, scans for obvious secrets, verifies that `supabase/setup.sql` is the only shipped SQL installer, and blocks removed workflow artifacts from returning to the fresh database baseline.
2. `npm run lint` — runs ESLint across the JavaScript/JSX source.
3. `npm run build` — creates a production Vite build and catches unresolved imports or bundling failures.
4. `npm test` — runs the API/backend test suite.

The classifier evaluation remains available separately with:

```bash
npm run test:classifier
```

## GitHub Actions

`.github/workflows/ci.yml` runs the same verification on pushes to `main` and on pull requests. A change should not be deployed if the workflow is failing.

## Browser acceptance checks

The repository does not force a browser automation dependency into the production install. Until Playwright or another browser runner is added, use `UAT.md` for role-based end-to-end acceptance testing. The highest-priority journey is:

**Customer submits → NSCCCD reviews and routes → WDLCD assigns → Maintenance completes field work → ECMD verifies → Customer sees the resolved complaint.**

For each role, also verify that unauthorized workspace URLs remain blocked.

## Accessibility checks

Before a UI release, keyboard-test the changed screens and verify:

- the page can be used without a mouse;
- focus is always visible;
- dialogs keep focus inside while open and return focus after closing;
- form fields retain visible labels after values are entered;
- status is not communicated by color alone;
- primary touch targets are at least about 44 × 44 pixels;
- page and dialog headings describe the current task in plain language.

Automated axe/Playwright checks are a good future addition once the project chooses a browser-test dependency and can maintain it in CI.
