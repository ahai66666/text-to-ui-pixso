---
aliases:
  - HTML 与 Pixso Token 对应表
  - HTML 与 Pixso Component 对应表
tags:
  - text-to-ui
  - pixso
  - mapping-registry
verified: 2026-09-02
source: assets/design-system/mapping-registry.json
---

# Text-to-UI：跨源 Token / Component 映射表

> 日常维护请使用 Obsidian 的 `Text-to-UI-映射维护台`，本文件只作为详细结果报告。

所有组件都以 HTML logicalName 为正式身份。运行时组件 ID（如有）只是同一行中的代码调用别名，不是另一类组件映射。

当前 profile：<code>html-to-pixso-harmonyos-client</code> · Text-to-UI HTML → 鸿蒙客户端设计规范。本文件是详细可读视图；日常修改请填写 Obsidian 映射维护台的人工编辑区，由同步脚本回写 registry，不要直接编辑本文件。

| 统计 | 数量 |
| --- | ---: |
| canonical Token mappings | 130 |
| semantic Token mappings | 290 |
| runtime semantic mappings (generated index) | 315 |
| runtime-only semantic aliases | 25 |
| semantic color mappings | 99 |
| Style mappings | 19 |
| HTML formal Component mappings | 20 |
| current Pixso business components | 21 |
| current Pixso exact target names | 24 |
| native source mappings | 21 |

## Token ↔ Pixso Variable

| HTML CSS Token | HTML source | Pixso 集合 / Mode | Pixso Variable | Transform |
| --- | --- | --- | --- | --- |
| <code>--color-brand-05</code> | tokens.colors.json:brand.05 | Color / Light | <code>brand/05</code> | identity |
| <code>--color-brand-10</code> | tokens.colors.json:brand.10 | Color / Light | <code>brand/10</code> | identity |
| <code>--color-brand-15</code> | tokens.colors.json:brand.15 | Color / Light | <code>brand/15</code> | identity |
| <code>--color-brand-20</code> | tokens.colors.json:brand.20 | Color / Light | <code>brand/20</code> | identity |
| <code>--color-brand-30</code> | tokens.colors.json:brand.30 | Color / Light | <code>brand/30</code> | identity |
| <code>--color-brand-40</code> | tokens.colors.json:brand.40 | Color / Light | <code>brand/40</code> | identity |
| <code>--color-brand-50</code> | tokens.colors.json:brand.50 | Color / Light | <code>brand/50</code> | identity |
| <code>--color-brand-60</code> | tokens.colors.json:brand.60 | Color / Light | <code>brand/60</code> | identity |
| <code>--color-brand-70</code> | tokens.colors.json:brand.70 | Color / Light | <code>brand/70</code> | identity |
| <code>--color-brand-80</code> | tokens.colors.json:brand.80 | Color / Light | <code>brand/80</code> | identity |
| <code>--color-brand-90</code> | tokens.colors.json:brand.90 | Color / Light | <code>brand/90</code> | identity |
| <code>--color-brand-100</code> | tokens.colors.json:brand.100 | Color / Light | <code>brand/100</code> | identity |
| <code>--color-neutral-dark-05</code> | tokens.colors.json:neutral-dark.05 | Color / Light | <code>neutral-dark/05</code> | identity |
| <code>--color-neutral-dark-10</code> | tokens.colors.json:neutral-dark.10 | Color / Light | <code>neutral-dark/10</code> | identity |
| <code>--color-neutral-dark-15</code> | tokens.colors.json:neutral-dark.15 | Color / Light | <code>neutral-dark/15</code> | identity |
| <code>--color-neutral-dark-20</code> | tokens.colors.json:neutral-dark.20 | Color / Light | <code>neutral-dark/20</code> | identity |
| <code>--color-neutral-dark-30</code> | tokens.colors.json:neutral-dark.30 | Color / Light | <code>neutral-dark/30</code> | identity |
| <code>--color-neutral-dark-40</code> | tokens.colors.json:neutral-dark.40 | Color / Light | <code>neutral-dark/40</code> | identity |
| <code>--color-neutral-dark-50</code> | tokens.colors.json:neutral-dark.50 | Color / Light | <code>neutral-dark/50</code> | identity |
| <code>--color-neutral-dark-60</code> | tokens.colors.json:neutral-dark.60 | Color / Light | <code>neutral-dark/60</code> | identity |
| <code>--color-neutral-dark-70</code> | tokens.colors.json:neutral-dark.70 | Color / Light | <code>neutral-dark/70</code> | identity |
| <code>--color-neutral-dark-80</code> | tokens.colors.json:neutral-dark.80 | Color / Light | <code>neutral-dark/80</code> | identity |
| <code>--color-neutral-dark-90</code> | tokens.colors.json:neutral-dark.90 | Color / Light | <code>neutral-dark/90</code> | identity |
| <code>--color-neutral-dark-100</code> | tokens.colors.json:neutral-dark.100 | Color / Light | <code>neutral-dark/100</code> | identity |
| <code>--color-neutral-light-05</code> | tokens.colors.json:neutral-light.05 | Color / Light | <code>neutral-light/05</code> | identity |
| <code>--color-neutral-light-10</code> | tokens.colors.json:neutral-light.10 | Color / Light | <code>neutral-light/10</code> | identity |
| <code>--color-neutral-light-15</code> | tokens.colors.json:neutral-light.15 | Color / Light | <code>neutral-light/15</code> | identity |
| <code>--color-neutral-light-20</code> | tokens.colors.json:neutral-light.20 | Color / Light | <code>neutral-light/20</code> | identity |
| <code>--color-neutral-light-30</code> | tokens.colors.json:neutral-light.30 | Color / Light | <code>neutral-light/30</code> | identity |
| <code>--color-neutral-light-40</code> | tokens.colors.json:neutral-light.40 | Color / Light | <code>neutral-light/40</code> | identity |
| <code>--color-neutral-light-50</code> | tokens.colors.json:neutral-light.50 | Color / Light | <code>neutral-light/50</code> | identity |
| <code>--color-neutral-light-60</code> | tokens.colors.json:neutral-light.60 | Color / Light | <code>neutral-light/60</code> | identity |
| <code>--color-neutral-light-70</code> | tokens.colors.json:neutral-light.70 | Color / Light | <code>neutral-light/70</code> | identity |
| <code>--color-neutral-light-80</code> | tokens.colors.json:neutral-light.80 | Color / Light | <code>neutral-light/80</code> | identity |
| <code>--color-neutral-light-90</code> | tokens.colors.json:neutral-light.90 | Color / Light | <code>neutral-light/90</code> | identity |
| <code>--color-neutral-light-100</code> | tokens.colors.json:neutral-light.100 | Color / Light | <code>neutral-light/100</code> | identity |
| <code>--color-function-success-10</code> | tokens.colors.json:function.success.10 | Color / Light | <code>function/success/10</code> | identity |
| <code>--color-function-success-20</code> | tokens.colors.json:function.success.20 | Color / Light | <code>function/success/20</code> | identity |
| <code>--color-function-success-100</code> | tokens.colors.json:function.success.100 | Color / Light | <code>function/success/100</code> | identity |
| <code>--color-function-warning-10</code> | tokens.colors.json:function.warning.10 | Color / Light | <code>function/warning/10</code> | identity |
| <code>--color-function-warning-20</code> | tokens.colors.json:function.warning.20 | Color / Light | <code>function/warning/20</code> | identity |
| <code>--color-function-warning-100</code> | tokens.colors.json:function.warning.100 | Color / Light | <code>function/warning/100</code> | identity |
| <code>--color-function-danger-10</code> | tokens.colors.json:function.danger.10 | Color / Light | <code>function/danger/10</code> | identity |
| <code>--color-function-danger-20</code> | tokens.colors.json:function.danger.20 | Color / Light | <code>function/danger/20</code> | identity |
| <code>--color-function-danger-100</code> | tokens.colors.json:function.danger.100 | Color / Light | <code>function/danger/100</code> | identity |
| <code>--color-multi-01</code> | tokens.colors.json:multi.01 | Color / Light | <code>multi/01</code> | identity |
| <code>--color-multi-02</code> | tokens.colors.json:multi.02 | Color / Light | <code>multi/02</code> | identity |
| <code>--color-multi-03</code> | tokens.colors.json:multi.03 | Color / Light | <code>multi/03</code> | identity |
| <code>--color-multi-04</code> | tokens.colors.json:multi.04 | Color / Light | <code>multi/04</code> | identity |
| <code>--color-multi-05</code> | tokens.colors.json:multi.05 | Color / Light | <code>multi/05</code> | identity |
| <code>--color-multi-06</code> | tokens.colors.json:multi.06 | Color / Light | <code>multi/06</code> | identity |
| <code>--color-multi-07</code> | tokens.colors.json:multi.07 | Color / Light | <code>multi/07</code> | identity |
| <code>--color-multi-08</code> | tokens.colors.json:multi.08 | Color / Light | <code>multi/08</code> | identity |
| <code>--color-multi-09</code> | tokens.colors.json:multi.09 | Color / Light | <code>multi/09</code> | identity |
| <code>--color-multi-10</code> | tokens.colors.json:multi.10 | Color / Light | <code>multi/10</code> | identity |
| <code>--color-multi-11</code> | tokens.colors.json:multi.11 | Color / Light | <code>multi/11</code> | identity |
| <code>--space-0</code> | tokens.spacing.json:space.0 | Spacing / Compact | <code>space/0</code> | identity |
| <code>--space-1</code> | tokens.spacing.json:space.1 | Spacing / Compact | <code>space/1</code> | identity |
| <code>--space-2</code> | tokens.spacing.json:space.2 | Spacing / Compact | <code>space/2</code> | identity |
| <code>--space-3</code> | tokens.spacing.json:space.3 | Spacing / Compact | <code>space/3</code> | identity |
| <code>--space-4</code> | tokens.spacing.json:space.4 | Spacing / Compact | <code>space/4</code> | identity |
| <code>--space-5</code> | tokens.spacing.json:space.5 | Spacing / Compact | <code>space/5</code> | identity |
| <code>--space-6</code> | tokens.spacing.json:space.6 | Spacing / Compact | <code>space/6</code> | identity |
| <code>--space-7</code> | tokens.spacing.json:space.7 | Spacing / Compact | <code>space/7</code> | identity |
| <code>--size-1</code> | tokens.size.json:size.1 | Size & Layout / Desktop | <code>size/04</code> | identity |
| <code>--size-2</code> | tokens.size.json:size.2 | Size & Layout / Desktop | <code>size/06</code> | identity |
| <code>--size-3</code> | tokens.size.json:size.3 | Size & Layout / Desktop | <code>size/08</code> | identity |
| <code>--size-4</code> | tokens.size.json:size.4 | Size & Layout / Desktop | <code>size/12</code> | identity |
| <code>--size-5</code> | tokens.size.json:size.5 | Size & Layout / Desktop | <code>size/16</code> | identity |
| <code>--size-6</code> | tokens.size.json:size.6 | Size & Layout / Desktop | <code>size/20</code> | identity |
| <code>--size-7</code> | tokens.size.json:size.7 | Size & Layout / Desktop | <code>size/24</code> | identity |
| <code>--size-8</code> | tokens.size.json:size.8 | Size & Layout / Desktop | <code>size/28</code> | identity |
| <code>--size-9</code> | tokens.size.json:size.9 | Size & Layout / Desktop | <code>size/32</code> | identity |
| <code>--size-10</code> | tokens.size.json:size.10 | Size & Layout / Desktop | <code>size/36</code> | identity |
| <code>--size-11</code> | tokens.size.json:size.11 | Size & Layout / Desktop | <code>size/40</code> | identity |
| <code>--size-12</code> | tokens.size.json:size.12 | Size & Layout / Desktop | <code>size/44</code> | identity |
| <code>--size-13</code> | tokens.size.json:size.13 | Size & Layout / Desktop | <code>size/48</code> | identity |
| <code>--size-14</code> | tokens.size.json:size.14 | Size & Layout / Desktop | <code>size/56</code> | identity |
| <code>--size-15</code> | tokens.size.json:size.15 | Size & Layout / Desktop | <code>size/64</code> | identity |
| <code>--size-16</code> | tokens.size.json:size.16 | Size & Layout / Desktop | <code>size/72</code> | identity |
| <code>--size-17</code> | tokens.size.json:size.17 | Size & Layout / Desktop | <code>size/80</code> | identity |
| <code>--icon-outline-stroke-width-16</code> | tokens.icon.json:lucide.project-stroke-width-by-display-size.16 | Size & Layout / Desktop | <code>icon/stroke/16</code> | identity |
| <code>--icon-outline-stroke-width-20</code> | tokens.icon.json:lucide.project-stroke-width-by-display-size.20 | Size & Layout / Desktop | <code>icon/stroke/20</code> | identity |
| <code>--icon-outline-stroke-width-24</code> | tokens.icon.json:lucide.project-stroke-width-by-display-size.24 | Size & Layout / Desktop | <code>icon/stroke/24</code> | identity |
| <code>--radius-0</code> | tokens.radius.json:radius.0 | Size & Layout / Desktop | <code>radius/0</code> | identity |
| <code>--radius-1</code> | tokens.radius.json:radius.1 | Size & Layout / Desktop | <code>radius/04</code> | identity |
| <code>--radius-2</code> | tokens.radius.json:radius.2 | Size & Layout / Desktop | <code>radius/06</code> | identity |
| <code>--radius-3</code> | tokens.radius.json:radius.3 | Size & Layout / Desktop | <code>radius/08</code> | identity |
| <code>--radius-4</code> | tokens.radius.json:radius.4 | Size & Layout / Desktop | <code>radius/12</code> | identity |
| <code>--radius-5</code> | tokens.radius.json:radius.5 | Size & Layout / Desktop | <code>radius/16</code> | identity |
| <code>--radius-full</code> | tokens.radius.json:radius.full | Size & Layout / Desktop | <code>radius/full</code> | identity |
| <code>--layout-navigation-divider-width</code> | tokens.layout.json:shell.navigation-divider-width | Size & Layout / Desktop | <code>layout/divider/0.5</code> | identity |
| <code>--layout-sidebar-width</code> | tokens.layout.json:shell.sidebar-width | Size & Layout / Desktop | <code>layout/width/240</code> | identity |
| <code>--layout-secondary-pane-width</code> | tokens.layout.json:shell.secondary-pane-width | Size & Layout / Desktop | <code>layout/width/360</code> | identity |
| <code>--width-dialog</code> | tokens.size.json:modal.dialog-width | Size & Layout / Desktop | <code>layout/width/400</code> | identity |
| <code>--width-modal-sm</code> | tokens.size.json:modal.width-s | Size & Layout / Desktop | <code>layout/width/480</code> | identity |
| <code>--width-modal-md</code> | tokens.size.json:modal.width-m | Size & Layout / Desktop | <code>layout/width/640</code> | identity |
| <code>--width-modal-lg</code> | tokens.size.json:modal.width-l | Size & Layout / Desktop | <code>layout/width/800</code> | identity |
| <code>--layout-window-min-width</code> | tokens.layout.json:window.min-width | Size & Layout / Desktop | <code>layout/width/1100</code> | identity |
| <code>--layout-frame-width</code> | tokens.layout.json:frame.width | Size & Layout / Desktop | <code>layout/width/1728</code> | identity |
| <code>--layout-window-min-height</code> | tokens.layout.json:window.min-height | Size & Layout / Desktop | <code>layout/height/720</code> | identity |
| <code>--layout-frame-height</code> | tokens.layout.json:frame.height | Size & Layout / Desktop | <code>layout/height/1152</code> | identity |
| <code>--opacity-40</code> | tokens.colors.json:semantic.state-disabled-opacity | Size & Layout / Desktop | <code>opacity/40</code> | pixso-percent-to-css-unit-interval |
| <code>--font-sans</code> | tokens.typography.json:font-family.sans | Typography / HarmonyOS Sans | <code>font/family/sans</code> | identity |
| <code>--font-size-10</code> | tokens.typography.json:font-size.10 | Typography / HarmonyOS Sans | <code>font/size/10</code> | identity |
| <code>--font-size-12</code> | tokens.typography.json:font-size.12 | Typography / HarmonyOS Sans | <code>font/size/12</code> | identity |
| <code>--font-size-14</code> | tokens.typography.json:font-size.14 | Typography / HarmonyOS Sans | <code>font/size/14</code> | identity |
| <code>--font-size-16</code> | tokens.typography.json:font-size.16 | Typography / HarmonyOS Sans | <code>font/size/16</code> | identity |
| <code>--font-size-18</code> | tokens.typography.json:font-size.18 | Typography / HarmonyOS Sans | <code>font/size/18</code> | identity |
| <code>--font-size-20</code> | tokens.typography.json:font-size.20 | Typography / HarmonyOS Sans | <code>font/size/20</code> | identity |
| <code>--font-size-24</code> | tokens.typography.json:font-size.24 | Typography / HarmonyOS Sans | <code>font/size/24</code> | identity |
| <code>--font-size-30</code> | tokens.typography.json:font-size.30 | Typography / HarmonyOS Sans | <code>font/size/30</code> | identity |
| <code>--font-size-38</code> | tokens.typography.json:font-size.38 | Typography / HarmonyOS Sans | <code>font/size/38</code> | identity |
| <code>--font-size-48</code> | tokens.typography.json:font-size.48 | Typography / HarmonyOS Sans | <code>font/size/48</code> | identity |
| <code>--font-size-56</code> | tokens.typography.json:font-size.56 | Typography / HarmonyOS Sans | <code>font/size/56</code> | identity |
| <code>--line-height-12</code> | tokens.typography.json:line-height.12 | Typography / HarmonyOS Sans | <code>font/line-height/12</code> | identity |
| <code>--line-height-14</code> | tokens.typography.json:line-height.14 | Typography / HarmonyOS Sans | <code>font/line-height/14</code> | identity |
| <code>--line-height-16</code> | tokens.typography.json:line-height.16 | Typography / HarmonyOS Sans | <code>font/line-height/16</code> | identity |
| <code>--line-height-20</code> | tokens.typography.json:line-height.20 | Typography / HarmonyOS Sans | <code>font/line-height/20</code> | identity |
| <code>--line-height-22</code> | tokens.typography.json:line-height.22 | Typography / HarmonyOS Sans | <code>font/line-height/22</code> | identity |
| <code>--line-height-24</code> | tokens.typography.json:line-height.24 | Typography / HarmonyOS Sans | <code>font/line-height/24</code> | identity |
| <code>--line-height-28</code> | tokens.typography.json:line-height.28 | Typography / HarmonyOS Sans | <code>font/line-height/28</code> | identity |
| <code>--line-height-36</code> | tokens.typography.json:line-height.36 | Typography / HarmonyOS Sans | <code>font/line-height/36</code> | identity |
| <code>--line-height-44</code> | tokens.typography.json:line-height.44 | Typography / HarmonyOS Sans | <code>font/line-height/44</code> | identity |
| <code>--line-height-58</code> | tokens.typography.json:line-height.58 | Typography / HarmonyOS Sans | <code>font/line-height/58</code> | identity |
| <code>--line-height-66</code> | tokens.typography.json:line-height.66 | Typography / HarmonyOS Sans | <code>font/line-height/66</code> | identity |
| <code>--font-weight-400</code> | tokens.typography.json:font-weight.400 | Typography / HarmonyOS Sans | <code>font/weight/400</code> | identity |
| <code>--font-weight-500</code> | tokens.typography.json:font-weight.500 | Typography / HarmonyOS Sans | <code>font/weight/500</code> | identity |
| <code>--font-weight-700</code> | tokens.typography.json:font-weight.700 | Typography / HarmonyOS Sans | <code>font/weight/700</code> | identity |
| <code>--letter-spacing-normal</code> | tokens.typography.json:letter-spacing.normal | Typography / HarmonyOS Sans | <code>font/letter-spacing/0</code> | identity |

