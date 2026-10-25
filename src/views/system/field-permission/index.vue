<template>
  <div class="field-permission-page business-workspace-page">
    <BusinessWorkspaceHeader
      density="compact"
      eyebrow="FIELD ACCESS GOVERNANCE"
      title="字段权限"
      description="按角色批量授权、按人员设置例外，统一控制列表、详情、导出与打印中的敏感字段。"
      icon="ri:shield-keyhole-line"
      :tags="workspaceTags"
      :metrics="overviewMetrics"
      refreshable
      refresh-label="刷新字段权限配置"
      :refresh-loading="page.loading || page.configurationLoading"
      @refresh="retryLoad"
    />

    <ArtSectionCard
      class="field-permission-page__scope"
      aria-label="授权范围"
      preserve-content-structure
    >
      <template #header>
        <div class="field-permission-page__scope-heading">
          <div class="field-permission-page__heading-copy">
            <span class="field-permission-page__heading-icon" aria-hidden="true">
              <ArtSvgIcon icon="ri:focus-3-line" />
            </span>
            <div>
              <span class="field-permission-page__section-kicker">配置范围</span>
              <ArtSectionTitle :show-line="false">选择授权范围</ArtSectionTitle>
              <p>人员配置覆盖其全部角色的合并结果；清除人员例外后恢复角色继承。</p>
            </div>
          </div>
          <div class="field-permission-page__scope-mode">
            <span>授权对象</span>
            <ElSegmented
              v-model="subjectType"
              :options="subjectTypeOptions"
              :disabled="
                page.loading || page.saving || page.configurationLoading || page.auditLoading
              "
              @change="handleSubjectTypeChange"
            />
          </div>
        </div>
      </template>

      <div v-if="isAllTenants" class="field-permission-page__scope-preview" role="status">
        <span aria-hidden="true"><ArtSvgIcon icon="ri:information-2-line" /></span>
        <div>
          <strong>全部租户模式下展示平台租户预览</strong>
          <p>当前读取“{{ activeTenantLabel }}”的字段目录；如需修改授权，请先在顶部选择具体租户。</p>
        </div>
      </div>

      <div class="field-permission-page__selectors">
        <label>
          <span class="field-permission-page__selector-label">
            <ArtSvgIcon icon="ri:file-list-3-line" />
            业务表单
          </span>
          <ElSelect
            v-model="selectedResourceKey"
            filterable
            :loading="page.loading"
            :disabled="page.saving || page.configurationLoading || page.auditLoading"
            placeholder="请选择业务表单"
            @change="handleResourceChange"
          >
            <ElOption
              v-for="resource in resources"
              :key="resource.id"
              :label="`${resource.resourceLabel}（${resource.fieldCount} 个敏感字段）`"
              :value="resource.resourceKey"
            />
          </ElSelect>
        </label>

        <label>
          <span class="field-permission-page__selector-label">
            <ArtSvgIcon :icon="subjectType === 'role' ? 'ri:team-line' : 'ri:user-line'" />
            {{ subjectType === 'role' ? '授权角色' : '授权人员' }}
          </span>
          <ElSelect
            v-model="selectedSubjectId"
            filterable
            :loading="page.loading"
            :disabled="page.saving || page.configurationLoading || page.auditLoading"
            :placeholder="subjectType === 'role' ? '请选择角色' : '请选择人员'"
            @change="handleSubjectChange"
          >
            <ElOption
              v-for="option in subjectOptions"
              :key="option.value"
              :label="option.label"
              :value="option.value"
            />
          </ElSelect>
        </label>
      </div>

      <div class="field-permission-page__scope-policy">
        <span class="field-permission-page__policy-icon" aria-hidden="true">
          <ArtSvgIcon icon="ri:user-star-line" />
        </span>
        <div>
          <strong>创建人豁免优先于人员例外和角色授权</strong>
          <p>
            标记为“创建人可编辑”的字段，仅在本人创建的记录中自动获得编辑权限；查看他人记录时仍按授权矩阵计算。
          </p>
        </div>
        <span class="field-permission-page__policy-level">记录级规则</span>
      </div>
    </ArtSectionCard>

    <ArtPageShell
      class="field-permission-page__matrix-shell"
      :loading="page.loading || page.configurationLoading"
      loading-mode="skeleton"
      :error="page.error"
      :empty="!configuration || configuration.fields.length === 0"
      empty-text="暂无可配置的敏感字段"
      empty-description="请先为当前应用配置需要管理的敏感字段。"
      @retry="retryLoad"
    >
      <ArtSectionCard
        v-if="configuration"
        class="field-permission-page__matrix"
        preserve-content-structure
      >
        <template #header>
          <header class="field-permission-page__matrix-header">
            <div>
              <span class="field-permission-page__section-kicker">权限矩阵</span>
              <ArtSectionTitle :show-line="false">字段授权矩阵</ArtSectionTitle>
              <div class="field-permission-page__matrix-context">
                <strong>{{ configuration.resourceLabel }}</strong>
                <span aria-hidden="true">/</span>
                <b>{{ currentSubjectLabel }}</b>
              </div>
            </div>
            <div class="field-permission-page__matrix-summary">
              <span
                class="field-permission-page__sync-state"
                :class="{ 'is-dirty': isDirty }"
                role="status"
              >
                <ArtSvgIcon :icon="isDirty ? 'ri:draft-line' : 'ri:shield-check-line'" />
                {{ isDirty ? `${changedFieldCount} 项待保存` : '配置已同步' }}
              </span>
              <p>
                {{
                  subjectType === 'role'
                    ? '角色成员继承本配置；用户拥有多个角色时取权限最大值。'
                    : '“继承角色”不保存人员记录；其余选项覆盖角色合并结果。'
                }}
              </p>
            </div>
          </header>
        </template>

        <div class="field-permission-page__legend" aria-label="权限等级说明">
          <span v-for="option in accessOptions" :key="option.value" :class="`is-${option.value}`">
            <i aria-hidden="true">
              <ArtSvgIcon :icon="accessMeta[option.value].icon" />
            </i>
            <span>
              <b>{{ option.label }}</b>
              <small>{{ accessMeta[option.value].description }}</small>
            </span>
          </span>
        </div>

        <div class="field-permission-page__field-list">
          <div class="field-permission-page__field-columns" aria-hidden="true">
            <span>敏感字段</span>
            <span>字段规则</span>
            <span>授权等级与结果</span>
          </div>
          <article
            v-for="field in configuration.fields"
            :key="field.id"
            class="field-permission-page__field-row"
            :class="`is-${effectiveAccess(field)}`"
          >
            <div class="field-permission-page__field-identity">
              <span class="field-permission-page__field-icon" aria-hidden="true">
                <ArtSvgIcon :icon="supportsMask(field) ? 'ri:eye-off-line' : 'ri:key-2-line'" />
              </span>
              <div>
                <strong>{{ field.fieldLabel }}</strong>
                <code translate="no">{{ field.fieldKey }}</code>
              </div>
            </div>

            <div class="field-permission-page__field-meta">
              <span
                v-if="field.ownerOverrideEnabled"
                class="field-permission-page__field-flag is-owner"
              >
                <ArtSvgIcon icon="ri:user-star-line" />
                创建人可编辑
              </span>
              <span v-if="supportsMask(field)" class="field-permission-page__field-flag is-mask">
                <ArtSvgIcon icon="ri:eye-off-line" />
                支持脱敏
              </span>
              <span class="field-permission-page__field-default">
                默认 {{ accessLabel(field.defaultAccess) }}
              </span>
            </div>

            <div class="field-permission-page__field-control">
              <ElSelect
                v-model="permissionDraft[field.fieldKey]"
                class="field-permission-page__access-select"
                :disabled="page.saving || isReadOnly"
                :aria-label="`${field.fieldLabel}字段权限`"
              >
                <ElOption
                  v-if="subjectType === 'user'"
                  :label="`继承角色（${accessLabel(field.inheritedAccess)}）`"
                  value="inherit"
                />
                <ElOption
                  v-for="option in accessOptions"
                  :key="option.value"
                  :label="option.label"
                  :value="option.value"
                />
              </ElSelect>
              <span
                class="field-permission-page__effective-state"
                :class="`is-${effectiveAccess(field)}`"
              >
                <span>当前生效</span>
                <b :class="`is-${effectiveAccess(field)}`">
                  {{ accessLabel(effectiveAccess(field)) }}
                </b>
              </span>
            </div>
          </article>
        </div>

        <section class="field-permission-page__audit" aria-label="最近授权变更">
          <header class="field-permission-page__audit-header">
            <div>
              <ArtSectionTitle :show-line="false"> 最近授权变更 </ArtSectionTitle>
              <p>记录当前表单与授权对象最近 10 次人工配置，便于核对权限收紧与放开。</p>
            </div>
            <span class="field-permission-page__audit-count">
              <ArtSvgIcon icon="ri:history-line" />
              {{ auditLogs.length }} 条记录
            </span>
          </header>

          <ElSkeleton v-if="page.auditLoading" animated :rows="2" />
          <div v-else-if="page.auditError" class="field-permission-page__audit-error" role="alert">
            <span><ArtSvgIcon icon="ri:error-warning-line" /></span>
            <div>
              <strong>授权变更记录暂时无法加载</strong>
              <p>字段授权矩阵仍可正常使用，可单独重试变更记录。</p>
            </div>
            <ElButton link type="primary" @click="loadAuditLogs">重新加载</ElButton>
          </div>
          <ArtEmptyState
            v-else-if="auditLogs.length === 0"
            title="尚无人工授权变更"
            description="系统初始化授权不会计入这里；首次保存角色或人员字段权限后会自动留下记录。"
            size="compact"
            :visual-size="64"
          />
          <ol v-else class="field-permission-page__audit-list">
            <li v-for="auditLog in auditLogs" :key="auditLog.id">
              <span class="field-permission-page__audit-marker" aria-hidden="true">
                <ArtSvgIcon
                  :icon="auditLog.action === 'clear' ? 'ri:eraser-line' : 'ri:edit-line'"
                />
              </span>
              <div class="field-permission-page__audit-copy">
                <div>
                  <strong>{{ auditActorLabel(auditLog) }}</strong>
                  <span>{{ auditActionLabel(auditLog) }}</span>
                </div>
                <p :title="auditChangeDetails(auditLog)">{{ auditChangeSummary(auditLog) }}</p>
              </div>
              <time :datetime="auditLog.createTime">{{
                formatAuditTime(auditLog.createTime)
              }}</time>
            </li>
          </ol>
        </section>
      </ArtSectionCard>
    </ArtPageShell>

    <ArtStickyActionBar
      v-if="configuration"
      class="field-permission-page__actions"
      :class="{ 'is-dirty': isDirty, 'is-readonly': isReadOnly }"
    >
      <template #summary>
        <div class="field-permission-page__action-summary">
          <span aria-hidden="true">
            <ArtSvgIcon :icon="actionState.icon" />
          </span>
          <div>
            <strong>{{ actionState.title }}</strong>
            <p>{{ actionState.description }}</p>
          </div>
        </div>
      </template>

      <template v-if="!isReadOnly">
        <ElButton :disabled="!isDirty || page.saving" @click="resetDraft">
          撤销未保存修改
        </ElButton>
        <ElButton
          v-auth="'System:FieldPermission:Manage'"
          type="primary"
          :loading="page.saving"
          :disabled="!isDirty"
          @click="saveConfiguration"
        >
          保存 {{ changedFieldCount }} 项授权
        </ElButton>
      </template>
      <span v-else class="field-permission-page__readonly-state">
        <ArtSvgIcon :icon="isAllTenants ? 'ri:building-4-line' : 'ri:lock-2-line'" />
        {{ isAllTenants ? '选择具体租户后可维护' : '需要“维护字段权限”按钮权限' }}
      </span>
    </ArtStickyActionBar>
  </div>
