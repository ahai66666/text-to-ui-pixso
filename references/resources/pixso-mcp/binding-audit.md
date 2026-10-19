## Binding Audit

After import or repair, query the top-level Frame without resolving variables.
In strict structured reuse, record every mapped binding, linked component
instance, and remaining literal style finding in `pixso-binding-audit.json` and
validate it with:

```bash
node scripts/validate-dual-output.mjs \
  --page-spec /absolute/path/to/page-spec.json \
  --pixso-audit /absolute/path/to/pixso-binding-audit.json
```

An empty hardcoded-color search is not enough in strict mode: every page-spec
variable must appear in the live binding list. In fast visual import, record the
bindings that were actually proven and list remaining literals as known import
limits; do not run the strict zero-literal claim. Read
`dual-output-contract.md` for the complete contract.

Also record a whole-Frame `coverageSummary`: unique nodes, color-bearing nodes,
variable-bound color nodes, literal-paint nodes, layer-opacity literal nodes,
and intrinsic-alpha paints. The zero-literal gate applies only to strict
structured reuse; fast visual import reports the same counts without treating
remaining literals as a blocker.

Pixso may serialize a translucent variable such as `$neutral-dark/90` as both
the variable name and its intrinsic alpha (for example, `opacity: 0.898`) on the
paint. Do not classify that read-back as double opacity. Rebind one
representative node to the same variable, read it again, and separately inspect
the node-level opacity. Only an additional node/layer opacity is a second
opacity operation.

If a linked component's internal icon or text layer exposes no bindable color
property, record it in `componentColorFindings` as a component-library gap.
Do not detach or locally restyle the instance to make the page audit pass.

If `write_variables` returns GUIDs but both native read tools remain empty, the desktop MCP variable writer is not persisting data. Do not hardcode component values. Generate the fallback artifacts with:

```bash
node scripts/build-pixso-token-manifest.mjs --write
```

Then load `scripts/pixso-token-sync-plugin/manifest.json` as a Pixso development plugin and run “同步 Token” in the target file. The plugin uses Pixso's official `pixso.variables` API and is idempotent. `assets/design-system/pixso-tokens-studio.json` is the alternative Tokens Studio import file. After either fallback, rerun all three read checks before continuing.

