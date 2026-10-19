/** The Pattern owns segment order/width; this contract owns segment content. */
export function resolveTitlebarSegment(options = {}) {
  if ('paneRole' in options) throw new Error('Titlebar paneRole is removed; use segmentRole');
  const layout = options.layout ?? 'standalone';
  const size = options.size ?? 'large';
  const segmentRole = options.segmentRole ?? 'global';
  const paneRole = ['main-detail', 'main-content'].includes(segmentRole) ? 'final-pane' : segmentRole === 'secondary-list' ? 'secondary-pane' : segmentRole;
  if (!['global', 'primary-navigation', 'secondary-pane', 'final-pane'].includes(paneRole)) throw new Error(`Unknown Titlebar segment role: ${segmentRole}`);
  if (!['standalone', 'two-column', 'three-column'].includes(layout)) throw new Error(`Unknown Titlebar layout: ${layout}`);
  if (size === 'small' && layout !== 'standalone') throw new Error('Titlebar_S only supports standalone layout; two-column and three-column layouts require a larger Titlebar size');
  const slots = options.slots ?? {};
  if (!slots || typeof slots !== 'object' || Array.isArray(slots)) throw new Error('Titlebar slots must be an object');
  const isFirstLevel = ['global', 'primary-navigation'].includes(paneRole);
  const supported = isFirstLevel ? ['logo', 'label', ...(paneRole === 'global' ? ['actions'] : [])] : paneRole === 'secondary-pane' ? ['logo', 'secondary-pane-content'] : paneRole === 'final-pane' ? ['logo', ...(layout === 'two-column' ? ['main-content-leading', 'main-content-title'] : layout === 'three-column' ? ['main-detail-actions'] : []), 'actions'] : [];
  for (const key of Object.keys(slots)) if (!supported.includes(key)) throw new Error(`Titlebar slot ${key} is not available in ${layout}/${segmentRole}`);
  for (const key of ['label', 'main-content-title']) if (key in slots && typeof slots[key] !== 'string') throw new Error(`Titlebar slot ${key} requires text`);
  if ('main-content-leading' in slots) {
    const action = slots['main-content-leading'];
    if (!action || typeof action !== 'object' || typeof action.id !== 'string' || !action.id || typeof action.label !== 'string' || !action.label || typeof action.icon !== 'string' || !action.icon) throw new Error('Titlebar main-content-leading requires { id, label, icon, buttonType? }');
    if (action.buttonType !== undefined && !['icon', 'icon-text-ghost'].includes(action.buttonType)) throw new Error('Titlebar main-content-leading buttonType must be icon or icon-text-ghost');
  }
  if ('logo' in slots && (!slots.logo || typeof slots.logo !== 'object' || Array.isArray(slots.logo) || typeof slots.logo.src !== 'string')) throw new Error('Titlebar logo requires { src, alt? }');
  if ('main-detail-actions' in slots && !Array.isArray(slots['main-detail-actions'])) throw new Error('Titlebar main-detail-actions requires an action array');
  if ('main-detail-actions' in slots) {
    const ids = new Set();
    for (const action of slots['main-detail-actions']) {
      if (!action || typeof action.id !== 'string' || !action.id || typeof action.label !== 'string' || !action.label) throw new Error('Titlebar action requires a stable id and label');
      if (ids.has(action.id)) throw new Error(`Duplicate Titlebar action id: ${action.id}`);
      ids.add(action.id);
    }
  }
  if ('secondary-pane-content' in slots) {
    const content = slots['secondary-pane-content'];
    if (!content || typeof content !== 'object' || Array.isArray(content) || content.component !== 'search') throw new Error('Titlebar secondary-pane-content currently supports the registered Search component only');
    if (content.props !== undefined && (!content.props || typeof content.props !== 'object' || Array.isArray(content.props))) throw new Error('Titlebar secondary-pane-content props must be an object');
  }
  if ('actions' in slots && typeof slots.actions !== 'boolean') throw new Error('Titlebar actions requires a boolean; window buttons remain component-owned');
  const showWindowControls = slots.actions ?? options.showWindowControls ?? ['global', 'final-pane'].includes(paneRole);
  if (typeof showWindowControls !== 'boolean') throw new Error('showWindowControls requires a boolean');
  if (showWindowControls && !['global', 'final-pane'].includes(paneRole)) throw new Error('Window controls belong to the final Titlebar segment only');
  if (isFirstLevel && options.showLogo === false) throw new Error('First-level Titlebar segments must show the logo');
  const logoSlot = slots.logo;
  const showLogo = options.showLogo ?? (isFirstLevel || Boolean(logoSlot));
  if (typeof showLogo !== 'boolean') throw new Error('showLogo requires a boolean');
  return { ...options, size, layout, paneRole, segmentRole, label: slots.label ?? options.label, paneTitle: slots['main-content-title'] ?? options.paneTitle,
    mainContentLeading: slots['main-content-leading'] ?? options.mainContentLeading,
    showLogo, logoSrc: logoSlot?.src ?? options.logoSrc, logoAlt: logoSlot?.alt ?? options.logoAlt,
    mainDetailActions: slots['main-detail-actions'] ?? options.mainDetailActions,
    secondaryPaneContent: slots['secondary-pane-content'] ?? options.secondaryPaneContent,
    showWindowControls };
}

