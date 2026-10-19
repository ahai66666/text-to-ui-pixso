# Dual-Output Token Contract

Use this contract whenever one task may produce both HTML and Pixso, when
converting between them, or when consistency with the bundled design system is
required.

## Authority

1. `assets/design-system/tokens.*.json` owns token meaning and value.
2. `assets/design-system/mapping-registry.json` owns the cross-source mapping
   profile, including HTML CSS/Token ↔ Pixso Variable relationships.
3. `assets/design-system/dual-output-token-map.json` is the generated renderer
   projection of the active mapping profile.
4. HTML consumes the mapped CSS custom property.
5. Pixso consumes the mapped local Variable or shared Style.
6. `page-spec.json` records only mappings used by the page.

When a different Pixso document or component library is needed, add a new
mapping profile in the central registry. Do not edit the dual-output projection
to create a second source of truth.

Never make HTML, imported computed CSS, or a Pixso layer literal the source of
truth. In `html-first`, the first HTML file is an editable implementation draft
used to validate structure and bootstrap Pixso geometry; the requirement
contract, Token map, and `page-spec.json` remain authoritative.

The page spec is also the run boundary. For `schemaVersion: 2`, record every
hard requirement in `constraintContract.must`, every forbidden output in
`constraintContract.mustNot`, and the required states, interactions, and
evidence files in `constraintContract.acceptance`. Stamp the spec with a fresh
`runId` and its canonical SHA-256 before rendering. HTML, delivery records,
reuse plans, Pixso audits, and the run manifest must carry that same run ID and
page-spec hash; a copied artifact from another spec revision is invalid.

## Compatibility page-spec gate

For explicit legacy page-spec tasks, run before rendering. New dynamic pages use the Blueprint gate and page:validate in the selected workflow:

```bash
node scripts/build-pixso-token-manifest.mjs --check
node scripts/build-dual-output-token-map.mjs --check
node scripts/stamp-page-contract.mjs \
  --page-spec /absolute/path/to/page-spec.json \
  --run-id <run-id>
node scripts/validate-page-spec.mjs /absolute/path/to/page-spec.json
```

The page specification must contain:

```json
{
  "tokenContract": {
    "map": "assets/design-system/dual-output-token-map.json",
    "webStrategy": "css-custom-properties",
    "pixsoStrategy": "variable-bindings",
    "forbidHardcodedStyleValues": true,
    "usedTokens": [
      {
        "role": "action.primary.background",
        "sourceToken": "tokens.colors.json:brand.100",
        "webCssVariable": "--color-brand-100",
        "pixsoVariable": "brand/100"
      }
    ]
  }
}
```

Copy mappings from the generated map. Do not type a plausible path from memory.

## Color Contract

- The five primitive families produce exactly 56 Pixso Color Variables:
  `brand`, `neutral-dark`, `neutral-light`, `function`, and `multi`.
- Web semantic roles remain CSS aliases such as `--color-primary`.
- A single semantic role maps to the same primitive Pixso Variable. Example:
  `--color-primary` → `brand/100`.
- A layered semantic role maps to one Pixso Variable per paint layer. Example:
  `accent-hover` uses `brand/100` plus `neutral-dark/05`.
- Do not create duplicate semantic Pixso Color Variables.
- Do not use a hex, RGB, HSL, named color, arbitrary Tailwind color, or copied
  computed color in page/component styling.
- `transparent` and `none` are the only normal literal paint values.
- A translucent core variable already contains final alpha. Keep layer/paint
  opacity at 100%; do not multiply alpha.

## HTML Renderer

- In `html-first`, render the initial HTML from the same validated page
  specification used by Pixso. Browser-check its structure and primary path
  before import.
- Include or embed the canonical token CSS files.
- Declare project aliases only by referencing canonical variables.
- Consume page colors, spacing, size, radius, typography, shadows, and layout
  through `var(--...)`.
- Add `data-component="<page-spec component id>"` to the root of each component
  implementation.
- Do not use arbitrary color utilities such as `bg-[#0A59F7]`.
- Do not replace a token variable with its resolved value during bundling or
  cleanup.
- Existing compiled framework output may be excluded from authored-style
  scanning only by marking its generated `<style>` and/or `<script>` block
  `data-token-audit="vendor"`. When this escape hatch is used, the document
  must also contain a `data-token-audit="page"` style layer that fully owns the
  visible page/component overrides and consumes every mapping in the page
  contract. Never use the vendor marker on handwritten page or component CSS.
- SVG icons inherit `currentColor` from the mapped component state. CSS filters
  such as `brightness()` or `invert()` are not color Token bindings.

Run:

```bash
node scripts/validate-dual-output.mjs \
  --page-spec /absolute/path/to/page-spec.json \
  --html /absolute/path/to/output.html
```

## Current Pixso route

Normal delivery follows references/pixso-fidelity-import-pipeline.md:
browser readiness → capture/DOM visual IR → compile → Unified Agent plugin →
live readback → visual diff. Use the same dynamically rendered page and its
component/Token manifests. Record logicalName instance counts and fallback causes.

