<template>
  <ArtDialog ref="dialogRef" size="xl" show-fullscreen-button>
    <div class="workflow-simulator">
      <section class="workflow-simulator__hero">
        <div class="workflow-simulator__hero-icon">
          <ArtSvgIcon icon="ri:test-tube-line" />
        </div>
        <div class="workflow-simulator__hero-copy">
          <small>发布前试跑</small>
          <strong>{{ businessTypeLabel }}</strong>
          <p>输入一组业务样例，实时查看节点命中、跳过和安全策略结果。</p>
        </div>
        <ElTag :type="outcomeMeta.type" effect="dark" round>
          {{ outcomeMeta.label }}
        </ElTag>
      </section>

      <ArtSectionCard class="workflow-simulator__section" preserve-content-structure>
        <template #header>
          <div class="workflow-simulator__section-header">
            <div>
              <ArtSectionTitle>业务样例</ArtSectionTitle>
              <p>这里只模拟当前草稿，不会创建审批实例，也不会修改业务数据。</p>
            </div>
            <span>{{ contextFields.length }} 个受控字段</span>
          </div>
        </template>
        <ArtForm
          v-if="contextFields.length"
          v-model="form.data"
          :items="contextItems"
          :span="12"
          :gutter="18"
          label-position="top"
          :show-reset="false"
          :show-submit="false"
        />
        <ArtEmptyState
          v-else
          title="当前业务没有可模拟字段"
          description="无条件节点仍会参与试跑；如需条件分支，请先补充业务上下文契约。"
          size="compact"
          :visual-size="72"
        />
      </ArtSectionCard>

      <section class="workflow-simulator__summary" aria-label="模拟结果摘要">
        <article v-for="item in summaryItems" :key="item.label" :class="`is-${item.tone}`">
          <span><ArtSvgIcon :icon="item.icon" /></span>
          <div>
            <strong>{{ item.value }}</strong>
            <small>{{ item.label }}</small>
          </div>
        </article>
      </section>

      <ArtSectionCard class="workflow-simulator__section" preserve-content-structure>
        <template #header>
          <div class="workflow-simulator__section-header">
            <div>
              <ArtSectionTitle>模拟路径</ArtSectionTitle>
              <p>引擎按节点顺序检查条件，首个命中节点会先生成审批任务。</p>
            </div>
            <ElTag v-if="result.firstMatchedNodeKey" type="success" effect="plain">
              已找到首个审批节点
            </ElTag>
          </div>
        </template>
        <WorkflowFlowMap
          :nodes="config.nodes"
          :simulation-states="result.simulationStates"
          :simulation-outcome="result.outcome"
          compact
        />
        <div v-if="result.traces.length" class="workflow-simulator__trace-list">
          <article
            v-for="(trace, index) in result.traces"
            :key="trace.node.key"
            :class="`is-${trace.state}`"
          >
            <i>{{ index + 1 }}</i>
            <span
              ><ArtSvgIcon
                :icon="trace.state === 'matched' ? 'ri:check-line' : 'ri:skip-forward-line'"
            /></span>
            <div>
              <strong>
                {{ trace.node.name || `审批节点 ${index + 1}` }}
                <ElTag v-if="trace.isFirstMatched" size="small" type="success" effect="plain">
                  首个进入
                </ElTag>
              </strong>
              <small>{{ trace.reason }}</small>
            </div>
            <em>{{ trace.state === 'matched' ? '条件命中' : '本次跳过' }}</em>
          </article>
        </div>
      </ArtSectionCard>

      <ArtSectionCard class="workflow-simulator__section" preserve-content-structure>
        <template #header>
          <div class="workflow-simulator__section-header">
            <div>
              <ArtSectionTitle>配置体检</ArtSectionTitle>
              <p>错误项会阻止可靠运行；警告项需要在发布前确认业务意图。</p>
            </div>
            <ElTag
              :type="result.errorCount ? 'danger' : result.warningCount ? 'warning' : 'success'"
              effect="plain"
            >
              {{
                result.errorCount
                  ? `${result.errorCount} 个错误`
                  : result.warningCount
                    ? `${result.warningCount} 个警告`
                    : '配置健康'
              }}
            </ElTag>
          </div>
        </template>

        <div v-if="result.diagnostics.length" class="workflow-simulator__diagnostics">
          <article
            v-for="diagnostic in result.diagnostics"
            :key="`${diagnostic.code}-${diagnostic.nodeKey || 'flow'}`"
            :class="`is-${diagnostic.severity}`"
          >
            <span>
              <ArtSvgIcon
                :icon="
                  diagnostic.severity === 'error'
                    ? 'ri:close-circle-line'
                    : diagnostic.severity === 'warning'
                      ? 'ri:alert-line'
                      : 'ri:information-line'
                "
              />
            </span>
            <div>
              <strong>{{ diagnostic.title }}</strong>
              <p>{{ diagnostic.description }}</p>
            </div>
          </article>
        </div>
        <div v-else class="workflow-simulator__healthy">
          <span><ArtSvgIcon icon="ri:shield-check-line" /></span>
          <div>
            <strong>当前配置未发现风险</strong>
            <p>建议继续使用边界金额、空值和不同业务类型各试跑一次。</p>
          </div>
        </div>
      </ArtSectionCard>
    </div>

    <template #footer="{ api }">
      <div class="workflow-simulator__footer">
        <ElButton @click="clearContext"> <ArtSvgIcon icon="ri:eraser-line" />清空样例 </ElButton>
        <ElButton @click="fillExample"> <ArtSvgIcon icon="ri:magic-line" />生成命中样例 </ElButton>
        <span />
        <ElButton type="primary" @click="api.handleConfirm()">完成试跑</ElButton>
      </div>
    </template>
  </ArtDialog>
