# 银雾与 Element Plus

银雾只在 `html[data-ui-scope='workspace'][data-workspace-appearance='silver-mist']` 下生效。这个边界也覆盖挂到 `body` 的浮层。`core/silver-mist.scss` 持有工作台色板和 Art 组件适配，`core/_silver-mist-element-plus.scss` 补原生组件状态，`core/_silver-mist-motion.scss` 收敛原生过渡。业务页仍用 Art 组件和原有 Element Plus API，不需要再写一份银雾样式。

## 视觉约定

- 内容、文字、细线和控件分层使用中性色。主操作使用足以衬清白字的强调色，暗色中的文字、选中标记和焦点使用更亮的同色系。
- 成功、警告、错误各自保留语义色；非语义性的普通提示、标签和浮层统一用中性底。保留文件照片、颜色选择器色板和状态数据传入的自定义颜色。
- 输入控件聚焦时保留原有校验错误色。已选但禁用的标签和分段选项用中性色保留当前值，减少与可操作状态混淆。
- 与表格、表单重叠的浮层保持不透明。沿用应用的边框、阴影、圆角和系统减少动态效果设置。
- ArtForm 的范围日期浮层在银雾下限制在视口内，窄屏双月堆叠仍沿用原有滚动和键盘操作。
- 弹窗和抽屉共用 Art 入场、收起时长，外层遮罩与内容同步。可拖动弹窗仅渐变透明度，进出场中仍用实际尺寸计算拖拽边界；普通弹窗保留轻微位移。锚点浮层仅渐变透明度，保留 Popper 的定位和文字大小。树和折叠菜单保留原生尺寸过渡，滑块和分割栏持续跟随操作。系统开启减少动态效果时使用项目现有的减少动效策略。

## 2.14.7 盘点

按本地安装包顶层 `El*` 导出盘点。下表同时列出可见组件、子组件、服务和基础部件，避免把同一组件的别名算成独立皮肤。

| 分类 | 导出 | 接入方式 |
| --- | --- | --- |
| 布局与基础 | ElAffix、ElAside、ElAutoResizer、ElCol、ElCollapseTransition、ElConfigProvider、ElContainer、ElDivider、ElFooter、ElHeader、ElIcon、ElInfiniteScroll、ElMain、ElRow、ElScrollbar、ElSpace、ElSplitter、ElSplitterPanel、ElText、ElWatermark | 继承上下文；分隔线、分割拖柄和滚动条使用银雾中性层级。布局、指令、尺寸监听和水印保留各自功能。 |
| 编辑与选择 | ElAutocomplete、ElCascader、ElCascaderPanel、ElCheckTag、ElCheckbox、ElCheckboxButton、ElCheckboxGroup、ElColorPicker、ElColorPickerPanel、ElDatePicker、ElDatePickerPanel、ElForm、ElFormItem、ElInput、ElInputNumber、ElInputOtp、ElInputTag、ElMention、ElOption、ElOptionGroup、ElRadio、ElRadioButton、ElRadioGroup、ElRate、ElSegmented、ElSelect、ElSelectV2、ElSlider、ElSwitch、ElTimePicker、ElTimeSelect、ElTransfer、ElTreeSelect、ElUpload | 共用控件外框、错误态、禁用态、键盘焦点和面板。选项组和虚拟列表沿用同一套状态规则。 |
| 操作与导航 | ElAnchor、ElAnchorLink、ElBacktop、ElBreadcrumb、ElBreadcrumbItem、ElButton、ElButtonGroup、ElDropdown、ElDropdownItem、ElDropdownMenu、ElLink、ElMenu、ElMenuItem、ElMenuItemGroup、ElPageHeader、ElPagination、ElStep、ElSteps、ElSubMenu、ElTabPane、ElTabs | 父级定义表面和强调色；子项沿用选中、悬停、焦点与分隔线。 |
| 数据与媒体 | ElAvatar、ElAvatarGroup、ElBadge、ElCalendar、ElCard、ElCarousel、ElCarouselItem、ElCollapse、ElCollapseItem、ElCountdown、ElDescriptions、ElDescriptionsItem、ElImage、ElImageViewer、ElProgress、ElStatistic、ElTable、ElTableColumn、ElTableV2、ElTag、ElTimeline、ElTimelineItem、ElTree、ElTreeV2 | 卡片、表头、描述项和日历共用实底和细分隔线。照片、进度语义和用户指定的颜色保留。 |
| 反馈与浮层 | ElAlert、ElDialog、ElDrawer、ElEmpty、ElLoading、ElLoadingDirective、ElLoadingService、ElMessage、ElMessageBox、ElNotification、ElOverlay、ElPopconfirm、ElPopover、ElPopoverDirective、ElPopper、ElPopperArrow、ElPopperContent、ElPopperTrigger、ElResult、ElSkeleton、ElSkeletonItem、ElTooltip、ElTour、ElTourStep | 组件与服务都由根节点继承色板。状态图标区分提示类别，弹层中的确认与取消沿用应用既有交互规则。 |

