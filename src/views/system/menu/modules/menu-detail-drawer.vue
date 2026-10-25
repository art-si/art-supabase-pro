<template>
  <ArtDrawer ref="drawerRef" size="lg" :show-footer="false">
    <div v-if="menu" class="menu-detail">
      <ElAlert v-if="loadError" type="error" :closable="false" show-icon>
        <template #title>菜单层级加载失败，层级与统计暂不可用</template>
        <ElButton link type="primary" @click="loadMenuTree">重新加载</ElButton>
      </ElAlert>
      <section class="menu-detail__hero art-card-xs">
        <span class="menu-detail__hero-icon" aria-hidden="true">
          <ArtSvgIcon :icon="getMenuTypeIcon(menu)" />
        </span>
        <div class="menu-detail__hero-copy">
          <div class="menu-detail__title-row">
            <h2>{{ formatMenuTitle(menu.meta?.title) }}</h2>
            <ElTag :type="getMenuTypeTag(menu)" effect="light">
              {{ getMenuTypeText(menu) }}
            </ElTag>
            <ElTag :type="menu.meta?.isEnable === false ? 'info' : 'success'" effect="light">
              {{ menu.meta?.isEnable === false ? '停用' : '启用' }}
            </ElTag>
          </div>
          <p>{{ menuDescription }}</p>
          <div class="menu-detail__meta">
            <span class="art-icon-label"
              ><ArtSvgIcon icon="ri:key-2-line" />{{ menu.name || '未配置权限标识' }}</span
            >
            <span class="art-icon-label"
              ><ArtSvgIcon icon="ri:apps-2-line" />{{ applicationLabel }}</span
            >
          </div>
          <nav class="menu-detail__breadcrumb" aria-label="菜单层级路径">
            <template v-for="(item, index) in hierarchy" :key="item.id || item.name">
              <span>{{ formatMenuTitle(item.meta?.title) }}</span>
              <ArtSvgIcon v-if="index < hierarchy.length - 1" icon="ri:arrow-right-s-line" />
            </template>
          </nav>
        </div>
      </section>

      <section class="menu-detail__metrics" aria-label="菜单结构概览">
        <article v-for="metric in metrics" :key="metric.label" class="art-card-xs">
          <span class="menu-detail__metric-icon" aria-hidden="true">
            <ArtSvgIcon :icon="metric.icon" />
          </span>
          <div>
            <span>{{ metric.label }}</span>
            <strong>{{ metric.value }}</strong>
            <small>{{ metric.description }}</small>
          </div>
        </article>
      </section>

      <ArtSectionCard class="menu-detail__section" preserve-content-structure title="导航与访问">
        <ArtDescriptions :data="menu" :items="accessItems" :columns="2" />
      </ArtSectionCard>

      <ArtSectionCard class="menu-detail__section" preserve-content-structure title="页面行为">
        <ArtDescriptions :data="menu" :items="behaviorItems" :columns="4" />
      </ArtSectionCard>

      <ArtSectionCard class="menu-detail__section" preserve-content-structure title="审计信息">
        <ArtDescriptions :data="menu" :items="auditItems" :columns="2" />
      </ArtSectionCard>
    </div>
  </ArtDrawer>
</template>