## Semantic Token ↔ Pixso Variable

| Semantic role | HTML CSS Token | HTML source | Pixso Variable | Transform |
| --- | --- | --- | --- | --- |
| <code>action/primary/background</code> | <code>--color-brand-100</code> | tokens.colors.json:brand.100 | <code>brand/100</code> | identity |
| <code>color/text</code> | <code>--color-text</code> | tokens.colors.json:semantic.text | <code>neutral-dark/90</code> | identity |
| <code>color/text-muted</code> | <code>--color-text-muted</code> | tokens.colors.json:semantic.text-muted | <code>neutral-dark/60</code> | identity |
| <code>color/text-subtle</code> | <code>--color-text-subtle</code> | tokens.colors.json:semantic.text-subtle | <code>neutral-dark/40</code> | identity |
| <code>color/text-inverse</code> | <code>--color-text-inverse</code> | tokens.colors.json:semantic.text-inverse | <code>neutral-light/100</code> | identity |
| <code>color/surface</code> | <code>--color-surface</code> | tokens.colors.json:semantic.surface | <code>neutral-light/100</code> | identity |
| <code>color/surface-muted</code> | <code>--color-surface-muted</code> | tokens.colors.json:semantic.surface-muted | <code>neutral-dark/05</code> | identity |
| <code>color/sidebar-selected</code> | <code>--color-sidebar-selected</code> | tokens.colors.json:semantic.sidebar-selected | <code>brand/10</code> | identity |
| <code>color/state-layer-hover</code> | <code>--state-layer-hover</code> | tokens.colors.json:semantic.state-layer-hover | <code>neutral-dark/05</code> | identity |
| <code>color/state-layer-pressed</code> | <code>--state-layer-pressed</code> | tokens.colors.json:semantic.state-layer-pressed | <code>neutral-dark/10</code> | identity |
| <code>spacing/gap/button-icon-label</code> | <code>--gap-button-icon-label</code> | tokens.spacing.json:gap.button-icon-label | <code>space/3</code> | identity |
| <code>spacing/gap/button-group</code> | <code>--gap-button-group</code> | tokens.spacing.json:gap.button-group | <code>space/3</code> | identity |
| <code>spacing/gap/field-label</code> | <code>--gap-field-label</code> | tokens.spacing.json:gap.field-label | <code>space/3</code> | identity |
| <code>spacing/gap/form-field</code> | <code>--gap-form-field</code> | tokens.spacing.json:gap.form-field | <code>space/5</code> | identity |
| <code>spacing/padding/button-x</code> | <code>--padding-button-x</code> | tokens.spacing.json:padding.button-x | <code>space/5</code> | identity |
| <code>spacing/padding/card</code> | <code>--padding-card</code> | tokens.spacing.json:padding.card | <code>space/6</code> | identity |
| <code>spacing/padding/table</code> | <code>--padding-table</code> | tokens.spacing.json:padding.table | <code>space/6</code> | identity |
| <code>size/component/button-height</code> | <code>--height-button</code> | tokens.size.json:component.button-height | <code>size/40</code> | identity |
| <code>size/icon/sm</code> | <code>--icon-size-sm</code> | tokens.size.json:icon.sm | <code>size/16</code> | identity |
| <code>size/icon/md</code> | <code>--icon-size-md</code> | tokens.size.json:icon.md | <code>size/20</code> | identity |
| <code>size/icon/lg</code> | <code>--icon-size-lg</code> | tokens.size.json:icon.lg | <code>size/24</code> | identity |
| <code>radius/button</code> | <code>--radius-button</code> | tokens.radius.json:semantic.button | <code>radius/08</code> | identity |
| <code>radius/card</code> | <code>--radius-card</code> | tokens.radius.json:semantic.card | <code>radius/12</code> | identity |
| <code>layout/frame-width</code> | <code>--layout-frame-width</code> | tokens.layout.json:frame.width | <code>layout/width/1728</code> | identity |
| <code>layout/frame-height</code> | <code>--layout-frame-height</code> | tokens.layout.json:frame.height | <code>layout/height/1152</code> | identity |
| <code>layout/sidebar-expanded</code> | <code>--layout-sidebar-width</code> | tokens.layout.json:shell.sidebar-width | <code>layout/width/240</code> | identity |
| <code>layout/sidebar-width-collapsed</code> | <code>--layout-sidebar-width-collapsed</code> | tokens.layout.json:shell.sidebar-width-collapsed | <code>size/64</code> | identity |
| <code>layout/secondary-pane</code> | <code>--layout-secondary-pane-width</code> | tokens.layout.json:shell.secondary-pane-width | <code>layout/width/360</code> | identity |
| <code>layout/navigation-divider</code> | <code>--layout-navigation-divider-width</code> | tokens.layout.json:shell.navigation-divider-width | <code>layout/divider/0.5</code> | identity |
| <code>opacity/disabled</code> | <code>--state-disabled-opacity</code> | tokens.colors.json:semantic.state-disabled-opacity | <code>opacity/40</code> | pixso-percent-to-css-unit-interval |
| <code>opacity/window-unfocus</code> | <code>--state-window-unfocus-opacity</code> | tokens.colors.json:semantic.state-disabled-opacity | <code>opacity/40</code> | pixso-percent-to-css-unit-interval |
| <code>color/bg</code> | <code>--color-bg</code> | tokens.colors.json:semantic.bg | <code>neutral-light/100</code> | identity |
| <code>color/bg-subtle</code> | <code>--color-bg-subtle</code> | tokens.colors.json:semantic.bg-subtle | <code>neutral-dark/05</code> | identity |
| <code>color/surface-raised</code> | <code>--color-surface-raised</code> | tokens.colors.json:semantic.surface-raised | <code>neutral-light/100</code> | identity |
| <code>color/overlay</code> | <code>--color-overlay</code> | tokens.colors.json:semantic.overlay | <code>neutral-dark/40</code> | identity |
| <code>color/secondary</code> | <code>--color-secondary</code> | tokens.colors.json:semantic.secondary | <code>neutral-dark/05</code> | identity |
| <code>color/secondary-hover</code> | <code>--color-secondary-hover</code> | tokens.colors.json:semantic.secondary-hover | <code>neutral-dark/10</code> | identity |
| <code>color/button-ghost-hover-bg</code> | <code>--color-button-ghost-hover-bg</code> | tokens.colors.json:semantic.button-ghost-hover-bg | <code>neutral-dark/05</code> | identity |
| <code>color/button-ghost-text</code> | <code>--color-button-ghost-text</code> | tokens.colors.json:semantic.button-ghost-text | <code>brand/100</code> | identity |
| <code>color/button-danger-text</code> | <code>--color-button-danger-text</code> | tokens.colors.json:semantic.button-danger-text | <code>function/danger/100</code> | identity |
| <code>color/icon-text-button-ghost-hover-bg</code> | <code>--color-icon-text-button-ghost-hover-bg</code> | tokens.colors.json:semantic.icon-text-button-ghost-hover-bg | <code>neutral-dark/05</code> | identity |
| <code>color/icon-text-button-ghost-content</code> | <code>--color-icon-text-button-ghost-content</code> | tokens.colors.json:semantic.icon-text-button-ghost-content | <code>neutral-dark/90</code> | identity |
| <code>color/accent</code> | <code>--color-accent</code> | tokens.colors.json:semantic.accent | <code>brand/100</code> | identity |
| <code>color/sidebar-bg</code> | <code>--color-sidebar-bg</code> | tokens.colors.json:semantic.sidebar-bg | <code>neutral-dark/05</code> | identity |
| <code>color/sidebar-accent</code> | <code>--color-sidebar-accent</code> | tokens.colors.json:semantic.sidebar-accent | <code>neutral-dark/05</code> | identity |
| <code>color/sidebar-accent-text</code> | <code>--color-sidebar-accent-text</code> | tokens.colors.json:semantic.sidebar-accent-text | <code>brand/100</code> | identity |
| <code>color/sidebar-selected-text</code> | <code>--color-sidebar-selected-text</code> | tokens.colors.json:semantic.sidebar-selected-text | <code>brand/100</code> | identity |
| <code>color/tab-list-bg</code> | <code>--color-tab-list-bg</code> | tokens.colors.json:semantic.tab-list-bg | <code>neutral-dark/05</code> | identity |
| <code>color/tab-text</code> | <code>--color-tab-text</code> | tokens.colors.json:semantic.tab-text | <code>neutral-dark/60</code> | identity |
| <code>color/tab-hover-bg</code> | <code>--color-tab-hover-bg</code> | tokens.colors.json:semantic.tab-hover-bg | <code>neutral-dark/10</code> | identity |
| <code>color/tab-selected-bg</code> | <code>--color-tab-selected-bg</code> | tokens.colors.json:semantic.tab-selected-bg | <code>neutral-light/100</code> | identity |
| <code>color/tab-selected-text</code> | <code>--color-tab-selected-text</code> | tokens.colors.json:semantic.tab-selected-text | <code>neutral-dark/90</code> | identity |
| <code>color/tooltip-bg</code> | <code>--color-tooltip-bg</code> | tokens.colors.json:semantic.tooltip-bg | <code>neutral-light/100</code> | identity |
| <code>color/tooltip-text</code> | <code>--color-tooltip-text</code> | tokens.colors.json:semantic.tooltip-text | <code>neutral-dark/90</code> | identity |
| <code>color/input-bg</code> | <code>--color-input-bg</code> | tokens.colors.json:semantic.input-bg | <code>neutral-dark/05</code> | identity |
| <code>color/input-bg-on-default</code> | <code>--color-input-bg-on-default</code> | tokens.colors.json:semantic.input-bg-on-default | <code>neutral-dark/05</code> | identity |
| <code>color/input-hover-bg</code> | <code>--color-input-hover-bg</code> | tokens.colors.json:semantic.input-hover-bg | <code>neutral-dark/10</code> | identity |
| <code>color/input-hover-bg-on-default</code> | <code>--color-input-hover-bg-on-default</code> | tokens.colors.json:semantic.input-hover-bg-on-default | <code>neutral-dark/10</code> | identity |
| <code>color/input-focus-bg</code> | <code>--color-input-focus-bg</code> | tokens.colors.json:semantic.input-focus-bg | <code>neutral-dark/05</code> | identity |
| <code>color/input-focus-bg-on-default</code> | <code>--color-input-focus-bg-on-default</code> | tokens.colors.json:semantic.input-focus-bg-on-default | <code>neutral-dark/05</code> | identity |
| <code>color/input-error-bg</code> | <code>--color-input-error-bg</code> | tokens.colors.json:semantic.input-error-bg | <code>neutral-dark/05</code> | identity |
| <code>color/input-error-bg-on-default</code> | <code>--color-input-error-bg-on-default</code> | tokens.colors.json:semantic.input-error-bg-on-default | <code>neutral-dark/05</code> | identity |
| <code>color/input-bg-on-subtle</code> | <code>--color-input-bg-on-subtle</code> | tokens.colors.json:semantic.input-bg-on-subtle | <code>neutral-light/100</code> | identity |
| <code>color/input-hover-border-on-subtle</code> | <code>--color-input-hover-border-on-subtle</code> | tokens.colors.json:semantic.input-hover-border-on-subtle | <code>neutral-light/100</code> | identity |
| <code>color/input-focus-bg-on-subtle</code> | <code>--color-input-focus-bg-on-subtle</code> | tokens.colors.json:semantic.input-focus-bg-on-subtle | <code>neutral-light/100</code> | identity |
| <code>color/input-error-bg-on-subtle</code> | <code>--color-input-error-bg-on-subtle</code> | tokens.colors.json:semantic.input-error-bg-on-subtle | <code>neutral-light/100</code> | identity |
| <code>color/input-error-border</code> | <code>--color-input-error-border</code> | tokens.colors.json:semantic.input-error-border | <code>function/danger/100</code> | identity |
| <code>color/text-brand</code> | <code>--color-text-brand</code> | tokens.colors.json:semantic.text-brand | <code>brand/100</code> | identity |
| <code>color/link</code> | <code>--color-link</code> | tokens.colors.json:semantic.link | <code>neutral-dark/100</code> | identity |
| <code>color/icon</code> | <code>--color-icon</code> | tokens.colors.json:semantic.icon | <code>neutral-dark/90</code> | identity |
| <code>color/icon-muted</code> | <code>--color-icon-muted</code> | tokens.colors.json:semantic.icon-muted | <code>neutral-dark/60</code> | identity |
| <code>color/icon-subtle</code> | <code>--color-icon-subtle</code> | tokens.colors.json:semantic.icon-subtle | <code>neutral-dark/40</code> | identity |
| <code>color/icon-inverse</code> | <code>--color-icon-inverse</code> | tokens.colors.json:semantic.icon-inverse | <code>neutral-light/100</code> | identity |
| <code>color/border</code> | <code>--color-border</code> | tokens.colors.json:semantic.border | <code>neutral-dark/10</code> | identity |
| <code>color/divider</code> | <code>--color-divider</code> | tokens.colors.json:semantic.divider | <code>neutral-dark/20</code> | identity |
| <code>color/focus-ring</code> | <code>--color-focus-ring</code> | tokens.colors.json:semantic.focus-ring | <code>brand/100</code> | identity |
| <code>color/primary</code> | <code>--color-primary</code> | tokens.colors.json:semantic.primary | <code>brand/100</code> | identity |
| <code>color/primary-text</code> | <code>--color-primary-text</code> | tokens.colors.json:semantic.primary-text | <code>neutral-light/100</code> | identity |
| <code>color/success</code> | <code>--color-success</code> | tokens.colors.json:semantic.success | <code>function/success/100</code> | identity |
| <code>color/success-subtle</code> | <code>--color-success-subtle</code> | tokens.colors.json:semantic.success-subtle | <code>function/success/10</code> | identity |
| <code>color/warning</code> | <code>--color-warning</code> | tokens.colors.json:semantic.warning | <code>function/warning/100</code> | identity |
| <code>color/warning-subtle</code> | <code>--color-warning-subtle</code> | tokens.colors.json:semantic.warning-subtle | <code>function/warning/10</code> | identity |
| <code>color/danger</code> | <code>--color-danger</code> | tokens.colors.json:semantic.danger | <code>function/danger/100</code> | identity |
| <code>color/danger-subtle</code> | <code>--color-danger-subtle</code> | tokens.colors.json:semantic.danger-subtle | <code>function/danger/10</code> | identity |
| <code>color/info</code> | <code>--color-info</code> | tokens.colors.json:semantic.info | <code>brand/100</code> | identity |
| <code>color/info-subtle</code> | <code>--color-info-subtle</code> | tokens.colors.json:semantic.info-subtle | <code>brand/10</code> | identity |
| <code>color/alert-neutral-subtle</code> | <code>--color-alert-neutral-subtle</code> | tokens.colors.json:semantic.alert-neutral-subtle | <code>neutral-dark/05</code> | identity |
| <code>color/badge-neutral-bg</code> | <code>--color-badge-neutral-bg</code> | tokens.colors.json:semantic.badge-neutral-bg | <code>neutral-dark/10</code> | identity |
| <code>color/badge-info-bg</code> | <code>--color-badge-info-bg</code> | tokens.colors.json:semantic.badge-info-bg | <code>brand/10</code> | identity |
| <code>color/badge-success-text</code> | <code>--color-badge-success-text</code> | tokens.colors.json:semantic.badge-success-text | <code>function/success/100</code> | identity |
| <code>color/badge-success-bg</code> | <code>--color-badge-success-bg</code> | tokens.colors.json:semantic.badge-success-bg | <code>function/success/10</code> | identity |
| <code>color/badge-warning-text</code> | <code>--color-badge-warning-text</code> | tokens.colors.json:semantic.badge-warning-text | <code>function/warning/100</code> | identity |
| <code>color/badge-warning-bg</code> | <code>--color-badge-warning-bg</code> | tokens.colors.json:semantic.badge-warning-bg | <code>function/warning/10</code> | identity |
| <code>color/badge-danger-text</code> | <code>--color-badge-danger-text</code> | tokens.colors.json:semantic.badge-danger-text | <code>function/danger/100</code> | identity |
| <code>color/badge-danger-bg</code> | <code>--color-badge-danger-bg</code> | tokens.colors.json:semantic.badge-danger-bg | <code>function/danger/10</code> | identity |
| <code>color/chart-1</code> | <code>--color-chart-1</code> | tokens.colors.json:semantic.chart-1 | <code>multi/01</code> | identity |
| <code>color/chart-2</code> | <code>--color-chart-2</code> | tokens.colors.json:semantic.chart-2 | <code>multi/02</code> | identity |
| <code>color/chart-3</code> | <code>--color-chart-3</code> | tokens.colors.json:semantic.chart-3 | <code>multi/03</code> | identity |
| <code>color/chart-4</code> | <code>--color-chart-4</code> | tokens.colors.json:semantic.chart-4 | <code>multi/04</code> | identity |
| <code>color/chart-5</code> | <code>--color-chart-5</code> | tokens.colors.json:semantic.chart-5 | <code>multi/05</code> | identity |
| <code>color/state-layer-selected</code> | <code>--state-layer-selected</code> | tokens.colors.json:semantic.state-layer-selected | <code>neutral-dark/10</code> | identity |
| <code>color/state-layer-focus</code> | <code>--state-layer-focus</code> | tokens.colors.json:semantic.state-layer-focus | <code>brand/10</code> | identity |
| <code>spacing/gap/list-item</code> | <code>--gap-list-item</code> | tokens.spacing.json:gap.list-item | <code>space/1</code> | identity |
| <code>spacing/gap/selection-option</code> | <code>--gap-selection-option</code> | tokens.spacing.json:gap.selection-option | <code>space/1</code> | identity |
| <code>spacing/gap/tabs-list</code> | <code>--gap-tabs-list</code> | tokens.spacing.json:gap.tabs-list | <code>space/1</code> | identity |
| <code>spacing/gap/menu-item</code> | <code>--gap-menu-item</code> | tokens.spacing.json:gap.menu-item | <code>space/1</code> | identity |
| <code>spacing/gap/nav-item</code> | <code>--gap-nav-item</code> | tokens.spacing.json:gap.nav-item | <code>space/1</code> | identity |
| <code>spacing/gap/menu-item-content</code> | <code>--gap-menu-item-content</code> | tokens.spacing.json:gap.menu-item-content | <code>space/3</code> | identity |
| <code>spacing/gap/breadcrumb-item</code> | <code>--gap-breadcrumb-item</code> | tokens.spacing.json:gap.breadcrumb-item | <code>space/3</code> | identity |
| <code>spacing/gap/subtab-item</code> | <code>--gap-subtab-item</code> | tokens.spacing.json:gap.subtab-item | <code>space/3</code> | identity |
| <code>spacing/gap/alert-content</code> | <code>--gap-alert-content</code> | tokens.spacing.json:gap.alert-content | <code>space/3</code> | identity |
| <code>spacing/gap/choice-label</code> | <code>--gap-choice-label</code> | tokens.spacing.json:gap.choice-label | <code>space/3</code> | identity |
| <code>spacing/gap/titlebar-brand</code> | <code>--gap-titlebar-brand</code> | tokens.spacing.json:gap.titlebar-brand | <code>space/4</code> | identity |
| <code>spacing/gap/cross-group-control</code> | <code>--gap-cross-group-control</code> | tokens.spacing.json:gap.cross-group-control | <code>space/5</code> | identity |
| <code>spacing/gap/menu-section</code> | <code>--gap-menu-section</code> | tokens.spacing.json:gap.menu-section | <code>space/6</code> | identity |
| <code>spacing/gap/page-section</code> | <code>--gap-page-section</code> | tokens.spacing.json:gap.page-section | <code>space/7</code> | identity |
| <code>spacing/padding/segmented-control</code> | <code>--padding-segmented-control</code> | tokens.spacing.json:padding.segmented-control | <code>space/1</code> | identity |
| <code>spacing/padding/popup-menu</code> | <code>--padding-popup-menu</code> | tokens.spacing.json:padding.popup-menu | <code>space/2</code> | identity |
| <code>spacing/padding/list-card</code> | <code>--padding-list-card</code> | tokens.spacing.json:padding.list-card | <code>space/2</code> | identity |
| <code>spacing/padding/tooltip</code> | <code>--padding-tooltip</code> | tokens.spacing.json:padding.tooltip | <code>space/3</code> | identity |
| <code>spacing/padding/alert</code> | <code>--padding-alert</code> | tokens.spacing.json:padding.alert | <code>space/3</code> | identity |
| <code>spacing/padding/alert-left</code> | <code>--padding-alert-left</code> | tokens.spacing.json:padding.alert-left | <code>space/3</code> | identity |
| <code>spacing/padding/alert-right</code> | <code>--padding-alert-right</code> | tokens.spacing.json:padding.alert-right | <code>space/2</code> | identity |
| <code>spacing/padding/selection-option</code> | <code>--padding-selection-option</code> | tokens.spacing.json:padding.selection-option | <code>space/3</code> | identity |
| <code>spacing/padding/tab-x</code> | <code>--padding-tab-x</code> | tokens.spacing.json:padding.tab-x | <code>space/4</code> | identity |
| <code>spacing/padding/tab-panel</code> | <code>--padding-tab-panel</code> | tokens.spacing.json:padding.tab-panel | <code>space/5</code> | identity |
| <code>spacing/padding/titlebar-leading</code> | <code>--padding-titlebar-leading</code> | tokens.spacing.json:padding.titlebar-leading | <code>space/6</code> | identity |
| <code>spacing/padding/titlebar-trailing-s</code> | <code>--padding-titlebar-trailing-s</code> | tokens.spacing.json:padding.titlebar-trailing-s | <code>space/0</code> | identity |
| <code>spacing/padding/titlebar-trailing-m</code> | <code>--padding-titlebar-trailing-m</code> | tokens.spacing.json:padding.titlebar-trailing-m | <code>space/3</code> | identity |
| <code>spacing/padding/titlebar-trailing-l</code> | <code>--padding-titlebar-trailing-l</code> | tokens.spacing.json:padding.titlebar-trailing-l | <code>space/4</code> | identity |
| <code>spacing/padding/titlebar-trailing-xl</code> | <code>--padding-titlebar-trailing-xl</code> | tokens.spacing.json:padding.titlebar-trailing-xl | <code>space/5</code> | identity |
| <code>spacing/padding/button-sm-x</code> | <code>--padding-button-sm-x</code> | tokens.spacing.json:padding.button-sm-x | <code>space/3</code> | identity |
| <code>spacing/padding/split-button-main-x</code> | <code>--padding-split-button-main-x</code> | tokens.spacing.json:padding.split-button-main-x | <code>space/3</code> | identity |
| <code>spacing/padding/split-button-trigger</code> | <code>--padding-split-button-trigger</code> | tokens.spacing.json:padding.split-button-trigger | <code>space/0</code> | identity |
| <code>spacing/padding/list</code> | <code>--padding-list</code> | tokens.spacing.json:padding.list | <code>space/3</code> | identity |
| <code>spacing/padding/tag-x</code> | <code>--padding-tag-x</code> | tokens.spacing.json:padding.tag-x | <code>space/4</code> | identity |
| <code>spacing/padding/select-x</code> | <code>--padding-select-x</code> | tokens.spacing.json:padding.select-x | <code>space/4</code> | identity |
| <code>spacing/padding/textarea-x</code> | <code>--padding-textarea-x</code> | tokens.spacing.json:padding.textarea-x | <code>space/4</code> | identity |
| <code>spacing/padding/textarea-y</code> | <code>--padding-textarea-y</code> | tokens.spacing.json:padding.textarea-y | <code>space/3</code> | identity |
| <code>spacing/padding/search-x</code> | <code>--padding-search-x</code> | tokens.spacing.json:padding.search-x | <code>space/4</code> | identity |
| <code>spacing/padding/menu-item-x</code> | <code>--padding-menu-item-x</code> | tokens.spacing.json:padding.menu-item-x | <code>space/4</code> | identity |
| <code>spacing/padding/dialog</code> | <code>--padding-dialog</code> | tokens.spacing.json:padding.dialog | <code>space/6</code> | identity |
| <code>spacing/padding/dialog-content</code> | <code>--padding-dialog-content</code> | tokens.spacing.json:padding.dialog-content | <code>space/6</code> | identity |
| <code>spacing/padding/modal-content-x</code> | <code>--padding-modal-content-x</code> | tokens.spacing.json:padding.modal-content-x | <code>space/6</code> | identity |
| <code>spacing/padding/modal-content-y</code> | <code>--padding-modal-content-y</code> | tokens.spacing.json:padding.modal-content-y | <code>space/0</code> | identity |
| <code>spacing/padding/modal-header-top</code> | <code>--padding-modal-header-top</code> | tokens.spacing.json:padding.modal-header-top | <code>space/3</code> | identity |
| <code>spacing/padding/modal-header-x</code> | <code>--padding-modal-header-x</code> | tokens.spacing.json:padding.modal-header-x | <code>space/6</code> | identity |
| <code>spacing/padding/modal-footer-x</code> | <code>--padding-modal-footer-x</code> | tokens.spacing.json:padding.modal-footer-x | <code>space/6</code> | identity |
| <code>size/icon/xs</code> | <code>--icon-size-xs</code> | tokens.size.json:icon.xs | <code>size/12</code> | identity |
| <code>size/indicator/notification-dot-sm</code> | <code>--notification-dot-sm</code> | tokens.size.json:indicator.notification-dot-sm | <code>size/06</code> | identity |
| <code>size/indicator/notification-badge-size</code> | <code>--notification-badge-size</code> | tokens.size.json:indicator.notification-badge-size | <code>size/16</code> | identity |
| <code>size/indicator/checkbox-size</code> | <code>--checkbox-size</code> | tokens.size.json:indicator.checkbox-size | <code>size/20</code> | identity |
| <code>size/indicator/radio-size</code> | <code>--radio-size</code> | tokens.size.json:indicator.radio-size | <code>size/20</code> | identity |
| <code>size/indicator/switch-height</code> | <code>--switch-height</code> | tokens.size.json:indicator.switch-height | <code>size/20</code> | identity |
| <code>size/indicator/switch-width</code> | <code>--switch-width</code> | tokens.size.json:indicator.switch-width | <code>size/40</code> | identity |
| <code>size/indicator/badge-height</code> | <code>--height-badge</code> | tokens.size.json:indicator.badge-height | <code>size/24</code> | identity |
| <code>size/indicator/progress-height</code> | <code>--height-progress</code> | tokens.size.json:indicator.progress-height | <code>size/08</code> | identity |
| <code>size/indicator/avatar-sm-size</code> | <code>--size-avatar-sm</code> | tokens.size.json:indicator.avatar-sm-size | <code>size/32</code> | identity |
| <code>size/indicator/avatar-md-size</code> | <code>--size-avatar-md</code> | tokens.size.json:indicator.avatar-md-size | <code>size/40</code> | identity |
| <code>size/component/button-sm-height</code> | <code>--height-button-sm</code> | tokens.size.json:component.button-sm-height | <code>size/28</code> | identity |
| <code>size/component/input-sm-height</code> | <code>--height-input-sm</code> | tokens.size.json:component.input-sm-height | <code>size/28</code> | identity |
| <code>size/component/select-sm-height</code> | <code>--height-select-sm</code> | tokens.size.json:component.select-sm-height | <code>size/28</code> | identity |
| <code>size/component/search-sm-height</code> | <code>--height-search-sm</code> | tokens.size.json:component.search-sm-height | <code>size/28</code> | identity |
| <code>size/component/tag-height</code> | <code>--height-tag</code> | tokens.size.json:component.tag-height | <code>size/28</code> | identity |
| <code>size/component/selection-option-height</code> | <code>--height-selection-option</code> | tokens.size.json:component.selection-option-height | <code>size/28</code> | identity |
| <code>size/component/selection-block-height</code> | <code>--height-selection-block</code> | tokens.size.json:component.selection-block-height | <code>size/32</code> | identity |
| <code>size/component/chips-tab-height</code> | <code>--height-chips-tab</code> | tokens.size.json:component.chips-tab-height | <code>size/36</code> | identity |
| <code>size/component/tab-line-height</code> | <code>--height-tab-line</code> | tokens.size.json:component.tab-line-height | <code>size/40</code> | identity |
| <code>size/component/tab-vertical-height</code> | <code>--height-tab-vertical</code> | tokens.size.json:component.tab-vertical-height | <code>size/40</code> | identity |
| <code>size/component/menu-item-height</code> | <code>--height-menu-item</code> | tokens.size.json:component.menu-item-height | <code>size/40</code> | identity |
| <code>size/component/list-item-height</code> | <code>--height-list-item</code> | tokens.size.json:component.list-item-height | <code>size/40</code> | identity |
| <code>size/component/list-item-single-line-height</code> | <code>--height-list-item-single-line</code> | tokens.size.json:component.list-item-single-line-height | <code>size/48</code> | identity |
| <code>size/component/list-item-double-line-height</code> | <code>--height-list-item-double-line</code> | tokens.size.json:component.list-item-double-line-height | <code>size/56</code> | identity |
| <code>size/component/list-item-triple-line-height</code> | <code>--height-list-item-triple-line</code> | tokens.size.json:component.list-item-triple-line-height | <code>size/80</code> | identity |
| <code>size/component/list-heading-height</code> | <code>--height-list-heading</code> | tokens.size.json:component.list-heading-height | <code>size/40</code> | identity |
| <code>size/component/tree-item-height</code> | <code>--height-tree-item</code> | tokens.size.json:component.tree-item-height | <code>size/40</code> | identity |
| <code>size/component/icon-button-size</code> | <code>--size-icon-button</code> | tokens.size.json:component.icon-button-size | <code>size/40</code> | identity |
| <code>size/component/icon-text-button-height</code> | <code>--height-icon-text-button</code> | tokens.size.json:component.icon-text-button-height | <code>size/40</code> | identity |
| <code>size/component/dropdown-control-height</code> | <code>--height-dropdown-control</code> | tokens.size.json:component.dropdown-control-height | <code>size/40</code> | identity |
| <code>size/component/split-button-trigger-width</code> | <code>--width-split-button-trigger</code> | tokens.size.json:component.split-button-trigger-width | <code>size/16</code> | identity |
| <code>size/component/select-height</code> | <code>--height-select</code> | tokens.size.json:component.select-height | <code>size/40</code> | identity |
| <code>size/component/search-height</code> | <code>--height-search</code> | tokens.size.json:component.search-height | <code>size/40</code> | identity |
| <code>size/component/input-height</code> | <code>--height-input</code> | tokens.size.json:component.input-height | <code>size/40</code> | identity |
| <code>size/component/textarea-min-height</code> | <code>--min-height-textarea</code> | tokens.size.json:component.textarea-min-height | <code>size/80</code> | identity |
| <code>size/component/alert-height</code> | <code>--height-alert</code> | tokens.size.json:component.alert-height | <code>size/40</code> | identity |
| <code>size/component/alert-min-height</code> | <code>--min-height-alert</code> | tokens.size.json:component.alert-min-height | <code>size/40</code> | identity |
| <code>size/component/snackbar-height</code> | <code>--height-snackbar</code> | tokens.size.json:component.snackbar-height | <code>size/48</code> | identity |
| <code>size/component/pagination-item-height</code> | <code>--height-pagination-item</code> | tokens.size.json:component.pagination-item-height | <code>size/32</code> | identity |
| <code>size/component/table-header-height</code> | <code>--height-table-header</code> | tokens.size.json:component.table-header-height | <code>size/40</code> | identity |
| <code>size/component/table-row-height</code> | <code>--height-table-row</code> | tokens.size.json:component.table-row-height | <code>size/48</code> | identity |
| <code>size/component/titlebar-sm-height</code> | <code>--height-titlebar-sm</code> | tokens.size.json:component.titlebar-sm-height | <code>size/40</code> | identity |
| <code>size/component/titlebar-md-height</code> | <code>--height-titlebar-md</code> | tokens.size.json:component.titlebar-md-height | <code>size/56</code> | identity |
| <code>size/component/titlebar-lg-height</code> | <code>--height-titlebar-lg</code> | tokens.size.json:component.titlebar-lg-height | <code>size/64</code> | identity |
| <code>size/component/titlebar-xl-height</code> | <code>--height-titlebar-xl</code> | tokens.size.json:component.titlebar-xl-height | <code>size/72</code> | identity |
| <code>size/component/dialog-header-height</code> | <code>--height-dialog-header</code> | tokens.size.json:component.dialog-header-height | <code>size/56</code> | identity |
| <code>size/component/modal-header-height</code> | <code>--height-modal-header</code> | tokens.size.json:component.modal-header-height | <code>size/56</code> | identity |
| <code>size/component/modal-footer-height</code> | <code>--height-modal-footer</code> | tokens.size.json:component.modal-footer-height | <code>size/80</code> | identity |
| <code>size/modal/width-s</code> | <code>--width-modal-sm</code> | tokens.size.json:modal.width-s | <code>layout/width/480</code> | identity |
| <code>size/modal/width-m</code> | <code>--width-modal-md</code> | tokens.size.json:modal.width-m | <code>layout/width/640</code> | identity |
| <code>size/modal/width-l</code> | <code>--width-modal-lg</code> | tokens.size.json:modal.width-l | <code>layout/width/800</code> | identity |
| <code>size/modal/dialog-width</code> | <code>--width-dialog</code> | tokens.size.json:modal.dialog-width | <code>layout/width/400</code> | identity |
| <code>radius/popup-menu-item</code> | <code>--radius-popup-menu-item</code> | tokens.radius.json:semantic.popup-menu-item | <code>radius/04</code> | identity |
| <code>radius/checkbox</code> | <code>--radius-checkbox</code> | tokens.radius.json:semantic.checkbox | <code>radius/04</code> | identity |
| <code>radius/subtab</code> | <code>--radius-subtab</code> | tokens.radius.json:semantic.subtab | <code>radius/08</code> | identity |
| <code>radius/sidebar-nav-item</code> | <code>--radius-sidebar-nav-item</code> | tokens.radius.json:semantic.sidebar-nav-item | <code>radius/08</code> | identity |
| <code>radius/icon-text-button</code> | <code>--radius-icon-text-button</code> | tokens.radius.json:semantic.icon-text-button | <code>radius/08</code> | identity |
| <code>radius/icon-button</code> | <code>--radius-icon-button</code> | tokens.radius.json:semantic.icon-button | <code>radius/08</code> | identity |
| <code>radius/status-button</code> | <code>--radius-status-button</code> | tokens.radius.json:semantic.status-button | <code>radius/08</code> | identity |
| <code>radius/dropdown-button</code> | <code>--radius-dropdown-button</code> | tokens.radius.json:semantic.dropdown-button | <code>radius/08</code> | identity |
| <code>radius/alert</code> | <code>--radius-alert</code> | tokens.radius.json:semantic.alert | <code>radius/08</code> | identity |
| <code>radius/select</code> | <code>--radius-select</code> | tokens.radius.json:semantic.select | <code>radius/08</code> | identity |
| <code>radius/input</code> | <code>--radius-input</code> | tokens.radius.json:semantic.input | <code>radius/08</code> | identity |
| <code>radius/textarea</code> | <code>--radius-textarea</code> | tokens.radius.json:semantic.textarea | <code>radius/08</code> | identity |
| <code>radius/tooltip</code> | <code>--radius-tooltip</code> | tokens.radius.json:semantic.tooltip | <code>radius/06</code> | identity |
| <code>radius/search</code> | <code>--radius-search</code> | tokens.radius.json:semantic.search | <code>radius/08</code> | identity |
| <code>radius/number-input</code> | <code>--radius-number-input</code> | tokens.radius.json:semantic.number-input | <code>radius/08</code> | identity |
| <code>radius/tag</code> | <code>--radius-tag</code> | tokens.radius.json:semantic.tag | <code>radius/08</code> | identity |
| <code>radius/selection-block</code> | <code>--radius-selection-block</code> | tokens.radius.json:semantic.selection-block | <code>radius/08</code> | identity |
| <code>radius/selection-option</code> | <code>--radius-selection-option</code> | tokens.radius.json:semantic.selection-option | <code>radius/06</code> | identity |
| <code>radius/tab</code> | <code>--radius-tab</code> | tokens.radius.json:semantic.tab | <code>radius/08</code> | identity |
| <code>radius/list</code> | <code>--radius-list</code> | tokens.radius.json:semantic.list | <code>radius/12</code> | identity |
| <code>radius/list-item</code> | <code>--radius-list-item</code> | tokens.radius.json:semantic.list-item | <code>radius/08</code> | identity |
| <code>radius/badge</code> | <code>--radius-badge</code> | tokens.radius.json:semantic.badge | <code>radius/full</code> | identity |
| <code>radius/progress</code> | <code>--radius-progress</code> | tokens.radius.json:semantic.progress | <code>radius/full</code> | identity |
| <code>radius/avatar</code> | <code>--radius-avatar</code> | tokens.radius.json:semantic.avatar | <code>radius/full</code> | identity |
| <code>radius/table</code> | <code>--radius-table</code> | tokens.radius.json:semantic.table | <code>radius/12</code> | identity |
| <code>radius/pagination-item</code> | <code>--radius-pagination-item</code> | tokens.radius.json:semantic.pagination-item | <code>radius/08</code> | identity |
| <code>radius/dialog</code> | <code>--radius-dialog</code> | tokens.radius.json:semantic.dialog | <code>radius/16</code> | identity |
| <code>radius/modal</code> | <code>--radius-modal</code> | tokens.radius.json:semantic.modal | <code>radius/16</code> | identity |
| <code>layout/window-min-width</code> | <code>--layout-window-min-width</code> | tokens.layout.json:window.min-width | <code>layout/width/1100</code> | identity |
| <code>layout/window-min-height</code> | <code>--layout-window-min-height</code> | tokens.layout.json:window.min-height | <code>layout/height/720</code> | identity |
| <code>layout/titlebar-height</code> | <code>--layout-titlebar-height</code> | tokens.layout.json:shell.titlebar-height | <code>size/64</code> | identity |
| <code>layout/sidebar-width-wide</code> | <code>--layout-sidebar-width-wide</code> | tokens.layout.json:shell.sidebar-width-wide | <code>layout/width/360</code> | identity |
| <code>layout/spacing/main-content-padding-x</code> | <code>--layout-main-content-padding-x</code> | tokens.layout.json:spacing.main-content-padding-x | <code>space/6</code> | identity |
| <code>layout/spacing/main-content-padding-top</code> | <code>--layout-main-content-padding-top</code> | tokens.layout.json:spacing.main-content-padding-top | <code>space/5</code> | identity |
| <code>layout/spacing/main-content-padding-bottom</code> | <code>--layout-main-content-padding-bottom</code> | tokens.layout.json:spacing.main-content-padding-bottom | <code>space/0</code> | identity |
| <code>layout/spacing/header-padding-x</code> | <code>--layout-header-padding-x</code> | tokens.layout.json:spacing.header-padding-x | <code>space/6</code> | identity |
| <code>layout/spacing/main-title-leading-padding</code> | <code>--layout-main-title-leading-padding</code> | tokens.layout.json:spacing.main-title-leading-padding | <code>space/6</code> | identity |
| <code>layout/spacing/main-detail-action-leading-padding</code> | <code>--layout-main-detail-action-leading-padding</code> | tokens.layout.json:spacing.main-detail-action-leading-padding | <code>space/5</code> | identity |
| <code>layout/spacing/sidebar-padding-x</code> | <code>--layout-sidebar-padding-x</code> | tokens.layout.json:spacing.sidebar-padding-x | <code>space/5</code> | identity |
| <code>layout/spacing/sidebar-padding-y</code> | <code>--layout-sidebar-padding-y</code> | tokens.layout.json:spacing.sidebar-padding-y | <code>space/5</code> | identity |
| <code>layout/spacing/primary-action-slot-gap-top</code> | <code>--layout-primary-action-slot-gap-top</code> | tokens.layout.json:spacing.primary-action-slot-gap-top | <code>space/3</code> | identity |
| <code>layout/spacing/primary-action-slot-gap-bottom</code> | <code>--layout-primary-action-slot-gap-bottom</code> | tokens.layout.json:spacing.primary-action-slot-gap-bottom | <code>space/4</code> | identity |
| <code>layout/spacing/secondary-list-card-inset-x</code> | <code>--layout-secondary-list-card-inset-x</code> | tokens.layout.json:spacing.secondary-list-card-inset-x | <code>space/5</code> | identity |
| <code>layout/spacing/secondary-list-card-padding-x</code> | <code>--layout-secondary-list-card-padding-x</code> | tokens.layout.json:spacing.secondary-list-card-padding-x | <code>space/3</code> | identity |
| <code>layout/spacing/secondary-content-axis-x</code> | <code>--layout-secondary-content-axis-x</code> | tokens.layout.json:spacing.secondary-content-axis-x | <code>space/6</code> | identity |
| <code>layout/spacing/secondary-pane-padding-x</code> | <code>--layout-secondary-pane-padding-x</code> | tokens.layout.json:spacing.secondary-pane-padding-x | <code>space/5</code> | identity |
| <code>layout/spacing/secondary-pane-padding-y</code> | <code>--layout-secondary-pane-padding-y</code> | tokens.layout.json:spacing.secondary-pane-padding-y | <code>space/3</code> | identity |
| <code>layout/spacing/main-detail-padding-x</code> | <code>--layout-main-detail-padding-x</code> | tokens.layout.json:spacing.main-detail-padding-x | <code>space/6</code> | identity |
| <code>layout/spacing/main-detail-padding-top</code> | <code>--layout-main-detail-padding-top</code> | tokens.layout.json:spacing.main-detail-padding-top | <code>space/5</code> | identity |
| <code>layout/spacing/main-detail-padding-bottom</code> | <code>--layout-main-detail-padding-bottom</code> | tokens.layout.json:spacing.main-detail-padding-bottom | <code>space/0</code> | identity |
| <code>typography/display-l/font-size</code> | <code>--type-display-l-size</code> | tokens.typography.json:font-size.56 | <code>font/size/56</code> | identity |
| <code>typography/display-l/line-height</code> | <code>--type-display-l-leading</code> | tokens.typography.json:line-height.66 | <code>font/line-height/66</code> | identity |
| <code>typography/display-l/font-weight</code> | <code>--type-display-l-weight</code> | tokens.typography.json:font-weight.400 | <code>font/weight/400</code> | identity |
| <code>typography/display-m/font-size</code> | <code>--type-display-m-size</code> | tokens.typography.json:font-size.48 | <code>font/size/48</code> | identity |
| <code>typography/display-m/line-height</code> | <code>--type-display-m-leading</code> | tokens.typography.json:line-height.58 | <code>font/line-height/58</code> | identity |
| <code>typography/display-m/font-weight</code> | <code>--type-display-m-weight</code> | tokens.typography.json:font-weight.400 | <code>font/weight/400</code> | identity |
| <code>typography/display-s/font-size</code> | <code>--type-display-s-size</code> | tokens.typography.json:font-size.38 | <code>font/size/38</code> | identity |
| <code>typography/display-s/line-height</code> | <code>--type-display-s-leading</code> | tokens.typography.json:line-height.44 | <code>font/line-height/44</code> | identity |
| <code>typography/display-s/font-weight</code> | <code>--type-display-s-weight</code> | tokens.typography.json:font-weight.400 | <code>font/weight/400</code> | identity |
| <code>typography/title-l/font-size</code> | <code>--type-title-l-size</code> | tokens.typography.json:font-size.30 | <code>font/size/30</code> | identity |
| <code>typography/title-l/line-height</code> | <code>--type-title-l-leading</code> | tokens.typography.json:line-height.36 | <code>font/line-height/36</code> | identity |
| <code>typography/title-l/font-weight</code> | <code>--type-title-l-weight</code> | tokens.typography.json:font-weight.700 | <code>font/weight/700</code> | identity |
| <code>typography/title-m/font-size</code> | <code>--type-title-m-size</code> | tokens.typography.json:font-size.24 | <code>font/size/24</code> | identity |
| <code>typography/title-m/line-height</code> | <code>--type-title-m-leading</code> | tokens.typography.json:line-height.28 | <code>font/line-height/28</code> | identity |
| <code>typography/title-m/font-weight</code> | <code>--type-title-m-weight</code> | tokens.typography.json:font-weight.700 | <code>font/weight/700</code> | identity |
| <code>typography/title-s/font-size</code> | <code>--type-title-s-size</code> | tokens.typography.json:font-size.20 | <code>font/size/20</code> | identity |
| <code>typography/title-s/line-height</code> | <code>--type-title-s-leading</code> | tokens.typography.json:line-height.24 | <code>font/line-height/24</code> | identity |
| <code>typography/title-s/font-weight</code> | <code>--type-title-s-weight</code> | tokens.typography.json:font-weight.700 | <code>font/weight/700</code> | identity |
| <code>typography/subtitle-l/font-size</code> | <code>--type-subtitle-l-size</code> | tokens.typography.json:font-size.18 | <code>font/size/18</code> | identity |
| <code>typography/subtitle-l/line-height</code> | <code>--type-subtitle-l-leading</code> | tokens.typography.json:line-height.22 | <code>font/line-height/22</code> | identity |
| <code>typography/subtitle-l/font-weight</code> | <code>--type-subtitle-l-weight</code> | tokens.typography.json:font-weight.500 | <code>font/weight/500</code> | identity |
| <code>typography/subtitle-m/font-size</code> | <code>--type-subtitle-m-size</code> | tokens.typography.json:font-size.16 | <code>font/size/16</code> | identity |
| <code>typography/subtitle-m/line-height</code> | <code>--type-subtitle-m-leading</code> | tokens.typography.json:line-height.20 | <code>font/line-height/20</code> | identity |
| <code>typography/subtitle-m/font-weight</code> | <code>--type-subtitle-m-weight</code> | tokens.typography.json:font-weight.500 | <code>font/weight/500</code> | identity |
| <code>typography/subtitle-s/font-size</code> | <code>--type-subtitle-s-size</code> | tokens.typography.json:font-size.14 | <code>font/size/14</code> | identity |
| <code>typography/subtitle-s/line-height</code> | <code>--type-subtitle-s-leading</code> | tokens.typography.json:line-height.16 | <code>font/line-height/16</code> | identity |
| <code>typography/subtitle-s/font-weight</code> | <code>--type-subtitle-s-weight</code> | tokens.typography.json:font-weight.500 | <code>font/weight/500</code> | identity |
| <code>typography/body-l/font-size</code> | <code>--type-body-l-size</code> | tokens.typography.json:font-size.16 | <code>font/size/16</code> | identity |
| <code>typography/body-l/line-height</code> | <code>--type-body-l-leading</code> | tokens.typography.json:line-height.20 | <code>font/line-height/20</code> | identity |
| <code>typography/body-l/font-weight</code> | <code>--type-body-l-weight</code> | tokens.typography.json:font-weight.400 | <code>font/weight/400</code> | identity |
| <code>typography/body-m/font-size</code> | <code>--type-body-m-size</code> | tokens.typography.json:font-size.14 | <code>font/size/14</code> | identity |
| <code>typography/body-m/line-height</code> | <code>--type-body-m-leading</code> | tokens.typography.json:line-height.16 | <code>font/line-height/16</code> | identity |
| <code>typography/body-m/font-weight</code> | <code>--type-body-m-weight</code> | tokens.typography.json:font-weight.400 | <code>font/weight/400</code> | identity |
| <code>typography/body-s/font-size</code> | <code>--type-body-s-size</code> | tokens.typography.json:font-size.12 | <code>font/size/12</code> | identity |
| <code>typography/body-s/line-height</code> | <code>--type-body-s-leading</code> | tokens.typography.json:line-height.14 | <code>font/line-height/14</code> | identity |
| <code>typography/body-s/font-weight</code> | <code>--type-body-s-weight</code> | tokens.typography.json:font-weight.400 | <code>font/weight/400</code> | identity |
| <code>typography/caption-m/font-size</code> | <code>--type-caption-m-size</code> | tokens.typography.json:font-size.10 | <code>font/size/10</code> | identity |
| <code>typography/caption-m/line-height</code> | <code>--type-caption-m-leading</code> | tokens.typography.json:line-height.12 | <code>font/line-height/12</code> | identity |
| <code>typography/caption-m/font-weight</code> | <code>--type-caption-m-weight</code> | tokens.typography.json:font-weight.400 | <code>font/weight/400</code> | identity |

