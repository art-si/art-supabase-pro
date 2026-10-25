<template>
  <ArtDialog ref="dialogRef" :loading="tree.loading">
    <div class="menu-tree-sort">
      <ElAlert v-if="loadError" type="error" :closable="false" show-icon>
        <template #title>菜单层级加载失败</template>
        <ElButton link type="primary" @click="loadMenuTree">重新加载</ElButton>
      </ElAlert>
      <ArtSectionCard
        class="menu-tree-sort__guide"
        aria-label="拖拽规则"
        preserve-content-structure
      >
        <template #header>
          <div class="menu-tree-sort__guide-heading">
            <span aria-hidden="true"><ArtSvgIcon icon="ri:node-tree" /></span>
            <div>
              <strong>按真实树结构调整菜单</strong>
              <p>每次放下都会原子保存父级关系和同级顺序，父节点移动时整棵子树会一起移动。</p>
            </div>
          </div>
        </template>
        <div class="menu-tree-sort__rules">
          <span><i class="is-line"></i>蓝色横线：放到目标前面或后面</span>
          <span><i class="is-inner"></i>节点高亮：移入目标成为子级</span>
          <span><i class="is-root"></i>拖到一级节点前后：移动到最外层</span>
        </div>
      </ArtSectionCard>

      <section class="menu-tree-sort__workspace art-card-xs">
        <header class="menu-tree-sort__toolbar">
          <ElInput
            v-model="tree.keyword"
            clearable
            placeholder="搜索菜单名称或权限标识"
            @input="handleFilter"
          >
            <template #prefix>
              <ArtSvgIcon icon="ri:search-line" />
            </template>
          </ElInput>
          <div class="menu-tree-sort__toolbar-actions">
            <ElButton text @click="setAllExpanded(true)">
              <ArtSvgIcon icon="ri:expand-up-down-line" />
              全部展开
            </ElButton>
            <ElButton text @click="setAllExpanded(false)">
              <ArtSvgIcon icon="ri:contract-up-down-line" />
              全部收起
            </ElButton>
          </div>
        </header>

        <div class="menu-tree-sort__status" role="status" aria-live="polite">
          <span>
            {{ tree.keyword.trim() ? '清空搜索后可拖拽排序' : `${nodeCount} 个节点可调整` }}
          </span>
          <ElTag :type="tree.keyword.trim() ? 'warning' : 'success'" effect="light" round>
            {{ tree.keyword.trim() ? '排序已暂停' : '拖拽即保存' }}
          </ElTag>
        </div>

        <ElTree
          v-if="tree.data.length"
          ref="treeRef"
          :data="tree.data"
          :props="tree.props"
          :filter-node-method="filterNode"
          :draggable="!tree.loading && !tree.keyword.trim()"
          :allow-drop="allowDrop"
          :default-expanded-keys="tree.expandedKeys"
          node-key="id"
          @node-expand="handleNodeExpand"
          @node-collapse="handleNodeCollapse"
          @node-drag-start="handleNodeDragStart"
          @node-drop="handleNodeDrop"
        >
          <template #default="{ data }">
            <div class="menu-tree-sort__node">
              <span :class="['menu-tree-sort__node-icon', `is-${data.type || 'menu'}`]">
                <ArtSvgIcon :icon="getMenuTypeIcon(data)" />
              </span>
              <div class="menu-tree-sort__node-copy">
                <strong>{{ formatMenuTitle(data.meta?.title) }}</strong>
                <small translate="no">{{ data.name || '未配置权限标识' }}</small>
              </div>
              <ElTag size="small" :type="getMenuTypeTag(data)" effect="light">
                {{ getMenuTypeText(data) }}
              </ElTag>
            </div>
          </template>
          <template #empty>
            <ArtEmptyState
              title="未找到匹配项"
              description="请调整关键词或清空筛选条件。"
              size="compact"
              :visual-size="64"
            />
          </template>
        </ElTree>

        <ArtEmptyState
          v-else
          title="暂无菜单节点"
          description="新增菜单后即可在这里调整层级和顺序。"
          size="compact"
          :visual-size="76"
        />
      </section>
    </div>
  </ArtDialog>