<script setup lang="ts">
  import ArtSectionCard from '@/components/core/surfaces/art-section-card/index.vue'
  import { h } from 'vue'
  import { ElTag } from 'element-plus'
  import ArtDescriptions from '@/components/core/base/art-descriptions/index.vue'
  import type { ArtDescriptionItem } from '@/components/core/base/art-descriptions/types'
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
  import ArtDrawer from '@/components/core/drawers/art-drawer/index.vue'
  import type { ArtDrawerExpose } from '@/components/core/drawers/art-drawer/types'
  import type { AppRouteRecord } from '@/types/router'
  import { formatMenuTitle } from '@/utils/router'
  import { formatWithDayjs } from '@/utils/time'
  import TreeUtils from '@/utils/tree'
  import {
    getDirectPermissionCount,
    getMenuTypeIcon,
    getMenuTypeTag,
    getMenuTypeText
  } from './menu-presentation'

  interface MenuRecord extends AppRouteRecord {
    appCode?: string
    createBy?: string
    createTime?: string
    updateBy?: string
  }

  interface MenuMetric {
    label: string
    value: string | number
    description: string
    icon: string
  }

  const drawerRef = ref<ArtDrawerExpose<MenuRecord>>()
  const menu = shallowRef<MenuRecord>()
  const hierarchy = shallowRef<MenuRecord[]>([])
  const descendantCount = ref(0)
  const loadError = ref(false)
  const menuTreeLoader = shallowRef<(() => Promise<AppRouteRecord[]>) | undefined>()

  const treeUtils = new TreeUtils({
    idKey: 'id',
    parentKey: 'parentId',
    childrenKey: 'children',
    deepClone: true
  })

  const applicationLabel = computed(() => (menu.value?.appCode || 'platform').toUpperCase())
  const menuDescription = computed(() => {
    if (menu.value?.type === 'button') {
      return '该节点用于控制页面内具体操作，可在角色权限树中独立分配。'
    }
    if (menu.value?.type === 'folder') {
      return '该节点用于组织导航层级，并承载下级页面与按钮权限。'
    }
    if (menu.value?.meta?.isIframe) {
      return '该入口在系统框架内嵌展示外部页面，请确认目标地址长期可访问。'
    }
    if (menu.value?.meta?.link) {
      return '该入口跳转到外部页面，请确认目标地址及访问边界配置正确。'
    }
    return '该节点对应可访问页面，路由、组件和角色授权共同决定最终访问范围。'
  })

  const metrics = computed<MenuMetric[]>(() => {
    const row = menu.value
    return [
      {
        label: '层级深度',
        value: hierarchy.value.length,
        description: hierarchy.value.length > 1 ? '包含当前节点' : '一级入口',
        icon: 'ri:stack-line'
      },
      {
        label: '直属下级',
        value: row?.children?.length ?? 0,
        description: '当前节点直接子项',
        icon: 'ri:git-branch-line'
      },
      {
        label: '按钮权限',
        value: row ? getDirectPermissionCount(row) : 0,
        description: `${descendantCount.value} 个全部下级节点`,
        icon: 'ri:shield-keyhole-line'
      },
      {
        label: '同级排序',
        value: row?.sort ?? '--',
        description: '数值越小越靠前',
        icon: 'ri:sort-asc'
      }
    ]
  })

  const renderBooleanTag = (value: unknown, trueText: string, falseText: string) =>
    h(ElTag, { type: value === true ? 'success' : 'info', effect: 'light', size: 'small' }, () =>
      value === true ? trueText : falseText
    )

  const accessItems = computed<ArtDescriptionItem<MenuRecord>[]>(() => [
    {
      key: 'permissionName',
      label: menu.value?.type === 'button' ? '权限标识' : '路由名称',
      field: 'name',
      copyable: true
    },
    { key: 'application', label: '所属应用', value: applicationLabel.value },
    { key: 'path', label: '路由地址', field: 'path', copyable: true },
    {
      key: 'component',
      label: '组件路径',
      value: (row: MenuRecord) => (typeof row.component === 'string' ? row.component : ''),
      copyable: true
    },
    {
      key: 'link',
      label: '外部链接',
      value: (row: MenuRecord) => row.meta?.link,
      span: 2,
      copyable: true
    },
    {
      key: 'activePath',
      label: '激活路径',
      value: (row: MenuRecord) => row.meta?.activePath,
      span: 2,
      copyable: true
    }
  ])

  const behaviorItems = computed<ArtDescriptionItem<MenuRecord>[]>(() => [
    {
      key: 'enabled',
      label: '节点状态',
      value: (row: MenuRecord) => row.meta?.isEnable !== false,
      render: (value) => renderBooleanTag(value, '启用', '停用')
    },
    {
      key: 'keepAlive',
      label: '页面缓存',
      value: (row: MenuRecord) => row.meta?.keepAlive === true,
      render: (value) => renderBooleanTag(value, '缓存', '不缓存')
    },
    {
      key: 'isHide',
      label: '导航显示',
      value: (row: MenuRecord) => row.meta?.isHide !== true,
      render: (value) => renderBooleanTag(value, '显示', '隐藏')
    },
    {
      key: 'isHideTab',
      label: '标签页显示',
      value: (row: MenuRecord) => row.meta?.isHideTab !== true,
      render: (value) => renderBooleanTag(value, '显示', '隐藏')
    },
    {
      key: 'isIframe',
      label: '内嵌页面',
      value: (row: MenuRecord) => row.meta?.isIframe === true,
      render: (value) => renderBooleanTag(value, '是', '否')
    },
    {
      key: 'showBadge',
      label: '导航徽章',
      value: (row: MenuRecord) => row.meta?.showBadge === true,
      render: (value) => renderBooleanTag(value, '显示', '不显示')
    },
    {
      key: 'fixedTab',
      label: '固定标签',
      value: (row: MenuRecord) => row.meta?.fixedTab === true,
      render: (value) => renderBooleanTag(value, '固定', '不固定')
    },
    {
      key: 'isFullPage',
      label: '全屏页面',
      value: (row: MenuRecord) => row.meta?.isFullPage === true,
      render: (value) => renderBooleanTag(value, '全屏', '标准布局')
    }
  ])

  const auditItems = computed<ArtDescriptionItem<MenuRecord>[]>(() => [
    { key: 'id', label: '节点 ID', field: 'id', span: 2, copyable: true },
    { key: 'createBy', label: '创建人', field: 'createBy' },
    {
      key: 'createTime',
      label: '创建时间',
      value: (row: MenuRecord) => formatWithDayjs(row.createTime) || '--'
    },
    { key: 'updateBy', label: '最后编辑人', field: 'updateBy' },
    {
      key: 'updateTime',
      label: '最后编辑时间',
      value: (row: MenuRecord) => formatWithDayjs(row.updateTime) || '--'
    }
  ])

  const updateHierarchy = (row: MenuRecord, menuTree: MenuRecord[]): void => {
    hierarchy.value = row.id ? treeUtils.getAncestors(menuTree, row.id) : [row]
    descendantCount.value = row.id ? treeUtils.getDescendants(menuTree, row.id).length : 0
  }

  const loadMenuTree = async (): Promise<void> => {
    if (!menuTreeLoader.value || !menu.value) return
    loadError.value = false
    drawerRef.value?.setLoading(true)
    try {
      updateHierarchy(menu.value, await menuTreeLoader.value())
    } catch {
      loadError.value = true
    } finally {
      drawerRef.value?.setLoading(false)
    }
  }

  const handleOpen = async (
    row: MenuRecord,
    menuTree: MenuRecord[],
    loadTree?: () => Promise<AppRouteRecord[]>
  ): Promise<void> => {
    menu.value = row
    loadError.value = false
    menuTreeLoader.value = menuTree.length ? undefined : loadTree
    updateHierarchy(row, menuTree.length ? menuTree : [row])

    await drawerRef.value?.handleOpen(row, {
      title: '菜单详情',
      subtitle: '查看导航结构、访问配置、页面行为和审计信息。',
      contentHeight: 'calc(100vh - 126px)',
      scrollbarAlways: true,
      showFooter: false,
      loading: Boolean(menuTreeLoader.value),
      loadingText: '正在加载菜单层级…',
      drawerProps: {
        resizable: true
      },
      onOpen: loadMenuTree,
      onReset: () => {
        menu.value = undefined
        hierarchy.value = []
        descendantCount.value = 0
        loadError.value = false
        menuTreeLoader.value = undefined
      }
    })
  }

  defineExpose({ handleOpen })
