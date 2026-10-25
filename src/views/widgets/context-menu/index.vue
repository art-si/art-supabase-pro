<template>
  <ArtPageShell>
    <div class="widget-page">
      <ArtSectionCard
        class="widget-section"
        title="右键菜单"
        subtitle="ArtMenuRight 支持普通项、分割线、禁用项、子菜单、自定义尺寸和命令式打开。"
      >
        <template #actions>
          <ElTag effect="plain">ArtMenuRight</ElTag>
        </template>

        <div class="context-menu-demo">
          <div class="context-menu-demo__surface" @contextmenu.prevent="showMainMenu">
            <ArtSvgIcon icon="ri:cursor-line" />
            <strong>在这里右键</strong>
            <span>菜单会自动根据视口边界调整位置</span>
          </div>

          <div class="context-menu-demo__actions">
            <ElButton type="primary" @click="showMainMenuByButton">打开完整菜单</ElButton>
            <ElButton @contextmenu.prevent="showCompactMenu">右键打开紧凑菜单</ElButton>
            <ElAlert
              v-if="lastAction"
              :title="`最近选择：${lastAction}`"
              type="success"
              show-icon
              :closable="false"
            />
          </div>
        </div>
      </ArtSectionCard>

      <ArtSectionCard
        class="widget-section"
        title="API"
        subtitle="包含组件 props、菜单项字段、事件和 expose 方法。"
      >
        <ElTabs>
          <ElTabPane label="Props">
            <ArtTable :data="propsRows" :columns="propsColumns" :pagination="false" />
          </ElTabPane>
          <ElTabPane label="MenuItemType">
            <ArtTable :data="itemRows" :columns="itemColumns" :pagination="false" />
          </ElTabPane>
          <ElTabPane label="Events / Expose">
            <ArtTable :data="eventRows" :columns="eventColumns" :pagination="false" />
          </ElTabPane>
        </ElTabs>
      </ArtSectionCard>

      <ArtMenuRight
        ref="mainMenuRef"
        :menu-items="mainMenuItems"
        :menu-width="190"
        :submenu-width="160"
        :item-height="34"
        :boundary-distance="12"
        :menu-padding="6"
        :item-padding-x="10"
        :border-radius="8"
        @select="handleSelect"
      />

      <ArtMenuRight
        ref="compactMenuRef"
        :menu-items="compactMenuItems"
        :menu-width="140"
        :item-height="30"
        :menu-padding="4"
        @select="handleSelect"
      />
    </div>
  </ArtPageShell>
</template>