code_to_design is an explicit compatibility/diagnostic route only; it is not
the normal fast-preview renderer. See references/pixso-mcp.md. Strict reuse
requires verified mappings and linked-instance evidence. Provisional components
cannot pass a strict release gate.

## Registered Reuse Preflight

When `componentContract.reuseStrategy` is `registered-components`, run the
reuse planner after page-spec validation and before either renderer:

```bash
node scripts/plan-registered-reuse.mjs \
  --page-spec /absolute/path/to/page-spec.json \
  --out /absolute/path/to/registered-reuse-plan.json
```

The plan is the generation manifest for both sides. Web uses the declared
framework adapter; Pixso creates the exact registered linked instance. A
`verified` row may be instantiated directly. Pending, rebuild, missing,
runtime-fallback, or blocked-content rows cannot pass `--strict`. Do not run
this strict preflight for the fast visual target; use the optional non-strict
planner only after the initial Frame when exact replacements are worthwhile.

After Pixso approval in `html-first`, synchronize approved hierarchy, content,
states, and interaction changes into `page-spec.json`, then regenerate or
refactor the final HTML from that synchronized contract. Reuse sound draft code
where helpful, but never let the stale draft override the approved design.

## Pixso Renderer

Execute the current plugin operation plan after browser readiness. Stop on
blocked capture or unresolved strict mappings; retain the HTML output and report
the exact gate. Collect live readback, screenshots, icon checks and visual diff.
Strict reuse additionally requires Variable and linked-component audits.

Strict binding sequence:

1. Read Variables and prove that every page-spec `pixsoVariable` exists.
2. Bind each standard fill, text color, stroke, number, radius, gap, padding,
   width, and height to the mapped Variable.
3. Bind complete typography and shadow treatments to shared Text/Effect Styles.
4. Replace every registered atomic control with a linked component instance.
5. Query all unique style properties below the top-level Frame.
6. Repair every literal standard value; do not accept visual equality as proof
   of binding.
7. Read the repaired nodes back with variables unresolved and confirm `$...`
   references.

When Pixso serializes a translucent color Variable, a paint read may contain
both `color: "$neutral-dark/90"` and `opacity: 0.898`. Do not classify this as
double opacity automatically. Rebind one representative node directly to the
Variable and read it back. If the same paint representation remains while the
node-level `opacity` property is absent, count it as intrinsic Variable alpha.
Only a separate literal layer opacity or an additional paint opacity that does
not match the Variable alpha is a violation.

Create a `pixso-binding-audit.json` matching
`assets/design-system/pixso-binding-audit.schema.json`. Populate it only from
live Pixso reads. `literalStyleFindings` must be empty, and every token used by
the page must appear in both `availableVariables` and `bindings`.
`coverageSummary` must also prove that every color-bearing node is
Variable-bound, literal paint count is zero, and literal layer-opacity count is
zero. Component-internal icons without a direct Variable binding belong in
`componentColorFindings` and block strict component parity even when page color
coverage passes.

Run:

```bash
node scripts/validate-dual-output.mjs \
  --page-spec /absolute/path/to/page-spec.json \
  --pixso-audit /absolute/path/to/pixso-binding-audit.json
```

## Synchronization

- An initial `html-first` draft exposes a structural defect: fix the requirement
  contract and `page-spec.json`, rerender the draft, and re-check it before
  importing.
- A Pixso visual edit changes content or layout intent: update `page-spec.json`
  first, then rerender HTML.
- A Token value changes: edit `tokens.*.json`, regenerate Pixso manifests and
  the dual-output map, then update both renderers.
- A component rule changes: update the component spec/gallery, repair the Pixso
  master, and rerender page instances.
- Never compare only screenshots. Completion requires both visual parity and
  binding parity.

## HTML and Pixso stage gate

For strict structured reuse, declare libraryPage NewComponents and strict
component parity in the component contract. Run the reuse planner in strict
mode before either renderer; its library-phase and linked-instance checks are a
hard Pixso gate. The target product page may be another page in the same file.
Verify and report the HTML draft as the first visible checkpoint before any
Pixso call. If the gate is blocked, keep the verified HTML artifact and stop
strict Pixso writes.

For preview delivery, use the capture/compiler/plugin route and report
unverified bindings and fallbacks explicitly. Compatibility imports do not
inherit strict completion status.

## Completion Evidence

The dual-output task passes only when:

- the page constraint contract passes `node scripts/validate-page-contract.mjs`,
  including all `must`/`mustNot` checks and required states/interactions;
- every final HTML/JSON artifact and the run manifest carries the same
  `runId` and `pageSpecSha256` as the supplied page spec;
- page spec validation passes;
- an `html-first` draft was browser-checked before import and the final HTML was
  regenerated or reconciled after Pixso approval;
- the HTML audit reports no page-level hardcoded style values;
- the Pixso audit reports no literal standard style values;
- every used token has a valid Web/Pixso mapping;
- every registered component is implemented by the matching HTML contract and a
  linked Pixso instance when strict structured reuse is selected;
- screenshots at the approved viewport match after the binding checks pass.
