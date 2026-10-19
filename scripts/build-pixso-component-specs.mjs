import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const registryPath = path.join(root, "assets/design-system/pixso-component-registry.json");
const mappingRegistryPath = path.join(root, "assets/design-system/mapping-registry.json");
const componentFactsPath = path.join(root, "assets/design-system/pixso-component-facts.json");
const iconMapPath = path.join(root, "assets/design-system/pixso-icon-map.json");
const outputPath = path.join(root, "assets/design-system/pixso-component-specs.json");
const registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));
const mappingRegistry = JSON.parse(fs.readFileSync(mappingRegistryPath, "utf8"));
const componentFacts = JSON.parse(fs.readFileSync(componentFactsPath, "utf8"));
const iconMap = JSON.parse(fs.readFileSync(iconMapPath, "utf8"));
const spacingTokens = JSON.parse(
  fs.readFileSync(path.join(root, "assets/design-system/tokens.spacing.json"), "utf8"),
);
const registeredComponentNames = Object.values(registry.categories).flat();
const mappingProfiles = mappingRegistry.profiles ?? Object.values(mappingRegistry.mappingProfiles ?? {});
const mappedComponentNames = mappingProfiles
  .flatMap((profile) => [
    ...(profile.componentMappings ?? []),
    ...(profile.componentAliases ?? []),
  ])
  .map((mapping) => mapping.pixsoSpecKey)
  .filter(Boolean);
const componentNames = [...new Set([...registeredComponentNames, ...mappedComponentNames])].sort();

function numberFromToken(value) {
  const match = String(value ?? "").match(/(-?\d+(?:\.\d+)?)px$/i);
  return match ? Number(match[1]) : Number(value);
}

function closeNumber(left, right) {
  return Number.isFinite(left) && Number.isFinite(right) && Math.abs(left - right) < 0.001;
}

function iconTextFactVariant(name) {
  const profile = (mappingRegistry.profiles ?? []).find(
    (item) => item.id === mappingRegistry.defaultProfile,
  ) ?? mappingRegistry.profiles?.[0];
  const mapping = (profile?.endpointComponentMappings ?? []).find(
    (item) => item.htmlLogicalName === name,
  );
  const targetName = mapping?.pixsoTarget ?? "icon-text";
  const target = (componentFacts.componentSets ?? []).find((item) => item.name === targetName);
  if (!target) return null;
  const requested = mapping?.pixsoVariant ?? {};
  const supported = new Set(Object.keys(target.variantAxes ?? {}));
  return (target.variants ?? []).find((variant) => Object.entries(requested)
    .filter(([axis]) => supported.has(axis))
    .every(([axis, value]) => String(variant.variantProperties?.[axis] ?? "").toLowerCase() === String(value).toLowerCase())) ?? null;
}

function iconTextPaddingToken(name) {
  if (!name.startsWith("Icon Text Button/")) return "padding/button-x";
  const geometry = iconTextFactVariant(name)?.geometry;
  const left = geometry?.padding?.left;
  const right = geometry?.padding?.right;
  if (!closeNumber(left, right)) return "padding/button-x";
  const candidates = Object.entries(spacingTokens.padding ?? {})
    .filter(([, value]) => {
      const spaceKey = String(value).match(/^space\.(.+)$/)?.[1];
      return spaceKey != null && closeNumber(numberFromToken(spacingTokens.space?.[spaceKey]), left);
    })
    .map(([key]) => key);
  const preferred = ["button-sm-x", "button-x", "select-x", "search-x", "textarea-x"];
  return preferred.find((key) => candidates.includes(key))
    ? `padding/${preferred.find((key) => candidates.includes(key))}`
    : candidates[0]
      ? `padding/${candidates[0]}`
      : "padding/button-x";
}