## Runtime-only Semantic Role Aliases

这些角色只服务于运行时语义解析，不重复进入 dual-output 渲染映射；仍在中心 registry 中维护。

| Runtime role | HTML CSS Token | HTML source | Pixso Variable | Transform |
| --- | --- | --- | --- | --- |
| <code>content/primary</code> | <code>--color-text</code> | tokens.colors.json:neutral-dark.90 | <code>neutral-dark/90</code> | identity |
| <code>content/secondary</code> | <code>--color-text-muted</code> | tokens.colors.json:neutral-dark.60 | <code>neutral-dark/60</code> | identity |
| <code>content/tertiary</code> | <code>--color-text-subtle</code> | tokens.colors.json:neutral-dark.40 | <code>neutral-dark/40</code> | identity |
| <code>content/inverse</code> | <code>--color-text-inverse</code> | tokens.colors.json:neutral-light.100 | <code>neutral-light/100</code> | identity |
| <code>surface/default</code> | <code>--color-surface</code> | tokens.colors.json:neutral-light.100 | <code>neutral-light/100</code> | identity |
| <code>surface/subtle</code> | <code>--color-surface-muted</code> | tokens.colors.json:neutral-dark.05 | <code>neutral-dark/05</code> | identity |
| <code>state/selected</code> | <code>--color-sidebar-selected</code> | tokens.colors.json:brand.10 | <code>brand/10</code> | identity |
| <code>state/hover</code> | <code>--state-layer-hover</code> | tokens.colors.json:neutral-dark.05 | <code>neutral-dark/05</code> | identity |
| <code>state/pressed</code> | <code>--state-layer-pressed</code> | tokens.colors.json:neutral-dark.10 | <code>neutral-dark/10</code> | identity |
| <code>spacing/button-icon-label</code> | <code>--gap-button-icon-label</code> | tokens.spacing.json:space.3 | <code>space/3</code> | identity |
| <code>spacing/button-group</code> | <code>--gap-button-group</code> | tokens.spacing.json:space.3 | <code>space/3</code> | identity |
| <code>spacing/field-label</code> | <code>--gap-field-label</code> | tokens.spacing.json:space.3 | <code>space/3</code> | identity |
| <code>spacing/form-field</code> | <code>--gap-form-field</code> | tokens.spacing.json:space.5 | <code>space/5</code> | identity |
| <code>spacing/button-padding-x</code> | <code>--padding-button-x</code> | tokens.spacing.json:space.5 | <code>space/5</code> | identity |
| <code>spacing/card-padding</code> | <code>--padding-card</code> | tokens.spacing.json:space.6 | <code>space/6</code> | identity |
| <code>spacing/table-padding</code> | <code>--padding-table</code> | tokens.spacing.json:space.6 | <code>space/6</code> | identity |
| <code>size/control</code> | <code>--height-button</code> | tokens.size.json:size.11 | <code>size/40</code> | identity |
| <code>size/icon-sm</code> | <code>--icon-size-sm</code> | tokens.size.json:size.5 | <code>size/16</code> | identity |
| <code>size/icon-md</code> | <code>--icon-size-md</code> | tokens.size.json:size.6 | <code>size/20</code> | identity |
| <code>size/icon-lg</code> | <code>--icon-size-lg</code> | tokens.size.json:size.7 | <code>size/24</code> | identity |
| <code>radius/control</code> | <code>--radius-button</code> | tokens.radius.json:radius.3 | <code>radius/08</code> | identity |
| <code>layout/sidebar-collapsed</code> | <code>--layout-sidebar-width-collapsed</code> | tokens.size.json:size.15 | <code>size/64</code> | identity |
| <code>layout/sidebar-width</code> | <code>--layout-sidebar-width</code> | tokens.layout.json:shell.sidebar-width | <code>layout/width/240</code> | identity |
| <code>layout/secondary-pane-width</code> | <code>--layout-secondary-pane-width</code> | tokens.layout.json:shell.secondary-pane-width | <code>layout/width/360</code> | identity |
| <code>layout/navigation-divider-width</code> | <code>--layout-navigation-divider-width</code> | tokens.layout.json:shell.navigation-divider-width | <code>layout/divider/0.5</code> | identity |

