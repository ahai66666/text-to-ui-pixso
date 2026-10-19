## Existing Design and HTML Handoff

1. Re-read the current Pixso document after the user has made edits.
2. Resolve the exact page and top-level Frame; do not rely on a stale GUID from a previous active document.
3. Synchronize approved structural, content, state, and interaction changes into `page-spec.json`.
4. Use `get_screenshot` for visual reference and `design_to_code` for HTML output when the live tools provide it.
5. Treat the latest Pixso state as authoritative over the initial HTML draft, previous HTML, or cached observations.
6. Regenerate or reconcile the final implementation from the synchronized contract, then compare it at the approved desktop viewport, normally `1728 × 1152px`.

