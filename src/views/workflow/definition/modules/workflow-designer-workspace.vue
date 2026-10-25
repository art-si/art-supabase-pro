<template>
  <ArtPageShell
    class="workflow-designer-page"
    full-height
    :loading="page.loading"
    loading-mode="skeleton"
    :error="page.error"
    @retry="initializePage"
  >
    <template #error-action>
      <ElButton type="primary" @click="emit('close')">返回流程管理</ElButton>
    </template>

    <div class="workflow-designer-page__layout">
      <ArtPageHeader
        class="workflow-designer-page__header"
        :title="form.data.name || '未命名流程'"
        :subtitle="isEdit ? '编辑草稿并发布不可变的新版本' : '从业务模板创建可复用审批流程'"
        show-back
        @back="emit('close')"
      >
        <template #status>
          <ElTag effect="plain">{{ isEdit ? '编辑模式' : '新建模式' }}</ElTag>
        </template>
        <template #meta>
          <span>{{ form.data.code || '待填写流程编码' }}</span>
          <i>·</i>
          <span>{{ contextFields.length }} 个业务字段</span>
          <i>·</i>
          <span>{{ form.data.config.nodes.length + 2 }} 个流程节点</span>
          <i>·</i>
          <span>手动保存</span>
        </template>

        <ElButton :disabled="!currentDefinition" @click="openVersionHistory">版本</ElButton>
        <ElButton :disabled="!form.data.config.nodes.length" @click="openSimulator">
          试运行
        </ElButton>
        <ElButton
          v-if="canSave"
          :loading="page.saving"
          :disabled="page.publishing || assigneeChecking"
          @click="saveDraft"
        >
          保存草稿
        </ElButton>
        <ElButton
          v-if="canSave && hasAuth('WorkflowDefinition:Publish')"
          type="primary"
          :loading="page.publishing"
          :disabled="page.saving || assigneeChecking"
          @click="publishVersion"
        >
          发布新版
        </ElButton>
      </ArtPageHeader>

      <nav class="workflow-designer-page__steps art-card-xs" aria-label="流程设计步骤">
        <button
          v-for="step in designerSteps"
          :key="step.key"
          type="button"
          :class="{
            'is-active': activeStep === step.key,
            'is-complete': step.complete
          }"
          :aria-current="activeStep === step.key ? 'step' : undefined"
          @click="activeStep = step.key"
        >
          <span aria-hidden="true">
            <ArtSvgIcon v-if="step.complete" icon="ri:check-line" />
            <template v-else>{{ step.key }}</template>
          </span>
          <span>
            <strong>{{ step.label }}</strong>
            <small>{{ step.description }}</small>
          </span>
        </button>
      </nav>

      <ElScrollbar class="workflow-designer-page__scrollbar" always>
        <div class="workflow-designer-page__content">
          <ArtAsyncState
            v-if="assigneeError"
            size="compact"
            :error="assigneeError"
            error-title="审批对象核验失败"
            @retry="validateAssigneeReferences"
          />
          <ArtSectionCard
            v-show="activeStep === 1"
            class="workflow-designer-page__basic"
            preserve-content-structure
          >
            <template #header>
              <div class="workflow-designer-page__section-heading">
                <ArtSectionTitle>基础信息</ArtSectionTitle>
                <p>先定义流程身份、所属租户与业务场景，后续字段和节点均围绕该对象配置。</p>
              </div>
            </template>
            <ArtForm
              ref="baseFormRef"
              v-model="form.data"
              :items="baseItems"
              :rules="baseRules"
              :span="12"
              :gutter="22"
              label-position="top"
              :show-reset="false"
              :show-submit="false"
            />
          </ArtSectionCard>

          <ArtSectionCard
            v-show="activeStep === 2"
            class="workflow-designer-page__fields"
            preserve-content-structure
          >
            <template #header>
              <div class="workflow-designer-page__section-heading is-split">
                <div>
                  <ArtSectionTitle>业务字段契约</ArtSectionTitle>
                  <p>
                    审批沿用业务原单，不另建低代码表单；这里只展示服务端允许进入审批上下文的字段。
                  </p>
                </div>
                <label class="workflow-designer-page__business-selector">
                  <span>当前业务场景</span>
                  <ElSelect
                    ref="businessTypeSelectRef"
                    v-model="form.data.businessType"
                    filterable
                    :disabled="identityLocked"
                    placeholder="选择具体业务类型"
                    @change="handleBusinessTypeChange"
                  >
                    <ElOption
                      v-for="option in businessTypeOptions"
                      :key="option.value"
                      :label="option.label"
                      :value="option.value"
                    />
                  </ElSelect>
                </label>
              </div>
            </template>

            <div class="workflow-designer-page__contract-summary">
              <article>
                <span><ArtSvgIcon icon="ri:briefcase-4-line" /></span>
                <div
                  ><small>业务场景</small><strong>{{ businessTypeLabel }}</strong></div
                >
              </article>
              <article>
                <span><ArtSvgIcon icon="ri:user-star-line" /></span>
                <div
                  ><small>业务负责人</small><strong>{{ businessContract.owner }}</strong></div
                >
              </article>
              <article>
                <span><ArtSvgIcon icon="ri:shield-check-line" /></span>
                <div>
                  <small>风险等级</small>
                  <strong>{{ businessContract.riskLevel === 'high' ? '高风险' : '中风险' }}</strong>
                </div>
              </article>
              <article>
                <span><ArtSvgIcon icon="ri:list-check-3" /></span>
                <div
                  ><small>可用字段</small><strong>{{ contextFields.length }} 个</strong></div
                >
              </article>
            </div>

            <div v-if="contextFields.length" class="workflow-designer-page__field-grid">
              <article v-for="field in contextFields" :key="field.key">
                <span aria-hidden="true"><ArtSvgIcon :icon="getFieldIcon(field.valueType)" /></span>
                <div>
                  <strong>{{ field.label }}</strong>
                  <small>{{ field.help || '由业务服务端生成审批快照' }}</small>
                  <em>{{ field.key }}</em>
                </div>
                <ElTag size="small" effect="plain">{{ getFieldTypeLabel(field.valueType) }}</ElTag>
              </article>
            </div>

            <ArtEmptyState
              v-else
              title="通用审批不声明结构化业务字段"
              description="它适合无条件流转；如需按金额、日期或业务状态设置条件，请在上方切换到具体业务场景。"
              size="compact"
              :visual-size="88"
            >
              <ElButton type="primary" plain @click="focusBusinessTypeSelector">
                <ArtSvgIcon icon="ri:exchange-2-line" />选择业务场景
              </ElButton>
            </ArtEmptyState>

            <ElAlert
              class="workflow-designer-page__contract-alert"
              type="info"
              :closable="false"
              show-icon
              title="字段契约由业务模块和服务端共同维护，流程设计器只能读取，不会复制或改写业务原表。"
            />
          </ArtSectionCard>

          <KeepAlive>
            <WorkflowCanvasEditor
              v-if="activeStep === 3"
              ref="workflowCanvasRef"
              v-model="form.data.config"
              :tenant-id="form.data.tenantId"
              :business-type="form.data.businessType"
              @request-step="activeStep = $event"
            />
          </KeepAlive>

          <ArtSectionCard
            v-show="activeStep === 4"
            class="workflow-designer-page__settings"
            preserve-content-structure
          >
            <template #header>
              <div class="workflow-designer-page__section-heading is-split">
                <div>
                  <ArtSectionTitle>发布与安全设置</ArtSectionTitle>
                  <p>发布前确认兜底策略、节点配置与不可变版本规则。</p>
                </div>
                <ElTag
                  :type="errorCount ? 'danger' : warningCount ? 'warning' : 'success'"
                  effect="light"
                >
                  {{ publishReadinessLabel }}
                </ElTag>
              </div>
            </template>

            <div class="workflow-designer-page__release-overview">
              <article :class="{ 'is-danger': errorCount }">
                <span
                  ><ArtSvgIcon :icon="errorCount ? 'ri:close-circle-line' : 'ri:shield-check-line'"
                /></span>
                <div>
                  <small>发布状态</small>
                  <strong>{{ errorCount ? '暂不可发布' : '允许发布' }}</strong>
                </div>
                <em>{{ errorCount ? `${errorCount} 个阻断` : '安全检查通过' }}</em>
              </article>
              <article>
                <span><ArtSvgIcon icon="ri:flow-chart" /></span>
                <div>
                  <small>审批节点</small>
                  <strong
                    >{{ configuredNodeCount }}/{{ form.data.config.nodes.length }} 已配置</strong
                  >
                </div>
                <em>另含发起与结束</em>
              </article>
              <article>
                <span><ArtSvgIcon icon="ri:database-2-line" /></span>
                <div>
                  <small>业务契约</small>
                  <strong>{{ contextFields.length }} 个字段</strong>
                </div>
                <em>{{ businessTypeLabel }}</em>
              </article>
            </div>

            <div class="workflow-designer-page__settings-grid">
              <section class="workflow-designer-page__settings-form">
                <header class="workflow-designer-page__card-heading">
                  <span><ArtSvgIcon icon="ri:shield-keyhole-line" /></span>
                  <div>
                    <strong>安全发布策略</strong>
                    <small>决定没有任何节点命中时系统如何处理</small>
                  </div>
                </header>
                <ArtForm
                  v-model="form.data"
                  :items="settingItems"
                  :span="24"
                  label-position="top"
                  :show-reset="false"
                  :show-submit="false"
                />

                <div class="workflow-designer-page__version-policy">
                  <div class="workflow-designer-page__card-heading is-compact">
                    <span><ArtSvgIcon icon="ri:git-repository-line" /></span>
                    <div>
                      <strong>版本与审计</strong>
                      <small>每次发布都会生成不可变快照</small>
                    </div>
                  </div>
                  <ul>
                    <li><ArtSvgIcon icon="ri:lock-line" />发布版本不可直接修改</li>
                    <li><ArtSvgIcon icon="ri:git-commit-line" />新实例只使用最新发布版本</li>
                    <li><ArtSvgIcon icon="ri:history-line" />运行中实例继续绑定原版本快照</li>
                    <li><ArtSvgIcon icon="ri:file-shield-2-line" />审批动作与业务回写完整留痕</li>
                  </ul>
                </div>
              </section>

              <section class="workflow-designer-page__diagnostics">
                <header>
                  <div class="workflow-designer-page__card-heading">
                    <span><ArtSvgIcon icon="ri:pulse-line" /></span>
                    <div>
                      <strong>发布前体检</strong>
                      <small>{{ diagnosticSummary }}</small>
                    </div>
                  </div>
                  <ElButton plain :disabled="!form.data.config.nodes.length" @click="openSimulator">
                    试运行
                  </ElButton>
                </header>

                <div v-if="diagnostics.length" class="workflow-designer-page__diagnostic-list">
                  <article
                    v-for="diagnostic in diagnostics"
                    :key="`${diagnostic.code}-${diagnostic.nodeKey || 'global'}`"
                    :class="`is-${diagnostic.severity}`"
                  >
                    <span aria-hidden="true">
                      <ArtSvgIcon :icon="getDiagnosticIcon(diagnostic.severity)" />
                    </span>
                    <div>
                      <strong>{{ diagnostic.title }}</strong>
                      <small>{{ diagnostic.description }}</small>
                    </div>
                    <footer class="workflow-designer-page__diagnostic-actions">
                      <ElButton
                        v-if="diagnostic.nodeKey"
                        size="small"
                        plain
                        :type="getDiagnosticActionType(diagnostic.severity)"
                        @click="locateDiagnosticNode(diagnostic.nodeKey)"
                      >
                        {{ getDiagnosticActionLabel(diagnostic.severity) }}
                        <ArtSvgIcon icon="ri:arrow-right-line" />
                      </ElButton>
                      <ElTag
                        v-else
                        :type="getDiagnosticActionType(diagnostic.severity)"
                        size="small"
                        effect="light"
                      >
                        {{ getDiagnosticLabel(diagnostic.severity) }}
                      </ElTag>
                    </footer>
                  </article>
                </div>

                <div v-else class="workflow-designer-page__diagnostic-success">
                  <span><ArtSvgIcon icon="ri:checkbox-circle-line" /></span>
                  <strong>流程配置完整</strong>
                  <small>未发现阻断发布的问题，可以保存草稿或发布新版。</small>
                </div>
              </section>
            </div>
          </ArtSectionCard>
        </div>
      </ElScrollbar>
    </div>

    <WorkflowSimulatorDialog ref="simulatorDialogRef" />
    <WorkflowVersionHistoryDialog ref="versionHistoryRef" @success="initializePage" />
  </ArtPageShell>
