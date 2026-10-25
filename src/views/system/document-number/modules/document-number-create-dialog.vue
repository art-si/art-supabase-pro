<template>
  <ArtDialog ref="dialogRef" size="lg" :dialog-props="{ appendToBody: true }">
    <div class="number-rule-create">
      <ArtSectionCard class="number-rule-create__form" preserve-content-structure>
        <template #header>
          <header class="number-rule-create__header">
            <div>
              <ArtSectionTitle :show-line="false">批量配置租户规则</ArtSectionTitle>
              <p>先从树形菜单定位业务功能，再把同一套编号规范一次分配给多个租户。</p>
            </div>
            <ElTag type="primary" round>{{ selectedTenantCount }} 个租户</ElTag>
          </header>
        </template>

        <ArtForm
          ref="formRef"
          v-model="form.data"
          :items="form.items"
          :rules="form.rules"
          :span="12"
          :gutter="20"
          label-position="top"
          label-width="auto"
          :show-reset="false"
          :show-submit="false"
          :validate-on-rule-change="false"
        >
          <template #template>
            <ElInput
              v-model="form.data.template"
              maxlength="80"
              show-word-limit
              placeholder="例如：YD{YYYYMM}-{SEQ:3}"
            />
            <div class="number-rule-create__tokens" aria-label="可用模板令牌">
              <ElButton
                v-for="token in templateTokens"
                :key="token"
                size="small"
                plain
                @click="appendToken(token)"
              >
                {{ token }}
              </ElButton>
            </div>
          </template>
        </ArtForm>
      </ArtSectionCard>

      <aside class="number-rule-create__summary">
        <ArtSectionCard
          class="number-rule-create__preview"
          preserve-content-structure
          title="配置预览"
        >
          <code translate="no">{{ previewText }}</code>
          <dl>
            <div>
              <dt>菜单路径</dt>
              <dd>{{ selectedMenuPath || '请先选择菜单' }}</dd>
            </div>
            <div>
              <dt>编号字段</dt>
              <dd>{{ selectedScene?.fieldLabel || '待选择' }}</dd>
            </div>
            <div>
              <dt>批量范围</dt>
              <dd>{{ selectedTenantCount }} 个租户</dd>
            </div>
          </dl>
        </ArtSectionCard>

        <ElAlert
          type="info"
          :closable="false"
          show-icon
          title="同一租户、同一编号功能只有一条规则；已有规则会同步更新，缺失规则会自动创建。"
        />
      </aside>
    </div>
  </ArtDialog>
</template>

