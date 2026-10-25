<template>
  <section class="user-organization-filter" :aria-label="`${scopeCopy.entityLabel}组织范围筛选`">
    <header class="user-organization-filter__header">
      <div class="user-organization-filter__heading">
        <span class="user-organization-filter__brand" aria-hidden="true">
          <ArtSvgIcon icon="ri:node-tree" />
        </span>
        <div>
          <strong>组织导航</strong>
          <small>{{ organizationCount }} 个可用节点</small>
        </div>
      </div>

      <ArtTooltip content="刷新组织结构" placement="top">
        <ArtIconButton
          icon="ri:refresh-line"
          label="刷新组织结构"
          :loading="loading"
          @click="emit('refresh')"
        />
      </ArtTooltip>
    </header>

    <div class="user-organization-filter__controls">
      <ElInput
        v-model="keyword"
        clearable
        placeholder="搜索组织名称或编码"
        aria-label="搜索组织名称或编码"
      >
        <template #prefix>
          <ArtSvgIcon icon="ri:search-line" />
        </template>
      </ElInput>
    </div>

    <nav class="user-organization-filter__quick" aria-label="常用组织范围">
      <button
        type="button"
        :class="{ 'is-active': selectedKey === ALL_ORGANIZATIONS_KEY }"
        @click="handleQuickSelect(ALL_ORGANIZATIONS_KEY)"
      >
        <span class="user-organization-filter__quick-icon is-all" aria-hidden="true">
          <ArtSvgIcon icon="ri:group-line" />
        </span>
        <span>
          <strong>{{ scopeCopy.allLabel }}</strong>
          <small>{{ scopeCopy.allDescription }}</small>
        </span>
        <ArtSvgIcon class="user-organization-filter__check" icon="ri:check-line" />
      </button>

      <button
        v-if="showUnassigned"
        type="button"
        :class="{ 'is-active': selectedKey === UNASSIGNED_ORGANIZATION_KEY }"
        @click="handleQuickSelect(UNASSIGNED_ORGANIZATION_KEY)"
      >
        <span class="user-organization-filter__quick-icon is-warning" aria-hidden="true">
          <ArtSvgIcon icon="ri:user-unfollow-line" />
        </span>
        <span>
          <strong>{{ scopeCopy.unassignedLabel }}</strong>
          <small>{{ scopeCopy.unassignedDescription }}</small>
        </span>
        <ArtSvgIcon class="user-organization-filter__check" icon="ri:check-line" />
      </button>
    </nav>

    <div class="user-organization-filter__section-title">
      <span>组织结构</span>
      <small v-if="hasScopeCounts">{{ assignedScopeCount }} {{ scopeCopy.assignedSuffix }}</small>
    </div>

    <div class="user-organization-filter__tree-area">
      <ElSkeleton v-if="loading && !data.length" :rows="6" animated />

      <ElScrollbar v-else-if="data.length" always>
        <ElTree
          ref="treeRef"
          :data="data"
          :props="treeProps"
          :filter-node-method="filterNode"
          :default-expanded-keys="defaultExpandedKeys"
          node-key="id"
          highlight-current
          :expand-on-click-node="false"
          @node-click="handleNodeClick"
        >
          <template #default="{ data: node }">
            <div class="user-organization-filter__node">
              <span
                class="user-organization-filter__node-icon"
                :class="`is-${node.organizationType}`"
                aria-hidden="true"
              >
                <ArtSvgIcon :icon="getOrganizationIcon(node.organizationType)" />
              </span>
              <span class="user-organization-filter__node-copy">
                <strong :title="node.organizationName">{{ node.organizationName }}</strong>
                <small :title="getOrganizationMeta(node)" translate="no">
                  {{ getOrganizationMeta(node) }}
                </small>
              </span>
              <span v-if="node.scopeCount" class="user-organization-filter__node-count">
                {{ node.scopeCount }}
              </span>
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
        title="暂无组织结构"
        :description="emptyDescription"
        size="compact"
        :visual-size="68"
      />
    </div>

    <footer class="user-organization-filter__footer">
      <div class="user-organization-filter__cascade">
        <span>
          <strong>包含下级组织</strong>
          <small>汇总所选节点及全部子节点</small>
        </span>
        <ElSwitch
          :model-value="includeDescendants"
          :disabled="!isOrganizationSelected"
          aria-label="包含下级组织"
          @change="handleCascadeChange"
        />
      </div>

      <div class="user-organization-filter__selection" aria-live="polite">
        <span aria-hidden="true"><ArtSvgIcon icon="ri:filter-3-line" /></span>
        <div>
          <small>当前范围</small>
          <strong>{{ selectedLabel }}</strong>
        </div>
        <ElTag
          v-if="selectedScopeCount !== null"
          class="user-organization-filter__count-tag"
          type="primary"
          size="small"
          effect="plain"
          round
        >
          {{ selectedScopeCount }}{{ scopeCopy.countUnit }}
        </ElTag>
      </div>
    </footer>
  </section>