</template>

<script setup lang="ts">
  import ArtSectionCard from '@/components/core/surfaces/art-section-card/index.vue'
  import { ElButton, ElMessage, ElOption, ElSegmented, ElSelect, ElSkeleton } from 'element-plus'
  import { cloneDeep, isEqual } from 'lodash-es'
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
  import ArtSectionTitle from '@/components/core/surfaces/art-section-title/index.vue'
  import ArtEmptyState from '@/components/core/feedback/art-empty-state/index.vue'
  import ArtStickyActionBar from '@/components/core/layouts/art-sticky-action-bar/index.vue'
  import BusinessWorkspaceHeader, {
    type BusinessWorkspaceMetric,
    type BusinessWorkspaceTag
  } from '@/components/business/business-workspace-header/index.vue'
  import {
    fetchFieldPermissionAuditLogs,
    fetchFieldPermissionConfiguration,
    fetchFieldPermissionResources,
    saveFieldPermissions
  } from '@/api/field-permission'
  import { fetchRoleList, fetchUserList } from '@/api/system-manage'
  import { useAuth } from '@/hooks/core/useAuth'
  import { useDictionaryOptions } from '@/hooks/core/useDictionaryOptions'
  import { useTenantScopeStore } from '@/store/modules/tenant-scope'
  import { useUserStore } from '@/store/modules/user'
  import { formatWithDayjs } from '@/utils/time'
  import { resolveTenantWorkspaceId } from '@/utils/tenant-scope-context'
  import { getFieldPermissionAuditChanges } from './modules/field-permission-audit'

  defineOptions({ name: 'FieldPermission' })

  type SubjectType = Api.SystemManage.FieldPermissionSubjectType
  type Configuration = Api.SystemManage.FieldPermissionConfiguration
  type PermissionField = Api.SystemManage.FieldPermissionField
  type AuditLog = Api.SystemManage.FieldPermissionAuditLog
  type AccessLevel = Api.Common.FieldAccessLevel
  type PermissionSelection = AccessLevel | 'inherit'

  interface SelectOption {
    label: string
    value: string
  }

  interface PageGroup {
    loading: boolean
    configurationLoading: boolean
    auditLoading: boolean
    saving: boolean
    error: Error | null
    auditError: Error | null
  }

  interface AccessMeta {
    label: string
    description: string
    icon: string
  }

  const userStore = useUserStore()
  const { effectiveTenantId, isAllTenants } = storeToRefs(useTenantScopeStore())
  const { hasAuth } = useAuth()
  const activeTenantId = computed(() =>
    resolveTenantWorkspaceId(effectiveTenantId.value, userStore.getUserInfo.tenantId)
  )
  const activeTenantLabel = computed(() => (isAllTenants.value ? '平台运营租户' : '当前所选租户'))

  const page = reactive<PageGroup>({
    loading: false,
    configurationLoading: false,
    auditLoading: false,
    saving: false,
    error: null,
    auditError: null
  })
  const resources = shallowRef<Api.SystemManage.FieldPermissionResource[]>([])
  const roleOptions = shallowRef<SelectOption[]>([])
  const userOptions = shallowRef<SelectOption[]>([])
  const subjectType = ref<SubjectType>('role')
  const selectedResourceKey = ref('')
  const selectedSubjectId = ref('')
  const configuration = shallowRef<Configuration | null>(null)
  const auditLogs = shallowRef<AuditLog[]>([])
  const permissionDraft = ref<Record<string, PermissionSelection>>({})
  const savedDraft = shallowRef<Record<string, PermissionSelection>>({})

  const configuredSubjectTypeOptions = useDictionaryOptions('sysFieldPermissionSubjectType')
  const subjectTypeOptions = computed(() =>
    configuredSubjectTypeOptions.filter(
      (option): option is { label: string; value: SubjectType } =>
        option.value === 'role' || option.value === 'user'
    )
  )

  const dictionaryAccessOptions = useDictionaryOptions('sysFieldAccessLevel')
  const allowedAccessValues = new Set<AccessLevel>(['hidden', 'masked', 'read', 'edit'])
  const accessOptions = computed(() =>
    dictionaryAccessOptions.filter((option): option is { label: string; value: AccessLevel } =>
      allowedAccessValues.has(option.value as AccessLevel)
    )
  )

  const accessMeta: Record<AccessLevel, AccessMeta> = {
    hidden: {
      label: '完全不可见',
      description: '列表、详情及导出均隐藏',
      icon: 'ri:eye-close-line'
    },
    masked: {
      label: '脱敏查看',
      description: '仅展示处理后的安全值',
      icon: 'ri:eye-off-line'
    },
    read: {
      label: '仅查看',
      description: '显示原值但禁止修改',
      icon: 'ri:eye-line'
    },
    edit: {
      label: '可编辑',
      description: '允许查看并维护原值',
      icon: 'ri:edit-line'
    }
  }
  const accessLabel = (value: AccessLevel): string =>
    accessOptions.value.find((option) => option.value === value)?.label ?? accessMeta[value].label

  const subjectOptions = computed(() =>
    subjectType.value === 'role' ? roleOptions.value : userOptions.value
  )
  const currentSubjectLabel = computed(
    () =>
      subjectOptions.value.find((option) => option.value === selectedSubjectId.value)?.label || '--'
  )
  const isReadOnly = computed(() => isAllTenants.value || !hasAuth('System:FieldPermission:Manage'))
  const workspaceTags = computed<BusinessWorkspaceTag[]>(() => [
    {
      label: isAllTenants.value ? '平台租户预览' : '租户内隔离',
      type: isAllTenants.value ? 'warning' : 'primary',
      effect: 'plain'
    },
    {
      label: subjectType.value === 'role' ? '角色授权' : '人员例外',
      type: 'info',
      effect: 'plain'
    }
  ])
  const changedFieldCount = computed(
    () =>
      configuration.value?.fields.filter(
        (field) => !isEqual(permissionDraft.value[field.fieldKey], savedDraft.value[field.fieldKey])
      ).length ?? 0
  )
  const isDirty = computed(() => Boolean(configuration.value) && changedFieldCount.value > 0)
  const overviewMetrics = computed<BusinessWorkspaceMetric[]>(() => {
    const fields = configuration.value?.fields ?? []
    const explicitCount = fields.filter((field) =>
      subjectType.value === 'user'
        ? permissionDraft.value[field.fieldKey] !== 'inherit'
        : field.explicitAccess != null ||
          !isEqual(permissionDraft.value[field.fieldKey], savedDraft.value[field.fieldKey])
    ).length
    return [
      {
        label: '授权表单',
        value: resources.value.length,
        description: '已接入统一字段权限解析器',
        icon: 'ri:file-list-3-line',
        tone: 'primary'
      },
      {
        label: '敏感字段',
        value: fields.length,
        description: configuration.value?.resourceLabel || '请选择业务表单',
        icon: 'ri:lock-2-line',
        tone: 'warning'
      },
      {
        label: '显式配置',
        value: explicitCount,
        description: subjectType.value === 'user' ? '人员覆盖项' : '角色授权项',
        icon: 'ri:user-settings-line',
        tone: 'info'
      }
    ]
  })
  const actionState = computed(() => {
    if (isAllTenants.value) {
      return {
        icon: 'ri:building-4-line',
        title: '当前为平台租户只读预览',
        description: '请先在顶部切换到具体租户，再维护该租户的字段授权。'
      }
    }
    if (isReadOnly.value) {
      return {
        icon: 'ri:eye-line',
        title: '当前为安全只读视图',
        description: '可查看角色与人员的生效权限；修改需分配“维护字段权限”按钮权限。'
      }
    }
    if (isDirty.value) {
      return {
        icon: 'ri:draft-line',
        title: `${changedFieldCount.value} 项字段授权尚未保存`,
        description: '保存后立即参与列表、详情、导出和打印的统一字段权限计算。'
      }
    }
    return {
      icon: 'ri:shield-check-line',
      title: '字段授权配置已同步',
      description: '当前显示的权限等级已生效；切换表单或授权对象可继续核对。'
    }
  })

  const normalizeDraft = (data: Configuration): Record<string, PermissionSelection> =>
    Object.fromEntries(
      data.fields.map((field) => [
        field.fieldKey,
        data.subjectType === 'user'
          ? (field.explicitAccess ?? 'inherit')
          : (field.explicitAccess ?? field.inheritedAccess)
      ])
    )

  const effectiveAccess = (field: PermissionField): AccessLevel => {
    const selection = permissionDraft.value[field.fieldKey]
    return !selection || selection === 'inherit' ? field.inheritedAccess : selection
  }

  const supportsMask = (field: PermissionField): boolean =>
    Boolean(field.maskStrategy && field.maskStrategy !== 'none')

  const auditAccessLabel = (access: AccessLevel | null): string =>
    access ? accessLabel(access) : subjectType.value === 'user' ? '继承角色' : '默认权限'

  const auditActorLabel = (auditLog: AuditLog): string => {
    if (auditLog.actorEmail && auditLog.actorEmail !== auditLog.actorName) {
      return `${auditLog.actorName}（${auditLog.actorEmail}）`
    }
    return auditLog.actorName
  }

  const auditActionLabel = (auditLog: AuditLog): string => {
    if (auditLog.action === 'clear') {
      return subjectType.value === 'user' ? '清除了人员字段例外' : '清除了角色字段授权'
    }
    return subjectType.value === 'user' ? '更新了人员字段例外' : '更新了角色字段授权'
  }

  const auditChangeDetails = (auditLog: AuditLog): string => {
    const changes = getFieldPermissionAuditChanges(auditLog, configuration.value?.fields ?? [])
    if (changes.length === 0) return '配置已重新保存，字段权限等级未发生变化。'
    return changes
      .map(
        (change) =>
          `${change.fieldLabel}：${auditAccessLabel(change.beforeAccess)} → ${auditAccessLabel(change.afterAccess)}`
      )
      .join('；')
  }

  const auditChangeSummary = (auditLog: AuditLog): string => {
    const changes = getFieldPermissionAuditChanges(auditLog, configuration.value?.fields ?? [])
    if (changes.length === 0) return '配置已重新保存，字段权限等级未发生变化。'
    const visibleChanges = changes
      .slice(0, 3)
      .map(
        (change) =>
          `${change.fieldLabel}：${auditAccessLabel(change.beforeAccess)} → ${auditAccessLabel(change.afterAccess)}`
      )
      .join('；')
    return changes.length > 3 ? `${visibleChanges}；另有 ${changes.length - 3} 项` : visibleChanges
  }

  const formatAuditTime = (value: string): string =>
    formatWithDayjs(value, 'YYYY-MM-DD HH:mm:ss') || '--'

  const rejectDirtyScopeChange = (): boolean => {
    if (!isDirty.value || !configuration.value) return false
    ElMessage.warning('当前有未保存的字段授权，请先保存或撤销修改后再切换授权范围')
    return true
  }

  const loadConfiguration = async (): Promise<void> => {
    if (!selectedResourceKey.value || !selectedSubjectId.value) {
      configuration.value = null
      auditLogs.value = []
      permissionDraft.value = {}
      savedDraft.value = {}
      return
    }

    page.configurationLoading = true
    page.auditLoading = true
    page.error = null
    page.auditError = null
    try {
      const params = {
        resourceKey: selectedResourceKey.value,
        subjectType: subjectType.value,
        subjectId: selectedSubjectId.value
      }
      const [configurationResult, auditResult] = await Promise.all([
        fetchFieldPermissionConfiguration(params),
        fetchFieldPermissionAuditLogs(params)
      ])

      if (auditResult.error) {
        auditLogs.value = []
        page.auditError = new Error('字段权限变更记录加载失败，请稍后重试。', {
          cause: auditResult.error
        })
      } else {
        auditLogs.value = auditResult.data ?? []
      }

      if (configurationResult.error || !configurationResult.data) {
        throw configurationResult.error instanceof Error
          ? configurationResult.error
          : new Error('字段权限配置加载失败')
      }
      configuration.value = configurationResult.data
      permissionDraft.value = normalizeDraft(configurationResult.data)
      savedDraft.value = cloneDeep(permissionDraft.value)
    } catch (error) {
      configuration.value = null
      page.error = new Error('字段权限配置加载失败，请刷新后重试。', { cause: error })
    } finally {
      page.configurationLoading = false
      page.auditLoading = false
    }
  }

  const loadAuditLogs = async (): Promise<void> => {
    if (!selectedResourceKey.value || !selectedSubjectId.value) {
      auditLogs.value = []
      return
    }

    page.auditLoading = true
    page.auditError = null
    try {
      const { data, error } = await fetchFieldPermissionAuditLogs({
        resourceKey: selectedResourceKey.value,
        subjectType: subjectType.value,
        subjectId: selectedSubjectId.value
      })
      if (error) throw error
      auditLogs.value = data ?? []
    } catch (error) {
      auditLogs.value = []
      page.auditError = new Error('字段权限变更记录加载失败，请稍后重试。', { cause: error })
    } finally {
      page.auditLoading = false
    }
  }

  const loadCatalog = async (): Promise<void> => {
    page.loading = true
    page.error = null
    try {
      const tenantId = activeTenantId.value
      if (!tenantId) throw new Error('当前账号未绑定可用租户，无法加载字段权限')

      const [resourceResult, roleResult, userResult] = await Promise.all([
        fetchFieldPermissionResources(),
        fetchRoleList({ tenantId, enabled: true, from: 0, to: 999 }),
        fetchUserList({ tenantId, status: '1', from: 0, to: 999 })
      ])

      const catalogError = resourceResult.error ?? roleResult.error ?? userResult.error
      if (catalogError) throw catalogError
      const roles = Array.isArray(roleResult.data)
        ? (roleResult.data as Api.SystemManage.RoleListItem[]).filter(
            (role) => !role.tenantId || role.tenantId === tenantId
          )
        : []
      const users = Array.isArray(userResult.data)
        ? (userResult.data as Api.SystemManage.UserListItem[]).filter(
            (user) => !user.tenantId || user.tenantId === tenantId
          )
        : []
      resources.value = resourceResult.data ?? []
      roleOptions.value = roles
        .filter((role) => role.id)
        .map((role) => ({
          label: `${role.roleName}（${role.roleCode}）`,
          value: String(role.id)
        }))
      userOptions.value = users
        .filter((user) => user.id)
        .map((user) => ({
          label: `${user.userName || user.nickName || user.userEmail}（${user.userEmail}）`,
          value: String(user.id)
        }))

      if (!resources.value.some((resource) => resource.resourceKey === selectedResourceKey.value)) {
        selectedResourceKey.value = resources.value[0]?.resourceKey ?? ''
      }
      if (!roleOptions.value.some((option) => option.value === selectedSubjectId.value)) {
        selectedSubjectId.value = roleOptions.value[0]?.value ?? ''
      }
      await loadConfiguration()
    } catch (error) {
      page.error = new Error('字段权限目录加载失败，请检查租户与菜单权限后重试。', {
        cause: error
      })
    } finally {
      page.loading = false
    }
  }

  const handleSubjectTypeChange = async (): Promise<void> => {
    if (rejectDirtyScopeChange()) {
      subjectType.value = configuration.value?.subjectType ?? 'role'
      return
    }
    selectedSubjectId.value = subjectOptions.value[0]?.value ?? ''
    await loadConfiguration()
  }

  const handleResourceChange = async (): Promise<void> => {
    if (rejectDirtyScopeChange()) {
      selectedResourceKey.value = configuration.value?.resourceKey ?? ''
      return
    }
    await loadConfiguration()
  }

  const handleSubjectChange = async (): Promise<void> => {
    if (rejectDirtyScopeChange()) {
      selectedSubjectId.value = configuration.value?.subjectId ?? ''
      return
    }
    await loadConfiguration()
  }

  const resetDraft = (): void => {
    permissionDraft.value = cloneDeep(savedDraft.value)
  }

  const saveConfiguration = async (): Promise<void> => {
    if (!configuration.value || !selectedSubjectId.value) return
    page.saving = true
    try {
      const permissions = Object.fromEntries(
        Object.entries(permissionDraft.value).filter(
          (entry): entry is [string, AccessLevel] => entry[1] !== 'inherit'
        )
      )
      await saveFieldPermissions({
        resourceKey: configuration.value.resourceKey,
        subjectType: subjectType.value,
        subjectId: selectedSubjectId.value,
        permissions
      })
      await loadConfiguration()
    } finally {
      page.saving = false
    }
  }

  const retryLoad = async (): Promise<void> => {
    if (resources.value.length) await loadConfiguration()
    else await loadCatalog()
  }

  const reloadTenantWorkspace = async (): Promise<void> => {
    configuration.value = null
    auditLogs.value = []
    permissionDraft.value = {}
    savedDraft.value = {}
    selectedResourceKey.value = ''
    selectedSubjectId.value = ''
    await loadCatalog()
  }

  watch(activeTenantId, () => void reloadTenantWorkspace(), { immediate: true })