</template>

<script setup lang="ts">
  import ArtSectionCard from '@/components/core/surfaces/art-section-card/index.vue'
  import { cloneDeep } from 'lodash-es'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtEmptyState from '@/components/core/feedback/art-empty-state/index.vue'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import ArtSectionTitle from '@/components/core/surfaces/art-section-title/index.vue'
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
  import WorkflowFlowMap from '@/components/business/workflow-flow-map/index.vue'
  import { getWorkflowContextFields } from '../../modules/workflow-business-contracts'
  import {
    createWorkflowSimulationContext,
    simulateWorkflow
  } from '../../modules/workflow-simulator'

  defineOptions({ name: 'WorkflowSimulatorDialog' })

  interface SimulatorOpenData {
    businessType: string
    businessTypeLabel: string
    config: Api.Workflow.WorkflowConfig
  }

  interface SummaryItem {
    label: string
    value: number | string
    icon: string
    tone: 'primary' | 'success' | 'warning' | 'danger'
  }

  const dialogRef = ref<ArtDialogExpose<SimulatorOpenData>>()
  const businessType = ref('generic')
  const businessTypeLabel = ref('通用审批')
  const config = ref<Api.Workflow.WorkflowConfig>({ nodes: [], allowAutoApprove: false })
  const form = reactive<{ data: Record<string, unknown> }>({ data: {} })

  const contextFields = computed(() => getWorkflowContextFields(businessType.value))
  const contextItems = computed<FormItem[]>(() =>
    contextFields.value.map((field) => ({
      label: field.label,
      key: field.key,
      type:
        field.valueType === 'number'
          ? 'number'
          : field.valueType === 'boolean'
            ? 'switch'
            : field.valueType === 'date'
              ? 'date'
              : 'input',
      help: field.help || `运行时字段：${field.key}`,
      props:
        field.valueType === 'number'
          ? {
              precision: 2,
              controlsPosition: 'right',
              class: '!w-full',
              placeholder: '输入模拟数值'
            }
          : field.valueType === 'boolean'
            ? { activeText: '是', inactiveText: '否', inlinePrompt: true }
            : field.valueType === 'date'
              ? { valueFormat: 'YYYY-MM-DD', class: '!w-full', placeholder: '选择模拟日期' }
              : { clearable: true, maxlength: 120, placeholder: `输入${field.label}` }
    }))
  )
  const result = computed(() => simulateWorkflow(config.value, contextFields.value, form.data))
  const outcomeMeta = computed<{
    label: string
    type: 'success' | 'warning' | 'danger'
  }>(() => {
    if (result.value.errorCount) return { label: '配置需修正', type: 'danger' }
    if (result.value.outcome === 'matched') return { label: '可进入审批', type: 'success' }
    if (result.value.outcome === 'auto-approved')
      return { label: '样例将自动通过', type: 'warning' }
    return { label: '样例被安全阻断', type: 'warning' }
  })
  const summaryItems = computed<SummaryItem[]>(() => [
    {
      label: '审批节点',
      value: config.value.nodes.length,
      icon: 'ri:node-tree',
      tone: 'primary'
    },
    {
      label: '条件命中',
      value: result.value.matchedCount,
      icon: 'ri:checkbox-circle-line',
      tone: 'success'
    },
    {
      label: '本次跳过',
      value: result.value.skippedCount,
      icon: 'ri:skip-forward-line',
      tone: 'warning'
    },
    {
      label: '阻断错误',
      value: result.value.errorCount,
      icon: 'ri:shield-flash-line',
      tone: result.value.errorCount ? 'danger' : 'success'
    }
  ])

  function fillExample(): void {
    form.data = createWorkflowSimulationContext(contextFields.value, config.value.nodes)
  }

  function clearContext(): void {
    form.data = Object.fromEntries(contextFields.value.map((field) => [field.key, undefined]))
  }

  async function handleOpen(data: SimulatorOpenData): Promise<void> {
    businessType.value = data.businessType
    businessTypeLabel.value = data.businessTypeLabel
    config.value = cloneDeep(data.config)
    fillExample()
    await dialogRef.value?.handleOpen(data, {
      title: '流程模拟与配置体检',
      contentMaxHeight: '78vh',
      showCancelButton: false,
      confirmText: '完成试跑',
      onConfirm: () => true
    })
  }

  defineExpose({ handleOpen })
