## 运行顺序

```bash
node scripts/generate-pixso-scene.mjs \
  --page-spec /absolute/path/page-spec.json \
  --layout-contract /absolute/path/layout-contract.json \
  --page-data /absolute/path/page-data.json \
  --component-map assets/design-system/mapping-registry.json \
  --html-root /absolute/path/html-source-root \
  --out /absolute/path/pixso-scene.json

node scripts/generate-pixso-operation-plan.mjs \
  --scene /absolute/path/pixso-scene.json \
  --component-map assets/design-system/mapping-registry.json \
  --out /absolute/path/pixso-operation-plan.json

node scripts/prepare-pixso-operation-batches.mjs \
  --plan /absolute/path/pixso-operation-plan.json \
  --out /absolute/path/pixso-operation-batches.json

node scripts/prepare-pixso-mcp-batches.mjs \
  --plan /absolute/path/pixso-operation-plan.json \
  --out /absolute/path/pixso-mcp-call-plan.json
```

