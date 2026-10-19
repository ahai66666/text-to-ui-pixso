## Failure Handling

- `please open a design file`: ask the user to open and focus the intended Pixso design file, then call `fetch_context` again before any retry.
- `activePageMismatch`: when `get_all_components` reports a component in a different Pixso page than the page returned by `fetch_context`, treat the component as read-only discovery evidence. Do not mutate it by guessed or colliding node ID. Ask the user to open/focus the component-library page, refresh `fetch_context`, and re-resolve the component GUID before any repair or linked-instance replacement.
- A read returns nodes from an unexpected file: stop mutations, refresh context, confirm the active page/Frame, and never edit by a stale GUID.
- `code_to_design` succeeds but native edits fail: report partial capability honestly; do not claim full structured-edit QA.
- `code_to_design` succeeds but the Frame has major absolute-bounds overflow,
  clipped regions, or an obviously wrong auto-layout direction: classify it as
  an import-geometry failure. Repair the existing Frame when the cause is
  deterministic; otherwise preserve the artifact and report the limitation.
  Do not invoke a second whole-page renderer to mask the mismatch without
  explicit user approval.
- Do not fall back to Sketch or Figma unless the user explicitly requests that tool in the current task.