## Semantic Color

| Semantic role | HTML CSS Token(s) | Pixso Variable(s) | Composition |
| --- | --- | --- | --- |
| <code>bg</code> | <code>--color-bg</code> | <code>neutral-light/100</code> | single |
| <code>bg-subtle</code> | <code>--color-bg-subtle</code> | <code>neutral-dark/05</code> | single |
| <code>surface</code> | <code>--color-surface</code> | <code>neutral-light/100</code> | single |
| <code>surface-raised</code> | <code>--color-surface-raised</code> | <code>neutral-light/100</code> | single |
| <code>surface-muted</code> | <code>--color-surface-muted</code> | <code>neutral-dark/05</code> | single |
| <code>titlebar-normal-bg</code> | <code>--color-titlebar-normal-bg</code> | — | single |
| <code>titlebar-unfocus-bg</code> | <code>--color-titlebar-unfocus-bg</code> | — | single |
| <code>overlay</code> | <code>--color-overlay</code> | <code>neutral-dark/40</code> | single |
| <code>dialog-bg</code> | <code>--color-dialog-bg</code> | <code>neutral-light/100</code> | single |
| <code>modal-bg-white</code> | <code>--color-modal-bg-white</code> | <code>neutral-light/100</code> | single |
| <code>modal-bg-gray</code> | <code>--color-modal-bg-gray</code> | <code>neutral-dark/05</code> | single |
| <code>secondary</code> | <code>--color-secondary</code> | <code>neutral-dark/05</code> | single |
| <code>secondary-hover</code> | <code>--color-secondary-hover</code> | <code>neutral-dark/10</code> | single |
| <code>button-secondary-bg</code> | <code>--color-button-secondary-bg</code> | <code>neutral-dark/05</code> | single |
| <code>button-secondary-hover-bg</code> | <code>--color-button-secondary-hover-bg</code> | <code>neutral-dark/10</code> | single |
| <code>button-secondary-text</code> | <code>--color-button-secondary-text</code> | <code>neutral-dark/90</code> | single |
| <code>button-ghost-bg</code> | <code>--color-button-ghost-bg</code> | — | single |
| <code>button-ghost-hover-bg</code> | <code>--color-button-ghost-hover-bg</code> | <code>neutral-dark/05</code> | single |
| <code>button-ghost-text</code> | <code>--color-button-ghost-text</code> | <code>brand/100</code> | single |
| <code>button-danger-bg</code> | <code>--color-button-danger-bg</code> | <code>neutral-dark/05</code> | single |
| <code>button-danger-hover-bg</code> | <code>--color-button-danger-hover-bg</code> | <code>neutral-dark/10</code> | single |
| <code>button-danger-text</code> | <code>--color-button-danger-text</code> | <code>function/danger/100</code> | single |
| <code>icon-text-button-ghost-bg</code> | <code>--color-icon-text-button-ghost-bg</code> | — | single |
| <code>icon-text-button-ghost-hover-bg</code> | <code>--color-icon-text-button-ghost-hover-bg</code> | <code>neutral-dark/05</code> | single |
| <code>icon-text-button-ghost-content</code> | <code>--color-icon-text-button-ghost-content</code> | <code>neutral-dark/90</code> | single |
| <code>accent</code> | <code>--color-accent</code> | <code>brand/100</code> | single |
| <code>accent-hover</code> | <code>--color-accent-hover</code><br><code>--color-accent-hover-layer</code> | <code>brand/100</code><br><code>neutral-dark/05</code> | layered |
| <code>sidebar-bg</code> | <code>--color-sidebar-bg</code> | <code>neutral-dark/05</code> | single |
| <code>sidebar-accent</code> | <code>--color-sidebar-accent</code> | <code>neutral-dark/05</code> | single |
| <code>sidebar-accent-text</code> | <code>--color-sidebar-accent-text</code> | <code>brand/100</code> | single |
| <code>sidebar-selected</code> | <code>--color-sidebar-selected</code> | <code>brand/10</code> | single |
| <code>sidebar-selected-text</code> | <code>--color-sidebar-selected-text</code> | <code>brand/100</code> | single |
| <code>tab-list-bg</code> | <code>--color-tab-list-bg</code> | <code>neutral-dark/05</code> | single |
| <code>tab-text</code> | <code>--color-tab-text</code> | <code>neutral-dark/60</code> | single |
| <code>tab-hover-bg</code> | <code>--color-tab-hover-bg</code> | <code>neutral-dark/10</code> | single |
| <code>tab-selected-bg</code> | <code>--color-tab-selected-bg</code> | <code>neutral-light/100</code> | single |
| <code>tab-selected-text</code> | <code>--color-tab-selected-text</code> | <code>neutral-dark/90</code> | single |
| <code>tooltip-bg</code> | <code>--color-tooltip-bg</code> | <code>neutral-light/100</code> | single |
| <code>tooltip-text</code> | <code>--color-tooltip-text</code> | <code>neutral-dark/90</code> | single |
| <code>input-bg</code> | <code>--color-input-bg</code> | <code>neutral-dark/05</code> | single |
| <code>input-border</code> | <code>--color-input-border</code> | — | single |
| <code>input-bg-on-default</code> | <code>--color-input-bg-on-default</code> | <code>neutral-dark/05</code> | single |
| <code>input-hover-bg</code> | <code>--color-input-hover-bg</code> | <code>neutral-dark/10</code> | single |
| <code>input-hover-bg-on-default</code> | <code>--color-input-hover-bg-on-default</code> | <code>neutral-dark/10</code> | single |
| <code>input-focus-bg</code> | <code>--color-input-focus-bg</code> | <code>neutral-dark/05</code> | single |
| <code>input-focus-bg-on-default</code> | <code>--color-input-focus-bg-on-default</code> | <code>neutral-dark/05</code> | single |
| <code>input-error-bg</code> | <code>--color-input-error-bg</code> | <code>neutral-dark/05</code> | single |
| <code>input-error-bg-on-default</code> | <code>--color-input-error-bg-on-default</code> | <code>neutral-dark/05</code> | single |
| <code>input-bg-on-subtle</code> | <code>--color-input-bg-on-subtle</code> | <code>neutral-light/100</code> | single |
| <code>input-hover-bg-on-subtle</code> | <code>--color-input-hover-bg-on-subtle</code><br><code>--color-input-hover-bg-on-subtle-layer</code> | <code>neutral-light/100</code><br><code>neutral-dark/05</code> | layered |
| <code>input-hover-border-on-subtle</code> | <code>--color-input-hover-border-on-subtle</code> | <code>neutral-light/100</code> | single |
| <code>input-focus-bg-on-subtle</code> | <code>--color-input-focus-bg-on-subtle</code> | <code>neutral-light/100</code> | single |
| <code>input-error-bg-on-subtle</code> | <code>--color-input-error-bg-on-subtle</code> | <code>neutral-light/100</code> | single |
| <code>input-error-border</code> | <code>--color-input-error-border</code> | <code>function/danger/100</code> | single |
| <code>text</code> | <code>--color-text</code> | <code>neutral-dark/90</code> | single |
| <code>text-muted</code> | <code>--color-text-muted</code> | <code>neutral-dark/60</code> | single |
| <code>text-subtle</code> | <code>--color-text-subtle</code> | <code>neutral-dark/40</code> | single |
| <code>text-inverse</code> | <code>--color-text-inverse</code> | <code>neutral-light/100</code> | single |
| <code>text-brand</code> | <code>--color-text-brand</code> | <code>brand/100</code> | single |
| <code>link</code> | <code>--color-link</code> | <code>neutral-dark/100</code> | single |
| <code>icon</code> | <code>--color-icon</code> | <code>neutral-dark/90</code> | single |
| <code>icon-muted</code> | <code>--color-icon-muted</code> | <code>neutral-dark/60</code> | single |
| <code>primary-level-unselected</code> | <code>--color-primary-level-unselected</code> | <code>neutral-dark/40</code> | single |
| <code>icon-subtle</code> | <code>--color-icon-subtle</code> | <code>neutral-dark/40</code> | single |
| <code>icon-inverse</code> | <code>--color-icon-inverse</code> | <code>neutral-light/100</code> | single |
| <code>border</code> | <code>--color-border</code> | <code>neutral-dark/10</code> | single |
| <code>divider</code> | <code>--color-divider</code> | <code>neutral-dark/20</code> | single |
| <code>focus-ring</code> | <code>--color-focus-ring</code> | <code>brand/100</code> | single |
| <code>primary</code> | <code>--color-primary</code> | <code>brand/100</code> | single |
| <code>primary-text</code> | <code>--color-primary-text</code> | <code>neutral-light/100</code> | single |
| <code>success</code> | <code>--color-success</code> | <code>function/success/100</code> | single |
| <code>success-subtle</code> | <code>--color-success-subtle</code> | <code>function/success/10</code> | single |
| <code>warning</code> | <code>--color-warning</code> | <code>function/warning/100</code> | single |
| <code>warning-subtle</code> | <code>--color-warning-subtle</code> | <code>function/warning/10</code> | single |
| <code>danger</code> | <code>--color-danger</code> | <code>function/danger/100</code> | single |
| <code>danger-subtle</code> | <code>--color-danger-subtle</code> | <code>function/danger/10</code> | single |
| <code>info</code> | <code>--color-info</code> | <code>brand/100</code> | single |
| <code>info-subtle</code> | <code>--color-info-subtle</code> | <code>brand/10</code> | single |
| <code>alert-neutral</code> | <code>--color-alert-neutral</code> | <code>neutral-dark/60</code> | single |
| <code>alert-neutral-subtle</code> | <code>--color-alert-neutral-subtle</code> | <code>neutral-dark/05</code> | single |
| <code>badge-neutral-text</code> | <code>--color-badge-neutral-text</code> | <code>neutral-dark/60</code> | single |
| <code>badge-neutral-bg</code> | <code>--color-badge-neutral-bg</code> | <code>neutral-dark/10</code> | single |
| <code>badge-info-text</code> | <code>--color-badge-info-text</code> | <code>brand/100</code> | single |
| <code>badge-info-bg</code> | <code>--color-badge-info-bg</code> | <code>brand/10</code> | single |
| <code>badge-success-text</code> | <code>--color-badge-success-text</code> | <code>function/success/100</code> | single |
| <code>badge-success-bg</code> | <code>--color-badge-success-bg</code> | <code>function/success/10</code> | single |
| <code>badge-warning-text</code> | <code>--color-badge-warning-text</code> | <code>function/warning/100</code> | single |
| <code>badge-warning-bg</code> | <code>--color-badge-warning-bg</code> | <code>function/warning/10</code> | single |
| <code>badge-danger-text</code> | <code>--color-badge-danger-text</code> | <code>function/danger/100</code> | single |
| <code>badge-danger-bg</code> | <code>--color-badge-danger-bg</code> | <code>function/danger/10</code> | single |
| <code>chart-1</code> | <code>--color-chart-1</code> | <code>multi/01</code> | single |
| <code>chart-2</code> | <code>--color-chart-2</code> | <code>multi/02</code> | single |
| <code>chart-3</code> | <code>--color-chart-3</code> | <code>multi/03</code> | single |
| <code>chart-4</code> | <code>--color-chart-4</code> | <code>multi/04</code> | single |
| <code>chart-5</code> | <code>--color-chart-5</code> | <code>multi/05</code> | single |
| <code>state-layer-hover</code> | <code>--state-layer-hover</code> | <code>neutral-dark/05</code> | single |
| <code>state-layer-pressed</code> | <code>--state-layer-pressed</code> | <code>neutral-dark/10</code> | single |
| <code>state-layer-selected</code> | <code>--state-layer-selected</code> | <code>neutral-dark/10</code> | single |
| <code>state-layer-focus</code> | <code>--state-layer-focus</code> | <code>brand/10</code> | single |

