# Pixso execution invariants

- Current rendered HTML is the visual authority for an existing website.
- A normal run uses one fresh run ID, one browser capture, one compile, one
  executor, one readback, and one screenshot diff.
- Keep page materialization separate from acceptance quality. Scope an
  `ok: false`, `FAILED`, or module-level component/icon/style readback message
  to its phase and module; it does not prove the canonical page frame is absent.
  A committed current-run root or the user's direct visual confirmation means
  report the page as present and disclose any failing audit/acceptance gate
  separately. Do not repeat diagnosis or publish again unless asked. If no
  current-run root is committed, report the exact incomplete phase. This
  classification never turns a failed quality gate into a pass.
- The browser manifest is the sole geometry source. Component and Token mapping
  happens only after geometry is locked.
- A `TRUNCATE` text operation must carry an explicit semantic
  `textAutoResize: "TRUNCATE"`, fixed captured width/height, and `maxLines: 1`.
  The executor must load the font before trying the native value; a runtime
  that rejects it may use only the versioned ending-ellipsis compatibility
  renderer, whose metadata, visible `…`, and fixed bounds must pass readback.
- Old runs, Baseline Frames, root plans, cached GUIDs, prior screenshots, and
  page-specific Scene defaults never enter a new normal run.
- A normal whole-page HTML import requires the connected Text-to-UI Pixso
  plugin. Never auto-fallback to MCP. MCP whole-page execution is allowed only
  for an explicit diagnostic or after the user explicitly approves the lower-
  fidelity emergency path; never execute both for one run.
- Permanent Agent Kernel `5.0.0`, Bridge protocol `4`, and Operation Plan `5`
  are the current contract. The page-import capabilities `asset.icon.deferred`
  and `asset.image.deferred` indicate that late page-owned asset optimization can
  leave a measured placeholder and report a repairable failure after the
  structure commits. Plans may be queued while Pixso is temporarily
  disconnected; reconnecting the same installed Agent resumes the current job.
- Import governance is bounded: preflight runs before Bridge publication; a
  missing image becomes a measured-box repair item. An optional component
  mapping problem (for example an unregistered `Item`) uses explicit browser-
  preserving native composition, is reported as `componentRepairItems`, and
  does not block the structural import. Malformed component contracts,
  capture-bundle, fingerprint, and schema failures create no queue job and
  receive no automatic retry. Lifecycle states are `PRECHECKING`, `READY`,
  `WAITING_FOR_PLUGIN`, `CLAIMED`, `RUNNING(module)`, `RECOVERING`,
  `COMPLETED`, `NEEDS_ATTENTION`, and `FAILED`. The Bridge retries a missing
  plugin claim once after 15 seconds. A disconnected plugin gets ten minutes
  to be opened, then claims the same publication automatically. A connected
  plugin has 45 seconds to confirm startup. After either deadline the Bridge
  stops with the run lock released; the main Pixso executor emits
  a real module heartbeat every 5 seconds and a 60-second silence becomes
  `NEEDS_ATTENTION`.
- Keep the plugin draft visible while importing. Complete structural modules
  first, then run image optimization as the final asset pass. If page-owned icon
  hydration or an image API fails, retain its measured box as a visible deferred
  placeholder, commit the structure, and expose the exact failure for repair.
  After the final readback
  succeeds, atomically replace the previous canonical artboard. User pause,
  structural/resource failure, unrecoverable component-contract failure,
  layout failure, and readback failure remain hard failures: remove the draft
  and retain the previous accepted artboard. A normal run must leave exactly
  one managed artboard.
- A mapped Instance's color belongs to its selected Pixso Variant. Do not copy
  HTML colors or mapping `contentColor` into the Instance during normal import;
  an explicit `allowContentColorOverride: true` plan field is required for an
  exceptional override. Coremail `Icon Text Button/Ghost/Default` therefore
  remains `neutral-dark/90`.
- When a mapped component exposes an icon or leading slot, the compiler derives
  `componentRef.iconColorSource: "variant-content"`. The Permanent Agent may
  copy the selected Variant's existing icon Fill/Stroke onto the replacement
  semantic icon only; it must not read the HTML color or recolor the label or
  Instance outer content. `pixso-native-component-map.json` records this as a
  generated, read-only compatibility projection of `mapping-registry.json`.
- Component mapping is mapping-first but not page-blocking: an unregistered
  target, missing Variant, or geometry-incompatible optional component may be
  emitted as native composition using the browser-measured subtree. The
  preflight report must list the logical name, selector, reason, and repair
  action; only malformed plans or components with no safe native fallback are
  blocking.
- Keep collection containers separate from their children: in Coremail the
  `.tui-sidebar` parent is a layout container and each `.tui-sidebar-item`
  child maps to `Sidebar Item/Default`; the mail-list `.tui-item` rows map to
  `List Item/White Surface/Default` and currently use native composition until
  a Pixso List Item target is registered.
- A cancelled publication is terminal and must never be reclaimed after a
  reconnect. Completed or failed publications must not replay in a newly opened
  plugin session. Plugin results are stored durably in the UI until Bridge
  acknowledgement, and Bridge synchronizes execute/readback state back into the
  import manifest so a dropped result request cannot leave a permanent run lock.
- The installed Pixso plugin is a self-contained Permanent Executor v1. It
  never downloads executable code from Bridge; a shared install can open an
  Operation Plan directly without any local service. Compiler changes must
  remain inside its fixed operation vocabulary, while Bridge remains an
  optional automatic-delivery transport. A `/claim` is a short lease only;
  Bridge marks a job running only after the Pixso main executor reports
  `RUN_STATE`; `/start` is then confirmed by the UI. A UI timer never fabricates
  module heartbeats, so a frozen executor can be reclaimed.
- Never claim Variable, Style, Component Instance, or visual parity without
  readback evidence.
- Normal HTML import does not call `code_to_design`; that capability is
  diagnostic-only.
