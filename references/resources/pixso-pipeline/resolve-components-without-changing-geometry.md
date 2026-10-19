## 5. Resolve Components without changing geometry

Map a component only by canonical `logicalName`, exact Component Set/Variant, declared properties and slots. Never infer identity from visual similarity or layer names.

- Component-owned icons stay inside the Instance and use explicit icon/instance-swap properties.
- Page-owned icons use a fixed Token-sized Icon Slot and semantic SVG hydration.
- If replacing a DOM subtree with an Instance changes its outer bounds, padding, gap, icon size, text wrap, or alignment, the component contract is incompatible. Update the shared component/library contract or leave the region as a Token-bound composition and report the gap. Do not distort the page to fit the old component.
- Native fallback is allowed only when it is explicit, browser-measured,
  Token-bound, and reported in `componentRepairItems`; it must never be a silent
  substitution for a required mapped component.

### Component content-color contract

The selected Pixso Variant owns the visual color of a mapped Instance. Mapping
facts may record the Variant's expected content token for audit and component
maintenance, but HTML computed colors and mapping tokens must not be written as
per-instance overrides during a normal import. The compiler therefore omits
`contentColor` from the execution payload by default. When a semantic icon is
replaced inside a mapped icon slot, the plan may carry
`iconColorSource: "variant-content"`; the runtime copies the selected Variant's
existing icon Fill/Stroke onto that replacement only. It never changes the
label or the Instance's outer content color. The runtime only applies
`allowContentColorOverride: true` when an explicitly authored plan requests an
exception. This prevents a stale `brand/100` mapping from recoloring a Coremail
Ghost control whose native Variant is `neutral-dark/90`.
Readback must verify the exact Variable binding on the label and icon geometry;
checking only the Instance's outer fill is insufficient.

