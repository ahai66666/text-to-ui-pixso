# HTML Component Source Resolution

Use `references/index/generated/component-index.json` to find candidates. Each candidate has a `contractPath`; open only the matching file under `packages/component-contracts/src/components/`. The aggregate `packages/component-contracts/src/components.json` is for compatibility with repository scripts, not a file to load for ordinary component selection.

## Context and local delivery

Read page-brief.json v2 for route navigation, then query-resources.mjs --stage discovery for candidates and --stage bindings --component <id> --semantic-context <context> for selected APIs. Use contractPath only for missing details. The generator prepares components/<id>/index.js and contract.json; the page imports components/index.js. See local-component-delivery.md. Read implementation only for component maintenance or diagnosis.

## Resolution order

1. Read the selected component's exact contract file and use a real factory from `@text-to-ui/components-html` when its HTML source supports the requested job.
2. If the package lacks the capability, use that exact component contract and record `matching-contract` evidence.
3. Only when neither source covers the capability, create a page-owned composition using shared Tokens and semantic icon aliases; record the search and missing-capability evidence.

Lookalike markup, copied DOM/CSS, screenshots, `data-component`, or matching class names do not count as component reuse. Pattern and domain compositions may arrange components but must not redraw their internals.

`primary-navigation-shell` is a Pattern slot, not a component query. Its first-level icon controls use the `primary-navigation-item` component. `sidebar` is for labeled, content-bearing navigation rows. Follow `references/components/component-selection-rules.json` when a capability needs a semantic context.

The HTML adapters use approved semantic icon aliases. An unknown alias blocks its binding; do not substitute a raw icon name, Unicode, or hand-drawn glyph.

Query example:

```bash
node scripts/query-components.mjs \
  --framework html --capabilities search,checkbox,list-item,tooltip
```

Use `--context` when a capability has more than one semantic form. `context-required` is a blocking ambiguity, not permission to choose the first visual match.

## Readiness

Read `references/components/component-readiness-policy.json`:

- `approved`: allowed in preview and release.
- `provisional`: usable for Fast Preview when HTML source and contract cover the task; disclose unresolved dimensions.
- `blocked`: stop generation; do not substitute a page-owned lookalike.

Run `scripts/validate-web-component-reuse.mjs --stage release` for formal delivery. A successful Fast Preview does not promote a provisional component.

## Titlebar actions

Use the resolved Pattern's title segments. In a three-column shell, put final-pane actions in the registered Titlebar's `main-detail-actions` slot. Use only the allowed ghost icon or icon-text action modes. Keep primary actions, secondary controls, and window controls in their declared locations.
