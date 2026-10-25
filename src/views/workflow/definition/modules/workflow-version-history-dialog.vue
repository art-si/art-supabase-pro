<template>
  <ArtDialog ref="dialogRef" size="xl">
    <div v-if="state.definition" class="workflow-version">
      <section class="workflow-version__summary">
        <div>
          <span><ArtSvgIcon icon="ri:git-commit-line" /></span>
          <div>
            <strong>{{ state.definition.name }}</strong>
            <small>{{ state.definition.code }} · {{ versions.length }} 个版本</small>
          </div>
        </div>
        <ElTag
          :type="state.definition.status === 'published' ? 'success' : 'info'"
          effect="plain"
          round
        >
          {{ state.definition.status === 'published' ? '当前已发布' : '当前未启用' }}
        </ElTag>
      </section>

      <div class="workflow-version__workspace">
        <aside aria-label="流程版本列表">
          <button
            v-for="version in versions"
            :key="version.id"
            type="button"
            :class="{ 'is-active': version.id === state.selectedVersionId }"
            @click="state.selectedVersionId = version.id"
          >
            <span>V{{ version.versionNo }}</span>
            <div>
              <strong>{{ versionStatusLabel(version.status) }}</strong>
              <small>{{ formatDate(version.publishedAt || version.createTime) }}</small>
            </div>
            <ArtSvgIcon icon="ri:arrow-right-s-line" />
          </button>
        </aside>

        <main v-if="selectedVersion">
          <header class="workflow-version__detail-header">
            <div>
              <span>V{{ selectedVersion.versionNo }}</span>
              <div>
                <strong>{{ versionStatusLabel(selectedVersion.status) }}</strong>
                <small>
                  {{ selectedVersion.config.nodes.length }} 个节点 ·
                  {{ selectedVersion.changeNote || '未填写版本说明' }}
                </small>
              </div>
            </div>
            <ElButton
              v-if="state.canManage && selectedVersion.status !== 'draft'"
              type="primary"
              plain
              @click="restoreSelectedVersion"
            >
              <ArtSvgIcon icon="ri:history-line" />恢复为草稿
            </ElButton>
          </header>

          <div class="workflow-version__effective">
            <article>
              <small>创建时间</small>
              <strong>{{ formatDate(selectedVersion.createTime) }}</strong>
            </article>
            <article>
              <small>发布时间</small>
              <strong>{{ formatDate(selectedVersion.publishedAt) }}</strong>
            </article>
            <article>
              <small>发布人</small>
              <strong>{{ selectedVersion.publishedBy || '--' }}</strong>
            </article>
          </div>

          <ArtSectionCard class="workflow-version__diff" preserve-content-structure>
            <template #header
              ><div class="workflow-version__section-heading">
                <div>
                  <ArtSectionTitle :show-line="false">版本差异</ArtSectionTitle>
                  <p>
                    {{
                      comparisonVersion
                        ? `与 V${comparisonVersion.versionNo} 对比`
                        : '首个版本，无历史基线'
                    }}
                  </p>
                </div>
                <ElTag :type="changes.length ? 'warning' : 'success'" effect="light" round>
                  {{ changes.length ? `${changes.length} 项变化` : '配置一致' }}
                </ElTag>
              </div></template
            >

            <ArtEmptyState
              v-if="!changes.length"
              title="未发现配置变化"
              description="该版本与上一版本的节点、规则和时限保持一致。"
              icon="ri:checkbox-circle-line"
            />
            <div v-else class="workflow-version__changes">
              <article v-for="change in changes" :key="change.key" :class="`is-${change.kind}`">
                <span>
                  <ArtSvgIcon
                    :icon="
                      change.kind === 'added'
                        ? 'ri:add-line'
                        : change.kind === 'removed'
                          ? 'ri:subtract-line'
                          : 'ri:edit-line'
                    "
                  />
                </span>
                <div>
                  <strong>{{ change.title }}</strong>
                  <p>{{ change.description }}</p>
                </div>
              </article>
            </div>
          </ArtSectionCard>

          <ArtSectionCard class="workflow-version__nodes" preserve-content-structure>
            <template #header
              ><div class="workflow-version__section-heading">
                <div>
                  <ArtSectionTitle :show-line="false">节点快照</ArtSectionTitle>
                  <p>历史版本只读，恢复操作会生成或覆盖草稿，不修改已发布证据。</p>
                </div>
              </div></template
            >
            <div class="workflow-version__node-list">
              <article
                v-for="node in [...selectedVersion.config.nodes].sort((a, b) => a.order - b.order)"
                :key="node.key"
              >
                <span>{{ node.order.toString().padStart(2, '0') }}</span>
                <div>
                  <strong>{{ node.name }}</strong>
                  <small :title="nodeRuleLabel(node)">{{ nodeRuleLabel(node) }}</small>
                </div>
                <div class="workflow-version__sla" :aria-label="`审批时限 ${node.dueHours} 小时`">
                  <span><ArtSvgIcon icon="ri:time-line" /></span>
                  <div>
                    <small>审批时限</small>
                    <strong>{{ node.dueHours }} 小时</strong>
                  </div>
                </div>
              </article>
            </div>
          </ArtSectionCard>
        </main>
      </div>
    </div>
  </ArtDialog>
