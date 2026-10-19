// Shared Pixso execution runtime.
// This file is embedded in the installable Pixso plugin and in the MCP
// eval_script fallback. It deliberately contains no Node.js imports.
(function registerTextToUiPixsoRuntime(global) {
  const normalize = (value) => String(value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
  const cleanVariableRef = (value) => String(value ?? "").replace(/^\$variable\//, "");
  const cleanStyleRef = (value) => String(value ?? "").replace(/^\$style\//, "");

  function create(pixso) {
    const state = {
      plan: null,
      variables: new Map(),
      styles: new Map(),
      componentSets: new Map(),
      components: new Map(),
      nodes: new Map(),
      iconFailures: [],
      imageFailures: [],
    };
    // MCP eval_script runs each batch in a fresh runtime. Pixso's ordinary
    // pluginData is available inside one call but is not reliably visible to
    // the next call, while shared plugin data survives the batch boundary.
    // Keep pluginData for compatibility with the plugin UI and mirror every
    // renderer marker into the shared namespace for deterministic rehydration.
    const metadataNamespace = "text-to-ui";
    const writePluginMeta = (node, key, value) => {
      const serialized = String(value ?? "");
      try { node?.setSharedPluginData?.(metadataNamespace, key, serialized); } catch (_) {}
      try { node?.setPluginData?.(key, serialized); } catch (_) {}
    };
    const readPluginMeta = (node, key) => {
      try {
        const shared = node?.getSharedPluginData?.(metadataNamespace, key);
        if (shared) return shared;
      } catch (_) {}
      try { return node?.getPluginData?.(key) ?? ""; } catch (_) { return ""; }
    };

    function stablePlanRunId(plan) {
      const source = JSON.stringify(plan);
      let hash = 2166136261;
      for (let index = 0; index < source.length; index += 1) {
        hash ^= source.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
      }
      return `plugin-${(hash >>> 0).toString(36)}`;
    }
    // Strict HTML plans carry the isolated run identity under
    // execution.importRun.runId. Keep that identity as the renderer's
    // cross-module node namespace; falling back to a content hash here makes
    // a fresh import indistinguishable from an older partial output and lets
    // hydrateExistingNodes reattach stale nodes from the page.
    const planRunId = (plan) => plan?.execution?.importRun?.runId
      ?? plan?.execution?.runId
      ?? stablePlanRunId(plan);
    function canonicalPlanKey(plan) {
      return String(plan.execution?.canonicalKey ?? plan.page?.targetFrame ?? plan.page?.name ?? "text-to-ui-page");
    }
    function strictHtmlImportError(plan) {
      const strictHtmlImport = plan?.kind === "pixso-operation-plan" && (
        plan.execution?.sourcePolicy === "fresh-build-current-html-no-history" ||
        Boolean(plan.page?.htmlSourceFingerprint) ||
        plan.page?.visualSnapshot?.source === "html-live-computed-style"
      );
      if (!strictHtmlImport) return null;
      const provenance = plan.execution?.importRun;
      if (!provenance?.runId) return "Strict HTML import plan has no importRun/runId; legacy plans are blocked";
      if (provenance.staleArtifactPolicy !== "reject") return "Strict HTML import plan does not reject stale artifacts";
      const fingerprint = provenance.htmlSourceFingerprint;
      if (!fingerprint || plan.page?.htmlSourceFingerprint !== fingerprint || plan.page?.visualSnapshot?.htmlSourceFingerprint !== fingerprint) {
        return "Strict HTML import plan contains mixed or missing HTML fingerprints";
      }
      return null;
    }

    function permanentExecutorPlanError(plan) {
      if (Number(plan?.execution?.agentContract?.executorProtocol) !== 1) return null;
      const knownOperations = new Set([
        "ensure-font", "ensure-variable", "ensure-style", "ensure-icon", "ensure-image",
        "create-page", "create-frame", "create-component", "create-text", "create-icon",
        "create-icon-slot", "create-instance", "create-image", "create-rectangle",
        "create-ellipse", "create-line", "hydrate-icon",
      ]);
      const unsupported = (plan.operations ?? [])
        .map((operation) => String(operation?.op ?? ""))
        .filter((operation) => operation && !knownOperations.has(operation));
      return unsupported.length
        ? `Permanent Executor v1 does not support operation(s): ${[...new Set(unsupported)].join(", ")}`
        : null;
    }

    const variableName = (ref) => {
      const raw = cleanVariableRef(ref);
      const semanticAliases = {
        "surface/canvas": "neutral-light/100",
        "surface/subtle": "neutral-dark/05",
        "surface/muted": "neutral-dark/05",
        "surface/selected": "brand/10",
        "surface/primary": "brand/100",
        "surface/success": "function/success/10",
        "text/primary": "neutral-dark/90",
        "text/secondary": "neutral-dark/60",
        "text/tertiary": "neutral-dark/40",
        "text/muted": "neutral-dark/40",
        "text/subtle": "neutral-dark/40",
        "text/on-primary": "neutral-light/100",
        "text/success": "function/success/100",
        "text/danger": "function/danger/100",
        "icon/default": "neutral-dark/90",
        "icon/muted": "neutral-dark/60",
        "icon/subtle": "neutral-dark/40",
        "icon/primary": "brand/100",
        "border/default": "neutral-dark/10",
        "border/subtle": "neutral-dark/05",
        "divider/default": "neutral-dark/20",
        "state/unread": "brand/100",
        "state/success": "function/success/100",
        "state/danger": "function/danger/100",
      };
      return state.plan?.resources?.variableAliases?.[raw] ?? semanticAliases[raw] ?? raw;
    };
    const variableFor = (ref) => state.variables.get(variableName(ref)) ?? null;
    const styleFor = (ref) => state.styles.get(cleanStyleRef(ref)) ?? null;
    const iconResourceFor = (ref) => (state.plan?.resources?.icons ?? []).find((icon) => icon.alias === ref?.alias) ?? null;
    const imageResourceFor = (ref) => (state.plan?.resources?.images ?? []).find((image) => image.ref === ref?.ref) ?? null;
    const variableValue = (variable) => {
      if (!variable) return undefined;
      if (variable.value !== undefined) return variable.value;
      const values = variable.valuesByMode ?? {};
      const mode = variable.variableCollectionId && variable.variableCollectionId.defaultModeId;
      return values[mode] ?? values[Object.keys(values)[0]];
    };
    const numberValue = (value) => {
      if (typeof value === "number") return value;
      if (typeof value?.value === "number") return value.value;
      if (value?.variableRef || value?.tokenRef || value?.ref) {
        const result = variableValue(variableFor(value.variableRef ?? value.tokenRef ?? value.ref));
        return typeof result === "number" ? result : null;
      }
      return null;
    };
    const paintFor = (ref) => {
      const variable = variableFor(ref);
      const raw = variableValue(variable);
      if (!variable || !raw || typeof raw !== "object" || !Number.isFinite(raw.r)) throw new Error(`Cannot resolve color Variable: ${variableName(ref)}`);
      const color = { r: raw.r, g: raw.g, b: raw.b, a: raw.a ?? 1 };
      const paint = { type: "SOLID", color: { r: color.r, g: color.g, b: color.b }, opacity: color.a };
      const variablesApi = pixso.variables ?? pixso;
      if (typeof variablesApi?.setBoundVariableForPaint === "function") {
        return variablesApi.setBoundVariableForPaint(paint, "color", variable);
      }
      // Compatibility fallback for older desktop builds. Paint bindings contain
      // a VariableAlias, never the Variable object itself.
      const alias = typeof variablesApi?.createVariableAlias === "function"
        ? variablesApi.createVariableAlias(variable)
        : variable.id ? { type: "VARIABLE_ALIAS", id: variable.id } : null;
      if (!alias) throw new Error(`Cannot create color Variable Alias: ${variableName(ref)}`);
      paint.boundVariables = { color: alias };
      return paint;
    };
    const gradientPaintFor = (gradient) => {
      const stops = (gradient?.stops ?? []).map((stop) => {
        const solid = paintFor(typeof stop.color === "string" ? stop.color : stop.color?.ref ?? stop.color?.tokenRef ?? stop.color?.variableRef);
        return {
          position: Number(stop.position),
          color: {
            r: solid.color.r,
            g: solid.color.g,
            b: solid.color.b,
            a: solid.opacity ?? 1,
          },
        };
      });
      if (stops.length < 2 || stops.some((stop) => !Number.isFinite(stop.position))) {
        throw new Error("Linear gradient requires at least two valid token color stops");
      }
      const angle = Number(gradient.angle ?? 0) * Math.PI / 180;
      // CSS 0deg points upward and Pixso's normalized handles use a top-left
      // origin.  Keeping the conversion here makes the Scene's CSS angle the
      // single source of truth instead of silently flattening the gradient.
      const direction = { x: Math.sin(angle), y: -Math.cos(angle) };
      const scale = 0.5 / Math.max(Math.abs(direction.x), Math.abs(direction.y), 0.0001);
      const start = { x: 0.5 - direction.x * scale, y: 0.5 - direction.y * scale };
      const end = { x: 0.5 + direction.x * scale, y: 0.5 + direction.y * scale };
      return {
        type: "GRADIENT_LINEAR",
        gradientStops: stops,
        gradientHandlePositions: gradient.handles ?? [start, end],
      };
    };
    const gradientFallbackPaintFor = (gradient) => {
      const firstStop = gradient?.stops?.[0]?.color;
      const ref = typeof firstStop === "string" ? firstStop : firstStop?.ref ?? firstStop?.tokenRef ?? firstStop?.variableRef;
      if (!ref) throw new Error("Linear gradient fallback has no token color stop");
      return paintFor(ref);
    };
    const hasPaintVariable = (node, channel, index, paint) => {
      if (paint?.boundVariables?.color) return true;
      try {
        const aliases = node?.boundVariables?.[channel];
        return Array.isArray(aliases) ? Boolean(aliases[index]) : Boolean(aliases);
      } catch (_) { return false; }
    };
    const hasPaintVariableRef = (node, channel, index, paint, ref) => {
      const variable = variableFor(ref);
      if (!variable) return false;
      const paintAlias = paint?.boundVariables?.color;
      const paintAliasId = paintAlias && typeof paintAlias === "object" ? paintAlias.id : paintAlias;
      if (paintAliasId && String(paintAliasId) === String(variable.id)) return true;
      try {
        const aliases = node?.boundVariables?.[channel];
        const alias = Array.isArray(aliases) ? aliases[index] : aliases;
        const aliasId = alias && typeof alias === "object" ? alias.id : alias;
        return Boolean(aliasId && String(aliasId) === String(variable.id));
      } catch (_) { return false; }
    };
    const bind = (node, property, ref) => {
      if (!ref) return false;
      const variable = variableFor(ref);
      if (!variable || typeof node?.setBoundVariable !== "function") throw new Error(`Cannot bind ${property} to ${variableName(ref)}`);
      node.setBoundVariable(property, variable);
      return true;
    };
    const hasNodeVariableRef = (node, property, ref) => {
      const variable = variableFor(ref);
      if (!variable) return false;
      const aliases = node?.boundVariables?.[property];
      const list = Array.isArray(aliases) ? aliases : [aliases];
      return list.some((alias) => String(alias?.id ?? alias ?? "") === String(variable.id));
    };
    const allPages = () => (pixso.root?.children ?? []).filter((node) => node.type === "PAGE");
    const findPage = (name) => allPages().find((page) => normalize(page.name) === normalize(name)) ?? null;
    function ensureTargetPage(plan, targetName) {
      if (!targetName) return pixso.currentPage ?? null;
      const existing = findPage(targetName);
      if (existing) return existing;
      // The operation plan contains a create-page resource operation even
      // though page creation is not part of the node tree. Create the target
      // page when the document does not have it yet; otherwise a valid Coremail
      // plan would stop at preflight with no visible output.
      if (typeof pixso.createPage !== "function") return null;
      const page = pixso.createPage();
      page.name = targetName;
      return page;
    }
    const ensureLibraryPage = (name) => {
      const existing = findPage(name);
      if (existing) return existing;
      if (typeof pixso.createPage !== "function") return null;
      const page = pixso.createPage();
      page.name = name;
      return page;
    };
    const descendants = (node, predicate) => node?.findAll ? node.findAll(predicate) : [];

    async function readResources(plan) {
      state.plan = plan;
      const variables = pixso.variables?.getLocalVariablesAsync ? await pixso.variables.getLocalVariablesAsync() : pixso.getLocalVariablesAsync ? await pixso.getLocalVariablesAsync() : [];
      const textStyles = pixso.getLocalTextStylesAsync ? await pixso.getLocalTextStylesAsync() : [];
      const effectStyles = pixso.getLocalEffectStylesAsync ? await pixso.getLocalEffectStylesAsync() : [];
      state.variables = new Map(variables.map((item) => [item.name, item]));
      state.styles = new Map([...textStyles, ...effectStyles].map((item) => [item.name, item]));
      const library = findPage(plan.execution?.libraryPage ?? plan.resources?.componentLibraryPage ?? "NewComponents");
      if (library) {
        // Component libraries commonly place masters inside SECTION or FRAME
        // containers. Match the component-facts sync traversal so importing a
        // page can resolve the same NewComponents inventory that was synced.
        // Exclude variants and helper nodes nested in a component definition.
        const candidates = typeof library.findAllAsync === "function"
          ? await library.findAllAsync((node) => node.type === "COMPONENT" || node.type === "COMPONENT_SET")
          : (Array.isArray(library.children) ? library.children : [])
            .filter((node) => node.type === "COMPONENT" || node.type === "COMPONENT_SET");
        const reusable = candidates.filter((node) => {
          let parent = node?.parent;
          const visited = new Set();
          while (parent && parent !== library && parent.id !== library.id && !visited.has(parent.id)) {
            visited.add(parent.id);
            if (parent.type === "COMPONENT_SET" || parent.type === "COMPONENT") return false;
            parent = parent.parent;
          }
          return true;
        });
        state.componentSets = new Map(reusable.filter((node) => node.type === "COMPONENT_SET").map((node) => [node.name, node]));
        state.components = new Map(reusable.filter((node) => node.type === "COMPONENT").map((node) => [node.name, node]));
      }
      return library;
    }

    function parseVariant(name) {
      const result = new Map();
      for (const part of String(name ?? "").split(",")) {
        const index = part.indexOf("=");
        if (index > 0) result.set(normalize(part.slice(0, index)), normalize(part.slice(index + 1)));
      }
      return result;
    }
    function variantValueMatches(key, expected, actual) {
      if (actual === expected) return true;
      return false;
    }
    function resolveVariant(ref) {
      const setName = ref?.componentSetName ?? ref?.pixsoName;
      const set = state.componentSets.get(setName);
      const direct = state.components.get(ref?.pixsoName);
      if (!set && direct?.createInstance) return direct;
      const requested = Object.entries(ref?.variant ?? {}).map(([key, value]) => [normalize(key), normalize(value)]);
      if (!set) {
        const prefix = `${setName}/`;
        const directVariant = [...state.components.values()].find((node) => {
          if (!node?.createInstance || !String(node.name ?? "").startsWith(prefix)) return false;
          const parsed = parseVariant(String(node.name).slice(prefix.length));
          return requested.every(([key, value]) => variantValueMatches(key, value, parsed.get(key)));
        });
        if (directVariant) return directVariant;
      }
      if (!set) throw new Error(`Missing Pixso component set: ${setName ?? ref?.logicalName}`);
      const candidate = (set.children ?? []).find((node) => {
        if (node.type !== "COMPONENT") return false;
        const parsed = parseVariant(node.name);
        return requested.every(([key, value]) => variantValueMatches(key, value, parsed.get(key)));
      });
      // Some Pixso documents expose Compact geometry for non-default states
      // before the corresponding Default variant is materialized. Preserve
      // the requested component instance route and reuse the closest Compact
      // state instead of aborting the whole page import at preflight.
      if (!candidate && requested.some(([key, value]) => key === "density" && value === "compact") && requested.some(([key, value]) => key === "state" && value === "default")) {
        const compactFallback = (set.children ?? []).find((node) => {
          if (node.type !== "COMPONENT") return false;
          const parsed = parseVariant(node.name);
          return requested.every(([key, value]) => key === "state" || variantValueMatches(key, value, parsed.get(key))) && parsed.get("density") === "compact";
        });
        if (compactFallback) return compactFallback;
      }
      if (!candidate?.createInstance) throw new Error(`Missing Pixso component variant: ${setName} / ${JSON.stringify(ref?.variant ?? {})}`);
      return candidate;
    }
    function requiredResources(plan) {
      const missing = { variables: [], styles: [], components: [], icons: [], images: [], font: [] };
      for (const variable of plan.resources?.variables ?? []) {
        if (!variableFor(variable.ref ?? variable.name)) missing.variables.push(variableName(variable.ref ?? variable.name));
      }
      for (const style of plan.resources?.styles ?? []) {
        if (!styleFor(style.ref)) missing.styles.push(cleanStyleRef(style.ref));
      }
      for (const operation of plan.operations ?? []) {
        if (operation.op === "ensure-variable" && !variableFor(operation.variableRef ?? operation.name)) missing.variables.push(variableName(operation.variableRef ?? operation.name));
        if (operation.op === "ensure-style" && !styleFor(operation.styleRef)) missing.styles.push(cleanStyleRef(operation.styleRef));
        if (operation.op === "create-instance") {
          try { resolveVariant(operation.componentRef); } catch (error) { missing.components.push(error.message); }
        }
        if (operation.op === "hydrate-icon" && !iconResourceFor(operation.iconRef)?.svg && (plan.kind === "pixso-component-library-plan" || plan.execution?.mode === "component-library")) {
          missing.icons.push(operation.iconRef?.alias ?? operation.targetNodeId);
        }
        // Image materialization is deliberately a late, recoverable pass. A
        // 404 or missing binary must leave the measured image box as a visible
        // placeholder instead of blocking the structural import here.
      }
      return Object.fromEntries(Object.entries(missing).map(([key, value]) => [key, [...new Set(value)]]));
    }
    function hasMissing(missing) {
      return Object.values(missing).some((value) => value.length > 0);
    }

    async function boundedFontLoad(font) {
      let timer;
      try {
        await Promise.race([
          pixso.loadFontAsync(font),
          new Promise((_, reject) => { timer = setTimeout(() => {
            const error = new Error(`字体加载超时：${font.family}/${font.style}`);
            error.code = "TEXT_TO_UI_FONT_TIMEOUT";
            reject(error);
          }, 10000); }),
        ]);
      } finally { clearTimeout(timer); }
    }
    async function loadFont() {
      if (!pixso.loadFontAsync) return;
      for (const style of ["Regular", "Medium", "Bold"]) {
        try { await boundedFontLoad({ family: "HarmonyOS Sans", style }); } catch (error) { if (error.code === "TEXT_TO_UI_FONT_TIMEOUT") throw error; }
      }
    }

    function svgAttribute(tag, name) {
      const match = String(tag ?? "").match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, "i"));
      return match ? match[1] : null;
    }

    function svgNumber(tag, name, fallback = 0) {
      const value = Number(svgAttribute(tag, name));
      return Number.isFinite(value) ? value : fallback;
    }

    function svgPointPairs(value) {
      const numbers = String(value ?? "").match(/-?(?:\d+\.?\d*|\.\d+)/g)?.map(Number) ?? [];
      const pairs = [];
      for (let index = 0; index + 1 < numbers.length; index += 2) pairs.push([numbers[index], numbers[index + 1]]);
      return pairs;
    }

    function svgViewBox(svg) {
      const root = String(svg ?? "").match(/<svg\b[^>]*>/i)?.[0] ?? "";
      const viewBox = String(svgAttribute(root, "viewBox") ?? "").match(/-?(?:\d+\.?\d*|\.\d+)/g)?.map(Number) ?? [];
      if (viewBox.length >= 4 && viewBox[2] > 0 && viewBox[3] > 0) {
        return { x: viewBox[0], y: viewBox[1], width: viewBox[2], height: viewBox[3] };
      }
      return { x: 0, y: 0, width: svgNumber(root, "width", 24), height: svgNumber(root, "height", 24) };
    }

    const ICON_SOURCE_ARTBOARD = 24;
    const ICON_RENDERER_VERSION = "4";
    const ICON_HOT_ZONE_ALIGNMENT = "CENTER";
    // These are the design-system stroke weights, not the raw value that a
    // particular SVG happens to carry. A source asset can still contain a
    // different stroke-width, but the Pixso display contract is authoritative
    // at the supported control sizes.
    const ICON_STROKE_WEIGHT_BY_DISPLAY_SIZE = Object.freeze({ 16: 1, 20: 1.25, 24: 1.5 });

    function svgStrokeWidth(svg) {
      const source = [
        String(svg ?? "").match(/<svg\b[^>]*>/i)?.[0] ?? "",
        ...(String(svg ?? "").match(/<(?:path|line|polyline|polygon|rect|circle|ellipse)\b[^>]*>/gi) ?? []),
      ].join(" ");
      const match = source.match(/\bstroke-width\s*=\s*["']([^"']+)["']/i)
        ?? source.match(/\bstroke-width\s*:\s*([^;\s}]+)/i);
      const value = Number(match?.[1]);
      return Number.isFinite(value) && value > 0 ? value : 1.5;
    }

    function iconStrokeScale(svg, size) {
      const box = svgViewBox(svg);
      const target = Number(size);
      const width = Number(box.width);
      const height = Number(box.height);
      if (Number.isFinite(target) && target > 0 && Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0) {
        return Math.min(target / width, target / height);
      }
      return Number.isFinite(target) && target > 0 ? target / ICON_SOURCE_ARTBOARD : 1;
    }

    function iconEffectiveStrokeWeight(svg, size) {
      const target = Number(size);
      const exact = ICON_STROKE_WEIGHT_BY_DISPLAY_SIZE[target];
      if (Number.isFinite(exact)) return exact;
      // Preserve the same 1.5px-on-24px rule for an explicitly supported
      // custom size instead of leaking an asset's unnormalized source value.
      const value = 1.5 * (Number.isFinite(target) && target > 0 ? target : ICON_SOURCE_ARTBOARD) / ICON_SOURCE_ARTBOARD;
      return Math.round(value * 1000) / 1000;
    }

    function normalizeIconVectorContract(vector, svg, size, declaredStrokeWeight = null) {
      if (!vector || !svg) return;
      if (nativeIconPaintMode(svg) !== "fill") {
        const declared = numberValue(declaredStrokeWeight);
        const strokeWeight = Number.isFinite(declared) && declared > 0
          ? declared
          : iconEffectiveStrokeWeight(svg, size);
        try { vector.strokeWeight = strokeWeight; } catch (_) {}
        if (declaredStrokeWeight?.ref) bind(vector, "strokeWeight", declaredStrokeWeight.ref);
        try { vector.strokeCap = "ROUND"; } catch (_) {}
        try { vector.strokeJoin = "ROUND"; } catch (_) {}
        writePluginMeta(vector, "text-to-ui-icon-stroke-weight", strokeWeight);
      }
      writePluginMeta(vector, "text-to-ui-icon-renderer-version", ICON_RENDERER_VERSION);
      writePluginMeta(vector, "text-to-ui-icon-source-artboard", ICON_SOURCE_ARTBOARD);
      writePluginMeta(vector, "text-to-ui-icon-display-size", Number(size));
      writePluginMeta(vector, "text-to-ui-icon-hot-zone-align", ICON_HOT_ZONE_ALIGNMENT);
    }

    function nodeDimension(node, key) {
      const value = Number(node?.[key]);
      return Number.isFinite(value) && value >= 0 ? value : null;
    }

    function centerIconNodeInHotZone(icon, hotZone) {
      const zoneWidth = nodeDimension(hotZone, "width");
      const zoneHeight = nodeDimension(hotZone, "height");
      const iconWidth = nodeDimension(icon, "width");
      const iconHeight = nodeDimension(icon, "height");
      if (zoneWidth === null || zoneHeight === null || iconWidth === null || iconHeight === null) return false;
      try { icon.x = (zoneWidth - iconWidth) / 2; } catch (_) {}
      try { icon.y = (zoneHeight - iconHeight) / 2; } catch (_) {}
      return true;
    }

    function enforceIconHotZone(hotZone) {
      if (!hotZone) return;
      if (["FRAME", "COMPONENT", "INSTANCE"].includes(hotZone.type)) {
        try { hotZone.primaryAxisAlignItems = ICON_HOT_ZONE_ALIGNMENT; } catch (_) {}
        try { hotZone.counterAxisAlignItems = ICON_HOT_ZONE_ALIGNMENT; } catch (_) {}
        // The HTML SVG wrapper is the visible hot zone. Do not turn a vector
        // bound or a fractional stroke into a clipped/top-aligned glyph.
        try { hotZone.clipsContent = false; } catch (_) {}
      }
      writePluginMeta(hotZone, "text-to-ui-icon-hot-zone-align", ICON_HOT_ZONE_ALIGNMENT);
      writePluginMeta(hotZone, "text-to-ui-icon-renderer-version", ICON_RENDERER_VERSION);
    }

    function nativeIconPathData(svg, alias = "") {
      // The source close icon uses two transformed bars. The old parser
      // intentionally ignored SVG transforms, which collapsed both bars into
      // the same horizontal filled block in Pixso. Keep the semantic geometry
      // native, but express the two diagonal bars directly so the result is
      // stable in Pixso's vector path model.
      if (normalize(alias) === "window/close") {
        return [
          "M 5.25 5.25 L 6.31 4.19 L 19.81 17.69 L 18.75 18.75 Z",
          "M 18.75 5.25 L 19.81 6.31 L 6.31 19.81 L 5.25 18.75 Z"
        ];
      }
      const paths = [];
      for (const tag of String(svg ?? "").match(/<path\b[^>]*>/gi) ?? []) {
        const data = svgAttribute(tag, "d");
        if (data) paths.push(data);
      }
      for (const tag of String(svg ?? "").match(/<line\b[^>]*>/gi) ?? []) {
        paths.push(`M ${svgNumber(tag, "x1")} ${svgNumber(tag, "y1")} L ${svgNumber(tag, "x2")} ${svgNumber(tag, "y2")}`);
      }
      for (const tag of String(svg ?? "").match(/<(?:polyline|polygon)\b[^>]*>/gi) ?? []) {
        const points = svgPointPairs(svgAttribute(tag, "points"));
        if (points.length > 1) {
          paths.push(`M ${points.map(([x, y]) => `${x} ${y}`).join(" L ")}${tag.toLowerCase().startsWith("<polygon") ? " Z" : ""}`);
        }
      }
      for (const tag of String(svg ?? "").match(/<rect\b[^>]*>/gi) ?? []) {
        const x = svgNumber(tag, "x");
        const y = svgNumber(tag, "y");
        const width = svgNumber(tag, "width");
        const height = svgNumber(tag, "height");
        if (width > 0 && height > 0) paths.push(`M ${x} ${y} H ${x + width} V ${y + height} H ${x} Z`);
      }
      for (const tag of String(svg ?? "").match(/<circle\b[^>]*>/gi) ?? []) {
        const cx = svgNumber(tag, "cx");
        const cy = svgNumber(tag, "cy");
        const radius = svgNumber(tag, "r");
        if (radius > 0) paths.push(`M ${cx - radius} ${cy} A ${radius} ${radius} 0 1 0 ${cx + radius} ${cy} A ${radius} ${radius} 0 1 0 ${cx - radius} ${cy} Z`);
      }
      for (const tag of String(svg ?? "").match(/<ellipse\b[^>]*>/gi) ?? []) {
        const cx = svgNumber(tag, "cx");
        const cy = svgNumber(tag, "cy");
        const rx = svgNumber(tag, "rx");
        const ry = svgNumber(tag, "ry");
        if (rx > 0 && ry > 0) paths.push(`M ${cx - rx} ${cy} A ${rx} ${ry} 0 1 0 ${cx + rx} ${cy} A ${rx} ${ry} 0 1 0 ${cx - rx} ${cy} Z`);
      }
      return paths;
    }

    function nativeIconPaintMode(svg) {
      const tags = [String(svg ?? "").match(/<svg\b[^>]*>/i)?.[0] ?? "", ...(String(svg ?? "").match(/<(?:path|line|polyline|polygon|rect|circle|ellipse)\b[^>]*>/gi) ?? [])];
      const source = tags.join(" ");
      const hasStroke = /\bstroke\s*=\s*["'](?!none["'])/i.test(source);
      const hasFill = /\bfill\s*=\s*["'](?!none["'])/i.test(source);
      return hasFill && !hasStroke ? "fill" : "stroke";
    }

    function nativeIconFromSvg(svg, size, colorRef, alias = "") {
      if (typeof pixso.createVector !== "function") throw new Error("Current Pixso runtime does not expose safe createVector for semantic icons");
      const paths = nativeIconPathData(svg, alias);
      if (paths.length === 0) throw new Error("Semantic icon has no supported native vector geometry");
      const vector = pixso.createVector();
      vector.vectorPaths = paths.map((data) => ({ windingRule: "NONZERO", data }));
      // Do not resize a thin path to a square. That turns the minimize bar,
      // three-dot menu, and line icons into solid blocks. Fit the natural
      // geometry proportionally from the SVG viewBox into the requested icon
      // box, while retaining the source path's x/y offset.
      const box = svgViewBox(svg);
      const naturalWidth = Number(vector.width);
      const naturalHeight = Number(vector.height);
      const naturalX = Number(vector.x);
      const naturalY = Number(vector.y);
      const scale = Math.min(Number(size) / box.width, Number(size) / box.height);
      if (Number.isFinite(naturalWidth) && naturalWidth > 0 && Number.isFinite(naturalHeight) && naturalHeight > 0 && Number.isFinite(scale) && scale > 0) {
        vector.resize(Math.max(0.01, naturalWidth * scale), Math.max(0.01, naturalHeight * scale));
        try { vector.x = (naturalX - box.x) * scale; } catch (_) {}
        try { vector.y = (naturalY - box.y) * scale; } catch (_) {}
      } else {
        vector.resize(size, size);
      }
      vector.fills = [];
      vector.strokes = [];
      const paint = colorRef ? paintFor(colorRef) : null;
      if (nativeIconPaintMode(svg) === "fill") {
        if (paint) vector.fills = [paint];
      } else {
        if (paint) vector.strokes = [paint];
        // The source geometry is always authored on a 24x24 artboard. The
        // effective native stroke must scale with the displayed SVG: 24 ->
        // 1.5px, 20 -> 1.25px, and 16 -> 1px. Assign this after resize so a
        // Pixso vector cannot retain the old source value at every size.
        normalizeIconVectorContract(vector, svg, size);
      }
      writePluginMeta(vector, "text-to-ui-icon-renderer", "native-vector");
      writePluginMeta(vector, "text-to-ui-icon-renderer-version", ICON_RENDERER_VERSION);
      writePluginMeta(vector, "text-to-ui-icon-source-artboard", ICON_SOURCE_ARTBOARD);
      writePluginMeta(vector, "text-to-ui-icon-display-size", Number(size));
      writePluginMeta(vector, "text-to-ui-icon-hot-zone-align", ICON_HOT_ZONE_ALIGNMENT);
      if (nativeIconPaintMode(svg) !== "fill") writePluginMeta(vector, "text-to-ui-icon-stroke-weight", iconEffectiveStrokeWeight(svg, size));
      return vector;
    }

    function setFrameDefaults(node, layout = {}) {
      if (!["FRAME", "COMPONENT"].includes(node.type)) return;
      node.layoutMode = layout.direction === "NONE" ? "NONE" : layout.direction === "HORIZONTAL" ? "HORIZONTAL" : "VERTICAL";
      node.itemSpacing = 0;
      node.paddingTop = 0;
      node.paddingRight = 0;
      node.paddingBottom = 0;
      node.paddingLeft = 0;
      const primary = layout.distribution === "SPACE_BETWEEN" ? "SPACE_BETWEEN" : layout.primaryAlign ?? layout.align ?? "MIN";
      const counter = layout.counterAlign ?? layout.align ?? "MIN";
      node.primaryAxisAlignItems = primary === "CENTER" ? "CENTER" : primary === "MAX" ? "MAX" : primary === "SPACE_BETWEEN" ? "SPACE_BETWEEN" : "MIN";
      node.counterAxisAlignItems = counter === "CENTER" ? "CENTER" : counter === "MAX" ? "MAX" : "MIN";
      if (layout.clipsContent !== undefined) node.clipsContent = Boolean(layout.clipsContent);
      if (readPluginMeta(node, "text-to-ui-icon-hot-zone") === "true") enforceIconHotZone(node);
    }
    function resizeNumeric(node, layout = {}) {
      const width = numberValue(layout.width);
      const height = numberValue(layout.height);
      if (width !== null || height !== null) node.resize(Math.max(1, width ?? node.width ?? 1), Math.max(1, height ?? node.height ?? 1));
      const refOf = (value) => value?.variableRef ?? value?.tokenRef ?? value?.ref;
      if (width !== null) bind(node, "width", refOf(layout.width));
      if (height !== null) bind(node, "height", refOf(layout.height));
    }
    function applyTruncationCompatibility(node, layout = {}) {
      if (node?.type !== "TEXT" || readPluginMeta(node, "text-to-ui-truncate-renderer") !== "ending-ellipsis-v1") return;
      const targetWidth = numberValue(layout.width);
      const targetHeight = numberValue(layout.height);
      if (targetWidth === null || targetHeight === null) throw new Error("Pixso truncate compatibility requires fixed captured bounds");
      const source = readPluginMeta(node, "text-to-ui-truncate-source") || String(node.characters ?? "");
      const ellipsis = "…";
      const measure = (characters) => {
        node.textAutoResize = "WIDTH_AND_HEIGHT";
        node.characters = characters;
        return Number(node.width);
      };
      let rendered = source;
      // A compatible Pixso runtime has no TRUNCATE enum. Measure with its
      // native intrinsic mode, then persist an actual ending ellipsis inside
      // the fixed box rather than clipping a full string with NONE.
      if (measure(source) > targetWidth + 0.01) {
        let low = 0;
        let high = Array.from(source).length;
        const glyphs = Array.from(source);
        while (low < high) {
          const middle = Math.ceil((low + high) / 2);
          if (measure(`${glyphs.slice(0, middle).join("")}${ellipsis}`) <= targetWidth + 0.01) low = middle;
          else high = middle - 1;
        }
        rendered = `${glyphs.slice(0, low).join("")}${ellipsis}`;
      }
      node.characters = rendered;
      node.textAutoResize = "NONE";
      node.resize(Math.max(1, targetWidth), Math.max(1, targetHeight));
      writePluginMeta(node, "text-to-ui-truncate-source", source);
      writePluginMeta(node, "text-to-ui-truncate-rendered", rendered);
    }
    function applyLayout(node, layout = {}, parent) {
      setFrameDefaults(node, layout);
      resizeNumeric(node, layout);
      const absolutePositioning = layout.positioning === "ABSOLUTE";
      // Component-library roots are direct children of a PAGE. Their review
      // grid position is explicit; never apply x/y to ordinary auto-layout
      // children. A CSS absolute/fixed child remains explicitly positioned
      // even when its parent is an Auto Layout frame.
      if (parent?.type === "PAGE" || parent?.layoutMode === "NONE" || absolutePositioning) {
        if (Number.isFinite(layout.x)) node.x = layout.x;
        if (Number.isFinite(layout.y)) node.y = layout.y;
        if ((parent?.layoutMode === "NONE" || absolutePositioning) && "layoutPositioning" in node) {
          try { node.layoutPositioning = "ABSOLUTE"; } catch (_) {}
        }
      } else if ("layoutPositioning" in node) {
        // Rehydrated nodes can come from an older absolute-only plan. Clear
        // that stale positioning before letting the current parent Auto Layout
        // place this flow child.
        try { node.layoutPositioning = "AUTO"; } catch (_) {}
      }
      const refOf = (value) => value?.variableRef ?? value?.tokenRef ?? value?.ref;
      if (layout.gap !== null && layout.gap !== undefined && "itemSpacing" in node) {
        node.itemSpacing = numberValue(layout.gap) ?? 0;
        bind(node, "itemSpacing", refOf(layout.gap));
      }
      for (const [key, property] of [["top", "paddingTop"], ["right", "paddingRight"], ["bottom", "paddingBottom"], ["left", "paddingLeft"]]) {
        if (layout.padding?.[key] !== undefined && property in node) {
          node[property] = numberValue(layout.padding[key]) ?? 0;
          bind(node, property, refOf(layout.padding[key]));
        }
      }
      for (const [key, property] of [["minWidth", "minWidth"], ["maxWidth", "maxWidth"], ["minHeight", "minHeight"], ["maxHeight", "maxHeight"]]) {
        if (layout[key] === undefined || !(property in node)) continue;
        const value = numberValue(layout[key]);
        if (value === null) throw new Error(`Cannot resolve ${key} for ${node.name || node.type}`);
        node[property] = value;
      }
      const parentDirection = parent?.layoutMode === "HORIZONTAL" ? "HORIZONTAL" : "VERTICAL";
      // Pixso currently maps layoutSizing*=HUG inconsistently on children and can
      // turn it into layoutGrow=1. Child hug sizing is represented by intrinsic
      // size plus layoutGrow=0; Frame content sizing is controlled by its own
      // primary/counter axis modes below.
      if (parent) {
        try { node.layoutGrow = 0; } catch (_) {}
        try { node.layoutAlign = "INHERIT"; } catch (_) {}
      }
      const setOwnFrameSizing = (axis, mode) => {
        if (!["FRAME", "COMPONENT", "INSTANCE"].includes(node.type)) return;
        const ownDirection = node.layoutMode === "HORIZONTAL" ? "HORIZONTAL" : "VERTICAL";
        const isPrimary = (axis === "width" && ownDirection === "HORIZONTAL") || (axis === "height" && ownDirection === "VERTICAL");
        const property = isPrimary ? "primaryAxisSizingMode" : "counterAxisSizingMode";
        if (!(property in node)) return;
        try { node[property] = mode === "hug" ? "AUTO" : "FIXED"; } catch (_) {}
      };
      const applySizeMode = (axis, mode) => {
        if (mode === null || mode === undefined || mode === "") return;
        const modeName = typeof mode === "string" ? mode : "fixed";
        const sameAxis = (axis === "width" && parentDirection === "HORIZONTAL") || (axis === "height" && parentDirection === "VERTICAL");
        if (modeName === "fill") {
          if (sameAxis) node.layoutGrow = 1;
          else if ((axis === "width" && (layout.minWidth !== undefined || layout.maxWidth !== undefined)) || (axis === "height" && (layout.minHeight !== undefined || layout.maxHeight !== undefined))) {
            // A cross-axis fill with a max constraint is the native equivalent
            // of HTML's width:100%; max-width:920px; margin-inline:auto. Let
            // the parent counter-axis alignment center the bounded child.
            node.layoutAlign = "INHERIT";
            const parentPadding = axis === "width"
              ? (parent?.paddingLeft ?? 0) + (parent?.paddingRight ?? 0)
              : (parent?.paddingTop ?? 0) + (parent?.paddingBottom ?? 0);
            const available = Math.max(1, (axis === "width" ? parent?.width : parent?.height) - parentPadding);
            const minimum = numberValue(axis === "width" ? layout.minWidth : layout.minHeight) ?? 1;
            const maximum = numberValue(axis === "width" ? layout.maxWidth : layout.maxHeight);
            const bounded = Math.max(minimum, Math.min(maximum ?? available, available));
            try {
              if (axis === "width") node.resize(bounded, Math.max(1, node.height ?? 1));
              else node.resize(Math.max(1, node.width ?? 1), bounded);
            } catch (_) {}
          } else {
            node.layoutAlign = "STRETCH";
          }
        } else if (modeName === "hug" || modeName === "fixed") setOwnFrameSizing(axis, modeName);
      };
      applySizeMode("width", layout.width);
      applySizeMode("height", layout.height);
      if (node.type === "TEXT") {
        if (Number.isInteger(layout.maxLines) && layout.maxLines > 0 && "maxLines" in node) node.maxLines = layout.maxLines;
        const requestedTextResize = layout.textAutoResize ?? (layout.overflow === "truncate" ? "TRUNCATE" : null);
        if (requestedTextResize === "WIDTH_AND_HEIGHT") {
          node.textAutoResize = "WIDTH_AND_HEIGHT";
        } else if (requestedTextResize === "HEIGHT") {
          node.textAutoResize = "HEIGHT";
        } else if (requestedTextResize === "NONE") {
          node.textAutoResize = "NONE";
        } else if (requestedTextResize === "TRUNCATE") {
          if (!("textAutoResize" in node)) throw new Error("Pixso runtime does not support TextNode.textAutoResize=TRUNCATE");
          try {
            node.textAutoResize = "TRUNCATE";
            writePluginMeta(node, "text-to-ui-truncate-renderer", "native");
          } catch (error) {
            // Pixso 5 currently accepts WIDTH_AND_HEIGHT, HEIGHT and NONE,
            // but rejects the otherwise documented TRUNCATE enum. Preserve
            // the compiler's truncation semantic and emulate its visible
            // ending ellipsis only on that incompatible runtime.
            node.textAutoResize = "NONE";
            writePluginMeta(node, "text-to-ui-truncate-renderer", "ending-ellipsis-v1");
            if (!readPluginMeta(node, "text-to-ui-truncate-source")) {
              writePluginMeta(node, "text-to-ui-truncate-source", String(node.characters ?? ""));
            }
            writePluginMeta(node, "text-to-ui-truncate-fallback-error", String(error?.message ?? error));
          }
        } else if (layout.width === "fill") {
          node.textAutoResize = "HEIGHT";
          // Cross-axis fill needs an explicit wrapping width. Main-axis fill is
          // allocated by auto layout; using the full parent width there pushes
          // trailing tools outside the row.
          if (parentDirection === "VERTICAL") {
            const availableWidth = Math.max(1, (parent?.width ?? node.width ?? 1) - (parent?.paddingLeft ?? 0) - (parent?.paddingRight ?? 0));
            node.resize(availableWidth, Math.max(1, node.height ?? 1));
          }
        } else if (numberValue(layout.width) !== null && numberValue(layout.height) !== null) node.textAutoResize = "NONE";
        else if (numberValue(layout.width) !== null) node.textAutoResize = "HEIGHT";
        else node.textAutoResize = "WIDTH_AND_HEIGHT";
        applyTruncationCompatibility(node, layout);
      }
    }
    function applyStyle(node, style = {}, deep = false) {
      const targets = deep ? [node, ...descendants(node, () => true)] : [node];
      for (const target of targets) {
        if (target.type === "TEXT" && style.textAlignHorizontal && "textAlignHorizontal" in target) {
          target.textAlignHorizontal = style.textAlignHorizontal;
        }
        const hasSolidFill = Array.isArray(target.fills) && target.fills.some((paint) => paint?.type === "SOLID");
        const hasSolidStroke = Array.isArray(target.strokes) && target.strokes.some((paint) => paint?.type === "SOLID");
        const hasImageFill = Array.isArray(target.fills) && target.fills.some((paint) => paint?.type === "IMAGE" && paint.imageHash);
        const imageRenderer = readPluginMeta(target, "text-to-ui-image-renderer");
        const preservesImagePaint = imageRenderer === "native-svg" || imageRenderer === "deferred-placeholder";
        if (style.fill?.kind === "transparent" && "fills" in target && !hasImageFill && !preservesImagePaint) target.fills = [];
        else if (style.fill?.kind === "linear-gradient" && "fills" in target && (!deep || hasSolidFill || target === node)) {
          try {
            target.fills = [gradientPaintFor(style.fill)];
          } catch (error) {
            // Pixso desktop builds currently reject GRADIENT_LINEAR paints in
            // eval_script/plugin contexts even though the paint shape matches
            // the documented Figma-compatible schema. Preserve the first CSS
            // stop as a token-bound solid fallback so the import keeps the
            // correct semantic color and remains editable instead of aborting
            // the whole module at this node.
            target.fills = [gradientFallbackPaintFor(style.fill)];
            writePluginMeta(target, "text-to-ui-gradient-fallback", "solid-first-stop");
            writePluginMeta(target, "text-to-ui-gradient-fallback-error", String(error?.message ?? error));
          }
        }
        else if (style.fill?.ref && "fills" in target && (!deep || hasSolidFill)) target.fills = [paintFor(style.fill.ref)];
        else if (!style.fill?.ref && target.type === "FRAME" && "fills" in target) target.fills = [];
        if (style.stroke?.ref && "strokes" in target) {
          target.strokes = [paintFor(style.stroke.ref)];
          const edges = style.strokeEdges ?? ["top", "right", "bottom", "left"];
          const edgeProperties = { top: "strokeTopWeight", right: "strokeRightWeight", bottom: "strokeBottomWeight", left: "strokeLeftWeight" };
          if (style.strokeEdges) {
            for (const [edge, property] of Object.entries(edgeProperties)) {
              const weight = numberValue(style.strokeWeights?.[edge]);
              try { target[property] = edges.includes(edge) ? (weight ?? 1) : 0; } catch (_) {}
            }
          } else target.strokeWeight = 1;
        } else if (style.strokeEdges && "strokes" in target) {
          // An explicit empty edge list is a contract, not an omission. Clear
          // inherited strokes and edge weights when a node is reused from a
          // previous Pixso output; otherwise a former separator can survive
          // as an unexpected full or bottom border in the new HTML import.
          target.strokes = [];
          const edgeProperties = { top: "strokeTopWeight", right: "strokeRightWeight", bottom: "strokeBottomWeight", left: "strokeLeftWeight" };
          for (const property of Object.values(edgeProperties)) {
            try { target[property] = 0; } catch (_) {}
          }
        }
        // Semantic SVGs commonly express currentColor as a stroke. When an icon
        // carries one semantic color ref, bind both of its existing paint
        // channels recursively so native vector hydration cannot leave literal black
        // Vector strokes inside an otherwise tokenized icon Frame.
        else if (deep && style.fill?.ref && "strokes" in target && hasSolidStroke) {
          target.strokes = [paintFor(style.fill.ref)];
        }
        if (style.radius?.ref && "cornerRadius" in target) {
          const radius = numberValue(style.radius);
          if (radius === null) throw new Error(`Cannot resolve radius Variable: ${variableName(style.radius.ref)}`);
          target.cornerRadius = radius;
          bind(target, "cornerRadius", style.radius.ref);
        }
      }
      if (style.textStyle?.ref && "textStyleId" in node) {
        const textStyle = styleFor(style.textStyle.ref);
        if (!textStyle?.id) throw new Error(`Missing Text Style: ${cleanStyleRef(style.textStyle.ref)}`);
        node.textStyleId = textStyle.id;
      }
      // Formal Text Styles remain the preferred path. HTML can also contain
      // valid tokenized typography outside the formal style matrix (for
      // example 10px metadata, 12px supporting copy, or 14px/700 unread
      // subjects). Apply that fallback only when there is no shared Text
      // Style, otherwise direct properties would detach or override it.
      if (node.type === "TEXT" && !style.textStyle?.ref && style.typography) {
        const typography = style.typography;
        if (typography.fontFamily && typography.fontStyle && "fontName" in node) {
          try { node.fontName = { family: typography.fontFamily, style: typography.fontStyle }; } catch (_) {}
        }
        const fontSize = numberValue(typography.fontSize);
        if (fontSize !== null && "fontSize" in node) {
          node.fontSize = fontSize;
          try { bind(node, "fontSize", typography.fontSize?.ref); } catch (_) {}
        }
        if (typography.lineHeight && "lineHeight" in node) {
          if (typography.lineHeight.unit === "AUTO") node.lineHeight = { unit: "AUTO" };
          else {
            const lineHeight = numberValue(typography.lineHeight);
            if (lineHeight !== null) {
              node.lineHeight = { unit: "PIXELS", value: lineHeight };
              try { bind(node, "lineHeight", typography.lineHeight?.ref); } catch (_) {}
            }
          }
        }
        const letterSpacing = numberValue(typography.letterSpacing);
        if (letterSpacing !== null && "letterSpacing" in node) {
          node.letterSpacing = { unit: "PIXELS", value: letterSpacing };
          try { bind(node, "letterSpacing", typography.letterSpacing?.ref); } catch (_) {}
        }
      }
      if (style.opacity !== undefined && "opacity" in node) {
        const opacity = numberValue(style.opacity);
        if (opacity !== null) {
          node.opacity = opacity > 1 ? opacity / 100 : opacity;
          bind(node, "opacity", style.opacity?.ref);
        }
      }
      if (style.effectStyle?.ref && "effectStyleId" in node) {
        const effectStyle = styleFor(style.effectStyle.ref);
        if (!effectStyle?.id) throw new Error(`Missing Effect Style: ${cleanStyleRef(style.effectStyle.ref)}`);
        node.effectStyleId = effectStyle.id;
      }
    }
    function setMetadata(node, operation) {
      if (operation.metadata?.defaultVisibility === "hidden") node.visible = false;
      writePluginMeta(node, "text-to-ui-scene-id", operation.nodeId ?? "");
      writePluginMeta(node, "text-to-ui-region", operation.region ?? "");
      const runId = planRunId(state.plan);
      if (runId) writePluginMeta(node, "text-to-ui-run-id", runId);
      if (operation.op === "create-instance") writePluginMeta(node, "text-to-ui-component-ref", JSON.stringify(operation.componentRef ?? {}));
      // A mapped Instance owns its visual colors through the selected Pixso
      // Variant. HTML evidence and mapping tokens are not instance overrides;
      // only an explicitly authored opt-in may write these audit keys.
      if (operation.op === "create-instance" && operation.componentRef?.allowIconColorOverride === true && operation.metadata?.iconColor) writePluginMeta(node, "text-to-ui-icon-color", operation.metadata.iconColor);
      if (operation.op === "create-instance" && operation.componentRef?.allowContentColorOverride === true && operation.componentRef?.contentColor) writePluginMeta(node, "text-to-ui-content-color", JSON.stringify(operation.componentRef.contentColor));
      if (operation.op === "create-component" && operation.componentContract) {
        const contract = operation.componentContract;
        writePluginMeta(node, "text-to-ui-component-logical-name", contract.logicalName ?? "");
        writePluginMeta(node, "text-to-ui-component-renderer-key", contract.rendererKey ?? "");
        writePluginMeta(node, "text-to-ui-component-props", JSON.stringify(contract.props ?? []));
        writePluginMeta(node, "text-to-ui-component-slots", JSON.stringify(contract.slots ?? []));
        writePluginMeta(node, "text-to-ui-component-source", JSON.stringify(contract.sourceEvidence ?? {}));
        writePluginMeta(node, "text-to-ui-component-token-roles", JSON.stringify(contract.tokenRoles ?? []));
      }
      if (operation.source === "native-composition") writePluginMeta(node, "text-to-ui-native-fallback", operation.componentRef?.logicalName ?? operation.fallbackRecipe ?? "native");
      if (operation.op === "create-image") writePluginMeta(node, "text-to-ui-image-ref", operation.imageRef?.ref ?? "");
      if (operation.style?.fill?.kind === "linear-gradient") {
        writePluginMeta(node, "text-to-ui-gradient-token-refs", JSON.stringify((operation.style.fill.stops ?? []).map((stop) => ({ position: stop.position, ref: stop.color?.ref ?? null }))));
      }
    }

    function findComponentPropertyKey(component, name) {
      const definitions = component?.componentPropertyDefinitions ?? {};
      return Object.keys(definitions).find((key) => normalize(key.split("#", 1)[0]) === normalize(name)) ?? null;
    }

    function ensureComponentProperties(component, contract) {
      if (!component || !contract || typeof component.addComponentProperty !== "function") return;
      for (const [name, definition] of Object.entries(contract.properties ?? {})) {
        if (findComponentPropertyKey(component, name)) continue;
        try {
          component.addComponentProperty(name, definition.type ?? "TEXT", definition.defaultValue ?? "");
        } catch (error) {
          throw new Error(`Cannot expose Pixso component property ${contract.logicalName}/${name}: ${error.message}`);
        }
      }
    }

    function bindComponentTextProperties(component, rootId, operations) {
      if (!component) return;
      for (const operation of operations ?? []) {
        if (operation.op !== "create-text" || !operation.propertyBinding) continue;
        const node = state.nodes.get(operation.nodeId);
        if (!node) continue;
        const key = findComponentPropertyKey(component, operation.propertyBinding.propName);
        if (!key) continue;
        const references = node.componentPropertyReferences ?? {};
        try {
          node.componentPropertyReferences = { ...references, characters: key };
        } catch (_) {
          // Older Pixso builds may expose the property but not allow the
          // reference assignment. Readback will report the missing binding.
        }
        const defaultValue = component.componentPropertyDefinitions?.[key]?.defaultValue;
        if (typeof defaultValue === "string" && node.characters !== defaultValue) node.characters = defaultValue;
      }
    }
    function isLegacyIconFontText(textNode) {
      const family = typeof textNode?.fontName === "object" && textNode.fontName !== null
        ? String(textNode.fontName.family ?? "")
        : "";
      return /^(?:HM Symbol|icon_font)$/i.test(family.trim());
    }
    async function setInstanceText(textNode, value) {
      // Existing HarmonyOS masters may contain HM Symbol text layers for
      // icons. They are not business-text slots and must never be loaded or
      // overwritten during Text-to-UI instance reconciliation; generated
      // pages use semantic SVG icon resources instead.
      if (isLegacyIconFontText(textNode)) return;
      if (!textNode || value === undefined || value === null || value === "") return;
      if (pixso.loadFontAsync && textNode.fontName && textNode.fontName !== pixso.mixed) {
        try { await boundedFontLoad(textNode.fontName); } catch (error) { if (error.code === "TEXT_TO_UI_FONT_TIMEOUT") throw error; }
      }
      textNode.characters = String(value);
    }
    const propertyBase = (key) => normalize(String(key ?? "").split("#", 1)[0]);
    function instancePropertyKey(node, names) {
      const candidates = new Set((Array.isArray(names) ? names : [names]).map(normalize));
      return Object.keys(node?.componentProperties ?? {}).find((key) => candidates.has(propertyBase(key))) ?? null;
    }
    function normalizedVariantValue(name, value, componentRef = null) {
      const prop = normalize(name);
      if (prop === "variant" || prop === "type") {
        const raw = normalize(value);
        const setName = normalize(componentRef?.componentSetName ?? componentRef?.pixsoName);
        // The current Pixso component set exposes the type axis as the exact
        // values `primary` and `ghost`. Do not invent a namespaced value here:
        // doing so makes a valid live variant fail preflight or property write.
        if (setName === "icon-text" && ["primary", "ghost", "secondary"].includes(raw)) return raw;
        return raw === "primary" ? "Primary" : raw === "ghost" ? "Ghost" : raw === "secondary" ? "Secondary" : raw === "danger" ? "Danger" : value;
      }
      if (prop === "size") {
        const raw = normalize(value);
        return raw === "standard" || raw === "normal" || raw === "large" ? "Medium" : value;
      }
      if (prop === "state" && (value === true || value === false)) return value ? "selected" : "default";
      return value;
    }
    function iconComponentFor(alias) {
      // Reuse the matching semantic icon Component from NewComponents. Missing
      // entries are materialized by ensureMissingIconComponents with the safe
      // createComponent + native-vector path below, never through the stale
      // SVG-to-node conversion path.
      const wanted = normalize(alias);
      if (!wanted) return null;
      return [...state.components.values()].find((component) => {
        const name = normalize(component.name);
        return name === wanted ||
          name === `icon/${wanted}` ||
          name === `icon - ${wanted}` ||
          name === `text-to-ui icon/${wanted}` ||
          name.endsWith(`/icon/${wanted}`);
      }) ?? null;
    }
    function iconComponentNeedsRepair(component) {
      if (!component || !String(component.name).startsWith("Text-to-UI Icon/")) return false;
      const rendererVersion = readPluginMeta(component, "text-to-ui-icon-renderer-version");
      const vector = descendants(component, (item) => item.type === "VECTOR")[0] ?? null;
      if (rendererVersion === ICON_RENDERER_VERSION && vector) return false;
      if (!vector) return true;
      // Version 2 fixed the square-resize failure but still retained the
      // source 1.5px stroke at 16/20px and did not guarantee hot-zone centring.
      // Any generated master below v3 must be rebuilt in place; preserving its
      // component id keeps existing instance references valid.
      return true;
    }
    async function ensureMissingIconComponents(plan, library) {
      if (!library || typeof pixso.createComponent !== "function" || typeof pixso.createVector !== "function") return [];
      const created = [];
      for (const resource of plan.resources?.icons ?? []) {
        if (!resource?.alias || !resource.svg) continue;
        const existing = iconComponentFor(resource.alias);
        if (existing) {
          // Earlier imports created the same semantic components with the
          // square-resize bug. Repair only our generated Text-to-UI icon
          // components in place so component IDs and references remain valid.
          if (String(existing.name).startsWith("Text-to-UI Icon/") && iconComponentNeedsRepair(existing)) {
            try {
              for (const child of [...(existing.children ?? [])]) child.remove?.();
              const size = Number(resource.size ?? 20);
              const vector = nativeIconFromSvg(resource.svg, size, "$variable/icon/default", resource.alias);
              vector.name = "Icon geometry";
              existing.appendChild(vector);
              existing.resize(size, size);
              enforceIconHotZone(existing);
              centerIconNodeInHotZone(vector, existing);
              writePluginMeta(existing, "text-to-ui-icon-alias", resource.alias);
              writePluginMeta(existing, "text-to-ui-icon-display-size", size);
              writePluginMeta(existing, "text-to-ui-icon-renderer-version", ICON_RENDERER_VERSION);
              created.push(`repaired:${resource.alias}`);
            } catch (_) {}
          } else if (String(existing.name).startsWith("Text-to-UI Icon/")) {
            const size = Number(readPluginMeta(existing, "text-to-ui-icon-display-size") || resource.size || existing.width || 20);
            for (const vector of descendants(existing, (item) => item.type === "VECTOR")) normalizeIconVectorContract(vector, resource.svg, size);
            enforceIconHotZone(existing);
            for (const vector of descendants(existing, (item) => item.type === "VECTOR")) centerIconNodeInHotZone(vector, existing);
            normalizeIconHotZoneTree(existing);
          }
          continue;
        }
        let component = null;
        try {
          component = await pixso.createComponent();
          component.name = `Text-to-UI Icon/${resource.alias}`;
          writePluginMeta(component, "text-to-ui-icon-alias", resource.alias);
          writePluginMeta(component, "text-to-ui-icon-renderer-version", ICON_RENDERER_VERSION);
          library.appendChild(component);
          const size = Number(resource.size ?? 20);
          const vector = nativeIconFromSvg(resource.svg, size, "$variable/icon/default", resource.alias);
          vector.name = "Icon geometry";
          component.appendChild(vector);
          component.resize(size, size);
          enforceIconHotZone(component);
          centerIconNodeInHotZone(vector, component);
          writePluginMeta(component, "text-to-ui-icon-display-size", size);
          state.components.set(component.name, component);
          created.push(resource.alias);
        } catch (_) {
          component?.remove?.();
        }
      }
      return created;
    }
    function collectInstancePropertyChanges(node, operation) {
      const changes = {};
      const set = (names, value) => {
        const key = instancePropertyKey(node, names);
        if (key && value !== undefined && value !== null) changes[key] = value;
      };
      for (const [prop, rawValue] of Object.entries(operation.props ?? {})) {
        if (prop === "label") set(["label", "文本"], rawValue);
        else if (prop === "count") {
          set(["count", "数量"], rawValue === null || rawValue === undefined ? "" : String(rawValue));
          set(["quantity"], rawValue !== null && rawValue !== undefined && rawValue !== "");
        } else if (prop === "selected") {
          set(["selected"], Boolean(rawValue));
          set(["state"], Boolean(rawValue) ? "selected" : "default");
        } else if (prop === "icon" || prop === "iconName") {
          const icon = iconComponentFor(rawValue);
          if (icon) set(["icon", "sidebar-icon", "leading", "Leading", "Icon"], icon.id);
        } else if (prop === "variant") set(["variant", "type"], normalizedVariantValue(prop, rawValue, operation.componentRef));
        else if (prop === "size") set(["size"], normalizedVariantValue(prop, rawValue));
        else if (prop === "checked") {
          set(["checked"], rawValue ? "true" : "false");
          set(["Selected"], rawValue ? "ON" : "OFF");
        }
        else set([prop], normalizedVariantValue(prop, rawValue, operation.componentRef));
      }
      for (const [slot, rawValue] of Object.entries(operation.slots ?? {})) {
        if (slot === "icon" || slot === "leading" || slot === "trigger" || slot === "actions") {
          const alias = typeof rawValue === "string" ? rawValue : null;
          const icon = alias ? iconComponentFor(alias) : null;
          if (icon) set(["icon", "sidebar-icon", "leading", "Leading", "Icon", "trigger", "Trailing"], icon.id);
        } else if (slot === "label" || slot === "value" || slot === "title") {
          if (typeof rawValue === "string") set([slot, "label", "文本"], rawValue);
        } else if (slot === "trailing" && rawValue !== undefined && rawValue !== null) {
          set(["count", "数量", "trailing"], String(rawValue));
          set(["quantity"], rawValue !== "");
        }
      }
      return changes;
    }
    function isIconInstance(item) {
      const refs = item?.componentPropertyReferences ?? {};
      const mainRef = refs.mainComponent;
      const names = [
        typeof mainRef === "string" ? mainRef : mainRef?.name,
        item?.mainComponent?.name,
        item?.mainComponent?.parent?.name,
        item?.name,
        readPluginMeta(item, "text-to-ui-icon-alias"),
      ].map(normalize).filter(Boolean);
      return names.some((name) => name.includes("icon") || name.startsWith("text-to-ui icon/") || name.includes("highlight"));
    }

    function variableRefById(id) {
      const targetId = String(id ?? "");
      if (!targetId) return null;
      const variable = [...state.variables.values()].find((item) => String(item?.id ?? "") === targetId);
      return variable?.name ? `$variable/${variable.name}` : null;
    }

    function colorSourceFromPaint(node, channel, index, paint) {
      const paintBinding = paint?.boundVariables?.color;
      const bindings = node?.boundVariables?.[channel];
      const nodeBinding = Array.isArray(bindings) ? bindings[index] : bindings;
      const binding = paintBinding ?? nodeBinding;
      const variableRef = variableRefById(binding?.id ?? binding);
      if (variableRef) return { kind: "variable", ref: variableRef };
      if (paint?.type !== "SOLID" || !paint.color) return null;
      const { r, g, b } = paint.color;
      if (![r, g, b].every((value) => Number.isFinite(Number(value)))) return null;
      return {
        kind: "literal",
        type: "SOLID",
        color: { r: Number(r), g: Number(g), b: Number(b) },
        ...(paint.opacity === undefined ? {} : { opacity: Number(paint.opacity) }),
      };
    }

    function variantContentPaintSource(node) {
      const roots = [node?.mainComponent, node].filter(Boolean);
      const iconInstances = [];
      const seen = new Set();
      for (const root of roots) {
        const candidates = [
          ...(root.type === "INSTANCE" && isIconInstance(root) ? [root] : []),
          ...descendants(root, (item) => item.type === "INSTANCE" && isIconInstance(item)),
        ];
        for (const candidate of candidates) {
          if (!seen.has(candidate)) {
            seen.add(candidate);
            iconInstances.push(candidate);
          }
        }
      }
      for (const icon of iconInstances) {
        const paintNodes = [icon, ...descendants(icon, () => true)];
        for (const paintNode of paintNodes) {
          for (const channel of ["fills", "strokes"]) {
            const paints = paintNode?.[channel];
            if (!Array.isArray(paints)) continue;
            for (let index = 0; index < paints.length; index += 1) {
              const source = colorSourceFromPaint(paintNode, channel, index, paints[index]);
              if (source) return source;
            }
          }
        }
      }
      // A library Variant may expose a direct vector in a named icon slot
      // instead of nesting an icon Component. Read only that Variant-owned
      // geometry as a last resort; never use the HTML operation's color.
      for (const root of roots) {
        const vectors = [
          ...(root.type === "VECTOR" ? [root] : []),
          ...descendants(root, (item) => item.type === "VECTOR" && isIconHotZoneNode(item.parent)),
        ];
        for (const vector of vectors) {
          for (const channel of ["fills", "strokes"]) {
            const paints = vector?.[channel];
            if (!Array.isArray(paints)) continue;
            for (let index = 0; index < paints.length; index += 1) {
              const source = colorSourceFromPaint(vector, channel, index, paints[index]);
              if (source) return source;
            }
          }
        }
      }
      return null;
    }

    function hasDirectTextChild(node) {
      return (node?.children ?? []).some((child) => child.type === "TEXT" && child.visible !== false);
    }

    function isNamedIconHotZone(node) {
      const name = normalize(node?.name);
      return /^#(?:icon|leading|trailing)(?:$|[\s./_-])/.test(name)
        || /^(?:icon|leading|trailing)(?:\s+(?:slot|geometry|container|wrapper))?$/.test(name)
        || /^(?:brand|reply|close|minimize|maximize)\s+icon$/.test(name);
    }

    function isIconHotZoneNode(node) {
      if (readPluginMeta(node, "text-to-ui-icon-hot-zone") === "true") return true;
      const name = normalize(node?.name);
      if (isNamedIconHotZone(node)) return true;
      return /^#(?:icon|leading|trailing)(?:$|[\s./_-])/.test(name)
        || /(?:icon slot|icon geometry|brand icon|reply icon|close icon|minimize icon|maximize icon|leading|trailing)/.test(name);
    }

    function hasTextInSiblingTree(node, excluded) {
      return (node?.children ?? []).some((child) => child !== excluded && (
        child.type === "TEXT" || descendants(child, (item) => item.type === "TEXT" && item.visible !== false).length > 0
      ));
    }

    function normalizeIconHotZoneTree(node) {
      const candidates = [node, ...descendants(node, () => true)];
      for (const zone of candidates.filter(isIconHotZoneNode)) {
        enforceIconHotZone(zone);
        for (const child of zone.children ?? []) {
          if (child.type === "VECTOR") {
            centerIconNodeInHotZone(child, zone);
            writePluginMeta(child, "text-to-ui-icon-hot-zone-align", ICON_HOT_ZONE_ALIGNMENT);
          } else if (child.type === "INSTANCE" && isIconInstance(child)) {
            centerIconNodeInHotZone(child, zone);
            for (const vector of descendants(child, (item) => item.type === "VECTOR")) {
              centerIconNodeInHotZone(vector, child);
              writePluginMeta(vector, "text-to-ui-icon-hot-zone-align", ICON_HOT_ZONE_ALIGNMENT);
            }
          }
        }
        const row = zone.parent;
        if (!row || row === zone) continue;
        const hasTextSibling = hasDirectTextChild(row) || hasTextInSiblingTree(row, zone);
        if (row.layoutMode === "HORIZONTAL" && hasTextSibling) {
          try { row.counterAxisAlignItems = ICON_HOT_ZONE_ALIGNMENT; } catch (_) {}
        } else if (row.layoutMode === "NONE") {
          const rowHeight = nodeDimension(row, "height");
          const zoneHeight = nodeDimension(zone, "height");
          if (rowHeight !== null && zoneHeight !== null) {
            try { zone.y = (rowHeight - zoneHeight) / 2; } catch (_) {}
          }
        }
      }
    }

    function centerIconInstanceHotZones(node) {
      const iconInstances = descendants(node, (item) => item.type === "INSTANCE" && isIconInstance(item));
      for (const iconInstance of iconInstances) {
        // Generated Text-to-UI icon Components expose their native Vector as
        // a child. Centre the visible vector inside that component/instance
        // before considering the surrounding button row.
        const vectors = descendants(iconInstance, (item) => item.type === "VECTOR");
        for (const vector of vectors) {
          centerIconNodeInHotZone(vector, iconInstance);
          writePluginMeta(vector, "text-to-ui-icon-hot-zone-align", ICON_HOT_ZONE_ALIGNMENT);
        }
        writePluginMeta(iconInstance, "text-to-ui-icon-hot-zone-align", ICON_HOT_ZONE_ALIGNMENT);

        const parent = iconInstance.parent;
        if (!parent) continue;
        const namedHotZone = isNamedIconHotZone(parent);
        const hasTextSibling = hasDirectTextChild(parent) || hasTextInSiblingTree(parent, iconInstance);
        if (namedHotZone || (!hasTextSibling && (parent.children ?? []).length <= 2)) {
          // A named icon/leading slot is a square hot-zone. If the master is
          // exposed as a regular Frame, native Auto Layout can perform the
          // same centring; the explicit bounds correction covers NONE frames.
          enforceIconHotZone(parent);
          centerIconNodeInHotZone(iconInstance, parent);
        } else if (hasTextSibling) {
          // An icon + label button is a horizontal row. Preserve the HTML
          // order and x positions, but make the cross-axis alignment explicit
          // so an old component master cannot keep the icon at the top edge.
          if (parent.layoutMode === "HORIZONTAL") {
            try { parent.counterAxisAlignItems = ICON_HOT_ZONE_ALIGNMENT; } catch (_) {}
          } else if (parent.layoutMode === "NONE") {
            const parentHeight = nodeDimension(parent, "height");
            const iconHeight = nodeDimension(iconInstance, "height");
            if (parentHeight !== null && iconHeight !== null) {
              try { iconInstance.y = (parentHeight - iconHeight) / 2; } catch (_) {}
            }
          }
        }
      }
      // Component instances can expose the icon as a marked slot Frame rather
      // than as a nested icon Instance. Normalize both forms so a legacy
      // component master cannot leave a direct vector at the top edge.
      normalizeIconHotZoneTree(node);
    }

    function recolorInstanceIcon(node, colorRef, options = {}) {
      if (!colorRef) return 0;
      const candidates = descendants(node, (item) => item.type === "INSTANCE" && isIconInstance(item));
      const targetId = String(options.componentId ?? "");
      const targetAlias = normalize(options.alias);
      const matched = targetId || targetAlias
        ? candidates.filter((child) => {
          const ids = [child.id, child.mainComponent?.id].map((value) => String(value ?? ""));
          const names = [
            child.name,
            child.mainComponent?.name,
            readPluginMeta(child, "text-to-ui-icon-alias"),
          ].map(normalize).filter(Boolean);
          return (targetId && ids.includes(targetId)) || (targetAlias && names.some((name) => name === targetAlias || name.includes(targetAlias)));
        })
        : candidates;
      const targets = matched.length > 0 || (!targetId && !targetAlias)
        ? matched
        : candidates.length === 1
          ? candidates
          : [];
      for (const child of targets) {
        paintExistingChannels(child, colorRef);
        // A Pixso INSTANCE fill is an override layer over the component's
        // child geometry. For stroke-authored SVG icons that layer fills the
        // whole path silhouette and turns line icons into black/red blocks.
        // Keep the color on the child Vector's strokes instead. Fill-authored
        // window icons intentionally retain the instance fill override.
        const vectors = descendants(child, (item) => item.type === "VECTOR");
        const hasStrokeGeometry = vectors.some((vector) => Array.isArray(vector.strokes) && vector.strokes.length > 0);
        const hasFillGeometry = vectors.some((vector) => Array.isArray(vector.fills) && vector.fills.length > 0);
        // The instance paint is a component-level override, not the icon
        // geometry itself. Clear it for both stroke- and fill-authored icons
        // after transferring the semantic color to the actual Vector. This
        // prevents a 20x20 instance box from masking thin window controls.
        if (hasStrokeGeometry || hasFillGeometry) child.fills = [];
      }
      return targets.length;
    }
    function applyInstanceContentColor(node, contentColor) {
      if (!contentColor) return;
      const textRef = typeof contentColor === "string" ? contentColor : contentColor.text ?? contentColor.label ?? null;
      const iconRef = typeof contentColor === "string" ? contentColor : contentColor.icon ?? contentColor.leading ?? null;
      if (textRef) {
        for (const text of descendants(node, (item) => item.type === "TEXT")) {
          if (!("fills" in text)) continue;
          text.fills = [paintFor(textRef)];
        }
      }
      if (iconRef) recolorInstanceIcon(node, iconRef);
      writePluginMeta(node, "text-to-ui-content-color", JSON.stringify({ ...(textRef ? { text: textRef } : {}), ...(iconRef ? { icon: iconRef } : {}) }));
    }
    function recolorPageIconInstances(page) {
      if (!page) return;
      for (const node of descendants(page, (item) => item.type === "INSTANCE")) {
        let componentRef = null;
        try { componentRef = JSON.parse(readPluginMeta(node, "text-to-ui-component-ref") || "null"); } catch (_) {}
        if (componentRef?.allowIconColorOverride !== true) {
          centerIconInstanceHotZones(node);
          continue;
        }
        const colorRef = readPluginMeta(node, "text-to-ui-icon-color");
        if (colorRef) recolorInstanceIcon(node, colorRef);
        centerIconInstanceHotZones(node);
      }
    }
    async function instanceCopy(operation, node) {
      const primary = operation.props?.label || operation.props?.value || operation.props?.placeholder || operation.slots?.label || operation.slots?.value || "";
      const secondary = operation.props?.description || operation.slots?.description || "";
      const texts = descendants(node, (item) => item.type === "TEXT" && !isLegacyIconFontText(item));
      const used = new Set();
      const isTextSlot = (slot, value) => !["icon", "leading", "trigger"].includes(slot) && !(typeof value === "string" && /^[a-z-]+\/[a-z0-9-]+$/i.test(value));
      const hasTextSlot = Object.entries(operation.slots ?? {}).some(([slot, value]) => typeof value === "string" && value && isTextSlot(slot, value));
      const iconOnly = operation.props?.mode === "icon" || operation.componentRef?.logicalName?.startsWith("Icon Button/") || !hasTextSlot && operation.componentRef?.logicalName?.includes("Icon Button");
      const expectedIconAlias = [operation.slots?.icon, operation.slots?.leading, operation.props?.icon, operation.props?.iconName]
        .find((value) => typeof value === "string" && value.trim()) ?? null;
      const expectedIconComponent = expectedIconAlias ? iconComponentFor(expectedIconAlias) : null;
      const iconPropertyKey = expectedIconAlias
        ? instancePropertyKey(node, ["icon", "sidebar-icon", "leading", "Leading", "Icon", "trigger", "Trailing"])
        : null;
      if (expectedIconAlias && !expectedIconComponent) throw new Error(`Missing exact component icon: ${expectedIconAlias}`);
      const variantContentColor = operation.componentRef?.iconColorSource === "variant-content" && expectedIconAlias && iconPropertyKey
        ? variantContentPaintSource(node)
        : null;
      // A mapped component may own a fixed icon without exposing an instance
      // swap property. Keep the real component instance and its native icon;
      // one unavailable swap must not abort the whole page import.
      const findNamedText = (slot) => texts.find((item) => !used.has(item) && normalize(item.name).includes(normalize(slot)));
      const slotEntries = Object.entries(operation.slots ?? {});
      const orderedSlotEntries = operation.componentRef?.logicalName?.startsWith("Search/")
        ? [...slotEntries.filter(([slot]) => slot === "value"), ...slotEntries.filter(([slot]) => slot !== "value")]
        : slotEntries;
      for (const [slot, value] of orderedSlotEntries) {
        if (typeof value !== "string" || !value || !isTextSlot(slot, value)) continue;
        const target = findNamedText(slot) ?? texts.find((item) => !used.has(item));
        if (!target) continue;
        await setInstanceText(target, value);
        used.add(target);
      }
      if (used.size === 0 && hasTextSlot) {
        await setInstanceText(texts[0], primary);
        await setInstanceText(texts[1], secondary);
      }
      if (iconOnly) {
        // Some existing Pixso Icon Button masters still contain a legacy text
        // layer.  The HTML visual contract has no label slot in icon mode, so
        // never copy the business label into that layer and hide the residual
        // master text rather than allowing it to change the rendered layout.
        for (const text of texts) {
          try { text.visible = false; } catch (_) {}
        }
      }
      if (typeof node.setProperties === "function" && node.componentProperties) {
        const changes = collectInstancePropertyChanges(node, operation);
        if (Object.keys(changes).length) {
          try {
            node.setProperties(changes);
          } catch (error) {
            if (expectedIconAlias) throw new Error(`Cannot apply exact component icon ${expectedIconAlias}: ${error.message}`);
          }
        }
      }
      if (operation.componentRef?.iconColorSource === "variant-content" && expectedIconAlias && iconPropertyKey) {
        const recolored = variantContentColor
          ? recolorInstanceIcon(node, variantContentColor, {
            componentId: expectedIconComponent?.id,
            alias: expectedIconAlias,
          })
          : 0;
        writePluginMeta(node, "text-to-ui-icon-color-source", recolored > 0 ? "pixso-variant-content" : "unavailable");
      }
      if (operation.componentRef?.allowIconColorOverride === true) recolorInstanceIcon(node, operation.metadata?.iconColor);
      const contentColorOverride = operation.componentRef?.allowContentColorOverride === true
        ? operation.componentRef?.contentColor
        : null;
      if (contentColorOverride) applyInstanceContentColor(node, contentColorOverride);
      centerIconInstanceHotZones(node);
      writePluginMeta(node, "text-to-ui-props", JSON.stringify(operation.props ?? {}));
      writePluginMeta(node, "text-to-ui-slots", JSON.stringify(operation.slots ?? {}));
      if (expectedIconAlias) {
        writePluginMeta(node, "text-to-ui-expected-icon-alias", expectedIconAlias);
        if (iconPropertyKey) writePluginMeta(node, "text-to-ui-icon-property-key", iconPropertyKey);
        writePluginMeta(node, "text-to-ui-expected-icon-component-id", expectedIconComponent.id ?? "");
        // Some registered masters (for example Snackbar) own a fixed semantic
        // status icon but do not expose it as an instance-swap property. Keep
        // that genuine component instance and mark the measured native icon as
        // an explicit fallback; visual readback remains responsible for any
        // visible mismatch.
        writePluginMeta(node, "text-to-ui-icon-binding-mode", iconPropertyKey ? "component-property" : "native-component-fallback");
      }
    }
    function applyInstanceContentSizing(node, layout = {}) {
      const requestedAxes = [];
      if (layout.width === "hug") requestedAxes.push("width");
      if (layout.height === "hug") requestedAxes.push("height");
      if (requestedAxes.length === 0) return;
      const candidates = [node, ...descendants(node, (item) => item.type === "FRAME" || item.type === "INSTANCE")];
      for (const candidate of candidates) {
        const direction = candidate.layoutMode === "HORIZONTAL" ? "HORIZONTAL" : candidate.layoutMode === "VERTICAL" ? "VERTICAL" : null;
        if (!direction) continue;
        for (const axis of requestedAxes) {
          const isPrimary = (axis === "width" && direction === "HORIZONTAL") || (axis === "height" && direction === "VERTICAL");
          const property = isPrimary ? "primaryAxisSizingMode" : "counterAxisSizingMode";
          if (!(property in candidate)) continue;
          try { candidate[property] = "AUTO"; } catch (_) {}
        }
      }
      writePluginMeta(node, "text-to-ui-instance-sizing", requestedAxes.map((axis) => `${axis}:hug`).join(","));
    }
    function decodeUtf8(bytes) {
      if (typeof TextDecoder === "function") {
        try { return new TextDecoder("utf-8").decode(bytes); } catch (_) {}
      }
      let output = "";
      for (const byte of bytes ?? []) output += String.fromCharCode(byte);
      return output;
    }
    function isSvgImageResource(resource) {
      const mimeType = String(resource?.mimeType ?? "").trim().toLowerCase();
      return mimeType === "image/svg+xml" || mimeType === "image/svg" || mimeType.endsWith("+svg") || Boolean(resource?.svg);
    }
    function svgTextFromImageResource(resource) {
      if (String(resource?.svg ?? "").trim()) return String(resource.svg);
      if (typeof pixso.base64Decode !== "function") throw new Error("Current Pixso runtime does not expose base64Decode for SVG image resources");
      return decodeUtf8(pixso.base64Decode(resource.dataBase64));
    }
    function createRasterImageNode(resource, operation) {
      if (typeof pixso.createImage !== "function") throw new Error("Current Pixso runtime does not expose createImage");
      if (typeof pixso.base64Decode !== "function") throw new Error("Current Pixso runtime does not expose base64Decode");
      const bytes = pixso.base64Decode(resource.dataBase64);
      const image = pixso.createImage(bytes);
      if (!image?.hash) throw new Error("Pixso createImage returned no image hash");
      const node = pixso.createRectangle();
      node.fills = [{ type: "IMAGE", imageHash: image.hash, scaleMode: operation.imageRef?.fit ?? "FILL" }];
      writePluginMeta(node, "text-to-ui-image-renderer", "native-raster");
      return node;
    }
    function createSvgImageNode(resource) {
      if (typeof pixso.createNodeFromSvg !== "function") throw new Error("Current Pixso runtime does not expose createNodeFromSvg");
      const node = pixso.createNodeFromSvg(svgTextFromImageResource(resource));
      if (!node) throw new Error("Pixso createNodeFromSvg returned no node");
      writePluginMeta(node, "text-to-ui-image-renderer", "native-svg");
      return node;
    }
    function createDeferredImageNode(operation, resource, error) {
      if (typeof pixso.createRectangle !== "function") throw error;
      const node = pixso.createRectangle();
      // Keep the measured image box visible while the late asset repair is
      // pending. This is intentionally a neutral diagnostic paint, not a
      // claimed visual match; final screenshot parity still has to replace it
      // with the real asset.
      node.fills = [{ type: "SOLID", color: { r: 0.86, g: 0.87, b: 0.89 }, opacity: 0.45 }];
      const failure = {
        nodeId: operation.nodeId ?? null,
        ref: operation.imageRef?.ref ?? null,
        mimeType: resource?.mimeType ?? null,
        error: String(error?.message ?? error),
        recovery: "deferred-image-optimization",
      };
      state.imageFailures.push(failure);
      writePluginMeta(node, "text-to-ui-image-renderer", "deferred-placeholder");
      writePluginMeta(node, "text-to-ui-image-error", failure.error);
      writePluginMeta(node, "text-to-ui-image-recovery", failure.recovery);
      return node;
    }
    async function createImageNode(operation) {
      const resource = imageResourceFor(operation.imageRef);
      if (!resource?.dataBase64 && !resource?.svg) {
        return createDeferredImageNode(operation, resource, new Error(`Missing image resource: ${operation.imageRef?.ref}`));
      }
      try {
        return isSvgImageResource(resource)
          ? createSvgImageNode(resource)
          : createRasterImageNode(resource, operation);
      } catch (error) {
        // Image compatibility is a recoverable asset concern. The image module
        // runs after the page structure is assembled; if this asset still
        // cannot be materialized, keep its measured box and let the rest of the
        // page commit. The failure is retained for the final repair/reporting
        // pass instead of deleting the completed draft.
        return createDeferredImageNode(operation, resource, error);
      }
    }
    function appendNodeInSourceOrder(parent, node, operation) {
      // Image assets are intentionally materialized after the structural pass.
      // Preserve the browser's direct-child order when that late operation is
      // attached; otherwise an image can appear in front of an earlier text
      // sibling (for example the Coremail logo/text brand lockup).
      const childIndex = Number(operation?.metadata?.htmlChildIndex);
      if (Number.isInteger(childIndex) && childIndex >= 0 && typeof parent?.insertChild === "function") {
        const childCount = Array.isArray(parent.children) ? parent.children.length : childIndex;
        parent.insertChild(Math.min(childIndex, childCount), node);
        return;
      }
      parent.appendChild(node);
    }
    async function createNode(operation) {
      if (operation.op === "create-frame") return pixso.createFrame();
      if (operation.op === "create-component") {
        if (typeof pixso.createComponent !== "function") throw new Error("Current Pixso runtime does not expose createComponent");
        return await pixso.createComponent();
      }
      if (operation.op === "create-text") { await loadFont(); const node = pixso.createText(); node.characters = operation.characters ?? ""; return node; }
      if (operation.op === "create-icon-slot") {
        const node = pixso.createFrame();
        const size = Number(operation.iconSlot?.size ?? 20);
        node.resize(size, size);
        node.fills = [];
        node.clipsContent = false;
        writePluginMeta(node, "text-to-ui-icon-hot-zone", "true");
        enforceIconHotZone(node);
        return node;
      }
      if (operation.op === "create-icon") {
        const size = Number(operation.iconRef.size ?? 20);
        return nativeIconFromSvg(operation.iconRef.svg, size, operation.style?.fill?.ref, operation.iconRef?.alias);
      }
      if (operation.op === "create-instance") return resolveVariant(operation.componentRef).createInstance();
      if (operation.op === "create-image") {
        return createImageNode(operation);
      }
      if (operation.op === "create-rectangle") return pixso.createRectangle();
      if (operation.op === "create-ellipse") return pixso.createEllipse();
      if (operation.op === "create-line") return pixso.createLine();
      throw new Error(`Unsupported Pixso operation: ${operation.op}`);
    }
    function paintForColorSource(source) {
      if (!source) return null;
      if (typeof source === "string") return paintFor(source);
      if (source.kind === "variable" && source.ref) return paintFor(source.ref);
      if (source.type === "SOLID" && source.color) {
        return {
          type: "SOLID",
          color: { r: Number(source.color.r), g: Number(source.color.g), b: Number(source.color.b) },
          ...(source.opacity === undefined ? {} : { opacity: Number(source.opacity) }),
        };
      }
      return null;
    }
    function paintExistingChannels(node, colorRef) {
      // A semantic icon may intentionally inherit its component color. In
      // that case the operation has no color Token; leave the SVG's existing
      // channels untouched instead of attempting to resolve an empty Variable.
      if (!colorRef) return;
      const paint = paintForColorSource(colorRef);
      if (!paint) return;
      const targets = [node, ...descendants(node, () => true)];
      for (const target of targets) {
        if (Array.isArray(target.fills) && target.fills.some((paint) => paint?.type === "SOLID")) {
          target.fills = target.fills.map((item) => item?.type === "SOLID" ? { ...paint } : item);
        }
        if (Array.isArray(target.strokes) && target.strokes.some((paint) => paint?.type === "SOLID")) {
          target.strokes = target.strokes.map((item) => item?.type === "SOLID" ? { ...paint } : item);
        }
      }
    }
    function createIconPlaceholder(slot, operation) {
      slot.fills = [];
      enforceIconHotZone(slot);
      const placeholder = pixso.createRectangle();
      const size = Math.max(4, Math.round(Number(operation.iconSlot?.size ?? 20) / 3));
      placeholder.name = "Icon placeholder";
      placeholder.resize(size, size);
      placeholder.cornerRadius = Math.min(2, size / 4);
      // Icon slots are temporary geometry. Some library plans deliberately
      // omit a fill because the real semantic icon is hydrated in a later
      // phase. Never pass an empty ref to paintFor(): Pixso would interpret it
      // as a request to resolve a color Variable with an empty name and abort
      // the whole page generation.
      const colorRef = operation.style?.fill?.ref;
      placeholder.fills = colorRef ? [paintFor(colorRef)] : [];
      slot.appendChild(placeholder);
      placeholder.x = Math.max(0, (slot.width - size) / 2);
      placeholder.y = Math.max(0, (slot.height - size) / 2);
    }
    function hydrateIcon(operation) {
      const slot = state.nodes.get(operation.targetNodeId);
      if (!slot) throw new Error(`Missing icon Slot: ${operation.targetNodeId}`);
      const resource = iconResourceFor(operation.iconRef);
      if (!resource?.svg) throw new Error(`Missing semantic icon resource: ${operation.iconRef?.alias}`);
      const size = Number(operation.iconRef?.size ?? slot.width ?? 20);
      // Build the replacement before removing the placeholder. If the current
      // Pixso build cannot create a safe native vector, the approved layout is
      // left intact and the error is reported at the icon phase only.
      const icon = nativeIconFromSvg(resource.svg, size, operation.style?.fill?.ref, operation.iconRef?.alias);
      for (const child of [...(slot.children ?? [])]) child.remove?.();
      icon.name = `${operation.name ?? operation.iconRef.alias} asset`;
      slot.appendChild(icon);
      // Pixso may normalize a newly appended VECTOR back to the source SVG's
      // stroke-width. Apply the display contract after insertion, when the
      // node is already in its final parent, so 16/20/24 remain 1/1.25/1.5.
      normalizeIconVectorContract(icon, resource.svg, size, operation.iconRef?.strokeWeight);
      enforceIconHotZone(slot);
      // Centre the actual vector bounds, not the requested display size. A
      // Lucide path normally has intentional whitespace inside its 24x24
      // source artboard; using `size` here leaves that path at x/y=0 and makes
      // it look top-aligned in Pixso.
      centerIconNodeInHotZone(icon, slot);
      writePluginMeta(slot, "text-to-ui-icon-alias", operation.iconRef?.alias ?? "");
      writePluginMeta(slot, "text-to-ui-icon-status", "hydrated-native-vector");
      writePluginMeta(slot, "text-to-ui-icon-display-size", size);
      writePluginMeta(icon, "text-to-ui-icon-alias", operation.iconRef?.alias ?? "");
      return icon;
    }
    function deferIcon(operation, error) {
      const slot = state.nodes.get(operation.targetNodeId);
      if (!slot) throw error;
      enforceIconHotZone(slot);
      let placeholder = (slot.children ?? []).find((child) => child.name === "Icon placeholder") ?? null;
      if (!placeholder) {
        createIconPlaceholder(slot, {
          iconSlot: { size: operation.iconRef?.size ?? slot.width ?? 20 },
          style: {},
        });
        placeholder = (slot.children ?? []).find((child) => child.name === "Icon placeholder") ?? null;
      }
      if (placeholder) {
        placeholder.fills = [{ type: "SOLID", color: { r: 0.55, g: 0.58, b: 0.64 }, opacity: 0.35 }];
        placeholder.x = Math.max(0, (Number(slot.width) - Number(placeholder.width)) / 2);
        placeholder.y = Math.max(0, (Number(slot.height) - Number(placeholder.height)) / 2);
      }
      const failure = {
        nodeId: operation.targetNodeId ?? null,
        ref: operation.iconRef?.alias ?? null,
        error: String(error?.message ?? error),
        recovery: "deferred-icon-hydration",
      };
      state.iconFailures.push(failure);
      writePluginMeta(slot, "text-to-ui-icon-alias", operation.iconRef?.alias ?? "");
      writePluginMeta(slot, "text-to-ui-icon-status", "deferred-placeholder");
      writePluginMeta(slot, "text-to-ui-icon-error", failure.error);
      writePluginMeta(slot, "text-to-ui-icon-recovery", failure.recovery);
      return placeholder;
    }
    function hydrateIconOrDefer(operation) {
      try { return hydrateIcon(operation); }
      catch (error) { return deferIcon(operation, error); }
    }
    function uniqueRootName(page, requested) {
      const names = new Set((page.children ?? []).map((node) => normalize(node.name)));
      if (!names.has(normalize(requested))) return requested;
      let index = 2;
      while (names.has(normalize(`${requested} / ${index}`))) index += 1;
      return `${requested} / ${index}`;
    }
    function mcpNodeName(runId, sceneId, requested) {
      return `[text-to-ui:${runId}:${sceneId}] ${requested ?? sceneId}`;
    }
    function hydrateExistingNodes(page, runId) {
      if (!runId) return;
      const candidates = [page, ...descendants(page, () => true)];
      for (const node of candidates) {
        const prefix = `[text-to-ui:${runId}:`;
        const name = String(node.name ?? "");
        const storedRunId = readPluginMeta(node, "text-to-ui-run-id");
        const sceneId = readPluginMeta(node, "text-to-ui-scene-id") || (name.startsWith(prefix) ? name.slice(prefix.length).split("]", 1)[0] : "");
        // A scene id alone is not enough to reuse a node: legacy outputs
        // stamped scene ids without an isolated run id. Reattaching those
        // nodes is precisely how a new HTML import inherited old layout,
        // names, and component state. Only the current run namespace may be
        // hydrated; legacy nodes remain candidates for final replacement.
        if (storedRunId !== runId && !name.startsWith(prefix)) continue;
        if (sceneId) state.nodes.set(sceneId, node);
      }
    }

    function hydrateExistingLibraryComponents(page) {
      const candidates = [page, ...descendants(page, () => true)];
      for (const node of candidates) {
        const sceneId = readPluginMeta(node, "text-to-ui-scene-id");
        if (sceneId) state.nodes.set(sceneId, node);
        if (node.type === "COMPONENT") {
          const logicalName = readPluginMeta(node, "text-to-ui-component-logical-name") || node.name;
          if (logicalName) state.nodes.set(`component-${normalize(logicalName).replace(/[^a-z0-9]+/g, "-")}`, node);
        }
      }
    }

    function resolveExistingLibraryNode(operation, page) {
      const direct = state.nodes.get(operation.nodeId);
      if (direct) return direct;
      const parent = operation.parentId ? state.nodes.get(operation.parentId) : page;
      if (!parent) return null;
      const match = (parent.children ?? []).find((child) =>
        readPluginMeta(child, "text-to-ui-scene-id") === operation.nodeId ||
        normalize(child.name) === normalize(operation.name)
      ) ?? null;
      if (match) state.nodes.set(operation.nodeId, match);
      return match;
    }

    function repairExistingIconSlot(operation, slot, plan) {
      if (!slot) return false;
      const hydration = (plan.operations ?? []).find((candidate) =>
        candidate.op === "hydrate-icon" && candidate.targetNodeId === operation.nodeId
      );
      const iconRef = hydration?.iconRef ?? operation.iconSlot ?? {};
      const size = Number(iconRef.size ?? operation.iconSlot?.size ?? slot.width ?? 20);
      const resource = iconResourceFor(iconRef);
      applyLayout(slot, operation.layout ?? {}, slot.parent);
      writePluginMeta(slot, "text-to-ui-icon-hot-zone", "true");
      writePluginMeta(slot, "text-to-ui-icon-display-size", size);
      enforceIconHotZone(slot);
      for (const vector of descendants(slot, (item) => item.type === "VECTOR")) {
        if (resource?.svg) normalizeIconVectorContract(vector, resource.svg, size);
        centerIconNodeInHotZone(vector, slot);
      }
      for (const iconInstance of descendants(slot, (item) => item.type === "INSTANCE" && isIconInstance(item))) {
        centerIconNodeInHotZone(iconInstance, slot);
        for (const vector of descendants(iconInstance, (item) => item.type === "VECTOR")) {
          if (resource?.svg) normalizeIconVectorContract(vector, resource.svg, size);
          centerIconNodeInHotZone(vector, iconInstance);
        }
      }
      normalizeIconHotZoneTree(slot);
      return true;
    }

    async function repairExistingLibraryOutput(plan, page) {
      let repaired = 0;
      const materialOperations = (plan.operations ?? []).filter((operation) =>
        String(operation.op).startsWith("create-") && operation.op !== "create-page"
      );
      for (const operation of materialOperations) {
        const existing = resolveExistingLibraryNode(operation, page);
        if (operation.op === "create-component") {
          if (existing) {
            ensureComponentProperties(existing, operation.componentContract);
            setMetadata(existing, operation);
          }
          continue;
        }
        if (existing) {
          // Existing component-library nodes must be reconciled too. The
          // previous fast path skipped them entirely, so a library built by
          // an older renderer kept top-aligned icon geometry forever.
          if (operation.op === "create-icon-slot") repairExistingIconSlot(operation, existing, plan);
          if (operation.metadata?.defaultVisibility === "hidden") existing.visible = false;
          continue;
        }
        const parent = operation.parentId ? state.nodes.get(operation.parentId) : page;
        if (!parent) continue;
        const node = await createNode(operation);
        node.name = operation.name ?? operation.nodeId;
        appendNodeInSourceOrder(parent, node, operation);
        applyLayout(node, operation.layout ?? {}, parent);
        if (operation.op === "create-icon-slot") createIconPlaceholder(node, operation);
        else if (operation.op !== "create-instance") applyStyle(node, operation.style ?? {}, operation.op === "create-icon");
        setMetadata(node, operation);
        state.nodes.set(operation.nodeId, node);
        repaired += 1;
      }
      for (const operation of plan.operations ?? []) {
        if (operation.op !== "create-component") continue;
        const component = state.nodes.get(operation.nodeId);
        if (component) {
          ensureComponentProperties(component, operation.componentContract);
          bindComponentTextProperties(component, operation.nodeId, plan.operations);
        }
      }
      for (const operation of materialOperations) {
        const node = state.nodes.get(operation.nodeId);
        const parent = operation.parentId ? state.nodes.get(operation.parentId) : page;
        if (node && parent) applyLayout(node, operation.layout ?? {}, parent);
      }
      // Existing library output may already have a slot and still contain a
      // placeholder or a vector produced by an older renderer. Rehydrate the
      // semantic icon after the slot repair so a successful "already present"
      // fast path cannot leave stale geometry behind.
      for (const operation of plan.operations ?? []) {
        if (operation.op === "hydrate-icon" && state.nodes.has(operation.targetNodeId)) hydrateIcon(operation);
      }
      return repaired;
    }

    function readbackLibrary(plan) {
      const issues = [];
      let componentCount = 0;
      let slotCount = 0;
      for (const operation of plan.operations ?? []) {
        if (operation.op !== "create-component") continue;
        const node = state.nodes.get(operation.nodeId);
        const contract = operation.componentContract ?? {};
        if (!node) {
          issues.push(`missing-library-component:${contract.logicalName ?? operation.name}`);
          continue;
        }
        componentCount += 1;
        if (node.type !== "COMPONENT") issues.push(`missing-component-node:${contract.logicalName ?? operation.name}`);
        const actualLogicalName = readPluginMeta(node, "text-to-ui-component-logical-name") || node.name;
        if (normalize(actualLogicalName) !== normalize(contract.logicalName ?? operation.name)) {
          issues.push(`component-logical-name:${contract.logicalName ?? operation.name}:${actualLogicalName}`);
        }
        const descendantsOfComponent = descendants(node, () => true);
        for (const slot of contract.slots ?? []) {
          const marker = descendantsOfComponent.find((child) => child.name === `#${slot}`);
          if (!marker) issues.push(`missing-component-slot:${contract.logicalName ?? operation.name}:${slot}`);
          else slotCount += 1;
        }
        for (const property of Object.keys(contract.properties ?? {})) {
          if (!findComponentPropertyKey(node, property)) issues.push(`missing-component-property:${contract.logicalName ?? operation.name}:${property}`);
        }
        if (!readPluginMeta(node, "text-to-ui-component-source")) issues.push(`missing-component-source:${contract.logicalName ?? operation.name}`);
      }
      for (const operation of plan.operations ?? []) {
        if (operation.metadata?.defaultVisibility !== "hidden") continue;
        const node = state.nodes.get(operation.nodeId);
        if (!node) issues.push(`missing-default-hidden-node:${operation.nodeId}`);
        else if (node.visible !== false) issues.push(`default-visibility:${operation.nodeId}:visible/hidden`);
      }
      for (const operation of plan.operations ?? []) {
        if (operation.op !== "hydrate-icon") continue;
        const slot = state.nodes.get(operation.targetNodeId);
        const expectedAlias = operation.iconRef?.alias ?? "";
        const iconNodes = slot ? descendants(slot, () => true) : [];
        const matchingIconNode = iconNodes.find((item) => item.type === "VECTOR" && readPluginMeta(item, "text-to-ui-icon-alias") === expectedAlias)
          ?? iconNodes.find((item) => item.type === "VECTOR");
        if (!slot || !matchingIconNode) {
          issues.push(`missing-library-icon:${operation.targetNodeId}`);
          continue;
        }
        if (readPluginMeta(slot, "text-to-ui-icon-alias") !== expectedAlias) {
          issues.push(`library-icon-alias:${operation.targetNodeId}:${readPluginMeta(slot, "text-to-ui-icon-alias") || "missing"}/${expectedAlias || "missing"}`);
        }
        for (const [property, axis] of [["primaryAxisAlignItems", "primary"], ["counterAxisAlignItems", "counter"]]) {
          if (property in slot && slot[property] !== ICON_HOT_ZONE_ALIGNMENT) {
            issues.push(`library-icon-hot-zone-${axis}:${operation.targetNodeId}:${slot[property] || "unreadable"}/${ICON_HOT_ZONE_ALIGNMENT}`);
          }
        }
        const slotWidth = nodeDimension(slot, "width");
        const slotHeight = nodeDimension(slot, "height");
        const iconWidth = nodeDimension(matchingIconNode, "width");
        const iconHeight = nodeDimension(matchingIconNode, "height");
        if (slotWidth !== null && slotHeight !== null && iconWidth !== null && iconHeight !== null) {
          const expectedX = (slotWidth - iconWidth) / 2;
          const expectedY = (slotHeight - iconHeight) / 2;
          if (Math.abs(Number(matchingIconNode.x) - expectedX) > 0.5 || Math.abs(Number(matchingIconNode.y) - expectedY) > 0.5) {
            issues.push(`library-icon-center:${operation.targetNodeId}:${Number(matchingIconNode.x)}/${Number(matchingIconNode.y)}:${expectedX}/${expectedY}`);
          }
        }
        const resource = iconResourceFor(operation.iconRef);
        if (resource?.svg && nativeIconPaintMode(resource.svg) !== "fill") {
          const expectedStroke = numberValue(operation.iconRef?.strokeWeight)
            ?? iconEffectiveStrokeWeight(resource.svg, Number(operation.iconRef?.size ?? slot.width ?? 20));
          const actualStroke = Number(matchingIconNode.strokeWeight);
          if (!Number.isFinite(actualStroke) || Math.abs(actualStroke - expectedStroke) > 0.01) {
            issues.push(`library-icon-stroke:${operation.targetNodeId}:${Number.isFinite(actualStroke) ? actualStroke : "unreadable"}/${expectedStroke}`);
          }
          if (operation.iconRef?.strokeWeight?.ref && !hasNodeVariableRef(matchingIconNode, "strokeWeight", operation.iconRef.strokeWeight.ref)) {
            issues.push(`library-icon-stroke-variable:${operation.targetNodeId}:missing/${variableName(operation.iconRef.strokeWeight.ref)}`);
          }
        }
      }
      for (const operation of plan.operations ?? []) {
        if (!operation.nodeId || !operation.style) continue;
        const node = state.nodes.get(operation.nodeId);
        if (!node) continue;
        if (operation.style.fill?.ref && operation.op !== "create-icon-slot") {
          const fills = Array.isArray(node.fills) ? node.fills : [];
          if (!fills.some((paint, index) => hasPaintVariable(node, "fills", index, paint))) issues.push(`literal-fill:${operation.nodeId}`);
        }
        // Browser computed styles carry inherited text metadata on every DOM
        // element, but only native text-capable nodes expose textStyleId.
        // Frames used as icon slots must not fail readback for inherited text.
        if (operation.style.textStyle?.ref && "textStyleId" in node && !node.textStyleId) issues.push(`missing-text-style:${operation.nodeId}`);
        if (operation.style.radius?.ref && "cornerRadius" in node) {
          const expectedRadius = numberValue(operation.style.radius);
          const actualRadius = typeof node.cornerRadius === "number" ? node.cornerRadius : null;
          if (expectedRadius !== null && (actualRadius === null || Math.abs(actualRadius - expectedRadius) > 0.01)) issues.push(`radius-value:${operation.nodeId}:${actualRadius ?? "unreadable"}/${expectedRadius}`);
        }
      }
      return { componentCount, slotCount, issues };
    }

    function readbackCoremailStructure(plan) {
      // A module plan explicitly carries `structureSignature: null` so its
      // partial tree is not validated against the full-page structure before
      // later modules have been appended. Preserve that explicit disable
      // value; only fall back to the page signature when the execution field
      // is genuinely absent.
      const execution = plan.execution ?? {};
      const signature = Object.prototype.hasOwnProperty.call(execution, "structureSignature")
        ? execution.structureSignature
        : plan.page?.structureSignature;
      if (!signature) return [];
      if (signature !== "coremail-secondary-list-v2") return [`unsupported-structure-signature:${signature}`];
      const issue = [];
      const node = (id) => state.nodes.get(id);
      const sceneId = (item) => readPluginMeta(item, "text-to-ui-scene-id");
      const directIds = (parent) => (parent?.children ?? []).map(sceneId).filter(Boolean);
      const exactChildren = (id, expected) => {
        const actual = directIds(node(id));
        if (actual.join(",") !== expected.join(",")) issue.push(`structure-children:${id}:${actual.join(",")}/${expected.join(",")}`);
      };
      const operationById = new Map((plan.operations ?? []).filter((item) => item.nodeId).map((item) => [item.nodeId, item]));
      const checkPadding = (id, edges) => {
        const target = node(id);
        const operation = operationById.get(id);
        if (!target || !operation) { issue.push(`structure-missing:${id}`); return; }
        for (const [edge, property] of [["top", "paddingTop"], ["right", "paddingRight"], ["bottom", "paddingBottom"], ["left", "paddingLeft"]]) {
          if (!(edge in edges)) continue;
          const expected = numberValue(operation.layout?.padding?.[edge]);
          const actual = typeof target[property] === "number" ? target[property] : null;
          if (expected !== null && (actual === null || Math.abs(actual - expected) > 0.5)) issue.push(`structure-padding:${id}:${edge}:${actual ?? "unreadable"}/${expected}`);
        }
      };
      exactChildren("pane-secondary-list", ["secondary-list-shell"]);
      exactChildren("secondary-list-shell", ["secondary-list-heading", "mail-list-content"]);
      exactChildren("secondary-list-heading", ["inbox-title", "secondary-list-heading-actions"]);
      exactChildren("secondary-list-heading-actions", ["refresh-mail", "multi-select-mail", "filter-sort"]);
      checkPadding("secondary-list-shell", { top: true, right: true, bottom: true, left: true });
      checkPadding("secondary-list-heading", { left: true, right: true });
      checkPadding("mail-group-0-heading", { left: true, right: true });
      checkPadding("mail-0", { left: true, right: true, top: true, bottom: true });
      for (const legacyId of ["secondary-list-meta", "list-count", "select-all"]) {
        if (node(legacyId)) issue.push(`legacy-node:${legacyId}`);
      }
      for (const actionId of ["refresh-mail", "multi-select-mail", "filter-sort"]) {
        const props = readPluginMeta(node(actionId), "text-to-ui-props");
        if (node(actionId) && props) {
          try {
            if (JSON.parse(props).mode !== "icon") issue.push(`heading-action-mode:${actionId}`);
          } catch (_) {
            issue.push(`heading-action-props:${actionId}`);
          }
        }
      }
      return issue;
    }

    async function executeLibrary(plan, options = {}) {
      plan.execution = plan.execution ?? {};
      if (!plan.execution.runId) plan.execution.runId = planRunId(plan);
      const libraryName = plan.execution.libraryPage ?? plan.resources?.componentLibraryPage ?? "NewComponents";
      const page = ensureLibraryPage(libraryName);
      if (!page) return { ok: false, phase: "preflight", error: `Component library page not found: ${libraryName}` };
      await readResources(plan);
      await ensureMissingIconComponents(plan, findPage(plan.execution?.libraryPage ?? plan.resources?.componentLibraryPage ?? "NewComponents"));
      const missing = requiredResources(plan);
      if (hasMissing(missing)) return { ok: false, phase: "preflight", page: { id: page.id, name: page.name }, missing };
      state.nodes.clear();
      hydrateExistingLibraryComponents(page);
      // A replacement import must start from the source plan, not reconcile a
      // structurally incompatible older component.  Reconciliation is useful
      // for additive slot repairs, but it leaves obsolete visual children in
      // place when a generic placeholder is replaced by a real component.
      let repaired = 0;
      if (!options.replaceExisting) {
        try {
          repaired = await repairExistingLibraryOutput(plan, page);
        } catch (error) {
          return { ok: false, phase: "repair", page: { id: page.id, name: page.name }, error: error.message };
        }
      }
      const componentOperations = (plan.operations ?? []).filter((operation) => operation.op === "create-component");
      const materialOperations = (plan.operations ?? []).filter((operation) => String(operation.op).startsWith("create-") && operation.op !== "create-page");
      const allExisting = materialOperations.every((operation) => state.nodes.has(operation.nodeId));
      const existingCount = componentOperations.filter((operation) => state.nodes.has(operation.nodeId)).length;
      if (allExisting && !options.forceNewVersion) {
        // A revised review-grid plan should reposition existing roots instead
        // of reporting an already-generated page while leaving every component
        // stacked at the old coordinates.
        for (const operation of componentOperations) {
          const existing = state.nodes.get(operation.nodeId);
          if (existing) applyLayout(existing, operation.layout ?? {}, page);
        }
        const audit = readbackLibrary(plan);
        return { ok: audit.issues.length === 0, phase: repaired > 0 ? "repaired-existing" : "already-generated", page: { id: page.id, name: page.name }, created: repaired, audit };
      }
      if (existingCount > 0 && !allExisting && !options.forceNewVersion) {
        if (options.replaceExisting) {
          // The same logical component may have been created by an earlier
          // plan revision with incomplete slot children. Replace only those
          // matching roots in-place; never remove excluded/manual components.
          for (const operation of componentOperations) {
            const existing = state.nodes.get(operation.nodeId);
            if (existing) existing.remove?.();
            state.nodes.delete(operation.nodeId);
          }
        } else {
        return { ok: false, phase: "existing-output", page: { id: page.id, name: page.name }, error: `发现组件库已有部分输出（${existingCount}/${componentOperations.length} 个组件）。请先清理未完成组件，或选择新建版本。` };
        }
      }
      let created = 0;
      try {
        options.onProgress?.({ id: "library", label: "创建 HTML 组件" });
        for (const original of plan.operations ?? []) {
          if (!String(original.op).startsWith("create-") || original.op === "create-page") continue;
          if (original.op === "create-component" && state.nodes.has(original.nodeId)) continue;
          const parent = original.parentId ? state.nodes.get(original.parentId) : page;
          if (!parent) throw new Error(`Missing created component parent: ${original.parentId}`);
          const node = await createNode(original);
          node.name = original.name ?? original.nodeId;
          appendNodeInSourceOrder(parent, node, original);
          applyLayout(node, original.layout ?? {}, parent);
          if (original.op === "create-icon-slot") createIconPlaceholder(node, original);
          else if (original.op !== "create-instance") applyStyle(node, original.style ?? {}, original.op === "create-icon");
          setMetadata(node, original);
          state.nodes.set(original.nodeId, node);
          created += 1;
        }
        for (const original of plan.operations ?? []) {
          if (original.op !== "create-component") continue;
          const component = state.nodes.get(original.nodeId);
          ensureComponentProperties(component, original.componentContract);
          bindComponentTextProperties(component, original.nodeId, plan.operations);
        }
        // Re-apply layouts after every slot and preview child has been
        // appended. Pixso computes HUG dimensions from children; applying the
        // first pass before the text/icons exist collapses slot frames to 0×0
        // and makes the Component look blank on the canvas.
        for (const original of plan.operations ?? []) {
          if (!String(original.op).startsWith("create-") || original.op === "create-page") continue;
          const node = state.nodes.get(original.nodeId);
          const parent = original.parentId ? state.nodes.get(original.parentId) : page;
          if (node && parent) applyLayout(node, original.layout ?? {}, parent);
        }
        options.onProgress?.({ id: "icon-hydration", label: "图标填充" });
        for (const operation of plan.operations ?? []) {
          if (operation.op === "hydrate-icon") hydrateIcon(operation);
        }
      } catch (error) {
        return { ok: false, phase: "execution", page: { id: page.id, name: page.name }, created, error: error.message };
      }
      const audit = readbackLibrary(plan);
      return { ok: audit.issues.length === 0, phase: "readback", page: { id: page.id, name: page.name }, created, audit };
    }

    function readback(plan) {
      const rootId = plan.execution?.rootNodeId ?? (plan.operations ?? []).find((item) => item.nodeId)?.nodeId;
      const root = state.nodes.get(rootId);
      const all = root ? [root, ...descendants(root, () => true)] : [];
      const issues = [];
      const iconFailures = [...state.iconFailures];
      const imageFailures = [...state.imageFailures];
      for (const operation of plan.operations ?? []) {
        if (!operation.nodeId || !operation.style) continue;
        const node = state.nodes.get(operation.nodeId);
        if (!node) { issues.push(`missing-node:${operation.nodeId}`); continue; }
        if (operation.style.fill?.ref && operation.op !== "create-instance" && operation.op !== "create-icon-slot") {
          const fills = Array.isArray(node.fills) ? node.fills : [];
          if (!fills.some((paint, index) => hasPaintVariable(node, "fills", index, paint))) issues.push(`literal-fill:${operation.nodeId}`);
        }
        if (operation.style.fill?.kind === "linear-gradient" && operation.op !== "create-instance" && operation.op !== "create-icon-slot") {
          const fills = Array.isArray(node.fills) ? node.fills : [];
          const gradientFallback = readPluginMeta(node, "text-to-ui-gradient-fallback") === "solid-first-stop";
          if (!fills.some((paint) => paint?.type === "GRADIENT_LINEAR") && !gradientFallback) issues.push(`missing-gradient-fill:${operation.nodeId}`);
          const expectedRefs = JSON.stringify((operation.style.fill.stops ?? []).map((stop) => ({ position: stop.position, ref: stop.color?.ref ?? null })));
          const actualRefs = readPluginMeta(node, "text-to-ui-gradient-token-refs") ?? "";
          if (actualRefs !== expectedRefs) issues.push(`gradient-token-refs:${operation.nodeId}`);
        }
        if (operation.op === "create-icon" && operation.style.fill?.ref) {
          const iconNodes = [node, ...descendants(node, () => true)];
          const literalPaint = iconNodes.some((iconNode) =>
            [["fills", iconNode.fills], ["strokes", iconNode.strokes]].some(([channel, paints]) =>
              Array.isArray(paints) && paints.some((paint, index) => paint?.type === "SOLID" && !hasPaintVariable(iconNode, channel, index, paint))
            )
          );
          if (literalPaint) issues.push(`literal-icon-paint:${operation.nodeId}`);
        }
        // Computed DOM text metadata can be inherited by a Frame, but Pixso
        // only exposes textStyleId on nodes that can own a text style.
        if (operation.style.textStyle?.ref && "textStyleId" in node && !node.textStyleId) issues.push(`missing-text-style:${operation.nodeId}`);
        if (operation.style.radius?.ref && operation.op !== "create-instance" && "cornerRadius" in node) {
          const expectedRadius = numberValue(operation.style.radius);
          const actualRadius = typeof node.cornerRadius === "number" ? node.cornerRadius : null;
          if (expectedRadius === null || actualRadius === null || Math.abs(actualRadius - expectedRadius) > 0.01) {
            issues.push(`radius-value:${operation.nodeId}:${actualRadius ?? "unreadable"}/${expectedRadius ?? "unresolved"}`);
          }
        }
        if (operation.style.fill?.kind === "transparent" && !["create-instance", "create-image"].includes(operation.op) && Array.isArray(node.fills) && node.fills.length > 0) issues.push(`transparent-fill:${operation.nodeId}`);
        if (operation.op === "create-image") {
          const fills = Array.isArray(node.fills) ? node.fills : [];
          const imageRenderer = readPluginMeta(node, "text-to-ui-image-renderer");
          if (imageRenderer === "deferred-placeholder") {
            imageFailures.push({
              nodeId: operation.nodeId ?? null,
              ref: operation.imageRef?.ref ?? null,
              mimeType: imageResourceFor(operation.imageRef)?.mimeType ?? null,
              error: readPluginMeta(node, "text-to-ui-image-error") || "image materialization failed",
              recovery: readPluginMeta(node, "text-to-ui-image-recovery") || "deferred-image-optimization",
            });
          }
          if (!fills.some((paint) => paint?.type === "IMAGE" && paint.imageHash)
            && !["native-svg", "deferred-placeholder"].includes(imageRenderer)) {
            issues.push(`missing-image-fill:${operation.nodeId}`);
          }
          if (readPluginMeta(node, "text-to-ui-image-ref") !== operation.imageRef?.ref) issues.push(`missing-image-ref:${operation.nodeId}`);
        }
        // A transparent CSS border still contributes to the browser box, but
        // the compiler intentionally omits a stroke Token when there is no
        // visible/bindable color to apply. `applyStyle` clears those native
        // stroke weights, so readback must not report them as missing.
        if (operation.style.stroke?.ref && operation.style.strokeEdges) {
          const edgeProperties = { top: "strokeTopWeight", right: "strokeRightWeight", bottom: "strokeBottomWeight", left: "strokeLeftWeight" };
          for (const [edge, property] of Object.entries(edgeProperties)) {
            const expectedWeight = numberValue(operation.style.strokeWeights?.[edge]);
            const expected = operation.style.strokeEdges.includes(edge) ? (expectedWeight ?? 1) : 0;
            // Pixso persists stroke weights as single-precision numbers. A
            // strict equality check turns harmless representation noise such
            // as 0.44200000166893005 versus 0.442 into a failed import.
            if (typeof node[property] === "number" && expected !== null && Math.abs(node[property] - expected) > 0.001) {
              issues.push(`stroke-edge:${operation.nodeId}:${edge}:${node[property]}/${expected}`);
            }
          }
        }
        if (operation.op === "create-text" && operation.layout?.textAutoResize) {
          const expectedMode = operation.layout.textAutoResize;
          const actualMode = typeof node.textAutoResize === "string" ? node.textAutoResize : null;
          const compatibleTruncation = expectedMode === "TRUNCATE"
            && actualMode === "NONE"
            && readPluginMeta(node, "text-to-ui-truncate-renderer") === "ending-ellipsis-v1"
            && readPluginMeta(node, "text-to-ui-truncate-source") === String(operation.characters ?? "")
            && readPluginMeta(node, "text-to-ui-truncate-rendered") === String(node.characters ?? "")
            && String(node.characters ?? "").endsWith("…");
          if (actualMode !== expectedMode && !compatibleTruncation) issues.push(`text-resize:${operation.nodeId}:${actualMode ?? "unreadable"}/${expectedMode}`);
        }
        for (const [axis, property] of [["width", "width"], ["height", "height"]]) {
          // A browser single-line text node may be marked WIDTH_AND_HEIGHT so
          // Pixso can absorb native font-metric differences without wrapping.
          // Its intrinsic width and height are intentionally no longer the
          // CSS box dimensions; visual screenshot parity is the authority for
          // this opt-in text sizing mode.
          if (operation.op === "create-text" && operation.layout?.textAutoResize === "WIDTH_AND_HEIGHT") continue;
          if (operation.op === "create-text" && operation.layout?.textAutoResize === "HEIGHT" && axis === "height") continue;
          const expected = numberValue(operation.layout?.[axis]);
          const actual = typeof node[property] === "number" ? node[property] : null;
          if (expected !== null && (actual === null || Math.abs(actual - expected) > 0.5)) issues.push(`size-${axis}:${operation.nodeId}:${actual ?? "unreadable"}/${expected}`);
        }
        if (operation.layout?.positioning === "ABSOLUTE") {
          for (const axis of ["x", "y"]) {
            const expected = Number(operation.layout?.[axis]);
            const actual = Number(node[axis]);
            if (Number.isFinite(expected) && (!Number.isFinite(actual) || Math.abs(actual - expected) > 0.5)) issues.push(`position-${axis}:${operation.nodeId}:${Number.isFinite(actual) ? actual : "unreadable"}/${expected}`);
          }
        }
        const expectedPadding = operation.layout?.padding ?? {};
        for (const [edge, property] of [["top", "paddingTop"], ["right", "paddingRight"], ["bottom", "paddingBottom"], ["left", "paddingLeft"]]) {
          // CSS exposes padding on every computed DOM style, while Pixso
          // TEXT/RECTANGLE/VECTOR nodes do not expose Frame padding fields.
          // Only audit the property when the created native node supports it.
          if (!(property in node)) continue;
          const expected = numberValue(expectedPadding[edge]);
          const actual = typeof node[property] === "number" ? node[property] : null;
          if (expected !== null && (actual === null || Math.abs(actual - expected) > 0.5)) issues.push(`padding-${edge}:${operation.nodeId}:${actual ?? "unreadable"}/${expected}`);
        }
        const expectedGap = numberValue(operation.layout?.gap);
        if (expectedGap !== null && typeof node.itemSpacing === "number" && Math.abs(node.itemSpacing - expectedGap) > 0.5) issues.push(`gap:${operation.nodeId}:${node.itemSpacing}/${expectedGap}`);
        const expectedDirection = operation.layout?.direction;
        if (["HORIZONTAL", "VERTICAL"].includes(expectedDirection) && node.layoutMode && node.layoutMode !== expectedDirection) issues.push(`layout-direction:${operation.nodeId}:${node.layoutMode}/${expectedDirection}`);
        if (operation.op === "create-text" && operation.style?.textAlignHorizontal && node.textAlignHorizontal !== operation.style.textAlignHorizontal) {
          issues.push(`text-align:${operation.nodeId}:${node.textAlignHorizontal ?? "unreadable"}/${operation.style.textAlignHorizontal}`);
        }
        if (operation.parentId) {
          const actualParentId = readPluginMeta(node.parent, "text-to-ui-scene-id");
          if (actualParentId && actualParentId !== operation.parentId) issues.push(`parent:${operation.nodeId}:${actualParentId}/${operation.parentId}`);
        }
        if (operation.op === "create-instance") {
          const expectedText = Object.entries(operation.slots ?? {}).filter(([slot, value]) => !["icon", "leading", "trigger"].includes(slot) && typeof value === "string" && value && !/^[a-z-]+\/[a-z0-9-]+$/i.test(value)).map(([, value]) => value);
          const actualText = descendants(node, (item) => item.type === "TEXT").map((item) => item.characters);
          for (const value of expectedText) if (!actualText.includes(value)) issues.push(`missing-instance-slot:${operation.nodeId}:${value}`);
        }
        if (operation.op === "create-instance" && node.type !== "INSTANCE") issues.push(`missing-instance:${operation.nodeId}`);
        if (operation.op === "create-instance" && node.type === "INSTANCE") {
          const expectedName = operation.componentRef?.pixsoName ?? operation.componentRef?.logicalName;
          const actualName = node.mainComponent?.name ?? "";
          // Pixso exposes a component-set instance's `mainComponent.name` as
          // only the variant axes (for example `type=Ghost, size=Medium`),
          // while the component set name (`Icon Button`) is on the parent.
          // Validate the set first so a valid library instance is not reported
          // as a mismatch merely because Pixso splits the name across nodes.
          const actualSetName = node.mainComponent?.parent?.name ?? "";
          const matchesExpected = expectedName && (actualName === expectedName || actualName.startsWith(`${expectedName}/`) || actualName.includes(expectedName) || actualSetName === expectedName || actualSetName.startsWith(`${expectedName}/`) || actualSetName.includes(expectedName));
          if (expectedName && actualName && !matchesExpected) issues.push(`main-component:${operation.nodeId}:${actualName}/${expectedName}`);
          const contentColor = operation.componentRef?.allowContentColorOverride === true
            ? operation.componentRef?.contentColor
            : null;
          if (contentColor) {
            const textRef = typeof contentColor === "string" ? contentColor : contentColor.text ?? contentColor.label ?? null;
            const iconRef = typeof contentColor === "string" ? contentColor : contentColor.icon ?? contentColor.leading ?? null;
            const textNodes = descendants(node, (item) => item.type === "TEXT" && item.visible !== false);
            if (textRef && textNodes.length > 0 && textNodes.some((text) => {
              const fills = Array.isArray(text.fills) ? text.fills : [];
              return !fills.some((paint, index) => hasPaintVariableRef(text, "fills", index, paint, textRef));
            })) {
              issues.push(`component-text-color:${operation.nodeId}:${textRef}`);
            }
            if (iconRef) {
              const iconInstances = descendants(node, (item) => item.type === "INSTANCE" && isIconInstance(item));
              const iconPaints = iconInstances.flatMap((icon) => [
                [icon, "fills", icon.fills],
                [icon, "strokes", icon.strokes],
                ...descendants(icon, () => true).flatMap((child) => [[child, "fills", child.fills], [child, "strokes", child.strokes]]),
              ].flatMap(([paintNode, channel, paints]) => Array.isArray(paints) ? paints.map((paint, index) => ({ channel, paint, index, node: paintNode })) : []));
              if (!iconInstances.length || !iconPaints.some(({ channel, paint, index, node: paintNode }) => hasPaintVariableRef(paintNode, channel, index, paint, iconRef))) {
                issues.push(`component-icon-color:${operation.nodeId}:${iconRef}`);
              }
            }
          }

          const expectedIconAlias = [operation.slots?.icon, operation.slots?.leading, operation.props?.icon, operation.props?.iconName]
            .find((value) => typeof value === "string" && value.trim()) ?? null;
          if (expectedIconAlias) {
            const iconComponent = iconComponentFor(expectedIconAlias);
            const iconResource = iconResourceFor({ alias: expectedIconAlias });
            const masterVector = iconComponent ? descendants(iconComponent, (item) => item.type === "VECTOR")[0] : null;
            if (iconResource?.svg && masterVector && nativeIconPaintMode(iconResource.svg) !== "fill") {
              const masterSize = Number(readPluginMeta(iconComponent, "text-to-ui-icon-display-size") || iconComponent.width || 20);
              const expectedStroke = iconEffectiveStrokeWeight(iconResource.svg, masterSize);
              const actualStroke = Number(masterVector.strokeWeight);
              if (!Number.isFinite(actualStroke) || Math.abs(actualStroke - expectedStroke) > 0.01) {
                issues.push(`component-icon-stroke:${operation.nodeId}:${actualStroke || "unreadable"}/${expectedStroke}`);
              }
            }
            if (!iconComponent) issues.push(`component-icon-master:${operation.nodeId}:${expectedIconAlias}`);
            else {
              const masterWidth = nodeDimension(iconComponent, "width");
              const masterHeight = nodeDimension(iconComponent, "height");
              const vectorWidth = nodeDimension(masterVector, "width");
              const vectorHeight = nodeDimension(masterVector, "height");
              if (masterWidth !== null && masterHeight !== null && vectorWidth !== null && vectorHeight !== null) {
                const expectedX = (masterWidth - vectorWidth) / 2;
                const expectedY = (masterHeight - vectorHeight) / 2;
                if (Math.abs(Number(masterVector.x) - expectedX) > 0.5 || Math.abs(Number(masterVector.y) - expectedY) > 0.5) {
                  issues.push(`component-icon-center:${operation.nodeId}:${Number(masterVector.x)}/${Number(masterVector.y)}:${expectedX}/${expectedY}`);
                }
              }
            }
            for (const iconInstance of descendants(node, (item) => item.type === "INSTANCE" && isIconInstance(item))) {
              const parent = iconInstance.parent;
              const namedHotZone = parent && isIconHotZoneNode(parent);
              const hasTextSibling = parent && (hasDirectTextChild(parent) || hasTextInSiblingTree(parent, iconInstance));
              if (namedHotZone) {
                for (const [axis, expected] of [["x", (nodeDimension(parent, "width") ?? 0) / 2 - (nodeDimension(iconInstance, "width") ?? 0) / 2], ["y", (nodeDimension(parent, "height") ?? 0) / 2 - (nodeDimension(iconInstance, "height") ?? 0) / 2]]) {
                  const actual = Number(iconInstance[axis]);
                  if (!Number.isFinite(actual) || Math.abs(actual - expected) > 0.5) {
                    issues.push(`component-icon-hot-zone-${axis}:${operation.nodeId}:${Number.isFinite(actual) ? actual : "unreadable"}/${expected}`);
                  }
                }
                for (const [property, axis] of [["primaryAxisAlignItems", "primary"], ["counterAxisAlignItems", "counter"]]) {
                  if (property in parent && parent[property] !== ICON_HOT_ZONE_ALIGNMENT) {
                    issues.push(`component-icon-hot-zone-${axis}:${operation.nodeId}:${parent[property] || "unreadable"}/${ICON_HOT_ZONE_ALIGNMENT}`);
                  }
                }
              } else if (parent?.layoutMode === "HORIZONTAL" && hasTextSibling && parent.counterAxisAlignItems !== ICON_HOT_ZONE_ALIGNMENT) {
                issues.push(`component-icon-cross-axis:${operation.nodeId}:${parent.counterAxisAlignItems || "unreadable"}/${ICON_HOT_ZONE_ALIGNMENT}`);
              } else if (parent?.layoutMode === "NONE" && hasTextSibling) {
                const parentHeight = nodeDimension(parent, "height");
                const iconHeight = nodeDimension(iconInstance, "height");
                const actualY = Number(iconInstance.y);
                const expectedY = parentHeight !== null && iconHeight !== null ? (parentHeight - iconHeight) / 2 : null;
                if (expectedY !== null && (!Number.isFinite(actualY) || Math.abs(actualY - expectedY) > 0.5)) {
                  issues.push(`component-icon-cross-axis-y:${operation.nodeId}:${Number.isFinite(actualY) ? actualY : "unreadable"}/${expectedY}`);
                }
              }
              for (const vector of descendants(iconInstance, (item) => item.type === "VECTOR")) {
                const iconWidth = nodeDimension(iconInstance, "width");
                const iconHeight = nodeDimension(iconInstance, "height");
                const vectorWidth = nodeDimension(vector, "width");
                const vectorHeight = nodeDimension(vector, "height");
                if (iconWidth !== null && iconHeight !== null && vectorWidth !== null && vectorHeight !== null) {
                  const expectedX = (iconWidth - vectorWidth) / 2;
                  const expectedY = (iconHeight - vectorHeight) / 2;
                  if (Math.abs(Number(vector.x) - expectedX) > 0.5 || Math.abs(Number(vector.y) - expectedY) > 0.5) {
                    issues.push(`component-vector-center:${operation.nodeId}:${Number(vector.x)}/${Number(vector.y)}:${expectedX}/${expectedY}`);
                  }
                }
              }
            }
          }
        }
      }
      for (const operation of plan.operations ?? []) {
        if (operation.op === "create-instance") {
          const expectedAlias = [operation.slots?.icon, operation.slots?.leading, operation.props?.icon, operation.props?.iconName]
            .find((value) => typeof value === "string" && value.trim()) ?? null;
          if (expectedAlias) {
            const instance = state.nodes.get(operation.nodeId);
            const recordedAlias = readPluginMeta(instance, "text-to-ui-expected-icon-alias");
            const propertyKey = readPluginMeta(instance, "text-to-ui-icon-property-key");
            const expectedComponentId = readPluginMeta(instance, "text-to-ui-expected-icon-component-id");
            const bindingMode = readPluginMeta(instance, "text-to-ui-icon-binding-mode");
            const nativeComponentFallback = bindingMode === "native-component-fallback";
            if (recordedAlias !== expectedAlias || (!nativeComponentFallback && (!propertyKey || !expectedComponentId))) {
              issues.push(`component-icon-binding:${operation.nodeId}:${recordedAlias || "missing"}/${expectedAlias}`);
            } else if (!nativeComponentFallback) {
              const property = instance?.componentProperties?.[propertyKey];
              const actualComponentId = property && typeof property === "object" ? property.value : property;
              if (actualComponentId && String(actualComponentId) !== String(expectedComponentId)) {
                issues.push(`component-icon-value:${operation.nodeId}:${actualComponentId}/${expectedComponentId}`);
              }
              if (operation.componentRef?.iconColorSource === "variant-content" && readPluginMeta(instance, "text-to-ui-icon-color-source") !== "pixso-variant-content") {
                issues.push(`component-icon-color-source:${operation.nodeId}:unavailable/variant-content`);
              }
            }
          }
        }
        if (operation.op !== "hydrate-icon") continue;
        const slot = state.nodes.get(operation.targetNodeId);
        if (slot && readPluginMeta(slot, "text-to-ui-icon-status") === "deferred-placeholder") {
          iconFailures.push({
            nodeId: operation.targetNodeId ?? null,
            ref: operation.iconRef?.alias ?? null,
            error: readPluginMeta(slot, "text-to-ui-icon-error") || "icon hydration failed",
            recovery: readPluginMeta(slot, "text-to-ui-icon-recovery") || "deferred-icon-hydration",
          });
          continue;
        }
        const iconNodes = slot ? descendants(slot, () => true) : [];
        if (!slot || iconNodes.length === 0 || iconNodes.some((node) => node.name === "Icon placeholder")) {
          issues.push(`missing-hydrated-icon:${operation.targetNodeId}`);
          continue;
        }
        const expectedAlias = operation.iconRef?.alias ?? "";
        const slotAlias = readPluginMeta(slot, "text-to-ui-icon-alias");
        const matchingIconNode = iconNodes.find((node) => readPluginMeta(node, "text-to-ui-icon-alias") === expectedAlias) ?? null;
        if (!expectedAlias || slotAlias !== expectedAlias || !matchingIconNode) {
          issues.push(`hydrated-icon-alias:${operation.targetNodeId}:${slotAlias || "missing"}/${expectedAlias || "missing"}`);
        }
        if (matchingIconNode) {
          const expectedX = (Number(slot.width) - Number(matchingIconNode.width)) / 2;
          const expectedY = (Number(slot.height) - Number(matchingIconNode.height)) / 2;
          if (Number.isFinite(expectedX) && Number.isFinite(expectedY)) {
            if (!Number.isFinite(Number(matchingIconNode.x)) || Math.abs(Number(matchingIconNode.x) - expectedX) > 0.5) {
              issues.push(`icon-center-x:${operation.targetNodeId}:${Number.isFinite(Number(matchingIconNode.x)) ? matchingIconNode.x : "unreadable"}/${expectedX}`);
            }
            if (!Number.isFinite(Number(matchingIconNode.y)) || Math.abs(Number(matchingIconNode.y) - expectedY) > 0.5) {
              issues.push(`icon-center-y:${operation.targetNodeId}:${Number.isFinite(Number(matchingIconNode.y)) ? matchingIconNode.y : "unreadable"}/${expectedY}`);
            }
          }
          for (const [property, axis] of [["primaryAxisAlignItems", "primary"], ["counterAxisAlignItems", "counter"]]) {
            if (property in slot && slot[property] !== ICON_HOT_ZONE_ALIGNMENT) {
              issues.push(`icon-hot-zone-${axis}:${operation.targetNodeId}:${slot[property] || "unreadable"}/${ICON_HOT_ZONE_ALIGNMENT}`);
            }
          }
          const resource = iconResourceFor(operation.iconRef);
          if (resource?.svg && nativeIconPaintMode(resource.svg) !== "fill") {
            const expectedStroke = numberValue(operation.iconRef?.strokeWeight)
              ?? iconEffectiveStrokeWeight(resource.svg, Number(operation.iconRef?.size ?? slot.width ?? 20));
            const actualStroke = Number(matchingIconNode.strokeWeight);
            if (!Number.isFinite(actualStroke) || Math.abs(actualStroke - expectedStroke) > 0.01) {
              issues.push(`icon-stroke-weight:${operation.targetNodeId}:${Number.isFinite(actualStroke) ? actualStroke : "unreadable"}/${expectedStroke}`);
            }
            if (operation.iconRef?.strokeWeight?.ref && !hasNodeVariableRef(matchingIconNode, "strokeWeight", operation.iconRef.strokeWeight.ref)) {
              issues.push(`icon-stroke-variable:${operation.targetNodeId}:missing/${variableName(operation.iconRef.strokeWeight.ref)}`);
            }
          }
        }
        const literalPaint = iconNodes.some((iconNode) =>
          [["fills", iconNode.fills], ["strokes", iconNode.strokes]].some(([channel, paints]) =>
            Array.isArray(paints) && paints.some((paint, index) => paint?.type === "SOLID" && !hasPaintVariable(iconNode, channel, index, paint))
          )
        );
        if (literalPaint) issues.push(`literal-icon-paint:${operation.targetNodeId}`);
      }
      issues.push(...readbackCoremailStructure(plan));
      const hydratedIconCount = (plan.operations ?? []).filter((operation) => {
        if (operation.op !== "hydrate-icon") return false;
        const slot = state.nodes.get(operation.targetNodeId);
        const alias = operation.iconRef?.alias ?? "";
        return Boolean(slot && alias && readPluginMeta(slot, "text-to-ui-icon-alias") === alias
          && descendants(slot, () => true).some((node) => readPluginMeta(node, "text-to-ui-icon-alias") === alias));
      }).length;
      const uniqueIconFailures = [...new Map(iconFailures.map((failure) => [`${failure.nodeId}:${failure.ref}`, failure])).values()];
      const uniqueImageFailures = [...new Map(imageFailures.map((failure) => [`${failure.nodeId}:${failure.ref}`, failure])).values()];
      return { root: root ? { id: root.id, name: root.name, width: root.width, height: root.height } : null, nodeCount: all.length, instanceCount: all.filter((node) => node.type === "INSTANCE").length, iconSlotCount: (plan.operations ?? []).filter((operation) => operation.op === "create-icon-slot").length, hydratedIconCount, iconFailures: uniqueIconFailures, imageFailures: uniqueImageFailures, issues };
    }
    function operationIndexesForModule(module, operations) {
      if (Array.isArray(module?.operationIndexes)) return module.operationIndexes;
      const wanted = new Set(module?.operationIds ?? []);
      return operations.flatMap((operation, index) => wanted.has(operation.nodeId) ? [index] : []);
    }

    function stripMcpNodeNames(root) {
      if (!root) return;
      const nodes = [root, ...descendants(root, () => true)];
      for (const node of nodes) {
        node.name = String(node.name ?? "").replace(/^(?:\[text-to-ui:[^\]]+\]\s*)+/, "");
      }
    }

    async function executionCheckpoint(options, completedOperations, force = false) {
      const interval = Math.max(1, Number(options.checkpointInterval ?? 20));
      if (!force && completedOperations % interval !== 0) return;
      // Yield to Pixso's UI event loop so the renderer can receive a pause
      // request while a large page is being assembled.
      await new Promise((resolve) => {
        if (typeof setTimeout === "function") setTimeout(resolve, 0);
        else Promise.resolve().then(resolve);
      });
      if (options.shouldCancel?.()) {
        const error = new Error("用户已暂停导入");
        error.code = "TEXT_TO_UI_PAUSED";
        throw error;
      }
    }

    function reportOperationProgress(options, operation, completedOperations, operationCount, phase = "operation") {
      if (typeof options.onProgress !== "function") return;
      const moduleId = options.moduleId ?? "layout";
      options.onProgress({
        id: moduleId,
        label: options.moduleLabel ?? (moduleId === "layout" ? "布局与内容" : moduleId),
        phase,
        operationName: operation?.name ?? null,
        reportedAt: new Date().toISOString(),
        operationId: operation?.nodeId ?? null,
        operation: operation?.op ?? null,
        completedOperations,
        operationCount,
      });
    }

    function markDraft(root, status, options = {}) {
      if (!root) return;
      root.visible = status === "committed" || options.draftVisible !== false;
      writePluginMeta(root, "text-to-ui-draft-status", status);
    }

    function discardOrMarkDraft(root, status, options = {}) {
      if (!root) return { status: "not-created" };
      const draftId = root.id;
      if (options.retainFailedDraft === false) {
        try {
          if (typeof root.remove !== "function") throw new Error("Draft removal is unavailable");
          root.remove();
          return { status: "removed", draftId };
        } catch (error) { return { status: "failed", draftId, error: error.message }; }
      }
      markDraft(root, status, options);
      return { status: "retained", draftId };
    }

    async function executeModules(plan, options = {}) {
      const sourceOperations = plan.operations ?? [];
      const modules = (Array.isArray(plan.modules) ? plan.modules : []).map((module) => ({
        ...module,
        operationIndexes: operationIndexesForModule(module, sourceOperations),
      })).filter((module) => module.operationIndexes.length > 0);
      if (modules.length === 0) return execute(plan, { ...options, skipModules: true });

      const targetName = options.targetPageName ?? plan.execution?.targetPage ?? plan.page?.targetPage ?? null;
      const page = targetName ? findPage(targetName) : pixso.currentPage;
      if (!page) return { ok: false, phase: "preflight", error: `Target Pixso page not found: ${targetName}` };

      // Preflight the complete resource set once. Every module then uses the
      // same resolved variables/styles/library references, while binary icon
      // and image payloads may be scoped by the MCP caller.
      const library = await readResources(plan);
      await ensureMissingIconComponents(plan, library);
      recolorPageIconInstances(page);
      const missing = requiredResources(plan);
      if (hasMissing(missing)) return { ok: false, phase: "preflight", page: { id: page.id, name: page.name }, missing };

      const rootId = plan.execution?.rootNodeId ?? sourceOperations.find((operation) => operation.nodeId)?.nodeId;
      const rootOperation = sourceOperations.find((operation) => operation.nodeId === rootId);
      const moduleResults = [];
      let latest = null;
      for (const [moduleIndex, module] of modules.entries()) {
        if (options.shouldCancel?.()) {
          const cleanup = discardOrMarkDraft(state.nodes.get(rootId), "paused", options);
          return { ok: false, phase: "paused", error: "用户已暂停导入", cleanup, modules: moduleResults };
        }
        const moduleStartedAt = Date.now();
        const operations = module.operationIndexes.map((index) => sourceOperations[index]).filter(Boolean);
        const isFinalModule = moduleIndex === modules.length - 1;
        const modulePlan = {
          ...plan,
          modules: undefined,
          operations,
          execution: {
            ...plan.execution,
            mcpBatching: true,
            moduleId: module.id,
            moduleIndex,
            moduleLabel: module.label,
            rootNodeId: rootId,
            rootName: rootOperation?.name ?? plan.execution?.rootName,
            // A partial module must not be checked against the complete page
            // structure. The final module runs the full readback after all
            // previous modules have been rehydrated into the same root.
            structureSignature: isFinalModule ? plan.execution?.structureSignature : null,
          },
        };
        latest = await execute(modulePlan, {
          ...options,
          moduleId: module.id,
          moduleLabel: module.label,
          skipModules: true,
          skipReadResources: true,
          // A plugin execution keeps every module in one runtime/transaction.
          // Preserve the live node index between those modules; rehydrating
          // through Pixso is only needed when a separate MCP batch starts a
          // fresh runtime. Some Pixso builds do not expose newly-created
          // nested icon slots to findAll() until the transaction yields,
          // which otherwise makes a valid slot look missing in the final
          // icon-hydration module.
          preserveNodeState: moduleIndex > 0,
          createTargetPage: false,
          replaceExisting: Boolean(options.replaceExisting),
          commitReplacement: isFinalModule && Boolean(options.replaceExisting),
          readbackPlan: isFinalModule ? plan : undefined,
        });
        moduleResults.push({ id: module.id, label: module.label, operationCount: operations.length, elapsedMs: Date.now() - moduleStartedAt, result: latest });
        if (!latest.ok) {
          return {
            ...latest,
            phase: latest.phase === "paused" ? "paused" : "module-execution",
            moduleId: module.id,
            moduleLabel: module.label,
            modules: moduleResults,
          };
        }
      }

      // A modular import executes a bounded operation subset in each call.
      // The final icon-hydration module intentionally contains only
      // `hydrate-icon` operations, but its readback still needs the complete
      // plan to validate the assembled tree, padding, and semantic structure.
      // Without this, structure checks look for layout operations that are not
      // present in the final module and report false `structure-missing`
      // failures even though the nodes were created by earlier modules.
      const audit = readback(options.readbackPlan ?? plan);
      return {
        ...latest,
        ok: audit.issues.length === 0,
        phase: "modular-readback",
        page: { id: page.id, name: page.name },
        audit,
        modules: moduleResults,
      };
    }

    async function execute(plan, options = {}) {
      const permanentPlanError = permanentExecutorPlanError(plan);
      if (permanentPlanError) return { ok: false, phase: "permanent-executor-guard", error: permanentPlanError };
      if (plan.kind === "pixso-component-library-plan" || plan.execution?.mode === "component-library") {
        return executeLibrary(plan, options);
      }
      const stalePlanError = strictHtmlImportError(plan);
      if (stalePlanError) return { ok: false, phase: "stale-plan-guard", error: stalePlanError };
      plan.execution = plan.execution ?? {};
      if (!plan.execution.runId) plan.execution.runId = planRunId(plan);
      if (options.forceNewVersion && !plan.execution.mcpBatching) plan.execution.runId = `${plan.execution.runId}-${Date.now().toString(36)}`;
      if (!options.skipModules && Array.isArray(plan.modules) && plan.modules.length > 0) {
        return executeModules(plan, options);
      }
      const targetName = options.targetPageName ?? plan.execution?.targetPage ?? plan.page?.targetPage ?? null;
      const page = targetName
        ? (options.createTargetPage === false ? findPage(targetName) : ensureTargetPage(plan, targetName))
        : pixso.currentPage;
      if (!page) return { ok: false, phase: "preflight", error: `Target Pixso page not found: ${targetName}` };
      if (!options.skipReadResources) {
        const library = await readResources(plan);
        // MCP batching executes one module per eval_script call (the module
        // list itself is intentionally omitted from each bounded script).
        // Keep icon-master repair on this path as well as executeModules so a
        // scoped icon batch can repair existing component geometry in place.
        await ensureMissingIconComponents(plan, library);
        recolorPageIconInstances(page);
      }
      const missing = requiredResources(plan);
      if (hasMissing(missing)) return { ok: false, phase: "preflight", page: { id: page.id, name: page.name }, missing };
      const canonicalKey = canonicalPlanKey(plan);
      const requestedRootId = plan.execution?.rootNodeId ?? (plan.operations ?? []).find((entry) => entry.nodeId)?.nodeId;
      // The final icon-hydration batch intentionally contains no duplicate
      // root create operation. Keep the root name in execution metadata so
      // the transactional replacement still recognizes and removes the
      // previous canonical artboard instead of leaving historical duplicates.
      const requestedRootName = (plan.operations ?? []).find((item) => item.nodeId === requestedRootId)?.name ?? plan.execution?.rootName;
      const normalizedRootName = normalize(requestedRootName);
      const logicalRootName = (value) => normalize(String(value ?? "").replace(/^(?:\[text-to-ui:[^\]]+\]\s*)+/, ""));
      const isLegacyCanonicalRoot = (node) => {
        const rawName = normalize(node?.name);
        const name = logicalRootName(node?.name);
        if (!normalizedRootName) return false;
        if (name === normalizedRootName) return true;
        const suffix = `${normalizedRootName} / `;
        if (name.startsWith(suffix) && /^\d+$/.test(name.slice(suffix.length))) return true;
        // Some older Pixso imports kept the renderer marker in the middle of
        // the layer name or normalized the slash suffix differently. The
        // canonical page label is still an unambiguous match here because
        // this filter only runs for the requested canonical root.
        return rawName.includes(normalizedRootName);
      };
      const previousRoots = options.replaceExisting
        ? (page.children ?? []).filter((node) =>
            readPluginMeta(node, "text-to-ui-canonical-key") === canonicalKey ||
            (readPluginMeta(node, "text-to-ui-canonical-frame") === "true" && isLegacyCanonicalRoot(node)) ||
            // Older renderer runtimes did not stamp plugin data. Treat the
            // canonical root name and its deterministic " / N" replacement
            // names as the same output identity so an upgrade does not leave
            // duplicate artboards behind.
            isLegacyCanonicalRoot(node))
        : [];
      if (!options.preserveNodeState) {
        state.nodes.clear();
        // MCP batching starts a fresh runtime for every call. Rehydrate the
        // current run before appending the next batch, even when replaceExisting
        // is enabled for transactional replacement of the previous artboard.
        if (!options.replaceExisting || plan.execution?.mcpBatching) hydrateExistingNodes(page, planRunId(plan));
      }
      const rootId = plan.execution?.rootNodeId ?? (plan.operations ?? []).find((item) => item.nodeId)?.nodeId;
      const expectedNodeCount = (plan.operations ?? []).filter((operation) => String(operation.op).startsWith("create-") && operation.op !== "create-page").length;
      if (!plan.execution?.mcpBatching && state.nodes.size > 0) {
        const audit = readback(plan);
        if (state.nodes.size === expectedNodeCount) return { ok: audit.issues.length === 0, phase: "already-generated", page: { id: page.id, name: page.name }, created: 0, audit };
        return { ok: false, phase: "existing-output", page: { id: page.id, name: page.name }, error: `发现同一计划的未完成输出（${state.nodes.size}/${expectedNodeCount} 个节点）。请修复或选择“新建版本”。` };
      }
      let created = 0;
      let processed = 0;
      const executableCreateCount = (plan.operations ?? []).filter((operation) => String(operation.op).startsWith("create-") && operation.op !== "create-page").length;
      const executableHydrateCount = (plan.operations ?? []).filter((operation) => operation.op === "hydrate-icon").length;
      const operationCount = executableCreateCount * 2 + executableHydrateCount;
      try {
        const moduleId = plan.execution?.moduleId ?? null;
        const moduleLabel = plan.execution?.moduleLabel ?? null;
        options.onProgress?.(moduleId
          ? { id: moduleId, label: moduleLabel ?? moduleId }
          : { id: "layout", label: "布局与内容" });
        await executionCheckpoint(options, 0, true);
        for (const original of plan.operations ?? []) {
          if (!String(original.op).startsWith("create-") || original.op === "create-page") continue;
          reportOperationProgress(options, original, processed, operationCount, "operation-start");
          if (state.nodes.has(original.nodeId)) {
            // A plan revision can change the rendered mode of an existing
            // linked instance without changing its stable Scene id. Re-run
            // the slot/content reconciliation so a legacy Icon Button master
            // cannot keep a stale visible text layer after HTML resolves the
            // control to icon-only.
            const existing = state.nodes.get(original.nodeId);
            const parent = original.parentId ? state.nodes.get(original.parentId) : page;
            if (parent) applyLayout(existing, original.layout ?? {}, parent);
            if (original.op === "create-instance") await instanceCopy(original, existing);
            else if (original.op !== "create-icon-slot") applyStyle(existing, original.style ?? {}, original.op === "create-icon");
            setMetadata(existing, original);
            processed += 1;
            await executionCheckpoint(options, processed);
            reportOperationProgress(options, original, processed, operationCount);
            continue;
          }
          const parent = original.parentId ? state.nodes.get(original.parentId) : page;
          if (!parent) throw new Error(`Missing created parent: ${original.parentId}`);
          const labelledName = plan.execution?.mcpBatching && plan.execution?.runId
            ? mcpNodeName(plan.execution.runId, original.nodeId, original.name)
            : original.name;
          const operation = original.nodeId === rootId ? { ...original, name: uniqueRootName(page, labelledName) } : { ...original, name: labelledName };
          const node = await createNode(operation);
          node.name = operation.name ?? operation.nodeId;
          appendNodeInSourceOrder(parent, node, operation);
          applyLayout(node, operation.layout ?? {}, parent);
          if (operation.op === "create-icon-slot") createIconPlaceholder(node, operation);
          else if (operation.op !== "create-instance") applyStyle(node, operation.style ?? {}, operation.op === "create-icon");
          else {
            await instanceCopy(operation, node);
            applyInstanceContentSizing(node, operation.layout ?? {});
          }
          setMetadata(node, operation);
          state.nodes.set(operation.nodeId, node);
          created += 1;
          processed += 1;
          if (operation.nodeId === rootId) markDraft(node, "in-progress", options);
          await executionCheckpoint(options, processed);
          reportOperationProgress(options, operation, processed, operationCount);
        }
        // Pixso resolves some fill/stretched sizes only after every sibling is
        // attached. A deterministic second pass lets text measure against its
        // final parent width and keeps vertical Scene frames vertical.
        for (const operation of plan.operations ?? []) {
          if (!String(operation.op).startsWith("create-") || operation.op === "create-page") continue;
          reportOperationProgress(options, operation, processed, operationCount, "layout-start");
          const node = state.nodes.get(operation.nodeId);
          const parent = operation.parentId ? state.nodes.get(operation.parentId) : page;
          if (node && parent) {
            applyLayout(node, operation.layout ?? {}, parent);
            if (operation.op === "create-instance") applyInstanceContentSizing(node, operation.layout ?? {});
          }
          processed += 1;
          await executionCheckpoint(options, processed);
          reportOperationProgress(options, operation, processed, operationCount);
        }
        if (!moduleId) options.onProgress?.({ id: "icon-hydration", label: "图标填充" });
        for (const operation of plan.operations ?? []) {
          if (operation.op === "hydrate-icon") reportOperationProgress(options, operation, processed, operationCount, "operation-start");
          if (operation.op === "hydrate-icon") hydrateIconOrDefer(operation);
          if (operation.op === "hydrate-icon") {
            processed += 1;
            await executionCheckpoint(options, processed);
            reportOperationProgress(options, operation, processed, operationCount);
          }
        }
      } catch (error) {
        const paused = error?.code === "TEXT_TO_UI_PAUSED";
        const cleanup = discardOrMarkDraft(state.nodes.get(rootId), paused ? "paused" : "failed", options);
        return { ok: false, phase: paused ? "paused" : "execution", page: { id: page.id, name: page.name }, created, cleanup, error: error.message };
      }
      const audit = readback(plan);
      const root = state.nodes.get(rootId);
      writePluginMeta(root, "text-to-ui-canonical-frame", "true");
      writePluginMeta(root, "text-to-ui-canonical-key", canonicalKey);
      writePluginMeta(root, "text-to-ui-executor", "shared-runtime-v1");
      // Auto bridge updates are transactional at the artboard level: keep the
      // previous canonical output until the new tree passes readback, then swap.
      // Plugin-driven whole-page imports keep the new draft hidden and retain
      // the previous canonical output until readback succeeds. Failed drafts
      // are removed so one run cannot leave multiple visible artboards.
      const commitReplacement = options.commitReplacement !== false;
      if (options.replaceExisting && root && (!commitReplacement || audit.issues.length > 0)) {
        if (audit.issues.length > 0) discardOrMarkDraft(root, "failed", options);
        else markDraft(root, "in-progress", options);
      }
      if (audit.issues.length === 0 && options.replaceExisting && commitReplacement && root) {
        for (const previous of previousRoots) {
          if (previous.id !== root.id) previous.remove?.();
        }
        stripMcpNodeNames(root);
        if (requestedRootName) root.name = requestedRootName;
        markDraft(root, "committed", options);
        audit.root.name = root.name;
      }
      return { ok: audit.issues.length === 0, phase: "readback", page: { id: page.id, name: page.name }, created, audit };
    }
    async function verify(plan, options = {}) {
      if (plan.kind === "pixso-component-library-plan" || plan.execution?.mode === "component-library") {
        const libraryName = plan.execution?.libraryPage ?? plan.resources?.componentLibraryPage ?? "NewComponents";
        const page = findPage(libraryName);
        if (!page) return { ok: false, phase: "readback", error: `Component library page not found: ${libraryName}` };
        await readResources(plan);
        state.nodes.clear();
        hydrateExistingLibraryComponents(page);
        const audit = readbackLibrary(plan);
        return { ok: audit.issues.length === 0, phase: "readback", page: { id: page.id, name: page.name }, audit };
      }
      const targetName = options.targetPageName ?? plan.execution?.targetPage ?? plan.page?.targetPage ?? null;
      const page = targetName ? findPage(targetName) : pixso.currentPage;
      if (!page) return { ok: false, phase: "readback", error: `Target Pixso page not found: ${targetName}` };
      await readResources(plan);
      state.nodes.clear();
      hydrateExistingNodes(page, planRunId(plan));
      const audit = readback(plan);
      return { ok: audit.issues.length === 0, phase: "readback", page: { id: page.id, name: page.name }, audit };
    }
    async function executeWithTiming(plan, options = {}) {
      const startedAt = Date.now();
      let phaseStartedAt = startedAt;
      let phaseId = "preflight";
      const phases = [];
      const originalProgress = options.onProgress;
      const onProgress = (phase) => {
        const now = Date.now();
        // Operation telemetry is high-frequency and is used by the Bridge's
        // no-progress watchdog. Keep it out of the coarse phase timing array
        // so a large page does not inflate the result payload or erase the
        // useful module-level timings.
        if (phase?.phase !== "operation") {
          phases.push({ id: phaseId, elapsedMs: now - phaseStartedAt });
          phaseId = phase?.id ?? "execution";
          phaseStartedAt = now;
        }
        originalProgress?.(phase);
      };
      const result = await execute(plan, { ...options, onProgress });
      const endedAt = Date.now();
      phases.push({ id: result.phase === "readback" || result.phase === "modular-readback" ? "readback" : phaseId, elapsedMs: endedAt - phaseStartedAt });
      return {
        ...result,
        timing: {
          totalMs: endedAt - startedAt,
          operationCount: Array.isArray(plan.operations) ? plan.operations.length : 0,
          moduleCount: Array.isArray(plan.modules) ? plan.modules.length : 0,
          phases,
          modules: Array.isArray(result.modules) ? result.modules.map((module) => ({ id: module.id, label: module.label, operationCount: module.operationCount, elapsedMs: module.elapsedMs })) : []
        }
      };
    }
    return { execute: executeWithTiming, verify, readResources, requiredResources };
  }

  global.TextToUiPixsoRuntime = { create, version: "5.0.0" };
})(globalThis);
