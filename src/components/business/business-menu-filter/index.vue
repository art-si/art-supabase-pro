<template>
  <section class="business-menu-filter" :aria-label="labels.ariaLabel">
    <header class="business-menu-filter__header">
      <div class="business-menu-filter__heading">
        <span class="business-menu-filter__brand" aria-hidden="true">
          <ArtSvgIcon icon="ri:node-tree" />
        </span>
        <div>
          <strong>{{ labels.heading }}</strong>
          <small>{{ summary }}</small>
        </div>
      </div>
      <ArtTooltip :content="labels.refresh" placement="top">
        <ArtIconButton
          icon="ri:refresh-line"
          :label="labels.refresh"
          :loading="loading"
          @click="emit('refresh')"
        />
      </ArtTooltip>
    </header>

    <div class="business-menu-filter__search">
      <ElInput v-model="keyword" clearable :placeholder="labels.search" :aria-label="labels.search">
        <template #prefix><ArtSvgIcon icon="ri:search-line" /></template>
      </ElInput>
    </div>

    <nav class="business-menu-filter__quick" :aria-label="labels.allAriaLabel">
      <button type="button" :class="{ 'is-active': !selectedMenuId }" @click="emit('select', '')">
        <span class="business-menu-filter__quick-icon" aria-hidden="true">
          <ArtSvgIcon icon="ri:apps-2-line" />
        </span>
        <span
          ><strong>{{ labels.all }}</strong
          ><small>{{ labels.allDescription }}</small></span
        >
        <ElTag size="small" round>{{ allCount }}</ElTag>
      </button>
    </nav>

    <div class="business-menu-filter__section-title">
      <span>业务菜单树</span><small>{{ labels.treeHint }}</small>
    </div>

    <div class="business-menu-filter__tree-area" :aria-busy="loading">
      <ArtOverlayLoading
        v-if="loading"
        loading
        overlay
        size="compact"
        text="正在加载菜单树…"
        description=""
      />
      <ArtEmptyState
        v-if="error"
        :title="labels.errorTitle"
        :description="error"
        size="compact"
        :visual-size="58"
      >
        <ElButton plain type="primary" @click="emit('refresh')">重新加载</ElButton>
      </ArtEmptyState>
      <ElScrollbar v-else-if="data.length">
        <ElTree
          ref="treeRef"
          :data="data"
          node-key="id"
          :props="treeProps"
          :default-expanded-keys="defaultExpandedKeys"
          :expand-on-click-node="false"
          highlight-current
          :filter-node-method="filterNode"
          @node-click="handleNodeClick"
        >
          <template #default="{ data }">
            <div class="business-menu-filter__node">
              <span class="business-menu-filter__node-icon" aria-hidden="true">
                <ArtSvgIcon :icon="nodeIcon(data)" />
              </span>
              <span class="business-menu-filter__node-copy">
                <strong :title="resolveMenuLabel(data)">{{ resolveMenuLabel(data) }}</strong>
                <small>{{
                  directCount(data)
                    ? `${directCount(data)} ${labels.unit}${labels.direct}`
                    : '业务目录'
                }}</small>
              </span>
              <span class="business-menu-filter__node-count">{{ count(data) }}</span>
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
      </ElScrollbar>
      <ArtEmptyState
        v-else
        :title="labels.emptyTitle"
        :description="labels.emptyDescription"
        size="compact"
        :visual-size="58"
      />
    </div>

    <footer class="business-menu-filter__footer">
      <div class="business-menu-filter__selection" aria-live="polite">
        <span aria-hidden="true"><ArtSvgIcon icon="ri:filter-3-line" /></span>
        <div
          ><small>{{ labels.current }}</small
          ><strong>{{ selectedLabel }}</strong></div
        >
        <ElTag
          class="business-menu-filter__count-tag"
          type="primary"
          effect="plain"
          size="small"
          round
        >
          {{ selectedCount }} {{ labels.unit }}
        </ElTag>
      </div>
    </footer>
  </section>
