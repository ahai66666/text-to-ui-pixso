### Icon sizing, stroke, and hot-zone contract

For every semantic SVG icon, keep the 24 × 24 source geometry and treat the
Pixso icon slot as a separate square hot zone:

- Use the design-system stroke table as the authority: 16px → 1px, 20px →
  1.25px, and 24px → 1.5px. For another explicitly approved size, use the
  normalized 24px source rule `1.5 × displaySize ÷ 24`; never copy an asset's
  raw stroke-width unchanged into every display size.
- Set both horizontal and vertical hot-zone alignment to `CENTER`. Centre the
  actual vector bounds inside the slot after hydration; do not use the
  requested icon size as a proxy for the vector bounds and do not inherit top
  alignment from a component or HTML wrapper.
- Use the Pixso `Size & Layout` number variables `icon/stroke/16`,
  `icon/stroke/20`, and `icon/stroke/24` for the three supported weights. The
  Operation Plan must carry these variable references; a literal weight is
  only a diagnostic fallback when the target Pixso file has not synced the
  variables yet.
- Apply the same contract to page SVGs, generated icon Components, and icon
  Instances. A missing exact icon should remain as its original SVG when
  source geometry is available. If no source can be resolved, the page may
  continue with an explicit unresolved fallback for preview; preserve the
  requested name and diagnostic marker so it is not mistaken for exact
  Pixso/library parity.
- The operation plan must carry `hotZone: { alignment: "CENTER", axes:
  "BOTH" }`; Pixso readback must verify both alignment properties, vector x/y
  centring, and the effective stroke weight.