</template>

<script setup lang="ts">
  import ArtSectionCard from '@/components/core/surfaces/art-section-card/index.vue'
  import type { FormRules } from 'element-plus'
  import { cloneDeep, isEqual, trim } from 'lodash-es'
  import { normalizeNullableText } from '@/utils/form/normalize'
  import { notifyFriendlyError } from '@/hooks/core/useArtFeedback'
  import ArtEmptyState from '@/components/core/feedback/art-empty-state/index.vue'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import ArtPageHeader from '@/components/core/layouts/art-page-header/index.vue'
  import ArtPageShell from '@/components/core/layouts/art-page-shell/index.vue'
  import ArtSectionTitle from '@/components/core/surfaces/art-section-title/index.vue'
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
  import { useArtFeedback } from '@/hooks/core/useArtFeedback'
  import { useUserStore } from '@/store/modules/user'
  import { useAuth } from '@/hooks/core/useAuth'
  import { useTenantScopeStore } from '@/store/modules/tenant-scope'
  import { fetchEnabledTenantList } from '@/api/system-manage/tenant'
  import {
    fetchWorkflowDefinitionDetail,
    fetchWorkflowUserOptions,
    fetchWorkflowRoleOptions,
    publishWorkflowDefinition,
    saveWorkflowDefinition
  } from '@/api/workflow'
  import {
    getWorkflowBusinessContract,
    type WorkflowBusinessContract
  } from '../../modules/workflow-business-contracts'
  import {
    inspectWorkflowConfig,
    inspectWorkflowAssigneeReferences,
    type WorkflowDiagnostic,
    type WorkflowDiagnosticSeverity
  } from '../../modules/workflow-simulator'
  import WorkflowCanvasEditor from './workflow-canvas-editor.vue'
  import WorkflowSimulatorDialog from './workflow-simulator-dialog.vue'
  import WorkflowVersionHistoryDialog from './workflow-version-history-dialog.vue'
  import { normalizeWorkflowCanvasLayout } from './workflow-layout'
  import { createWorkflowTemplateDraft } from './workflow-templates'

  defineOptions({ name: 'WorkflowDesignerWorkspace' })

  interface DesignerForm extends Api.Workflow.WorkflowDefinitionSavePayload {
    id?: string
  }

  interface FormExpose {
    validate: () => Promise<boolean>
    clearValidate: () => void
  }

  interface SelectExpose {
    focus: () => void
  }

  interface WorkflowCanvasExpose {
    selectNode: (nodeKey: string) => void
  }

  interface SimulatorDialogExpose {
    handleOpen: (data: {
      businessType: string
      businessTypeLabel: string
      config: Api.Workflow.WorkflowConfig
    }) => Promise<void>
  }

  interface VersionHistoryExpose {
    handleOpen: (
      row: Api.Workflow.WorkflowDefinitionRecord,
      options?: { canManage?: boolean }
    ) => Promise<void>
  }

  interface PageGroup {
    loading: boolean
    saving: boolean
    publishing: boolean
    error: string
  }

  interface DesignerStep {
    key: 1 | 2 | 3 | 4
    label: string
    description: string
    complete: boolean
  }

  const props = defineProps<{ definitionId?: string; templateKey?: string }>()
  const emit = defineEmits<{ close: []; saved: [definitionId: string] }>()
  const userStore = useUserStore()
  const { getDictMap, isPlatformSuper, getUserInfo } = storeToRefs(userStore)
  const { hasAuth } = useAuth()
  const tenantScopeStore = useTenantScopeStore()
  const { confirmAction } = useArtFeedback()
  const baseFormRef = ref<FormExpose>()
  const businessTypeSelectRef = ref<SelectExpose>()
  const workflowCanvasRef = ref<WorkflowCanvasExpose>()
  const simulatorDialogRef = ref<SimulatorDialogExpose>()
  const versionHistoryRef = ref<VersionHistoryExpose>()
  const activeStep = ref<1 | 2 | 3 | 4>(1)
  const identityLocked = ref(false)
  const currentDefinition = shallowRef<Api.Workflow.WorkflowDefinitionRecord>()
  const page = reactive<PageGroup>({ loading: false, saving: false, publishing: false, error: '' })
  const assigneeChecking = ref(false)
  const assigneeError = shallowRef<Error | null>(null)
  let assigneeRevision = 0
  const form = reactive<{ data: DesignerForm }>({
    data: createWorkflowTemplateDraft(props.templateKey || 'custom')
  })

  const isEdit = computed(() =>
    Boolean(form.data.id || (props.definitionId && props.definitionId !== 'new'))
  )
  const businessContract = computed<WorkflowBusinessContract>(() =>
    getWorkflowBusinessContract(form.data.businessType)
  )
  const canSave = computed(() =>
    hasAuth(isEdit.value ? 'WorkflowDefinition:Edit' : 'WorkflowDefinition:Add')
  )
  const contextFields = computed(() => businessContract.value.fields)
  const businessTypeOptions = computed(() => getDictMap.value.workflowBusinessType ?? [])
  const businessTypeLabel = computed(
    () =>
      businessTypeOptions.value.find((item) => item.value === form.data.businessType)?.label ||
      businessContract.value.label ||
      '通用审批'
  )
  const diagnostics = computed<WorkflowDiagnostic[]>(() =>
    inspectWorkflowConfig(form.data.config, contextFields.value)
  )
  const errorCount = computed(
    () => diagnostics.value.filter((item) => item.severity === 'error').length
  )
  const warningCount = computed(
    () => diagnostics.value.filter((item) => item.severity === 'warning').length
  )
  const configuredNodeCount = computed(
    () =>
      form.data.config.nodes.filter((node) => {
        const count =
          node.assignee.type === 'users'
            ? node.assignee.userIds?.length
            : node.assignee.roleCodes?.length
        return Boolean(trim(node.name)) && (node.assignee.type === 'initiator' || Boolean(count))
      }).length
  )
  const diagnosticSummary = computed(() => {
    if (errorCount.value) return `${errorCount.value} 个阻断问题，发布前必须修复`
    if (warningCount.value) return `${warningCount.value} 个风险提示，建议确认后发布`
    return '配置检查已通过'
  })
  const publishReadinessLabel = computed(() => {
    if (errorCount.value) return `${errorCount.value} 个阻断问题`
    if (warningCount.value) return `${warningCount.value} 个风险待确认`
    return '已通过发布检查'
  })
  const designerSteps = computed<DesignerStep[]>(() => [
    {
      key: 1,
      label: '基础信息',
      description: '流程身份与业务场景',
      complete: Boolean(
        trim(form.data.code) && trim(form.data.name) && form.data.businessType && form.data.tenantId
      )
    },
    {
      key: 2,
      label: '业务字段',
      description: '审批上下文契约',
      complete: Boolean(form.data.businessType)
    },
    {
      key: 3,
      label: '流程设计',
      description: '审批人、时限与条件',
      complete:
        form.data.config.nodes.length > 0 &&
        configuredNodeCount.value === form.data.config.nodes.length
    },
    {
      key: 4,
      label: '发布设置',
      description: '安全策略与配置体检',
      complete: errorCount.value === 0
    }
  ])

  const baseRules = computed<FormRules<DesignerForm>>(() => ({
    tenantId: [{ required: true, message: '请选择流程所属租户', trigger: 'change' }],
    code: [
      { required: true, message: '请输入流程编码', trigger: 'blur' },
      {
        pattern: /^[A-Za-z][A-Za-z0-9_.-]{1,63}$/,
        message: '以字母开头，可使用字母、数字、点、横线和下划线',
        trigger: 'blur'
      }
    ],
    name: [{ required: true, message: '请输入流程名称', trigger: 'blur' }],
    businessType: [{ required: true, message: '请选择业务类型', trigger: 'change' }]
  }))

  const baseItems = computed<FormItem[]>(() => [
    {
      label: '所属租户',
      key: 'tenantId',
      hidden: !isPlatformSuper.value,
      type: 'select',
      span: 24,
      help: form.data.id
        ? '流程归属租户不可变更；平台超级管理员正在进行跨租户维护。'
        : '流程只服务所选租户，同一流程编码可在不同租户独立配置。',
      api: fetchEnabledTenantList,
      resultField: 'data',
      valueField: 'id',
      labelFn: (tenant) => `${tenant.tenantName}（${tenant.tenantCode}）`,
      props: {
        filterable: true,
        placeholder: '选择流程所属租户',
        disabled: Boolean(form.data.id),
        onChange: handleTenantChange
      }
    },
    {
      label: '流程编码',
      key: 'code',
      type: 'input',
      help: '发布后编码与业务类型保持锁定。',
      props: {
        maxlength: 64,
        placeholder: '例如 waybill_cost_approval',
        disabled: identityLocked.value
      }
    },
    {
      label: '流程名称',
      key: 'name',
      type: 'input',
      props: { maxlength: 80, placeholder: '例如 运单费用审批' }
    },
    {
      label: '业务类型',
      key: 'businessType',
      type: 'select',
      props: {
        options: businessTypeOptions.value,
        placeholder: '选择已有业务审批场景',
        disabled: identityLocked.value,
        onChange: handleBusinessTypeChange
      }
    },
    {
      label: '版本说明',
      key: 'changeNote',
      type: 'textarea',
      span: 24,
      props: { maxlength: 200, placeholder: '说明本次流程配置变更内容' }
    },
    {
      label: '流程说明',
      key: 'description',
      type: 'input',
      span: 24,
      props: {
        type: 'textarea',
        rows: 3,
        maxlength: 500,
        showWordLimit: true,
        placeholder: '给发起人和审批人看的简短业务说明'
      }
    }
  ])

  const settingItems = computed<FormItem[]>(() => [
    {
      label: '全条件未命中策略',
      key: 'config.allowAutoApprove',
      type: 'switch',
      help: '默认安全阻断，防止上下文字段缺失导致业务单据被静默放行。仅明确允许时开启自动通过。',
      props: { activeText: '自动通过', inactiveText: '安全阻断', inlinePrompt: true }
    }
  ])

  function handleTenantChange(): void {
    form.data.config.nodes.forEach((node) => {
      node.assignee.userIds = []
      node.assignee.roleCodes = []
    })
  }

  function handleBusinessTypeChange(): void {
    const allowedFields = new Set(contextFields.value.map((field) => field.key))
    form.data.config.nodes.forEach((node) => {
      if (node.condition.field && !allowedFields.has(node.condition.field)) {
        node.condition = { operator: 'always' }
      }
    })
  }

  function focusBusinessTypeSelector(): void {
    businessTypeSelectRef.value?.focus()
  }

  async function locateDiagnosticNode(nodeKey: string): Promise<void> {
    activeStep.value = 3
    await nextTick()
    workflowCanvasRef.value?.selectNode(nodeKey)
  }

  function getFieldIcon(valueType: Api.Workflow.WorkflowContextField['valueType']): string {
    const icons: Record<Api.Workflow.WorkflowContextField['valueType'], string> = {
      text: 'ri:text',
      number: 'ri:hashtag',
      boolean: 'ri:toggle-line',
      date: 'ri:calendar-line'
    }
    return icons[valueType]
  }

  function getFieldTypeLabel(valueType: Api.Workflow.WorkflowContextField['valueType']): string {
    const labels: Record<Api.Workflow.WorkflowContextField['valueType'], string> = {
      text: '文本',
      number: '数值',
      boolean: '是/否',
      date: '日期'
    }
    return labels[valueType]
  }

  function getDiagnosticIcon(severity: WorkflowDiagnosticSeverity): string {
    return severity === 'error'
      ? 'ri:error-warning-line'
      : severity === 'warning'
        ? 'ri:alert-line'
        : 'ri:information-line'
  }

  function getDiagnosticActionType(
    severity: WorkflowDiagnosticSeverity
  ): 'danger' | 'warning' | 'info' {
    return severity === 'error' ? 'danger' : severity === 'warning' ? 'warning' : 'info'
  }

  function getDiagnosticActionLabel(severity: WorkflowDiagnosticSeverity): string {
    return severity === 'error' ? '修复配置' : severity === 'warning' ? '检查配置' : '查看详情'
  }

  function getDiagnosticLabel(severity: WorkflowDiagnosticSeverity): string {
    return severity === 'error' ? '需修复' : severity === 'warning' ? '需确认' : '提示'
  }

  function normalizePayload(): DesignerForm {
    const payload = cloneDeep(toRaw(form.data))
    payload.code = trim(payload.code)
    payload.name = trim(payload.name)
    payload.description = normalizeNullableText(payload.description)
    payload.changeNote = normalizeNullableText(payload.changeNote)
    payload.config.layout = normalizeWorkflowCanvasLayout(
      payload.config.layout,
      payload.config.nodes
    )
    payload.config.nodes.forEach((node, index) => {
      node.order = index + 1
      node.name = trim(node.name)
      node.approvalThresholdPercent =
        node.approvalMode === 'percentage' ? Number(node.approvalThresholdPercent || 67) : 100
      node.rejectVetoEnabled = node.approvalMode === 'all' ? true : (node.rejectVetoEnabled ?? true)
      node.dueHours = Number(node.dueHours || 24)
      node.reminderBeforeMinutes = Number(node.reminderBeforeMinutes ?? 60)
      node.escalationEnabled = node.escalationEnabled ?? true
      node.escalateAfterHours = Number(node.escalateAfterHours || 4)
      node.assignee.userIds = node.assignee.type === 'users' ? node.assignee.userIds || [] : []
      node.assignee.roleCodes = node.assignee.type === 'roles' ? node.assignee.roleCodes || [] : []
      if (node.condition.operator === 'always') {
        node.condition = { operator: 'always' }
      } else if (node.condition.operator === 'not_empty') {
        delete node.condition.value
      } else if (node.condition.operator === 'in') {
        node.condition.value = Array.isArray(node.condition.value)
          ? node.condition.value
          : String(node.condition.value ?? '')
              .split(',')
              .map((value) => trim(value))
              .filter(Boolean)
      } else {
        const field = contextFields.value.find((item) => item.key === node.condition.field)
        if (field?.valueType === 'number' && node.condition.value !== '') {
          node.condition.value = Number(node.condition.value)
        }
      }
    })
    return payload
  }

  async function validateAssigneeReferences(): Promise<boolean> {
    if (assigneeChecking.value) return false
    const tenantId = form.data.tenantId
    if (!tenantId) return false
    const revision = ++assigneeRevision
    const nodes = cloneDeep(form.data.config.nodes)
    const definitionId = props.definitionId
    const isCurrent = () =>
      revision === assigneeRevision &&
      props.definitionId === definitionId &&
      tenantId === form.data.tenantId &&
      isEqual(nodes, form.data.config.nodes)
    assigneeChecking.value = true
    assigneeError.value = null
    try {
      const [users, roles] = await Promise.all([
        nodes.some((node) => node.assignee.type === 'users')
          ? fetchWorkflowUserOptions({ tenantId }, { showErrorMessage: false })
          : Promise.resolve({ data: [], error: null }),
        nodes.some((node) => node.assignee.type === 'roles')
          ? fetchWorkflowRoleOptions({ tenantId }, { showErrorMessage: false })
          : Promise.resolve({ data: [], error: null })
      ])
      if (!isCurrent()) return false
      if (users.error) throw users.error
      if (roles.error) throw roles.error
      const issues = inspectWorkflowAssigneeReferences(nodes, users.data ?? [], roles.data ?? [])
      if (issues.length) {
        assigneeError.value = new Error(issues.map((item) => item.description).join('；'))
        if (issues[0].nodeKey) await locateDiagnosticNode(issues[0].nodeKey)
        return false
      }
      return true
    } catch (cause) {
      if (isCurrent())
        assigneeError.value = new Error('审批成员或角色读取失败，请重新加载。草稿内容已保留。', {
          cause
        })
      return false
    } finally {
      if (revision === assigneeRevision) assigneeChecking.value = false
    }
  }

  watch(
    () => [form.data.tenantId, props.definitionId],
    () => {
      assigneeRevision += 1
      assigneeChecking.value = false
      assigneeError.value = null
    }
  )
  onUnmounted(() => {
    assigneeRevision += 1
  })

  async function validateDesigner(): Promise<boolean> {
    try {
      await baseFormRef.value?.validate()
    } catch {
      activeStep.value = 1
      return false
    }
    const firstError = diagnostics.value.find((item) => item.severity === 'error')
    if (firstError) {
      activeStep.value = firstError.nodeKey ? 3 : 4
      ElMessage.warning(firstError.description)
      return false
    }
    return validateAssigneeReferences()
  }

  async function persistDraft(): Promise<string | null> {
    if (!canSave.value || page.saving || page.publishing || assigneeChecking.value) return null
    const payload = normalizePayload()
    if (!(await validateDesigner())) return null
    if (!isEqual(payload, normalizePayload())) return null
    const revision = assigneeRevision
    const isCurrent = () => revision === assigneeRevision
    page.saving = true
    try {
      const response = await saveWorkflowDefinition(payload, {
        showMessage: false,
        showErrorMessage: false
      })
      if (!isCurrent()) return null
      const saved = response.data
      const definitionId = saved?.definitionId || form.data.id
      if (!definitionId) return null
      ElMessage.success('流程草稿已保存')
      if (!isEqual(payload, normalizePayload())) {
        ElMessage.warning('草稿已保存，保存期间的新修改仍保留在页面，请再次保存')
        form.data.id = definitionId
        return definitionId
      }
      form.data.id = definitionId
      const refreshInput = cloneDeep(toRaw(form.data))
      try {
        await loadDefinition(
          definitionId,
          () => isCurrent() && isEqual(refreshInput, form.data),
          false
        )
      } catch {
        if (isCurrent()) ElMessage.warning('草稿已保存，但详情刷新失败，请稍后重新加载')
      }
      if (!isCurrent()) return null
      if (props.definitionId === 'new') emit('saved', definitionId)
      return definitionId
    } catch (error) {
      if (isCurrent()) notifyFriendlyError(error, '流程草稿保存失败，请稍后重试')
      return null
    } finally {
      page.saving = false
    }
  }

  async function saveDraft(): Promise<void> {
    await persistDraft()
  }

  async function publishVersion(): Promise<void> {
    if (
      !canSave.value ||
      !hasAuth('WorkflowDefinition:Publish') ||
      page.saving ||
      page.publishing ||
      assigneeChecking.value
    )
      return
    const payload = normalizePayload()
    if (!(await validateDesigner())) return
    if (!isEqual(payload, normalizePayload())) {
      ElMessage.warning('流程内容已变化，请重新核验后发布')
      return
    }
    const revision = assigneeRevision
    let draftSaved = false
    let published = false
    page.publishing = true
    try {
      try {
        await confirmAction(
          `发布“${payload.name || '未命名流程'}”后，新实例会立即使用本次配置，已运行实例仍保留原版本。`,
          {
            title: '发布流程新版',
            confirmButtonText: '保存并发布',
            type: 'warning'
          }
        )
      } catch (error) {
        if (error === 'cancel' || error === 'close') return
        throw error
      }
      if (revision !== assigneeRevision) return
      if (!canSave.value || !hasAuth('WorkflowDefinition:Publish')) return
      if (!isEqual(payload, normalizePayload())) {
        ElMessage.warning('流程内容已变化，请重新核验后发布')
        return
      }
      const response = await saveWorkflowDefinition(payload, {
        showMessage: false,
        showErrorMessage: false
      })
      const definitionId = response.data?.definitionId || form.data.id
      if (!definitionId) return
      if (revision !== assigneeRevision) return
      draftSaved = true
      if (!isEqual(payload, normalizePayload())) {
        form.data.id = definitionId
        ElMessage.warning('草稿已保存，内容已变化，请重新核验后发布')
        return
      }
      form.data.id = definitionId
      await publishWorkflowDefinition(definitionId, { showMessage: false, showErrorMessage: false })
      if (revision !== assigneeRevision) return
      published = true
      ElMessage.success('流程发布成功')
      if (!isEqual({ ...payload, id: definitionId }, normalizePayload())) {
        ElMessage.warning('流程已发布，页面上的新修改尚未保存，请再次保存')
        return
      }
      const refreshInput = cloneDeep(toRaw(form.data))
      await loadDefinition(
        definitionId,
        () => revision === assigneeRevision && isEqual(refreshInput, form.data),
        false
      )
      if (revision !== assigneeRevision) return
      if (props.definitionId === 'new') emit('saved', definitionId)
    } catch (error) {
      if (revision !== assigneeRevision) return
      if (published) ElMessage.warning('流程已发布，但详情刷新失败，请稍后重新加载')
      else if (draftSaved) ElMessage.warning('草稿已保存，但发布失败，请稍后重试发布')
      else notifyFriendlyError(error, '流程保存失败，尚未发布，请稍后重试')
    } finally {
      page.publishing = false
    }
  }

  function openSimulator(): void {
    void simulatorDialogRef.value?.handleOpen({
      businessType: form.data.businessType,
      businessTypeLabel: businessTypeLabel.value,
      config: cloneDeep(toRaw(form.data.config))
    })
  }

  function openVersionHistory(): void {
    if (currentDefinition.value) {
      void versionHistoryRef.value?.handleOpen(currentDefinition.value, {
        canManage: hasAuth('WorkflowDefinition:Edit')
      })
    }
  }

  function normalizeLoadedNode(node: Api.Workflow.WorkflowNode): Api.Workflow.WorkflowNode {
    return {
      ...node,
      approvalThresholdPercent: node.approvalThresholdPercent ?? 67,
      rejectVetoEnabled: node.approvalMode === 'all' ? true : (node.rejectVetoEnabled ?? true),
      reminderBeforeMinutes: node.reminderBeforeMinutes ?? 60,
      escalationEnabled: node.escalationEnabled ?? true,
      escalateAfterHours: node.escalateAfterHours ?? 4
    }
  }

  async function loadDefinition(
    definitionId: string,
    isCurrent: () => boolean = () => true,
    showErrorMessage = true
  ): Promise<void> {
    const response = await fetchWorkflowDefinitionDetail(definitionId, { showErrorMessage })
    if (!isCurrent()) return
    const detail = response.data
    if (!detail) throw new Error('流程定义不存在')
    currentDefinition.value = detail
    identityLocked.value = Boolean(detail.currentVersionId)
    const versions = [...(detail.versions || [])].sort(
      (left, right) => right.versionNo - left.versionNo
    )
    const editableVersion =
      versions.find((version) => version.status === 'draft') ||
      versions.find((version) => version.id === detail.currentVersionId) ||
      versions[0]
    form.data = {
      id: detail.id,
      tenantId: detail.tenantId,
      code: detail.code,
      name: detail.name,
      businessType: detail.businessType,
      description: detail.description || '',
      changeNote: editableVersion?.changeNote || '',
      config: cloneDeep(editableVersion?.config || { nodes: [], allowAutoApprove: false })
    }
    form.data.config.allowAutoApprove = form.data.config.allowAutoApprove ?? false
    form.data.config.nodes = form.data.config.nodes.map(normalizeLoadedNode)
    await nextTick()
    baseFormRef.value?.clearValidate()
  }

  async function initializePage(): Promise<void> {
    page.loading = true
    page.error = ''
    currentDefinition.value = undefined
    identityLocked.value = false
    activeStep.value = 1
    try {
      await userStore.fetchDictList()
      if (
        !hasAuth(
          props.definitionId && props.definitionId !== 'new'
            ? 'WorkflowDefinition:Edit'
            : 'WorkflowDefinition:Add'
        )
      ) {
        page.error = '当前账号没有流程配置权限，请联系租户管理员授权。'
        return
      }
      if (isEdit.value && props.definitionId) {
        await loadDefinition(props.definitionId)
      } else {
        form.data = createWorkflowTemplateDraft(props.templateKey || 'custom')
        form.data.tenantId = tenantScopeStore.effectiveTenantId || getUserInfo.value.tenantId
        await nextTick()
        baseFormRef.value?.clearValidate()
      }
    } catch {
      page.error = '流程设计器加载失败，请稍后重试。'
    } finally {
      page.loading = false
    }
  }

  watch(
    () => [props.definitionId, props.templateKey],
    () => void initializePage(),
    { immediate: true }
  )
