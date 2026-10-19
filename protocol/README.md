# Pixso Permanent Agent protocol

The Pixso plugin is a stable execution kernel. HTML capture, DOM Visual IR,
component and Token mapping, icon selection, page rules, and acceptance remain
in the Text-to-UI source tree. Codex publishes declarative Operation Plans; the
plugin never downloads or evaluates arbitrary JavaScript.

Protocol v4 supports legacy Operation Plan v1 during migration and prefers the
capability-negotiated Operation Plan v5 contract. A plan may execute only when
the connected agent reports every required capability. Missing capabilities
fail closed with an explicit read-only compatibility result.

Bridge sessions use a renewable lease. Jobs are idempotent by
`execution.agentContract.idempotencyKey`. Invalid or missing-run publications
are archived and removed from the active queue instead of blocking later work.
