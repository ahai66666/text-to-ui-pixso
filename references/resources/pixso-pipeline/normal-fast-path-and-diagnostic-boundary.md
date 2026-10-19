## 0. Normal fast path and diagnostic boundary

Normal import is a bounded one-pass production workflow, not a converter-development
session. Use `--mode normal` unless the user explicitly asks to diagnose or improve
the converter. In normal mode:

- capture the current browser state once, returning both the computed visual
  manifest and an exact HTML screenshot;
- compile one Scene and one Operation Plan from the same run;
- query bridge status once and require the native plugin for whole-page output;
  stop with the precise readiness reason when it is not connected;
- execute once and perform one complete readback;
- capture the structured Pixso board once and compare it directly with the HTML
  screenshot;
- keep `codeToDesignCalls` at `0` and create no temporary Baseline Frame.

Do not edit the renderer, component map, Tokens, source HTML, selector collector,
or Scene compiler while a normal run is active. The run records hashes for those
inputs and validation rejects any mutation. If a converter defect is found, stop
the current run, report the failing gate, and fix it in a separate diagnostic task.
After the fix, create a new run; never regenerate the old run until it appears to
pass.

The native executor orders recoverable asset work after the page structure:
resource preflight, layout/content, icon hydration, then image optimization. A
failure while hydrating a page-owned icon or materializing an image must keep its
measured box and commit the already assembled structure as a visible deferred
placeholder; it is recorded in `audit.iconFailures` or `audit.imageFailures` for
a subsequent repair pass. Missing structural resources, component resolution,
layout execution, cancellation, and readback failures remain hard gates and
must preserve the previous accepted artboard.

The normal total budget is 90 seconds. Stage targets are preflight 3 seconds,
capture 8 seconds, compile 5 seconds, execution 45 seconds, readback 10 seconds,
visual diff 5 seconds, and cleanup 5 seconds. These are stopping signals, not
reasons to publish an unverified board. A budget overrun must be reported before
more retries are attempted. The first real page after a runtime upgrade may be
slower, but it still records the exact stage and module that exceeded budget.
Each stage records both `workElapsedMs` and `orchestrationElapsedMs`. The 90-second
budget uses actual work time; bridge polling, tool round trips and human review
remain visible as wall-clock telemetry but cannot make a 200ms collector appear
to be a 40-second conversion.

### Governed queue and retry lifecycle

Before publication, the orchestrator runs a deterministic preflight over the
current HTML source, browser capture bundle, component facts and Operation Plan
contracts. A missing image is a warning-only repair item: its measured rectangle
is retained as a placeholder and the structure may proceed. An optional
component mapping problem (missing target, missing Variant, or geometry mismatch)
is also a warning when the compiler can retain the browser-measured subtree as
native composition; it is recorded in `componentRepairItems` and does not block
the page. A missing capture bundle, stale fingerprint, schema mismatch, or
malformed component contract fails before a Bridge job is created and is never
retried.

The Bridge records the lifecycle
`PRECHECKING → READY → WAITING_FOR_PLUGIN → CLAIMED → RUNNING(module) →
RECOVERING → COMPLETED / NEEDS_ATTENTION / FAILED`. Each transition records the
attempt, last heartbeat, deadline, blocking reason and next action. If a plugin
does not claim within 15 seconds, the Bridge re-dispatches once. If execution is
not confirmed within 45 seconds, it clears the claim and releases the run lock
as `NEEDS_ATTENTION`. The Pixso main runtime emits a module heartbeat every
5 seconds; 60 seconds without one cancels the draft and stops automatic replay.
Result acknowledgement has a separate 15-second deadline. Only connection
failures may recover automatically, and at most once; old, cancelled, failed or
attention-required runs always require a fresh run.

Record each stage around the actual operation:

```bash
node scripts/update-pixso-import-run.mjs \
  --manifest /absolute/path/run-manifest.json \
  --stage capture --status start

node scripts/update-pixso-import-run.mjs \
  --manifest /absolute/path/run-manifest.json \
  --stage capture --status passed
```

Normal mode permits one attempt per stage. Capture has an internal calibration
handshake before its one committed evidence package: it may measure DPR and
adjust the physical browser surface, but it writes exactly one accepted
Manifest/screenshot pair. Use `--mode diagnostic` only in the
separate diagnosis workflow; it permits bounded retries but cannot publish into
the earlier normal run.

