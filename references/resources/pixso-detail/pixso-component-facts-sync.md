### Pixso component facts sync

After changing a Pixso component, use the installed Text-to-UI Pixso Unified
Agent's **同步当前组件事实与导入映射** command, or its **同步组件映射** button.
The same plugin remains the Permanent Agent for page import. It sends a no-ID
snapshot of the current `COMPONENT_SET`/`COMPONENT` inventory to the local
Bridge endpoint `/component-sync`; the Bridge normalizes real
`variantProperties` and current geometry, then applies only exact, token-backed
changes to the canonical registry. It also rebuilds and validates the generated
specs and runtime projections in one transaction.

The sync is intentionally partial-safe: a missing or ambiguous source-only
mapping becomes a visible review item while unrelated deterministic mappings
continue to apply. If a currently registered component target disappears, the
old canonical facts file is preserved and safe mapping changes may still be
applied; repair the missing target before accepting a new full facts snapshot.
Never parse a deleted Variant axis from a stale display name, and never persist
Pixso IDs. A new component geometry change should first complete the import or
library task; run this synchronization as the final consistency pass.