<script setup lang="ts">
  import { createMenuPathResolver, resolveMenuLabel } from '@/utils/navigation/menu'
  import { notifyFriendlyError } from '@/hooks/core/useArtFeedback'
  import { validateArtFormForSubmit } from '@/utils/form/validate-art-form'
  import ArtSectionCard from '@/components/core/surfaces/art-section-card/index.vue'
  import type { ComputedRef, UnwrapNestedRefs } from 'vue'
  import type { FormRules } from 'element-plus'
  import { ElMessage } from 'element-plus'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import ArtSectionTitle from '@/components/core/surfaces/art-section-title/index.vue'
  import { addDocumentNumberRules, fetchDocumentNumberSceneList } from '@/api/document-number'
  import { fetchMenuCatalog } from '@/api/system-manage'
  import { fetchEnabledTenantList } from '@/api/system-manage/tenant'
  import { renderDocumentNumber, validateDocumentNumberTemplate } from '@/utils/document-number'
  import TreeUtils from '@/utils/tree'
  import { useUserStore } from '@/store/modules/user'
  import { useTenantScopeStore } from '@/store/modules/tenant-scope'
  import { areTenantCreateTargetsInScope } from '@/utils/tenant-scope-access-policy'
  import type { AppRouteRecord } from '@/types/router'

  type NumberScene = Api.SystemManage.DocumentNumberSceneItem

  interface CreateFormModel {
    menuId: string
    ruleKey: string
    tenantIds: string[]
    autoEnabled: boolean
    template: string
    resetCycle: Api.SystemManage.DocumentNumberResetCycle
    sequenceStart: number
    timezone: string
    remark: string
  }

  interface FormExpose {
    validate: () => Promise<boolean | void>
    clearValidate: () => void
  }

  interface MenuNode extends AppRouteRecord {
    disabled?: boolean
    children?: MenuNode[]
  }

  interface FormGroup {
    data: CreateFormModel
    scenes: NumberScene[]
    menus: AppRouteRecord[]
    menuTree: MenuNode[]
    tenantOptions: Array<{ label: string; value: string }>
    items: ComputedRef<FormItem[]>
    rules: ComputedRef<FormRules<CreateFormModel>>
  }

  const emit = defineEmits<{ success: [] }>()
  const dialogRef = ref<ArtDialogExpose>()
  const formRef = ref<FormExpose>()
  const userStore = useUserStore()
  const tenantScopeStore = useTenantScopeStore()
  const { getDictMap, isPlatformSuper } = storeToRefs(userStore)
  const treeUtils = new TreeUtils({ idKey: 'id', parentKey: 'parentId', childrenKey: 'children' })

  const createInitialForm = (): CreateFormModel => ({
    menuId: '',
    ruleKey: '',
    tenantIds: [],
    autoEnabled: true,
    template: 'YD{YYYYMM}-{SEQ:3}',
    resetCycle: 'month',
    sequenceStart: 1,
    timezone: 'Asia/Shanghai',
    remark: ''
  })

  const form: UnwrapNestedRefs<FormGroup> = reactive<FormGroup>({
    data: createInitialForm(),
    scenes: [] as NumberScene[],
    menus: [] as AppRouteRecord[],
    menuTree: [] as MenuNode[],
    tenantOptions: [] as Array<{ label: string; value: string }>,
    items: computed<FormItem[]>(() => [
      { label: '业务归属', key: 'businessSection', type: 'divider', span: 24 },
      {
        label: '所属菜单',
        key: 'menuId',
        type: 'treeSelect',
        span: 12,
        props: {
          data: form.menuTree,
          clearable: true,
          filterable: true,
          checkStrictly: true,
          placeholder: '按菜单树选择功能页面',
          onChange: handleMenuChange,
          props: {
            label: (node: MenuNode) => resolveMenuLabel(node),
            value: 'id',
            disabled: 'disabled'
          }
        },
        description: '目录仅用于定位，需选择已经接入编号字段的功能页。'
      },
      {
        label: '编号功能',
        key: 'ruleKey',
        type: 'select',
        span: 12,
        props: {
          clearable: true,
          disabled: !form.data.menuId,
          placeholder: form.data.menuId ? '请选择编号字段' : '请先选择所属菜单',
          onChange: handleSceneChange,
          options: availableScenes.value.map((scene: NumberScene) => ({
            label: `${scene.ruleName} · ${scene.fieldLabel}`,
            value: scene.ruleKey
          }))
        },
        description: selectedScene.value
          ? `绑定字段：${selectedScene.value.targetTable}.${selectedScene.value.targetColumn}`
          : '只显示该菜单已经接入统一编号引擎的字段。'
      },
      {
        label: '分配租户',
        key: 'tenantIds',
        type: 'select',
        span: 24,
        props: {
          multiple: true,
          filterable: true,
          disabled: !tenantScopeStore.isAllTenants,
          collapseTags: true,
          collapseTagsTooltip: true,
          maxCollapseTags: 3,
          placeholder: tenantScopeStore.isAllTenants ? '可一次选择多个租户' : '当前租户范围',
          options: form.tenantOptions
        },
        description: tenantScopeStore.isAllTenants
          ? '默认配置当前平台租户；可增加其他租户，一次保存后统一生效。'
          : isPlatformSuper.value
            ? '当前只配置顶部所选租户；切换范围后请重新打开。'
            : '当前账号只能配置所属租户。'
      },
      { label: '生成策略', key: 'strategySection', type: 'divider', span: 24 },
      {
        label: '自动编码',
        key: 'autoEnabled',
        type: 'switch',
        span: 12,
        description: '关闭后由业务人员在对应功能页手工填写编号。'
      },
      {
        label: '重置周期',
        key: 'resetCycle',
        type: 'select',
        span: 12,
        props: {
          options: getDictMap.value.documentNumberResetCycle ?? [],
          placeholder: '请选择重置周期'
        }
      },
      {
        label: '编号模板',
        key: 'template',
        type: 'input',
        span: 24,
        description: '日期令牌可以自由组合；SEQ 后的数字表示流水号补零长度。'
      },
      {
        label: '流水起始值',
        key: 'sequenceStart',
        type: 'number',
        span: 12,
        props: { min: 1, max: 999999999999, step: 1, stepStrictly: true, style: { width: '100%' } }
      },
      {
        label: '业务时区',
        key: 'timezone',
        type: 'input',
        span: 12,
        props: { maxlength: 64, placeholder: '例如：Asia/Shanghai' }
      },
      {
        label: '维护说明',
        key: 'remark',
        type: 'input',
        span: 24,
        props: { type: 'textarea', rows: 2, maxlength: 255, showWordLimit: true }
      }
    ]),
    rules: computed<FormRules<CreateFormModel>>(() => ({
      menuId: [{ required: true, message: '请选择所属菜单', trigger: 'change' }],
      ruleKey: [{ required: true, message: '请选择编号功能', trigger: 'change' }],
      tenantIds: [
        { required: true, type: 'array', min: 1, message: '请选择至少一个租户', trigger: 'change' }
      ],
      template: [
        { required: true, message: '请输入编号模板', trigger: 'blur' },
        {
          validator: (_rule, value: string, callback) => {
            const message = validateDocumentNumberTemplate(value)
            callback(message ? new Error(message) : undefined)
          },
          trigger: 'blur'
        }
      ],
      resetCycle: [{ required: true, message: '请选择重置周期', trigger: 'change' }],
      sequenceStart: [{ required: true, message: '请输入流水起始值', trigger: 'blur' }],
      timezone: [{ required: true, message: '请输入业务时区', trigger: 'blur' }]
    }))
  })

  const availableScenes = computed<NumberScene[]>(() =>
    form.scenes.filter((scene: NumberScene) => scene.menuId === form.data.menuId)
  )
  const selectedScene = computed<NumberScene | undefined>(() =>
    form.scenes.find((scene: NumberScene) => scene.ruleKey === form.data.ruleKey)
  )
  const selectedTenantCount = computed(() => form.data.tenantIds.length)
  const menuPathResolver = computed(() => createMenuPathResolver(form.menuTree))
  const selectedMenuPath = computed(() => menuPathResolver.value.resolve(form.data.menuId))
  const previewText = computed(() => {
    if (!form.data.autoEnabled) return '手工填写'
    try {
      return renderDocumentNumber(form.data.template, form.data.sequenceStart, form.data.timezone)
    } catch {
      return '模板或时区无效'
    }
  })
  const templateTokens = [
    '{YYYYMMDD}',
    '{YYYYMM}',
    '{YYMM}',
    '{YYYY}',
    '{YY}',
    '{MM}',
    '{DD}',
    '{SEQ:3}',
    '{SEQ:4}',
    '{SEQ:6}'
  ]

  const buildMenuTree = (): void => {
    const fullTree = treeUtils.listToTree<MenuNode>(form.menus)
    const selectableIds = new Set(form.scenes.map((scene: NumberScene) => scene.menuId))

    const keepRegisteredBranches = (nodes: MenuNode[]): MenuNode[] =>
      nodes.flatMap((node) => {
        const children = keepRegisteredBranches(node.children ?? [])
        const selectable = selectableIds.has(String(node.id))
        if (!selectable && !children.length) return []
        return [{ ...node, children, disabled: false }]
      })

    form.menuTree = keepRegisteredBranches(fullTree)
  }

  const handleMenuChange = (): void => {
    form.data.ruleKey = ''
  }

  const handleSceneChange = (ruleKey: string): void => {
    const scene = form.scenes.find((item: NumberScene) => item.ruleKey === ruleKey)
    if (!scene) return
    Object.assign(form.data, {
      template: scene.defaultTemplate,
      resetCycle: scene.defaultResetCycle,
      remark: scene.remark ?? ''
    })
  }

  const appendToken = (token: string): void => {
    if (token.startsWith('{SEQ:')) {
      form.data.template = form.data.template.replace(/\{SEQ:[1-9][0-9]?\}/, '')
    }
    form.data.template += token
  }

  const initialize = async (): Promise<void> => {
    const [sceneResult, menuResult, tenantResult] = await Promise.all([
      fetchDocumentNumberSceneList(),
      fetchMenuCatalog(),
      fetchEnabledTenantList()
    ])
    form.scenes = sceneResult.data ?? []
    form.menus = (menuResult.data ?? []).filter((menu) => menu.type !== 'button')
    const selectedTenantId = tenantScopeStore.effectiveTenantId
    form.tenantOptions = (tenantResult.data ?? [])
      .filter((tenant) => tenantScopeStore.isAllTenants || String(tenant.id) === selectedTenantId)
      .map((tenant) => ({
        label: `${tenant.tenantName}（${tenant.tenantCode}）`,
        value: String(tenant.id)
      }))
    if (tenantScopeStore.isAllTenants) {
      const homeTenantId = userStore.getUserInfo.tenantId
      if (homeTenantId) {
        if (!form.tenantOptions.some((option) => option.value === homeTenantId)) {
          const homeTenant = userStore.getUserInfo.tenant
          form.tenantOptions.unshift({
            label: homeTenant
              ? `${homeTenant.tenantName}（${homeTenant.tenantCode}）`
              : '平台管理员租户',
            value: homeTenantId
          })
        }
        form.data.tenantIds = [homeTenantId]
      }
    }
    if (!tenantScopeStore.isAllTenants && selectedTenantId) {
      if (!form.tenantOptions.some((option) => option.value === selectedTenantId)) {
        form.tenantOptions = [
          {
            label:
              tenantScopeStore.selectedTenant?.tenantName ||
              userStore.getUserInfo.tenant?.tenantName ||
              '当前租户',
            value: selectedTenantId
          }
        ]
      }
      form.data.tenantIds = [selectedTenantId]
    }
    buildMenuTree()
  }

  const handleSubmit = async (): Promise<boolean> => {
    try {
      if (!(await validateArtFormForSubmit(formRef.value))) return false
    } catch (error) {
      notifyFriendlyError(error, '表单校验未完成，请稍后重试', 'warning')
      return false
    }
    const scene = selectedScene.value
    if (!scene) return false

    if (
      !areTenantCreateTargetsInScope({
        effectiveTenantId: tenantScopeStore.effectiveTenantId,
        isAllTenants: tenantScopeStore.isAllTenants,
        isPlatformSuper: tenantScopeStore.isPlatformScope,
        tenantIds: form.data.tenantIds
      })
    ) {
      ElMessage.warning('租户范围已变化，请重新打开配置窗口')
      return false
    }

    try {
      const result = await addDocumentNumberRules({
        tenantIds: form.data.tenantIds,
        scene,
        autoEnabled: form.data.autoEnabled,
        template: form.data.template,
        resetCycle: form.data.resetCycle,
        sequenceStart: form.data.sequenceStart,
        timezone: form.data.timezone,
        remark: form.data.remark
      })
      if (result.error || !result.data) return false
      const created = result.data?.created ?? 0
      const updated = result.data?.updated ?? 0
      ElMessage.success(`批量配置完成：新建 ${created} 个，更新 ${updated} 个租户规则`)
      emit('success')
      return true
    } catch (error) {
      notifyFriendlyError(error, '编号规则配置失败，请检查当前租户范围后重试')
      return false
    }
  }

  const handleOpen = async (): Promise<void> => {
    Object.assign(form.data, createInitialForm())
    await dialogRef.value?.handleOpen(undefined, {
      title: '新增编号规则',
      contentMaxHeight: '76vh',
      confirmText: '批量配置',
      loading: true,
      onOpen: async (_data, api) => {
        try {
          await initialize()
          await nextTick()
          formRef.value?.clearValidate()
        } finally {
          api.setLoading(false)
        }
      },
      onConfirm: handleSubmit
    })
  }

  defineExpose({ handleOpen })