## HTML Token ↔ Pixso Style

标准 Typography role 直接引用 Pixso Text Style，例如 `body-l` → `Typography/Body_L`；字号、行高、字重和字体变量是基础定义/校验层。只有没有匹配正式 Text Style 的非标准计算值才使用属性级回退。样式必须存在于当前 Pixso 文件，并通过 live readback 确认绑定。

| 类型 | HTML Token | HTML CSS | Pixso Style | 参数 / 用途 |
| --- | --- | --- | --- | --- |
| text | <code>display-l</code> | <code>--type-display-l</code> | <code>Typography/Display_L</code> | 56px / 66px / 400 |
| text | <code>display-m</code> | <code>--type-display-m</code> | <code>Typography/Display_M</code> | 48px / 58px / 400 |
| text | <code>display-s</code> | <code>--type-display-s</code> | <code>Typography/Display_S</code> | 38px / 44px / 400 |
| text | <code>title-l</code> | <code>--type-title-l</code> | <code>Typography/Title_L</code> | 30px / 36px / 700 |
| text | <code>title-m</code> | <code>--type-title-m</code> | <code>Typography/Title_M</code> | 24px / 28px / 700 |
| text | <code>title-s</code> | <code>--type-title-s</code> | <code>Typography/Title_S</code> | 20px / 24px / 700 |
| text | <code>subtitle-l</code> | <code>--type-subtitle-l</code> | <code>Typography/Subtitle_L</code> | 18px / 22px / 500 |
| text | <code>subtitle-m</code> | <code>--type-subtitle-m</code> | <code>Typography/Subtitle_M</code> | 16px / 20px / 500 |
| text | <code>subtitle-s</code> | <code>--type-subtitle-s</code> | <code>Typography/Subtitle_S</code> | 14px / 16px / 500 |
| text | <code>body-l</code> | <code>--type-body-l</code> | <code>Typography/Body_L</code> | 16px / 20px / 400 |
| text | <code>body-m</code> | <code>--type-body-m</code> | <code>Typography/Body_M</code> | 14px / 16px / 400 |
| text | <code>body-s</code> | <code>--type-body-s</code> | <code>Typography/Body_S</code> | 12px / 14px / 400 |
| text | <code>caption-m</code> | <code>--type-caption-m</code> | <code>Typography/Caption_M</code> | 10px / 12px / 400 |
| effect | <code>shadow-1</code> | <code>--shadow-1</code> | <code>Effect/Foundation/shadow-1</code> | Snackbar and Tooltip only |
| effect | <code>shadow-2</code> | <code>--shadow-2</code> | <code>Effect/Foundation/shadow-2</code> | Popover, Hover Card, and Dropdown Menu only |
| effect | <code>shadow-3</code> | <code>--shadow-3</code> | <code>Effect/Foundation/shadow-3</code> | Context Menu only |
| effect | <code>shadow-4</code> | <code>--shadow-4</code> | <code>Effect/Foundation/shadow-4</code> | Dialog and Alert Dialog only |
| effect | <code>shadow-5</code> | <code>--shadow-5</code> | <code>Effect/Foundation/shadow-5</code> | Semi-modal only |
| effect | <code>shadow-6</code> | <code>--shadow-6</code> | <code>Effect/Foundation/shadow-6</code> | unassigned; do not use in public page design |