const shared = {
  componentStateScope: "static-default-only",
  alphaPolicy: {
    rule: "token-alpha-only",
    layerOpacity: 1,
    exception: "Only whole-component Disabled treatment may bind the disabled opacity token.",
  },
  typographyPolicy: {
    rule: "shared-text-style-required",
    styles: [
      "Title_S",
      "Subtitle_S",
      "Subtitle_M",
      "Body_L",
      "Body_M",
      "Body_S",
      "Display_M",
    ],
  },
  iconPolicy: {
    aliases: "assets/icons/icon-aliases.json",
    pixsoMap: "assets/design-system/pixso-icon-map.json",
    sourceArtboard: iconMap.sourceArtboard,
    lucide: "exact-package-svg",
    harmonyos: "exact-approved-svg",
    titlebar: "exact-titlebar-svg",
    prohibitIconFontsForGeneratedNodes: true,
    resizeRootAndVectorsTogether: true,
    strokeWeightFormula: iconMap.rendering?.lucide?.strokeWeightFormula ?? "supported display sizes use strokeWidthByDisplaySize[displaySize]; other approved sizes use 1.5 * displaySize / sourceArtboard",
    strokeWeightByDisplaySize: iconMap.rendering?.lucide?.strokeWidthByDisplaySize ?? { "16": 1, "20": 1.25, "24": 1.5 },
    hotZone: iconMap.rendering?.hotZone ?? { alignment: "CENTER", axes: "BOTH", overflow: "VISIBLE", verificationTolerance: 0.5 },
    forbidApproximation: true,
  },
  placementPolicy: {
    autoLayoutRequired: true,
    forbidOverlappingDirectChildren: true,
    pageComposition: "instances-only",
  },
};

const spec = (
  family,
  previewSelector,
  masterWidth,
  placementWidth,
  height,
  textRoles = {},
  extra = {},
) => ({
  family,
  previewSelector,
  previewStatus: previewSelector ? "current-framework" : "pixso-library-only",
  sizing: { masterWidth, placementWidth, height },
  autoLayout: true,
  textRoles,
  ...extra,
});

