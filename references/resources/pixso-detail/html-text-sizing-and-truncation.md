### HTML text sizing and truncation

For HTML-to-Pixso conversion, use the browser's final computed style and text
metrics as the authority. Do not infer fixed sizing merely because an element
has a CSS width or defensive overflow rules:

- A normal single-line label defaults to `WIDTH_AND_HEIGHT` so its width hugs
  its content.
- A wrapping text block keeps the captured width and uses `HEIGHT` so its
  height can grow.
- Use fixed-width, single-line truncation only when the HTML has
  `white-space: nowrap`, `overflow: hidden` or `clip`, and
  `text-overflow: ellipsis`, and the measured inline text width is greater
  than the captured box width. Preserve the captured width and height and set
  `maxLines: 1`.
- For a truncation operation, first write Pixso's native
  `TextNode.textAutoResize = "TRUNCATE"` after loading the font. If the
  connected runtime rejects that enum, use the versioned compatibility
  renderer: measure the loaded text, write an actual ending `…` that fits the
  fixed captured box, retain `NONE`, and store the source/rendered strings in
  plugin metadata. Readback must accept this only when all of those markers,
  the ellipsis, and fixed bounds are present; never silently clip the full
  string or invent a separate `textTruncation` property. If the text fits,
  keep the intrinsic mode even when the CSS contains defensive ellipsis rules.

The detailed import contract is in
`references/pixso-fidelity-import-pipeline.md`; read it for existing HTML
imports and converter diagnosis.

