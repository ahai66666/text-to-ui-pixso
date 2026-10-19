# Pixso Component Bindings

Use this file with `assets/design-system/mapping-registry.json` and
`assets/design-system/pixso-variables.json` before creating or updating Pixso
components through MCP. The mapping registry defines the active HTML/Token →
Pixso target relationship; the variable manifest defines the variable
collections; this file defines which component properties must bind to them. Do
not substitute literal values once an approved variable is available.

## Import Sequence

1. Read the active `profiles[]` entry in `assets/design-system/mapping-registry.json` and confirm its Pixso document and component library.
2. Run `node scripts/validate-mapping-registry.mjs` and `node scripts/build-pixso-token-manifest.mjs --check`, then inspect the active Pixso file.
3. Pass the Token Gate in `references/pixso-mcp.md`.
4. Reconcile approved primitive collections from pixso-core-baseline.json; resolve code semantic aliases to them rather than creating semantic/component variable collections.
5. Create text styles and effect styles from the generated manifest.
6. Build or reconcile core components and variants.
7. Assemble Patterns and pages only from those component instances.

The current static library inventory and lookup contract live in
`assets/design-system/pixso-component-registry.json`; the central registry
selects which inventory belongs to the active profile. Page generation must
follow `references/pixso-component-usage.md`; component names are stable, while
document GUIDs are resolved fresh at runtime.

## Required Component Bindings

| Component | Property | Pixso variable / style | Notes |
|---|---|---|---|
| Primary action | fill | `$brand/100` | Do not create `primary`, `accent`, or `brand/primary` aliases |
| Primary action | inverse content | `$neutral-light/100` | White text and icon |
| Default text and icon | foreground | `$neutral-dark/90` | Primary content |
| Secondary text and icon | foreground | `$neutral-dark/60` | Secondary content |
| Tertiary text and icon | foreground | `$neutral-dark/40` | Tertiary content |
| Border / pressed layer | color | `$neutral-dark/10` | One shared core value |
| Divider | color | `$neutral-dark/20` | One shared core value |
| Hover layer / subtle surface | color | `$neutral-dark/05` | One shared core value |
| Info foreground / subtle | color | `$brand/100` / `$brand/10` | Information reuses Brand; Alert uses Brand 10 background |
| Success foreground / subtle | color | `$function/success/100` / `$function/success/10` | Badge and Alert use Success 10 background |
| Warning foreground / subtle | color | `$function/warning/100` / `$function/warning/10` | Badge and Alert use Warning 10 background |
| Danger foreground / subtle | color | `$function/danger/100` / `$function/danger/10` | Alert uses Danger 10 background |
| Button | height | `$size/control` | 40px standard button |
| Button | horizontal padding | `$padding/button-x` | 16px |
| Button, Split Button | icon-to-label gap | `$gap/button-icon-label` | 8px; no literal gap |
| Button | label | `Typography/Body_L` style | 16 / 20 / 400 for standard 40px Button |
| Icon Button | frame | `$size/control` | 40 × 40px, Ghost by default |
| Icon Button | icon | `$size/icon/md` | 20px |
| Input, Search, Select, Combobox, Date Picker, Time Picker | control height | `$size/control` | 40px standard field control |
| Search | root content gap | `$space/0` | Zero is intentional; segment-specific padding owns local spacing. |
| Input, Search, Textarea | value / entered text | `Typography/Body_L` style | 16 / 20 / 400 |
| Select, Combobox | trigger value | `Typography/Body_L` style | Field-like displayed value |
| Date Picker, Time Picker | trigger value | `Typography/Body_L` style | Field-like displayed value |
| Time Picker | selected hour/minute option | semantic brand foreground + transparent surface | Ghost: brand text, no resting fill |
| Input OTP | digit | `Typography/Body_L` style | 16 / 20 / 400 |
| Sidebar, Dropdown, Accordion | visible label | `Typography/Body_L` style | 40px standard interactive labels |
| Checkbox, Radio, Switch | visible label | `Typography/Body_M` style | 14 / 20 / 400 compact selection-control exception |
| Tabs, 28px Small Button | visible label | `Typography/Body_M` style | Compact-label cases alongside selection controls |
| List / Item | primary label | `Typography/Body_L` style | 16 / 20 / 400 |
| List / Item | time, summary, secondary copy | `Typography/Body_M` style | 14 / 16 / 400 |
| Table | header | `Typography/Body_M` style | 14 / 16 / 400, muted and not bold |
| Table | data cell | `Typography/Body_L` style | 16 / 20 / 400 |
| Table | status, helper | `Typography/Body_S` style | 12 / 14 / 400 |
| Field | title / label | `Typography/Body_M` style | 14 / 20 / 400 |
| Field | label-to-control gap | `$gap/field-label` | 8px |
| Field | adjacent field and form-grid row/column gap | `$gap/form-field` | 16px |
| Card | internal padding | `$padding/card` | 24px, distinct from pane inset |
| Card | title | `Typography/Title_S` style | 20 / 28 / 700 |
| Table | outer padding | `$padding/table` | 24px; content rows own their separate rhythm |
| Main Content | direct scroll wrapper X | `$layout/main-content/padding-x` | 24px on both sides |
| Main Content | direct scroll wrapper Y | `$layout/main-content/padding-top` / `$layout/main-content/padding-bottom` | 16px / 0px |
| Main Detail | direct scroll wrapper X | `$layout/main-detail/padding-x` | 24px on both sides |
| Main Detail | direct scroll wrapper Y | `$layout/main-detail/padding-top` / `$layout/main-detail/padding-bottom` | 16px / 0px |
| Secondary List | state envelope X | `$layout/secondary-list/surface-inset-x` | 16px edge from pane |
| Secondary List | content axis X | `$layout/secondary-list/content-axis-x` | 24px title, toolbar, card content axis |
| Primary Navigation | expanded / collapsed width | `$layout/sidebar/expanded` / `$layout/sidebar/collapsed` | 240px / 64px |
| Titlebar | small height | `$layout/titlebar/s` | 40px for independent secondary page |