</template>

<script setup lang="ts">
  import ArtSectionCard from '@/components/core/surfaces/art-section-card/index.vue'
  import { createDateTimeFormatter } from '@/utils/ui/format'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
  import ArtSectionTitle from '@/components/core/surfaces/art-section-title/index.vue'
  import ArtEmptyState from '@/components/core/feedback/art-empty-state/index.vue'
  import { useArtFeedback } from '@/hooks/core/useArtFeedback'
  import { saveWorkflowDefinition } from '@/api/workflow'
  import { useAuth } from '@/hooks/core/useAuth'
  import { diffWorkflowConfigs } from '../../modules/workflow-version-diff'

  defineOptions({ name: 'WorkflowVersionHistoryDialog' })

  const emit = defineEmits<{ (event: 'success'): void }>()
  const dialogRef = ref<ArtDialogExpose>()
  const { confirmAction } = useArtFeedback()
  const { hasAuth } = useAuth()
  const state = reactive<{
    definition?: Api.Workflow.WorkflowDefinitionRecord
    selectedVersionId: string
    canManage: boolean
  }>({ definition: undefined, selectedVersionId: '', canManage: false })

  const versions = computed(() =>
    [...(state.definition?.versions ?? [])].sort((a, b) => b.versionNo - a.versionNo)
  )
  const selectedVersion = computed(() =>
    versions.value.find((version) => version.id === state.selectedVersionId)
  )
  const comparisonVersion = computed(() => {
    const selected = selectedVersion.value
    if (!selected) return undefined
    return versions.value.find((version) => version.versionNo < selected.versionNo)
  })
  const changes = computed(() => {
    const selected = selectedVersion.value
    if (!selected) return []
    return diffWorkflowConfigs(comparisonVersion.value?.config, selected.config)
  })

  const formatDate = createDateTimeFormatter({ format: 'YYYY-MM-DD HH:mm' })

  function versionStatusLabel(status: Api.Workflow.VersionStatus): string {
    return { draft: '草稿', published: '已发布', retired: '已归档' }[status]
  }

  function nodeRuleLabel(node: Api.Workflow.WorkflowNode): string {
    const approval =
      node.approvalMode === 'all'
        ? '全员会签'
        : node.approvalMode === 'percentage'
          ? `${node.approvalThresholdPercent}% 比例会签`
          : '或签'
    const assignee =
      node.assignee.type === 'roles'
        ? '角色审批'
        : node.assignee.type === 'users'
          ? '指定人员'
          : '发起人'
    return `${approval} · ${assignee} · ${node.rejectVetoEnabled ? '一票否决' : '容错计算'}`
  }

  async function restoreSelectedVersion(): Promise<void> {
    if (!state.canManage || !hasAuth('WorkflowDefinition:Edit')) return
    const definition = state.definition
    const version = selectedVersion.value
    if (!definition || !version) return
    await confirmAction(
      `将 V${version.versionNo} 恢复为草稿后，仍需再次发布才会影响新实例；当前运行实例不受影响。`,
      {
        title: '恢复历史版本',
        confirmButtonText: '确认生成草稿',
        type: 'warning'
      }
    )
    await saveWorkflowDefinition({
      id: definition.id,
      code: definition.code,
      name: definition.name,
      businessType: definition.businessType,
      description: definition.description,
      tenantId: definition.tenantId,
      changeNote: `从 V${version.versionNo} 恢复为草稿`,
      config: structuredClone(version.config)
    })
    emit('success')
    dialogRef.value?.handleClose()
  }

  async function handleOpen(
    definition: Api.Workflow.WorkflowDefinitionRecord,
    options: { canManage?: boolean } = {}
  ): Promise<void> {
    state.definition = definition
    state.canManage = Boolean(options.canManage)
    state.selectedVersionId =
      definition.currentVersionId ||
      [...(definition.versions ?? [])].sort((a, b) => b.versionNo - a.versionNo)[0]?.id ||
      ''
    await dialogRef.value?.handleOpen(undefined, {
      title: '流程版本历史',
      subtitle: '对比节点、审批人、条件、会签规则与 SLA 变化。',
      contentMaxHeight: '78vh',
      showFooter: false,
      onReset: () => {
        state.definition = undefined
        state.selectedVersionId = ''
      }
    })
  }

  defineExpose({ handleOpen })