</script>

<style scoped lang="scss">
  .field-permission-page {
    gap: 14px;
    min-width: 0;
    overflow: visible;

    &__scope {
      flex: none;
      padding: 18px;
      background:
        linear-gradient(
          135deg,
          color-mix(in srgb, var(--theme-color) 4%, transparent),
          transparent 44%
        ),
        var(--default-box-color);
    }

    &__scope-heading,
    &__matrix-header {
      display: flex;
      gap: 20px;
      align-items: flex-start;
      justify-content: space-between;

      p {
        margin: 6px 0 0;
        font-size: 12px;
        line-height: 1.55;
        color: var(--el-text-color-secondary);
      }
    }

    &__section-kicker {
      display: block;
      margin-bottom: 4px;
      font-size: 10px;
      font-weight: 700;
      line-height: 1;
      color: var(--el-color-primary);
      letter-spacing: 0.12em;
    }

    &__scope-heading > div:first-child,
    &__matrix-header > div:first-child {
      min-width: 0;
    }

    &__heading-copy {
      display: flex;
      gap: 12px;
      align-items: flex-start;
    }

    &__heading-icon {
      display: grid;
      flex: 0 0 38px;
      place-items: center;
      width: 38px;
      height: 38px;
      margin-top: 1px;
      color: var(--el-color-primary);
      background: linear-gradient(
        145deg,
        var(--el-color-primary-light-8),
        color-mix(in srgb, var(--el-color-primary) 5%, var(--default-box-color))
      );
      border: 1px solid color-mix(in srgb, var(--el-color-primary) 18%, transparent);
      border-radius: var(--art-control-radius);
    }

    &__scope-heading :deep(.art-section-title),
    &__matrix-header :deep(.art-section-title) {
      margin: 0;
    }

    &__scope-mode {
      display: flex;
      flex: none;
      gap: 10px;
      align-items: center;

      > span {
        font-size: 12px;
        font-weight: 600;
        color: var(--el-text-color-secondary);
        white-space: nowrap;
      }
    }

    &__selectors {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
      margin-top: 14px;

      label {
        display: grid;
        gap: 8px;
        min-width: 0;
        padding: 11px 12px 12px;
        background: color-mix(in srgb, var(--el-fill-color-light) 68%, transparent);
        border: 1px solid var(--el-border-color-lighter);
        border-radius: var(--art-surface-radius);

        > span {
          font-size: 12px;
          font-weight: 600;
          color: var(--el-text-color-secondary);
        }
      }
    }

    &__scope-preview {
      display: flex;
      gap: 10px;
      align-items: center;
      padding: 10px 12px;
      margin-top: 14px;
      color: var(--el-color-warning-dark-2);
      background: color-mix(in srgb, var(--el-color-warning) 8%, var(--default-box-color));
      border: 1px solid color-mix(in srgb, var(--el-color-warning) 24%, transparent);
      border-radius: var(--art-control-radius);

      > span {
        display: grid;
        flex: 0 0 30px;
        place-items: center;
        width: 30px;
        height: 30px;
        color: var(--el-color-warning-dark-2);
        background: color-mix(in srgb, var(--el-color-warning) 14%, var(--default-box-color));
        border-radius: 9px;
      }

      strong {
        display: block;
        font-size: 13px;
        font-weight: 650;
      }

      p {
        margin: 2px 0 0;
        font-size: 12px;
        color: var(--el-text-color-secondary);
      }
    }

    &__selector-label {
      display: inline-flex;
      gap: 6px;
      align-items: center;
      color: var(--el-text-color-regular) !important;

      :deep(.art-svg-icon) {
        color: var(--el-color-primary);
      }
    }

    &__scope-policy {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr) auto;
      gap: 10px;
      align-items: center;
      padding: 13px 18px;
      margin: 16px -18px -18px;
      background: color-mix(in srgb, var(--theme-color) 5%, var(--el-fill-color-lighter));
      border-top: 1px solid
        color-mix(in srgb, var(--theme-color) 14%, var(--el-border-color-lighter));

      > div {
        min-width: 0;
      }

      strong {
        display: block;
        font-size: 13px;
        font-weight: 600;
        color: var(--el-text-color-regular);
      }

      p {
        margin: 2px 0 0;
        font-size: 12px;
        line-height: 1.5;
        color: var(--el-text-color-secondary);
      }
    }

    &__policy-icon {
      display: grid;
      flex: 0 0 34px;
      place-items: center;
      width: 34px;
      height: 34px;
      color: var(--theme-color);
      background: color-mix(in srgb, var(--theme-color) 10%, var(--default-box-color));
      border-radius: var(--art-control-radius);
    }

    &__policy-level,
    &__sync-state,
    &__readonly-state {
      display: inline-flex;
      gap: 5px;
      align-items: center;
      min-height: 26px;
      padding: 3px 9px;
      font-size: 12px;
      font-weight: 600;
      white-space: nowrap;
      border-radius: 999px;
    }

    &__policy-level {
      color: var(--el-text-color-secondary);
      background: var(--default-box-color);
      box-shadow: inset 0 0 0 1px var(--el-border-color-lighter);
    }

    &__matrix-shell {
      flex: none;
      min-height: 0;
    }

    &__matrix {
      min-height: 0;
      padding: 18px;
    }

    &__matrix-header {
      padding-bottom: 14px;
      border-bottom: 1px solid var(--el-border-color-lighter);
    }

    &__matrix-context {
      display: flex;
      flex-wrap: wrap;
      gap: 7px;
      align-items: center;
      margin-top: 3px;

      strong {
        font-size: 16px;
        font-weight: 650;
        color: var(--el-text-color-primary);
      }

      span {
        color: var(--el-border-color-darker);
      }

      b {
        display: inline-flex;
        align-items: center;
        min-height: 24px;
        padding: 2px 8px;
        font-size: 13px;
        font-weight: 600;
        color: var(--el-color-primary);
        background: var(--el-color-primary-light-9);
        border-radius: 999px;
      }
    }

    &__matrix-summary {
      display: grid;
      justify-items: end;
      max-width: 620px;

      p {
        text-align: right;
      }
    }

    &__sync-state {
      color: var(--el-color-success-dark-2);
      background: var(--el-color-success-light-9);
      box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--el-color-success) 28%, transparent);

      &.is-dirty {
        color: var(--el-color-warning-dark-2);
        background: var(--el-color-warning-light-9);
        box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--el-color-warning) 30%, transparent);
      }
    }

    &__legend {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 8px;
      margin-top: 14px;

      > span {
        display: flex;
        gap: 9px;
        align-items: center;
        min-width: 0;
        padding: 10px 11px;
        background: var(--el-fill-color-extra-light);
        border: 1px solid var(--el-border-color-lighter);
        border-radius: var(--art-control-radius);

        &.is-hidden {
          background: color-mix(in srgb, var(--el-color-danger) 5%, var(--default-box-color));
        }

        &.is-masked {
          background: color-mix(in srgb, var(--el-color-warning) 6%, var(--default-box-color));
        }

        &.is-read {
          background: color-mix(in srgb, var(--el-color-info) 6%, var(--default-box-color));
        }

        &.is-edit {
          background: color-mix(in srgb, var(--el-color-success) 6%, var(--default-box-color));
        }

        > span {
          min-width: 0;
        }
      }

      i {
        display: grid;
        flex: 0 0 30px;
        place-items: center;
        width: 30px;
        height: 30px;
        font-size: 15px;
        color: var(--el-text-color-secondary);
        background: color-mix(in srgb, var(--default-box-color) 82%, transparent);
        border-radius: 9px;
      }

      b {
        display: block;
        overflow: hidden;
        text-overflow: ellipsis;
        font-size: 12px;
        font-weight: 600;
        color: var(--el-text-color-regular);
        white-space: nowrap;
      }

      small {
        display: block;
        margin-top: 2px;
        overflow: hidden;
        text-overflow: ellipsis;
        font-size: 11px;
        color: var(--el-text-color-secondary);
        white-space: nowrap;
      }
    }

    &__field-list {
      display: grid;
      gap: 7px;
      margin-top: 14px;
    }

    &__field-columns {
      display: grid;
      grid-template-columns: minmax(220px, 1.15fr) minmax(230px, 1fr) minmax(240px, 0.9fr);
      gap: 14px;
      padding: 0 14px 2px;

      span {
        font-size: 10px;
        font-weight: 700;
        color: var(--el-text-color-secondary);
        letter-spacing: 0.08em;
      }
    }

    &__field-row {
      position: relative;
      display: grid;
      grid-template-columns: minmax(220px, 1.15fr) minmax(230px, 1fr) minmax(240px, 0.9fr);
      gap: 14px;
      align-items: center;
      min-width: 0;
      padding: 12px 13px 12px 16px;
      overflow: hidden;
      background: color-mix(in srgb, var(--el-fill-color-lighter) 66%, transparent);
      border: 1px solid var(--el-border-color-lighter);
      border-radius: var(--art-surface-radius);
      transition:
        background-color 0.18s ease,
        border-color 0.18s ease;

      &::before {
        position: absolute;
        inset: 0 auto 0 0;
        width: 3px;
        content: '';
        background: var(--el-color-info);
      }

      &.is-hidden::before {
        background: var(--el-color-danger);
      }

      &.is-masked::before {
        background: var(--el-color-warning);
      }

      &.is-read::before {
        background: var(--el-color-info);
      }

      &.is-edit::before {
        background: var(--el-color-success);
      }

      &:hover {
        background: var(--default-box-color);
        border-color: color-mix(in srgb, var(--theme-color) 24%, var(--el-border-color));
      }
    }

    &__field-identity {
      display: flex;
      gap: 11px;
      align-items: center;
      min-width: 0;

      > div {
        min-width: 0;
      }

      strong,
      code {
        display: block;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      strong {
        font-size: 13px;
        font-weight: 600;
        color: var(--el-text-color-regular);
      }

      code {
        width: fit-content;
        max-width: 100%;
        padding: 2px 6px;
        margin-top: 4px;
        font-size: 11px;
        color: var(--el-text-color-secondary);
        background: color-mix(in srgb, var(--el-fill-color) 68%, transparent);
        border-radius: 5px;
      }
    }

    &__field-icon {
      display: grid;
      flex: 0 0 34px;
      place-items: center;
      width: 34px;
      height: 34px;
      color: var(--el-color-primary);
      background: color-mix(in srgb, var(--theme-color) 9%, var(--default-box-color));
      border-radius: var(--art-control-radius);
    }

    &__field-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 6px 12px;
      align-items: center;
    }

    &__field-flag {
      display: inline-flex;
      gap: 4px;
      align-items: center;
      min-height: 24px;
      padding: 2px 7px;
      font-size: 12px;
      font-weight: 600;
      border-radius: 999px;

      &.is-owner {
        color: var(--el-color-success-dark-2);
        background: var(--el-color-success-light-9);
      }

      &.is-mask {
        color: var(--el-color-warning-dark-2);
        background: var(--el-color-warning-light-9);
      }
    }

    &__field-default {
      display: inline-flex;
      align-items: center;
      min-height: 24px;
      padding: 2px 7px;
      font-size: 12px;
      color: var(--el-text-color-secondary);
      background: color-mix(in srgb, var(--el-fill-color) 74%, transparent);
      border-radius: 999px;
    }

    &__field-control {
      display: grid;
      grid-template-columns: minmax(150px, 1fr) auto;
      gap: 10px;
      align-items: center;
    }

    &__access-select {
      min-width: 0;
    }

    &__effective-state {
      display: grid;
      gap: 1px;
      min-width: 78px;
      padding: 5px 8px;
      white-space: nowrap;
      background: color-mix(in srgb, var(--el-fill-color-light) 76%, transparent);
      border-radius: 8px;

      > span {
        font-size: 10px;
        color: var(--el-text-color-secondary);
      }

      b {
        font-size: 12px;
        font-weight: 650;
      }

      &.is-hidden b {
        color: var(--el-color-danger);
      }

      &.is-masked b {
        color: var(--el-color-warning-dark-2);
      }

      &.is-read b {
        color: var(--el-color-info);
      }

      &.is-edit b {
        color: var(--el-color-success-dark-2);
      }
    }

    &__audit {
      display: grid;
      gap: 12px;
      padding: 16px;
      margin-top: 18px;
      background: color-mix(in srgb, var(--el-fill-color-lighter) 62%, transparent);
      border-top: 1px solid var(--el-border-color-lighter);
      border-radius: var(--art-surface-radius);
    }

    &__audit-header {
      display: flex;
      gap: 16px;
      align-items: flex-start;
      justify-content: space-between;

      > div {
        min-width: 0;
      }

      :deep(.art-section-title) {
        margin: 0;
      }

      p {
        margin: 4px 0 0;
        font-size: 12px;
        line-height: 1.55;
        color: var(--el-text-color-secondary);
      }
    }

    &__audit-count {
      display: inline-flex;
      flex: none;
      gap: 5px;
      align-items: center;
      min-height: 26px;
      padding: 3px 9px;
      font-size: 12px;
      font-weight: 600;
      color: var(--el-text-color-secondary);
      white-space: nowrap;
      background: var(--art-gray-100);
      border-radius: 999px;
      box-shadow: inset 0 0 0 1px var(--el-border-color-lighter);
    }

    &__audit-list {
      display: grid;
      padding: 0;
      margin: 0;
      list-style: none;

      li {
        display: grid;
        grid-template-columns: auto minmax(0, 1fr) auto;
        gap: 11px;
        align-items: flex-start;
        min-width: 0;
        padding: 12px 2px;

        & + li {
          border-top: 1px dashed var(--el-border-color-lighter);
        }

        > time {
          padding-top: 2px;
          font-size: 11px;
          color: var(--el-text-color-secondary);
          white-space: nowrap;
        }
      }
    }

    &__audit-marker {
      display: grid;
      place-items: center;
      width: 30px;
      height: 30px;
      color: var(--el-color-primary);
      background: var(--el-color-primary-light-9);
      border-radius: var(--art-control-radius);
    }

    &__audit-copy {
      display: grid;
      gap: 4px;
      min-width: 0;

      > div {
        display: flex;
        flex-wrap: wrap;
        gap: 5px 8px;
        align-items: center;
      }

      strong {
        font-weight: 600;
        color: var(--el-text-color-regular);
      }

      span,
      p {
        font-size: 12px;
        color: var(--el-text-color-secondary);
      }

      p {
        margin: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        line-height: 1.55;
        white-space: nowrap;
      }
    }

    &__audit-error {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr) auto;
      gap: 11px;
      align-items: center;
      padding: 12px;
      color: var(--el-color-warning-dark-2);
      background: var(--el-color-warning-light-9);
      border-radius: var(--art-control-radius);
      box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--el-color-warning) 28%, transparent);

      > span {
        display: grid;
        place-items: center;
        width: 30px;
        height: 30px;
        font-size: 17px;
      }

      > div {
        min-width: 0;
      }

      strong {
        display: block;
      }

      p {
        margin: 2px 0 0;
        font-size: 12px;
        color: var(--el-text-color-secondary);
      }
    }

    &__actions {
      flex: none;
    }

    &__action-summary {
      display: flex;
      gap: 10px;
      align-items: center;
      min-width: 0;

      > span {
        display: grid;
        flex: 0 0 34px;
        place-items: center;
        width: 34px;
        height: 34px;
        color: var(--el-color-primary);
        background: var(--el-color-primary-light-9);
        border-radius: var(--art-control-radius);
      }

      > div {
        min-width: 0;
      }

      strong {
        display: block;
        overflow: hidden;
        text-overflow: ellipsis;
        color: var(--el-text-color-primary);
        white-space: nowrap;
      }

      p {
        margin: 2px 0 0;
        overflow: hidden;
        text-overflow: ellipsis;
        font-size: 12px;
        color: var(--el-text-color-secondary);
        white-space: nowrap;
      }
    }

    &__readonly-state {
      color: var(--el-text-color-secondary);
      background: var(--art-gray-100);
      box-shadow: inset 0 0 0 1px var(--el-border-color-lighter);
    }

    @media (width <= 1050px) {
      &__legend {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      &__field-columns {
        display: none;
      }

      &__field-row {
        grid-template-columns: minmax(210px, 1fr) minmax(250px, 1fr);
      }

      &__field-meta {
        grid-row: 2;
        grid-column: 1 / -1;
      }
    }

    @media (width <= 720px) {
      &__scope-heading,
      &__matrix-header,
      &__audit-header {
        flex-direction: column;

        p {
          text-align: left;
        }
      }

      &__scope-mode {
        justify-content: space-between;
        width: 100%;
      }

      &__scope-policy {
        grid-template-columns: auto minmax(0, 1fr);
      }

      &__policy-level {
        grid-column: 2;
        justify-self: start;
      }

      &__matrix-summary {
        justify-items: start;
        max-width: none;
      }

      &__selectors,
      &__field-row {
        grid-template-columns: 1fr;
      }

      &__legend {
        grid-template-columns: 1fr;
      }

      &__field-meta {
        grid-row: auto;
        grid-column: auto;
      }

      &__field-control {
        grid-template-columns: 1fr;
      }

      &__audit-count {
        align-self: flex-start;
      }

      &__audit {
        padding: 14px;
      }

      &__audit-list li {
        grid-template-columns: auto minmax(0, 1fr);

        > time {
          grid-column: 2;
          padding-top: 0;
        }
      }

      &__audit-copy p {
        overflow: visible;
        text-overflow: clip;
        white-space: normal;
      }

      &__audit-error {
        grid-template-columns: auto minmax(0, 1fr);

        .el-button {
          grid-column: 2;
          justify-self: start;
        }
      }

      &__action-summary p {
        white-space: normal;
      }
    }
  }
</style>