## 验证入口

- 浏览器组件验收：`tests/e2e/silver-mist-native.spec.ts`，使用安装包的实际组件、项目全局样式和合成数据。检查亮色、暗色、阴影模式、窄屏、挂到 `body` 的浮层，以及普通外观的隔离。
- 浏览器动效验收：`tests/e2e/silver-mist-motion.spec.ts` 捕获实际 CSS 过渡事件，同时验证 Escape 关闭、焦点恢复和减少动态效果。
- 自定义强调色与外观切换：`tests/e2e/silver-mist-appearance.spec.ts`，覆盖强调色的按钮文字对比、工作台设置持久化和回到原布局。
- 实际业务抽查：`tests/e2e/silver-mist-business-visual.spec.ts`，包括窄屏编辑弹窗内下拉定位、Escape 分层关闭和焦点回退。组件页覆盖可见形态，并不代替业务页的权限、数据与操作验证。

升级 Element Plus 时，先核对本地导出、主题变量、过渡类和浮层挂载位置，再运行上面的浏览器验收。

## 开源参考

| 参考 | 用在银雾的判断 |
| --- | --- |
| [Element Plus Theme Studio · Cupertino Minimal](https://github.com/Solomemory/element-plus-theme-studio/blob/main/apps/web/src/presets.ts#L2139-L2358) | 使用 [官方主题接口](https://element-plus.org/en-US/guide/theming.html)生成亮暗色 CSS。借鉴色板和组件预览的组织方式。其整套 `theme-chalk` 输出适合全局换肤，银雾使用隔离的工作台覆盖。 |
| [Lucky UI Admin](https://github.com/LuckyJie3/lucky-ui-admin/blob/main/src/assets/styles/element-theme.scss)、[ly-fullstack](https://github.com/liangy0323/ly-fullstack/blob/main/docs/admin-theme.md) | 参考后台为表头、控件、挂到 `body` 的浮层和加载遮罩统一映射变量的方法。 |
| [Puppertino](https://github.com/codedgar/Puppertino)、[MacVue](https://github.com/antonreshetov/macvue) | 参考 macOS 开关、分段控制、焦点和菜单。沿用工作台自己的尺寸、密度和键盘行为。 |
| [Apple HIG 颜色](https://developer.apple.com/design/human-interface-guidelines/color)、[材质](https://developer.apple.com/design/human-interface-guidelines/materials)与 [applecn](https://github.com/STiXzoOR/applecn) | 按用途区分文字、控件底、工作区背景、选中底与强调色，保留状态色。数据密集区和挂在正文上的弹层用实底。 |
| [Apple Designing Fluid Interfaces](https://developer.apple.com/videos/play/wwdc2018/803/) 与 [Emil 的 Apple Design](https://github.com/emilkowalski/skills/blob/main/skills/apple-design/SKILL.md) | 保持开关和拖拽立即响应，缩短高频反馈，保留可中途结束的原生过渡。 |
