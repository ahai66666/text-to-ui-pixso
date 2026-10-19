(function (global) {
  "use strict";

  const STYLE_PROPERTIES = [
    "display", "visibility", "position", "top", "right", "bottom", "left", "boxSizing", "overflow", "overflowX", "overflowY",
    "flexDirection", "flexWrap", "flexGrow", "flexShrink", "flexBasis", "alignItems", "alignSelf",
    "justifyContent", "placeContent", "gridTemplateColumns", "gridTemplateRows", "gridAutoFlow",
    "gap", "rowGap", "columnGap", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft",
    "marginTop", "marginRight", "marginBottom", "marginLeft", "width", "height", "minWidth",
    "minHeight", "maxWidth", "maxHeight", "backgroundColor", "backgroundImage", "color", "opacity",
    "borderTopWidth", "borderRightWidth", "borderBottomWidth", "borderLeftWidth", "borderTopStyle",
    "borderRightStyle", "borderBottomStyle", "borderLeftStyle", "borderTopColor", "borderRightColor",
    "borderBottomColor", "borderLeftColor", "borderTopLeftRadius", "borderTopRightRadius",
    "borderBottomRightRadius", "borderBottomLeftRadius", "boxShadow", "fontFamily", "fontSize",
    "fontWeight", "fontStyle", "lineHeight", "letterSpacing", "textAlign", "textDecorationLine",
    "whiteSpace", "wordBreak", "textOverflow", "transform", "objectFit", "objectPosition",
    "maskImage", "webkitMaskImage", "fill", "stroke", "zIndex", "listStyleType"
  ];

  const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "LINK", "META", "HEAD", "TITLE", "NOSCRIPT", "TEMPLATE"]);

  function round(value) {
    return Math.round(Number(value) * 1000) / 1000;
  }

  function isVisible(element, style, rect) {
    return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity || 1) !== 0 && rect.width > 0 && rect.height > 0;
  }

  function escapeIdentifier(value) {
    if (global.CSS && typeof global.CSS.escape === "function") return global.CSS.escape(value);
    return String(value).replace(/[^a-zA-Z0-9_-]/g, (character) => `\\${character}`);
  }

  function stableSelector(element, root) {
    // Keep the selector in the same vocabulary as the operation plan. The
    // data-px-key is a semantic binding marker, but it is not necessarily the
    // selector used by the HTML layout contract (for example the root frame
    // may be addressed as `.desktop-stage`). Prefer an authored selector or
    // an id/class selector for geometry matching, and keep data-px-key in the
    // semantic record below.
    const authored = element.getAttribute("data-tui-selector") || element.getAttribute("data-tui-node");
    if (authored) {
      const attribute = element.hasAttribute("data-tui-selector") ? "data-tui-selector" : "data-tui-node";
      return `[${attribute}=${JSON.stringify(authored)}]`;
    }
    if (element.id) return `#${escapeIdentifier(element.id)}`;
    const classes = Array.from(element.classList || []).filter(Boolean);
    if (classes.length) return classes.map((className) => `.${escapeIdentifier(className)}`).join("");
    const segments = [];
    let current = element;
    while (current && current.nodeType === 1 && current !== root.parentElement) {
      let segment = current.tagName.toLowerCase();
      const parent = current.parentElement;
      if (parent) {
        const sameTag = Array.from(parent.children).filter((child) => child.tagName === current.tagName);
        if (sameTag.length > 1) segment += `:nth-of-type(${sameTag.indexOf(current) + 1})`;
      }
      segments.unshift(segment);
      if (current === root) break;
      current = parent;
    }
    return segments.join(" > ");
  }

  function selectorAliases(element, root) {
    const aliases = new Set([stableSelector(element, root)]);
    const classes = Array.from(element.classList || []).filter(Boolean);
    for (const className of classes) aliases.add(`.${escapeIdentifier(className)}`);
    if (element.id) {
      const idSelector = `#${escapeIdentifier(element.id)}`;
      aliases.add(idSelector);
      for (const className of classes) aliases.add(`${idSelector}.${escapeIdentifier(className)}`);
    }
    if (element.hasAttribute("data-px-key")) aliases.add(`[data-px-key=${JSON.stringify(element.getAttribute("data-px-key"))}]`);
    if (element.hasAttribute("data-tui-selector")) aliases.add(`[data-tui-selector=${JSON.stringify(element.getAttribute("data-tui-selector"))}]`);
    if (element.hasAttribute("data-tui-node")) aliases.add(`[data-tui-node=${JSON.stringify(element.getAttribute("data-tui-node"))}]`);
    const parent = element.parentElement;
    if (parent && parent !== root.parentElement) {
      const parentClasses = Array.from(parent.classList || []).filter(Boolean);
      const childSelectors = [];
      if (element.id) childSelectors.push(`#${escapeIdentifier(element.id)}`);
      childSelectors.push(...classes.map((className) => `.${escapeIdentifier(className)}`));
      if (!childSelectors.length) childSelectors.push(element.tagName.toLowerCase());
      for (const parentClass of parentClasses) {
        for (const childSelector of childSelectors) aliases.add(`.${escapeIdentifier(parentClass)} > ${childSelector}`);
      }
    }
    return Array.from(aliases);
  }

  function styleRecord(style) {
    const output = {};
    for (const property of STYLE_PROPERTIES) output[property] = style[property];
    return output;
  }

  function textOnlyStyleRecord(style) {
    const output = styleRecord(style);
    output.backgroundColor = "rgba(0, 0, 0, 0)";
    output.backgroundImage = "none";
    output.boxShadow = "none";
    for (const edge of ["Top", "Right", "Bottom", "Left"]) {
      output[`padding${edge}`] = "0px";
      output[`margin${edge}`] = "0px";
      output[`border${edge}Width`] = "0px";
      output[`border${edge}Style`] = "none";
      output[`border${edge}Color`] = "rgba(0, 0, 0, 0)";
    }
    for (const corner of ["TopLeft", "TopRight", "BottomRight", "BottomLeft"]) output[`border${corner}Radius`] = "0px";
    return output;
  }

  function semanticRecord(element) {
    const dataset = {};
    for (const [key, value] of Object.entries(element.dataset || {})) {
      if (/^(tui|px|component|state|variant|slot|action|icon|surface|logical|density|size)/i.test(key)) dataset[key] = value;
    }
    return {
      role: element.getAttribute("role"),
      ariaLabel: element.getAttribute("aria-label"),
      accessibleText: (element.innerText ?? element.textContent ?? "").replace(/\s+/g, " ").trim(),
      placeholder: element.getAttribute("placeholder") || null,
      value: "value" in element ? String(element.value ?? "") : element.getAttribute("value") || null,
      component: element.getAttribute("data-component"),
      logicalName: element.getAttribute("data-logical-component") || null,
      variant: element.getAttribute("data-variant") || element.getAttribute("data-state"),
      surface: element.getAttribute("data-surface") || null,
      dataset
    };
  }

  function backgroundImageSource(value) {
    const match = String(value ?? "").match(/^url\(\s*(["']?)(.*?)\1\s*\)$/i);
    return match?.[2] || null;
  }

  function assetRecord(element, style) {
    const tag = `${element?.tagName ?? ""}`.toUpperCase();
    if (tag === "IMG") return { kind: "image", src: element.currentSrc || element.src || "", alt: element.alt || "" };
    if (tag === "SVG") return { kind: "svg", alias: element.getAttribute("data-icon-alias") || null, viewBox: element.getAttribute("viewBox") || "", html: element.outerHTML };
    if (tag === "USE") return { kind: "svg-use", href: element.getAttribute("href") || element.getAttribute("xlink:href") || "" };
    const backgroundSource = backgroundImageSource(style?.backgroundImage);
    if (backgroundSource) return { kind: "image", src: backgroundSource, alt: "", fit: style.backgroundSize === "cover" ? "FILL" : "FILL", source: "css-background-image" };
    const maskImage = style?.maskImage && style.maskImage !== "none" ? style.maskImage : style?.webkitMaskImage;
    if (maskImage && maskImage !== "none") return { kind: "css-mask-image", value: maskImage };
    return null;
  }

  function pseudoRect(element, parentStyle, pseudoStyle, pseudo) {
    const parentRect = element.getBoundingClientRect();
    const width = Math.max(0, Number.parseFloat(pseudoStyle.width) || 0);
    const height = Math.max(0, Number.parseFloat(pseudoStyle.height) || 0);
    const marginLeft = Number.parseFloat(pseudoStyle.marginLeft) || 0;
    const marginRight = Number.parseFloat(pseudoStyle.marginRight) || 0;
    const marginTop = Number.parseFloat(pseudoStyle.marginTop) || 0;
    const marginBottom = Number.parseFloat(pseudoStyle.marginBottom) || 0;
    let x = parentRect.x + marginLeft;
    let y = parentRect.y + marginTop;
    if (pseudoStyle.position === "absolute" || pseudoStyle.position === "fixed") {
      const left = Number.parseFloat(pseudoStyle.left);
      const right = Number.parseFloat(pseudoStyle.right);
      const top = Number.parseFloat(pseudoStyle.top);
      const bottom = Number.parseFloat(pseudoStyle.bottom);
      if (Number.isFinite(left)) x = parentRect.x + left;
      else if (Number.isFinite(right)) x = parentRect.right - right - width;
      if (Number.isFinite(top)) y = parentRect.y + top;
      else if (Number.isFinite(bottom)) y = parentRect.bottom - bottom - height;
    } else if (parentStyle.display === "flex" || parentStyle.display === "inline-flex") {
      if (pseudo === "::after") x = parentRect.right - width - marginRight;
      const contentHeight = Math.max(0, parentRect.height - (Number.parseFloat(parentStyle.paddingTop) || 0) - (Number.parseFloat(parentStyle.paddingBottom) || 0));
      if (parentStyle.alignItems === "center") y = parentRect.y + (parentRect.height - height) / 2;
      else if (parentStyle.alignItems === "flex-end") y = parentRect.bottom - height - marginBottom;
      else y = parentRect.y + (Number.parseFloat(parentStyle.paddingTop) || 0) + marginTop;
      if (contentHeight === 0) y = parentRect.y + marginTop;
    }
    return { x, y, width, height };
  }

  function textRangeMetrics(documentRef, target) {
    if (!target || typeof documentRef.createRange !== "function") return null;
    const range = documentRef.createRange();
    try {
      range.selectNodeContents(target);
      const rects = Array.from(typeof range.getClientRects === "function" ? range.getClientRects() : [range.getBoundingClientRect()])
        .filter((rect) => rect && rect.width > 0 && rect.height > 0);
      const lines = new Set(rects.map((rect) => Math.round(Number(rect.y) * 100) / 100));
      return {
        lineCount: lines.size || (rects.length ? 1 : 0),
        inlineWidth: round(Math.max(0, ...rects.map((rect) => Number(rect.width) || 0)))
      };
    } catch (_) {
      return null;
    } finally {
      range.detach?.();
    }
  }

  function boxOwnsVisualAppearance(style) {
    const horizontalPadding = (Number.parseFloat(style?.paddingLeft) || 0) + (Number.parseFloat(style?.paddingRight) || 0);
    const verticalPadding = (Number.parseFloat(style?.paddingTop) || 0) + (Number.parseFloat(style?.paddingBottom) || 0);
    const hasBorder = ["Top", "Right", "Bottom", "Left"].some((edge) => (Number.parseFloat(style?.[`border${edge}Width`]) || 0) > 0
      && style?.[`border${edge}Style`] !== "none");
    const hasRadius = ["TopLeft", "TopRight", "BottomRight", "BottomLeft"].some((corner) => (Number.parseFloat(style?.[`border${corner}Radius`]) || 0) > 0);
    const background = String(style?.backgroundColor ?? "").replace(/\s+/g, "").toLowerCase();
    const hasVisibleBackground = Boolean(style?.backgroundImage && style.backgroundImage !== "none")
      || (background && !["transparent", "rgba(0,0,0,0)", "rgb(0,0,0,0)"].includes(background));
    return horizontalPadding > 0 || verticalPadding > 0 || hasBorder || hasRadius || hasVisibleBackground || (style?.boxShadow && style.boxShadow !== "none");
  }

  function textResizeMode(style, elementRect, metrics, { direct = false, boxOwner = true } = {}) {
    // `overflow: hidden` and `text-overflow: ellipsis` are often applied as a
    // defensive CSS default. They are not proof that the current content is
    // actually truncated. Use the measured range width so a fitting brand
    // name or account email remains intrinsic, while genuinely overflowing
    // list text keeps the fixed-width ellipsis behavior.
    const hasEllipsis = String(style?.textOverflow ?? "").toLowerCase() === "ellipsis";
    if (hasEllipsis) {
      const boxWidth = Number(elementRect?.width);
      const inlineWidth = Number(metrics?.inlineWidth);
      if (Number.isFinite(boxWidth) && Number.isFinite(inlineWidth)) {
        if (inlineWidth > boxWidth + 0.5) return "TRUNCATE";
        if (boxOwner && boxOwnsVisualAppearance(style)) return "NONE";
        return "WIDTH_AND_HEIGHT";
      }
      // Preserve a conservative fixed box only when a legacy/custom capture
      // has no text metrics. New browser captures always include them.
      return "TRUNCATE";
    }
    if (!metrics || !metrics.lineCount || !metrics.inlineWidth) {
      return boxOwner && boxOwnsVisualAppearance(style) ? "NONE" : "WIDTH_AND_HEIGHT";
    }
    if (metrics.lineCount > 1) return "HEIGHT";
    // A decorated leaf owns a browser box, not just glyphs. The collector
    // splits that box from its direct text below; old/unsupported DOM shapes
    // remain fixed rather than discarding their padding geometry.
    if (boxOwner && boxOwnsVisualAppearance(style)) return "NONE";
    // A normal single-line label should behave like Pixso text created with a
    // click: its width follows the content. The browser box width is not a
    // truncation signal. Keep the legacy arguments for caller compatibility.
    void direct;
    void elementRect;
    return "WIDTH_AND_HEIGHT";
  }

  function directTextSegments(documentRef, element, rootRect) {
    if (!element.childNodes || typeof documentRef.createRange !== "function") return [];
    const segments = [];
    Array.from(element.childNodes).forEach((child, childIndex) => {
      if (child.nodeType !== 3) return;
      const raw = String(child.textContent ?? "");
      const start = raw.search(/\S/);
      if (start < 0) return;
      const trailing = raw.slice(start).search(/\s+$/);
      const end = trailing < 0 ? raw.length : start + trailing;
      if (end <= start) return;
      const range = documentRef.createRange();
      try {
        range.setStart(child, start);
        range.setEnd(child, end);
        const rect = range.getBoundingClientRect();
        if (!rect || rect.width <= 0 || rect.height <= 0) return;
        const rects = Array.from(typeof range.getClientRects === "function" ? range.getClientRects() : [rect])
          .filter((item) => item && item.width > 0 && item.height > 0);
        const lines = new Set(rects.map((item) => Math.round(Number(item.y) * 100) / 100));
        const textMetrics = {
          lineCount: lines.size || 1,
          inlineWidth: Math.max(0, ...rects.map((item) => Number(item.width) || 0))
        };
        segments.push({
          text: raw.slice(start, end).replace(/\s+/g, " ").trim(),
          rect: { x: round(rect.x - rootRect.x), y: round(rect.y - rootRect.y), width: round(rect.width), height: round(rect.height) },
          textMetrics,
          textAutoResize: textResizeMode(styleRecord(global.getComputedStyle(element)), rect, textMetrics, { direct: true, boxOwner: false }),
          childIndex,
        });
      } finally {
        range.detach?.();
      }
    });
    return segments.filter((segment) => segment.text);
  }

  function markerWidth(documentRef, style, text) {
    const fontSize = Number.parseFloat(style?.fontSize) || 14;
    try {
      const canvas = documentRef.createElement("canvas");
      const context = canvas.getContext("2d");
      if (context) {
        context.font = `${style?.fontStyle || "normal"} ${style?.fontWeight || "400"} ${style?.fontSize || `${fontSize}px`} ${style?.fontFamily || "sans-serif"}`;
        const measured = context.measureText(text).width;
        if (Number.isFinite(measured) && measured > 0) return measured;
      }
    } catch (_) {}
    return Math.max(8, text.length * fontSize * 0.55);
  }

  function listMarkerRecord(documentRef, element, style, indexByElement, rootRect) {
    if (`${element.tagName}`.toUpperCase() !== "LI" || !element.parentElement) return null;
    const list = element.parentElement;
    const listTag = `${list.tagName}`.toUpperCase();
    if (listTag !== "OL" && listTag !== "UL") return null;
    const listStyle = global.getComputedStyle(list);
    if (listStyle.listStyleType === "none") return null;
    const siblings = Array.from(list.children).filter((child) => `${child.tagName}`.toUpperCase() === "LI");
    const siblingIndex = siblings.indexOf(element);
    const start = Number.parseInt(list.getAttribute("start") || "1", 10);
    const value = Number.parseInt(element.getAttribute("value") || "", 10);
    const ordinal = Number.isFinite(value) ? value : (Number.isFinite(start) ? start + siblingIndex : siblingIndex + 1);
    const text = listTag === "OL" ? `${ordinal}.` : "•";
    const markerStyle = global.getComputedStyle(element, "::marker");
    const effectiveStyle = markerStyle && markerStyle.fontSize ? markerStyle : style;
    const width = markerWidth(documentRef, effectiveStyle, text);
    const listRect = list.getBoundingClientRect();
    const elementRect = element.getBoundingClientRect();
    const paddingLeft = Number.parseFloat(listStyle.paddingLeft) || Math.max(0, elementRect.x - listRect.x);
    const gap = Math.min(8, Math.max(4, paddingLeft * 0.25));
    const x = elementRect.x - paddingLeft + Math.max(0, paddingLeft - width - gap);
    const y = elementRect.y;
    const parentIndex = indexByElement.get(list);
    if (!Number.isInteger(parentIndex)) return null;
    return {
      parentIndex,
      childIndex: siblingIndex,
      selector: `${stableSelector(element, documentRef.querySelector("[data-tui-pattern], #app, main") || element)}::marker`,
      text,
      rect: { x: round(x - rootRect.x), y: round(y - rootRect.y), width: round(width), height: round(elementRect.height) },
      style: styleRecord(effectiveStyle),
      textAutoResize: "WIDTH_AND_HEIGHT",
    };
  }

  function collectTextToUiVisualManifest(documentRef, options = {}) {
    const captureStartedAt = global.performance && typeof global.performance.now === "function" ? global.performance.now() : Date.now();
    const root = options.root || documentRef.querySelector(options.rootSelector || "[data-tui-pattern], #app, main") || documentRef.body;
    if (!root) throw new Error("Visual manifest root was not found");
    const viewport = {
      width: round(global.innerWidth),
      height: round(global.innerHeight),
      devicePixelRatio: round(global.devicePixelRatio || 1),
      scroll: {x:round(global.scrollX||0),y:round(global.scrollY||0)},
      zoom: round(global.visualViewport ? global.innerWidth / global.visualViewport.width : 1)
    };
    const rootRect = root.getBoundingClientRect();
    const elements = [root, ...root.querySelectorAll("*")].filter((element) => !SKIP_TAGS.has(`${element.tagName}`.toUpperCase()));
    const nodes = [];
    const indexByElement = new Map();
    for (const element of elements) {
      const style = global.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      if (!isVisible(element, style, rect)) continue;
      const index = nodes.length;
      indexByElement.set(element, index);
      let visibleParent = element.parentElement;
      while (visibleParent && !indexByElement.has(visibleParent)) visibleParent = visibleParent.parentElement;
      const parentIndex = indexByElement.get(visibleParent);
      const visibleSiblings = element.parentElement
        ? Array.from(element.parentElement.children).filter((sibling) => {
            const siblingStyle = global.getComputedStyle(sibling);
            const siblingRect = sibling.getBoundingClientRect();
            return !SKIP_TAGS.has(`${sibling.tagName}`.toUpperCase()) && isVisible(sibling, siblingStyle, siblingRect);
          })
        : [];
      const rawText = element.children.length === 0 ? (element.innerText ?? element.textContent ?? "") : "";
      const text = rawText ? rawText.replace(/\s+/g, " ").trim() : "";
      const selector = stableSelector(element, root);
      const splitDecoratedLeafText = Boolean(text && element.children.length === 0 && boxOwnsVisualAppearance(style));
      const directSegments = (element.children.length > 0 || splitDecoratedLeafText) ? directTextSegments(documentRef, element, rootRect) : [];
      const renderedText = splitDecoratedLeafText && directSegments.length ? "" : text;
      const textMetrics = renderedText ? textRangeMetrics(documentRef, element) : null;
      const textAutoResize = renderedText ? textResizeMode(style, rect, textMetrics) : null;
      nodes.push({
        index,
        parentIndex: Number.isInteger(parentIndex) ? parentIndex : null,
        childIndex: visibleSiblings.indexOf(element),
        selector,
        selectorAliases: selectorAliases(element, root),
        tag: `${element.tagName}`.toLowerCase(),
        rect: { x: round(rect.x - rootRect.x), y: round(rect.y - rootRect.y), width: round(rect.width), height: round(rect.height) },
        style: styleRecord(style),
        box: {
          padding: { top: style.paddingTop, right: style.paddingRight, bottom: style.paddingBottom, left: style.paddingLeft },
          margin: { top: style.marginTop, right: style.marginRight, bottom: style.marginBottom, left: style.marginLeft },
          border: { top: style.borderTopWidth, right: style.borderRightWidth, bottom: style.borderBottomWidth, left: style.borderLeftWidth },
          strokeEdges: ["top", "right", "bottom", "left"].filter((edge) => Number.parseFloat(style[`border${edge[0].toUpperCase()}${edge.slice(1)}Width`]) > 0)
        },
        semantic: semanticRecord(element),
        text: renderedText,
        ...(textMetrics ? { textMetrics } : {}),
        ...(textAutoResize ? { textAutoResize } : {}),
        asset: assetRecord(element, style)
      });
      for (const segment of directSegments) {
        nodes.push({
          index: nodes.length,
          parentIndex: index,
          childIndex: segment.childIndex,
          selector: `${selector}::text-${segment.childIndex}`,
          selectorAliases: [],
          tag: "text",
          rect: segment.rect,
          style: textOnlyStyleRecord(style),
          box: {
            padding: { top: "0px", right: "0px", bottom: "0px", left: "0px" },
            margin: { top: "0px", right: "0px", bottom: "0px", left: "0px" },
            border: { top: "0px", right: "0px", bottom: "0px", left: "0px" },
            strokeEdges: []
          },
          semantic: { role: null, ariaLabel: null, accessibleText: segment.text, placeholder: null, component: null, variant: null, dataset: {} },
          text: segment.text,
          ...(segment.textMetrics ? { textMetrics: segment.textMetrics } : {}),
          ...(segment.textAutoResize ? { textAutoResize: segment.textAutoResize } : {}),
          asset: null,
          textSource: "direct-text-node"
        });
      }
      const marker = listMarkerRecord(documentRef, element, style, indexByElement, rootRect);
      if (marker) {
        nodes.push({
          index: nodes.length,
          parentIndex: marker.parentIndex,
          childIndex: marker.childIndex,
          selector: marker.selector,
          selectorAliases: [],
          tag: "marker",
          rect: marker.rect,
          style: marker.style,
          box: {
            padding: { top: "0px", right: "0px", bottom: "0px", left: "0px" },
            margin: { top: "0px", right: "0px", bottom: "0px", left: "0px" },
            border: { top: "0px", right: "0px", bottom: "0px", left: "0px" },
            strokeEdges: []
          },
          semantic: { role: null, ariaLabel: null, accessibleText: marker.text, placeholder: null, component: null, variant: null, dataset: {} },
          text: marker.text,
          textAutoResize: marker.textAutoResize,
          asset: null,
          textSource: "list-marker"
        });
      }
      // CSS pseudo-elements are not returned by querySelectorAll, but they
      // can own visible raster assets (the Coremail brand logo is one). Add
      // image-backed ::before/::after nodes to the same visual tree so the
      // DOM Visual IR can preserve their exact bounds and source URL.
      for (const pseudo of ["::before", "::after"]) {
        const pseudoStyle = global.getComputedStyle(element, pseudo);
        const pseudoAsset = assetRecord(null, pseudoStyle);
        if (!pseudoAsset || pseudoStyle.display === "none" || pseudoStyle.visibility === "hidden") continue;
        const pseudoBounds = pseudoRect(element, style, pseudoStyle, pseudo);
        if (pseudoBounds.width <= 0 || pseudoBounds.height <= 0) continue;
        const pseudoIndex = nodes.length;
        nodes.push({
          index: pseudoIndex,
          parentIndex: index,
          childIndex: pseudo === "::before" ? 0 : 999,
          selector: `${selector}${pseudo}`,
          selectorAliases: [],
          tag: "pseudo",
          rect: { x: round(pseudoBounds.x - rootRect.x), y: round(pseudoBounds.y - rootRect.y), width: round(pseudoBounds.width), height: round(pseudoBounds.height) },
          style: styleRecord(pseudoStyle),
          box: {
            padding: { top: pseudoStyle.paddingTop, right: pseudoStyle.paddingRight, bottom: pseudoStyle.paddingBottom, left: pseudoStyle.paddingLeft },
            margin: { top: pseudoStyle.marginTop, right: pseudoStyle.marginRight, bottom: pseudoStyle.marginBottom, left: pseudoStyle.marginLeft },
            border: { top: pseudoStyle.borderTopWidth, right: pseudoStyle.borderRightWidth, bottom: pseudoStyle.borderBottomWidth, left: pseudoStyle.borderLeftWidth },
            strokeEdges: ["top", "right", "bottom", "left"].filter((edge) => Number.parseFloat(pseudoStyle[`border${edge[0].toUpperCase()}${edge.slice(1)}Width`]) > 0)
          },
          semantic: { role: null, ariaLabel: null, accessibleText: "", component: null, variant: null, dataset: {} },
          text: "",
          asset: pseudoAsset,
          pseudo
        });
      }
    }
    if (nodes.length === 0) throw new Error("Visual manifest contains no visible nodes");
    const captureEndedAt = global.performance && typeof global.performance.now === "function" ? global.performance.now() : Date.now();
    return {
      schemaVersion: 4,
      kind: "text-to-ui-html-visual-manifest",
      source: "browser-computed-visual-manifest",
      runId: options.runId || null,
      htmlSourceFingerprint: options.htmlSourceFingerprint || null,
      stateId: options.stateId || documentRef.documentElement.getAttribute("data-visual-state-id") || "default-visible",
      url: String(global.location && global.location.href || ""),
      capturedAt: new Date().toISOString(),
      viewport,
      root: { selector: stableSelector(root, root), selectorAliases: selectorAliases(root, root), rect: { x: round(rootRect.x), y: round(rootRect.y), width: round(rootRect.width), height: round(rootRect.height) } },
      nodeCount: nodes.length,
      performance: {
        captureMs: round(captureEndedAt - captureStartedAt),
        assetCount: nodes.filter((node) => node.asset).length,
        textNodeCount: nodes.filter((node) => node.text).length
      },
      nodes
    };
  }

  global.collectTextToUiVisualManifest = collectTextToUiVisualManifest;
  if (typeof module !== "undefined" && module.exports) module.exports = {
    collectTextToUiVisualManifest,
    __test: { boxOwnsVisualAppearance, textResizeMode, textOnlyStyleRecord },
  };
})(typeof window !== "undefined" ? window : globalThis);
