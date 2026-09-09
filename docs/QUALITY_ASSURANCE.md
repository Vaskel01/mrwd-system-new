# Quality assurance

The project includes local and GitHub checks intended to catch common deployment regressions before a release reaches Vercel or Supabase.

## One-command verification

After installing both dependency sets, run:

```bash
npm run verify
```

This runs:

1. `npm run check:source` — checks the release structure, scans source files for obvious secrets, verifies the fresh-install SQL baseline, and blocks removed workflow artifacts from returning. Local `.env` files are deliberately excluded from scanning because they are gitignored development files; they still must never be packaged or committed.
2. `npm run lint` — runs ESLint across the JavaScript/JSX source.
3. `npm run build` — creates a production Vite build and catches unresolved imports or bundling failures.
4. `npm test` — runs the API/backend test suite.

The classifier evaluation remains separate development evidence:

```bash
npm run test:classifier
```

It must not be described as independent classifier accuracy unless the labelled data follows Appendix A's independent-review protocol.

## GitHub Actions

`.github/workflows/ci.yml` runs source/lint/build/server verification on pushes, pull requests, and manual runs. It also contains a Playwright browser-smoke job. The browser job runs against the configured QA deployment when repository variable `QA_BASE_URL` and secret `QA_DEMO_PASSWORD` are present; otherwise CI reports that the live browser job was skipped instead of pretending it ran.

## Browser acceptance checks

Run:

```bash
npm run qa:browser
```

The current harness checks role workspaces, responsive layouts, quick-find behavior, and a controlled Maintenance completion-form failure. It is useful browser regression evidence, but it is **not** complete automated end-to-end coverage. In particular, the release still requires a separately recorded live journey that performs:

**Browser upload → Supabase Storage private object → API completion → database transaction → authorized signed-photo read-back.**

The current canonical workflow is:

**Customer submits → NSCCCD reviews and routes → WDLCD assigns → Maintenance Personnel submit completion notes + required completion photo → complaint becomes Resolved → Customer can review the resolution/reopen/provide feedback.**

For each role, also verify that unauthorized workspace URLs and complaint/photo access remain blocked.

## Storage-policy acceptance check

After applying the latest schema to a controlled Supabase environment, run `npm run check:photo-storage` with two QA customer accounts. The script verifies private access, time-limited signed access for the owner, cross-user denial, delete isolation, allowed MIME types, the 6 MB bucket limit, and cleanup. The completion workflow must also reject a syntactically valid owner path when no matching Storage object exists and must retain evidence after it is linked to a complaint.

## Accessibility checks

Before a UI release, keyboard-test the changed screens and verify:

- the page can be used without a mouse;
- focus is always visible;
- dialogs keep focus inside while open and return focus after closing;
- form fields retain visible labels after values are entered;
- status is not communicated by color alone;
- primary touch targets are at least about 44 × 44 pixels;
- page and dialog headings describe the current task in plain language.