</template>

<script setup lang="ts">
  import ArtSectionCard from '@/components/core/surfaces/art-section-card/index.vue'
  import { getFriendlySupabaseErrorMessage } from '@/utils/supabase'
  import type { ElTree } from 'element-plus'
  import type { NodeDropType } from 'element-plus'
  import { ElMessage } from 'element-plus'
  import { cloneDeep, uniq } from 'lodash-es'
  import type { AppRouteRecord } from '@/types/router'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtEmptyState from '@/components/core/feedback/art-empty-state/index.vue'
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
  import TreeUtils from '@/utils/tree'
  import { formatMenuTitle } from '@/utils/router'
  import { saveMenuTreeOrder } from '@/api/system-manage'
  import { buildMenuTreeOrderUpdates } from './menu-order'
  import { getMenuTypeIcon, getMenuTypeTag, getMenuTypeText } from './menu-presentation'

  type AllowDrop = NonNullable<InstanceType<typeof ElTree>['$props']['allowDrop']>

  interface TreeState {
    keyword: string
    loading: boolean
    data: AppRouteRecord[]
    expandedKeys: string[]
    dragSourceData: AppRouteRecord[]
    props: {
      children: string
      label: (data: unknown) => string
    }
  }

  interface ElementTreeNode {
    data?: unknown
    expanded?: boolean
  }

  const emit = defineEmits<{
    submit: []
  }>()

  const treeUtils = new TreeUtils({
    idKey: 'id',
    parentKey: 'parentId',
    childrenKey: 'children',
    deepClone: true
  })

  const dialogRef = ref<ArtDialogExpose>()
  const treeRef = ref<InstanceType<typeof ElTree>>()
  const loadError = ref(false)
  const menuTreeLoader = shallowRef<(() => Promise<AppRouteRecord[]>) | undefined>()
  const tree = reactive<TreeState>({
    keyword: '',
    loading: false,
    data: [],
    expandedKeys: [],
    dragSourceData: [],
    props: {
      children: 'children',
      label: (data) => formatMenuTitle((data as AppRouteRecord).meta?.title)
    }
  })

  const nodeCount = computed(() => treeUtils.treeToList(tree.data).length)

  const getTreeNodeData = (node: unknown): AppRouteRecord | undefined => {
    if (!node || typeof node !== 'object' || !('data' in node)) return undefined
    const data = (node as ElementTreeNode).data
    if (!data || typeof data !== 'object' || !('id' in data)) return undefined
    return data as AppRouteRecord
  }

  const getNodeKey = (data?: AppRouteRecord): string | undefined =>
    data?.id ? String(data.id) : undefined

  const filterNode = (value: string, rawData: unknown): boolean => {
    if (!value) return true
    const data = rawData as AppRouteRecord
    const keyword = value.trim().toLowerCase()
    return [formatMenuTitle(data.meta?.title), data.name, data.path].some((field) =>
      String(field || '')
        .toLowerCase()
        .includes(keyword)
    )
  }

  const handleFilter = (value: string): void => {
    treeRef.value?.filter(value)
  }

  const allowDrop: AllowDrop = (_draggingNode, dropNode, type) => {
    if (type !== 'inner') return true
    return getTreeNodeData(dropNode)?.type !== 'button'
  }

  const handleNodeExpand = (data: AppRouteRecord): void => {
    const key = getNodeKey(data)
    if (!key) return
    tree.expandedKeys = uniq([...tree.expandedKeys, key])
  }

  const handleNodeCollapse = (data: AppRouteRecord): void => {
    const key = getNodeKey(data)
    if (!key) return
    const collapsedKeys = new Set(
      treeUtils
        .getDescendants(tree.data, key, true)
        .map(getNodeKey)
        .filter((item): item is string => !!item)
    )
    tree.expandedKeys = tree.expandedKeys.filter((item) => !collapsedKeys.has(item))
  }

  const setAllExpanded = (expanded: boolean): void => {
    const rows = treeUtils.treeToList(tree.data)
    tree.expandedKeys = expanded
      ? rows.map(getNodeKey).filter((item): item is string => !!item)
      : []

    rows.forEach((row) => {
      const key = getNodeKey(row)
      if (!key) return
      const node = treeRef.value?.getNode(key) as ElementTreeNode | undefined
      if (node) node.expanded = expanded
    })
  }

  const restoreTree = async (): Promise<void> => {
    tree.data = cloneDeep(tree.dragSourceData)
    await nextTick()
    tree.expandedKeys.forEach((key) => {
      const node = treeRef.value?.getNode(key) as ElementTreeNode | undefined
      if (node) node.expanded = true
    })
  }

  const handleNodeDragStart = (): void => {
    tree.dragSourceData = cloneDeep(tree.data)
  }

  const handleNodeDrop = async (
    _draggingNode: unknown,
    dropNode: unknown,
    dropType: NodeDropType
  ): Promise<void> => {
    const dropKey = getNodeKey(getTreeNodeData(dropNode))
    try {
      tree.loading = true
      if (dropType === 'inner' && dropKey) {
        tree.expandedKeys = uniq([...tree.expandedKeys, dropKey])
      }
      await nextTick()
      await saveMenuTreeOrder(buildMenuTreeOrderUpdates(tree.data))
      tree.dragSourceData = []
      ElMessage.success('菜单层级和顺序已保存')
      emit('submit')
    } catch (error) {
      await restoreTree()
      ElMessage.error(getFriendlySupabaseErrorMessage(error, '菜单树保存失败'))
    } finally {
      tree.loading = false
    }
  }

  const loadMenuTree = async (): Promise<void> => {
    if (!menuTreeLoader.value) return
    loadError.value = false
    dialogRef.value?.setLoading(true)
    try {
      tree.data = cloneDeep(await menuTreeLoader.value())
      tree.expandedKeys = tree.data.map(getNodeKey).filter((item): item is string => !!item)
      await nextTick()
      treeRef.value?.filter(tree.keyword)
    } catch {
      loadError.value = true
    } finally {
      dialogRef.value?.setLoading(false)
    }
  }

  const handleOpen = async (
    menuTree: AppRouteRecord[],
    loadTree?: () => Promise<AppRouteRecord[]>
  ): Promise<void> => {
    tree.keyword = ''
    tree.loading = false
    loadError.value = false
    menuTreeLoader.value = menuTree.length ? undefined : loadTree
    tree.data = cloneDeep(menuTree)
    tree.dragSourceData = []
    tree.expandedKeys = tree.data.map(getNodeKey).filter((item): item is string => !!item)

    await dialogRef.value?.handleOpen(undefined, {
      title: '树形拖拽排序',
      size: 'lg',
      contentHeight: '68vh',
      showFooter: false,
      loading: Boolean(menuTreeLoader.value),
      loadingText: '正在加载菜单层级…',
      onOpen: async () => {
        await Promise.all([nextTick(), loadMenuTree()])
        treeRef.value?.filter(tree.keyword)
      },
      onReset: () => {
        tree.keyword = ''
        tree.data = []
        tree.expandedKeys = []
        tree.dragSourceData = []
        loadError.value = false
        menuTreeLoader.value = undefined
      }
    })
  }

  defineExpose({ handleOpen })