## HTML Component ↔ Pixso Component

当前 Pixso 组件事实与 Text-to-UI 规格是两层数据：`pixsoTarget` 使用当前 Pixso Component Set/COMPONENT 的 exact name，`pixsoSpecKey` 使用 Text-to-UI 视觉规格键。只有 target status 为 `registered` 的行才是正式目标；同族候选不自动绑定。

### 当前 Pixso 组件清单（事实快照）

来源：Pixso Plugin API read-only component facts; Variant 轴来自 variantProperties；几何来自当前 COMPONENT；采集时间：2026-09-02T13:27:17.539Z；目标页：<code>NewComponents</code>。
当前快照包含 21 个业务组件、3 个辅助 Component Set；Pixso 回读总数还包含支持性图标等对象，它们不自动进入业务组件映射。

| Pixso exact name | Pixso object | 分类 | Variant 轴 | HTML 映射 |
| --- | --- | --- | --- | --- |
| <code>.Dialog_Container</code> | Component Set | business | quantity=1_normal / 2_emphasize / 2_normal / 3_emphasize_port | 未建立 HTML 映射（待确认） |
| <code>.Dialog_title</code> | Component Set | business | 属性 1=.Titl1e / .Title | 未建立 HTML 映射（待确认） |
| <code>Button</code> | Component Set | business | size=Medium / Small；state=Default / Disable / Hover / Pressed；type=Danger / Ghost / Primary / Secondary | <code>Button/Primary/Default</code> |
| <code>CheckBox</code> | Component Set | business | checked=false / true；state=Default / Disabled / Hover | <code>Checkbox/Default</code> |
| <code>Chips</code> | Component Set | business | 状态=Default / Disabled / Hover / Pressed | <code>Chips/Default</code> |
| <code>control button</code> | Component Set | business | 状态=Normal size / Small size | 已关联内部子映射：<code>Titlebar/Default · actions/window-controls</code> |
| <code>Dialog-2in1</code> | Component Set | business | 属性 1=1button / content / title+2 button / title+2lines / title+3 button / title+single line | <code>Dialog/Default</code> |
| <code>Icon Button</code> | Component Set | business | size=Medium；state=Default / Disable / Hover / Pressed；type=Ghost | HTML 正式映射：<code>icon → Icon Button/Ghost/Default</code> |
| <code>icon-text</code> | Component Set | business | size=Medium；state=Default / Disable / Hover / Pressed；type=ghost / primary / secondary | HTML 正式映射：<code>icon-text-primary → Icon Text Button/Primary/Default</code><br><code>icon-text-secondary → Icon Text Button/Secondary/Default</code><br><code>icon-text-ghost → Icon Text Button/Ghost/Default</code> |
| <code>Input</code> | Component Set | business | state=Actived / Default / Disable / Error / Hover / Typing；surface=bg-white / gb-gray | <code>Input/White Surface/Default</code> |
| <code>Menu-2in1</code> | Component Set | business | quantity=1 / 2 / 3 / 4 | <code>Menubar/Default</code> |
| <code>Radio</code> | Component Set | business | checked=false / true；state=Default / Disabled / Hover | <code>Radio/Unselected/Default</code> |
| <code>Search</code> | Component Set | business | state=Actived / Default / Hover / Output / Pressed / Typing；surface=bg-white / gb-gray | <code>Search/White Surface/Default</code> |
| <code>Selection Dropdown</code> | Component Set | business | size=Medium / small；state=Default / Disabled / Hover / Pressed | HTML 正式映射：<code>selection-dropdown → Selection Dropdown/Default</code> |
| <code>Sidebar Item</code> | Component Set | business | state=default / selected / 变体2 | <code>Sidebar Item/Default</code> |
| <code>Snackbar</code> | Component Set | business | 左侧区域=1 / 2 | <code>Snackbar/Default</code> |
| <code>split-dropdown</code> | Component Set | business | state=Default / Disable / Hover-left / Hover-right / Pressed-left / Pressed-right；type=ghost / icon | HTML 正式映射：<code>split-dropdown → Split Dropdown Button/Icon Text/Default</code><br><code>split-dropdown-icon → Split Dropdown Button/Icon Only/Default</code> |
| <code>Switch</code> | Component Set | business | checked=false / true；state=Default / Disabled / Hover / pressed | <code>Switch/Default</code> |
| <code>Textarea</code> | Component Set | business | state=Default；surface=bg-white / gb-gray | <code>Textarea/Default</code> |
| <code>.Arrow-down</code> | COMPONENT | helper | — | Dialog 内部依赖 |
| <code>.search</code> | COMPONENT | helper | — | Dialog 内部依赖 |
| <code>.single line</code> | COMPONENT | helper | — | Dialog 内部依赖 |
| <code>ColorPicker-Tablet</code> | COMPONENT | business | — | <code>ColorPicker/Tablet</code> |
| <code>Selection Dropdown/.icon</code> | COMPONENT | business | — | 未建立 HTML 映射（待确认） |