## Pattern Constraints To Send With Each MCP Request

```text
Platform: HarmonyOS PC client
Variable source: assets/design-system/pixso-variables.json
Use variables and component instances; do not create literal color, spacing, typography, or control-size values.
Main Content / Main Detail: X 24px, T 16px, B 0px on one direct scrolling wrapper.
Global Primary action: only in the Primary Navigation Shell slot between Brand Anchor and Sidebar navigation.
Default visible text: Body_L. Secondary copy: Body_M. Reference, helper, and status text: Body_S. Extremely small auxiliary notes: Caption_M.
Checkbox, Radio, Switch, Tabs, and 28px Small Button labels use Body_M. Button icon + text: 8px token gap.
```

## MCP Verification Checklist

- Confirm variables are bound to the created component properties, not merely named in layer text.
- Confirm every registered component uses Auto Layout for its direct content flow. Allow intentional overlap only inside a clearly named visual wrapper such as `Progress Visual`.
- Confirm semantic icons resolve through `assets/icons/icon-aliases.json`; do not leave hand-drawn line, ellipse, or stacked icon substitutes.
- Confirm Button icon/text separation measures 8px.
- Confirm Input/Search/Select/Date/Time visible value text resolves to `Body_L`.
- Confirm the Search root gap binds to `$space/0` (0px); segment spacing stays in the slot padding contract.
- Confirm Sidebar, List primary text, Dropdown, Accordion, Calendar, and Time Picker option values resolve to `Body_L`; Table headers, Checkbox, Radio, Switch, Tabs, and 28px Small Button labels resolve to `Body_M`. Confirm selected Time Picker options use Ghost styling with no solid fill.
- Confirm Main Content and Main Detail each measure 24px from both inner pane edges.
- Run layout check and inspect a screenshot before handoff.
