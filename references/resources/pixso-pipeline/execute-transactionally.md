## 6. Execute transactionally

Publish the plan through the plugin bridge. The bridge verifies the run and visual-manifest provenance before exposure to Pixso. The plugin creates a visible draft, executes modules in dependency order, reads the complete result back, and swaps the canonical board only after all checks pass. The visible draft lets the user pause early; the old successful board remains visible if any phase fails.

Choose the executor without waiting for repeated connection timeouts:

```bash
node scripts/pixso-plugin-bridge.mjs status
```

`recommendedExecutor` remains `plugin` for a normal whole-page run. Publish once
after validation even when Pixso is temporarily disconnected; Bridge v7 keeps
the plan in a durable queue, performs one bounded reconnect, and then either
claims it after reconnect or exposes a clear `NEEDS_ATTENTION` action.
Claiming creates only a 15-second lease. The job becomes `running` only after
the plugin UI confirms `/start`, so a disconnected poll or stale debug request
cannot hold the active-run lock. The installed Permanent Executor is
self-contained and consumes only the fixed v1 data-plan vocabulary; Bridge is
optional automatic delivery, not an executable-code update channel. A shared
plugin can therefore import an Operation Plan directly without a local Agent.
Capability, plan-schema, kernel, and protocol mismatches are explicit blockers.
Never automatically prepare MCP calls or run both executors for the same run.

The plugin posts its result to `/result`; the UI keeps an unacknowledged result
durably and retries after a Bridge restart. The Bridge stores it at the run's
`pixso-plugin-result.json`, closes the execute/readback stages, and releases the
active run lock on failure or cancellation. Cancelled and terminal publications
cannot be reclaimed by a reloaded plugin. MCP `eval_script` is an explicit diagnostic or
user-approved emergency executor only and must consume the same plan and runtime.

Before the write, generate or read the official adapter contract:

```bash
node scripts/pixso-official-adapter.mjs --plan /absolute/path/pixso-operation-plan.json --plugin-ready
curl http://127.0.0.1:43982/official-adapter
```

This does not create a second renderer. It assigns current-file resource reads
to the official Pixso integration, full-page bulk creation to the Text-to-UI
native plugin, bounded repairs to `apply_design`, and acceptance to layout,
property-binding, and screenshot checks. Normal mode is blocked from routing to
`code_to_design`.