</template>

<script setup lang="ts">
  import type { ElTree, TreeNodeData } from 'element-plus'
  import ArtIconButton from '@/components/core/widget/art-icon-button/index.vue'
  import ArtEmptyState from '@/components/core/feedback/art-empty-state/index.vue'
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
  import TreeUtils from '@/utils/tree'

  const ALL_ORGANIZATIONS_KEY = '__all_organizations__'
  const UNASSIGNED_ORGANIZATION_KEY = '__unassigned_organization__'

  type Organization = Api.SystemManage.OrganizationScopeFilterItem
  type ScopeType = 'user' | 'role' | 'employee' | 'position'

  const props = withDefaults(
    defineProps<{
      data: Organization[]
      scopeType?: ScopeType
      loading?: boolean
      selectedKey: string
      includeDescendants?: boolean
      globalScope?: boolean
    }>(),
    {
      loading: false,
      scopeType: 'user',
      includeDescendants: true,
      globalScope: false
    }
  )

  const emit = defineEmits<{
    select: [key: string]
    refresh: []
    'update:includeDescendants': [value: boolean]
  }>()

  const treeUtils = new TreeUtils({
    idKey: 'id',
    parentKey: 'parentId',
    childrenKey: 'children'
  })
  const treeRef = ref<InstanceType<typeof ElTree>>()
  const keyword = ref('')
  const treeProps = { children: 'children', label: 'organizationName' }

  const scopeCopy = computed(() => {
    const rangeLabel = props.globalScope ? '全部租户内' : '当前租户内'
    if (props.scopeType === 'position') {
      return {
        entityLabel: '岗位',
        allLabel: '全部岗位',
        allDescription: `${rangeLabel}全部组织岗位`,
        unassignedLabel: '',
        unassignedDescription: '',
        assignedSuffix: '个岗位已配置',
        countUnit: '个'
      }
    }
    if (props.scopeType === 'role') {
      return {
        entityLabel: '角色',
        allLabel: '全部角色',
        allDescription: `${rangeLabel}全部角色`,
        unassignedLabel: '待归属角色',
        unassignedDescription: '尚未绑定适用组织',
        assignedSuffix: '个角色已归属',
        countUnit: '个'
      }
    }
    if (props.scopeType === 'employee') {
      return {
        entityLabel: '员工',
        allLabel: '全部员工',
        allDescription: `${rangeLabel}全部员工档案`,
        unassignedLabel: '待归属员工',
        unassignedDescription: '尚未分配所属组织',
        assignedSuffix: '名员工已归属',
        countUnit: '人'
      }
    }
    return {
      entityLabel: '用户',
      allLabel: '全部用户',
      allDescription: `${rangeLabel}全部账号`,
      unassignedLabel: '待归属用户',
      unassignedDescription: '尚未分配所属组织',
      assignedSuffix: '人已归属',
      countUnit: '人'
    }
  })
  const showUnassigned = computed(() => props.scopeType !== 'position')
  const emptyDescription = computed(() =>
    props.globalScope ? '全部租户中暂无可用组织节点。' : '当前租户还没有可用的组织节点。'
  )

  const flatOrganizations = computed(() => treeUtils.treeToList(props.data))
  const organizationCount = computed(() => flatOrganizations.value.length)
  const hasScopeCounts = computed(() =>
    flatOrganizations.value.some(
      (item) => item.scopeCount !== null && item.scopeCount !== undefined
    )
  )
  const assignedScopeCount = computed(() =>
    flatOrganizations.value.reduce((total, item) => total + (item.scopeCount ?? 0), 0)
  )
  const defaultExpandedKeys = computed(() =>
    props.data.map((item) => item.id).filter((id): id is string => Boolean(id))
  )
  const selectedNode = computed(() =>
    props.selectedKey === ALL_ORGANIZATIONS_KEY || props.selectedKey === UNASSIGNED_ORGANIZATION_KEY
      ? null
      : treeUtils.findNode(props.data, props.selectedKey)
  )
  const isOrganizationSelected = computed(() => Boolean(selectedNode.value))
  const selectedLabel = computed(() => {
    if (props.selectedKey === ALL_ORGANIZATIONS_KEY) return scopeCopy.value.allLabel
    if (props.selectedKey === UNASSIGNED_ORGANIZATION_KEY) return scopeCopy.value.unassignedLabel
    return selectedNode.value?.organizationName ?? scopeCopy.value.allLabel
  })
  const selectedScopeCount = computed<number | null>(() => {
    if (!hasScopeCounts.value) return null
    if (props.selectedKey === UNASSIGNED_ORGANIZATION_KEY) return null
    if (props.scopeType === 'position' && props.selectedKey === ALL_ORGANIZATIONS_KEY) return null
    if (props.selectedKey === ALL_ORGANIZATIONS_KEY) return assignedScopeCount.value
    if (!selectedNode.value) return null

    const organizations = props.includeDescendants
      ? treeUtils.getDescendants(props.data, props.selectedKey, true)
      : [selectedNode.value]
    return organizations.reduce((total, item) => total + (item.scopeCount ?? 0), 0)
  })

  const getOrganizationIcon = (type: Api.SystemManage.OrganizationType): string => {
    const iconMap: Record<Api.SystemManage.OrganizationType, string> = {
      company: 'ri:building-4-line',
      division: 'ri:git-branch-line',
      department: 'ri:team-line',
      team: 'ri:group-2-line'
    }
    return iconMap[type]
  }

  const getOrganizationMeta = (organization: Organization): string => {
    const tenantName = props.globalScope ? organization.tenant?.tenantName : undefined
    return [tenantName, organization.organizationCode].filter(Boolean).join(' · ')
  }

  const filterNode = (value: string, data: TreeNodeData): boolean => {
    const organization = data as Organization
    const normalized = value.trim().toLocaleLowerCase('zh-CN')
    if (!normalized) return true
    return [
      organization.organizationName,
      organization.organizationCode,
      organization.tenant?.tenantName,
      organization.tenant?.tenantCode
    ].some((field) =>
      String(field ?? '')
        .toLocaleLowerCase('zh-CN')
        .includes(normalized)
    )
  }

  const syncCurrentNode = async (): Promise<void> => {
    await nextTick()
    const key = isOrganizationSelected.value ? props.selectedKey : undefined
    treeRef.value?.setCurrentKey(key)
  }

  const handleQuickSelect = (key: string): void => emit('select', key)
  const handleNodeClick = (node: Organization): void => {
    if (node.id) emit('select', node.id)
  }
  const handleCascadeChange = (value: string | number | boolean): void => {
    emit('update:includeDescendants', Boolean(value))
  }
  watch(keyword, (value) => treeRef.value?.filter(value))
  watch(() => props.selectedKey, syncCurrentNode, { immediate: true })
  watch(
    () => props.data,
    async () => {
      await syncCurrentNode()
      treeRef.value?.filter(keyword.value)
    }
  )