</script>

<style scoped lang="scss">
  .workflow-version {
    display: grid;
    gap: 14px;
    min-width: 0;

    &__summary {
      display: flex;
      gap: 16px;
      align-items: center;
      justify-content: space-between;
      padding: 14px 16px;
      background: linear-gradient(
        135deg,
        var(--el-color-primary-light-9),
        var(--default-box-color)
      );
      border: 1px solid var(--el-color-primary-light-7);
      border-radius: var(--el-border-radius-base);

      > div {
        display: flex;
        gap: 11px;
        align-items: center;
        min-width: 0;

        > span {
          display: grid;
          flex: 0 0 auto;
          place-items: center;
          width: 40px;
          height: 40px;
          font-size: 20px;
          color: var(--theme-color);
          background: var(--default-box-color);
          border-radius: 50%;
        }

        > div {
          display: grid;
          gap: 3px;
          min-width: 0;
        }
      }

      strong {
        overflow: hidden;
        text-overflow: ellipsis;
        color: var(--art-gray-900);
        white-space: nowrap;
      }

      small {
        color: var(--art-gray-500);
      }
    }

    &__workspace {
      display: grid;
      grid-template-columns: 190px minmax(0, 1fr);
      gap: 14px;
      min-width: 0;

      > aside {
        display: grid;
        gap: 8px;
        align-content: start;
      }

      > aside button {
        display: grid;
        grid-template-columns: auto minmax(0, 1fr) auto;
        gap: 9px;
        align-items: center;
        width: 100%;
        padding: 11px;
        color: var(--art-gray-700);
        text-align: left;
        cursor: pointer;
        outline: none;
        background: var(--default-box-color);
        border: 1px solid var(--art-gray-200);
        border-radius: var(--el-border-radius-base);
        transition:
          color 0.2s ease,
          background-color 0.2s ease,
          border-color 0.2s ease,
          box-shadow 0.2s ease;

        > span {
          font-weight: 700;
          color: var(--theme-color);
        }

        > div {
          display: grid;
          gap: 2px;
          min-width: 0;
        }

        strong,
        small {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        small {
          font-size: 11px;
          color: var(--art-gray-500);
        }

        &.is-active {
          color: var(--theme-color);
          background: color-mix(in srgb, var(--theme-color) 9%, var(--el-bg-color));
          border-color: var(--theme-color);
          box-shadow: var(--art-themed-action-active-shadow);
        }

        &:focus-visible {
          border-color: var(--theme-color);
          box-shadow: var(--art-themed-action-focus-shadow);
        }
      }

      > main {
        display: grid;
        gap: 12px;
        min-width: 0;
      }
    }

    &__detail-header,
    &__detail-header > div {
      display: flex;
      gap: 12px;
      align-items: center;
    }

    &__detail-header {
      justify-content: space-between;

      > div > span {
        display: grid;
        place-items: center;
        width: 42px;
        height: 42px;
        font-weight: 700;
        color: white;
        background: var(--theme-color);
        border-radius: var(--el-border-radius-base);
      }

      > div > div {
        display: grid;
        gap: 3px;
        min-width: 0;
      }

      small {
        color: var(--art-gray-500);
      }
    }

    &__effective {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 8px;

      article {
        display: grid;
        gap: 4px;
        padding: 10px 12px;
        background: var(--art-gray-50);
        border-radius: var(--el-border-radius-base);
      }

      small {
        font-size: 11px;
        color: var(--art-gray-500);
      }

      strong {
        overflow: hidden;
        text-overflow: ellipsis;
        font-size: 12px;
        color: var(--art-gray-800);
        white-space: nowrap;
      }
    }

    &__diff,
    &__nodes {
      padding: 14px;
    }

    &__section-heading {
      display: flex;
      gap: 12px;
      align-items: flex-start;
      justify-content: space-between;
      margin-bottom: 12px;

      > div {
        display: grid;
        gap: 3px;
      }

      p {
        margin: 0;
        font-size: 11px;
        color: var(--art-gray-500);
      }
    }

    &__changes,
    &__node-list {
      display: grid;
      gap: 8px;
    }

    &__changes article {
      display: flex;
      gap: 10px;
      padding: 10px;
      background: var(--art-gray-50);
      border-left: 3px solid var(--el-color-warning);
      border-radius: 0 var(--el-border-radius-base) var(--el-border-radius-base) 0;

      &.is-added {
        border-left-color: var(--el-color-success);
      }

      &.is-removed {
        border-left-color: var(--el-color-danger);
      }

      > span {
        display: grid;
        flex: 0 0 auto;
        place-items: center;
        width: 28px;
        height: 28px;
        color: var(--art-gray-600);
        background: var(--default-box-color);
        border-radius: 50%;
      }

      > div {
        display: grid;
        gap: 3px;
        min-width: 0;
      }

      strong {
        font-size: 12px;
        color: var(--art-gray-800);
      }

      p {
        margin: 0;
        font-size: 11px;
        line-height: 1.5;
        color: var(--art-gray-500);
        overflow-wrap: anywhere;
      }
    }

    &__node-list article {
      display: grid;
      grid-template-columns: 34px minmax(0, 1fr) minmax(92px, auto);
      gap: 12px;
      align-items: center;
      min-width: 0;
      padding: 11px 12px;
      background: color-mix(in srgb, var(--art-gray-50) 48%, var(--default-box-color));
      border: 1px solid var(--art-gray-200);
      border-radius: var(--el-border-radius-base);

      > span {
        display: grid;
        place-items: center;
        width: 28px;
        height: 28px;
        font-size: 11px;
        font-weight: 700;
        color: var(--theme-color);
        background: color-mix(in srgb, var(--theme-color) 10%, var(--el-bg-color));
        border-radius: 50%;
      }

      > div {
        display: grid;
        gap: 2px;
        min-width: 0;
      }

      strong,
      small {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      small {
        font-size: 11px;
        color: var(--art-gray-500);
      }
    }

    &__sla {
      display: flex;
      gap: 8px;
      align-items: center;
      justify-self: end;
      min-width: 96px;
      padding: 7px 9px;
      color: var(--theme-color);
      background: color-mix(in srgb, var(--theme-color) 7%, var(--el-bg-color));
      border: 1px solid color-mix(in srgb, var(--theme-color) 22%, var(--el-border-color));
      border-radius: var(--el-border-radius-base);

      > span {
        display: grid;
        flex: 0 0 auto;
        place-items: center;
        width: 26px;
        height: 26px;
        background: color-mix(in srgb, var(--theme-color) 11%, var(--el-bg-color));
        border-radius: 50%;
      }

      > div {
        display: grid;
        gap: 1px;
        min-width: 0;
      }

      small,
      strong {
        overflow: visible;
        white-space: nowrap;
      }

      small {
        font-size: 10px;
        font-weight: 400;
        color: var(--art-gray-500);
      }

      strong {
        font-size: 12px;
        line-height: 1.2;
        color: var(--art-gray-800);
      }
    }
  }

  :global([data-box-mode='border-mode'] .workflow-version__workspace > aside button.is-active) {
    border-color: var(--theme-color);
  }

  :global([data-box-mode='shadow-mode'] .workflow-version__workspace > aside button.is-active) {
    border-color: transparent;
  }

  @media only screen and (width <= 760px) {
    .workflow-version {
      &__workspace {
        grid-template-columns: 1fr;
      }

      &__workspace > aside {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      &__effective {
        grid-template-columns: 1fr;
      }
    }
  }

  @media only screen and (width <= 520px) {
    .workflow-version {
      &__workspace > aside {
        grid-template-columns: 1fr;
      }

      &__detail-header {
        flex-direction: column;
        align-items: flex-start;
      }

      &__summary {
        flex-direction: column;
        align-items: flex-start;
      }

      &__node-list article {
        grid-template-columns: 34px minmax(0, 1fr);
      }

      &__sla {
        grid-column: 2;
        justify-self: start;
      }
    }
  }
</style>