export function createTitlebarSegments(pattern, content = {}) {
  const roles = pattern?.titleLayer?.segments;
  if (!Array.isArray(roles) || roles.length < 2 || new Set(roles).size !== roles.length) throw new Error('Use the resolved Pattern titleLayer.segments');
  for (const key of Object.keys(content)) if (!roles.includes(key)) throw new Error(`Undeclared Pattern title segment: ${key}`);
  return roles.map((region, index) => {
    const configured = content[region] ?? {};
    if (['paneRole', 'segmentRole', 'layout'].some(key => key in configured)) throw new Error('Pattern owns segment placement; supply content only');
    if ((configured.size ?? 'large') === 'small') throw new Error('Pattern title segments cannot use Titlebar_S; small Titlebar only supports standalone layout');
    const role = index === 0 ? 'primary-navigation' : index === roles.length - 1 ? 'final-pane' : 'secondary-pane';
    const { paneRole: _resolvedPaneRole, ...canonicalConfig } = resolveTitlebarSegment({ ...configured, layout: roles.length === 2 ? 'two-column' : 'three-column', segmentRole: role });
    return { ...canonicalConfig, region };
  });
}

/** Gallery-only specimen matrix. These widths are not a page Pattern shell. */
export function createTitlebarPreviewScenes() {
  return [['small', 'S · 40px'], ['medium', 'M · 56px'], ['large', 'L · 64px'], ['xlarge', 'XL · 72px']].map(([size, label]) => {
    const brand = layout => ({ size, layout, segmentRole: 'primary-navigation', slots: { label: '项目空间' } });
    const scenes = [
      { layout: 'standalone', columns: 'one', label: '01 单栏布局', description: '品牌 logo · label ｜窗口控制 actions', segments: [{ size, layout: 'standalone', segmentRole: 'global', slots: { label: '项目空间' } }] },
      ...(size === 'small' ? [] : [
        { layout: 'two-column', columns: 'two', label: '02 两栏布局', description: '左：logo · label ｜右：main-content-leading · main-content-title · actions', segments: [brand('two-column'), { size, layout: 'two-column', segmentRole: 'main-content', slots: { 'main-content-leading': { id: 'back', label: '返回', icon: 'navigation/back', buttonType: 'icon' }, 'main-content-title': '项目详情' } }] },
        { layout: 'three-column', columns: 'three', label: '03 三栏布局', description: '左：logo · label ｜中：注册组件（左右 space/5，按尺寸垂直居中） ｜右：main-detail-actions · actions', segments: [brand('three-column'), { size, layout: 'three-column', segmentRole: 'secondary-list', slots: { 'secondary-pane-content': { component: 'search', props: { placeholder: '搜索项目' } } } }, { size, layout: 'three-column', segmentRole: 'main-detail', slots: { 'main-detail-actions': [
          { id: 'reply', label: '回复', icon: 'action/reply', buttonType: 'icon-text-ghost' },
          { id: 'save', label: '保存', icon: 'action/save', buttonType: 'icon-text-ghost' },
          { id: 'more', label: '更多操作', icon: 'action/more', buttonType: 'icon' }
        ] } }]
      }]),
      { layout: 'unfocus', columns: 'one', label: '01b 失焦状态', description: '单栏布局的 unfocus 状态；不改变区域位置与宽度', segments: [{ size, layout: 'standalone', segmentRole: 'global', state: 'unfocus', slots: { label: '项目空间' } }] }
    ];
    return { size, label, scenes };
  });
}
