## 7. Acceptance gates

The run passes only when all are true:

- source: runId, HTML fingerprint, viewport, state, component map, Tokens and runtime all match;
- geometry: major bounds, padding, gap, alignment, layout direction and border edges differ by at most 1px;
- typography: family, size, weight, line height, wrapping and truncation match, allowing only rasterization noise;
- color/effects: fills, strokes, opacity, radius, shadows and gradients match and standard values are Variable/Style-bound;
- assets: no emoji/text-glyph substitutes, no cropped or duplicated icons, correct SVG fill/stroke channel, correct raster image;
- components: every required mapped region is a real `INSTANCE` with the expected main component, Variant, properties and slots;
- structure: no missing nodes, extra default content, hover-only controls, stale trial nodes, or root overflow;
- visual parity: compare `html-reference.png` and the structured board screenshot at the same crop and state; use a release threshold of at most 0.5% differing pixels after excluding normal text anti-aliasing.

Run the real pixel gate rather than accepting equal canvas dimensions:

```bash
node scripts/pixso-import-orchestrator.mjs diff \
  --reference /absolute/path/html-reference.png \
  --actual /absolute/path/pixso-structured.png \
  --out /absolute/path/visual-diff.json \
  --run-manifest /absolute/path/run-manifest.json \
  --pixel-threshold 20 --max-different-ratio 0.005
```

Failure leaves the new draft uncommitted and produces a report. Never fix one visible symptom by publishing a manual overlay or by reusing an older plan.