</script>

<style scoped lang="scss">
  .workflow-designer-page {
    :deep(> .art-async-state) {
      display: grid;
      min-height: 0;
    }

    &__layout {
      display: grid;
      grid-template-rows: auto auto minmax(0, 1fr);
      gap: var(--art-space-3);
      min-width: 0;
      min-height: 0;
    }

    &__header {
      :deep(.art-page-header__meta) {
        display: flex;
        flex-wrap: wrap;
        gap: 5px;
        align-items: center;

        i {
          font-style: normal;
          color: var(--art-gray-400);
        }
      }
    }

    &__steps {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));

      > button {
        position: relative;
        display: flex;
        gap: 10px;
        align-items: center;
        min-width: 0;
        min-height: 66px;
        padding: var(--art-space-2) var(--art-space-4);
        color: var(--art-gray-600);
        text-align: left;
        cursor: pointer;
        background: transparent;
        border: 0;

        &::after {
          position: absolute;
          right: 0;
          bottom: 0;
          left: 0;
          height: 2px;
          content: '';
          background: transparent;
          transition: background-color var(--art-motion-duration-fast) ease;
        }

        > span:first-child {
          display: grid;
          flex: none;
          place-items: center;
          width: 28px;
          height: 28px;
          font-size: 12px;
          color: var(--art-gray-600);
          background: var(--art-gray-100);
          border: 1px solid var(--art-gray-200);
          border-radius: 50%;
        }

        > span:last-child {
          display: grid;
          gap: 2px;
          min-width: 0;
        }

        strong {
          color: var(--art-gray-800);
        }

        small {
          overflow: hidden;
          text-overflow: ellipsis;
          font-size: 11px;
          white-space: nowrap;
        }

        &.is-complete > span:first-child {
          color: var(--el-color-success);
          background: var(--el-color-success-light-9);
          border-color: var(--el-color-success-light-5);
        }

        &:hover,
        &:focus-visible,
        &.is-active {
          color: var(--theme-color);
          background: color-mix(in srgb, var(--theme-color) 5%, transparent);

          &::after {
            background: var(--theme-color);
          }

          > span:first-child {
            color: var(--theme-color);
            background: color-mix(in srgb, var(--theme-color) 10%, var(--el-bg-color));
            border-color: color-mix(in srgb, var(--theme-color) 45%, var(--art-gray-200));
          }
        }

        &:focus-visible {
          outline: 2px solid color-mix(in srgb, var(--theme-color) 38%, transparent);
          outline-offset: -2px;
        }
      }
    }

    &__scrollbar {
      min-height: 0;
    }

    &__content {
      min-width: 0;
      padding-bottom: var(--art-space-3);

      > section {
        min-height: 560px;
      }

      > .workflow-canvas-editor {
        min-height: 650px;
      }
    }

    &__basic,
    &__fields,
    &__settings {
      width: 100%;
      padding: var(--art-space-6);
    }

    &__section-heading {
      margin-bottom: var(--art-space-5);

      p {
        margin: 5px 0 0;
        font-size: 12px;
        line-height: 1.6;
        color: var(--art-gray-600);
      }

      &.is-split {
        display: flex;
        gap: var(--art-space-5);
        align-items: flex-start;
        justify-content: space-between;

        > div {
          min-width: 0;
        }
      }
    }

    &__business-selector {
      display: grid;
      flex: 0 0 min(360px, 34vw);
      gap: 6px;

      > span {
        font-size: 11px;
        color: var(--art-gray-600);
      }
    }

    &__contract-summary {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: var(--art-space-3);
      margin-bottom: var(--art-space-5);

      article {
        display: flex;
        gap: 10px;
        align-items: center;
        min-width: 0;
        padding: var(--art-space-4);
        background: var(--art-gray-50);
        border-radius: var(--el-border-radius-base);

        > span {
          display: grid;
          flex: none;
          place-items: center;
          width: 34px;
          height: 34px;
          color: var(--theme-color);
          background: color-mix(in srgb, var(--theme-color) 10%, var(--el-bg-color));
          border-radius: var(--el-border-radius-base);
        }

        > div {
          display: grid;
          min-width: 0;
        }

        small {
          font-size: 11px;
          color: var(--art-gray-600);
        }

        strong {
          overflow: hidden;
          text-overflow: ellipsis;
          color: var(--art-gray-900);
          white-space: nowrap;
        }
      }
    }

    &__field-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: var(--art-space-3);

      article {
        display: grid;
        grid-template-columns: 38px minmax(0, 1fr) auto;
        gap: var(--art-space-3);
        align-items: start;
        min-width: 0;
        padding: var(--art-space-4);
        background: var(--el-bg-color);
        border: 1px solid var(--art-gray-200);
        border-radius: var(--el-border-radius-base);

        > span {
          display: grid;
          place-items: center;
          width: 38px;
          height: 38px;
          color: var(--theme-color);
          background: color-mix(in srgb, var(--theme-color) 9%, var(--el-bg-color));
          border-radius: var(--el-border-radius-base);
        }

        > div {
          display: grid;
          gap: 3px;
          min-width: 0;
        }

        strong {
          color: var(--art-gray-900);
        }

        small,
        em {
          overflow: hidden;
          text-overflow: ellipsis;
          font-size: 11px;
          white-space: nowrap;
        }

        small {
          color: var(--art-gray-600);
        }

        em {
          font-style: normal;
          color: var(--art-gray-500);
        }
      }
    }

    &__contract-alert {
      margin-top: var(--art-space-5);
    }

    &__release-overview {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: var(--art-space-3);
      margin-bottom: var(--art-space-4);

      article {
        display: grid;
        grid-template-columns: 38px minmax(0, 1fr) auto;
        gap: 11px;
        align-items: center;
        min-width: 0;
        padding: var(--art-space-4);
        background: var(--art-gray-50);
        border: 1px solid var(--art-gray-200);
        border-radius: var(--el-border-radius-base);

        > span {
          display: grid;
          place-items: center;
          width: 38px;
          height: 38px;
          font-size: 18px;
          color: var(--theme-color);
          background: color-mix(in srgb, var(--theme-color) 10%, var(--el-bg-color));
          border-radius: var(--el-border-radius-base);
        }

        > div {
          display: grid;
          min-width: 0;
        }

        small,
        em {
          overflow: hidden;
          text-overflow: ellipsis;
          font-size: 11px;
          font-style: normal;
          color: var(--art-gray-600);
          white-space: nowrap;
        }

        strong {
          overflow: hidden;
          text-overflow: ellipsis;
          color: var(--art-gray-900);
          white-space: nowrap;
        }

        em {
          max-width: 150px;
          text-align: right;
        }

        &.is-danger {
          border-color: var(--el-color-danger-light-7);

          > span {
            color: var(--el-color-danger);
            background: var(--el-color-danger-light-9);
          }
        }
      }
    }

    &__settings-grid {
      display: grid;
      grid-template-columns: minmax(320px, 0.82fr) minmax(460px, 1.18fr);
      gap: var(--art-space-4);
      align-items: stretch;
    }

    &__settings-form,
    &__diagnostics {
      min-width: 0;
      padding: var(--art-space-4);
      background: var(--art-gray-50);
      border: 1px solid var(--art-gray-200);
      border-radius: var(--el-border-radius-base);
    }

    &__card-heading {
      display: flex;
      gap: 10px;
      align-items: center;
      min-width: 0;

      > span {
        display: grid;
        flex: none;
        place-items: center;
        width: 34px;
        height: 34px;
        color: var(--theme-color);
        background: color-mix(in srgb, var(--theme-color) 10%, var(--el-bg-color));
        border-radius: var(--el-border-radius-base);
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

      strong {
        color: var(--art-gray-900);
      }

      small {
        font-size: 11px;
        color: var(--art-gray-600);
      }

      &.is-compact {
        > span {
          width: 30px;
          height: 30px;
        }

        strong {
          font-size: 13px;
        }
      }
    }

    &__settings-form {
      > .art-form {
        padding: var(--art-space-4);
        margin-top: var(--art-space-4);
        background: var(--el-bg-color);
        border-radius: var(--el-border-radius-base);
      }
    }

    &__version-policy {
      padding-top: var(--art-space-4);
      margin-top: var(--art-space-4);
      border-top: 1px solid var(--art-gray-200);

      ul {
        display: grid;
        gap: var(--art-space-3);
        padding: 0;
        margin: var(--art-space-4) 0 0;
        list-style: none;
      }

      li {
        display: flex;
        gap: 8px;
        align-items: center;
        font-size: 12px;
        color: var(--art-gray-700);

        svg {
          color: var(--theme-color);
        }
      }
    }

    &__diagnostics {
      > header {
        display: flex;
        gap: var(--art-space-3);
        align-items: center;
        justify-content: space-between;
        margin-bottom: var(--art-space-4);
      }
    }

    &__diagnostic-list {
      display: grid;
      gap: var(--art-space-3);

      article {
        display: grid;
        grid-template-columns: 30px minmax(0, 1fr) auto;
        gap: 10px;
        align-items: center;
        min-width: 0;
        padding: var(--art-space-3);
        background: var(--el-bg-color);
        border-left: 3px solid var(--el-color-info);
        border-radius: var(--el-border-radius-small);

        &.is-error {
          border-left-color: var(--el-color-danger);

          > span {
            color: var(--el-color-danger);
            background: var(--el-color-danger-light-9);
          }
        }

        &.is-warning {
          border-left-color: var(--el-color-warning);

          > span {
            color: var(--el-color-warning-dark-2);
            background: var(--el-color-warning-light-9);
          }
        }

        > span {
          display: grid;
          place-items: center;
          width: 28px;
          height: 28px;
          color: var(--art-gray-600);
          background: var(--art-gray-100);
          border-radius: 50%;
        }

        > div {
          display: grid;
          gap: 3px;
          min-width: 0;
        }

        strong {
          font-size: 12px;
          color: var(--art-gray-900);
        }

        small {
          font-size: 11px;
          line-height: 1.55;
          color: var(--art-gray-600);
        }
      }
    }

    &__diagnostic-actions {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      min-width: 88px;

      :deep(.el-button) {
        justify-content: center;
        min-width: 88px;
        min-height: 28px;
        padding: 5px 10px;
      }
    }

    &__diagnostic-success {
      display: grid;
      place-items: center;
      min-height: 260px;
      padding: var(--art-space-5);
      text-align: center;

      span {
        display: grid;
        place-items: center;
        width: 54px;
        height: 54px;
        margin-bottom: var(--art-space-3);
        font-size: 26px;
        color: var(--el-color-success);
        background: var(--el-color-success-light-9);
        border-radius: 50%;
      }

      strong {
        color: var(--art-gray-900);
      }

      small {
        max-width: 300px;
        margin-top: 5px;
        font-size: 11px;
        line-height: 1.6;
        color: var(--art-gray-600);
      }
    }
  }

  @media (width <= 980px) {
    .workflow-designer-page {
      &__steps {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      &__contract-summary,
      &__release-overview {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      &__settings-grid {
        grid-template-columns: 1fr;
      }

      &__release-overview article:last-child {
        grid-column: 1 / -1;
      }
    }
  }

  @media (width <= 640px) {
    .workflow-designer-page {
      &__steps {
        grid-template-columns: 1fr;
        padding: 0;
      }

      &__contract-summary,
      &__field-grid,
      &__release-overview {
        grid-template-columns: 1fr;
      }

      &__section-heading.is-split {
        flex-direction: column;
      }

      &__business-selector {
        flex-basis: auto;
        width: 100%;
      }

      &__release-overview article:last-child {
        grid-column: auto;
      }

      &__diagnostics > header {
        align-items: flex-start;
      }

      &__diagnostic-list article {
        grid-template-columns: 30px minmax(0, 1fr) auto;

        > .workflow-designer-page__diagnostic-actions {
          grid-column: 2 / -1;
          justify-self: start;
        }
      }

      &__basic,
      &__fields,
      &__settings {
        padding: var(--art-space-4);
      }
    }
  }
</style>