</script>

<style scoped lang="scss">
  .menu-tree-sort {
    display: grid;
    gap: 14px;

    &__guide {
      padding: 14px 16px;
      background: linear-gradient(135deg, var(--el-color-primary-light-9), var(--el-bg-color) 72%);
    }

    &__guide-heading {
      display: flex;
      gap: 10px;
      align-items: flex-start;

      > span {
        display: grid;
        flex: 0 0 34px;
        place-items: center;
        width: 34px;
        height: 34px;
        font-size: 17px;
        color: var(--el-color-primary);
        background: var(--el-color-primary-light-8);
        border-radius: var(--el-border-radius-base);
      }

      > div {
        min-width: 0;

        strong {
          font-size: 14px;
          color: var(--el-text-color-primary);
        }

        p {
          margin: 3px 0 0;
          font-size: 12px;
          line-height: 1.6;
          color: var(--el-text-color-secondary);
        }
      }
    }

    &__rules {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 8px 16px;
      padding-top: 12px;
      margin-top: 12px;
      border-top: 1px solid var(--el-color-primary-light-8);

      span {
        display: flex;
        gap: 7px;
        align-items: center;
        min-width: 0;
        font-size: 12px;
        color: var(--el-text-color-regular);
      }

      i {
        display: inline-block;
        flex: 0 0 16px;
        width: 16px;
        height: 8px;
        border-radius: var(--el-border-radius-small);

        &.is-line {
          height: 2px;
          background: var(--el-color-primary);
        }

        &.is-inner {
          background: var(--el-color-primary-light-8);
          border: 1px solid var(--el-color-primary);
        }

        &.is-root {
          background: var(--el-fill-color);
          border-left: 3px solid var(--el-color-primary);
        }
      }
    }

    &__workspace {
      min-height: 360px;
      padding: 12px;
    }

    &__toolbar,
    &__status {
      display: flex;
      gap: 12px;
      align-items: center;
      justify-content: space-between;
    }

    &__toolbar {
      padding-bottom: 10px;
      border-bottom: 1px solid var(--el-border-color-lighter);

      .el-input {
        width: min(360px, 52%);
      }
    }

    &__toolbar-actions {
      display: flex;
      flex: none;
      align-items: center;

      .el-button + .el-button {
        margin-left: 2px;
      }
    }

    &__status {
      min-height: 42px;
      padding: 6px 4px;
      font-size: 12px;
      color: var(--el-text-color-secondary);
    }

    :deep(.el-tree-node__content) {
      height: 44px;
      margin: 2px 0;
      border: 1px solid transparent;
      border-radius: var(--el-border-radius-base);

      &:hover {
        background: var(--el-color-primary-light-9);
      }
    }

    :deep(.el-tree-node.is-drop-inner > .el-tree-node__content) {
      color: var(--el-color-primary);
      background: var(--el-color-primary-light-8);
      border-color: var(--el-color-primary);
      box-shadow: inset 0 0 0 1px var(--el-color-primary);
    }

    :deep(.el-tree__drop-indicator) {
      z-index: 2;
      height: 2px;
      background: var(--el-color-primary);
      box-shadow: 0 0 0 1px var(--el-color-primary-light-7);
    }

    &__node {
      display: flex;
      gap: 9px;
      align-items: center;
      width: 100%;
      min-width: 0;
      padding-right: 8px;
    }

    &__node-icon {
      display: grid;
      flex: 0 0 30px;
      place-items: center;
      width: 30px;
      height: 30px;
      color: var(--el-color-primary);
      background: var(--el-color-primary-light-9);
      border-radius: var(--el-border-radius-small);

      &.is-folder {
        color: var(--el-color-warning);
        background: var(--el-color-warning-light-9);
      }

      &.is-button {
        color: var(--el-text-color-secondary);
        background: var(--el-fill-color-light);
      }
    }

    &__node-copy {
      display: grid;
      flex: 1;
      gap: 2px;
      min-width: 0;
      line-height: 1.25;

      strong,
      small {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      strong {
        font-size: 13px;
        color: var(--el-text-color-primary);
      }

      small {
        font-size: 11px;
        color: var(--el-text-color-secondary);
      }
    }

    @media (width <= 760px) {
      &__rules {
        grid-template-columns: 1fr;
      }

      &__toolbar {
        flex-direction: column;
        align-items: stretch;

        .el-input {
          width: 100%;
        }
      }

      &__toolbar-actions {
        justify-content: flex-end;
      }
    }
  }
</style>