</script>

<style scoped lang="scss">
  .menu-detail {
    display: grid;
    gap: 16px;
    min-width: 0;

    &__hero {
      display: flex;
      gap: 14px;
      align-items: flex-start;
      padding: 18px;
    }

    &__hero-icon {
      display: grid;
      flex: 0 0 46px;
      place-items: center;
      width: 46px;
      height: 46px;
      color: var(--el-color-primary);
      background: var(--el-color-primary-light-9);
      border: 1px solid var(--el-color-primary-light-7);
      border-radius: var(--custom-radius);

      :deep(svg) {
        width: 22px;
        height: 22px;
      }
    }

    &__hero-copy {
      min-width: 0;

      > p {
        margin: 6px 0 10px;
        font-size: 13px;
        line-height: 1.65;
        color: var(--el-text-color-secondary);
        overflow-wrap: anywhere;
      }
    }

    &__title-row {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;

      h2 {
        margin: 0;
        font-size: 20px;
        line-height: 1.4;
        color: var(--el-text-color-primary);
        overflow-wrap: anywhere;
      }
    }

    &__meta,
    &__breadcrumb {
      display: flex;
      flex-wrap: wrap;
      gap: 8px 14px;
      align-items: center;
      min-width: 0;
      font-size: 12px;
      color: var(--el-text-color-secondary);
    }

    &__meta span {
      display: inline-flex;
      gap: 5px;
      align-items: center;
      min-width: 0;
      overflow-wrap: anywhere;
    }

    &__breadcrumb {
      gap: 4px;
      padding-top: 10px;
      margin-top: 10px;
      border-top: 1px solid var(--el-border-color-lighter);

      span:last-of-type {
        font-weight: 600;
        color: var(--el-text-color-primary);
      }
    }

    &__metrics {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 12px;

      article {
        display: flex;
        gap: 10px;
        align-items: center;
        min-width: 0;
        padding: 14px;

        > div {
          display: grid;
          min-width: 0;
        }

        span,
        small {
          overflow: hidden;
          text-overflow: ellipsis;
          color: var(--el-text-color-secondary);
          white-space: nowrap;
        }

        span {
          font-size: 12px;
        }

        strong {
          margin: 2px 0;
          font-size: 20px;
          font-variant-numeric: tabular-nums;
          color: var(--el-text-color-primary);
        }

        small {
          font-size: 11px;
        }
      }
    }

    &__metric-icon {
      display: grid;
      flex: 0 0 36px;
      place-items: center;
      width: 36px;
      height: 36px;
      color: var(--el-color-primary);
      background: var(--el-color-primary-light-9);
      border-radius: var(--el-border-radius-base);
    }

    &__section {
      display: grid;
      gap: 14px;
      min-width: 0;
      padding: 16px;
    }

    @media (width <= 860px) {
      &__metrics {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }

    @media (width <= 560px) {
      &__metrics {
        grid-template-columns: 1fr;
      }
    }
  }
</style>