</template>
<script setup lang="ts" generic="T extends AppRouteRecord">
  import { computed, nextTick, ref, watch } from 'vue'
  import { ElTree, type TreeNodeData } from 'element-plus'
  import ArtIconButton from '@/components/core/widget/art-icon-button/index.vue'
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
  import ArtEmptyState from '@/components/core/feedback/art-empty-state/index.vue'
  import { resolveMenuLabel } from '@/utils/navigation/menu'
  import TreeUtils from '@/utils/tree'
  import type { AppRouteRecord } from '@/types/router'
  import type { BusinessMenuFilterLabels } from './types'

  defineOptions({ name: 'BusinessMenuFilter' })
  const props = withDefaults(
    defineProps<{
      data: T[]
      labels: BusinessMenuFilterLabels
      summary: string
      allCount: number
      count: (node: T) => number
      directCount: (node: T) => number
      searchTerms: (node: T) => readonly unknown[]
      icon?: (node: T) => string
      selectedMenuId?: string
      loading?: boolean
      error?: string
    }>(),
    { selectedMenuId: '', loading: false, error: '' }
  )
  const emit = defineEmits<{ select: [menuId: string]; refresh: [] }>()
  const treeRef = ref<InstanceType<typeof ElTree>>()
  const keyword = ref('')
  const treeUtils = new TreeUtils({ idKey: 'id', childrenKey: 'children', deepClone: false })
  const flatTree = computed(() => treeUtils.treeToList<T>(props.data))
  const selectedNode = computed(() =>
    flatTree.value.find((node) => node.id === props.selectedMenuId)
  )
  const selectedLabel = computed(() =>
    selectedNode.value ? resolveMenuLabel(selectedNode.value) : props.labels.all
  )
  const selectedCount = computed(() =>
    selectedNode.value ? props.count(selectedNode.value) : props.allCount
  )
  const defaultExpandedKeys = computed(() =>
    props.data
      .map((node) => node.id)
      .filter((id): id is string => typeof id === 'string' && Boolean(id))
  )
  const treeProps = { children: 'children', label: (node: TreeNodeData) => resolveMenuLabel(node) }
  const nodeIcon = (node: T): string =>
    props.icon?.(node) ??
    (node.children?.length ? 'ri:folder-3-line' : String(node.meta?.icon || 'ri:file-list-3-line'))

  function filterNode(value: string, data: TreeNodeData): boolean {
    // Element Plus exposes an untyped node; every node originates from this component's typed data.
    const menu = data as T
    const normalized = value.trim().toLocaleLowerCase('zh-CN')
    if (!normalized) return true
    return [resolveMenuLabel(menu), menu.name, menu.path, ...props.searchTerms(menu)].some(
      (field) =>
        String(field ?? '')
          .toLocaleLowerCase('zh-CN')
          .includes(normalized)
    )
  }
  function handleNodeClick(menu: T): void {
    if (menu.id) emit('select', String(menu.id))
  }
  async function syncCurrentNode(): Promise<void> {
    await nextTick()
    treeRef.value?.setCurrentKey(props.selectedMenuId || undefined)
  }
  watch(keyword, (value) => treeRef.value?.filter(value))
  watch(() => props.selectedMenuId, syncCurrentNode, { immediate: true })
  watch(
    () => props.data,
    async () => {
      await syncCurrentNode()
      treeRef.value?.filter(keyword.value)
    }
  )