<script setup lang="ts">
  import { nextTick } from 'vue'
  import type { ColumnOption } from '@/types'
  import ArtMenuRight from '@/components/core/others/art-menu-right/index.vue'
  import type { MenuItemType } from '@/components/core/others/art-menu-right/index.vue'

  defineOptions({ name: 'ContextMenuWidget' })

  interface ApiRow {
    name: string
    type?: string
    defaultValue?: string
    payload?: string
    desc: string
  }

  const mainMenuRef = ref<InstanceType<typeof ArtMenuRight>>()
  const compactMenuRef = ref<InstanceType<typeof ArtMenuRight>>()
  const lastAction = ref('')

  const mainMenuItems = computed<MenuItemType[]>(() => [
    { key: 'copy', label: '复制', icon: 'ri:file-copy-line' },
    { key: 'paste', label: '粘贴', icon: 'ri:clipboard-line' },
    { key: 'cut', label: '剪切', icon: 'ri:scissors-cut-line', showLine: true },
    {
      key: 'export',
      label: '导出',
      icon: 'ri:export-line',
      children: [
        { key: 'exportExcel', label: '导出 Excel', icon: 'ri:file-excel-2-line' },
        { key: 'exportPdf', label: '导出 PDF', icon: 'ri:file-pdf-2-line' }
      ]
    },
    {
      key: 'more',
      label: '更多操作',
      icon: 'ri:more-2-line',
      children: [
        { key: 'rename', label: '重命名', icon: 'ri:edit-line' },
        { key: 'duplicate', label: '复制副本', icon: 'ri:file-copy-2-line' }
      ]
    },
    { key: 'share', label: '分享', icon: 'ri:share-forward-line', showLine: true },
    { key: 'delete', label: '删除', icon: 'ri:delete-bin-line' },
    { key: 'disabled', label: '禁用项', icon: 'ri:close-circle-line', disabled: true }
  ])

  const compactMenuItems = computed<MenuItemType[]>(() => [
    { key: 'refresh', label: '刷新', icon: 'ri:refresh-line' },
    { key: 'pin', label: '固定', icon: 'ri:pushpin-line' },
    { key: 'close', label: '关闭', icon: 'ri:close-line' }
  ])

  const propsColumns: ColumnOption<ApiRow>[] = [
    { prop: 'name', label: '名称', width: 170 },
    { prop: 'type', label: '类型', width: 180 },
    { prop: 'defaultValue', label: '默认值', width: 140 },
    { prop: 'desc', label: '说明', minWidth: 240 }
  ]
  const itemColumns: ColumnOption<ApiRow>[] = [
    { prop: 'name', label: '字段', width: 170 },
    { prop: 'type', label: '类型', width: 190 },
    { prop: 'desc', label: '说明', minWidth: 240 }
  ]
  const eventColumns: ColumnOption<ApiRow>[] = [
    { prop: 'name', label: '名称', width: 170 },
    { prop: 'payload', label: '参数', width: 220 },
    { prop: 'desc', label: '说明', minWidth: 240 }
  ]

  const propsRows: ApiRow[] = [
    { name: 'menuItems', type: 'MenuItemType[]', defaultValue: '-', desc: '菜单项配置数组。' },
    { name: 'menuWidth', type: 'number', defaultValue: '120', desc: '主菜单宽度，单位 px。' },
    {
      name: 'submenuWidth',
      type: 'number',
      defaultValue: '150',
      desc: '子菜单最小宽度，单位 px。'
    },
    { name: 'itemHeight', type: 'number', defaultValue: '32', desc: '单个菜单项高度。' },
    {
      name: 'boundaryDistance',
      type: 'number',
      defaultValue: '10',
      desc: '距离浏览器边缘的最小安全距离。'
    },
    { name: 'menuPadding', type: 'number', defaultValue: '5', desc: '菜单容器内边距。' },
    { name: 'itemPaddingX', type: 'number', defaultValue: '6', desc: '菜单项左右内边距。' },
    { name: 'borderRadius', type: 'number', defaultValue: '6', desc: '菜单圆角。' },
    { name: 'animationDuration', type: 'number', defaultValue: '100', desc: '显示/隐藏动画时长。' }
  ]

  const itemRows: ApiRow[] = [
    { name: 'key', type: 'string', desc: '菜单项唯一标识，会随 select 事件返回。' },
    { name: 'label', type: 'string', desc: '菜单项显示文本。' },
    { name: 'icon', type: 'string', desc: 'Remix Icon 图标名，例如 ri:file-copy-line。' },
    { name: 'disabled', type: 'boolean', desc: '是否禁用当前项。' },
    { name: 'showLine', type: 'boolean', desc: '是否在当前项下方显示分割线。' },
    { name: 'children', type: 'MenuItemType[]', desc: '子菜单配置。' }
  ]

  const eventRows: ApiRow[] = [
    { name: 'select', payload: 'MenuItemType', desc: '点击非禁用菜单项时触发。' },
    { name: 'show', payload: '-', desc: '菜单显示时触发。' },
    { name: 'hide', payload: '-', desc: '菜单隐藏时触发。' },
    { name: 'show', payload: 'MouseEvent', desc: 'expose 方法，按鼠标事件位置打开菜单。' },
    { name: 'hide', payload: '-', desc: 'expose 方法，主动关闭菜单。' },
    { name: 'visible', payload: 'ComputedRef<boolean>', desc: 'expose 状态，表示当前是否可见。' }
  ]

  const showMainMenu = (event: MouseEvent) => {
    void nextTick(() => mainMenuRef.value?.show(event))
  }

  const showMainMenuByButton = (event: MouseEvent) => {
    void nextTick(() => mainMenuRef.value?.show(event))
  }

  const showCompactMenu = (event: MouseEvent) => {
    void nextTick(() => compactMenuRef.value?.show(event))
  }

  const handleSelect = (item: MenuItemType) => {
    lastAction.value = `${item.label} (${item.key})`
    ElMessage.success(`已选择：${item.label}`)
  }
</script>

<style scoped lang="scss">
  .widget-page {
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding-bottom: 16px;
  }

  .context-menu-demo {
    display: grid;
    grid-template-columns: minmax(260px, 1fr) minmax(260px, 360px);
    gap: 16px;
  }

  .context-menu-demo__surface {
    display: flex;
    flex-direction: column;
    gap: 10px;
    align-items: center;
    justify-content: center;
    min-height: 260px;
    color: var(--el-text-color-primary);
    cursor: context-menu;
    background:
      linear-gradient(135deg, rgb(64 158 255 / 8%), rgb(103 194 58 / 8%)),
      var(--el-fill-color-lighter);
    border: 1px dashed var(--el-border-color);
    border-radius: var(--art-surface-radius);

    .art-svg-icon {
      font-size: 40px;
      color: var(--el-color-primary);
    }

    span {
      color: var(--el-text-color-secondary);
    }
  }

  .context-menu-demo__actions {
    display: flex;
    flex-direction: column;
    gap: 12px;
    justify-content: center;
  }

  @media (width <= 768px) {
    .context-menu-demo {
      grid-template-columns: 1fr;
    }
  }
</style>