</script>

<style scoped lang="scss">
  .workflow-simulator {
    display: grid;
    gap: 14px;
    min-width: 0;

    &__hero {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr) auto;
      gap: 14px;
      align-items: center;
      padding: 16px 18px;
      background: color-mix(in srgb, var(--theme-color) 7%, var(--el-bg-color));
      border: 1px solid color-mix(in srgb, var(--theme-color) 22%, var(--el-border-color));
      border-radius: var(--el-border-radius-base);
    }

    &__hero-icon {
      display: grid;
      place-items: center;
      width: 44px;
      height: 44px;
      font-size: 22px;
      color: var(--theme-color);
      background: color-mix(in srgb, var(--theme-color) 12%, var(--el-bg-color));
      border-radius: var(--el-border-radius-base);
    }

    &__hero-copy {
      display: grid;
      gap: 2px;
      min-width: 0;

      small {
        font-size: 11px;
        font-weight: 600;
        color: var(--theme-color);
        text-transform: uppercase;
        letter-spacing: 0.08em;
      }

      strong {
        overflow: hidden;
        text-overflow: ellipsis;
        font-size: 16px;
        color: var(--el-text-color-primary);
        white-space: nowrap;
      }

      p {
        margin: 0;
        font-size: 12px;
        color: var(--el-text-color-secondary);
      }
    }

    &__section {
      min-width: 0;
      padding: 18px;
    }

    &__section-header {
      display: flex;
      gap: 14px;
      align-items: flex-start;
      justify-content: space-between;
      margin-bottom: 14px;

      p {
        margin: 4px 0 0;
        font-size: 12px;
        color: var(--el-text-color-secondary);
      }

      > span {
        flex: 0 0 auto;
        font-size: 12px;
        color: var(--el-text-color-secondary);
      }
    }

    &__summary {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 10px;

      article {
        display: flex;
        gap: 11px;
        align-items: center;
        min-width: 0;
        padding: 14px;
        background: var(--el-bg-color);
        border: 1px solid var(--el-border-color-lighter);
        border-radius: var(--el-border-radius-base);

        > span {
          display: grid;
          flex: 0 0 auto;
          place-items: center;
          width: 34px;
          height: 34px;
          color: var(--theme-color);
          background: color-mix(in srgb, var(--theme-color) 9%, transparent);
          border-radius: var(--el-border-radius-small);
        }

        > div {
          display: grid;
          min-width: 0;
        }

        strong {
          font-size: 20px;
          line-height: 1.1;
          color: var(--el-text-color-primary);
        }

        small {
          margin-top: 3px;
          color: var(--el-text-color-secondary);
        }

        &.is-success > span {
          color: var(--el-color-success);
          background: var(--el-color-success-light-9);
        }

        &.is-warning > span {
          color: var(--el-color-warning);
          background: var(--el-color-warning-light-9);
        }

        &.is-danger > span {
          color: var(--el-color-danger);
          background: var(--el-color-danger-light-9);
        }
      }
    }

    &__trace-list,
    &__diagnostics {
      display: grid;
      gap: 8px;
      margin-top: 12px;
    }

    &__trace-list article {
      display: grid;
      grid-template-columns: 24px 30px minmax(0, 1fr) auto;
      gap: 9px;
      align-items: center;
      min-width: 0;
      padding: 10px 12px;
      background: var(--el-fill-color-extra-light);
      border: 1px solid var(--el-border-color-lighter);
      border-radius: var(--el-border-radius-small);

      > i {
        font-size: 11px;
        font-style: normal;
        color: var(--el-text-color-placeholder);
      }

      > span {
        display: grid;
        place-items: center;
        width: 28px;
        height: 28px;
        color: var(--el-text-color-secondary);
        background: var(--el-fill-color);
        border-radius: 50%;
      }

      > div {
        display: grid;
        gap: 3px;
        min-width: 0;
      }

      strong {
        display: flex;
        flex-wrap: wrap;
        gap: 7px;
        align-items: center;
        color: var(--el-text-color-primary);
      }

      small {
        overflow: hidden;
        text-overflow: ellipsis;
        color: var(--el-text-color-secondary);
        white-space: nowrap;
      }

      em {
        font-size: 12px;
        font-style: normal;
        color: var(--el-text-color-secondary);
      }

      &.is-matched {
        border-color: color-mix(in srgb, var(--el-color-success) 28%, var(--el-border-color));

        > span,
        > em {
          color: var(--el-color-success);
        }
      }
    }

    &__diagnostics article,
    &__healthy {
      display: flex;
      gap: 11px;
      align-items: flex-start;
      padding: 12px 14px;
      background: var(--el-fill-color-extra-light);
      border: 1px solid var(--el-border-color-lighter);
      border-radius: var(--el-border-radius-small);

      > span {
        display: grid;
        flex: 0 0 auto;
        place-items: center;
        width: 30px;
        height: 30px;
        font-size: 17px;
        border-radius: 50%;
      }

      > div {
        min-width: 0;
      }

      strong {
        color: var(--el-text-color-primary);
      }

      p {
        margin: 3px 0 0;
        font-size: 12px;
        line-height: 1.55;
        color: var(--el-text-color-secondary);
      }
    }

    &__diagnostics article {
      &.is-error {
        border-color: var(--el-color-danger-light-7);

        > span {
          color: var(--el-color-danger);
          background: var(--el-color-danger-light-9);
        }
      }

      &.is-warning {
        border-color: var(--el-color-warning-light-7);

        > span {
          color: var(--el-color-warning);
          background: var(--el-color-warning-light-9);
        }
      }

      &.is-info > span {
        color: var(--theme-color);
        background: color-mix(in srgb, var(--theme-color) 9%, transparent);
      }
    }

    &__healthy > span {
      color: var(--el-color-success);
      background: var(--el-color-success-light-9);
    }

    &__footer {
      display: flex;
      gap: 10px;
      align-items: center;
      width: 100%;

      > span {
        flex: 1;
      }
    }
  }

  @media (width <= 760px) {
    .workflow-simulator {
      &__hero {
        grid-template-columns: auto minmax(0, 1fr);

        > .el-tag {
          grid-column: 1 / -1;
          justify-self: start;
        }
      }

      &__summary {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      &__trace-list article {
        grid-template-columns: 20px 28px minmax(0, 1fr);

        > em {
          grid-column: 3;
        }
      }

      &__footer {
        flex-wrap: wrap;

        > span {
          display: none;
        }
      }
    }
  }

  @media (width <= 480px) {
    .workflow-simulator {
      &__summary {
        grid-template-columns: minmax(0, 1fr);
      }

      &__section-header {
        display: grid;
      }

      &__footer .el-button {
        flex: 1 1 calc(50% - 5px);
        margin-left: 0;
      }
    }
  }
</style>