</script>
<style scoped lang="scss">
  .business-menu-filter {
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    min-width: 0;
    height: 100%;
    overflow: hidden;
    background: var(--el-bg-color);
    border: 1px solid var(--el-border-color-lighter);
    border-radius: var(--custom-radius);

    &__header,
    &__heading,
    &__node,
    &__selection,
    &__quick button {
      display: flex;
      align-items: center;
    }

    &__header {
      flex: none;
      justify-content: space-between;
      padding: 12px 12px 10px;
      background: linear-gradient(145deg, var(--el-color-primary-light-9), transparent 74%);
      border-bottom: 1px solid var(--el-border-color-lighter);
    }

    &__heading {
      min-width: 0;

      > div {
        display: grid;
        min-width: 0;
      }

      strong {
        font-size: 14px;
        color: var(--el-text-color-primary);
      }

      small {
        font-size: 11px;
        color: var(--el-text-color-secondary);
      }
    }

    &__brand,
    &__quick-icon,
    &__node-icon {
      display: inline-flex;
      flex: none;
      align-items: center;
      justify-content: center;
      color: var(--el-color-primary);
      background: var(--el-color-primary-light-9);
      border-radius: var(--custom-radius);
    }

    &__brand {
      width: 32px;
      height: 32px;
      margin-right: 8px;
      border: 1px solid var(--el-color-primary-light-7);
    }

    &__search {
      flex: none;
      padding: 10px 10px 8px;
    }

    &__quick {
      flex: none;
      padding: 0 8px 8px;

      button {
        width: 100%;
        min-height: 48px;
        padding: 6px 8px;
        font: inherit;
        text-align: left;
        cursor: pointer;
        background: transparent;
        border: 1px solid transparent;
        border-radius: var(--el-border-radius-base);
        transition:
          color 160ms ease,
          background-color 160ms ease,
          border-color 160ms ease,
          box-shadow 160ms ease;

        > span:nth-child(2) {
          display: grid;
          flex: 1;
          min-width: 0;
        }

        strong {
          font-size: 13px;
          color: var(--el-text-color-primary);
        }

        small {
          overflow: hidden;
          text-overflow: ellipsis;
          font-size: 10px;
          color: var(--el-text-color-secondary);
          white-space: nowrap;
        }

        &:hover {
          background: var(--el-fill-color-light);
        }

        &:focus-visible {
          outline: 2px solid var(--el-color-primary);
          outline-offset: 2px;
        }

        &.is-active {
          background: var(--el-color-primary-light-9);
          border-color: var(--el-color-primary-light-7);
          box-shadow: inset 3px 0 0 var(--el-color-primary);
        }
      }
    }

    &__quick-icon {
      width: 28px;
      height: 28px;
      margin-right: 7px;
    }

    &__section-title {
      display: flex;
      flex: none;
      align-items: center;
      justify-content: space-between;
      padding: 8px 12px 6px;
      background: var(--el-fill-color-lighter);
      border-top: 1px solid var(--el-border-color-lighter);
      border-bottom: 1px solid var(--el-border-color-lighter);

      span {
        font-size: 12px;
        font-weight: 700;
      }

      small {
        font-size: 10px;
        color: var(--el-text-color-secondary);
      }
    }

    &__tree-area {
      position: relative;
      display: flex;
      flex: 1 1 auto;
      flex-direction: column;
      min-height: 0;
      padding: 6px;
      overflow: hidden;

      :deep(.el-scrollbar) {
        flex: 1 1 auto;
        min-height: 0;
      }

      :deep(.el-tree) {
        background: transparent;
      }

      :deep(.el-tree-node__content) {
        height: 44px;
        padding-right: 5px;
        margin-bottom: 2px;
        border-radius: var(--el-border-radius-base);
      }

      :deep(.el-tree-node__children) {
        padding-left: 6px;
        margin-left: 11px;
        border-left: 1px dashed var(--el-color-primary-light-6);
      }

      :deep(.el-tree-node.is-current > .el-tree-node__content) {
        background: var(--el-color-primary-light-9);
      }
    }

    &__node {
      flex: 1;
      min-width: 0;
      height: 100%;
    }

    &__node-icon {
      width: 28px;
      height: 28px;
      margin-right: 7px;
      border-radius: var(--el-border-radius-base);
    }

    &__node-copy {
      display: grid;
      flex: 1;
      min-width: 0;
    }

    &__node-copy strong,
    &__node-copy small {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    &__node-copy strong {
      font-size: 12px;
      color: var(--el-text-color-primary);
    }

    &__node-copy small {
      font-size: 10px;
      color: var(--el-text-color-secondary);
    }

    &__node-count {
      flex: none;
      min-width: 23px;
      padding: 0 5px;
      margin-left: 6px;
      font-size: 10px;
      line-height: 20px;
      color: var(--el-text-color-secondary);
      text-align: center;
      background: var(--el-fill-color);
      border-radius: 999px;
    }

    &__footer {
      display: grid;
      flex: none;
      padding: 8px 10px 10px;
      background: var(--el-fill-color-lighter);
      border-top: 1px solid var(--el-border-color-lighter);
    }

    &__selection {
      gap: 9px;
      min-width: 0;
      padding: 6px 8px;
      background: var(--el-bg-color);
      border: 1px solid var(--el-border-color-lighter);
      border-radius: var(--el-border-radius-base);

      > span {
        display: inline-flex;
        flex: 0 0 28px;
        align-items: center;
        justify-content: center;
        width: 28px;
        height: 28px;
        color: var(--el-color-primary);
      }

      > div {
        display: grid;
        flex: 1;
        min-width: 0;
      }

      small,
      strong {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      small {
        font-size: 10px;
        color: var(--el-text-color-secondary);
      }

      strong {
        font-size: 12px;
        color: var(--el-text-color-primary);
      }
    }

    &__count-tag.el-tag {
      flex: none;
      justify-content: center;
      min-width: 46px;
      padding-inline: 8px;
      white-space: nowrap;
      border-radius: 999px;
    }
  }
</style>
