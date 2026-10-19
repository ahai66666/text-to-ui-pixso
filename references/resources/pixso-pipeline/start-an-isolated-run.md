## 1. Start an isolated run

Never generate into a shared output directory that also contains old plans or trials. Create one immutable run directory:

```bash
node scripts/pixso-import-orchestrator.mjs start \
  --html-root /absolute/path/to/current-html \
  --url http://127.0.0.1:43173/path/to/page/ \
  --runs-root /absolute/path/to/import-runs \
  --width 1728 --height 1152 --mode normal
```

The command records `runId`, current HTML fingerprint, viewport, component-map hash, Token-manifest hash, plugin-runtime hash, and the only artifact paths permitted for this run. It also acquires `active-run.lock.json`. A second initialized or running run must fail instead of replacing `current-run.json`; the lock is released only by a completed, failed, or explicitly cancelled run. `current-run.json` is a pointer, not a cache. Never read plans, screenshots, readbacks, or `*-trial.json` files from another run.

Use the orchestrator as the canonical public entry instead of manually choosing
different lifecycle scripts:

```bash
node scripts/pixso-import-orchestrator.mjs status --runs-root /absolute/path/to/import-runs
```

Strict HTML import plans are executable only from the artifact path declared by
that current run. A project-root compatibility plan, a plan without
`execution.importRun.runId`, or a plan whose manifest is not selected by
`current-run.json` must fail closed in the bridge and shared Pixso runtime. Old
run directories may remain for audit; their existence never authorizes replay.

If the HTML, component map, Tokens, or runtime changes after initialization, start a new run. Do not mutate the old run to look current.


## Target page readiness
Before publication verify the exact target page exists in the current Pixso file. If the user requests a new test page, create that empty uniquely named page using the connected Pixso API (only after user authorization), record its ID and pass --target-page <exact-name> at compile. Current executor preflight requires the page to exist before the plan create-page operation; do not rely on implicit creation. Do not create or replace other pages. If a publication fails, retain its evidence and stop that run; after correcting a prerequisite, acceptance testing uses a new capture and new run rather than replaying the failed plan.
Capture at the handoff's scroll position and compare viewport.scroll. Protocol currently requires zoom1.0; validate another CSS viewport size at zoom1.0 when a different target size is needed.