function componentSpec(name) {
  if (name.startsWith("Button/")) {
    return spec("Button", ".tui-button", "hug", "hug", 40, { Label: "Body_L" }, {
      direction: "horizontal",
      gapToken: null,
      paddingXToken: "padding/button-x",
      radiusToken: "radius/control",
    });
  }
  if (name.startsWith("Icon Text Button/")) {
    return spec("Icon Text Button", ".tui-button[data-mode=\"icon-text\"]", "hug", "hug", 40, { Label: "Body_L" }, {
      direction: "horizontal",
      gapToken: "gap/button-icon-label",
      paddingXToken: iconTextPaddingToken(name),
      iconSize: 20,
      radiusToken: "radius/control",
    });
  }
  if (name.startsWith("Icon Button/")) {
    return spec("Icon Button", ".tui-button[data-mode=\"icon\"]", 40, "fixed", 40, {}, {
      direction: "horizontal",
      iconSize: 20,
      radiusToken: "radius/control",
    });
  }
  if (name === "Split Dropdown Button/Icon Text/Default") {
    return spec("Split Dropdown Button", ".tui-split-button", "hug", "hug", 40, { Label: "Body_L" }, {
      direction: "horizontal",
      nestedGroups: ["Main Action", "Dropdown Trigger"],
      gapToken: "gap/button-icon-label",
      iconSizes: [20, 16],
    });
  }
  if (name === "Split Dropdown Button/Icon Only/Default") {
    return spec("Split Dropdown Button", ".tui-split-button", "hug", "hug", 40, {}, {
      direction: "horizontal",
      gapToken: "gap/button-icon-label",
      iconSizes: [20, 16],
    });
  }
  if (name === "Toggle/Off/Default") {
    return spec("Toggle", ".toggle-btn", 56, "fixed", 32, {}, { iconSize: 20 });
  }
  if (name === "Selection Dropdown/Default") {
    return spec("Selection Dropdown", null, "hug", "hug", 40, {
      Label: "Body_L",
    }, {
      direction: "horizontal",
      gapToken: "gap/button-icon-label",
      iconSize: 16,
      radiusToken: "radius/control",
      pixsoDefaultVariant: { size: "Medium", state: "Default" },
    });
  }
  if (name === "Form Field/Default") {
    return spec("Form Field", ".tui-form-field", 280, "fill", 64, {
      Label: "Subtitle_S",
      Error: "Body_S",
    }, {
      direction: "vertical",
      gapToken: "gap/field-label",
      nestedGroups: ["Control"],
      pixsoDefaultVariant: { surface: "White", state: "Default" },
    });
  }
  if (name.startsWith("Field/")) {
    return spec("Field", ".tui-field", 280, "fill", name.endsWith("With Description") ? 92 : 68, {
      Label: "Body_L",
      Value: "Body_L",
      Description: "Body_M",
    }, {
      direction: "vertical",
      gapToken: "gap/field-label",
      nestedGroups: ["Control"],
    });
  }
  if (name === "Input/Tag Entry/Default") {
    return spec("Input", ".tui-input--tag-entry", 360, "fill", 56, {
      Label: "Body_L",
      Placeholder: "Body_L",
      Tag: "Body_M",
    }, {
      direction: "horizontal",
      gapToken: "gap/button-icon-label",
      transparent: true,
      surfaceModes: ["white", "gray"],
      hoverContract: "underline-only-color-border-to-color-icon",
      slotContracts: {
        label: { typographyRole: "Body_L", colorRole: "text/secondary" },
        value: { typographyRole: "Body_L", valueColorRole: "text/primary", placeholderColorRole: "text/tertiary" },
        tags: { content: "Chips/Default", hover: false, expandedHitArea: false },
        suggestions: {
          role: "listbox",
          menuItemRole: "option",
          compositionStrategy: "direct-native-nodes",
          panelFillToken: "neutral-light/100",
          panelBorderToken: "neutral-dark/10",
          panelRadiusToken: "radius/card",
          panelEffectStyle: "Effect/Foundation/shadow-2",
          defaultVisibility: "hidden",
        },
      },
    });
  }
  if (name === "Search/Scoped/Default") {
    return spec("Search", ".tui-search:has(.tui-search__scope)", 324, "fill", 40, {
      Scope: "Body_L",
      Value: "Body_L",
      Placeholder: "Body_L",
      Advanced: "Body_M",
    }, {
      direction: "horizontal",
      gapToken: "space/0",
      iconSize: 16,
      clearActionReserve: 32,
      slotContracts: {
        "scope-selector": {
          compositionStrategy: "direct-native-nodes",
          placement: "leading-before-search-icon",
          width: 73,
          height: 40,
          paddingInlineStartToken: "space/4",
          gapToken: "space/2",
          labelTypographyRole: "Body_L",
          labelColorToken: "neutral-dark/90",
          arrowIconSize: 20,
          arrowColorToken: "neutral-dark/90",
          divider: "color.border",
          dividerSize: "1×16",
          menuPanel: {
            role: "menu",
            fillToken: "neutral-light/100",
            borderToken: "neutral-dark/10",
            radiusToken: "radius/card",
            effectStyle: "Effect/Foundation/shadow-2",
            defaultVisibility: "hidden",
          },
        },
        "input-region": {
          placement: "fills-remaining-width",
          paddingInlineStartToken: "space/3",
          paddingInlineEndToken: "space/2",
          gapToken: "space/3",
        },
        leading: { iconAlias: "field/search", size: 16, colorToken: "neutral-dark/60" },
        value: { typographyRole: "Body_L", colorToken: "neutral-dark/90", placeholderTypographyRole: "Body_L", placeholderColorToken: "neutral-dark/60" },
        clear: { optional: true, iconAlias: "action/close", size: 16, colorToken: "neutral-dark/90" },
        "advanced-search": { optional: true, typographyRole: "Body_M", colorToken: "neutral-dark/60" },
      },
      interactionRegions: {
        left: "scope-selector",
        right: "input-region",
        hover: {
          left: { whiteContent: "neutral-dark/05", grayContent: "neutral-dark/05" },
          right: { whiteContent: "neutral-dark/05", grayContent: "neutral-dark/05" },
        },
        pressed: { whiteContent: "neutral-dark/15", grayContent: "neutral-dark/10" },
        grayContentOutline: { color: "neutral-light/100", width: 2 },
      },
    });
  }
  if (/^(Input|Search|Textarea|Select|Combobox)\//.test(name)) {
    const family = name.split("/")[0];
    const selectors = {
      Input: ".tui-input",
      Search: ".tui-search",
      Textarea: ".tui-textarea",
      Select: ".tui-select",
      Combobox: ".tui-combobox",
    };
    const height = family === "Textarea" ? 126 : 40;
    const masterWidth = family === "Search" ? 324 : 280;
    return spec(family, selectors[family], masterWidth, "fill", height, {
      Value: "Body_L",
      Placeholder: "Body_L",
    }, {
      direction: family === "Textarea" ? "vertical" : "horizontal",
      gapToken: family === "Search" ? "space/0" : ["Select", "Combobox"].includes(family) ? "gap/button-icon-label" : null,
      iconSize: ["Search", "Select", "Combobox"].includes(family) ? 16 : null,
      clearActionReserve: family === "Search" ? 32 : null,
    });
  }
  if (name === "Number Selector/Default") {
    return spec("Number Selector", ".tui-number-selector", 92, "fixed", 62, {
      Label: "Body_M",
      Value: "Body_L",
    }, {
      direction: "vertical",
      gapToken: "space/2",
      controlHeight: 40,
      valueWidth: 52,
      stepperWidth: 40,
      iconSize: 16,
      radiusToken: "radius/control",
      nestedGroups: ["Control", "Stepper"],
    });
  }
  if (name === "Input OTP/Default") {
    return spec("Input OTP", ".tui-input-otp", "hug", "hug", 44, { Digit: "Body_L" }, {
      direction: "horizontal",
      gapToken: "gap/button-icon-label",
    });
  }
  if (name === "Checkbox/Unchecked/Default") {
    return spec("Checkbox", ".tui-checkbox", "hug", "hug", 40, { Label: "Body_M" }, {
      direction: "horizontal",
      gapToken: "gap/choice-label",
      controlSize: 20,
    });
  }
  if (name === "Radio/Unselected/Default") {
    return spec("Radio", ".tui-radio", "hug", "hug", 40, { Label: "Body_M" }, {
      direction: "horizontal",
      gapToken: "gap/choice-label",
      controlSize: 20,
    });
  }
  if (name === "Switch/Off/Default") {
    return spec("Switch", ".tui-switch", "hug", "hug", 40, { Label: "Body_M" }, {
      direction: "horizontal",
      gapToken: "gap/choice-label",
      trackSize: [44, 24],
      thumbSize: 20,
    });
  }
  if (name === "Slider/Default") {
    return spec("Slider", ".tui-slider", 280, "fill", 24, {}, {
      trackHeight: 4,
      thumbSize: 16,
      value: 84,
      variants: {
        "style-1": {
          trackHeight: 4,
          thumbSize: 16,
          thumbFill: "brand/100",
          thumbOffset: 0,
          trackRadiusToken: "radius/full",
        },
        "style-2": {
          trackHeight: 20,
          thumbSize: 12,
          thumbFill: "neutral-light/100",
          thumbOffset: -10,
          trackRadiusToken: "size/24",
        },
      },
      intentionalOverlapWrapper: "Slider Visual",
    });
  }
  if (name === "Segmented Button/Default") {
    return spec("Segmented Button", ".tui-segmented", "hug", "hug", 40, { Option: "Body_M" }, {
      direction: "horizontal",
      gapToken: "space/1",
      paddingX: 2,
      paddingY: 2,
      radiusToken: "radius/08",
      pixsoDefaultVariant: { count: "3" },
    });
  }
  if (name === "Date Picker/Default" || name === "Time Picker/Default") {
    const isDate = name.startsWith("Date");
    return spec(isDate ? "Date Picker" : "Time Picker", ".tui-picker__trigger", 280, "fill", 40, {
      Value: "Body_L",
    }, {
      direction: "horizontal",
      gapToken: "gap/button-icon-label",
      iconSize: 16,
    });
  }
  if (name.startsWith("Titlebar/")) {
    const size = name.split("/")[1];
    return spec("Titlebar", ".tui-titlebar", 640, "fill", {
      S: 40,
      M: 56,
      L: 64,
      XL: 72,
    }[size], { "App Name": "Subtitle_M" }, {
      direction: "horizontal",
      transparent: true,
      nestedGroups: ["Leading", "Window Controls"],
      exactAssetIcons: ["window/minimize", "window/maximize", "window/close"],
    });
  }
  if (name === "Sidebar Item/Default") {
    return spec("Sidebar Item", ".tui-sidebar-item", 240, "fill", 40, { Label: "Body_L" }, {
      direction: "horizontal",
      gapToken: "gap/button-icon-label",
      iconSize: 20,
    });
  }
  if (name === "Sub Tabs/Default") {
    return spec("Sub Tabs Item", ".tui-sub-tabs__list > [role=tab]", "hug", "hug", 40, { Label: "Subtitle_M" }, {
      direction: "horizontal",
      minWidth: 64,
      radiusToken: "radius/08",
      pixsoDefaultVariant: { state: "Unselected" },
      mappingScope: "every child .tui-sub-tabs__list [role=tab]",
      stateResolution: { default: "Unselected", selected: "Selected" },
    });
  }
  if (name === "Sidebar Group Header/Collapsed") {
    return spec("Sidebar Group Header", ".tui-sidebar-group", 240, "fill", 40, { Label: "Subtitle_S" }, {
      direction: "horizontal",
      iconSize: 16,
    });
  }
  if (name === "Primary Level Icon/Default") {
    return spec("Primary Level Icon", ".tui-primary-navigation-item", 40, "fixed", 40, {}, {
      iconSize: 24,
      iconAliases: ["navigation/grid"],
      transparent: true,
    });
  }
  if (name === "Menubar/Default") {
    return spec("Menubar", ".tui-advanced-menubar", "hug", "hug", "hug", { Label: "Body_L" }, {
      direction: "horizontal",
      nestedGroups: ["Menu Items"],
      itemQuantity: 1,
    });
  }
  if (name === "Dropdown Menu/Default") {
    return spec("Dropdown Menu", ".tui-advanced-menu", 280, "hug", 68, {
      Label: "Body_M",
      Value: "Body_L",
      "Menu Item": "Body_L",
    }, {
      direction: "vertical",
      compositionStrategy: "direct-native-nodes",
      pixsoReusableTarget: false,
      gapToken: "gap/field-label",
      radiusToken: "radius/card",
      effectStyle: "Effect/Foundation/shadow-2",
      panelDefaultVisibility: "hidden",
      slotContracts: {
        label: { typographyRole: "Body_M" },
        content: { role: "menu", compositionStrategy: "direct-native-nodes", panelEffectStyle: "Effect/Foundation/shadow-2", defaultVisibility: "hidden" },
        description: { optional: true, typographyRole: "Body_M" },
      },
    });
  }
  if (name.startsWith("Tabs/")) {
    const type = name.split("/")[1];
    return spec("Tabs", ".tui-tabs", type === "Vertical" ? 220 : 360, "fill", type === "Vertical" ? "hug" : 40, {
      Label: "Body_M",
    }, { direction: type === "Vertical" ? "vertical" : "horizontal" });
  }
  if (name === "Breadcrumb/Default") {
    return spec("Breadcrumb", ".tui-breadcrumb", "hug", "hug", 40, { Label: "Body_M" }, {
      direction: "horizontal",
      gapToken: "gap/breadcrumb-item",
      iconSize: 16,
    });
  }
  if (name === "Pagination Item/Default") {
    return spec("Pagination Item", ".tui-pagination button", 32, "fixed", 32, { Label: "Body_M" });
  }
  if (name === "Pagination/Default") {
    return spec("Pagination", ".tui-pagination", "hug", "hug", 40, { Label: "Body_L" }, {
      direction: "horizontal",
      gapToken: "space/1",
      iconSize: 20,
      nestedGroups: ["Previous", "Pages", "Next"],
    });
  }
  if (name === "Accordion/Collapsed" || name === "Collapsible/Collapsed") {
    const accordion = name.startsWith("Accordion");
    return spec(accordion ? "Accordion" : "Collapsible", accordion ? '.tui-disclosure[data-component="accordion"] .tui-disclosure__trigger' : '.tui-disclosure[data-component="collapsible"] .tui-disclosure__trigger', 360, "fill", accordion ? 24 : 32, {
      Label: "Body_L",
    }, { direction: "horizontal", iconSize: 16 });
  }
  if (name.startsWith("Card/")) {
    return spec("Card", ".card", 320, "fill", name.endsWith("Header Body Footer") ? 200 : 160, {
      Title: "Title_S",
      Body: "Body_M",
      Footer: "Body_M",
    }, {
      direction: "vertical",
      paddingToken: "padding/card",
      radiusToken: "radius/card",
    });
  }
  if (name === "Metric Card/Default") {
    return spec("Metric Card", null, 320, "fill", 148, {
      Label: "Body_M",
      Value: "Display_M",
      Context: "Subtitle_S",
    }, { direction: "vertical", paddingToken: "padding/card" });
  }
  if (name.startsWith("List Item/")) {
    return spec("List Item", ".tui-list-card", 360, "fill", 48, {
      Primary: "Body_L",
      Secondary: "Body_M",
    }, {
      direction: "horizontal",
      gap: 12,
      paddingX: 12,
      radiusToken: "radius/list-item",
    });
  }
  if (name.startsWith("List Container/")) {
    return spec("List Container", ".tui-list-card-group", 360, "fill", "hug", {
      Primary: "Body_L",
      Secondary: "Body_M",
    }, { direction: "vertical", gapToken: "gap/list-item" });
  }
  if (name === "Table/Default") {
    return spec("Table", ".tui-table", 720, "fill", "hug", {
      Header: "Subtitle_S",
      Cell: "Body_L",
    }, { direction: "vertical", paddingToken: "padding/table" });
  }
  if (name === "Table Header/Default") {
    return spec("Table Header", ".tui-table", 720, "fill", 40, { Cell: "Subtitle_S" }, {
      direction: "horizontal",
    });
  }
  if (name === "Table Row/Default") {
    return spec("Table Row", ".tui-table", 720, "fill", 48, { Cell: "Body_L" }, {
      direction: "horizontal",
    });
  }
  if (name.startsWith("Badge/")) {
    return spec("Badge", ".tui-badge", "hug", "hug", 24, { Label: "Body_S" }, {
      direction: "horizontal",
      paddingX: 8,
      // The production HTML implementation (`.tui-badge`) uses the
      // 4px foundational radius.  Do not inherit the older gallery-only
      // `.badge` pill treatment here: Pixso components must follow the
      // HTML component that the importer actually reuses.
      radiusToken: "radius/04",
    });
  }
  if (name.startsWith("Avatar/")) {
    const size = Number(name.split("/")[1]);
    return spec("Avatar", ".tui-avatar", size, "fixed", size, { Initials: "Body_S" }, {
      iconSize: size === 32 ? 20 : 24,
      radiusToken: "radius/avatar",
    });
  }
  if (name === "Progress/Default") {
    return spec("Progress", ".tui-progress", 320, "fill", 32, {
      Label: "Body_S",
      Description: "Body_S",
    }, {
      direction: "vertical",
      gapToken: "space/2",
      trackHeight: 8,
      trackRadiusToken: "radius/full",
      nestedGroups: ["Track"],
    });
  }
  if (name === "Spinner/Default") {
    return spec("Spinner", ".spinner", 20, "fixed", 20, {}, { exactGeometry: "css-ring" });
  }
  if (name.startsWith("Skeleton/")) {
    const type = name.split("/")[1];
    return spec("Skeleton", ".skeleton", {
      Text: 280,
      Avatar: 48,
      "List Row": 360,
      Card: 320,
    }[type], type === "Text" || type === "Card" || type === "List Row" ? "fill" : "fixed", {
      Text: 52,
      Avatar: 48,
      "List Row": 64,
      Card: 160,
    }[type], {}, {
      direction: type === "List Row" ? "horizontal" : "vertical",
    });
  }
  if (name.startsWith("Alert/")) {
    return spec("Alert", ".tui-alert", 720, "fill", 40, {
      Detail: "Subtitle_S",
      "Text Action": "Body_M",
    }, {
      direction: "horizontal",
      nestedGroups: ["Alert Main", "Alert Actions"],
      iconSize: 20,
      closeTargetSize: 32,
      closeIconSize: 16,
      paddingLeftToken: "padding/alert-left",
      paddingRightToken: "padding/alert-right",
    });
  }
  if (name === "Snackbar/Default") {
    return spec("Snackbar", ".tui-snackbar", "hug", "hug", 48, { Title: "Subtitle_S", Subtitle: "Body_S", "Text Action": "Body_M" }, {
      minWidth: 328,
      maxWidth: 400,
      direction: "horizontal",
      nestedGroups: ["Snackbar Main", "Snackbar Actions"],
      iconSize: 24,
      paddingLeftToken: "space/4",
      contentGapToken: "space/1",
      closeTargetSize: 40,
      closeIconSize: 20,
      effectStyle: "Effect/Foundation/shadow-1",
      pixsoDefaultVariant: { "左侧区域": "1" },
    });
  }
  if (name === "Chips/Default") {
    return spec("Chips", ".tui-chip", "hug", "hug", 28, { Label: "Body_M" }, {
      direction: "horizontal",
      gapToken: "space/2",
      paddingLeftToken: "space/4",
      paddingRightToken: "space/3",
      radiusToken: "radius/control",
      iconSize: 16,
      pixsoDefaultVariant: { "状态": "Default" },
      slotContracts: {
        leading: { cardinality: "0..1", iconSize: 16 },
        label: { cardinality: "1", typographyRole: "Body_M" },
        close: { cardinality: "0..1", iconAlias: "action/close", iconSize: 16 },
      },
    });
  }
  if (name === "Dialog/Default") {
    return spec("Dialog-2in1", ".tui-dialog", 400, "fixed", "hug", {
      Title: "Title_S",
      Subtitle: "Body_M",
      Description: "Body_M",
    }, {
      minWidth: 400,
      direction: "vertical",
      nestedGroups: ["Dialog Titlebar", "Dialog Content", "Dialog Actions"],
      slotContracts: {
        titlebar: {
          cardinality: "1",
          variants: ["title-only", "title-subtitle"],
          pixsoComponent: ".Title",
          pixsoVariants: { "title-only": "2 Line=OFF", "title-subtitle": "2 Line=ON" },
        },
        actions: {
          cardinality: "1",
          acceptedComponent: "Button",
          buttonCount: { min: 1, max: 3 },
          variants: ["one-button", "two-buttons", "three-buttons"],
          pixsoComponent: ".Dialog_Container",
          pixsoVariants: {
            "one-button": "quantity=1_normal",
            "two-buttons": ["quantity=2_normal", "quantity=2_emphasize"],
            "three-buttons": "quantity=3_emphasize_port",
          },
        },
      },
    });
  }
  if (name === "ColorPicker/Tablet") {
    return spec("ColorPicker", ".tui-color-picker", 360, "hug", 515, {
      Title: "Title_S",
      Label: "Body_M",
      Value: "Body_S",
    }, {
      minWidth: 320,
      direction: "vertical",
      nestedGroups: ["ColorPicker Tabs", "ColorPicker Controls", "ColorPicker Favorites"],
      iconSize: 24,
      radiusToken: "radius/card",
    });
  }
  if (name === "Tooltip/Default") {
    return spec("Tooltip", ".tui-tooltip", "hug", "hug", "hug", { Message: "Body_S" }, {
      maxWidth: 240,
      paddingToken: "padding/tooltip",
      effectStyle: "Effect/Foundation/shadow-1",
    });
  }
  if (name === "Context Menu/quantity=3") {
    return spec("Context Menu", ".tui-generated__menu[role=\"menu\"]", 224, "fixed", 132, {
      "Menu Item": "Body_L",
    }, {
      direction: "vertical",
      effectStyle: "Effect/Foundation/shadow-3",
      pixsoDefaultVariant: { quantity: "3" },
      slotContracts: {
        content: { cardinality: "1", itemCount: 3 },
        "item-leading": { cardinality: "0..3", iconSize: 20 },
        "item-label": { cardinality: "3", typographyRole: "Body_L" },
        "item-trailing": { cardinality: "0..3", iconSize: 20 },
      },
      mappingScope: "Coremail mail menu only",
    });
  }
  throw new Error(`No component specification rule for ${name}`);
}

const components = Object.fromEntries(componentNames.map((name) => [name, componentSpec(name)]));
const output = {
  schemaVersion: 1,
  generatedFrom: [
    "assets/design-system/pixso-component-registry.json",
    "assets/design-system/pixso-component-facts.json",
    "packages/component-contracts/src/components.json",
    "packages/component-styles/src/index.css",
    "apps/component-gallery/index.html",
    "assets/design-system/tokens.*.json",
    "assets/icons/icon-aliases.json",
    "assets/design-system/pixso-icon-map.json",
  ],
  shared,
  components,
};

const serialized = `${JSON.stringify(output, null, 2)}\n`;
const check = process.argv.includes("--check");
if (check) {
  if (!fs.existsSync(outputPath) || fs.readFileSync(outputPath, "utf8") !== serialized) {
    console.error(`Stale or missing: ${outputPath}`);
    process.exit(1);
  }
  console.log(`Pixso component specs current: ${componentNames.length} components.`);
} else {
  fs.writeFileSync(outputPath, serialized);
  console.log(`Wrote ${outputPath} (${componentNames.length} components).`);
}