</script>

<style scoped lang="scss">
  .user-organization-filter {
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
    &__heading > div,
    &__quick button,
    &__node,
    &__cascade,
    &__selection {
      display: flex;
      align-items: center;
    }

    &__header {
      flex: none;
      justify-content: space-between;
      padding: 16px 16px 13px;
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
        font-size: 15px;
        line-height: 22px;
        color: var(--el-text-color-primary);
      }

      small {
        font-size: 11px;
        color: var(--el-text-color-secondary);
      }
    }

    &__brand {
      display: inline-flex;
      flex: 0 0 36px;
      align-items: center;
      justify-content: center;
      width: 36px;
      height: 36px;
      margin-right: 10px;
      color: var(--el-color-primary);
      background: color-mix(in srgb, var(--el-color-primary) 12%, var(--el-bg-color));
      border: 1px solid var(--el-color-primary-light-7);
      border-radius: var(--custom-radius);

      :deep(svg) {
        width: 18px;
        height: 18px;
      }
    }

    &__controls {
      display: grid;
      flex: none;
      gap: 10px;
      padding: 14px 14px 10px;
    }

    &__quick {
      display: grid;
      flex: none;
      gap: 4px;
      padding: 0 10px 10px;

      button {
        position: relative;
        width: 100%;
        min-height: 52px;
        padding: 7px 9px;
        font: inherit;
        text-align: left;
        cursor: pointer;
        background: transparent;
        border: 1px solid transparent;
        border-radius: var(--el-border-radius-base);
        transition:
          color 160ms ease,
          background 160ms ease,
          border-color 160ms ease;

        > span:nth-child(2) {
          display: grid;
          min-width: 0;
        }

        strong {
          font-size: 13px;
          line-height: 20px;
          color: var(--el-text-color-primary);
        }

        small {
          overflow: hidden;
          text-overflow: ellipsis;
          font-size: 11px;
          line-height: 18px;
          color: var(--el-text-color-secondary);
          white-space: nowrap;
        }

        &:hover {
          background: var(--el-fill-color-light);
        }

        &.is-active {
          background: var(--el-color-primary-light-9);
          border-color: var(--el-color-primary-light-7);
          box-shadow: inset 3px 0 0 var(--el-color-primary);

          strong,
          .user-organization-filter__check {
            color: var(--el-color-primary);
          }
        }
      }
    }

    &__quick-icon {
      display: inline-flex;
      flex: 0 0 32px;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      margin-right: 9px;
      color: var(--el-color-primary);
      background: var(--el-color-primary-light-9);
      border-radius: var(--el-border-radius-base);

      &.is-warning {
        color: var(--el-color-warning-dark-2);
        background: var(--el-color-warning-light-9);
      }
    }

    &__check {
      width: 16px;
      height: 16px;
      margin-left: auto;
      color: transparent;
    }

    &__section-title {
      display: flex;
      flex: none;
      align-items: center;
      justify-content: space-between;
      padding: 10px 14px 8px;
      background: color-mix(in srgb, var(--el-fill-color-light) 64%, transparent);
      border-top: 1px solid var(--el-border-color-lighter);
      border-bottom: 1px solid var(--el-border-color-lighter);

      span {
        font-size: 12px;
        font-weight: 700;
        color: var(--el-text-color-primary);
      }

      small {
        font-size: 11px;
        color: var(--el-text-color-secondary);
      }
    }

    &__tree-area {
      flex: 1 1 auto;
      min-height: 96px;
      padding: 9px 8px 10px;
      overflow: hidden;
      background: linear-gradient(
        180deg,
        color-mix(in srgb, var(--el-color-primary-light-9) 42%, transparent),
        transparent 70px
      );

      :deep(.el-scrollbar__view) {
        min-height: 100%;
      }

      :deep(.el-tree) {
        --el-tree-node-hover-bg-color: var(--el-fill-color-light);

        background: transparent;
      }

      :deep(.el-tree-node__content) {
        position: relative;
        height: 48px;
        padding-right: 5px;
        margin-bottom: 2px;
        border-radius: var(--el-border-radius-base);
      }

      :deep(.el-tree-node__children) {
        position: relative;
        padding-left: 6px;
        margin-left: 11px;
        border-left: 1px dashed var(--el-color-primary-light-6);
      }

      :deep(.el-tree-node__children > .el-tree-node > .el-tree-node__content::before) {
        position: absolute;
        top: 50%;
        left: -6px;
        width: 8px;
        content: '';
        border-top: 1px dashed var(--el-color-primary-light-6);
      }

      :deep(.el-tree-node.is-current > .el-tree-node__content) {
        background: var(--el-color-primary-light-9);
      }
    }

    &__node {
      display: flex;
      flex: 1;
      align-items: center;
      min-width: 0;
      height: 100%;
    }

    &__node-icon {
      display: inline-flex;
      flex: 0 0 28px;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      margin-right: 7px;
      color: var(--el-color-primary);
      background: var(--el-color-primary-light-9);
      border-radius: var(--el-border-radius-base);

      &.is-team,
      &.is-department {
        color: var(--el-color-success-dark-2);
        background: var(--el-color-success-light-9);
      }
    }

    &__node-copy {
      display: grid;
      flex: 1;
      min-width: 0;

      strong,
      small {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      strong {
        font-size: 12px;
        line-height: 18px;
        color: var(--el-text-color-primary);
      }

      small {
        font-size: 10px;
        line-height: 15px;
        color: var(--el-text-color-secondary);
      }
    }

    &__node-count {
      flex: none;
      min-width: 23px;
      padding: 0 5px;
      margin-left: 6px;
      font-size: 10px;
      font-variant-numeric: tabular-nums;
      line-height: 20px;
      color: var(--el-text-color-secondary);
      text-align: center;
      background: var(--el-fill-color);
      border-radius: 999px;
    }

    &__footer {
      display: grid;
      flex: none;
      gap: 10px;
      padding: 12px 14px 14px;
      background: var(--el-fill-color-lighter);
      border-top: 1px solid var(--el-border-color-lighter);
    }

    &__cascade {
      justify-content: space-between;
      min-width: 0;

      > span {
        display: grid;
        min-width: 0;
      }

      strong {
        font-size: 12px;
        color: var(--el-text-color-primary);
      }

      small {
        font-size: 10px;
        color: var(--el-text-color-secondary);
      }
    }

    &__selection {
      gap: 9px;
      min-width: 0;
      padding: 9px 10px;
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
        background: var(--el-color-primary-light-9);
        border-radius: var(--el-border-radius-base);
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