</script>

<style scoped lang="scss">
  .number-rule-create {
    display: flex;
    gap: 12px;
    align-items: flex-start;

    &__form {
      flex: 1;
      min-width: 0;
      overflow: hidden;
    }

    &__header {
      display: flex;
      gap: 16px;
      align-items: flex-start;
      justify-content: space-between;
      padding: 16px;
      border-bottom: 1px solid var(--el-border-color-lighter);

      :deep(.art-section-title) {
        margin: 0 0 4px;
      }

      p {
        margin: 0;
        font-size: 12px;
        color: var(--el-text-color-secondary);
      }
    }

    :deep(.art-form) {
      padding: 12px 16px 4px !important;
    }

    &__tokens {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-top: 8px;

      .el-button + .el-button {
        margin-left: 0;
      }
    }

    &__summary {
      position: sticky;
      top: 0;
      display: flex;
      flex: 0 0 268px;
      flex-direction: column;
      gap: 12px;
      width: 268px;
    }

    &__preview {
      padding: 14px;
    }

    &__preview > code {
      display: block;
      padding: 13px 10px;
      font-size: 15px;
      font-weight: 700;
      color: var(--el-color-primary);
      text-align: center;
      overflow-wrap: anywhere;
      background: var(--el-color-primary-light-9);
      border: 1px solid var(--el-color-primary-light-7);
      border-radius: var(--art-control-radius);
    }

    dl {
      margin: 12px 0 0;
    }

    dl div {
      padding: 8px 0;
      border-bottom: 1px solid var(--el-border-color-lighter);
    }

    dl div:last-child {
      border-bottom: 0;
    }

    dt {
      font-size: 11px;
      color: var(--el-text-color-secondary);
    }

    dd {
      margin: 4px 0 0;
      line-height: 1.5;
      color: var(--el-text-color-primary);
    }
  }

  @media (width <= 900px) {
    .number-rule-create {
      &__summary {
        display: none;
      }
    }
  }

  @media (width <= 600px) {
    .number-rule-create__form :deep(.art-form .el-row > .el-col) {
      flex: 0 0 100%;
      max-width: 100%;
    }
  }
</style>
