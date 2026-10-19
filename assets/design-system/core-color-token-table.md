# Pixso Core Color Token Table

This is the complete Pixso color-variable scope. Keep all 56 variables in the
existing `Color` collection and `Light` mode. Use the exact lowercase slash
paths below. Do not add `surface/*`, `text/*`, `status/*`, `badge/*`, `gray/*`,
`black`, or `white` as additional Pixso color variables.

For Brand and Neutral ramps, the suffix is opacity. In Pixso, enter the base
color plus the listed opacity percentage. Pixso may display rounded alpha hex
values such as `0D`, `1A`, `80`, `B3`, or `E6`; that is normal. The canonical
source values remain the 8-digit hex values in `tokens.colors.json`.

| Family | Pixso variable | Canonical value | Opacity | Use |
| --- | --- | --- | ---: | --- |
| Brand | `brand/05` | `#0A59F70C` | 5% | Very light brand layer |
| Brand | `brand/10` | `#0A59F719` | 10% | Selected or info background |
| Brand | `brand/15` | `#0A59F726` | 15% | Light brand layer |
| Brand | `brand/20` | `#0A59F733` | 20% | Focus or info surface |
| Brand | `brand/30` | `#0A59F74D` | 30% | Brand overlay |
| Brand | `brand/40` | `#0A59F766` | 40% | Brand overlay |
| Brand | `brand/50` | `#0A59F77F` | 50% | Brand overlay |
| Brand | `brand/60` | `#0A59F799` | 60% | Muted brand content |
| Brand | `brand/70` | `#0A59F7B2` | 70% | Brand content |
| Brand | `brand/80` | `#0A59F7CC` | 80% | Strong brand content |
| Brand | `brand/90` | `#0A59F7E5` | 90% | Near-opaque brand |
| Brand | `brand/100` | `#0A59F7FF` | 100% | Primary brand |
| Neutral Dark | `neutral-dark/05` | `#0000000C` | 5% | Subtle surface or hover |
| Neutral Dark | `neutral-dark/10` | `#00000019` | 10% | Border or pressed layer |
| Neutral Dark | `neutral-dark/15` | `#00000026` | 15% | Light divider |
| Neutral Dark | `neutral-dark/20` | `#00000033` | 20% | Divider |
| Neutral Dark | `neutral-dark/30` | `#0000004D` | 30% | Disabled or subtle content |
| Neutral Dark | `neutral-dark/40` | `#00000066` | 40% | Tertiary content or overlay |
| Neutral Dark | `neutral-dark/50` | `#0000007F` | 50% | Muted content |
| Neutral Dark | `neutral-dark/60` | `#00000099` | 60% | Secondary content |
| Neutral Dark | `neutral-dark/70` | `#000000B2` | 70% | Strong secondary content |
| Neutral Dark | `neutral-dark/80` | `#000000CC` | 80% | Strong content |
| Neutral Dark | `neutral-dark/90` | `#000000E5` | 90% | Primary text and icon |
| Neutral Dark | `neutral-dark/100` | `#000000FF` | 100% | Black |
| Neutral Light | `neutral-light/05` | `#FFFFFF0C` | 5% | Subtle light layer |
| Neutral Light | `neutral-light/10` | `#FFFFFF19` | 10% | Light state layer |
| Neutral Light | `neutral-light/15` | `#FFFFFF26` | 15% | Light state layer |
| Neutral Light | `neutral-light/20` | `#FFFFFF33` | 20% | Light overlay |
| Neutral Light | `neutral-light/30` | `#FFFFFF4D` | 30% | Light overlay |
| Neutral Light | `neutral-light/40` | `#FFFFFF66` | 40% | Muted inverse content |
| Neutral Light | `neutral-light/50` | `#FFFFFF7F` | 50% | Inverse content |
| Neutral Light | `neutral-light/60` | `#FFFFFF99` | 60% | Inverse content |
| Neutral Light | `neutral-light/70` | `#FFFFFFB2` | 70% | Strong inverse content |
| Neutral Light | `neutral-light/80` | `#FFFFFFCC` | 80% | Strong inverse content |
| Neutral Light | `neutral-light/90` | `#FFFFFFE5` | 90% | Near-opaque white |
| Neutral Light | `neutral-light/100` | `#FFFFFFFF` | 100% | White surface or inverse text |
| Function | `function/success/10` | `#64BB5C19` | 10% | Success badge background |
| Function | `function/success/20` | `#64BB5C33` | 20% | Success alert background |
| Function | `function/success/100` | `#64BB5CFF` | 100% | Success foreground |
| Function | `function/warning/10` | `#ED6F2119` | 10% | Warning badge background |
| Function | `function/warning/20` | `#ED6F2133` | 20% | Warning alert background |
| Function | `function/warning/100` | `#ED6F21FF` | 100% | Warning foreground |
| Function | `function/danger/10` | `#E8402619` | 10% | Error badge background |
| Function | `function/danger/20` | `#E8402633` | 20% | Error alert background |
| Function | `function/danger/100` | `#E84026FF` | 100% | Error or destructive foreground |
| Multi | `multi/01` | `#564AF7` | 100% | Violet data series |
| Multi | `multi/02` | `#46B1E3` | 100% | Cyan data series |
| Multi | `multi/03` | `#61CFBE` | 100% | Teal data series |
| Multi | `multi/04` | `#A5D61D` | 100% | Lime data series |
| Multi | `multi/05` | `#AC49F5` | 100% | Purple data series |
| Multi | `multi/06` | `#E64566` | 100% | Pink data series |
| Multi | `multi/07` | `#F9A01E` | 100% | Orange data series |
| Multi | `multi/08` | `#F7CE00` | 100% | Yellow data series |
| Multi | `multi/09` | `#64BB5C` | 100% | Green categorical series |
| Multi | `multi/10` | `#E84026` | 100% | Red categorical series |
| Multi | `multi/11` | `#ED6F21` | 100% | Orange-red categorical series |

## Direct-binding rule

- Information uses `brand/100`, with `brand/10` or `brand/20` for its background.
- Default surfaces and inverse content use `neutral-light/100`.
- Text, icons, borders, dividers, state layers, and overlays use the matching
  `neutral-dark/*` opacity.
- Success, warning, and danger use only the matching `function/*` triplet.
- Charts and categorical accents use `multi/01` through `multi/11` in order.
- A repeated value must reference the existing core variable. The only approved
  exceptions are `multi/09`, `multi/10`, and `multi/11`, which intentionally
  repeat the opaque success, danger, and warning colors for categorical use.

## Existing-file cleanup

After rebinding components, remove these old Pixso aliases: `brand/primary`,
`brand/primary-*`, `surface/*`, `text/*`, `icon/*`, `border/*`, `divider/*`,
`state/*`, `status/*`, and `overlay/*`. Preserve all approved `multi/01–11`
variables.