### 正式映射

| Runtime component ID (optional) | HTML logicalName | Renderer / contract | Pixso exact component | Text-to-UI spec key | Pixso Variant | Mapping status | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| <code>—</code> | <code>Chips/Default</code> | <code>chips</code> | <code>Chips</code> | <code>Chips/Default</code> | {"状态":"Default"} | mapped-pending-verification | — |
| <code>—</code> | <code>Dialog/Default</code> | <code>dialog</code> | <code>Dialog-2in1</code> | <code>Dialog/Default</code> | {"titlebar":"title-only","actions":"one-button"} | mapped-pending-verification | — |
| <code>—</code> | <code>Snackbar/Default</code> | <code>snackbar</code> | <code>Snackbar</code> | <code>Snackbar/Default</code> | {"左侧区域":"1"} | mapped-pending-verification | — |
| <code>menubar</code> | <code>Menubar/Default</code> | <code>menubar</code> | <code>Menu-2in1</code> | <code>Menubar/Default</code> | {"quantity":"1"} | mapped-pending-verification | HTML menubar 组件契约的默认运行时 ID；Pixso Menu-2in1 以 quantity=1 作为默认菜单项数量。 |
| <code>button</code> | <code>Button/Primary/Default</code> | <code>button</code> | <code>Button</code> | <code>Button/Primary/Default</code> | {"type":"Primary","size":"Medium","state":"Default"} | mapped-pending-verification | HTML button 组件契约的默认运行时 ID；对应 Pixso Button/Primary/Default。 |
| <code>checkbox</code> | <code>Checkbox/Default</code> | <code>checkbox</code> | <code>CheckBox</code> | <code>Checkbox/Unchecked/Default</code> | {"checked":"false","state":"Default"} | mapped-pending-verification | HTML checkbox 组件契约的默认运行时 ID；checked=false 对应未选中。 |
| <code>radio</code> | <code>Radio/Unselected/Default</code> | <code>radio</code> | <code>Radio</code> | <code>Radio/Unselected/Default</code> | {"checked":"false","state":"Default"} | mapped-pending-verification | HTML radio 组件契约的默认运行时 ID；checked=false 对应未选中。 |
| <code>input</code> | <code>Input/White Surface/Default</code> | <code>input</code> | <code>Input</code> | <code>Input/White Surface/Default</code> | {"surface":"bg-white","state":"Default"} | mapped-pending-verification | HTML input 组件契约的默认运行时 ID。 |
| <code>search</code> | <code>Search/White Surface/Default</code> | <code>search</code> | <code>Search</code> | <code>Search/White Surface/Default</code> | {"surface":"bg-white","state":"Default"} | mapped-pending-verification | HTML search 组件契约的默认运行时 ID。 |
| <code>textarea</code> | <code>Textarea/Default</code> | <code>textarea</code> | <code>Textarea</code> | <code>Textarea/White Surface/Default</code> | {"surface":"bg-white","state":"Default"} | mapped-pending-verification | HTML textarea 组件契约的默认运行时 ID；白色宿主场景使用 surface=bg-white，灰色宿主场景切换为 surface=gb-gray。 |
| <code>sidebar</code> | <code>Sidebar Item/Default</code> | <code>sidebar</code> | <code>Sidebar Item</code> | <code>Sidebar Item/Default</code> | {"state":"default"} | mapped-pending-verification | HTML sidebar 组件契约的默认运行时 ID；Pixso 目标已登记，原生来源适配状态另行验收。 |
| <code>switch</code> | <code>Switch/Default</code> | <code>switch</code> | <code>Switch</code> | <code>Switch/Off/Default</code> | {"checked":"false","state":"Default"} | mapped-pending-verification | HTML switch 组件契约的默认运行时 ID；checked=false 对应 Off。 |
| <code>color-picker</code> | <code>ColorPicker/Tablet</code> | <code>color-picker</code> | <code>ColorPicker-Tablet</code> | <code>ColorPicker/Tablet</code> | {} | mapped-pending-verification | HTML ColorPicker 组件契约的默认运行时 ID；对应 Pixso ColorPicker-Tablet。 |
| <code>icon-text-primary</code> | <code>Icon Text Button/Primary/Default</code> | <code>button</code> | <code>icon-text</code> | <code>Icon Text Button/Primary/Default</code> | {"size":"Medium","state":"Default","type":"primary"} | mapped-pending-verification | 端侧 button contract 的 icon-text-primary specimen；Pixso exact Component Set 为 icon-text，变体值保持 Pixso 的小写命名。 |
| <code>icon-text-secondary</code> | <code>Icon Text Button/Secondary/Default</code> | <code>button</code> | <code>icon-text</code> | <code>Icon Text Button/Secondary/Default</code> | {"size":"Medium","state":"Default","type":"secondary"} | mapped-pending-verification | 端侧 button contract 的 icon-text-secondary specimen；已由当前 Pixso 文件实时事实确认 icon-text/type=secondary 存在。 |
| <code>icon-text-ghost</code> | <code>Icon Text Button/Ghost/Default</code> | <code>button</code> | <code>icon-text</code> | <code>Icon Text Button/Ghost/Default</code> | {"size":"Medium","state":"Default","type":"ghost"} | mapped-pending-verification | 端侧 button contract 的 icon-text-ghost specimen；Pixso exact Component Set 为 icon-text。 |
| <code>icon</code> | <code>Icon Button/Ghost/Default</code> | <code>button</code> | <code>Icon Button</code> | <code>Icon Button/Ghost/Default</code> | {"size":"Medium","state":"Default","type":"Ghost"} | mapped-pending-verification | 端侧 button contract 的 icon specimen；Pixso exact Component Set 为 Icon Button，当前唯一 type 为 Ghost。 |
| <code>selection-dropdown</code> | <code>Selection Dropdown/Default</code> | <code>button</code> | <code>Selection Dropdown</code> | <code>Selection Dropdown/Default</code> | {"size":"Medium","state":"Default"} | mapped-pending-verification | 端侧 button contract 的 selection-dropdown specimen；它是选择型下拉按钮，不等同于表单字段 Select/Default。 |
| <code>split-dropdown</code> | <code>Split Dropdown Button/Icon Text/Default</code> | <code>button</code> | <code>split-dropdown</code> | <code>Split Dropdown Button/Icon Text/Default</code> | {"type":"ghost","state":"Default"} | mapped-pending-verification | 端侧 button contract 的 split-dropdown specimen；Pixso 同名默认变体中选择带 label 的 128×40 实例（Icon + Text）。 |
| <code>split-dropdown-icon</code> | <code>Split Dropdown Button/Icon Only/Default</code> | <code>button</code> | <code>split-dropdown</code> | <code>Split Dropdown Button/Icon Only/Default</code> | {"type":"icon","state":"Default"} | mapped-pending-verification | 端侧 button contract 的 split-dropdown-icon specimen；对应 Pixso type=icon、state=Default 的无 label 60×40 实例（Icon Only）。 |

