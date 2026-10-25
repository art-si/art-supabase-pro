<template>
  <ArtPageShell
    :loading="page.loading"
    loading-mode="mask"
    :skeleton-rows="8"
    :error="page.error"
    class="geofence-config-page"
    @retry="loadConfig"
  >
    <ArtPageHeader
      class="geofence-config-page__hero"
      title="电子围栏配置"
      subtitle="统一管理装卸货地址的默认定位边界与到离场规则，降低虚假到场和定位漂移风险。"
    >
      <template #status>
        <ElTag :type="status.type" effect="light" round>
          <ArtSvgIcon :icon="status.icon" />
          {{ status.label }}
        </ElTag>
      </template>
      <template #meta>
        <div class="geofence-config-page__meta">
          <span class="art-icon-label"><ArtSvgIcon icon="ri:global-line" />全平台策略</span>
          <span class="art-icon-label"><ArtSvgIcon icon="ri:time-line" />{{ updateTimeText }}</span>
          <span class="art-icon-label">
            <ArtSvgIcon icon="ri:user-3-line" />
            {{ form.updateBy || form.createBy || '系统初始化' }}
          </span>
        </div>
      </template>
      <div class="geofence-config-page__hero-badge" aria-label="策略安全边界">
        <span><ArtSvgIcon icon="ri:shield-check-line" /></span>
        <div>
          <strong>服务端权限校验</strong>
          <small>{{ isReadOnly ? '安全只读' : '可发布策略' }}</small>
        </div>
      </div>
    </ArtPageHeader>

    <ElAlert
      v-if="isReadOnly"
      class="geofence-config-page__permission-alert"
      type="info"
      :closable="false"
      show-icon
      title="当前账号可查看策略，但不能发布修改"
      description="仅具备“编辑电子围栏”按钮权限的账号可以发布策略，服务端会再次校验。"
    />

    <section class="geofence-config-page__overview" aria-label="策略概览">
      <article
        v-for="item in overviewCards"
        :key="item.label"
        class="geofence-config-page__overview-card art-card-xs"
      >
        <div class="geofence-config-page__overview-icon" :class="`is-${item.tone}`">
          <ArtSvgIcon :icon="item.icon" />
        </div>
        <div class="geofence-config-page__overview-copy">
          <span>{{ item.label }}</span>
          <strong>{{ item.value }}</strong>
          <small>{{ item.description }}</small>
        </div>
      </article>
    </section>

    <div class="geofence-config-page__workspace">
      <ArtSectionCard
        class="geofence-config-page__policy"
        aria-label="围栏策略设置"
        preserve-content-structure
      >
        <template #header>
          <header class="geofence-config-page__section-heading">
            <span><ArtSvgIcon icon="ri:equalizer-2-line" /></span>
            <div>
              <h2>策略工作区</h2>
              <p>这些配置作为地址围栏的默认建议值，单个地址仍可按现场范围覆盖。</p>
            </div>
          </header>
        </template>

        <ArtForm
          ref="formRef"
          :model-value="form"
          @update:model-value="replaceReactiveModel(form, $event)"
          :items="formItems"
          :rules="formRules"
          :disabled="isReadOnly"
          :span="12"
          :gutter="24"
          label-position="top"
          :show-reset="false"
          :show-submit="false"
          class="geofence-config-page__form"
        />
      </ArtSectionCard>

      <aside class="geofence-config-page__side" aria-label="围栏预览与生效说明">
        <ArtSectionCard class="geofence-config-page__preview" preserve-content-structure>
          <template #header>
            <header class="geofence-config-page__section-heading is-compact">
              <span><ArtSvgIcon icon="ri:radar-line" /></span>
              <div>
                <h2>范围预览</h2>
                <p>以地址地图坐标为圆心进行定位判断</p>
              </div>
            </header>
          </template>

          <div class="geofence-config-page__radar" :class="{ 'is-disabled': !form.enabled }">
            <span class="geofence-config-page__radar-axis is-horizontal"></span>
            <span class="geofence-config-page__radar-axis is-vertical"></span>
            <span class="geofence-config-page__radar-ring is-outer"></span>
            <span class="geofence-config-page__radar-ring is-middle"></span>
            <span class="geofence-config-page__radar-ring is-inner"></span>
            <span class="geofence-config-page__radar-center">
              <ArtSvgIcon icon="ri:map-pin-2-fill" />
            </span>
            <span class="geofence-config-page__radar-label">围栏中心</span>
          </div>

          <dl class="geofence-config-page__radius-list">
            <div>
              <dt><i class="is-loading"></i>装货范围</dt>
              <dd>{{ formatSensitiveCountValue(form.loadingRadiusM) }} 米</dd>
            </div>
            <div>
              <dt><i class="is-unloading"></i>卸货范围</dt>
              <dd>{{ formatSensitiveCountValue(form.unloadingRadiusM) }} 米</dd>
            </div>
          </dl>
        </ArtSectionCard>

        <ArtSectionCard class="geofence-config-page__guide" preserve-content-structure>
          <template #header>
            <header class="geofence-config-page__section-heading is-compact">
              <span><ArtSvgIcon icon="ri:route-line" /></span>
              <div>
                <h2>规则如何生效</h2>
                <p>默认策略不会覆盖已单独配置的地址。</p>
              </div>
            </header>
          </template>

          <ol class="geofence-config-page__steps">
            <li v-for="(step, index) in effectiveSteps" :key="step.title">
              <span>{{ index + 1 }}</span>
              <div
                ><strong>{{ step.title }}</strong
                ><small>{{ step.description }}</small></div
              >
            </li>
          </ol>

          <div
            class="geofence-config-page__risk-note"
            :class="{
              'is-warning': form.loadingAllowOutsideCheckIn || form.unloadingAllowOutsideCheckIn
            }"
          >
            <span>
              <ArtSvgIcon
                :icon="
                  form.loadingAllowOutsideCheckIn || form.unloadingAllowOutsideCheckIn
                    ? 'ri:alert-line'
                    : 'ri:checkbox-circle-fill'
                "
              />
            </span>
            <div>
              <strong>{{
                form.loadingAllowOutsideCheckIn || form.unloadingAllowOutsideCheckIn
                  ? '围栏外打卡需审计'
                  : '围栏外打卡将被拦截'
              }}</strong>
              <p>{{
                form.loadingAllowOutsideCheckIn || form.unloadingAllowOutsideCheckIn
                  ? '异常提交必须记录原因、坐标和操作人。'
                  : '定位异常时引导司机重新定位或联系调度。'
              }}</p>
            </div>
          </div>
        </ArtSectionCard>
      </aside>
    </div>

    <ArtStickyActionBar
      class="geofence-config-page__actions"
      :class="{ 'is-dirty': hasUnsavedChanges, 'is-readonly': isReadOnly }"
    >
      <template #summary>
        <div class="geofence-config-page__action-copy">
          <div class="geofence-config-page__action-title">
            <span><ArtSvgIcon :icon="actionState.icon" /></span>
            <strong>{{ isReadOnly ? '当前为安全只读视图' : changeSummary }}</strong>
          </div>
          <p>
            {{ actionDescription }}
          </p>
        </div>
      </template>

      <div v-if="!isReadOnly" class="geofence-config-page__buttons">
        <ElButton
          :title="hasUnsavedChanges ? '恢复到上次已发布的策略' : '当前没有未发布的修改'"
          :disabled="!hasUnsavedChanges || page.saving"
          @click="resetConfig"
        >
          撤销未发布修改
        </ElButton>
        <ElButton
          v-auth="'System:GeofenceConfig:Edit'"
          type="primary"
          :loading="page.saving"
          :title="hasUnsavedChanges ? '保存修改并同步到司机端' : '请先修改任一策略配置'"
          :disabled="!hasUnsavedChanges"
          @click="handleSave"
        >
          保存并发布策略
        </ElButton>
      </div>
      <ElTag v-else class="geofence-config-page__readonly-tag" type="info" effect="plain" round>
        <ArtSvgIcon icon="ri:lock-2-line" />
        需要“编辑电子围栏”权限
      </ElTag>
    </ArtStickyActionBar>
  </ArtPageShell>
