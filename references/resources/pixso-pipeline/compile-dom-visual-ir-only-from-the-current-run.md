## 4. Compile DOM Visual IR only from the current run

Every structured layout node must carry current browser evidence: a stable
`metadata.htmlSelector` and a positive `metadata.htmlRect` stamped with
`visualEvidenceSource: browser-computed-visual-manifest`. A Pixso-only wrapper
may be excluded only with `visualEvidenceExempt: true` and a concrete
`visualEvidenceExemptReason`. The legacy `selectorOptional` flag is invalid and
cannot remove nodes from coverage. Pattern defaults may fill missing semantics
only after the live value is known; they may not replace computed padding, gap,
size, alignment, color, border edge, radius, font, or visibility.

Ordered control groups must also carry their current browser child order. Capture
direct rendered children only: exclude mirrored overflow-menu entries, and never
reuse the order of `page-data`, an earlier Scene, or a component default. Text
nodes must preserve the browser's horizontal alignment explicitly in the Scene
and Operation Plan; centering the parent frame alone does not center a fill-width
Pixso text layer.

Generate and gate the plan:

```bash
node scripts/compile-pixso-import.mjs \
  --run-manifest /absolute/path/to/run-manifest.json \
  --visual-manifest /absolute/path/to/html-visual-manifest.json \
  --component-map assets/design-system/mapping-registry.json \
  --minimum-selector-coverage 0.8 \
  --minimum-visual-evidence-coverage 0.95 \
  --name "Imported HTML"

node scripts/validate-pixso-import-run.mjs \
  --run-manifest /absolute/path/to/run-manifest.json \
  --visual-manifest /absolute/path/to/html-visual-manifest.json \
  --operation-plan /absolute/path/to/pixso-operation-plan.json
```

Release requires at least 95% browser geometry coverage and should raise both
selector and geometry coverage toward `1.0`. A lower temporary selector
threshold may be used only to diagnose an unfinished mapper; it is not a
release pass.

The default compiler is `dom-visual-ir`. `legacy-semantic` is an explicit
diagnostic-only route for old domain Scene fixtures; it may not publish an
existing website import.