### 组件内部子映射 / Slot Mapping

这类关系描述 HTML 组件内部的结构化子组件，不会把父组件改名或拆成多个独立 HTML logicalName。当前 Titlebar 的窗口三键组属于这一类。

| HTML parent | HTML slot / role | 稳定 DOM 选择器 | 数量 | Pixso exact Component Set | Text-to-UI spec context | HTML size → Pixso variant | 子动作 / Pixso layer / icon |
| --- | --- | --- | --- | --- | --- | --- | --- |
| <code>Titlebar/Default</code> | <code>actions / window-controls</code> | <code>.tui-titlebar__actions</code> | 1 | <code>control button</code> | <code>Titlebar/L/Normal</code> | small → {"状态":"Small size"}<br>medium → {"状态":"Normal size"}<br>large → {"状态":"Normal size"}<br>xlarge → {"状态":"Normal size"} | minimize → 最小化 → window/minimize<br>maximize → 最大化 → window/maximize<br>close → 关闭 → window/close |

### 尚未正式映射

这些行目前不能自动实例化；请在 Obsidian 维护台确认 Pixso exact name 后提交 `state=pending` 的组件变更。

| HTML logicalName | Renderer | Pixso target | Target status | Native source status |
| --- | --- | --- | --- | --- |
| <code>Accordion/Default</code> | <code>accordion</code> | — | unregistered | not-applicable |
| <code>Alert/Default</code> | <code>alert</code> | — | unregistered | not-applicable |
| <code>Alert Dialog/Default</code> | <code>alert-dialog</code> | — | unregistered | not-applicable |
| <code>Attachment/Default</code> | <code>attachment</code> | — | unregistered | not-applicable |
| <code>Avatar/Default</code> | <code>avatar</code> | — | unregistered | not-applicable |
| <code>Badge/Default</code> | <code>badge</code> | — | unregistered | not-applicable |
| <code>Breadcrumb/Default</code> | <code>breadcrumb</code> | — | unregistered | missing-target |
| <code>Calendar/Default</code> | <code>calendar</code> | — | unregistered | not-applicable |
| <code>Card/Default</code> | <code>card</code> | — | unregistered | missing-target |
| <code>Carousel/Default</code> | <code>carousel</code> | — | unregistered | not-applicable |
| <code>Chart/Default</code> | <code>chart</code> | — | unregistered | not-applicable |
| <code>Collapsible/Default</code> | <code>collapsible</code> | — | unregistered | not-applicable |
| <code>Combobox/Default</code> | <code>combobox</code> | — | unregistered | not-applicable |
| <code>Context Menu/Default</code> | <code>context-menu</code> | — | unregistered | not-applicable |
| <code>Data Table/Default</code> | <code>data-table</code> | — | unregistered | not-applicable |
| <code>Date Picker/Default</code> | <code>date-picker</code> | — | unregistered | missing-target |
| <code>Dropdown Menu/Default</code> | <code>dropdown-menu</code> | — | unregistered | not-applicable |
| <code>Empty/Default</code> | <code>empty</code> | — | unregistered | not-applicable |
| <code>Field/Default</code> | <code>field</code> | — | unregistered | missing-target |
| <code>Hover Card/Default</code> | <code>hover-card</code> | — | unregistered | not-applicable |
| <code>Input OTP/Default</code> | <code>input-otp</code> | — | unregistered | missing-target |
| <code>Item/Default</code> | <code>item</code> | — | unregistered | not-applicable |
| <code>Kbd/Default</code> | <code>kbd</code> | — | unregistered | not-applicable |
| <code>Label/Default</code> | <code>label</code> | — | unregistered | not-applicable |
| <code>List Item/White Surface/Default</code> | <code>list-card</code> | — | unregistered | missing-target |
| <code>Native Select/Default</code> | <code>native-select</code> | — | unregistered | not-applicable |
| <code>Navigation Menu/Default</code> | <code>navigation-menu</code> | — | unregistered | not-applicable |
| <code>Pagination/Default</code> | <code>pagination</code> | — | unregistered | not-applicable |
| <code>Popover/Default</code> | <code>popover</code> | — | unregistered | not-applicable |
| <code>Primary Navigation Item/Level 1</code> | <code>primary-navigation-item</code> | — | unregistered | not-applicable |
| <code>Progress/Default</code> | <code>progress</code> | — | unregistered | missing-target |
| <code>Radio Group/Default</code> | <code>radio-group</code> | — | unregistered | not-applicable |
| <code>Select/Default</code> | <code>select</code> | — | unregistered | not-applicable |
| <code>Semi-modal/Default</code> | <code>semi-modal</code> | — | unregistered | not-applicable |
| <code>Separator/Default</code> | <code>separator</code> | — | unregistered | not-applicable |
| <code>Slider/Default</code> | <code>slider</code> | — | unregistered | missing-target |
| <code>Table/Default</code> | <code>table</code> | — | unregistered | missing-target |
| <code>Tabs/Default</code> | <code>tabs</code> | — | unregistered | not-applicable |
| <code>Time Picker/Default</code> | <code>time-picker</code> | — | unregistered | missing-target |
| <code>Titlebar/Default</code> | <code>titlebar</code> | — | unregistered | not-applicable |
| <code>Tooltip/Default</code> | <code>tooltip</code> | — | unregistered | missing-target |

## Native / External Component Source

| Source library | Source component set | Source Variant | Target HTML/Pixso logical name |
| --- | --- | --- | --- |
| <code>harmonyos-native-source</code> | <code>Button</code> | {"size":"Medium","state":"Default","type":"Primary"} | <code>Button/Primary/Default</code> |
| <code>harmonyos-native-source</code> | <code>Button</code> | {"size":"Medium","state":"Default","type":"Secondary"} | <code>Button/Secondary/Default</code> |
| <code>harmonyos-native-source</code> | <code>Button</code> | {"size":"Medium","state":"Default","type":"Ghost"} | <code>Button/Ghost/Default</code> |
| <code>harmonyos-native-source</code> | <code>icon-text</code> | {"size":"Medium","state":"Default","type":"primary"} | <code>Icon Text Button/Primary/Default</code> |
| <code>harmonyos-native-source</code> | <code>icon-text</code> | {"size":"Medium","state":"Default","type":"ghost"} | <code>Icon Text Button/Ghost/Default</code> |
| <code>harmonyos-native-source</code> | <code>icon-text</code> | {"size":"Medium","state":"Default","type":"secondary"} | <code>Icon Text Button/Secondary/Default</code> |
| <code>harmonyos-native-source</code> | <code>Icon Button</code> | {"size":"Medium","state":"Default","type":"Ghost"} | <code>Icon Button/Secondary/Default</code> |
| <code>harmonyos-native-source</code> | <code>Icon Button</code> | {"size":"Medium","state":"Default","type":"Ghost"} | <code>Icon Button/Ghost/Default</code> |
| <code>harmonyos-native-source</code> | <code>Selection Dropdown</code> | {"size":"Medium","state":"Default"} | <code>Selection Dropdown/Default</code> |
| <code>harmonyos-native-source</code> | <code>Search</code> | {"surface":"white","state":"Default"} | <code>Search/White Surface/Default</code> |
| <code>harmonyos-native-source</code> | <code>Search</code> | {"surface":"dark","state":"Default"} | <code>Search/Gray Surface/Default</code> |
| <code>harmonyos-native-source</code> | <code>Selection Dropdown</code> | {"size":"Medium","state":"Default"} | <code>Select/White Surface/Default</code> |
| <code>harmonyos-native-source</code> | <code>Selection Dropdown</code> | {"size":"Medium","state":"Default"} | <code>Select/Gray Surface/Default</code> |
| <code>harmonyos-native-source</code> | <code>Input</code> | {"surface":"white","state":"Default"} | <code>Input/White Surface/Default</code> |
| <code>harmonyos-native-source</code> | <code>Input</code> | {"surface":"dark","state":"Default"} | <code>Input/Gray Surface/Default</code> |
| <code>harmonyos-native-source</code> | <code>CheckBox</code> | {"checked":"false","state":"Default"} | <code>Checkbox/Unchecked/Default</code> |
| <code>harmonyos-native-source</code> | <code>Radio</code> | {"checked":"false","state":"Default"} | <code>Radio/Unselected/Default</code> |
| <code>harmonyos-native-source</code> | <code>Switch</code> | {"checked":"false","state":"Default"} | <code>Switch/Off/Default</code> |
| <code>harmonyos-native-source</code> | <code>ColorPicker-Tablet</code> | {} | <code>ColorPicker/Tablet</code> |
| <code>harmonyos-native-source</code> | <code>Chips</code> | {"状态":"Default"} | <code>Chips/Default</code> |
| <code>harmonyos-native-source</code> | <code>Snackbar</code> | {"左侧区域":"1"} | <code>Snackbar/Default</code> |

## 维护规则

- 编辑入口：assets/design-system/mapping-registry.json 的 profiles；运行时专用别名维护在 runtimeSemanticAliases，完整 runtime semantic index 由 semanticTokenMappings + runtimeSemanticAliases 自动生成。
- 同一个 HTML 源对接不同 Pixso 文件或组件库时，新建 profile；不要覆盖已有 profile。
- HTML Component 以 logicalName 为身份，运行时组件 ID（例如 button contract 的 icon-text-primary、icon）只是可选实现别名，统一从 Obsidian 的 HTML Component 表维护；Pixso Component 以当前文件中的 exact Component Set/COMPONENT name 为身份，Variant 记录在正式映射行中。父组件内部的复合结构使用 componentMappings[].subcomponentMappings，不把内部组误记成独立 HTML Component。
- Pixso GUID、node ID、file key 不进入 registry；运行时重新解析。
- Obsidian 变更先填写人工编辑区并运行 scripts/sync-obsidian-mapping-edits.mjs --check/--write；不要直接改生成的完整报告。
- 修改后依次运行 pnpm mappings:validate、相关 projection build/check，再重新生成本文件。