</template>

<script setup lang="ts">
  import { formatSensitiveCountValue } from '@/utils/ui/format'
  import { replaceReactiveModel } from '@/utils/form/model'
  import ArtSectionCard from '@/components/core/surfaces/art-section-card/index.vue'
  import type { FormRules } from 'element-plus'
  import { cloneDeep, isEqual } from 'lodash-es'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import { fetchGeofenceConfig, saveGeofenceConfig } from '@/api/system-manage'
  import { useAuth } from '@/hooks/core/useAuth'
  import { formatWithDayjs } from '@/utils/time'

  defineOptions({ name: 'GeofenceConfig' })

  type GeofenceConfig = Api.SystemManage.GeofenceConfigItem

  interface PageGroup {
    loading: boolean
    saving: boolean
    error: Error | null
  }

  interface FormExpose {
    validate: () => Promise<boolean>
    clearValidate: () => void
  }

  const createInitialConfig = (): GeofenceConfig => ({
    enabled: true,
    loadingRadiusM: 1000,
    unloadingRadiusM: 1000,
    loadingAllowOutsideCheckIn: false,
    unloadingAllowOutsideCheckIn: false,
    autoConfirmLoading: false,
    autoConfirmUnloading: false
  })

  const editableFields = [
    { key: 'enabled', label: '电子围栏开关' },
    { key: 'loadingRadiusM', label: '装货默认半径' },
    { key: 'unloadingRadiusM', label: '卸货默认半径' },
    { key: 'loadingAllowOutsideCheckIn', label: '装货打卡要求' },
    { key: 'unloadingAllowOutsideCheckIn', label: '卸货打卡要求' },
    { key: 'autoConfirmLoading', label: '自动装货' },
    { key: 'autoConfirmUnloading', label: '自动卸货' }
  ] as const

  /**
   * 显式读取每个可编辑字段，确保 Vue 能追踪 ArtForm 对响应式对象的原地修改。
   * 不能在 computed 中先 toRaw(form)，否则字段读取绕过代理，修改后脏状态不会重新计算。
   */
  const createEditableSnapshot = (value: GeofenceConfig) => ({
    enabled: value.enabled,
    loadingRadiusM: value.loadingRadiusM,
    unloadingRadiusM: value.unloadingRadiusM,
    loadingAllowOutsideCheckIn: value.loadingAllowOutsideCheckIn,
    unloadingAllowOutsideCheckIn: value.unloadingAllowOutsideCheckIn,
    autoConfirmLoading: value.autoConfirmLoading,
    autoConfirmUnloading: value.autoConfirmUnloading
  })

  const { hasAuth } = useAuth()
  const formRef = ref<FormExpose>()
  const page = reactive<PageGroup>({ loading: false, saving: false, error: null })
  const form = reactive<GeofenceConfig>(createInitialConfig())
  const original = ref<GeofenceConfig>(createInitialConfig())
  const isReadOnly = computed(() => !hasAuth('System:GeofenceConfig:Edit'))
  const changedFieldLabels = computed(() =>
    editableFields
      .filter(({ key }) => !isEqual(form[key], original.value[key]))
      .map(({ label }) => label)
  )
  const hasUnsavedChanges = computed(
    () => !isEqual(createEditableSnapshot(form), createEditableSnapshot(original.value))
  )
  const updateTimeText = computed(() =>
    form.updateTime ? formatWithDayjs(form.updateTime, 'YYYY-MM-DD HH:mm') : '尚未发布'
  )
  const changeSummary = computed(() => {
    if (!hasUnsavedChanges.value) return '电子围栏策略已同步'
    return `待发布：${changedFieldLabels.value.join('、')}`
  })
  const actionDescription = computed(() => {
    if (isReadOnly.value) return '当前账号可查看围栏策略；发布需具备“编辑电子围栏”权限。'
    if (hasUnsavedChanges.value)
      return '修改尚未生效；保存发布后，电脑端和司机端将统一读取最新策略。'
    return '修改任一配置后即可保存发布；当前展示的是已生效策略。'
  })
  const actionState = computed(() => {
    if (isReadOnly.value) return { icon: 'ri:eye-line' }
    if (hasUnsavedChanges.value) return { icon: 'ri:draft-line' }
    return { icon: 'ri:shield-check-line' }
  })
  const status = computed(() => {
    if (isReadOnly.value) return { label: '只读查看', type: 'info' as const, icon: 'ri:eye-line' }
    if (hasUnsavedChanges.value)
      return { label: '待发布', type: 'warning' as const, icon: 'ri:draft-line' }
    if (!form.enabled)
      return { label: '策略已停用', type: 'warning' as const, icon: 'ri:pause-circle-line' }
    return { label: '运行中', type: 'success' as const, icon: 'ri:shield-check-line' }
  })

  const overviewCards = computed(() => [
    {
      label: '装货默认半径',
      value: `${formatSensitiveCountValue(form.loadingRadiusM)} m`,
      description: '用于发货地址的进场识别',
      icon: 'ri:login-circle-line',
      tone: 'primary'
    },
    {
      label: '卸货默认半径',
      value: `${formatSensitiveCountValue(form.unloadingRadiusM)} m`,
      description: '用于收货地址的到场识别',
      icon: 'ri:logout-circle-r-line',
      tone: 'success'
    },
    {
      label: '打卡边界',
      value:
        form.loadingAllowOutsideCheckIn === form.unloadingAllowOutsideCheckIn
          ? form.loadingAllowOutsideCheckIn
            ? '装卸均可外打卡'
            : '装卸均需在围栏内'
          : '装卸分别控制',
      description: '围栏外提交始终保留原因与定位',
      icon: 'ri:map-pin-time-line',
      tone:
        form.loadingAllowOutsideCheckIn || form.unloadingAllowOutsideCheckIn ? 'warning' : 'info'
    },
    {
      label: '到场自动确认',
      value:
        Number(form.autoConfirmLoading) + Number(form.autoConfirmUnloading) === 2
          ? '装卸均自动'
          : Number(form.autoConfirmLoading) + Number(form.autoConfirmUnloading) === 1
            ? '部分自动'
            : '人工确认',
      description: '业务完成动作仍按原流程确认',
      icon: 'ri:route-line',
      tone:
        form.autoConfirmLoading || form.autoConfirmUnloading
          ? ('success' as const)
          : ('primary' as const)
    }
  ])

  const effectiveSteps = [
    { title: '维护地址坐标', description: '围栏中心取自地址管理中的地图选点结果' },
    { title: '设置地址围栏', description: '装卸货地址可按园区大小覆盖默认半径' },
    { title: '运输执行校验', description: '司机到离场时按地址围栏判断定位是否合规' }
  ]

  const formRules: FormRules<GeofenceConfig> = {
    loadingRadiusM: [
      { required: true, message: '请输入装货围栏默认半径', trigger: 'blur' },
      { type: 'number', min: 50, max: 50000, message: '半径应在 50 至 50000 米之间' }
    ],
    unloadingRadiusM: [
      { required: true, message: '请输入卸货围栏默认半径', trigger: 'blur' },
      { type: 'number', min: 50, max: 50000, message: '半径应在 50 至 50000 米之间' }
    ]
  }

  const formItems = computed<FormItem[]>(() => [
    { label: '基础策略', key: 'baseSection', type: 'divider', span: 24 },
    {
      label: '启用电子围栏',
      key: 'enabled',
      type: 'switch',
      span: 24,
      description: '关闭后地址围栏配置仍会保留，但运输执行不再校验到离场范围。',
      props: { activeText: '启用', inactiveText: '停用', inlinePrompt: true }
    },
    {
      label: '装货默认半径',
      key: 'loadingRadiusM',
      type: 'number',
      help: '用于发货地址；地址设置围栏时可单独覆盖。',
      description: '建议：厂区 500–1000 米，大型物流园 1000–3000 米。',
      props: { min: 50, max: 50000, step: 50, controlsPosition: 'right' }
    },
    {
      label: '卸货默认半径',
      key: 'unloadingRadiusM',
      type: 'number',
      help: '用于收货地址；地址设置围栏时可单独覆盖。',
      description: '建议根据园区入口、收货月台和定位漂移范围合理设置。',
      props: { min: 50, max: 50000, step: 50, controlsPosition: 'right' }
    },
    { label: '执行规则', key: 'executionSection', type: 'divider', span: 24 },
    {
      label: '装货打卡要求',
      key: 'loadingAllowOutsideCheckIn',
      type: 'switch',
      description: '“可围栏外打卡”允许司机在装货围栏外手动提交，并强制填写原因。',
      props: { activeText: '可围栏外', inactiveText: '仅围栏内', inlinePrompt: true }
    },
    {
      label: '卸货打卡要求',
      key: 'unloadingAllowOutsideCheckIn',
      type: 'switch',
      description: '“围栏内打卡”会在司机不在卸货围栏内时拦截提交。',
      props: { activeText: '可围栏外', inactiveText: '仅围栏内', inlinePrompt: true }
    },
    {
      label: '自动装货',
      key: 'autoConfirmLoading',
      type: 'switch',
      description: '定位进入装货围栏后自动打卡；重量、照片和磅单仍需补齐。',
      props: { activeText: '是', inactiveText: '否', inlinePrompt: true }
    },
    {
      label: '自动卸货',
      key: 'autoConfirmUnloading',
      type: 'switch',
      description: '定位进入卸货围栏后自动打卡；重量、照片和磅单仍需补齐。',
      props: { activeText: '是', inactiveText: '否', inlinePrompt: true }
    }
  ])

  const replaceConfig = (next: GeofenceConfig): void => {
    Object.assign(form, createInitialConfig(), cloneDeep(next))
  }

  const loadConfig = async (): Promise<void> => {
    page.loading = true
    page.error = null
    try {
      const { data, error } = await fetchGeofenceConfig()
      if (error) {
        throw new Error('电子围栏配置加载失败', { cause: error })
      }
      const next = data ?? createInitialConfig()
      replaceConfig(next)
      original.value = cloneDeep(next)
    } catch (error) {
      page.error = error instanceof Error ? error : new Error('电子围栏配置加载失败')
    } finally {
      page.loading = false
    }
  }

  const resetConfig = async (): Promise<void> => {
    replaceConfig(original.value)
    await nextTick()
    formRef.value?.clearValidate()
  }

  const handleSave = async (): Promise<void> => {
    if (isReadOnly.value || page.saving) return
    try {
      await formRef.value?.validate()
    } catch {
      return
    }

    page.saving = true
    try {
      await saveGeofenceConfig(cloneDeep(toRaw(form)))
      await loadConfig()
    } finally {
      page.saving = false
    }
  }

  onMounted(() => void loadConfig())
