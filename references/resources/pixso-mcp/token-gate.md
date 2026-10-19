## Token Gate

Use `assets/design-system/pixso-core-baseline.json` as the complete Pixso
variable scope: 127 production variables across four collections.
The Color collection contains the complete 56-variable primitive palette from
`assets/design-system/core-color-token-table.md`: Brand, Neutral Dark, Neutral
Light, Function, and Multi. Do not create semantic color aliases in Pixso;
components bind these core variables directly. Spacing, Size & Layout, and
Typography likewise contain primitives only. Code-side semantic and component
aliases resolve through `token-runtime-map.json`; they never become additional
Pixso variables.
Use the generated `scripts/pixso-token-sync-plugin/manifest.json` to update the
baseline in Pixso. It idempotently creates or updates the four approved
collections and 127 variables.
Use `assets/design-system/pixso-manual-additions.json` as the complete list of
approved additions. Its current count is zero.

### Manually added variables

Do not manually add page, component, or semantic variables. Reuse the approved
primitive that resolves to the same value and keep the semantic name in
CSS/JSON:

| Collection | Use for | Naming examples |
| --- | --- | --- |
| `Color` / `Light` | 56 approved colors | `brand/100`, `neutral-dark/05` |
| `Spacing` / `Compact` | Eight spacing primitives | `space/3`, `space/6` |
| `Size & Layout` / `Desktop` | Size, radius, width, height, divider, opacity primitives | `size/40`, `radius/08`, `layout/width/360`, `opacity/40` |
| `Typography` / `HarmonyOS Sans` | Atomic font family, size, line-height, weight, letter spacing | `font/size/14`, `font/weight/500` |

To extend the baseline, first add a genuinely new primitive to the Token source,
update the baseline, regenerate all three mapping artifacts, and pass the
release gate. Never solve a page-level need by adding `component/*`,
`layout/shell/*`, `gap/*`, or `padding/*` variables. Create shadows as Effect
Styles and complete text treatments as Text Styles.

Do not create components or patterns until the active Pixso file passes this gate:

For a free team or a file at the variable-collection limit, first load
`scripts/pixso-token-probe-plugin/manifest.json` and run “写入 3 个测试变量”.
The probe reuses `Color`, `Size & Layout`, and `Typography`; it does not create
another collection. Run “清理测试变量” after verification.

1. Confirm the target file is active and its intended font appears in `fetch_context`.
2. Create temporary color, number, and string variables in the existing approved collections. Do not create a fifth collection.
3. Verify persistence with all three read paths: `read_variables`, `get_variable_sets`, and `get_variables`. A generated GUID from `write_variables` is not proof of persistence.
4. Bind a temporary node to the probe color and number. Treat every unresolved-variable warning as a failed gate.
5. Delete only the temporary node and probe variables. Preserve the existing approved collections.
6. Only after the probe passes, sync the generated manifest in small batches and compare the Pixso read-back count to the manifest summary.