</script>

<style scoped lang="scss">
  .geofence-config-page {
    display: flex;
    flex-direction: column;
    gap: var(--art-space-3);
    min-width: 0;

    :deep(> .art-async-state) {
      display: flex;
      flex-direction: column;
      gap: var(--art-space-3);
      min-width: 0;
    }

    &__meta,
    &__buttons,
    &__action-title {
      display: flex;
      flex-wrap: wrap;
      gap: var(--art-space-3);
      align-items: center;
    }

    &__hero {
      position: relative;
      overflow: hidden;
      background:
        linear-gradient(
          105deg,
          color-mix(in srgb, var(--theme-color) 7%, transparent),
          transparent 46%
        ),
        var(--default-box-color);

      &::after {
        position: absolute;
        top: -52px;
        right: 12%;
        width: 190px;
        height: 190px;
        pointer-events: none;
        content: '';
        background: radial-gradient(
          circle,
          color-mix(in srgb, var(--theme-color) 8%, transparent),
          transparent 68%
        );
      }
    }

    &__meta {
      gap: var(--art-space-4);
      font-size: var(--art-font-size-caption);
      color: var(--el-text-color-secondary);

      span {
        display: inline-flex;
        gap: 5px;
        align-items: center;
        min-width: 0;
      }
    }

    &__hero-badge {
      z-index: 1;
      display: flex;
      gap: var(--art-space-2);
      align-items: center;
      min-width: 160px;
      padding: var(--art-space-2) var(--art-space-3);
      background: color-mix(in srgb, var(--theme-color) 7%, var(--default-box-color));
      border: 1px solid color-mix(in srgb, var(--theme-color) 18%, var(--art-card-border));
      border-radius: var(--el-border-radius-base);

      > span {
        display: grid;
        flex: 0 0 34px;
        place-items: center;
        width: 34px;
        height: 34px;
        font-size: 18px;
        color: var(--theme-color);
        background: color-mix(in srgb, var(--theme-color) 11%, transparent);
        border-radius: 50%;
      }

      div {
        display: grid;
        gap: 1px;
      }

      strong {
        font-size: 13px;
        color: var(--el-text-color-primary);
      }

      small {
        color: var(--el-text-color-secondary);
      }
    }

    &__permission-alert {
      border-radius: var(--custom-radius);
    }

    &__overview {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: var(--art-space-3);
    }

    &__overview-card {
      position: relative;
      display: flex;
      gap: var(--art-space-3);
      align-items: center;
      min-width: 0;
      padding: var(--art-space-4);
      overflow: hidden;
      transition:
        border-color 0.2s ease,
        box-shadow 0.2s ease,
        transform 0.2s ease;

      &::after {
        position: absolute;
        right: -22px;
        bottom: -32px;
        width: 88px;
        height: 88px;
        pointer-events: none;
        content: '';
        background: color-mix(in srgb, var(--theme-color) 4%, transparent);
        border-radius: 50%;
      }

      &:hover {
        transform: translateY(-1px);
      }
    }

    &__overview-copy {
      z-index: 1;
      display: grid;
      min-width: 0;

      span,
      small {
        overflow: hidden;
        text-overflow: ellipsis;
        color: var(--el-text-color-secondary);
        white-space: nowrap;
      }

      strong {
        margin: 2px 0;
        overflow: hidden;
        text-overflow: ellipsis;
        font-size: 20px;
        font-variant-numeric: tabular-nums;
        color: var(--el-text-color-primary);
        white-space: nowrap;
      }
    }

    &__overview-icon {
      display: grid;
      flex: 0 0 42px;
      place-items: center;
      width: 42px;
      height: 42px;
      color: var(--theme-color);
      background: color-mix(in srgb, var(--theme-color) 10%, transparent);
      border-radius: var(--el-border-radius-base);

      &.is-success {
        color: var(--el-color-success);
        background: var(--el-color-success-light-9);
      }

      &.is-warning {
        color: var(--el-color-warning-dark-2);
        background: var(--el-color-warning-light-9);
      }

      &.is-info {
        color: var(--el-color-info);
        background: var(--el-fill-color-light);
      }
    }

    &__workspace {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(320px, 380px);
      gap: var(--art-space-3);
      align-items: start;
      min-width: 0;
    }

    &__policy,
    &__preview,
    &__guide {
      min-width: 0;
      padding: var(--art-section-padding);
    }

    &__policy {
      background:
        linear-gradient(
          180deg,
          color-mix(in srgb, var(--theme-color) 3%, transparent),
          transparent 140px
        ),
        var(--default-box-color);
    }

    &__section-heading {
      display: flex;
      gap: var(--art-space-3);
      align-items: center;
      min-width: 0;
      padding-bottom: var(--art-space-4);
      border-bottom: 1px solid var(--el-border-color-lighter);

      > span {
        display: grid;
        flex: 0 0 40px;
        place-items: center;
        width: 40px;
        height: 40px;
        font-size: 18px;
        color: var(--theme-color);
        background: color-mix(in srgb, var(--theme-color) 10%, transparent);
        border-radius: var(--el-border-radius-base);
      }

      > div {
        flex: 1;
        min-width: 0;
      }

      h2 {
        margin: 0;
        font-size: 16px;
        font-weight: 650;
        color: var(--el-text-color-primary);
      }

      p {
        margin: 3px 0 0;
        font-size: 12px;
        line-height: 1.5;
        color: var(--el-text-color-secondary);
      }

      &.is-compact {
        padding-bottom: var(--art-space-3);

        > span {
          flex-basis: 36px;
          width: 36px;
          height: 36px;
          font-size: 16px;
        }
      }
    }

    &__form {
      min-width: 0;
      padding: var(--art-space-4) 0 0 !important;

      :deep(.art-section-title) {
        margin-top: 2px;
        margin-bottom: var(--art-space-3);
      }

      :deep(.el-form-item) {
        padding: var(--art-space-3);
        margin-bottom: var(--art-space-3);
        background: color-mix(in srgb, var(--el-fill-color-lighter) 58%, transparent);
        border: 1px solid var(--el-border-color-extra-light);
        border-radius: var(--el-border-radius-base);
      }

      :deep(.el-form-item__label) {
        font-weight: 600;
        color: var(--el-text-color-primary);
      }

      :deep(.el-switch) {
        min-width: 48px;
      }
    }

    &__side {
      display: grid;
      gap: var(--art-space-3);
      min-width: 0;
    }

    &__preview {
      display: grid;
      gap: var(--art-space-4);
    }

    &__radar {
      position: relative;
      display: grid;
      place-items: center;
      width: min(190px, 68%);
      aspect-ratio: 1;
      margin-inline: auto;
      overflow: hidden;
      background: radial-gradient(
        circle,
        color-mix(in srgb, var(--theme-color) 7%, transparent),
        transparent 66%
      );
      border-radius: 50%;
      transition:
        filter 0.2s ease,
        opacity 0.2s ease;

      &.is-disabled {
        opacity: 0.55;
        filter: grayscale(0.8);
      }
    }

    &__radar-axis,
    &__radar-ring {
      position: absolute;
      pointer-events: none;
    }

    &__radar-axis {
      background: color-mix(in srgb, var(--theme-color) 12%, transparent);

      &.is-horizontal {
        width: 100%;
        height: 1px;
      }

      &.is-vertical {
        width: 1px;
        height: 100%;
      }
    }

    &__radar-ring {
      border: 1px solid color-mix(in srgb, var(--theme-color) 25%, transparent);
      border-radius: 50%;

      &.is-outer {
        width: 88%;
        height: 88%;
      }

      &.is-middle {
        width: 62%;
        height: 62%;
      }

      &.is-inner {
        width: 36%;
        height: 36%;
      }
    }

    &__radar-center {
      z-index: 1;
      display: grid;
      place-items: center;
      width: 42px;
      height: 42px;
      font-size: 21px;
      color: white;
      background: var(--theme-color);
      border: 5px solid color-mix(in srgb, var(--theme-color) 20%, var(--default-box-color));
      border-radius: 50%;
      box-shadow: 0 8px 22px color-mix(in srgb, var(--theme-color) 28%, transparent);
    }

    &__radar-label {
      position: absolute;
      bottom: 12%;
      padding: 3px 9px;
      font-size: 11px;
      color: var(--theme-color);
      background: color-mix(in srgb, var(--theme-color) 10%, var(--default-box-color));
      border: 1px solid color-mix(in srgb, var(--theme-color) 18%, transparent);
      border-radius: 999px;
    }

    &__radius-list {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: var(--art-space-2);
      margin: 0;

      > div {
        min-width: 0;
        padding: var(--art-space-2) var(--art-space-3);
        background: var(--el-fill-color-lighter);
        border-radius: var(--el-border-radius-base);
      }

      dt,
      dd {
        margin: 0;
      }

      dt {
        display: flex;
        gap: 6px;
        align-items: center;
        font-size: 11px;
        color: var(--el-text-color-secondary);
      }

      dd {
        margin-top: 2px;
        overflow: hidden;
        text-overflow: ellipsis;
        font-weight: 650;
        color: var(--el-text-color-primary);
        white-space: nowrap;
      }

      i {
        width: 7px;
        height: 7px;
        background: var(--theme-color);
        border-radius: 50%;

        &.is-unloading {
          background: var(--el-color-success);
        }
      }
    }

    &__guide {
      display: grid;
      gap: var(--art-space-4);
    }

    &__steps {
      display: grid;
      gap: var(--art-space-3);
      padding: 0;
      margin: 0;
      list-style: none;

      li {
        display: flex;
        gap: var(--art-space-3);
        align-items: flex-start;

        > span {
          display: grid;
          flex: 0 0 28px;
          place-items: center;
          width: 28px;
          height: 28px;
          font-size: 12px;
          font-weight: 700;
          color: var(--theme-color);
          background: color-mix(in srgb, var(--theme-color) 9%, transparent);
          border-radius: 50%;
        }

        div {
          display: grid;
          gap: 2px;
          min-width: 0;
        }

        strong {
          font-size: 13px;
          color: var(--el-text-color-primary);
        }

        small {
          line-height: 1.5;
          color: var(--el-text-color-secondary);
        }
      }
    }

    &__risk-note {
      display: flex;
      gap: var(--art-space-3);
      align-items: flex-start;
      padding: var(--art-space-3);
      color: var(--el-color-success-dark-2);
      background: var(--el-color-success-light-9);
      border: 1px solid color-mix(in srgb, var(--el-color-success) 18%, transparent);
      border-radius: var(--el-border-radius-base);

      > span {
        display: grid;
        flex: 0 0 28px;
        place-items: center;
        width: 28px;
        height: 28px;
        font-size: 17px;
        background: color-mix(in srgb, var(--el-color-success) 10%, transparent);
        border-radius: 50%;
      }

      strong {
        display: block;
        font-size: 13px;
      }

      p {
        margin: 3px 0 0;
        font-size: 12px;
        line-height: 1.5;
        color: var(--el-text-color-secondary);
      }

      &.is-warning {
        color: var(--el-color-warning-dark-2);
        background: var(--el-color-warning-light-9);
        border-color: color-mix(in srgb, var(--el-color-warning) 22%, transparent);

        > span {
          background: color-mix(in srgb, var(--el-color-warning) 12%, transparent);
        }
      }
    }

    &__actions {
      position: sticky;
      bottom: 0;
      z-index: 4;

      &.is-dirty {
        border-color: color-mix(
          in srgb,
          var(--el-color-warning) 28%,
          var(--art-card-border)
        ) !important;
      }
    }

    &__action-copy {
      p {
        margin: 4px 0 0;
        font-size: 12px;
        color: var(--el-text-color-secondary);
      }
    }

    &__action-title {
      gap: var(--art-space-2);
      color: var(--el-text-color-primary);

      > span {
        display: grid;
        flex: 0 0 28px;
        place-items: center;
        width: 28px;
        height: 28px;
        color: var(--theme-color);
        background: color-mix(in srgb, var(--theme-color) 10%, transparent);
        border-radius: 50%;
      }
    }

    &__buttons {
      justify-content: flex-end;
    }

    &__readonly-tag {
      height: 32px;
    }

    :deep(.art-form-item__content > .el-input-number) {
      width: 100%;
    }
  }

  :global(html[data-box-mode='border-mode'] .geofence-config-page__overview-card:hover) {
    border-color: color-mix(in srgb, var(--theme-color) 38%, var(--art-card-border));
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--theme-color) 16%, transparent);
  }

  :global(html[data-box-mode='shadow-mode'] .geofence-config-page__overview-card:hover) {
    border-color: transparent;
    box-shadow: 0 8px 22px color-mix(in srgb, var(--theme-color) 12%, transparent);
  }

  @media (width <= 1360px) {
    .geofence-config-page {
      &__overview {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }
  }

  @media (width <= 1100px) {
    .geofence-config-page {
      &__workspace {
        grid-template-columns: minmax(0, 1fr);
      }

      &__side {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }
  }

  @media (width <= 760px) {
    .geofence-config-page {
      &__overview {
        grid-template-columns: 1fr;
      }

      &__hero-badge {
        width: 100%;
      }

      &__side {
        grid-template-columns: minmax(0, 1fr);
      }

      &__section-heading {
        flex-wrap: wrap;
        align-items: flex-start;
      }

      &__radius-list {
        grid-template-columns: minmax(0, 1fr);
      }

      &__buttons {
        width: 100%;

        :deep(.el-button) {
          flex: 1;
          min-width: 0;
          margin: 0;
        }
      }
    }
  }
</style>
